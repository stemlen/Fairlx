import { Models } from "node-appwrite";

// ===============================
// Wallet Transaction Types
// ===============================

/**
 * WalletTransactionType - tracks type of wallet transaction
 * 
 * TOPUP: Funds added to wallet (via Cashfree payment)
 * USAGE: Funds deducted for billing usage
 * REFUND: Funds returned (e.g., service credit)
 * ADJUSTMENT: Manual adjustment by admin
 * HOLD: Funds reserved for pending async operations
 * RELEASE: Reserved funds returned to available balance
 * REWARD_CREDIT: Funds credited from promotional rewards (e.g., GitHub Star Reward)
 * TRIAL_CREDIT: Welcome trial credit granted to new organizations
 */
export enum WalletTransactionType {
    TOPUP = "TOPUP",
    USAGE = "USAGE",
    REFUND = "REFUND",
    ADJUSTMENT = "ADJUSTMENT",
    HOLD = "HOLD",
    RELEASE = "RELEASE",
    REWARD_CREDIT = "REWARD_CREDIT",
    TRIAL_CREDIT = "TRIAL_CREDIT",
}

// ===============================
// Wallet Status
// ===============================

/**
 * WalletStatus - tracks wallet state
 * 
 * ACTIVE: Wallet is operational
 * FROZEN: Wallet is temporarily frozen (admin action)
 * CLOSED: Wallet is permanently closed
 */
export enum WalletStatus {
    ACTIVE = "active",
    FROZEN = "frozen",
    CLOSED = "closed",
}

// ===============================
// Database Document Types
// ===============================

/**
 * Wallet - User's prepaid balance
 * 
 * Each user/org has exactly one wallet.
 * Balance is stored in smallest currency unit (cents for USD).
 * 
 * INVARIANT: balance may go negative down to -$20 (overdraft). At or below
 * -$20 the billing account is locked (SUSPENDED).
 * INVARIANT: lockedBalance <= max(balance, 0) + overdraft is not required;
 * holds still require available funds.
 */
export type Wallet = Models.Document & {
    /** User ID (for PERSONAL accounts) */
    userId?: string;

    /** Organization ID (for ORG accounts) */
    organizationId?: string;

    /** Billing Account ID (required) */
    billingAccountId: string;

    /** Available balance in USD (supports high precision, e.g. $0.000001) */
    balance: number;

    /** Currency code (USD) */
    currency: string;

    /** Balance reserved for pending transactions (in USD) */
    lockedBalance: number;

    /** Wallet status */
    status: WalletStatus;

    /** Optimistic locking version — incremented on every balance update */
    version: number;

    /** Last top-up timestamp */
    lastTopUpAt?: string;

    /** Last deduction timestamp */
    lastDeductionAt?: string;
};

/**
 * WalletTransaction - Ledger entry for wallet operations
 * 
 * IMMUTABLE: Transactions are append-only, never modified.
 * This ensures audit trail and ledger consistency.
 */
export type WalletTransaction = Models.Document & {
    /** Reference to Wallet */
    walletId: string;

    /** Transaction type */
    type: WalletTransactionType;

    /** Amount (always positive, direction determines credit/debit) */
    amount: number;

    /** Direction: credit (increase) or debit (decrease) */
    direction: "credit" | "debit";

    /** Balance before this transaction */
    balanceBefore: number;

    /** Balance after this transaction */
    balanceAfter: number;

    /** Currency code */
    currency: string;

    /** Reference ID (invoice ID, order ID, etc.) */
    referenceId?: string;

    /** Idempotency key for replay protection */
    idempotencyKey?: string;

    /** HMAC-SHA256 audit hash for tamper detection */
    signature?: string;

    /** Additional metadata (JSON stringified) */
    metadata?: string;

    /** Description for display */
    description?: string;
};

/**
 * UsageDeduction - Record of a usage-based deduction from wallet
 * 
 * Links a wallet transaction to the specific service usage that triggered it.
 */
export type UsageDeduction = Models.Document & {
    /** Reference to WalletTransaction */
    walletTransactionId: string;

    /** Reference to Wallet */
    walletId: string;

    /** User or Organization ID that owns the wallet */
    userId?: string;
    organizationId?: string;

    /** Service type that generated the usage (e.g., "traffic", "storage", "compute", "ai") */
    serviceType: string;

    /** Cost in smallest currency unit (paise) */
    cost: number;

    /** Currency code */
    currency: string;

    /** Additional metadata (JSON stringified) — e.g., GB used, compute units */
    metadata?: string;
};

// ===============================
// API DTOs
// ===============================

export type TopupWalletDto = {
    amount: number;
    cashfreeOrderId: string;
    cfPaymentId: string;
    orderAmount: number;
    signature: string;
};

export type DeductWalletDto = {
    amount: number;
    referenceId: string;
    idempotencyKey: string;
    description?: string;
};

export type WalletBalanceResponse = {
    balance: number;
    lockedBalance: number;
    availableBalance: number;
    currency: string;
    status: WalletStatus;
    lastTopUpAt?: string;
};

export type CreateTopupOrderDto = {
    amount: number;
};

export type HoldWalletDto = {
    amount: number;
    referenceId: string;
    idempotencyKey: string;
    description?: string;
};

export type ReleaseHoldDto = {
    amount: number;
    referenceId: string;
    idempotencyKey: string;
    confirm?: boolean; // if true, commit hold as DEBIT instead of releasing
};
