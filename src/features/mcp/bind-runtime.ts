import { ID, Query } from "node-appwrite";
import type { McpCollections, McpRedis, McpRuntime, McpTokenRecord } from "@fairlx/mcp-server";
import {
  CUSTOM_FIELDS_ID,
  DATABASE_ID,
  COMMENTS_ID,
  GITHUB_REPOS_ID,
  MCP_API_TOKENS_ID,
  MEMBERS_ID,
  ORGANIZATION_AUDIT_LOGS_ID,
  ORGANIZATION_MEMBERS_ID,
  ORGANIZATIONS_ID,
  PROJECT_DOCS_ID,
  PROJECT_MEMBERS_ID,
  PROJECT_PERMISSIONS_ID,
  PROJECT_ROLES_ID,
  PROJECT_TEAM_MEMBERS_ID,
  PROJECT_WEBHOOKS_ID,
  PROJECTS_ID,
  SPRINTS_ID,
  TIME_LOGS_ID,
  WORK_ITEM_LINKS_ID,
  WORK_ITEMS_ID,
  WORKFLOW_STATUSES_ID,
  WORKFLOW_TRANSITIONS_ID,
  WORKFLOWS_ID,
  WORKSPACES_ID,
  // New collections for full MCP coverage
  SUBTASKS_ID,
  NOTIFICATIONS_ID,
  SAVED_VIEWS_ID,
  PROJECT_TEAMS_ID,
  SPACES_ID,
  SPACE_MEMBERS_ID,
  PROGRAMS_ID,
  PROGRAM_MEMBERS_ID,
  PROGRAM_MILESTONES_ID,
  PERSONAL_BACKLOG_ID,
  ATTACHMENTS_ID,
  AGENT_HARNESS_ID,
  AGENT_RUNS_ID,
  DEPARTMENTS_ID,
  DEPARTMENT_PERMISSIONS_ID,
  ORG_MEMBER_DEPARTMENTS_ID,
  USAGE_EVENTS_ID,
  WALLETS_ID,
} from "@/config";
import { hashMcpToken } from "@/features/integrations/lib/helpers";
import {
  buildOrgAuditLogDocument,
  pickLiveOrgAuditLogDocument,
} from "@/features/organizations/lib/audit-log-schema";
import { generateWorkItemKey } from "@/features/sprints/lib/generate-work-item-key";
import { validateStatusTransition } from "@/features/workflows/lib/validate-status-transition";
import { createAdminClient } from "@/lib/appwrite";
import { batchGetUsers } from "@/lib/batch-users";
import {
  resolveUserProjectAccess as resolveAccess,
} from "@/lib/permissions/resolveUserProjectAccess";
import {
  acquireProcessingLock,
  isEventProcessed,
  markEventProcessed,
} from "@/lib/processed-events-registry";
import { CK, CKPattern, invalidateCache, invalidateCachePattern } from "@/lib/redis";
import { getRedisClient } from "@/lib/redis/client";
import { resolveUserOrgAccess, hasOrgPermissionFromAccess } from "@/lib/permissions/resolveUserOrgAccess";
import { OrgPermissionKey } from "@/features/org-permissions/types";
import { inviteOrganizationMember } from "@/features/organizations/services/invite-org-member";
import { actorMayAddToOrganizationAndWorkspace } from "@/features/members/services/add-to-org-and-workspace";
import { createAppwriteStore } from "./appwrite-store";
import { verifyMcpJwt } from "./jwt";

const COLLECTIONS: McpCollections = {
  database: DATABASE_ID,
  workspaces: WORKSPACES_ID,
  projects: PROJECTS_ID,
  workItems: WORK_ITEMS_ID,
  sprints: SPRINTS_ID,
  comments: COMMENTS_ID,
  timeLogs: TIME_LOGS_ID,
  projectDocs: PROJECT_DOCS_ID,
  workItemLinks: WORK_ITEM_LINKS_ID,
  workflows: WORKFLOWS_ID,
  workflowStatuses: WORKFLOW_STATUSES_ID,
  workflowTransitions: WORKFLOW_TRANSITIONS_ID,
  members: MEMBERS_ID,
  projectMembers: PROJECT_MEMBERS_ID,
  projectRoles: PROJECT_ROLES_ID,
  projectTeamMembers: PROJECT_TEAM_MEMBERS_ID,
  projectWebhooks: PROJECT_WEBHOOKS_ID,
  githubRepos: GITHUB_REPOS_ID,
  organizationAuditLogs: ORGANIZATION_AUDIT_LOGS_ID,
  organizationMembers: ORGANIZATION_MEMBERS_ID,
  organizations: ORGANIZATIONS_ID,
  customFields: CUSTOM_FIELDS_ID,
  mcpApiTokens: MCP_API_TOKENS_ID,
  // New collections for full MCP coverage
  subtasks: SUBTASKS_ID,
  notifications: NOTIFICATIONS_ID,
  savedViews: SAVED_VIEWS_ID,
  projectTeams: PROJECT_TEAMS_ID,
  projectPermissions: PROJECT_PERMISSIONS_ID,
  spaces: SPACES_ID,
  spaceMembers: SPACE_MEMBERS_ID,
  programs: PROGRAMS_ID,
  programMembers: PROGRAM_MEMBERS_ID,
  programMilestones: PROGRAM_MILESTONES_ID,
  personalBacklog: PERSONAL_BACKLOG_ID,
  attachments: ATTACHMENTS_ID,
  agentHarness: AGENT_HARNESS_ID,
  agentRuns: AGENT_RUNS_ID,
  departments: DEPARTMENTS_ID,
  departmentPermissions: DEPARTMENT_PERMISSIONS_ID,
  orgMemberDepartments: ORG_MEMBER_DEPARTMENTS_ID,
  usageEvents: USAGE_EVENTS_ID,
  wallets: WALLETS_ID,
};

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

function wrapRedis(client: NonNullable<ReturnType<typeof getRedisClient>>): McpRedis {
  return {
    get: (key) => client.get(key),
    set: async (key, value, ttlSeconds) => {
      if (typeof ttlSeconds === "number") {
        await client.set(key, value, "EX", ttlSeconds);
        return;
      }
      await client.set(key, value);
    },
    del: async (key) => {
      await client.del(key);
    },
    incr: (key) => client.incr(key),
    expire: async (key, ttlSeconds) => {
      await client.expire(key, ttlSeconds);
    },
  };
}

function toTokenRecord(doc: Record<string, unknown>): McpTokenRecord {
  return {
    $id: String(doc.$id),
    projectId: doc.projectId ? String(doc.projectId) : undefined,
    workspaceId: String(doc.workspaceId ?? ""),
    createdBy: String(doc.createdBy ?? ""),
    name: typeof doc.name === "string" ? doc.name : undefined,
    organizationId: typeof doc.organizationId === "string" ? doc.organizationId : undefined,
    scopes: Array.isArray(doc.scopes)
      ? (doc.scopes as string[])
      : typeof doc.scopes === "string"
        ? doc.scopes
        : undefined,
    expiresAt: typeof doc.expiresAt === "string" ? doc.expiresAt : undefined,
    isRevoked: Boolean(doc.isRevoked),
    tokenHash: typeof doc.tokenHash === "string" ? doc.tokenHash : undefined,
  };
}

export async function createMcpRuntime(): Promise<McpRuntime> {
  const { databases, users } = await createAdminClient();
  const redisClient = getRedisClient();
  const redis = redisClient ? wrapRedis(redisClient) : null;
  const store = createAppwriteStore(databases, DATABASE_ID);

  return {
    collections: COLLECTIONS,
    store,
    redis,
    resolveUserProjectAccess: async (userId, projectId) => {
      const access = await resolveAccess(databases, userId, projectId);
      return {
        hasAccess: access.hasAccess,
        isOwner: access.isOwner,
        isAdmin: access.isAdmin,
        permissions: access.permissions,
        role: access.role ?? undefined,
      };
    },
    hasProjectPermission: (access, permission) =>
      access.isOwner || access.permissions.includes(permission),
    generateWorkItemKey: (projectId) => generateWorkItemKey(databases, projectId),
    validateStatusTransition: async (args) => {
      if (!args.workflowId) {
        return { allowed: true };
      }
      return validateStatusTransition(
        databases,
        args.workflowId,
        args.fromStatus,
        args.toStatus,
        args.userId,
        args.projectId,
        args.memberRole ?? ""
      );
    },
    hashMcpToken,
    lookupTokenByHash: async (hash) => {
      const result = await databases.listDocuments(DATABASE_ID, MCP_API_TOKENS_ID, [
        Query.equal("tokenHash", hash),
        Query.limit(1),
      ]);
      const doc = result.documents[0];
      if (!doc) return null;
      return toTokenRecord(doc as unknown as Record<string, unknown>);
    },
    touchTokenLastUsed: async (tokenId) => {
      await databases.updateDocument(DATABASE_ID, MCP_API_TOKENS_ID, tokenId, {
        lastUsedAt: new Date().toISOString(),
      });
    },
    verifyJwt: verifyMcpJwt,
    acquireIdempotencyLock: (eventKey, metadata) =>
      acquireProcessingLock(databases, eventKey, "mcp_tool", metadata),
    recordIdempotency: async (eventKey, result) => {
      await markEventProcessed(databases, eventKey, "mcp_tool", {
        result: result === undefined ? undefined : { stored: true },
      });
      if (redis && result !== undefined) {
        await redis.set(`mcp:idem:${eventKey}`, JSON.stringify(result), IDEMPOTENCY_TTL_SECONDS);
      }
    },
    getIdempotencyResult: async (eventKey) => {
      if (redis) {
        const raw = await redis.get(`mcp:idem:${eventKey}`);
        if (raw) {
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        }
      }
      if (await isEventProcessed(databases, eventKey, "mcp_tool")) {
        return { replayed: true };
      }
      return null;
    },
    now: () => new Date().toISOString(),
    lookupUsers: async (userIds) => {
      const map = await batchGetUsers(users, userIds);
      return [...map.values()].map((user) => {
        const prefs = user.prefs as { profileImageUrl?: string | null } | undefined;
        return {
          id: user.$id,
          name: user.name || user.email || "",
          email: user.email || "",
          profileImageUrl: prefs?.profileImageUrl ?? null,
        };
      });
    },
    onMembershipChanged: async ({ userId, workspaceId }) => {
      await invalidateCache(
        CK.workspaceMember(userId, workspaceId),
        CK.memberList(workspaceId),
        CK.authLifecycle(userId)
      );
      await invalidateCachePattern(CKPattern.workspacePerms(workspaceId));
      await invalidateCachePattern(CKPattern.allUserPerms(userId));
    },
    onProjectTeamChanged: async ({ projectId, userIds }) => {
      await invalidateCachePattern(CKPattern.projectPerms(projectId));
      await Promise.all(userIds.map((userId) => invalidateCache(CK.projectAccess(userId, projectId))));
      await Promise.all(userIds.map((userId) => invalidateCachePattern(CKPattern.allUserPerms(userId))));
    },
    inviteOrganizationMember: async ({ actorUserId, organizationId, email, name, workspaceId }) => {
      if (workspaceId) {
        const { allowed } = await actorMayAddToOrganizationAndWorkspace({
          databases,
          actorUserId,
          organizationId,
          workspaceId,
        });
        if (!allowed) {
          throw new Error(
            "A workspace admin can add this person to the organization and this workspace. Organization owner approval is not required.",
          );
        }
      } else {
        const access = await resolveUserOrgAccess(databases, actorUserId, organizationId);
        if (!access.isOwner && !hasOrgPermissionFromAccess(access, OrgPermissionKey.MEMBERS_MANAGE)) {
          throw new Error(
            "A workspace admin can add this person to the organization and this workspace. Organization owner approval is not required.",
          );
        }
      }
      const invited = await inviteOrganizationMember({
        actorUserId,
        organizationId,
        email,
        fullName: name,
        role: "MEMBER",
      });
      return {
        userId: invited.userId,
        email: invited.email,
        name: invited.name,
        isExistingUser: invited.isExistingUser,
        emailSent: invited.emailSent,
        emailError: invited.emailError,
      };
    },
    resolveUserOrgAccess: async (userId, organizationId) => {
      const access = await resolveUserOrgAccess(databases, userId, organizationId);
      return {
        isOwner: access.isOwner,
        role: access.role,
        permissions: access.permissions,
        hasDepartmentAccess: access.hasDepartmentAccess,
      };
    },
    logAudit: async (entry) => {
      try {
        const organizationId = String(entry.organizationId ?? entry.workspaceId ?? "");
        const payload = buildOrgAuditLogDocument({
          organizationId,
          actorUserId: String(entry.userId ?? entry.actorUserId ?? ""),
          actionType: String(entry.action ?? entry.actionType ?? "mcp"),
          metadata: {
            workspaceId: entry.workspaceId,
            projectId: entry.projectId,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            resourceName: entry.resourceName,
            ...(entry.metadata && typeof entry.metadata === "object"
              ? (entry.metadata as Record<string, unknown>)
              : {}),
          },
        });
        await databases.createDocument(
          DATABASE_ID,
          ORGANIZATION_AUDIT_LOGS_ID,
          ID.unique(),
          pickLiveOrgAuditLogDocument(payload)
        );
      } catch {
        // Audit must never fail the MCP call.
      }
    },
  };
}
