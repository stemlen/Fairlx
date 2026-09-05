import { PERMISSIONS } from "../runtime/types";

export const ALL_SCOPES = [
  "project:read",
  "members:read",
  "tasks:read",
  "tasks:write",
  "tasks:delete",
  "sprints:read",
  "sprints:manage",
  "comments:write",
  "docs:read",
  "docs:write",
  "time:write",
  "workflows:read",
  "notifications:read",
  "notifications:write",
  "views:read",
  "views:write",
  "spaces:read",
  "programs:read",
  "audit:read",
  "attachments:read",
  "admin:manage",
  "billing:read",
] as const;

export type McpScope = (typeof ALL_SCOPES)[number];

const SCOPE_TO_PERMISSIONS: Record<string, string[]> = {
  "project:read": [PERMISSIONS.VIEW_PROJECT],
  "members:read": [PERMISSIONS.VIEW_MEMBERS],
  "tasks:read": [PERMISSIONS.VIEW_TASKS],
  "tasks:write": [PERMISSIONS.CREATE_TASKS, PERMISSIONS.EDIT_TASKS],
  "tasks:delete": [PERMISSIONS.DELETE_TASKS],
  "sprints:read": [PERMISSIONS.VIEW_SPRINTS],
  "sprints:manage": [
    PERMISSIONS.CREATE_SPRINTS,
    PERMISSIONS.EDIT_SPRINTS,
    PERMISSIONS.START_SPRINT,
    PERMISSIONS.COMPLETE_SPRINT,
    PERMISSIONS.DELETE_SPRINTS,
  ],
  "comments:write": [PERMISSIONS.CREATE_COMMENTS, PERMISSIONS.DELETE_COMMENTS],
  "docs:read": [PERMISSIONS.VIEW_DOCS],
  "docs:write": [PERMISSIONS.CREATE_DOCS, PERMISSIONS.EDIT_DOCS, PERMISSIONS.DELETE_DOCS],
  "time:write": [PERMISSIONS.EDIT_TASKS],
  "workflows:read": [PERMISSIONS.VIEW_PROJECT],
  "notifications:read": [PERMISSIONS.VIEW_NOTIFICATIONS],
  "notifications:write": [PERMISSIONS.VIEW_NOTIFICATIONS],
  "views:read": [PERMISSIONS.VIEW_VIEWS],
  "views:write": [PERMISSIONS.CREATE_VIEWS, PERMISSIONS.DELETE_VIEWS],
  "spaces:read": [PERMISSIONS.VIEW_SPACES],
  "programs:read": [PERMISSIONS.VIEW_PROGRAMS],
  "audit:read": [PERMISSIONS.VIEW_AUDIT_LOGS],
  "attachments:read": [PERMISSIONS.VIEW_ATTACHMENTS],
  "admin:manage": [PERMISSIONS.EDIT_SETTINGS, PERMISSIONS.DELETE_PROJECT],
  "billing:read": [PERMISSIONS.EDIT_SETTINGS],
};

/**
 * Map canonical project permissions onto MCP scopes.
 * Owners receive the full catalog; other roles receive a scope only when they
 * hold at least one permission that scope can authorize.
 */
export function scopesFromPermissions(
  permissions: string[],
  options?: { isOwner?: boolean }
): string[] {
  if (options?.isOwner) return [...ALL_SCOPES];
  const held = new Set(permissions);
  return ALL_SCOPES.filter((scope) =>
    (SCOPE_TO_PERMISSIONS[scope] ?? []).some((permission) => held.has(permission))
  );
}

/**
 * Empty/missing token scopes inherit the actor's role (or the full catalog when
 * the role is not yet known, e.g. workspace-scoped tokens and JWTs). Explicit
 * scopes are a least-privilege ceiling on top of that inheritance.
 */
export function resolveEffectiveScopes(options: {
  explicitScopes?: string[] | string | null;
  roleScopes?: string[];
}): string[] {
  const explicit = normalizeScopes(options.explicitScopes);
  const inherited =
    options.roleScopes && options.roleScopes.length > 0 ? options.roleScopes : [...ALL_SCOPES];
  if (explicit.length === 0) return inherited;
  return inherited.filter((scope) => explicit.includes(scope));
}

export function isToolAllowedForAuth(
  tool: { scopes: string[]; permission?: string },
  auth: { scopes: string[]; projectPermissions?: string[] }
): boolean {
  if (tool.scopes.length > 0 && !hasScope(auth.scopes, tool.scopes)) return false;
  if (auth.projectPermissions && tool.permission) {
    return auth.projectPermissions.includes(tool.permission);
  }
  return true;
}

export function normalizeScopes(raw: string[] | string | undefined | null): string[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is string => typeof s === "string");
      }
    } catch {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }
  return raw.filter((s): s is string => typeof s === "string");
}

export function scopesGrantPermission(scopes: string[], permission: string): boolean {
  return scopes.some((scope) => (SCOPE_TO_PERMISSIONS[scope] ?? []).includes(permission));
}

export function hasScope(scopes: string[], required: string | string[]): boolean {
  const needed = Array.isArray(required) ? required : [required];
  return needed.every((scope) => scopes.includes(scope));
}

export function hasAnyScope(scopes: string[], required: string[]): boolean {
  return required.some((scope) => scopes.includes(scope));
}
