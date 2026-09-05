import "server-only";

import { Databases } from "node-appwrite";
import { ResourceType, UsageSource, UsageEventMetadata } from "@/features/usage/types";

/**
 * Centralized Usage Metering Service
 * 
 * This service provides methods to log usage events that will be used for billing.
 * All methods are designed to be called from server-side code only.
 * 
 * Usage events are immutable and auditable.
 */

export interface LogUsageOptions {
    databases: Databases;
    workspaceId: string;
    projectId?: string;
    units: number;
    metadata?: UsageEventMetadata;
    /**
     * ID of the billing entity (user ID or organization ID)
     * WHY: Enables correct billing attribution during PERSONAL→ORG conversion.
     * Events before conversion.billingStartAt bill to user, after to org.
     */
    billingEntityId?: string;
    /**
     * Type of billing entity for explicit scope
     */
    billingEntityType?: 'user' | 'organization';
    // Source context for display in usage events
    sourceContext?: {
        type: 'project' | 'workspace' | 'admin' | 'other';
        projectName?: string;
        workspaceName?: string;
        displayName?: string; // e.g., "Project XYZ" or "Admin Panel"
    };
}

/**
 * Log traffic usage (API requests, file transfers, webhooks, etc.)
 * 
 * PRODUCTION HARDENING: Delegates to usage-ledger.ts for:
 * - Idempotency enforcement
 * - Billing cycle validation
 * - Suspension checks
 */
export async function logTrafficUsage(
    options: LogUsageOptions & {
        source: UsageSource;
    }
): Promise<void> {
    try {
        const { writeUsageEvent, generateTrafficIdempotencyKey } = await import("./usage-ledger");

        // Generate idempotency key for traffic
        const idempotencyKey = generateTrafficIdempotencyKey(
            options.workspaceId,
            (options.metadata?.endpoint as string) || "unknown",
            (options.metadata?.method as string) || "GET"
        );

        await writeUsageEvent(options.databases, {
            idempotencyKey,
            workspaceId: options.workspaceId,
            projectId: options.projectId,
            resourceType: ResourceType.TRAFFIC,
            units: options.units,
            source: options.source,
            billingEntityId: options.billingEntityId,
            billingEntityType: options.billingEntityType,
            metadata: {
                ...options.metadata,
                sourceContext: options.sourceContext ?? {
                    type: options.projectId ? 'project' : 'workspace',
                    displayName: 'Unknown',
                },
            },
        });
    } catch (err) {
        console.error("[UsageMetering] logTrafficUsage failed:", {
            workspaceId: options.workspaceId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Log storage usage (file uploads, downloads, deletions)
 * 
 * PRODUCTION HARDENING: Delegates to usage-ledger.ts
 */
export async function logStorageUsage(
    options: LogUsageOptions & {
        operation: "upload" | "download" | "delete";
        fileId?: string;
    }
): Promise<void> {
    try {
        const { writeUsageEvent, generateStorageIdempotencyKey } = await import("./usage-ledger");

        // Generate idempotency key for storage
        const idempotencyKey = generateStorageIdempotencyKey(
            options.workspaceId,
            options.operation,
            options.fileId || `${Date.now()}`
        );

        await writeUsageEvent(options.databases, {
            idempotencyKey,
            workspaceId: options.workspaceId,
            projectId: options.projectId,
            resourceType: ResourceType.STORAGE,
            units: options.units,
            source: UsageSource.FILE,
            billingEntityId: options.billingEntityId,
            billingEntityType: options.billingEntityType,
            metadata: {
                ...options.metadata,
                operation: options.operation,
                sourceContext: options.sourceContext ?? {
                    type: options.projectId ? 'project' : 'workspace',
                    displayName: 'Unknown',
                },
            },
        });
    } catch (err) {
        console.error("[UsageMetering] logStorageUsage failed:", {
            workspaceId: options.workspaceId,
            operation: options.operation,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Log compute usage (background jobs, automations, etc.)
 * 
 * WHY: Compute operations have different costs based on complexity.
 * AI operations cost more than simple CRUD. We store both raw and
 * weighted units to enable accurate billing while maintaining audit trail.
 * 
 * PRODUCTION HARDENING: Delegates to usage-ledger.ts for:
 * - Idempotency enforcement
 * - Billing cycle validation
 * - Suspension checks
 * 
 * Uses setTimeout to defer metering and avoid blocking main operations.
 */

export async function logComputeUsage(
    options: LogUsageOptions & {
        jobType: string;
        isAI?: boolean;
        operationId?: string; // Optional unique ID for idempotency
    }
): Promise<void> {
    // Defer the metering call to avoid blocking main operations
    // This prevents connection pool exhaustion during high-frequency updates.
    // Using setImmediate for better serverless execution lifecycle compatibility.
    setImmediate(async () => {
        try {
            const { writeUsageEvent, generateComputeIdempotencyKey } = await import("./usage-ledger");

            // Calculate weighted units based on job type
            const baseUnits = options.units;
            const weight = getComputeUnits(options.jobType);
            const weightedUnits = baseUnits * weight;

            // Generate idempotency key
            const idempotencyKey = options.operationId
                ? `compute:${options.jobType}:${options.workspaceId}:${options.operationId}`
                : generateComputeIdempotencyKey(options.workspaceId, options.jobType, `${Date.now()}`);

            await writeUsageEvent(options.databases, {
                idempotencyKey,
                workspaceId: options.workspaceId,
                projectId: options.projectId,
                resourceType: ResourceType.COMPUTE,
                units: weightedUnits,
                source: options.isAI ? UsageSource.AI : UsageSource.JOB,
                billingEntityId: options.billingEntityId,
                billingEntityType: options.billingEntityType,
                metadata: {
                    ...options.metadata,
                    jobType: options.jobType,
                    isAI: options.isAI || false,
                    weight: weight,
                    baseUnits: baseUnits,
                    weightedUnits: weightedUnits,
                    sourceContext: options.sourceContext ?? {
                        type: options.projectId ? 'project' : 'workspace',
                        displayName: 'Unknown',
                    },
                },
            });
        } catch (err) {
            console.error("[UsageMetering] logComputeUsage failed:", {
                workspaceId: options.workspaceId,
                jobType: options.jobType,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }); // Immediate background execution
}

/**
 * Log AI-specific compute usage with token-accurate, model-aware billing.
 *
 * The costUSD is pre-calculated by the caller using getAIModelPricing() +
 * calculateAICallCostUSD(). It is passed through metadata so the
 * usage-ledger's existing instant deduction path uses the model-aware price
 * instead of the flat compute-unit rate.
 */
export async function logAIUsage(
    options: LogUsageOptions & {
        model: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        costUSD: number;
        cachedTokens?: number;
        operationId?: string;
    }
): Promise<void> {
    try {
        const { writeUsageEvent } = await import("./usage-ledger");
        
        const idempotencyKey = options.operationId
            ? `ai:${options.model}:${options.workspaceId}:${options.operationId}`
            : `ai:${options.model}:${options.workspaceId}:${Date.now()}`;

        await writeUsageEvent(options.databases, {
            idempotencyKey,
            workspaceId: options.workspaceId,
            projectId: options.projectId,
            resourceType: ResourceType.COMPUTE,
            units: options.totalTokens || options.units,
            source: UsageSource.AI,
            billingEntityId: options.billingEntityId,
            billingEntityType: options.billingEntityType,
            metadata: {
                ...options.metadata,
                model: options.model,
                promptTokens: options.promptTokens,
                completionTokens: options.completionTokens,
                cachedTokens: options.cachedTokens ?? options.metadata?.cachedTokens ?? 0,
                totalTokens: options.totalTokens,
                tokensUsed: options.totalTokens, // backward compat
                costUSD: options.costUSD,
                isAI: true,
                aiTier: (options.metadata?.aiTier as string) ?? "standard",
                sourceContext: options.sourceContext ?? {
                    type: options.projectId ? 'project' : 'workspace',
                    displayName: 'AI Call',
                },
            },
        });
    } catch (err) {
        // Non-blocking: AI experience must not be interrupted by billing errors
        console.error("[UsageMetering] logAIUsage failed:", {
            workspaceId: options.workspaceId,
            model: options.model,
            costUSD: options.costUSD,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Calculate request/response size in bytes
 */
export function calculatePayloadSize(payload: unknown): number {
    if (!payload) return 0;
    try {
        return new Blob([JSON.stringify(payload)]).size;
    } catch {
        return 0;
    }
}

/**
 * Compute unit weights for different job types
 * 
 * WHY: Different operations have different computational costs.
 * AI operations cost more than simple CRUD. This ensures fair billing.
 * 
 * CRITICAL: Every operation type MUST be listed here.
 * Aggregation MUST use weightedUnits only.
 */
export const COMPUTE_UNIT_WEIGHTS: Record<string, number> = {
    // Read operations (lower weight - still billable)
    task_read: 0.5,
    work_item_read: 0.5,
    project_read: 0.5,
    workspace_read: 0.5,
    sprint_read: 0.5,

    // Task/Work Item operations
    task_create: 1,
    task_update: 1,
    task_delete: 1,
    task_bulk_update: 5,
    work_item_create: 1,
    work_item_update: 1,
    work_item_delete: 1,

    // Sprint operations
    sprint_create: 2,
    sprint_update: 1,
    sprint_delete: 1,
    sprint_complete: 3,

    // Comment operations
    comment_create: 1,
    comment_update: 1,
    comment_delete: 1,

    // Subtask operations
    subtask_create: 1,
    subtask_update: 1,
    subtask_delete: 1,
    subtask_toggle: 0.5,

    // Attachment/Storage operations
    attachment_upload: 2,
    attachment_download: 1,
    attachment_delete: 1,

    // Project operations
    project_create: 2,
    project_update: 1,
    project_delete: 2,

    // Workspace operations
    workspace_create: 3,
    workspace_update: 1,
    member_invite: 1,
    member_remove: 1,

    // Space operations
    space_create: 2,
    space_update: 1,
    space_delete: 2,
    space_member_add: 1,
    space_member_remove: 1,
    space_member_update: 1,

    // Automation/workflow
    workflow_transition: 2,
    automation_trigger: 5,
    automation_run: 3,

    // Notification operations
    notification_send: 1,
    notification_batch: 3,

    // AI operations (higher weights - compute intensive)
    ai_summary: 10,
    ai_code_review: 20,
    ai_doc_generation: 15,
    ai_suggestion: 5,

    // Background jobs
    aggregation: 3,
    sync: 5,
    export: 10,
    import: 15,
    snapshot: 2,
    alert_evaluation: 2,

    // Cache/revalidation (still billable)
    cache_rebuild: 1,
    revalidation: 0.5,

    // Default for unspecified operations
    default: 1,
};

/**
 * Get compute units for a job type
 */
export function getComputeUnits(jobType: string): number {
    return COMPUTE_UNIT_WEIGHTS[jobType] || COMPUTE_UNIT_WEIGHTS.default;
}
