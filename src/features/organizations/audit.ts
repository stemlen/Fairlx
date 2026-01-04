import { ID } from "node-appwrite";
import { DATABASE_ID, ORGANIZATION_AUDIT_LOGS_ID } from "@/config";

let hasWarnedConfig = false;

/**
 * Organization Audit Actions
 */
export enum OrgAuditAction {
    /** Organization created via ORG signup */
    ORGANIZATION_CREATED = "organization_created",
    /** PERSONAL account converted to ORG */
    ACCOUNT_CONVERTED = "account_converted",
    /** Workspace created under organization */
    WORKSPACE_CREATED = "workspace_created",
    /** Ownership transferred between users */
    OWNERSHIP_TRANSFERRED = "ownership_transferred",
    /** Billing context changed (e.g., payment method update) */
    BILLING_CONTEXT_SWITCHED = "billing_context_switched",
    /** Organization soft-deleted */
    ORGANIZATION_DELETED = "organization_deleted",
    /** Organization restored from soft-delete */
    ORGANIZATION_RESTORED = "organization_restored",
    /** Member added to organization */
    MEMBER_ADDED = "member_added",
    /** Member removed from organization */
    MEMBER_REMOVED = "member_removed",
    /** Member role changed */
    MEMBER_ROLE_CHANGED = "member_role_changed",

    // === AUTH AUDIT ACTIONS (Enterprise) ===
    /** User logged in (method: password | google | github) */
    AUTH_LOGIN = "auth_login",
    /** OAuth provider linked to account */
    AUTH_PROVIDER_LINKED = "auth_provider_linked",
    /** OAuth provider unlinked from account */
    AUTH_PROVIDER_UNLINKED = "auth_provider_unlinked",
    /** User account deleted */
    ACCOUNT_DELETED = "account_deleted",
    /** Workspace deleted */
    WORKSPACE_DELETED = "workspace_deleted",

    // === ENTERPRISE HARDENING ACTIONS ===
    /** User switched between PERSONAL and ORG context */
    CONTEXT_SWITCH = "context_switch",
    /** Member voluntarily left organization */
    ORG_MEMBER_LEFT = "org_member_left",
    /** Billing settings updated (payment method, plan, etc.) */
    BILLING_UPDATED = "billing_updated",
    /** Account deletion blocked due to ownership constraints */
    ACCOUNT_DELETE_ATTEMPT_BLOCKED = "account_delete_attempt_blocked",
}

/**
 * Organization Audit Log Entry
 * 
 * INVARIANTS:
 * - Once created, logs are immutable (no updates/deletes)
 * - Every critical org action must have an audit log
 * - metadata should contain all context needed to reconstruct the action
 */
export interface OrgAuditLog {
    $id?: string;
    organizationId: string;
    actorUserId: string;
    actionType: OrgAuditAction;
    /**
     * Flexible metadata for action-specific context.
     * Examples:
     * - For OWNERSHIP_TRANSFERRED: { fromUserId, toUserId }
     * - For WORKSPACE_CREATED: { workspaceId, workspaceName }
     * - For MEMBER_ROLE_CHANGED: { targetUserId, fromRole, toRole }
     */
    metadata: Record<string, unknown>;
    timestamp: string;
    /**
     * IP address of the actor (if available).
     * Useful for security audits.
     */
    ipAddress?: string;
    /**
     * User agent string (if available).
     */
    userAgent?: string;
}

interface LogOrgAuditProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    databases: any;
    organizationId: string;
    actorUserId: string;
    actionType: OrgAuditAction;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Log an organization audit event
 * 
 * CRITICAL: This function should never throw - audit logging should not
 * break business operations. Failures are logged to console.
 * 
 * @example
 * await logOrgAudit({
 *   databases,
 *   organizationId: "org123",
 *   actorUserId: "user456",
 *   actionType: OrgAuditAction.ORGANIZATION_CREATED,
 *   metadata: { organizationName: "Acme Corp" },
 * });
 */
export async function logOrgAudit({
    databases,
    organizationId,
    actorUserId,
    actionType,
    metadata = {},
    ipAddress,
    userAgent,
}: LogOrgAuditProps): Promise<OrgAuditLog | null> {
    try {
        // Skip if audit log collection is not configured
        if (!ORGANIZATION_AUDIT_LOGS_ID) {
            if (!hasWarnedConfig) {
                console.warn("[OrgAudit] Audit log collection not configured (NEXT_PUBLIC_APPWRITE_ORGANIZATION_AUDIT_LOGS_ID)");
                hasWarnedConfig = true;
            }
            return null;
        }

        const log = await databases.createDocument(
            DATABASE_ID,
            ORGANIZATION_AUDIT_LOGS_ID,
            ID.unique(),
            {
                organizationId,
                actorUserId,
                actionType,
                metadata: JSON.stringify(metadata),
                timestamp: new Date().toISOString(),
                ipAddress: ipAddress || null,
                userAgent: userAgent || null,
            }
        );
        return log as OrgAuditLog;
    } catch (error) {
        // CRITICAL: Never throw from audit logging
        // Log to console for monitoring/alerting
        console.error("[OrgAudit] Failed to create audit log:", {
            organizationId,
            actorUserId,
            actionType,
            error,
        });
        return null;
    }
}

/**
 * Query organization audit logs
 * 
 * @returns Paginated list of audit logs for the organization
 */
export async function getOrgAuditLogs({
    databases,
    organizationId,
    actionType,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    databases: any;
    organizationId: string;
    actionType?: OrgAuditAction;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}): Promise<{ logs: OrgAuditLog[]; total: number }> {
    const { Query } = await import("node-appwrite");

    // Safety check: if audit log collection is not configured, return empty
    if (!ORGANIZATION_AUDIT_LOGS_ID) {
        if (!hasWarnedConfig) {
            console.warn("[OrgAudit] Audit log collection not configured (NEXT_PUBLIC_APPWRITE_ORGANIZATION_AUDIT_LOGS_ID)");
            hasWarnedConfig = true;
        }
        return { logs: [], total: 0 };
    }

    const queries = [
        Query.equal("organizationId", organizationId),
        Query.orderDesc("timestamp"),
        Query.limit(limit),
        Query.offset(offset),
    ];

    if (actionType) {
        queries.push(Query.equal("actionType", actionType));
    }
    if (startDate) {
        queries.push(Query.greaterThanEqual("timestamp", startDate));
    }
    if (endDate) {
        queries.push(Query.lessThanEqual("timestamp", endDate));
    }

    const result = await databases.listDocuments(
        DATABASE_ID,
        ORGANIZATION_AUDIT_LOGS_ID,
        queries
    );

    return {
        logs: result.documents as OrgAuditLog[],
        total: result.total,
    };
}
