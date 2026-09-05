export type McpQuery =
  | { type: "equal"; field: string; value: string | string[] | number | boolean }
  | { type: "notEqual"; field: string; value: string | number | boolean }
  | { type: "isNull"; field: string }
  | { type: "greaterThanEqual"; field: string; value: string | number }
  | { type: "lessThan"; field: string; value: string | number }
  | { type: "limit"; value: number }
  | { type: "cursorAfter"; value: string }
  | { type: "orderDesc"; field: string }
  | { type: "orderAsc"; field: string };

export interface McpStore {
  get<T = Record<string, unknown>>(collection: string, id: string): Promise<T>;
  list<T = Record<string, unknown>>(
    collection: string,
    queries: McpQuery[]
  ): Promise<{ documents: T[]; total: number }>;
  create<T = Record<string, unknown>>(
    collection: string,
    data: Record<string, unknown>,
    id?: string
  ): Promise<T>;
  update<T = Record<string, unknown>>(
    collection: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<T>;
  delete(collection: string, id: string): Promise<void>;
}

export interface McpRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
}

export interface McpProjectAccess {
  hasAccess: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  permissions: string[];
  role?: string;
}

export interface McpCollections {
  database: string;
  workspaces: string;
  projects: string;
  workItems: string;
  sprints: string;
  comments: string;
  timeLogs: string;
  projectDocs: string;
  workItemLinks: string;
  workflows: string;
  workflowStatuses: string;
  workflowTransitions: string;
  members: string;
  projectMembers: string;
  projectRoles?: string;
  projectTeamMembers: string;
  projectWebhooks: string;
  githubRepos: string;
  organizationAuditLogs: string;
  customFields: string;
  mcpApiTokens: string;
  organizationMembers?: string;
  organizations?: string;
  // ── New collections for full MCP coverage ──
  subtasks: string;
  notifications: string;
  savedViews: string;
  projectTeams: string;
  projectPermissions?: string;
  spaces: string;
  spaceMembers: string;
  programs: string;
  programMembers: string;
  programMilestones: string;
  personalBacklog: string;
  attachments: string;
  agentHarness?: string;
  agentRuns?: string;
  departments?: string;
  departmentPermissions?: string;
  orgMemberDepartments?: string;
  usageEvents?: string;
  wallets?: string;
}

export interface McpTokenRecord {
  $id: string;
  /** When set, token is project-scoped. When absent, token is workspace-scoped. */
  projectId?: string;
  workspaceId: string;
  createdBy: string;
  name?: string;
  organizationId?: string;
  scopes?: string[] | string;
  expiresAt?: string;
  isRevoked?: boolean;
  tokenHash?: string;
}

export type McpUserProfile = {
  id: string;
  name: string;
  email: string;
  profileImageUrl?: string | null;
};

export interface McpRuntime {
  collections: McpCollections;
  store: McpStore;
  redis: McpRedis | null;
  resolveUserProjectAccess: (userId: string, projectId: string) => Promise<McpProjectAccess>;
  hasProjectPermission: (access: McpProjectAccess, permission: string) => boolean;
  generateWorkItemKey: (projectId: string) => Promise<string>;
  validateStatusTransition: (args: {
    workflowId: string;
    fromStatus: string;
    toStatus: string;
    userId: string;
    projectId: string;
    memberRole?: string;
  }) => Promise<{ allowed: boolean; reason?: string }>;
  hashMcpToken: (plaintext: string) => string;
  lookupTokenByHash: (hash: string) => Promise<McpTokenRecord | null>;
  touchTokenLastUsed?: (tokenId: string) => Promise<void>;
  verifyJwt?: (token: string) => Promise<{ userId: string } | null>;
  acquireIdempotencyLock: (
    eventKey: string,
    metadata?: Record<string, unknown>
  ) => Promise<boolean>;
  recordIdempotency: (eventKey: string, result?: unknown) => Promise<void>;
  getIdempotencyResult: (eventKey: string) => Promise<unknown | null>;
  now: () => string;
  logAudit?: (entry: Record<string, unknown>) => Promise<void>;
  /**
   * Batch-resolve Appwrite user profiles so member list/get tools can return
   * the same name and email the Fairlx UI shows. Optional for test runtimes.
   */
  lookupUsers?: (userIds: string[]) => Promise<McpUserProfile[]>;
  /** Drop member/permission caches after a workspace role change. */
  onMembershipChanged?: (info: { userId: string; workspaceId: string }) => Promise<void>;
  /** Drop project-access caches after a team or team-membership change. */
  onProjectTeamChanged?: (info: { projectId: string; userIds: string[] }) => Promise<void>;
  /**
   * Invite a person into the organization by email, creating an Appwrite user if needed.
   * Implementations must allow a workspace admin of that org workspace, the organization
   * owner, or org members-manage — not organization owners only.
   */
  inviteOrganizationMember?: (input: {
    actorUserId: string;
    organizationId: string;
    email: string;
    name: string;
    workspaceId?: string;
  }) => Promise<{
    userId: string;
    email: string;
    name: string;
    isExistingUser: boolean;
    emailSent: boolean;
    emailError?: string;
  }>;
  /** Org RBAC for the actor. Used by organization-level MCP tools. */
  resolveUserOrgAccess?: (
    userId: string,
    organizationId: string,
  ) => Promise<{
    isOwner: boolean;
    role: string | null;
    permissions: string[];
    hasDepartmentAccess: boolean;
  }>;
}

export const PERMISSIONS = {
  VIEW_PROJECT: "project.view",
  VIEW_TASKS: "project.tasks.view",
  VIEW_SPRINTS: "project.sprints.view",
  VIEW_DOCS: "project.docs.view",
  VIEW_MEMBERS: "project.members.view",
  VIEW_TEAMS: "project.teams.view",
  VIEW_NOTIFICATIONS: "project.notifications.view",
  VIEW_VIEWS: "project.views.view",
  VIEW_SPACES: "project.spaces.view",
  VIEW_PROGRAMS: "project.programs.view",
  VIEW_ATTACHMENTS: "project.attachments.view",
  VIEW_AUDIT_LOGS: "project.audit_logs.view",
  CREATE_TASKS: "project.tasks.create",
  CREATE_SPRINTS: "project.sprints.create",
  CREATE_DOCS: "project.docs.create",
  CREATE_COMMENTS: "project.comments.create",
  CREATE_VIEWS: "project.views.create",
  CREATE_TEAMS: "project.teams.create",
  EDIT_TASKS: "project.tasks.edit",
  EDIT_SPRINTS: "project.sprints.edit",
  EDIT_DOCS: "project.docs.edit",
  EDIT_SETTINGS: "project.settings.edit",
  DELETE_TASKS: "project.tasks.delete",
  DELETE_SPRINTS: "project.sprints.delete",
  DELETE_DOCS: "project.docs.delete",
  DELETE_PROJECT: "project.delete",
  DELETE_COMMENTS: "project.comments.delete",
  DELETE_VIEWS: "project.views.delete",
  START_SPRINT: "project.sprints.start",
  COMPLETE_SPRINT: "project.sprints.complete",
  MANAGE_TEAMS: "project.teams.manage",
  INVITE_MEMBERS: "project.members.invite",
} as const;

/** @deprecated Empty token scopes inherit the actor role / ALL_SCOPES. Kept for compatibility. */
export const DEFAULT_LEGACY_SCOPES = [
  "project:read",
  "tasks:read",
  "tasks:write",
  "sprints:read",
  "comments:write",
] as const;
