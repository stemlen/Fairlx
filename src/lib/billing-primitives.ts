import "server-only";

import { Query, Databases } from "node-appwrite";
import {
    DATABASE_ID,
    BILLING_ACCOUNTS_ID,
    WORKSPACES_ID,
} from "@/config";
import { createAdminClient } from "@/lib/appwrite";
import { BillingStatus, BillingAccountType, BillingAccount } from "@/features/billing/types";

/**
 * Billing Primitives - Enterprise-grade enforcement helpers
 * 
 * INVARIANTS:
 * - Usage events are immutable (write-once, never modify)
 * - Billing cycle lock prevents late writes
 * - Aggregations derive from events only
 * - Suspended accounts cannot mutate data
 * 
 * USAGE:
 * These helpers MUST be called from:
 * - API routes (in addition to middleware)
 * - Server actions
 * - Background jobs
 * 
 * Middleware alone is NOT sufficient for enforcement.
 */

// ============================================================================
// ERROR TYPES
// ============================================================================

export type BillingErrorCode =
    | "BILLING_SUSPENDED"
    | "BILLING_DUE"
    | "BILLING_NOT_FOUND"
    | "BILLING_CYCLE_LOCKED"
    | "USAGE_WRITE_BLOCKED";

export class BillingError extends Error {
    code: BillingErrorCode;
    billingAccountId?: string;
    billingStatus?: BillingStatus;

    constructor(
        code: BillingErrorCode,
        message: string,
        options?: { billingAccountId?: string; billingStatus?: BillingStatus }
    ) {
        super(message);
        this.name = "BillingError";
        this.code = code;
        this.billingAccountId = options?.billingAccountId;
        this.billingStatus = options?.billingStatus;
    }
}

// ============================================================================
// BILLING ACCOUNT LOOKUP
// ============================================================================

export interface BillingLookupOptions {
    userId?: string;
    organizationId?: string;
    workspaceId?: string;
}

/**
 * Get billing account for a user, organization, or workspace
 * 
 * Resolution order:
 * 1. If organizationId provided, look up org billing account
 * 2. If workspaceId provided, derive owner from workspace
 * 3. If userId provided, look up personal billing account
 * 
 * NOTE: Uses admin client for billing account lookups since regular users
 * don't have read permissions on the billing accounts collection.
 */
export async function getBillingAccount(
    databases: Databases,
    options: BillingLookupOptions
): Promise<BillingAccount | null> {
    try {
        // Use admin client for billing account lookups (restricted collection)
        const { databases: adminDatabases } = await createAdminClient();

        // Priority 1: Direct organization lookup
        if (options.organizationId) {
            const accounts = await adminDatabases.listDocuments<BillingAccount>(
                DATABASE_ID,
                BILLING_ACCOUNTS_ID,
                [
                    Query.equal("organizationId", options.organizationId),
                    Query.equal("type", BillingAccountType.ORG),
                    Query.limit(1),
                ]
            );
            if (accounts.total > 0) {
                return accounts.documents[0];
            }
        }

        // Priority 2: Derive from workspace
        if (options.workspaceId) {
            // Workspace lookup can use either user databases or admin
            // Using passed databases for workspace since user has access
            const workspace = await databases.getDocument(
                DATABASE_ID,
                WORKSPACES_ID,
                options.workspaceId
            );

            if (workspace.organizationId) {
                const accounts = await adminDatabases.listDocuments<BillingAccount>(
                    DATABASE_ID,
                    BILLING_ACCOUNTS_ID,
                    [
                        Query.equal("organizationId", workspace.organizationId),
                        Query.equal("type", BillingAccountType.ORG),
                        Query.limit(1),
                    ]
                );
                if (accounts.total > 0) {
                    return accounts.documents[0];
                }
            } else if (workspace.userId) {
                const accounts = await adminDatabases.listDocuments<BillingAccount>(
                    DATABASE_ID,
                    BILLING_ACCOUNTS_ID,
                    [
                        Query.equal("userId", workspace.userId),
                        Query.equal("type", BillingAccountType.PERSONAL),
                        Query.limit(1),
                    ]
                );
                if (accounts.total > 0) {
                    return accounts.documents[0];
                }
            }
        }

        // Priority 3: Direct user lookup
        if (options.userId) {
            const accounts = await adminDatabases.listDocuments<BillingAccount>(
                DATABASE_ID,
                BILLING_ACCOUNTS_ID,
                [
                    Query.equal("userId", options.userId),
                    Query.equal("type", BillingAccountType.PERSONAL),
                    Query.limit(1),
                ]
            );
            if (accounts.total > 0) {
                return accounts.documents[0];
            }
        }

        return null;
    } catch {
        return null;
    }
}


// ============================================================================
// BILLING STATUS ASSERTIONS
// ============================================================================

/**
 * Assert billing account is ACTIVE (not DUE, not SUSPENDED)
 * 
 * Use this for operations that require full billing compliance,
 * such as creating resources that consume billable usage.
 * 
 * @throws BillingError if status is not ACTIVE
 */
export async function assertBillingActive(
    databases: Databases,
    options: BillingLookupOptions
): Promise<BillingAccount> {
    const account = await getBillingAccount(databases, options);

    if (!account) {
        // No billing account = new user, allow access (billing not yet set up)
        // This is a design choice - we fail OPEN for missing accounts
        // but fail CLOSED for suspended accounts
        return null as unknown as BillingAccount;
    }

    if (account.billingStatus === BillingStatus.SUSPENDED) {
        throw new BillingError(
            "BILLING_SUSPENDED",
            "Your account has been suspended due to an unpaid invoice. Please update your payment method to restore access.",
            { billingAccountId: account.$id, billingStatus: account.billingStatus }
        );
    }

    if (account.billingStatus === BillingStatus.DUE) {
        throw new BillingError(
            "BILLING_DUE",
            "Your account has an unpaid invoice. Please pay to avoid service interruption.",
            { billingAccountId: account.$id, billingStatus: account.billingStatus }
        );
    }

    return account;
}

/**
 * Assert billing account is not SUSPENDED (DUE is allowed)
 * 
 * Use this for operations that allow grace period access.
 * Most operations should use this, not assertBillingActive.
 * 
 * @throws BillingError if status is SUSPENDED
 */
export async function assertBillingNotSuspended(
    databases: Databases,
    options: BillingLookupOptions
): Promise<BillingAccount | null> {
    const account = await getBillingAccount(databases, options);

    if (!account) {
        // No billing account = allow access
        return null;
    }

    if (account.billingStatus === BillingStatus.SUSPENDED) {
        throw new BillingError(
            "BILLING_SUSPENDED",
            "Your account has been suspended due to an unpaid invoice. Please update your payment method to restore access.",
            { billingAccountId: account.$id, billingStatus: account.billingStatus }
        );
    }

    return account;
}

// ============================================================================
// BILLING CYCLE LOCKING (CROSS-PROCESS SAFE)
// ============================================================================

/**
 * Lock operation result
 */
export interface LockResult {
    success: boolean;
    alreadyLocked: boolean;
    lockedAt?: string;
    error?: string;
}

/**
 * Check if billing cycle is locked for a billing account
 * 
 * Locked cycles cannot accept new usage events.
 * Late events should be rolled into the next cycle.
 * 
 * NOTE: Uses admin client since billing accounts is a restricted collection.
 */
export async function isBillingCycleLocked(
    _databases: Databases,
    billingAccountId: string
): Promise<boolean> {
    try {
        const { databases: adminDatabases } = await createAdminClient();
        const account = await adminDatabases.getDocument<BillingAccount>(
            DATABASE_ID,
            BILLING_ACCOUNTS_ID,
            billingAccountId
        );
        return account.isBillingCycleLocked === true;
    } catch {
        return false;
    }
}

/**
 * Lock billing cycle at period close (CROSS-PROCESS SAFE)
 * 
 * Uses compare-and-set semantics:
 * 1. Check if already locked
 * 2. If not, attempt lock with timestamp
 * 3. Verify lock was acquired (no race)
 * 
 * CRITICAL: Once locked, no new usage events can be written
 * for that billing cycle. Late events roll into next cycle.
 * 
 * Should be called BEFORE generating invoice.
 * 
 * @returns LockResult with success/alreadyLocked status
 */
export async function lockBillingCycle(
    _databases: Databases,
    billingAccountId: string
): Promise<LockResult> {
    const lockTimestamp = new Date().toISOString();
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const logTiming = (operation: string, success: boolean) => {
        const durationMs = typeof performance !== 'undefined'
            ? Math.round(performance.now() - startTime)
            : Math.round(Date.now() - startTime);

        return { durationMs, operation, success };
    };

    try {
        // Use admin client for billing account operations (restricted collection)
        const { databases: adminDatabases } = await createAdminClient();

        // Step 1: Read current state
        const account = await adminDatabases.getDocument<BillingAccount>(
            DATABASE_ID,
            BILLING_ACCOUNTS_ID,
            billingAccountId
        );

        // Step 2: Check if already locked (idempotent handling)
        if (account.isBillingCycleLocked === true) {
            logTiming('lock_check', false);
            return {
                success: false,
                alreadyLocked: true,
                lockedAt: account.billingCycleLockedAt,
            };
        }

        // Step 3: Attempt lock with our timestamp
        await adminDatabases.updateDocument(
            DATABASE_ID,
            BILLING_ACCOUNTS_ID,
            billingAccountId,
            {
                isBillingCycleLocked: true,
                billingCycleLockedAt: lockTimestamp,
            }
        );

        // Step 4: Verify we won the race (compare-and-verify)
        const verifyAccount = await adminDatabases.getDocument<BillingAccount>(
            DATABASE_ID,
            BILLING_ACCOUNTS_ID,
            billingAccountId
        );

        if (verifyAccount.billingCycleLockedAt !== lockTimestamp) {
            // Another process won the race
            logTiming('lock_race', false);
            return {
                success: false,
                alreadyLocked: true,
                lockedAt: verifyAccount.billingCycleLockedAt,
            };
        }

        const _timing = logTiming('lock_acquired', true);
        return {
            success: true,
            alreadyLocked: false,
            lockedAt: lockTimestamp,
        };
    } catch (error) {
        logTiming('lock_error', false);
        return {
            success: false,
            alreadyLocked: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Unlock billing cycle (start of new cycle)
 * 
 * Called after advancing to new billing cycle dates.
 * Safe to call multiple times (idempotent).
 * 
 * NOTE: Uses admin client since billing accounts is a restricted collection.
 */
export async function unlockBillingCycle(
    _databases: Databases,
    billingAccountId: string
): Promise<boolean> {
    try {
        const { databases: adminDatabases } = await createAdminClient();
        await adminDatabases.updateDocument(
            DATABASE_ID,
            BILLING_ACCOUNTS_ID,
            billingAccountId,
            {
                isBillingCycleLocked: false,
                billingCycleLockedAt: null,
            }
        );

        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// USAGE WRITE GUARDS
// ============================================================================

/**
 * Assert usage can be written for a billing account
 * 
 * Checks:
 * 1. Account is not SUSPENDED
 * 2. Billing cycle is not locked
 * 
 * @throws BillingError if usage cannot be written
 */
export async function assertCanWriteUsage(
    databases: Databases,
    options: BillingLookupOptions
): Promise<{ account: BillingAccount | null; allowed: boolean }> {
    // Check billing status
    const account = await assertBillingNotSuspended(databases, options);

    // If no account, allow (new user)
    if (!account) {
        return { account: null, allowed: true };
    }

    // Check cycle lock
    if (account.isBillingCycleLocked) {
        throw new BillingError(
            "BILLING_CYCLE_LOCKED",
            "Billing cycle is locked. Late usage will be recorded in the next cycle.",
            { billingAccountId: account.$id }
        );
    }

    return { account, allowed: true };
}

/**
 * Handle late usage events
 * 
 * If event timestamp falls in locked cycle, automatically
 * adjust it to the start of the current cycle instead.
 * 
 * @param eventTimestamp - Original event timestamp
 * @param account - Billing account to check against
 * @returns Adjusted timestamp (may be same as original if not late)
 */
export function adjustEventForLockedCycle(
    eventTimestamp: string,
    account: BillingAccount | null
): { timestamp: string; wasAdjusted: boolean; adjustReason?: string } {
    if (!account) {
        return { timestamp: eventTimestamp, wasAdjusted: false };
    }

    const eventDate = new Date(eventTimestamp);
    const cycleEnd = new Date(account.billingCycleEnd);
    const cycleStart = new Date(account.billingCycleStart);

    // If event is before current cycle start and cycle is locked, adjust
    if (account.isBillingCycleLocked && eventDate < cycleStart) {
        return {
            timestamp: cycleStart.toISOString(),
            wasAdjusted: true,
            adjustReason: `Late event from ${eventTimestamp} adjusted to cycle start`,
        };
    }

    // If event is after cycle end (shouldn't happen but safety check)
    if (eventDate > cycleEnd) {
        // Use current time
        return {
            timestamp: new Date().toISOString(),
            wasAdjusted: true,
            adjustReason: `Future event from ${eventTimestamp} adjusted to now`,
        };
    }

    return { timestamp: eventTimestamp, wasAdjusted: false };
}

// ============================================================================
// STATUS TRANSITION VALIDATION
// ============================================================================

/**
 * Valid billing status transitions
 * 
 * ACTIVE -> DUE (payment failed)
 * DUE -> ACTIVE (payment received)
 * DUE -> SUSPENDED (grace period expired)
 * SUSPENDED -> ACTIVE (payment received)
 * 
 * Invalid:
 * ACTIVE -> SUSPENDED (must go through DUE first)
 * SUSPENDED -> DUE (cannot go backwards)
 */
const VALID_STATUS_TRANSITIONS: Record<BillingStatus, BillingStatus[]> = {
    [BillingStatus.ACTIVE]: [BillingStatus.DUE],
    [BillingStatus.DUE]: [BillingStatus.ACTIVE, BillingStatus.SUSPENDED],
    [BillingStatus.SUSPENDED]: [BillingStatus.ACTIVE],
};

/**
 * Assert billing status transition is valid
 * 
 * @throws Error if transition is invalid
 */
export function assertValidStatusTransition(
    from: BillingStatus,
    to: BillingStatus
): void {
    if (from === to) {
        return; // Same status is always valid (no-op)
    }

    const validTargets = VALID_STATUS_TRANSITIONS[from] || [];
    if (!validTargets.includes(to)) {
        throw new Error(
            `Invalid billing status transition: ${from} -> ${to}. ` +
            `Valid transitions from ${from}: ${validTargets.join(", ") || "none"}`
        );
    }
}

// ============================================================================
// NEAR-SUSPENSION WARNING DETECTION
// ============================================================================

/**
 * Hours before gracePeriodEnd to trigger warning
 */
export const NEAR_SUSPENSION_THRESHOLD_HOURS = 48;

/**
 * Warning state levels
 */
export type WarningState = "NORMAL" | "WARNING" | "CRITICAL" | "SUSPENDED";

/**
 * Account warning state with context
 */
export interface AccountWarningState {
    state: WarningState;
    hoursRemaining?: number;
    gracePeriodEnd?: string;
    message?: string;
}

/**
 * Get warning state for a billing account
 * 
 * States:
 * - NORMAL: Account active, no issues
 * - WARNING: Grace period ending within 48 hours
 * - CRITICAL: Grace period ending within 12 hours
 * - SUSPENDED: Account is suspended
 * 
 * Use this to show warnings to ALL org members.
 */
export function getAccountWarningState(
    account: BillingAccount | null
): AccountWarningState {
    if (!account) {
        return { state: "NORMAL" };
    }

    // Check if already suspended
    if (account.billingStatus === BillingStatus.SUSPENDED) {
        return {
            state: "SUSPENDED",
            message: "Your account is suspended. Please update your payment method to restore access.",
        };
    }

    // Check if in grace period (DUE status)
    if (account.billingStatus === BillingStatus.DUE && account.gracePeriodEnd) {
        const now = new Date();
        const gracePeriodEnd = new Date(account.gracePeriodEnd);
        const hoursRemaining = Math.max(0, (gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60));

        if (hoursRemaining <= 0) {
            // Should be suspended but hasn't transitioned yet
            return {
                state: "CRITICAL",
                hoursRemaining: 0,
                gracePeriodEnd: account.gracePeriodEnd,
                message: "Your grace period has expired. Your account will be suspended shortly.",
            };
        }

        if (hoursRemaining <= 12) {
            return {
                state: "CRITICAL",
                hoursRemaining: Math.ceil(hoursRemaining),
                gracePeriodEnd: account.gracePeriodEnd,
                message: `URGENT: Your account will be suspended in ${Math.ceil(hoursRemaining)} hours. Please pay your invoice immediately.`,
            };
        }

        if (hoursRemaining <= NEAR_SUSPENSION_THRESHOLD_HOURS) {
            return {
                state: "WARNING",
                hoursRemaining: Math.ceil(hoursRemaining),
                gracePeriodEnd: account.gracePeriodEnd,
                message: `Your account has an unpaid invoice. You have ${Math.ceil(hoursRemaining)} hours before suspension.`,
            };
        }

        // DUE but not near suspension
        return {
            state: "WARNING",
            hoursRemaining: Math.ceil(hoursRemaining),
            gracePeriodEnd: account.gracePeriodEnd,
            message: "Your account has an unpaid invoice. Please pay to avoid service interruption.",
        };
    }

    return { state: "NORMAL" };
}

/**
 * Check if warning should be shown globally (to all org members)
 * 
 * Returns true for WARNING and CRITICAL states.
 * These warnings should NOT be dismissible.
 */
export function shouldShowGlobalWarning(state: AccountWarningState): boolean {
    return state.state === "WARNING" || state.state === "CRITICAL" || state.state === "SUSPENDED";
}
