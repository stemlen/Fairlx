import "server-only";

import { ID, Query, Databases } from "node-appwrite";
import { createHmac } from "crypto";

import {
    DATABASE_ID,
    WALLETS_ID,
    WALLET_TRANSACTIONS_ID,
    BILLING_ACCOUNTS_ID,
    WALLET_DAILY_TOPUP_LIMIT,
} from "@/config";
import { createAdminClient } from "@/lib/appwrite";
// Lock functions imported dynamically in transaction methods

import {
    Wallet,
    WalletTransaction,
    WalletTransactionType,
    WalletStatus,
} from "../types";

/**
 * Wallet Service
 * 
 * Core business logic for the prepaid wallet system:
 * - Wallet creation
 * - Balance queries
 * - Top-ups (with idempotency + daily limit)
 * - Deductions (with race condition protection + rate limiting)
 * - HOLD / RELEASE / confirmHold
 * - Refunds
 * 
 * SECURITY:
 * - All balance operations use idempotency keys (replay protection)
 * - Optimistic locking via `version` field (concurrent update detection)
 * - HMAC-SHA256 transaction signatures (tamper-evident audit trail)
 * - Daily top-up limit enforcement (fraud prevention)
 * - Debit rate limiting (abuse prevention)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const SIGNATURE_SECRET = process.env.WALLET_SIG_SECRET || "fairlx-wallet-sig-default";
const MAX_DEBITS_PER_MINUTE = 10;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate HMAC-SHA256 signature for a wallet transaction
 * 
 * Provides tamper-evident audit trail. Any modification to the
 * signed fields will produce a different hash.
 */
function generateTransactionSignature(fields: {
    walletId: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    referenceId: string;
    timestamp: string;
}): string {
    // USE FIXED PRECISION (6 DECIMALS) FOR SIGNATURE PAYLOAD
    // WHY: Floats can have variable string representations (s.g. 0.1 vs 0.100).
    // Using a fixed number of decimals ensures deterministic signatures and prevents
    // audit trail validation failures for micro-deductions.
    const payload = [
        fields.walletId,
        fields.type,
        fields.amount.toFixed(6),
        fields.balanceBefore.toFixed(6),
        fields.balanceAfter.toFixed(6),
        fields.referenceId,
        fields.timestamp,
    ].join("|");

    return createHmac("sha256", SIGNATURE_SECRET).update(payload).digest("hex");
}

/**
 * Update wallet balance with optimistic locking
 * 
 * Reads the wallet, checks version matches expected, updates balance
 * and increments version atomically. If version mismatch, throws to
 * trigger retry by caller.
 * 
 * NOTE: Appwrite doesn't support conditional updates (`updateDocument` with `where version = X`).
 * So we do a read-after-write check. While the distributed lock in `deductFromWallet` 
 * serializes concurrent writes for the *same* operation, multiple *different* operations 
 * (like two different usage events) for the same wallet can still compete.
 */
async function updateWalletWithVersion(
    databases: Databases,
    walletId: string,
    expectedVersion: number,
    updates: Record<string, unknown>
): Promise<void> {
    await databases.updateDocument(
        DATABASE_ID,
        WALLETS_ID,
        walletId,
        {
            ...updates,
            version: expectedVersion + 1,
        }
    );

    // Verify the version was correctly incremented
    const updated = await databases.getDocument<Wallet>(
        DATABASE_ID,
        WALLETS_ID,
        walletId
    );

    if (updated.version !== expectedVersion + 1) {
        throw new Error(
            `Optimistic lock failure: expected version ${expectedVersion + 1}, got ${updated.version}. ` +
            `Another process may have modified the wallet concurrently.`
        );
    }
}

/**
 * Check debit rate limit (max N debits per minute per wallet)
 */
async function checkDebitRateLimit(
    databases: Databases,
    walletId: string
): Promise<boolean> {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

    const recentDebits = await databases.listDocuments(
        DATABASE_ID,
        WALLET_TRANSACTIONS_ID,
        [
            Query.equal("walletId", walletId),
            Query.equal("direction", "debit"),
            Query.greaterThan("$createdAt", oneMinuteAgo),
            Query.limit(MAX_DEBITS_PER_MINUTE + 1),
        ]
    );

    return recentDebits.total < MAX_DEBITS_PER_MINUTE;
}

/**
 * Check daily top-up limit to prevent fraud/money laundering
 * @param newAmount - Amount in USD (supports high precision)
 */
async function checkDailyTopupLimit(
    databases: Databases,
    walletId: string,
    newAmount: number
): Promise<{ allowed: boolean; todayTotal: number; limit: number }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayTopups = await databases.listDocuments<WalletTransaction>(
        DATABASE_ID,
        WALLET_TRANSACTIONS_ID,
        [
            Query.equal("walletId", walletId),
            Query.equal("type", WalletTransactionType.TOPUP),
            Query.greaterThan("$createdAt", startOfDay.toISOString()),
            Query.limit(100),
        ]
    );

    const todayTotal = todayTopups.documents.reduce((sum, tx) => sum + tx.amount, 0);
    const allowed = (todayTotal + newAmount) <= WALLET_DAILY_TOPUP_LIMIT;

    return { allowed, todayTotal, limit: WALLET_DAILY_TOPUP_LIMIT };
}

// ============================================================================
// WALLET CREATION & QUERIES
// ============================================================================

/**
 * Get or create wallet for a user/organization
 * 
 * IDEMPOTENT: Returns existing wallet if it exists
 */
export async function getOrCreateWallet(
    databases: Databases,
    options: {
        userId?: string;
        organizationId?: string;
        billingAccountId?: string;
        currency?: string;
    }
): Promise<Wallet> {
    if (!options.userId && !options.organizationId) {
        throw new Error("Either userId or organizationId is required");
    }

    const currency = options.currency || "USD";

    // Query for existing wallet
    const queries = options.organizationId
        ? [Query.equal("organizationId", options.organizationId)]
        : [Query.equal("userId", options.userId!)];

    const existing = await databases.listDocuments<Wallet>(
        DATABASE_ID,
        WALLETS_ID,
        [...queries, Query.limit(1)]
    );

    if (existing.total > 0) {
        return existing.documents[0];
    }

    // Find billing account ID if not provided
    let billingAccountId = options.billingAccountId;
    if (!billingAccountId) {
        try {
            const baQueries = options.organizationId
                ? [Query.equal("organizationId", options.organizationId)]
                : [Query.equal("userId", options.userId!)];

            const accounts = await databases.listDocuments(
                DATABASE_ID,
                BILLING_ACCOUNTS_ID,
                [...baQueries, Query.limit(1)]
            );

            if (accounts.total > 0) {
                billingAccountId = accounts.documents[0].$id;
            }
        } catch {
            // Ignore error - if we can't find billing account, we create without ID
            // (The DB will error if it's strictly required, but we tried our best)
        }
    }

    // Create new wallet with zero balance
    const wallet = await databases.createDocument<Wallet>(
        DATABASE_ID,
        WALLETS_ID,
        ID.unique(),
        {
            userId: options.userId || null,
            organizationId: options.organizationId || null,
            billingAccountId: billingAccountId || null,
            balance: 0,
            currency,
            lockedBalance: 0,
            status: WalletStatus.ACTIVE,
            version: 0,
        }
    );

    return wallet;
}

/**
 * Get wallet balance
 */
export async function getWalletBalance(
    databases: Databases,
    walletId: string
): Promise<{ balance: number; lockedBalance: number; availableBalance: number; currency: string }> {
    const wallet = await databases.getDocument<Wallet>(
        DATABASE_ID,
        WALLETS_ID,
        walletId
    );

    return {
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        availableBalance: wallet.balance - wallet.lockedBalance,
        currency: wallet.currency,
    };
}

// ============================================================================
// TOP-UP OPERATIONS
// ============================================================================

/**
 * Top up wallet balance
 * 
 * IDEMPOTENT: Uses idempotencyKey to prevent duplicate top-ups.
 * Uses Distributed Lock to prevent race conditions.
 * Enforces daily top-up limit for fraud prevention.
 */
export async function topUpWallet(
    databases: Databases,
    walletId: string,
    amount: number,
    options: {
        idempotencyKey: string;
        paymentId?: string;
        description?: string;
    }
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
    if (amount <= 0) {
        return { success: false, error: "Amount must be positive" };
    }

    // Check daily top-up limit before acquiring lock
    const limitCheck = await checkDailyTopupLimit(databases, walletId, amount);
    if (!limitCheck.allowed) {
        return {
            success: false,
            error: `daily_topup_limit_exceeded: Today's total (${limitCheck.todayTotal}) + this amount (${amount}) exceeds daily limit (${limitCheck.limit})`,
        };
    }

    const { acquireProcessingLock, releaseProcessingLock } = await import("@/lib/processed-events-registry");
    const eventKey = `wallet_topup:${options.idempotencyKey}`;

    // 1. Acquire Distributed Lock (Atomic)
    if (!(await acquireProcessingLock(databases, eventKey, "wallet"))) {
        return { success: true, error: "already_processed" };
    }

    try {
        // 1b. Secondary idempotency check: verify no transaction exists with this key.
        // This catches duplicates that slipped through due to different key prefixes
        // (e.g., old "cashfree_" vs "webhook_" vs new "topup_" prefix).
        const existingTxns = await databases.listDocuments(
            DATABASE_ID,
            WALLET_TRANSACTIONS_ID,
            [
                Query.equal("idempotencyKey", options.idempotencyKey),
                Query.limit(1),
            ]
        );
        if (existingTxns.total > 0) {
            return { success: true, error: "already_processed" };
        }
        // 2. Get current wallet
        const wallet = await databases.getDocument<Wallet>(
            DATABASE_ID,
            WALLETS_ID,
            walletId
        );

        // 3. Check wallet status
        if (wallet.status === WalletStatus.FROZEN || wallet.status === WalletStatus.CLOSED) {
            await releaseProcessingLock(databases, eventKey, "wallet");
            return { success: false, error: `wallet_${wallet.status}: Cannot top up a ${wallet.status} wallet` };
        }

        const balanceBefore = Number(wallet.balance.toFixed(6));
        const amountFixed = Number(amount.toFixed(6));
        const balanceAfter = Number((balanceBefore + amountFixed).toFixed(6));
        const now = new Date().toISOString();

        // 4. Update wallet balance with optimistic locking
        await updateWalletWithVersion(databases, walletId, wallet.version, {
            balance: balanceAfter,
            lastTopUpAt: now,
        });

        // 5. Generate transaction signature
        const signature = generateTransactionSignature({
            walletId,
            type: WalletTransactionType.TOPUP,
            amount: amountFixed,
            balanceBefore,
            balanceAfter,
            referenceId: options.paymentId || "",
            timestamp: now,
        });

        // 6. Create transaction record
        const transaction = await databases.createDocument<WalletTransaction>(
            DATABASE_ID,
            WALLET_TRANSACTIONS_ID,
            ID.unique(),
            {
                walletId,
                type: WalletTransactionType.TOPUP,
                amount,
                direction: "credit",
                balanceBefore,
                balanceAfter,
                currency: wallet.currency,
                referenceId: options.paymentId || null,
                idempotencyKey: options.idempotencyKey,
                signature,
                description: options.description || "Wallet top-up",
                metadata: JSON.stringify({
                    paymentId: options.paymentId,
                }),
            }
        );

        return { success: true, transaction };

    } catch (error) {
        // Rollback lock so it can be retried
        await releaseProcessingLock(databases, eventKey, "wallet");
        throw error;
    }
}

// ============================================================================
// DEDUCTION OPERATIONS
// ============================================================================

/**
 * Deduct from wallet balance
 * 
 * IDEMPOTENT: Uses idempotencyKey to prevent duplicate deductions.
 * Uses Distributed Lock to prevent race conditions (Double Deduction).
 * Rate-limited to prevent abuse.
 * 
 * RETRY LOGIC: Handles "Optimistic lock failure" when multiple processes 
 * modify the wallet concurrently by retrying up to 5 times.
 */
export async function deductFromWallet(
    databases: Databases,
    walletId: string,
    amount: number,
    options: {
        referenceId: string;
        idempotencyKey: string;
        description?: string;
    }
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
    const MAX_RETRIES = 5;
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
        attempts++;
        try {
            return await deductFromWalletInternal(databases, walletId, amount, options);
        } catch (error) {
            // Check if error is an optimistic lock failure
            const isOptimisticLockError = error instanceof Error && error.message.includes("Optimistic lock failure");
            
            if (isOptimisticLockError && attempts < MAX_RETRIES) {
                // Wait briefly before retrying (exponential backoff: 50ms, 100ms, 200ms...)
                const delay = Math.pow(2, attempts - 1) * 50;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            throw error;
        }
    }

    return { success: false, error: "max_retries_exceeded: Concurrent modification conflict" };
}

/**
 * Internal logic for wallet deduction (wrapped by retry logic in public export)
 */
async function deductFromWalletInternal(
    databases: Databases,
    walletId: string,
    amount: number,
    options: {
        referenceId: string;
        idempotencyKey: string;
        description?: string;
    }
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
    if (amount <= 0) {
        return { success: false, error: "Amount must be positive" };
    }

    // Rate limit check
    const withinRateLimit = await checkDebitRateLimit(databases, walletId);
    if (!withinRateLimit) {
        return { success: false, error: "rate_limit_exceeded: Too many deductions per minute" };
    }

    const { acquireProcessingLock, releaseProcessingLock } = await import("@/lib/processed-events-registry");
    const eventKey = `wallet_deduct:${options.idempotencyKey}`;

    // 1. Acquire Distributed Lock
    if (!(await acquireProcessingLock(databases, eventKey, "wallet"))) {
        return { success: true, error: "already_processed" };
    }

    try {
        // 2. Get current wallet
        const wallet = await databases.getDocument<Wallet>(
            DATABASE_ID,
            WALLETS_ID,
            walletId
        );

        // 3. Check wallet status
        if (wallet.status === WalletStatus.FROZEN || wallet.status === WalletStatus.CLOSED) {
            // No need to release lock here, we keep it as "processed" record
            return { success: false, error: `wallet_${wallet.status}` };
        }

        // 4. Balance check (available = balance - lockedBalance)
        const availableBalance = wallet.balance - wallet.lockedBalance;
        if (availableBalance < amount) {
            // If we fail due to balance, we release the lock to allow retry if user tops up
            await releaseProcessingLock(databases, eventKey, "wallet");
            return {
                success: false,
                error: "insufficient_balance",
            };
        }

        const balanceBefore = Number(wallet.balance.toFixed(6));
        const amountFixed = Number(amount.toFixed(6));
        const balanceAfter = Number((balanceBefore - amountFixed).toFixed(6));
        const now = new Date().toISOString();

        // 5. Update wallet balance with optimistic locking
        await updateWalletWithVersion(databases, walletId, wallet.version, {
            balance: balanceAfter,
            lastDeductionAt: now,
        });

        // 6. Generate transaction signature
        const signature = generateTransactionSignature({
            walletId,
            type: WalletTransactionType.USAGE,
            amount: amountFixed,
            balanceBefore,
            balanceAfter,
            referenceId: options.referenceId,
            timestamp: now,
        });

        // 7. Create transaction record
        const transaction = await databases.createDocument<WalletTransaction>(
            DATABASE_ID,
            WALLET_TRANSACTIONS_ID,
            ID.unique(),
            {
                walletId,
                type: WalletTransactionType.USAGE,
                amount: amountFixed,
                direction: "debit",
                balanceBefore,
                balanceAfter,
                currency: wallet.currency,
                referenceId: options.referenceId,
                idempotencyKey: options.idempotencyKey,
                signature,
                description: options.description || "Usage charge",
            }
        );

        return { success: true, transaction };

    } catch (error) {
        // RELEASE distributed lock so we can retry the entire process (which including re-reading wallet doc with latest version)
        await releaseProcessingLock(databases, eventKey, "wallet");
        throw error;
    }
}

// ============================================================================
// HOLD / RELEASE OPERATIONS
// ============================================================================

/**
 * Hold funds in wallet (for async/pending operations)
 * 
 * Moves amount from available balance to lockedBalance.
 * The total balance doesn't change, but availableBalance decreases.
 * 
 * IDEMPOTENT: Uses idempotencyKey to prevent duplicate holds.
 */
export async function holdFromWallet(
    databases: Databases,
    walletId: string,
    amount: number,
    options: {
        referenceId: string;
        idempotencyKey: string;
        description?: string;
    }
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
    if (amount <= 0) {
        return { success: false, error: "Amount must be positive" };
    }

    const { acquireProcessingLock, releaseProcessingLock } = await import("@/lib/processed-events-registry");
    const eventKey = `wallet_hold:${options.idempotencyKey}`;

    if (!(await acquireProcessingLock(databases, eventKey, "wallet"))) {
        return { success: true, error: "already_processed" };
    }

    try {
        const wallet = await databases.getDocument<Wallet>(
            DATABASE_ID,
            WALLETS_ID,
            walletId
        );

        // Check wallet status
        if (wallet.status !== WalletStatus.ACTIVE) {
            await releaseProcessingLock(databases, eventKey, "wallet");
            return { success: false, error: `wallet_${wallet.status}` };
        }

        // Check available balance (balance - lockedBalance)
        const availableBalance = wallet.balance - wallet.lockedBalance;
        if (availableBalance < amount) {
            await releaseProcessingLock(databases, eventKey, "wallet");
            return { success: false, error: "insufficient_balance" };
        }

        const now = new Date().toISOString();
        const balanceBefore = Number(wallet.balance.toFixed(6));
        const amountFixed = Number(amount.toFixed(6));

        // Increase lockedBalance (balance stays the same)
        await updateWalletWithVersion(databases, walletId, wallet.version, {
            lockedBalance: Number((wallet.lockedBalance + amountFixed).toFixed(6)),
        });

        // Generate signature
        const signature = generateTransactionSignature({
            walletId,
            type: WalletTransactionType.HOLD,
            amount: amountFixed,
            balanceBefore,
            balanceAfter: balanceBefore, // balance doesn't change on HOLD
            referenceId: options.referenceId,
            timestamp: now,
        });

        // Create HOLD transaction
        const transaction = await databases.createDocument<WalletTransaction>(
            DATABASE_ID,
            WALLET_TRANSACTIONS_ID,
            ID.unique(),
            {
                walletId,
                type: WalletTransactionType.HOLD,
                amount,
                direction: "debit",
                balanceBefore,
                balanceAfter: balanceBefore, // balance unchanged, locked increased
                currency: wallet.currency,
                referenceId: options.referenceId,
                idempotencyKey: options.idempotencyKey,
                signature,
                description: options.description || "Funds held for pending operation",
            }
        );

        return { success: true, transaction };

    } catch (error) {
        await releaseProcessingLock(databases, eventKey, "wallet");
        throw error;
    }
}

/**
 * Release held funds back to available balance
 * 
 * Moves amount from lockedBalance back to available balance.
 * 
 * IDEMPOTENT: Uses idempotencyKey.
 */
export async function releaseHold(
    databases: Databases,
    walletId: string,
    amount: number,
    options: {
        referenceId: string;
        idempotencyKey: string;
        description?: string;
    }
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
    if (amount <= 0) {
        return { success: false, error: "Amount must be positive" };
    }

    const { acquireProcessingLock, releaseProcessingLock } = await import("@/lib/processed-events-registry");
    const eventKey = `wallet_release:${options.idempotencyKey}`;

    if (!(await acquireProcessingLock(databases, eventKey, "wallet"))) {
        return { success: true, error: "already_processed" };
    }

    try {
        const wallet = await databases.getDocument<Wallet>(
            DATABASE_ID,
            WALLETS_ID,
            walletId
        );

        // Ensure there's enough locked balance to release
        if (wallet.lockedBalance < amount) {
            await releaseProcessingLock(databases, eventKey, "wallet");
            return { success: false, error: "insufficient_locked_balance" };
        }

        const now = new Date().toISOString();
        const balanceBefore = wallet.balance;

        // Decrease lockedBalance (balance stays the same)
        await updateWalletWithVersion(databases, walletId, wallet.version, {
            lockedBalance: wallet.lockedBalance - amount,
        });

        const signature = generateTransactionSignature({
            walletId,
            type: WalletTransactionType.RELEASE,
            amount,
            balanceBefore,
            balanceAfter: balanceBefore,
            referenceId: options.referenceId,
            timestamp: now,
        });

        const transaction = await databases.createDocument<WalletTransaction>(
            DATABASE_ID,
            WALLET_TRANSACTIONS_ID,
            ID.unique(),
            {
                walletId,
                type: WalletTransactionType.RELEASE,
                amount,
                direction: "credit",
                balanceBefore,
                balanceAfter: balanceBefore, // balance unchanged, locked decreased
                currency: wallet.currency,
                referenceId: options.referenceId,
                idempotencyKey: options.idempotencyKey,
                signature,
                description: options.description || "Held funds released",
            }
        );

        return { success: true, transaction };

    } catch (error) {
        await releaseProcessingLock(databases, eventKey, "wallet");
        throw error;
    }
}

/**
 * Confirm a hold — commit it as a DEBIT
 * 
 * Converts held funds into a permanent deduction:
 * - Decreases both balance and lockedBalance by amount
 * - Creates a USAGE transaction for the final debit
 * 
 * IDEMPOTENT: Uses idempotencyKey.
 */
export async function confirmHold(
    databases: Databases,
    walletId: string,
    amount: number,
    options: {
        referenceId: string;
        idempotencyKey: string;
        description?: string;
    }
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
    if (amount <= 0) {
        return { success: false, error: "Amount must be positive" };
    }

    const { acquireProcessingLock, releaseProcessingLock } = await import("@/lib/processed-events-registry");
    const eventKey = `wallet_confirm_hold:${options.idempotencyKey}`;

    if (!(await acquireProcessingLock(databases, eventKey, "wallet"))) {
        return { success: true, error: "already_processed" };
    }

    try {
        const wallet = await databases.getDocument<Wallet>(
            DATABASE_ID,
            WALLETS_ID,
            walletId
        );

        if (wallet.lockedBalance < amount) {
            await releaseProcessingLock(databases, eventKey, "wallet");
            return { success: false, error: "insufficient_locked_balance" };
        }

        const balanceBefore = Number(wallet.balance.toFixed(6));
        const amountFixed = Number(amount.toFixed(6));
        const balanceAfter = Number((balanceBefore - amountFixed).toFixed(6));
        const now = new Date().toISOString();

        // Deduct from both balance and lockedBalance
        await updateWalletWithVersion(databases, walletId, wallet.version, {
            balance: balanceAfter,
            lockedBalance: Number((wallet.lockedBalance - amountFixed).toFixed(6)),
            lastDeductionAt: now,
        });

        const signature = generateTransactionSignature({
            walletId,
            type: WalletTransactionType.USAGE,
            amount: amountFixed,
            balanceBefore,
            balanceAfter,
            referenceId: options.referenceId,
            timestamp: now,
        });

        const transaction = await databases.createDocument<WalletTransaction>(
            DATABASE_ID,
            WALLET_TRANSACTIONS_ID,
            ID.unique(),
            {
                walletId,
                type: WalletTransactionType.USAGE,
                amount,
                direction: "debit",
                balanceBefore,
                balanceAfter,
                currency: wallet.currency,
                referenceId: options.referenceId,
                idempotencyKey: options.idempotencyKey,
                signature,
                description: options.description || "Held funds confirmed as debit",
                metadata: JSON.stringify({ confirmedFromHold: true }),
            }
        );

        return { success: true, transaction };

    } catch (error) {
        await releaseProcessingLock(databases, eventKey, "wallet");
        throw error;
    }
}

// ============================================================================
// REFUND OPERATIONS
// ============================================================================

/**
 * Refund to wallet
 * 
 * IDEMPOTENT: Uses idempotencyKey to prevent duplicate refunds
 */
export async function refundToWallet(
    databases: Databases,
    walletId: string,
    amount: number,
    options: {
        referenceId: string;
        idempotencyKey: string;
        reason?: string;
    }
): Promise<{ success: boolean; transaction?: WalletTransaction; error?: string }> {
    if (amount <= 0) {
        return { success: false, error: "Amount must be positive" };
    }

    const { acquireProcessingLock, releaseProcessingLock } = await import("@/lib/processed-events-registry");
    const eventKey = `wallet_refund:${options.idempotencyKey}`;

    if (!(await acquireProcessingLock(databases, eventKey, "wallet"))) {
        return { success: true, error: "already_processed" };
    }

    try {
        const wallet = await databases.getDocument<Wallet>(
            DATABASE_ID,
            WALLETS_ID,
            walletId
        );

        const balanceBefore = Number(wallet.balance.toFixed(6));
        const amountFixed = Number(amount.toFixed(6));
        const balanceAfter = Number((balanceBefore + amountFixed).toFixed(6));
        const now = new Date().toISOString();

        // Update wallet balance with optimistic locking
        await updateWalletWithVersion(databases, walletId, wallet.version, {
            balance: balanceAfter,
        });

        const signature = generateTransactionSignature({
            walletId,
            type: WalletTransactionType.REFUND,
            amount: amountFixed,
            balanceBefore,
            balanceAfter,
            referenceId: options.referenceId,
            timestamp: now,
        });

        // Create transaction record
        const transaction = await databases.createDocument<WalletTransaction>(
            DATABASE_ID,
            WALLET_TRANSACTIONS_ID,
            ID.unique(),
            {
                walletId,
                type: WalletTransactionType.REFUND,
                amount,
                direction: "credit",
                balanceBefore,
                balanceAfter,
                currency: wallet.currency,
                referenceId: options.referenceId,
                idempotencyKey: options.idempotencyKey,
                signature,
                description: options.reason || "Refund",
            }
        );

        return { success: true, transaction };

    } catch (error) {
        await releaseProcessingLock(databases, eventKey, "wallet");
        throw error;
    }
}

// ============================================================================
// TRANSACTION QUERIES
// ============================================================================

/**
 * Get wallet transactions
 */
export async function getWalletTransactions(
    databases: Databases,
    walletId: string,
    options: {
        limit?: number;
        offset?: number;
        type?: WalletTransactionType;
    } = {}
): Promise<{ transactions: WalletTransaction[]; total: number }> {
    const queries = [
        Query.equal("walletId", walletId),
        Query.orderDesc("$createdAt"),
        Query.limit(options.limit || 20),
        Query.offset(options.offset || 0),
    ];

    if (options.type) {
        queries.push(Query.equal("type", options.type));
    }

    const result = await databases.listDocuments<WalletTransaction>(
        DATABASE_ID,
        WALLET_TRANSACTIONS_ID,
        queries
    );

    return {
        transactions: result.documents,
        total: result.total,
    };
}

/**
 * Verify a transaction signature for integrity checking
 */
export function verifyTransactionSignature(transaction: WalletTransaction): boolean {
    if (!transaction.signature) return false;

    const expected = generateTransactionSignature({
        walletId: transaction.walletId,
        type: transaction.type,
        amount: transaction.amount,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        referenceId: transaction.referenceId || "",
        timestamp: transaction.$createdAt,
    });

    return expected === transaction.signature;
}

// ============================================================================
// HELPER: Setup wallet for billing account
// ============================================================================

/**
 * Ensure wallet exists for a billing entity
 * Called during billing account setup
 */
export async function ensureWalletExists(
    options: {
        userId?: string;
        organizationId?: string;
        currency?: string;
    }
): Promise<Wallet> {
    const { databases } = await createAdminClient();
    return getOrCreateWallet(databases, options);
}
