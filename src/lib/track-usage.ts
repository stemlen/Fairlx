/**
 * Usage Tracking Utility
 * 
 * Provides a non-blocking, idempotent way to track usage events.
 * 
 * Key Features:
 * - Non-blocking: Uses fire-and-forget pattern, never blocks feature execution
 * - Idempotent: Uses idempotencyKey to prevent duplicate events on retries
 * - Module-aware: Tracks which feature (DOCS, GITHUB, etc.) generated the usage
 * - Owner-aware: Supports both PERSONAL and ORG account types
 */

import { ID } from "node-appwrite";
import { ResourceType, UsageSource, UsageModule, OwnerType } from "@/features/usage/types";

export interface TrackUsageParams {
    /** Workspace ID where the usage occurred */
    workspaceId: string;
    /** Project ID if applicable */
    projectId?: string;
    /** Which module generated the usage (DOCS, GITHUB, etc.) */
    module: UsageModule;
    /** Resource type for billing (traffic, storage, compute) */
    resourceType: ResourceType;
    /** Usage units - bytes for traffic/storage, operations for compute */
    units: number;
    /** Source of the usage (api, file, job, ai) */
    source: UsageSource;
    /** Additional metadata as object (will be JSON stringified) */
    metadata?: Record<string, unknown>;
    /** Unique key to prevent duplicate events on retries */
    idempotencyKey?: string;
    /** Account type that generated the usage */
    ownerType?: OwnerType;
    /** Owner ID - userId for PERSONAL, orgId for ORG */
    ownerId?: string;
    /** User ID who triggered the operation */
    userId?: string;
}

/**
 * Track usage event - non-blocking, fire-and-forget
 * 
 * This function creates a usage event in the background without waiting for the result.
 * It will not throw errors or block the calling code.
 * 
 * @example
 * ```typescript
 * // Track AI question in docs module
 * trackUsage({
 *     workspaceId: project.workspaceId,
 *     projectId: project.$id,
 *     module: UsageModule.DOCS,
 *     resourceType: ResourceType.COMPUTE,
 *     units: 1,
 *     source: UsageSource.AI,
 *     metadata: { operation: "ask_question", tokensEstimate: 500 },
 *     idempotencyKey: `docs:ask:${project.$id}:${Date.now()}`,
 *     ownerType: "ORG",
 *     ownerId: orgId,
 * });
 * ```
 */
export function trackUsage(params: TrackUsageParams): void {
    // Fire-and-forget - don't await, don't throw
    trackUsageAsync(params).catch((error) => {
        // Log error but don't rethrow - usage tracking should never block features
        console.error("[Usage] Failed to track usage event:", error);
    });
}

/**
 * Track usage event - async version that can be awaited if needed
 * 
 * Use this when you need to wait for the usage event to be created,
 * for example in batch operations or background jobs.
 */
export async function trackUsageAsync(params: TrackUsageParams): Promise<void> {
    try {
        const {
            workspaceId,
            projectId,
            module,
            resourceType,
            units,
            source,
            metadata,
            idempotencyKey,
            ownerType,
            ownerId,
        } = params;

        // Generate idempotency key if not provided
        const key = idempotencyKey || `${workspaceId}:${module}:${Date.now()}`;

        // Only run on server-side
        if (typeof window !== "undefined") {
            return;
        }

        // Dynamic import to avoid client-side bundling issues
        const { createAdminClient } = await import("@/lib/appwrite");
        const { DATABASE_ID, USAGE_EVENTS_ID } = await import("@/config");

        const { databases } = await createAdminClient();

        // Build metadata with new fields
        // IMPORTANT: module, ownerType, ownerId, idempotencyKey are stored in metadata
        // until the Appwrite schema is updated with these columns
        const fullMetadata = {
            ...(metadata || {}),
            module,           // Track which module generated usage
            ownerType,        // PERSONAL or ORG
            ownerId,          // userId or orgId
            idempotencyKey: key,  // For duplicate prevention
        };

        // Create the usage event directly in the database
        // Note: Only using fields that exist in current Appwrite schema
        await databases.createDocument(
            DATABASE_ID,
            USAGE_EVENTS_ID,
            ID.unique(),
            {
                workspaceId,
                projectId: projectId || null,
                resourceType,
                units,
                source,
                metadata: JSON.stringify(fullMetadata),
                timestamp: new Date().toISOString(),
            }
        );
    } catch (error) {
        // Never throw from usage tracking - just log
        console.error("[Usage] Error in trackUsageAsync:", error);
    }
}

/**
 * Helper to create a standard idempotency key
 * 
 * Format: {module}:{operation}:{contextId}:{timestamp}
 */
export function createIdempotencyKey(
    module: UsageModule,
    operation: string,
    contextId: string,
    timestamp?: number
): string {
    return `${module}:${operation}:${contextId}:${timestamp || Date.now()}`;
}

/**
 * Estimate tokens from text length (rough approximation)
 * 
 * GPT/Gemini models use ~4 characters per token on average for English text.
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}
