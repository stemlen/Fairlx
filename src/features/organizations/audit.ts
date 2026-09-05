import { ID, Databases, Models, Query } from "node-appwrite";
import { DATABASE_ID, ORGANIZATION_AUDIT_LOGS_ID } from "@/config";
import {
    buildOrgAuditLogDocument,
    normalizeOrgAuditLog,
    pickLiveOrgAuditLogDocument,
} from "./lib/audit-log-schema";

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
    /** Member activated after first login password reset */
    MEMBER_ACTIVATED = "member_activated",

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
    /** Wallet overdraft reached -$20 and the account was locked */
    ACCOUNT_LOCKED = "account_locked",
    /** Account deletion blocked due to ownership constraints */
    ACCOUNT_DELETE_ATTEMPT_BLOCKED = "account_delete_attempt_blocked",

    // === FIRST LOGIN MAGIC LINK ===
    /** First-login magic link token created for new org member */
    FIRST_LOGIN_TOKEN_CREATED = "first_login_token_created",
    /** First-login magic link token used (single-use) */
    FIRST_LOGIN_TOKEN_USED = "first_login_token_used",
    /** User accepted legal terms (signup) */
    USER_ACCEPTED_LEGAL = "user_accepted_legal",

    // === TWO FACTOR AUTH AUDIT ACTIONS ===
    /** 2FA enabled for account */
    TWO_FACTOR_ENABLED = "two_factor_enabled",
    /** 2FA disabled for account */
    TWO_FACTOR_DISABLED = "two_factor_disabled",
    /** 2FA verification successful */
    TWO_FACTOR_VERIFIED = "two_factor_verified",
    /** 2FA verification failed */
    TWO_FACTOR_FAILED = "two_factor_failed",
    /** Recovery code used for login */
    RECOVERY_CODE_USED = "recovery_code_used",
}

/**
 * Organization Audit Log Entry
 * 
 * INVARIANTS:
 * - Once created, logs are immutable (no updates/deletes)
 * - Every critical org action must have an audit log
 * - metadata should contain all context needed to reconstruct the action
 */
export interface OrgAuditLog extends Models.Document {
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
    databases: Databases;
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
                hasWarnedConfig = true;
            }
            return null;
        }

        const payload = buildOrgAuditLogDocument({
            organizationId,
            actorUserId,
            actionType,
            metadata,
            ipAddress,
            userAgent,
        });

        try {
            const log = await databases.createDocument(
                DATABASE_ID,
                ORGANIZATION_AUDIT_LOGS_ID,
                ID.unique(),
                payload
            );
            return (normalizeOrgAuditLog(log) ?? log) as unknown as OrgAuditLog;
        } catch {
            // Live collection is workspace-style and rejects unknown app-schema attributes.
            const log = await databases.createDocument(
                DATABASE_ID,
                ORGANIZATION_AUDIT_LOGS_ID,
                ID.unique(),
                pickLiveOrgAuditLogDocument(payload)
            );
            return (normalizeOrgAuditLog(log) ?? log) as unknown as OrgAuditLog;
        }
    } catch (error) {
        // CRITICAL: Never throw from audit logging
        console.error("[org-audit] Failed to write audit log", {
            organizationId,
            actionType,
            error: error instanceof Error ? error.message : error,
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
    databases: Databases;
    organizationId: string;
    actionType?: OrgAuditAction;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}): Promise<{ logs: OrgAuditLog[]; total: number }> {
    // Safety check: if audit log collection is not configured, return empty
    if (!ORGANIZATION_AUDIT_LOGS_ID) {
        if (!hasWarnedConfig) {
            hasWarnedConfig = true;
        }
        return { logs: [], total: 0 };
    }

    const mapLogs = (documents: Models.Document[]): OrgAuditLog[] =>
        documents
            .map((doc) => normalizeOrgAuditLog(doc))
            .filter((log): log is NonNullable<ReturnType<typeof normalizeOrgAuditLog>> => log !== null) as OrgAuditLog[];

    const run = (queries: string[]) =>
        databases.listDocuments(DATABASE_ID, ORGANIZATION_AUDIT_LOGS_ID, queries);

    const orgQuery = Query.equal("organizationId", organizationId);
    const queries = [
        orgQuery,
        Query.orderDesc("$createdAt"),
        Query.limit(limit),
        Query.offset(offset),
    ];

    // Live collection uses `action`, not `actionType`. `$createdAt` is always indexed.
    if (actionType) {
        queries.push(Query.equal("action", actionType));
    }
    if (startDate) {
        queries.push(Query.greaterThanEqual("$createdAt", startDate));
    }
    if (endDate) {
        queries.push(Query.lessThanEqual("$createdAt", endDate));
    }

    try {
        const result = await run(queries);
        return {
            logs: mapLogs(result.documents),
            total: result.total,
        };
    } catch (primaryError) {
        console.error("[org-audit] Primary audit query failed, retrying with in-memory filters", {
            organizationId,
            error: primaryError instanceof Error ? primaryError.message : primaryError,
        });
    }

    const scanLimit = Math.min(Math.max(limit + offset, limit), 500);
    const result = await run([
        orgQuery,
        Query.orderDesc("$createdAt"),
        Query.limit(scanLimit),
        Query.offset(0),
    ]);

    let logs = mapLogs(result.documents);
    if (actionType) {
        logs = logs.filter((log) => log.actionType === actionType);
    }
    if (startDate) {
        const startMs = Date.parse(startDate);
        logs = logs.filter((log) => {
            const ts = Date.parse(log.timestamp);
            return Number.isNaN(ts) || Number.isNaN(startMs) || ts >= startMs;
        });
    }
    if (endDate) {
        const endMs = Date.parse(endDate);
        logs = logs.filter((log) => {
            const ts = Date.parse(log.timestamp);
            return Number.isNaN(ts) || Number.isNaN(endMs) || ts <= endMs;
        });
    }

    return {
        logs: logs.slice(offset, offset + limit),
        total: logs.length,
    };
}
