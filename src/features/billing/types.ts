import { Models } from "node-appwrite";

// ===============================
// Billing Status Enum
// ===============================

/**
 * BillingStatus - tracks account billing state
 * 
 * ACTIVE: Wallet has funds, full access to all features
 * DUE: Wallet balance insufficient, in grace period (14 days) - full access with warnings
 * SUSPENDED: Grace period expired, restricted to billing pages only
 */
export enum BillingStatus {
    ACTIVE = "ACTIVE",
    DUE = "DUE",
    SUSPENDED = "SUSPENDED",
}

// ===============================
// Billing Account Type Enum
// ===============================

/**
 * BillingAccountType - matches AccountType but specific to billing
 * 
 * PERSONAL: Individual user account, billed directly
 * ORG: Organization account, billed to the organization
 */
export enum BillingAccountType {
    PERSONAL = "PERSONAL",
    ORG = "ORG",
}

// ===============================
// Deployment Tier Enum
// ===============================

/**
 * DeploymentTier - determines billing scope for an account
 * 
 * FAIRLX_CLOUD: Full billing (traffic + storage + compute) — default
 * BYOB: Frontend-only billing (traffic only, no storage/compute)
 * SELF_HOSTED: No billing (future tier)
 */
export enum DeploymentTier {
    FAIRLX_CLOUD = "FAIRLX_CLOUD",
    BYOB = "BYOB",
    SELF_HOSTED = "SELF_HOSTED",
}

// ===============================
// Billing Audit Event Types
// ===============================

/**
 * BillingAuditEventType - all trackable billing events
 * 
 * Used for compliance, debugging, and customer support.
 */
export enum BillingAuditEventType {
    // Wallet Events
    WALLET_TOPUP = "WALLET_TOPUP",
    WALLET_DEDUCTION = "WALLET_DEDUCTION",
    WALLET_REFUND = "WALLET_REFUND",
    WALLET_HOLD = "WALLET_HOLD",
    WALLET_RELEASE = "WALLET_RELEASE",
    WALLET_OVERDRAFT_LOCK = "WALLET_OVERDRAFT_LOCK",

    // Invoice Events
    INVOICE_GENERATED = "INVOICE_GENERATED",
    INVOICE_FINALIZED = "INVOICE_FINALIZED",

    // Payment Events (Cashfree one-time)
    PAYMENT_ATTEMPTED = "PAYMENT_ATTEMPTED",
    PAYMENT_SUCCEEDED = "PAYMENT_SUCCEEDED",
    PAYMENT_FAILED = "PAYMENT_FAILED",
    PAYMENT_AUTHORIZED = "PAYMENT_AUTHORIZED",

    // Grace Period Events
    GRACE_PERIOD_STARTED = "GRACE_PERIOD_STARTED",
    GRACE_PERIOD_REMINDER_SENT = "GRACE_PERIOD_REMINDER_SENT",
    GRACE_PERIOD_EXPIRING = "GRACE_PERIOD_EXPIRING",

    // Account Status Events
    ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED",
    ACCOUNT_RESTORED = "ACCOUNT_RESTORED",

    // Billing Account Events
    BILLING_ACCOUNT_CREATED = "BILLING_ACCOUNT_CREATED",

    // Refund Events
    REFUND_PROCESSED = "REFUND_PROCESSED",
    REFUND_FAILED = "REFUND_FAILED",

    // Webhook Events
    WEBHOOK_RECEIVED = "WEBHOOK_RECEIVED",
    WEBHOOK_PROCESSED = "WEBHOOK_PROCESSED",
    WEBHOOK_FAILED = "WEBHOOK_FAILED",

    // GitHub Star Reward Events
    GITHUB_REWARD_REDEEMED = "GITHUB_REWARD_REDEEMED",
    GITHUB_REWARD_FAILED = "GITHUB_REWARD_FAILED",
}

// ===============================
// Invoice Status
// ===============================

export enum InvoiceStatus {
    DRAFT = "DRAFT",       // Being generated, not yet finalized
    DUE = "DUE",           // Finalized, awaiting payment
    PAID = "PAID",         // Successfully paid (wallet deduction or Cashfree)
    FAILED = "FAILED",     // Wallet deduction failed (insufficient balance)
}

// ===============================
// Database Document Types
// ===============================

/**
 * BillingAccount - Core billing entity
 * 
 * Links either a userId (PERSONAL) or organizationId (ORG) to billing.
 * Tracks billing status and cycle dates.
 * 
 * WALLET-ONLY: All payments flow through the wallet. No mandates, no subscriptions.
 * 
 * INVARIANT: Each user/org has exactly one BillingAccount.
 */
export type BillingAccount = Models.Document & {
    /** Account type: PERSONAL or ORG */
    type: BillingAccountType;

    /** User ID (required for PERSONAL accounts) */
    userId?: string;

    /** Organization ID (required for ORG accounts) */
    organizationId?: string;

    /** Cashfree Customer ID (derived stable ID from email hash) */
    cashfreeCustomerId: string;

    /** Current billing status */
    billingStatus: BillingStatus;

    /** Current billing cycle start (ISO datetime) */
    billingCycleStart: string;

    /** Current billing cycle end (ISO datetime) */
    billingCycleEnd: string;

    /** Grace period end date (set when wallet balance is insufficient) */
    gracePeriodEnd?: string;

    /** Last successful payment timestamp */
    lastPaymentAt?: string;

    /** Last failed payment timestamp */
    lastPaymentFailedAt?: string;

    /** Email for billing notifications */
    billingEmail?: string;

    // ============================================================================
    // BILLING CYCLE LOCKING (Production Hardening)
    // ============================================================================

    /** Whether current billing cycle is locked (no new usage writes) */
    isBillingCycleLocked?: boolean;

    /** When the cycle was locked */
    billingCycleLockedAt?: string;

    // ============================================================================
    // BYOB DEPLOYMENT TIER
    // ============================================================================

    /** Deployment tier — determines billing scope (defaults to FAIRLX_CLOUD) */
    deploymentTier?: DeploymentTier;
};

/**
 * BillingInvoice - Enhanced invoice with wallet deduction tracking
 * 
 * CRITICAL: Invoice is persisted BEFORE deducting from wallet.
 * WHY: Ensures we never lose track of what was billed.
 */
export type BillingInvoice = Models.Document & {
    /** Human-readable invoice ID (e.g., INV-2026-001) */
    invoiceId: string;

    /** Reference to BillingAccount */
    billingAccountId: string;

    /** Billing entity ID (userId or organizationId) */
    billingEntityId: string;

    /** Billing entity type */
    billingEntityType: "user" | "organization";

    /** Billing cycle start (ISO datetime) */
    cycleStart: string;

    /** Billing cycle end (ISO datetime) */
    cycleEnd: string;

    /** Usage breakdown (JSON stringified) */
    usageBreakdown: string;

    /** Total amount in smallest currency unit (paisa/cents) */
    amount: number;

    /** Currency code (INR, USD, etc.) */
    currency: string;

    /** Invoice status */
    status: InvoiceStatus;

    /** Due date (ISO datetime) */
    dueDate: string;

    /** Cashfree Payment ID (cf_payment_id from Cashfree) */
    cashfreePaymentId?: string;

    /** Wallet Transaction ID (when paid via wallet) */
    walletTransactionId?: string;

    /** Failure reason (when deduction fails) */
    failureReason?: string;

    /** Number of deduction retry attempts */
    retryCount: number;

    /** Timestamp when paid */
    paidAt?: string;
};

/**
 * UsageBreakdown - Detailed usage for invoice
 * 
 * This is stored as JSON in BillingInvoice.usageBreakdown
 */
export type UsageBreakdown = {
    /** Traffic usage in GB */
    trafficGB: number;

    /** Average storage usage in GB */
    storageAvgGB: number;

    /** Compute units consumed */
    computeUnits: number;

    /** Usage breakdown by module */
    byModule: {
        traffic?: number;
        storage?: number;
        docs?: number;
        github?: number;
        ai?: number;
        compute?: number;
    };

    /** Cost breakdown */
    costs: {
        traffic: number;
        storage: number;
        compute: number;
        total: number;
        /** Total amount already debited from wallet via instant billing */
        totalAlreadyPaid: number;
    };
};

/**
 * BillingAuditLog - Audit trail for billing events
 * 
 * CRITICAL: All billing events must be logged.
 * WHY: Compliance, debugging, customer support.
 */
export type BillingAuditLog = Models.Document & {
    /** Reference to BillingAccount */
    billingAccountId: string;

    /** Event type */
    eventType: BillingAuditEventType;

    /** Event-specific metadata (JSON stringified) */
    metadata?: string;

    /** User who triggered the event (if applicable) */
    actorUserId?: string;

    /** Cashfree event ID (for webhook events) */
    cashfreeEventId?: string;

    /** Invoice ID (if event relates to an invoice) */
    invoiceId?: string;

    /** IP address (for security audit) */
    ipAddress?: string;
};

// ===============================
// DTO Types for API
// ===============================

/**
 * SetupBillingDto - Create billing account (wallet-only)
 */
export type SetupBillingDto = {
    /** Account type */
    type: BillingAccountType;

    /** User ID (for PERSONAL) */
    userId?: string;

    /** Organization ID (for ORG) */
    organizationId?: string;

    /** Email for billing notifications */
    billingEmail: string;

    /** Contact name */
    contactName: string;

    /** Contact phone (optional) */
    contactPhone?: string;
};

// ===============================
// Response Types
// ===============================

/**
 * BillingAccountResponse - API response for billing account
 */
export type BillingAccountResponse = {
    account: BillingAccount;
    walletBalance: number;
    nextBillingDate: string;
    estimatedAmount: number;
    currency: string;
    daysUntilSuspension?: number;
};

/**
 * CashfreeCheckoutOptions - Options for frontend Cashfree Checkout (one-time top-up)
 */
export type CashfreeCheckoutOptions = {
    paymentSessionId: string;
    orderId: string;
    amount: number;
    currency: string;
    redirectTarget?: "_modal" | "_self" | "_blank";
};

// ===============================
// Webhook Types
// ===============================

/**
 * CashfreeWebhookEvent - Structure of Cashfree webhook payload
 */
export type CashfreeWebhookEvent = {
    type: "PAYMENT_SUCCESS_WEBHOOK" | "PAYMENT_FAILED_WEBHOOK" | "PAYMENT_USER_DROPPED_WEBHOOK"
        | "REFUND_SUCCESS_WEBHOOK" | "REFUND_FAILED_WEBHOOK";
    event_time: string;
    data: {
        order: {
            order_id: string;
            order_amount: number;
            order_currency: string;
            order_tags?: Record<string, string>;
        };
        payment?: CashfreePaymentEntity;
        refund?: CashfreeRefundEntity;
    };
};

export type CashfreePaymentEntity = {
    cf_payment_id: string;
    payment_status: "SUCCESS" | "FAILED" | "USER_DROPPED" | "PENDING";
    payment_amount: number;       // in rupees
    payment_currency: string;
    payment_method: Record<string, unknown>;
    payment_message?: string;
    order_tags?: Record<string, string>;
};

export type CashfreeRefundEntity = {
    refund_id: string;
    cf_payment_id: string;
    refund_amount: number;        // in rupees
    refund_status: "SUCCESS" | "FAILED" | "PENDING";
    order_tags?: Record<string, string>;
};

// ===============================
// Constants
// ===============================

/** Grace period duration in days */
export const GRACE_PERIOD_DAYS = 14;

/** Reminder email schedule (days after insufficient balance) */
export const REMINDER_SCHEDULE_DAYS = [1, 7, 13];

/** Supported currencies */
export const SUPPORTED_CURRENCIES = ["INR", "USD"] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];
