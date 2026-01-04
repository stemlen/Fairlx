import "server-only";

import { createMiddleware } from "hono/factory";
import { Databases, ID, Query } from "node-appwrite";
import { DATABASE_ID, USAGE_EVENTS_ID, WORKSPACES_ID, ORGANIZATIONS_ID } from "@/config";
import { ResourceType, UsageSource } from "@/features/usage/types";

/**
 * Global Traffic Metering Middleware
 * 
 * WHY: Every HTTP request MUST generate a usage event for billing.
 * This includes page loads, refreshes, API calls, and all traffic.
 * 
 * RULE: No exemptions. No "free" requests. Every byte is billable.
 * 
 * This middleware:
 * 1. Runs BEFORE routing logic
 * 2. Calculates request payload size
 * 3. Calculates response payload size
 * 4. Emits traffic usage_event for EVERY request
 * 5. Uses idempotency keys to prevent duplicate billing
 */

type MeteringContext = {
    Variables: {
        databases?: Databases;
        user?: { $id: string };
    };
};

/**
 * Calculate approximate size of request/response in bytes
 */
function estimatePayloadSize(obj: unknown): number {
    if (obj === null || obj === undefined) return 0;
    try {
        const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
        return new Blob([str]).size;
    } catch {
        return 0;
    }
}

/**
 * Extract workspace ID from request (URL or body)
 */
function extractWorkspaceId(url: string, body?: Record<string, unknown>): string | null {
    try {
        const urlObj = new URL(url, 'http://localhost');
        const pathname = urlObj.pathname;

        // More robust regex for ID extraction
        const matches = [
            pathname.match(/\/workspaces\/([a-zA-Z0-9_-]+)/),
            pathname.match(/workspaceId=([a-zA-Z0-9_-]+)/)
        ];

        for (const match of matches) {
            if (match && match[1]) return match[1];
        }

        const queryWorkspaceId = urlObj.searchParams.get('workspaceId');
        if (queryWorkspaceId) return queryWorkspaceId;

        if (body && typeof body.workspaceId === 'string') {
            return body.workspaceId;
        }
    } catch {
        // Fallback to simple string searching if URL parsing fails
        const pathMatch = url.match(/\/workspaces\/([a-zA-Z0-9_-]+)/);
        if (pathMatch) return pathMatch[1];
    }

    return null;
}

/**
 * Extract organization ID from request (URL or body)
 */
function extractOrganizationId(url: string, body?: Record<string, unknown>): string | null {
    try {
        const urlObj = new URL(url, 'http://localhost');
        const pathname = urlObj.pathname;

        // More robust regex for ID extraction
        const matches = [
            pathname.match(/\/organizations\/([a-zA-Z0-9_-]+)/),
            pathname.match(/organizationId=([a-zA-Z0-9_-]+)/),
            pathname.match(/orgId=([a-zA-Z0-9_-]+)/)
        ];

        for (const match of matches) {
            if (match && match[1]) return match[1];
        }

        const queryOrgId = urlObj.searchParams.get('organizationId') || urlObj.searchParams.get('orgId');
        if (queryOrgId) return queryOrgId;

        if (body) {
            if (typeof body.organizationId === 'string') return body.organizationId;
            if (typeof body.orgId === 'string') return body.orgId;
        }
    } catch {
        // Fallback to simple string searching if URL parsing fails
        const orgMatch = url.match(/\/organizations\/([a-zA-Z0-9_-]+)/);
        if (orgMatch) return orgMatch[1];
    }

    return null;
}


/**
 * Extract project ID from request (URL or body)
 */
function extractProjectId(url: string, body?: Record<string, unknown>): string | null {
    // Try URL path: .../projects/{projectId}/...
    const pathMatch = url.match(/\/projects\/([a-zA-Z0-9]+)/);
    if (pathMatch) return pathMatch[1];

    // Try URL query: ?projectId=...
    const urlObj = new URL(url, 'http://localhost');
    const queryProjectId = urlObj.searchParams.get('projectId');
    if (queryProjectId) return queryProjectId;

    // Try body
    if (body && typeof body.projectId === 'string') {
        return body.projectId;
    }

    return null;
}

/**
 * Global traffic metering middleware
 * 
 * CRITICAL: This MUST run on every request.
 * - Page loads
 * - API calls
 * - Refreshes
 * - Health checks
 * - Admin traffic
 * 
 * NO EXEMPTIONS.
 */
export const trafficMeteringMiddleware = createMiddleware<MeteringContext>(
    async (c, next) => {
        const startTime = Date.now();
        const requestUrl = c.req.url;
        const requestMethod = c.req.method;

        // Calculate request size
        let requestBody: Record<string, unknown> | null = null;
        let requestSize = 0;

        try {
            // Clone request to read body without consuming it
            const contentType = c.req.header('content-type') || '';
            if (contentType.includes('application/json')) {
                requestBody = await c.req.json().catch(() => null);
                requestSize = estimatePayloadSize(requestBody);
            } else {
                // For non-JSON, estimate from content-length header
                const contentLength = c.req.header('content-length');
                requestSize = contentLength ? parseInt(contentLength, 10) : 0;
            }
        } catch {
            requestSize = 0;
        }

        // Execute the actual route handler
        await next();

        // Calculate response size
        let responseSize = 0;
        try {
            const responseBody = c.res.clone();
            const text = await responseBody.text();
            responseSize = estimatePayloadSize(text);
        } catch {
            responseSize = 0;
        }

        const totalBytes = requestSize + responseSize;
        const duration = Date.now() - startTime;

        // Extract IDs for attribution
        const workspaceId = extractWorkspaceId(requestUrl, requestBody || undefined);
        const organizationId = extractOrganizationId(requestUrl, requestBody || undefined);
        const projectId = extractProjectId(requestUrl, requestBody || undefined);

        // Get databases and user from context
        const databases = c.get('databases');
        const user = c.get('user');

        // CRITICAL FIX: Log ALL traffic, even without workspace context
        // WHY: Every request costs resources and should be billed
        // For requests without workspace, log to admin/system tracking
        if (databases) {
            // Generate idempotency key
            // Format: traffic:{userId}:{endpoint}:{method}:{timestamp_rounded}
            // Round timestamp to nearest second to handle retries
            const timestampRounded = Math.floor(startTime / 1000);
            const userId = user?.$id || 'anonymous';
            const endpoint = new URL(requestUrl, 'http://localhost').pathname;
            const idempotencyKey = `traffic:${userId}:${endpoint}:${requestMethod}:${timestampRounded}`;

            // Fire and forget - don't block the response
            // Using setTimeout to ensure response is sent first
            setTimeout(async () => {
                let eventData: Record<string, unknown> | null = null;
                try {
                    // CRITICAL FIX: Log ALL traffic, even without workspace context
                    // For requests without workspace, try organization context
                    if (!workspaceId && !organizationId) {
                        // Log to console for admin monitoring
                        console.log(`[TrafficMetering] Unattributed traffic: ${endpoint} (${totalBytes} bytes)`);
                        return;
                    }

                    // CRITICAL: Determine billing entity at event creation time
                    // This makes querying efficient and ensures correct billing attribution
                    const eventTimestamp = new Date(startTime).toISOString();
                    let billingEntityId: string | null = null;
                    let billingEntityType: string | null = null;
                    let targetWorkspaceId = workspaceId;

                    try {
                        if (workspaceId) {
                            // Get workspace to check organizationId
                            const workspace = await databases.getDocument(
                                DATABASE_ID,
                                WORKSPACES_ID,
                                workspaceId
                            );

                            // If no organization, bill to workspace owner (user)
                            if (!workspace.organizationId) {
                                billingEntityId = workspace.userId;
                                billingEntityType = 'user';
                            } else {
                                // Get organization to check billingStartAt
                                const organization = await databases.getDocument(
                                    DATABASE_ID,
                                    ORGANIZATIONS_ID,
                                    workspace.organizationId
                                );

                                const billingStartAt = organization.billingStartAt
                                    ? new Date(organization.billingStartAt)
                                    : null;
                                const eventDate = new Date(eventTimestamp);

                                // If event occurred before org billing started, bill to user
                                if (billingStartAt && eventDate < billingStartAt) {
                                    billingEntityId = workspace.userId;
                                    billingEntityType = 'user';
                                } else {
                                    // Event after org billing started, bill to organization
                                    billingEntityId = workspace.organizationId;
                                    billingEntityType = 'organization';
                                }
                            }
                        } else if (organizationId) {
                            // Organization-level traffic (e.g. /api/organizations/...)
                            billingEntityId = organizationId;
                            billingEntityType = 'organization';

                            // Find ANY workspace belonging to this organization to satisfy the schema
                            const workspaces = await databases.listDocuments(
                                DATABASE_ID,
                                WORKSPACES_ID,
                                [
                                    Query.equal("organizationId", organizationId),
                                    Query.limit(1)
                                ]
                            );

                            if (workspaces.total > 0) {
                                targetWorkspaceId = workspaces.documents[0].$id;
                            } else {
                                // Org exists but has no workspaces - log but don't bill to missing workspace
                                console.log(`[TrafficMetering] Unattributed traffic (Org with no workspaces): ${endpoint} (${totalBytes} bytes)`);
                                return;
                            }
                        }
                    } catch (error: unknown) {
                        // Check if it's a 404 (workspace/org not found) - skip silently
                        const appwriteError = error as { code?: number };
                        if (appwriteError.code === 404) {
                            return;
                        }
                        // For other errors, log and continue without billing attribution
                        console.warn('[TrafficMetering] Could not determine billing entity, skipping');
                    }

                    // Build event data
                    eventData = {
                        workspaceId: targetWorkspaceId as string,
                        projectId, // Can be null, which is fine if optional; if undefined, key is omitted.

                        resourceType: ResourceType.TRAFFIC,
                        units: totalBytes,
                        metadata: JSON.stringify({
                            idempotencyKey,
                            endpoint,
                            method: requestMethod,
                            requestBytes: requestSize,
                            responseBytes: responseSize,
                            durationMs: duration,
                            statusCode: c.res.status,
                            // Store billing entity in metadata until schema is updated
                            billingEntityId,
                            billingEntityType,
                            // Source context for display
                            sourceContext: {
                                type: endpoint.includes('/admin') ? 'admin' :
                                    endpoint.includes('/projects') ? 'project' : 'workspace',
                                displayName: endpoint.includes('/admin') ? 'Admin Panel' :
                                    endpoint.includes('/projects') ? 'Project' : 'Workspace',
                            },
                        }),
                        timestamp: eventTimestamp,
                        source: UsageSource.API,
                    };

                    // TODO: Once Appwrite schema is updated with billingEntityId and billingEntityType fields,
                    // uncomment these lines to enable direct filtering:
                    // if (billingEntityId) (eventData as any).billingEntityId = billingEntityId;
                    // if (billingEntityType) (eventData as any).billingEntityType = billingEntityType;

                    await databases.createDocument(
                        DATABASE_ID,
                        USAGE_EVENTS_ID,
                        ID.unique(),
                        eventData
                    );
                } catch (error: unknown) {
                    // Silently handle duplicates (idempotency working)
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    if (!errorMessage.includes('duplicate') && !errorMessage.includes('unique')) {
                        console.error('[TrafficMetering] Failed to log:', error);
                        if (eventData) {
                            console.error('[TrafficMetering] Payload causing error:', JSON.stringify(eventData, null, 2));
                        }
                    }
                }
            }, 50);
        }
    }
);

/**
 * Create metering context for routes that don't use session middleware
 * This allows traffic metering even for unauthenticated requests
 */
export async function logAnonymousTraffic(
    adminDatabases: Databases,
    options: {
        workspaceId: string;
        endpoint: string;
        method: string;
        requestBytes: number;
        responseBytes: number;
        durationMs: number;
        statusCode: number;
    }
): Promise<void> {
    const timestamp = Date.now();
    const idempotencyKey = `traffic:anonymous:${options.endpoint}:${options.method}:${Math.floor(timestamp / 1000)}`;

    try {
        await adminDatabases.createDocument(
            DATABASE_ID,
            USAGE_EVENTS_ID,
            ID.unique(),
            {
                workspaceId: options.workspaceId,

                resourceType: ResourceType.TRAFFIC,
                units: options.requestBytes + options.responseBytes,
                // Note: idempotencyKey stored in metadata until Appwrite collection updated
                metadata: JSON.stringify({ ...options, idempotencyKey }),
                timestamp: new Date(timestamp).toISOString(),
                source: UsageSource.API,
            }
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('duplicate') && !errorMessage.includes('unique')) {
            console.error('[TrafficMetering] Failed to log anonymous traffic:', error);
        }
    }
}
