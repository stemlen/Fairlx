import "server-only";

import { Databases, ID, Query } from "node-appwrite";
import { DATABASE_ID, USAGE_EVENTS_ID } from "@/config";
import { ResourceType, UsageSource, UsageModule, UsageEvent, OwnerType } from "@/features/usage/types";
import { assertBillingNotSuspended, adjustEventForLockedCycle, getBillingAccount } from "./billing-primitives";
import { setIfNotExists, invalidateCache, CK, TTL } from "@/lib/redis";

/**
 * Usage Ledger - Immutable Usage Event Writer
 * 
 * SINGLE SOURCE OF TRUTH for usage event creation.
 * All modules MUST use this to write usage.
 * 
 * INVARIANTS:
 * - Usage events are immutable (write-once, never modify)
 * - Every event has an idempotency key
 * - No other layer may create or modify usage
 * - Suspended accounts cannot record usage
 * - Locked cycles reject late events (they roll to next cycle)
 * 
 * Guarantees:
 * - Idempotency via idempotencyKey
 * - Billing cycle validation
 * - Account suspension check
 * - Atomic writes
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WriteUsageEventParams {
    /** REQUIRED - Unique key for idempotency (no longer optional) */
    idempotencyKey: string;
    /** Workspace where usage occurred */
    workspaceId: string;
    /** Project ID if applicable */
    projectId?: string;
    /** Resource type for billing */
    resourceType: ResourceType;
    /** Usage units - bytes for traffic/storage, operations for compute */
    units: number;
    /** Source of the usage */
    source: UsageSource;
    /** Module that generated the usage */
    module?: UsageModule;
    /** Timestamp of the event (defaults to now) */
    timestamp?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
    /** Account type (PERSONAL or ORG) */
    ownerType?: OwnerType;
    /** Owner ID (userId for PERSONAL, orgId for ORG) */
    ownerId?: string;
    /** Billing entity ID for attribution */
    billingEntityId?: string;
    /** Billing entity type */
    billingEntityType?: "user" | "organization";
    /** Optional compute weighting fields */
    baseUnits?: number;
    weightedUnits?: number;
}

export interface WriteUsageResult {
    written: boolean;
    eventId?: string;
    reason?: "DUPLICATE" | "RACE_DUPLICATE" | "SUSPENDED" | "CYCLE_LOCKED" | "ERROR";
    message?: string;
    adjustedTimestamp?: string;
}

// ============================================================================
// IDEMPOTENCY CHECK
// ============================================================================

/**
 * Find an existing usage event by idempotency key
 * 
 * CRITICAL: This is the first check before any write.
 * Prevents duplicate events on retries.
 */
export async function findByIdempotencyKey(
    databases: Databases,
    idempotencyKey: string
): Promise<UsageEvent | null> {
    try {
        // The idempotency key is stored in metadata JSON
        // We search for it using a contains query on metadata field
        // Note: For better performance, consider adding idempotencyKey as a top-level indexed field
        const events = await databases.listDocuments<UsageEvent>(
            DATABASE_ID,
            USAGE_EVENTS_ID,
            [
                Query.equal("idempotencyKey", idempotencyKey),
                Query.limit(1),
            ]
        );

        if (events.total > 0) {
            return events.documents[0];
        }

        return null;
    } catch {
        return null;
    }
}

// ============================================================================
// CORE WRITE FUNCTION
// ============================================================================

/**
 * Write a usage event to the immutable ledger
 * 
 * This is the ONLY function that should write to usage_events.
 * All other usage tracking modules must delegate to this function.
 * 
 * @returns Result indicating success/failure and reason
 */
export async function writeUsageEvent(
    databases: Databases,
    params: WriteUsageEventParams
): Promise<WriteUsageResult> {
    // Validate idempotency key is provided
    if (!params.idempotencyKey || params.idempotencyKey.trim() === "") {
        return {
            written: false,
            reason: "ERROR",
            message: "idempotencyKey is required for usage events",
        };
    }

    // 1. Check idempotency key FIRST using Redis (fast path - avoids DB query)
    // NOTE: setIfNotExists returns true when Redis is unavailable (fail-open).
    // True duplicates are caught by the DB check below.
    const redisKey = CK.idempotency(params.idempotencyKey);
    const isNew = await setIfNotExists(redisKey, "1", TTL.IDEMPOTENCY);
    if (!isNew) {
        // Key already exists in Redis — confirmed duplicate
        return {
            written: false,
            reason: "DUPLICATE",
            message: "Event with this idempotency key already exists (Redis)",
        };
    }

    // Fallback: Also check DB for events that predate Redis (belt-and-suspenders)
    const existing = await findByIdempotencyKey(databases, params.idempotencyKey);
    if (existing) {
        return {
            written: false,
            eventId: existing.$id,
            reason: "DUPLICATE",
            message: "Event with this idempotency key already exists",
        };
    }

    // 2. Check billing status (no usage during suspension)
    try {
        await assertBillingNotSuspended(databases, { workspaceId: params.workspaceId });
    } catch (error) {
        if (error instanceof Error && error.message.includes("suspended")) {
            // CRITICAL FIX: Clear idempotency key on suspension
            // WHY: If we block usage due to suspension, we must clear the key 
            // so retries work once the suspension is lifted.
            await invalidateCache(redisKey);
            return {
                written: false,
                reason: "SUSPENDED",
                message: "Cannot record usage - account is suspended",
            };
        }
        // Other errors - don't block (fail open for non-suspension errors)
    }

    // 3. Check billing cycle lock and adjust timestamp if needed
    const account = await getBillingAccount(databases, { workspaceId: params.workspaceId });
    const eventTimestamp = params.timestamp || new Date().toISOString();
    const { timestamp: adjustedTimestamp, wasAdjusted, adjustReason } =
        adjustEventForLockedCycle(eventTimestamp, account);

    // 4. Build event data
    const fullMetadata = {
        ...(params.metadata || {}),
        module: params.module,
        ownerType: params.ownerType,
        ownerId: params.ownerId,
        idempotencyKey: params.idempotencyKey,
        billingEntityId: params.billingEntityId,
        billingEntityType: params.billingEntityType,
        ...(wasAdjusted ? {
            originalTimestamp: eventTimestamp,
            timestampAdjusted: true,
            adjustReason,
        } : {}),
    };

    // 5. Resolve billingEntityId if not provided by caller
    // WHY: billing-service.ts filters USAGE_AGGREGATIONS_ID by billingEntityId as a top-level
    // Appwrite indexed field. Without it at the top level, Query.equal() returns 0 results.
    let resolvedBillingEntityId = params.billingEntityId;
    let resolvedBillingEntityType = params.billingEntityType;

    if (!resolvedBillingEntityId) {
        try {
            const { WORKSPACES_ID, ORGANIZATIONS_ID } = await import("@/config");
            const workspace = await databases.getDocument(
                DATABASE_ID,
                WORKSPACES_ID,
                params.workspaceId
            );
            if (workspace.organizationId) {
                const org = await databases.getDocument(
                    DATABASE_ID,
                    ORGANIZATIONS_ID,
                    workspace.organizationId
                );
                const billingStartAt = org.billingStartAt ? new Date(org.billingStartAt) : null;
                const eventDate = new Date(adjustedTimestamp);
                if (billingStartAt && eventDate >= billingStartAt) {
                    resolvedBillingEntityId = workspace.organizationId;
                    resolvedBillingEntityType = "organization";
                } else {
                    resolvedBillingEntityId = workspace.userId;
                    resolvedBillingEntityType = "user";
                }
            } else {
                resolvedBillingEntityId = workspace.userId;
                resolvedBillingEntityType = "user";
            }
        } catch (err) {
            // Non-fatal — leave billing entity unset rather than block the write
            console.warn("[UsageLedger] Could not resolve billing entity:", err);
        }
    }

    // 6. Atomic write with unique ID
    try {
        const event = await databases.createDocument<UsageEvent>(
            DATABASE_ID,
            USAGE_EVENTS_ID,
            ID.unique(),
            {
                workspaceId: params.workspaceId,
                projectId: params.projectId || null,
                resourceType: params.resourceType,
                units: params.units,
                baseUnits: params.baseUnits || null,
                weightedUnits: params.weightedUnits || null,
                source: params.source,
                module: params.module || null,
                billingEntityId: resolvedBillingEntityId || null,
                billingEntityType: resolvedBillingEntityType || null,
                idempotencyKey: params.idempotencyKey,
                metadata: JSON.stringify(fullMetadata),
                timestamp: adjustedTimestamp,
            }
        );

        // INSTANT DEDUCTION (Approved Requirement)
        // WHY: Wallet balance should drop as soon as usage occurs.
        // We defer this call to avoid blocking the main API response, but it runs
        // immediately in the background execution context.
        //
        // AI events carry pre-calculated costUSD in metadata (model-aware pricing).
        // Non-AI events continue using the flat-rate calculator.
        if (resolvedBillingEntityId) {
            setImmediate(async () => {
                try {
                    let costUSD: number;

                    // Check if metadata contains a pre-calculated costUSD (set by logAIUsage)
                    const metadataCostUSD = params.metadata?.costUSD;
                    if (typeof metadataCostUSD === "number" && metadataCostUSD > 0) {
                        // AI events: use model-aware pricing from metadata
                        costUSD = metadataCostUSD;
                    } else {
                        // Non-AI events: use flat-rate calculator
                        const { calculateEventCostUSD } = await import("@/lib/billing/pricing");
                        costUSD = calculateEventCostUSD(
                            params.resourceType,
                            params.units,
                            params.weightedUnits
                        );
                    }

                    if (costUSD > 0) {
                        const { getOrCreateWallet, deductFromWallet } = await import("@/features/wallet/services/wallet-service");
                        const wallet = await getOrCreateWallet(databases, {
                            userId: resolvedBillingEntityType === "user" ? resolvedBillingEntityId : undefined,
                            organizationId: resolvedBillingEntityType === "organization" ? resolvedBillingEntityId : undefined,
                        });

                        await deductFromWallet(databases, wallet.$id, costUSD, {
                            referenceId: event.$id,
                            idempotencyKey: `deduct:${params.idempotencyKey}`,
                            description: `Instant Charge: ${params.resourceType.toUpperCase()}${params.metadata?.model ? ` (${params.metadata.model})` : ""}`,
                            skipRateLimit: true,
                        });
                    }
                } catch (err) {
                    console.error("[UsageLedger] Instant deduction failed:", err);
                    // Non-fatal: Daily aggregation cron will catch any missed deductions
                    // to ensure eventual consistency if the instant deduction fails.
                }
            });
        }

        return {
            written: true,
            eventId: event.$id,
            ...(wasAdjusted ? { adjustedTimestamp } : {}),
        };
    } catch (error) {
        // Handle duplicate key error (race condition protection)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("duplicate") || errorMessage.includes("unique")) {
            return {
                written: false,
                reason: "RACE_DUPLICATE",
                message: "Concurrent write detected - event may already exist",
            };
        }

        console.error("[UsageLedger] Failed to write usage event:", error);
        
        // CRITICAL FIX: Clear idempotency key on failure
        // WHY: If DB write fails, we MUST allow retries. Leaving the key in Redis
        // would block all future attempts for this operation.
        await invalidateCache(redisKey);
        return {
            written: false,
            reason: "ERROR",
            message: error instanceof Error ? error.message : "Unknown database error",
        };
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a standard idempotency key
 * 
 * Format: {module}:{operation}:{contextId}:{timestamp}
 * 
 * Example: "docs:ask:project123:1704067200000"
 */
export function generateIdempotencyKey(
    module: string,
    operation: string,
    contextId: string,
    timestamp?: number
): string {
    return `${module}:${operation}:${contextId}:${timestamp || Date.now()}`;
}

/**
 * Generate idempotency key for traffic metering
 * 
 * Uses request-specific identifiers to prevent duplicate traffic logging.
 */
export function generateTrafficIdempotencyKey(
    workspaceId: string,
    endpoint: string,
    method: string,
    requestId?: string
): string {
    const id = requestId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return `traffic:${method}:${workspaceId}:${endpoint}:${id}`;
}

/**
 * Generate idempotency key for compute operations
 */
export function generateComputeIdempotencyKey(
    workspaceId: string,
    jobType: string,
    operationId: string
): string {
    return `compute:${jobType}:${workspaceId}:${operationId}:${Date.now()}`;
}

/**
 * Generate idempotency key for storage operations
 */
export function generateStorageIdempotencyKey(
    workspaceId: string,
    operation: "upload" | "download" | "delete",
    fileId: string
): string {
    return `storage:${operation}:${workspaceId}:${fileId}:${Date.now()}`;
}

// ============================================================================
// ASSERTION FUNCTIONS
// ============================================================================

/**
 * Assert usage events are immutable
 * 
 * This is a documentation function that enforces the invariant
 * that usage_events should NEVER be updated or deleted.
 * 
 * CRITICAL: There is NO updateUsageEvent function.
 * There is NO deleteUsageEvent function.
 * Usage events are WRITE-ONCE.
 */
export function assertUsageImmutable(): void {
    // This function exists to document and enforce the invariant.
    // If you're looking for a way to modify usage events, you're doing it wrong.
    // 
    // NEVER:
    // - databases.updateDocument(DATABASE_ID, USAGE_EVENTS_ID, ...)
    // - databases.deleteDocument(DATABASE_ID, USAGE_EVENTS_ID, ...)
    //
    // If usage was recorded incorrectly:
    // 1. Create a compensating event with negative units (if applicable)
    // 2. Or handle it at the aggregation/invoice layer
    // 3. Document it in the billing audit log
}
