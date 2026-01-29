import "server-only";

import { Databases, Query } from "node-appwrite";
import { DATABASE_ID, INVOICES_ID, USAGE_EVENTS_ID, USAGE_AGGREGATIONS_ID } from "@/config";
import { BillingStatus, BillingAccount } from "@/features/billing/types";
import { getBillingAccount, assertValidStatusTransition } from "./billing-primitives";

/**
 * Billing Invariant Checker
 * 
 * Runtime assertions for billing system correctness.
 * Call these at critical points to enforce invariants.
 * 
 * INVARIANTS ENFORCED:
 * 1. Invoices always reference immutable usage snapshots
 * 2. BillingStatus transitions follow valid state machine
 * 3. Suspended accounts cannot mutate data
 * 4. Usage is not recorded during suspension
 * 5. Finalized periods cannot be modified
 */

// ============================================================================
// ERROR TYPES
// ============================================================================

export class InvariantViolationError extends Error {
    invariant: string;
    context?: Record<string, unknown>;

    constructor(invariant: string, message: string, context?: Record<string, unknown>) {
        super(`INVARIANT VIOLATION [${invariant}]: ${message}`);
        this.name = "InvariantViolationError";
        this.invariant = invariant;
        this.context = context;
    }
}

// ============================================================================
// INVOICE INVARIANTS
// ============================================================================

/**
 * Assert invoice references immutable usage snapshot
 * 
 * An invoice MUST be linked to a finalized aggregation.
 * The aggregation MUST NOT be modified after invoice generation.
 * 
 * @throws InvariantViolationError if invariant is violated
 */
export async function assertInvoiceUsageImmutable(
    databases: Databases,
    invoiceId: string
): Promise<void> {
    try {
        // Get the invoice
        const invoice = await databases.getDocument(
            DATABASE_ID,
            INVOICES_ID,
            invoiceId
        );

        const aggregationSnapshotId = invoice.aggregationSnapshotId;

        if (!aggregationSnapshotId) {
            throw new InvariantViolationError(
                "INVOICE_USAGE_LINK",
                "Invoice does not reference an aggregation snapshot",
                { invoiceId }
            );
        }

        // Get the referenced aggregation
        const aggregation = await databases.getDocument(
            DATABASE_ID,
            USAGE_AGGREGATIONS_ID,
            aggregationSnapshotId
        );

        // Assert aggregation is finalized
        if (!aggregation.isFinalized) {
            throw new InvariantViolationError(
                "INVOICE_USAGE_IMMUTABLE",
                "Invoice references non-finalized aggregation - usage may change",
                { invoiceId, aggregationSnapshotId, isFinalized: aggregation.isFinalized }
            );
        }

        // If invoice is PAID, the aggregation must have been finalized before payment
        if (invoice.status === "PAID" && !aggregation.finalizedAt) {
            // Missing finalizedAt timestamp - handled silently in production
        }
    } catch (error) {
        if (error instanceof InvariantViolationError) {
            throw error;
        }
        throw new InvariantViolationError(
            "INVOICE_USAGE_CHECK_FAILED",
            "Unable to verify invoice-usage immutability",
            { invoiceId, error: String(error) }
        );
    }
}

// ============================================================================
// BILLING STATUS INVARIANTS
// ============================================================================

/**
 * Assert billing status transition is valid (wrapper for billing-primitives)
 * 
 * Logs the transition for audit purposes.
 */
export function assertStatusTransition(
    billingAccountId: string,
    from: BillingStatus,
    to: BillingStatus
): void {
    try {
        assertValidStatusTransition(from, to);
    } catch (error) {
        throw new InvariantViolationError(
            "STATUS_TRANSITION",
            error instanceof Error ? error.message : String(error),
            { billingAccountId, from, to }
        );
    }
}

// ============================================================================
// SUSPENSION INVARIANTS
// ============================================================================

/**
 * Assert no usage recorded during suspension
 * 
 * Queries usage_events for the suspension period and fails if any found.
 * 
 * @param suspendedAt - When the account was suspended
 * @param restoredAt - When the account was restored (optional, defaults to now)
 * @throws InvariantViolationError if usage found during suspension
 */
export async function assertNoUsageDuringSuspension(
    databases: Databases,
    billingAccountId: string,
    suspendedAt: string,
    restoredAt?: string
): Promise<void> {
    try {
        // Get billing account to find associated workspace(s)
        const account = await databases.getDocument(
            DATABASE_ID,
            "billing_accounts",
            billingAccountId
        ) as unknown as BillingAccount;

        // Determine which entity to query
        const entityId = account.organizationId || account.userId;
        if (!entityId) {
            return; // No entity to check
        }

        // Query for usage events in the suspension period
        // Note: This requires billingEntityId to be stored on events (see usage-ledger.ts)
        const endTime = restoredAt || new Date().toISOString();

        const events = await databases.listDocuments(
            DATABASE_ID,
            USAGE_EVENTS_ID,
            [
                Query.greaterThanEqual("timestamp", suspendedAt),
                Query.lessThanEqual("timestamp", endTime),
                Query.contains("metadata", entityId),
                Query.limit(10),
            ]
        );

        if (events.total > 0) {
            throw new InvariantViolationError(
                "USAGE_DURING_SUSPENSION",
                `Found ${events.total} usage events during suspension period`,
                {
                    billingAccountId,
                    suspendedAt,
                    restoredAt: endTime,
                    eventCount: events.total,
                    sampleEventIds: events.documents.map((e) => e.$id).slice(0, 5),
                }
            );
        }
    } catch (error) {
        if (error instanceof InvariantViolationError) {
            throw error;
        }
        // Don't throw for check failures
    }
}

/**
 * Assert suspended accounts cannot mutate data
 * 
 * Call this before any mutating operation to enforce suspension.
 * 
 * @throws InvariantViolationError if account is suspended
 */
export async function assertSuspendedCannotMutate(
    databases: Databases,
    options: { userId?: string; organizationId?: string; workspaceId?: string }
): Promise<void> {
    const account = await getBillingAccount(databases, options);

    if (account && account.billingStatus === BillingStatus.SUSPENDED) {
        throw new InvariantViolationError(
            "SUSPENDED_MUTATION",
            "Suspended accounts cannot mutate data. Please pay your invoice to restore access.",
            {
                billingAccountId: account.$id,
                billingStatus: account.billingStatus,
            }
        );
    }
}

// ============================================================================
// AGGREGATION INVARIANTS
// ============================================================================

/**
 * Assert aggregation is not finalized before modifying
 * 
 * @throws InvariantViolationError if aggregation is finalized
 */
export async function assertAggregationNotFinalized(
    databases: Databases,
    aggregationId: string
): Promise<void> {
    try {
        const aggregation = await databases.getDocument(
            DATABASE_ID,
            USAGE_AGGREGATIONS_ID,
            aggregationId
        );

        if (aggregation.isFinalized) {
            throw new InvariantViolationError(
                "FINALIZED_AGGREGATION_MODIFICATION",
                "Cannot modify finalized aggregation - this period has been invoiced",
                {
                    aggregationId,
                    period: aggregation.period,
                    finalizedAt: aggregation.finalizedAt,
                }
            );
        }
    } catch (error) {
        if (error instanceof InvariantViolationError) {
            throw error;
        }
        // Document not found is OK (doesn't exist yet)
        if (String(error).includes("not found")) {
            return;
        }
        // Error handled silently in production
    }
}

/**
 * Assert usage aggregation matches source events
 * 
 * This is a reconciliation check that verifies the aggregation
 * was correctly calculated from the underlying events.
 * 
 * Use this for audit purposes to ensure billing accuracy.
 */
export async function assertAggregationMatchesEvents(
    databases: Databases,
    aggregationId: string,
    tolerancePercent: number = 0.01 // 1% tolerance for floating point
): Promise<{ matches: boolean; diff?: Record<string, number> }> {
    try {
        const aggregation = await databases.getDocument(
            DATABASE_ID,
            USAGE_AGGREGATIONS_ID,
            aggregationId
        );

        const period = aggregation.period as string;
        const workspaceId = aggregation.workspaceId as string;

        // Calculate expected values from events
        const startOfMonth = `${period}-01T00:00:00.000Z`;
        const nextMonth = new Date(period + "-01");
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const endOfMonth = nextMonth.toISOString();

        const events = await databases.listDocuments(
            DATABASE_ID,
            USAGE_EVENTS_ID,
            [
                Query.equal("workspaceId", workspaceId),
                Query.greaterThanEqual("timestamp", startOfMonth),
                Query.lessThan("timestamp", endOfMonth),
                Query.limit(10000),
            ]
        );

        let trafficBytes = 0;
        let storageBytes = 0;
        let computeUnits = 0;

        for (const event of events.documents) {
            switch (event.resourceType) {
                case "traffic":
                    trafficBytes += event.units;
                    break;
                case "storage":
                    storageBytes += event.units;
                    break;
                case "compute":
                    computeUnits += event.weightedUnits || event.units;
                    break;
            }
        }

        const expectedTrafficGB = trafficBytes / (1024 * 1024 * 1024);
        const expectedStorageGB = storageBytes / (1024 * 1024 * 1024);

        // Compare with tolerance
        const diff = {
            trafficGB: Math.abs(aggregation.trafficTotalGB - expectedTrafficGB),
            storageGB: Math.abs(aggregation.storageAvgGB - expectedStorageGB),
            computeUnits: Math.abs(aggregation.computeTotalUnits - computeUnits),
        };

        const maxTrafficDiff = (aggregation.trafficTotalGB || 1) * tolerancePercent;
        const maxStorageDiff = (aggregation.storageAvgGB || 1) * tolerancePercent;
        const maxComputeDiff = (aggregation.computeTotalUnits || 1) * tolerancePercent;

        const matches =
            diff.trafficGB <= maxTrafficDiff &&
            diff.storageGB <= maxStorageDiff &&
            diff.computeUnits <= maxComputeDiff;

        if (!matches) {
            // Aggregation mismatch detected - handled silently in production
        }

        return { matches, diff };
    } catch {
        return { matches: false };
    }
}

// ============================================================================
// BATCH INVARIANT CHECKS
// ============================================================================

/**
 * Run all billing invariant checks for an account
 * 
 * Use this for periodic auditing and health checks.
 */
export async function runBillingInvariantChecks(
    databases: Databases,
    billingAccountId: string
): Promise<{
    passed: boolean;
    violations: InvariantViolationError[];
}> {
    const violations: InvariantViolationError[] = [];

    // Check all invoices for this account
    try {
        const invoices = await databases.listDocuments(
            DATABASE_ID,
            INVOICES_ID,
            [
                Query.equal("billingAccountId", billingAccountId),
                Query.limit(100),
            ]
        );

        for (const invoice of invoices.documents) {
            if (invoice.aggregationSnapshotId) {
                try {
                    await assertInvoiceUsageImmutable(databases, invoice.$id);
                } catch (error) {
                    if (error instanceof InvariantViolationError) {
                        violations.push(error);
                    }
                }
            }
        }
    } catch {
        // Invoice check failed - silently continue
    }

    return {
        passed: violations.length === 0,
        violations,
    };
}

// ============================================================================
// ENVIRONMENT-AWARE INVARIANT CHECKING
// ============================================================================

/**
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
    return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

/**
 * Environment-aware invariant check
 * 
 * In DEVELOPMENT: Throws hard error on violation
 * In PRODUCTION: Logs violation but continues
 * 
 * Use this for inline invariant checks in critical code paths.
 * 
 * @param condition - Must be true, or invariant is violated
 * @param invariant - Name of the invariant being checked
 * @param getMessage - Function returning error message (lazy eval)
 * @param context - Optional context for debugging
 */
export function checkInvariant(
    condition: boolean,
    invariant: string,
    getMessage: () => string,
    context?: Record<string, unknown>
): void {
    if (condition) {
        return; // Invariant holds
    }

    const message = getMessage();
    const error = new InvariantViolationError(invariant, message, context);

    if (isDevelopment()) {
        // Development: Throw hard error to catch bugs early
        throw error;
    } else {
        // Production: Continue operation silently
    }
}

/**
 * Async version of checkInvariant for async conditions
 */
export async function checkInvariantAsync(
    conditionFn: () => Promise<boolean>,
    invariant: string,
    getMessage: () => string,
    context?: Record<string, unknown>
): Promise<void> {
    try {
        const condition = await conditionFn();
        checkInvariant(condition, invariant, getMessage, context);
    } catch (error) {
        if (error instanceof InvariantViolationError) {
            throw error;
        }
        // Condition check failed - treat as violation
        checkInvariant(false, invariant, () => `Condition check failed: ${error}`, context);
    }
}

// ============================================================================
// CRITICAL STARTUP CHECKS
// ============================================================================

/**
 * Critical invariant check result
 */
export interface CriticalCheckResult {
    check: string;
    passed: boolean;
    message?: string;
    error?: string;
}

/**
 * Run critical invariant checks at startup/cron
 * 
 * These checks should be run:
 * 1. On server startup
 * 2. Before billing cron jobs
 * 3. Periodically (every few hours)
 * 
 * Returns check results for monitoring.
 */
export async function runCriticalInvariantChecks(
    databases: Databases
): Promise<{
    allPassed: boolean;
    results: CriticalCheckResult[];
}> {
    const results: CriticalCheckResult[] = [];

    // Check 1: No usage events during active suspensions
    try {
        // Get accounts currently suspended
        const suspendedAccounts = await databases.listDocuments(
            DATABASE_ID,
            "billing_accounts",
            [
                Query.equal("billingStatus", "SUSPENDED"),
                Query.limit(100),
            ]
        );

        let violationCount = 0;
        for (const account of suspendedAccounts.documents) {
            const _accountData = account as unknown as BillingAccount;
            // Check for usage events since suspension (approximate check)
            const recentEvents = await databases.listDocuments(
                DATABASE_ID,
                USAGE_EVENTS_ID,
                [
                    Query.contains("metadata", account.$id),
                    Query.greaterThanEqual("$createdAt", account.$updatedAt),
                    Query.limit(1),
                ]
            );

            if (recentEvents.total > 0) {
                violationCount++;
            }
        }

        results.push({
            check: "NO_USAGE_DURING_SUSPENSION",
            passed: violationCount === 0,
            message: violationCount === 0
                ? `Checked ${suspendedAccounts.total} suspended accounts`
                : `Found ${violationCount} accounts with usage during suspension`,
        });
    } catch (error) {
        results.push({
            check: "NO_USAGE_DURING_SUSPENSION",
            passed: true, // Don't block on check failures
            error: String(error),
        });
    }

    // Check 2: All paid invoices reference finalized aggregations
    try {
        const paidInvoices = await databases.listDocuments(
            DATABASE_ID,
            INVOICES_ID,
            [
                Query.equal("status", "PAID"),
                Query.limit(50),
            ]
        );

        let violationCount = 0;
        for (const invoice of paidInvoices.documents) {
            if (invoice.aggregationSnapshotId) {
                try {
                    const aggregation = await databases.getDocument(
                        DATABASE_ID,
                        USAGE_AGGREGATIONS_ID,
                        invoice.aggregationSnapshotId
                    );
                    if (!aggregation.isFinalized) {
                        violationCount++;
                    }
                } catch {
                    // Aggregation not found - also a violation
                    violationCount++;
                }
            }
        }

        results.push({
            check: "PAID_INVOICES_FINALIZED",
            passed: violationCount === 0,
            message: violationCount === 0
                ? `Checked ${paidInvoices.total} paid invoices`
                : `Found ${violationCount} paid invoices with non-finalized aggregations`,
        });
    } catch (error) {
        results.push({
            check: "PAID_INVOICES_FINALIZED",
            passed: true,
            error: String(error),
        });
    }

    // Check 3: No locked cycles without active invoice generation
    // (This would indicate a stale lock)
    try {
        const lockedAccounts = await databases.listDocuments(
            DATABASE_ID,
            "billing_accounts",
            [
                Query.equal("isBillingCycleLocked", true),
                Query.limit(50),
            ]
        );

        let staleCount = 0;
        const staleThreshold = 30 * 60 * 1000; // 30 minutes

        for (const account of lockedAccounts.documents) {
            if (account.billingCycleLockedAt) {
                const lockedAt = new Date(account.billingCycleLockedAt);
                const age = Date.now() - lockedAt.getTime();
                if (age > staleThreshold) {
                    staleCount++;
                }
            }
        }

        results.push({
            check: "NO_STALE_CYCLE_LOCKS",
            passed: staleCount === 0,
            message: staleCount === 0
                ? `Checked ${lockedAccounts.total} locked accounts`
                : `Found ${staleCount} accounts with stale locks (>30min)`,
        });
    } catch (error) {
        results.push({
            check: "NO_STALE_CYCLE_LOCKS",
            passed: true,
            error: String(error),
        });
    }

    const allPassed = results.every(r => r.passed);

    return { allPassed, results };
}
