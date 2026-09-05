import { forbiddenError, invalidParams, notFoundError } from "../protocol/errors";
import type { McpToolResult } from "../protocol/types";
import type { AuthContext } from "../auth/context";
import type { McpRuntime } from "../runtime/types";
import { toolResult } from "../runtime/output";
import { listAllDocuments, optionalString, requireString } from "./helpers";

export const ORG_PERMISSION = {
  MEMBERS_VIEW: "org.members.view",
  MEMBERS_MANAGE: "org.members.manage",
  SETTINGS_MANAGE: "org.settings.manage",
  WORKSPACE_ASSIGN: "org.workspace.assign",
  DEPARTMENTS_MANAGE: "org.departments.manage",
} as const;

export const ORG_PERMISSION_KEYS = [
  "org.billing.view",
  "org.billing.manage",
  "org.members.view",
  "org.members.manage",
  "org.settings.manage",
  "org.audit.view",
  "org.compliance.view",
  "org.departments.manage",
  "org.security.view",
  "org.workspace.create",
  "org.workspace.assign",
] as const;

export async function resolveOrganizationId(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<string> {
  const fromArgs = optionalString(args, "organizationId");
  if (fromArgs) return fromArgs;
  if (auth.organizationId) return auth.organizationId;
  const workspaceId = optionalString(args, "workspaceId") || auth.workspaceId;
  if (!workspaceId) {
    throw invalidParams("Provide organizationId or workspaceId");
  }
  const workspace = await runtime.store.get<Record<string, unknown>>(
    runtime.collections.workspaces,
    workspaceId,
  );
  const organizationId = String(workspace.organizationId ?? "").trim();
  if (!organizationId) {
    throw invalidParams("This workspace is not in an organization.");
  }
  return organizationId;
}

export async function organizationName(
  runtime: McpRuntime,
  organizationId: string,
): Promise<string | null> {
  const collection = runtime.collections.organizations;
  if (!collection) return null;
  try {
    const org = await runtime.store.get<Record<string, unknown>>(collection, organizationId);
    const name = String(org.name ?? "").trim();
    return name || null;
  } catch {
    return null;
  }
}

export async function actorCanReadOrganization(
  runtime: McpRuntime,
  auth: AuthContext,
  organizationId: string,
): Promise<boolean> {
  const orgMembersCollection = runtime.collections.organizationMembers;
  if (orgMembersCollection) {
    const orgMembership = await runtime.store.list<Record<string, unknown>>(orgMembersCollection, [
      { type: "equal", field: "organizationId", value: organizationId },
      { type: "equal", field: "userId", value: auth.actorUserId },
      { type: "limit", value: 1 },
    ]);
    if (orgMembership.documents.length > 0) {
      const status = String(orgMembership.documents[0]?.status ?? "ACTIVE").toUpperCase();
      if (status !== "SUSPENDED") return true;
    }
  }

  const workspaces = await listAllDocuments(runtime, runtime.collections.workspaces, [
    { type: "equal", field: "organizationId", value: organizationId },
  ]);
  for (const workspace of workspaces) {
    const workspaceId = String(workspace.$id ?? workspace.id ?? "");
    if (!workspaceId) continue;
    const membership = await runtime.store.list<Record<string, unknown>>(runtime.collections.members, [
      { type: "equal", field: "userId", value: auth.actorUserId },
      { type: "equal", field: "workspaceId", value: workspaceId },
      { type: "limit", value: 1 },
    ]);
    if (membership.documents.length > 0) return true;
  }
  return false;
}

async function requireOrgRead(
  runtime: McpRuntime,
  auth: AuthContext,
  organizationId: string,
): Promise<void> {
  if (!(await actorCanReadOrganization(runtime, auth, organizationId))) {
    throw notFoundError("Not found");
  }
}

function hasOrgPermission(
  access: { isOwner: boolean; permissions: string[] },
  permission: string,
): boolean {
  if (access.isOwner) return true;
  return access.permissions.includes(permission);
}

export async function organizationGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const organizationId = await resolveOrganizationId(args, runtime, auth);
  await requireOrgRead(runtime, auth, organizationId);

  const collection = runtime.collections.organizations;
  if (!collection) {
    return toolResult({ error: "Organizations are unavailable." }, true);
  }
  const org = await runtime.store.get<Record<string, unknown>>(collection, organizationId);
  const name = String(org.name ?? "").trim();
  if (!name) throw notFoundError("Not found");

  const orgMembersCollection = runtime.collections.organizationMembers;
  const orgMembers = orgMembersCollection
    ? await listAllDocuments(runtime, orgMembersCollection, [
        { type: "equal", field: "organizationId", value: organizationId },
      ])
    : [];
  const actorOrg = orgMembers.find((doc) => String(doc.userId ?? "") === auth.actorUserId);
  const access = runtime.resolveUserOrgAccess
    ? await runtime.resolveUserOrgAccess(auth.actorUserId, organizationId)
    : null;

  return toolResult({
    organization: {
      name,
      memberCount: orgMembers.length,
    },
    you: {
      orgRole: actorOrg ? String(actorOrg.role ?? access?.role ?? "MEMBER") : access?.role ?? null,
      workspaceMember: !actorOrg,
      canManageMembers: access ? hasOrgPermission(access, ORG_PERMISSION.MEMBERS_MANAGE) : false,
      canManageSettings: access ? hasOrgPermission(access, ORG_PERMISSION.SETTINGS_MANAGE) : false,
    },
    note: "Organization and workspace are different. This is the company. Use fairlx_workspace_get for the current workspace.",
  });
}

export async function organizationList(
  _args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const orgMembersCollection = runtime.collections.organizationMembers;
  const orgCollection = runtime.collections.organizations;
  if (!orgMembersCollection || !orgCollection) {
    return toolResult({ organizations: [], message: "Organizations are unavailable." });
  }

  const memberships = await listAllDocuments(runtime, orgMembersCollection, [
    { type: "equal", field: "userId", value: auth.actorUserId },
  ]);
  const organizations = [];
  for (const membership of memberships) {
    const organizationId = String(membership.organizationId ?? "").trim();
    if (!organizationId) continue;
    const status = String(membership.status ?? "ACTIVE").toUpperCase();
    if (status === "SUSPENDED") continue;
    try {
      const org = await runtime.store.get<Record<string, unknown>>(orgCollection, organizationId);
      organizations.push({
        name: String(org.name ?? ""),
        role: String(membership.role ?? "MEMBER"),
        status,
      });
    } catch {
      // skip missing
    }
  }
  return toolResult({ organizations });
}

export async function organizationWorkspacesList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const organizationId = await resolveOrganizationId(args, runtime, auth);
  await requireOrgRead(runtime, auth, organizationId);
  const orgName = (await organizationName(runtime, organizationId)) ?? "";

  const workspaces = await listAllDocuments(runtime, runtime.collections.workspaces, [
    { type: "equal", field: "organizationId", value: organizationId },
  ]);
  const access = runtime.resolveUserOrgAccess
    ? await runtime.resolveUserOrgAccess(auth.actorUserId, organizationId)
    : null;
  const canSeeAll =
    Boolean(access?.isOwner) ||
    Boolean(access && hasOrgPermission(access, ORG_PERMISSION.WORKSPACE_ASSIGN));

  const visible = [];
  for (const workspace of workspaces) {
    const workspaceId = String(workspace.$id ?? workspace.id ?? "");
    const membership = await runtime.store.list<Record<string, unknown>>(runtime.collections.members, [
      { type: "equal", field: "userId", value: auth.actorUserId },
      { type: "equal", field: "workspaceId", value: workspaceId },
      { type: "limit", value: 1 },
    ]);
    const inWorkspace = membership.documents.length > 0;
    if (!canSeeAll && !inWorkspace) continue;
    visible.push({
      name: String(workspace.name ?? ""),
      role: inWorkspace ? String(membership.documents[0]?.role ?? "MEMBER") : null,
      inWorkspace,
    });
  }

  return toolResult({
    organization: orgName,
    workspaces: visible,
  });
}

export async function organizationUpdate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const organizationId = await resolveOrganizationId(args, runtime, auth);
  const name = requireString(args, "name").trim();
  if (!name) throw invalidParams("Provide the new organization name");

  const collection = runtime.collections.organizations;
  if (!collection) {
    return toolResult({ error: "Organizations are unavailable." }, true);
  }
  if (!runtime.resolveUserOrgAccess) {
    throw forbiddenError("Organization updates are unavailable.");
  }
  const access = await runtime.resolveUserOrgAccess(auth.actorUserId, organizationId);
  if (!hasOrgPermission(access, ORG_PERMISSION.SETTINGS_MANAGE)) {
    throw forbiddenError(
      "You do not have organization settings permission. A workspace admin role is not enough to rename the organization.",
    );
  }

  const updated = await runtime.store.update<Record<string, unknown>>(collection, organizationId, { name });
  return toolResult({
    organization: { name: String(updated.name ?? name) },
    updated: true,
  });
}

function parsePermissionKeys(raw: unknown): string[] {
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function requireOrgPermissionKeys(raw: unknown): string[] {
  const keys = parsePermissionKeys(raw);
  const allowed = new Set<string>(ORG_PERMISSION_KEYS);
  const invalid = keys.filter((key) => !allowed.has(key));
  if (invalid.length) {
    throw invalidParams(
      `Unknown permission key: ${invalid.join(", ")}. Use one of: ${ORG_PERMISSION_KEYS.join(", ")}`,
    );
  }
  return keys;
}

function parseDepartmentPermissionBlob(raw: unknown): string[] {
  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }
    if (trimmed.includes(",")) return trimmed.split(",").map((key) => key.trim()).filter(Boolean);
    return [trimmed];
  }
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? "").trim()).filter(Boolean);
  return [];
}

async function requireDepartmentsManage(
  runtime: McpRuntime,
  auth: AuthContext,
  organizationId: string,
) {
  if (!runtime.resolveUserOrgAccess) {
    throw forbiddenError("Organization departments are unavailable.");
  }
  const access = await runtime.resolveUserOrgAccess(auth.actorUserId, organizationId);
  if (!hasOrgPermission(access, ORG_PERMISSION.DEPARTMENTS_MANAGE)) {
    throw forbiddenError(
      "You do not have permission to manage departments. Org owners and members with org.departments.manage can do this.",
    );
  }
}

async function loadDepartmentPermissions(
  runtime: McpRuntime,
  organizationId: string,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const collection = runtime.collections.departmentPermissions;
  if (!collection) return map;
  const docs = await listAllDocuments(runtime, collection, [
    { type: "equal", field: "organizationId", value: organizationId },
  ]);
  for (const doc of docs) {
    const departmentId = String(doc.departmentId ?? "");
    if (!departmentId) continue;
    const keys = parseDepartmentPermissionBlob(doc.permissions ?? doc.permissionKey);
    map.set(departmentId, [...(map.get(departmentId) ?? []), ...keys]);
  }
  return map;
}

async function upsertDepartmentPermissions(
  runtime: McpRuntime,
  organizationId: string,
  departmentId: string,
  addKeys: string[],
): Promise<string[]> {
  const collection = runtime.collections.departmentPermissions;
  if (!collection) throw invalidParams("Department permissions are unavailable.");
  const existing = await runtime.store.list<Record<string, unknown>>(collection, [
    { type: "equal", field: "departmentId", value: departmentId },
    { type: "limit", value: 20 },
  ]);
  const primary = existing.documents[0];
  const current = parseDepartmentPermissionBlob(primary?.permissions ?? primary?.permissionKey);
  const next = [...current];
  for (const key of addKeys) {
    if (!next.includes(key)) next.push(key);
  }
  const blob = JSON.stringify(next);
  if (primary) {
    await runtime.store.update(collection, String(primary.$id ?? primary.id ?? ""), { permissions: blob });
  } else {
    await runtime.store.create(collection, {
      organizationId,
      departmentId,
      permissions: blob,
    });
  }
  return next;
}

export async function departmentList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const organizationId = await resolveOrganizationId(args, runtime, auth);
  await requireOrgRead(runtime, auth, organizationId);
  const collection = runtime.collections.departments;
  if (!collection) {
    return toolResult({ departments: [], message: "Departments are unavailable." });
  }
  const departments = await listAllDocuments(runtime, collection, [
    { type: "equal", field: "organizationId", value: organizationId },
  ]);
  const permissionMap = await loadDepartmentPermissions(runtime, organizationId);
  return toolResult({
    departments: departments
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
      .map((dept) => {
        const id = String(dept.$id ?? dept.id ?? "");
        return {
          id,
          name: String(dept.name ?? ""),
          description: String(dept.description ?? "") || undefined,
          color: String(dept.color ?? "") || undefined,
          permissions: [...new Set(permissionMap.get(id) ?? [])],
        };
      }),
  });
}

type DepartmentDraft = {
  name: string;
  description?: string;
  color?: string;
  permissions: string[];
};

function departmentDraftsFromArgs(args: Record<string, unknown>): DepartmentDraft[] {
  const batch = Array.isArray(args.departments) ? args.departments : null;
  if (batch) {
    return batch.map((item) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const name = String(record.name ?? "").trim();
      if (!name) throw invalidParams("Each department needs a name");
      return {
        name,
        description: optionalString(record, "description") || undefined,
        color: optionalString(record, "color") || undefined,
        permissions: requireOrgPermissionKeys(record.permissions ?? record.permissionKeys),
      };
    });
  }
  const name = optionalString(args, "name")?.trim();
  if (!name) {
    throw invalidParams("Provide name, or departments: [{ name, permissions }]");
  }
  return [
    {
      name,
      description: optionalString(args, "description") || undefined,
      color: optionalString(args, "color") || undefined,
      permissions: requireOrgPermissionKeys(args.permissions ?? args.permissionKeys ?? args.permissionKey),
    },
  ];
}

export async function departmentCreate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const organizationId = await resolveOrganizationId(args, runtime, auth);
  await requireDepartmentsManage(runtime, auth, organizationId);
  const collection = runtime.collections.departments;
  if (!collection) throw invalidParams("Departments are unavailable.");
  const drafts = departmentDraftsFromArgs(args);
  const existing = await listAllDocuments(runtime, collection, [
    { type: "equal", field: "organizationId", value: organizationId },
  ]);
  const created = [];
  for (const draft of drafts) {
    const duplicate = existing.find(
      (doc) => String(doc.name ?? "").trim().toLowerCase() === draft.name.toLowerCase(),
    );
    if (duplicate) {
      throw invalidParams(`Department "${draft.name}" already exists`);
    }
    const payload: Record<string, unknown> = {
      organizationId,
      name: draft.name,
      color: draft.color || "#4F46E5",
    };
    if (draft.description) payload.description = draft.description;
    const dept = await runtime.store.create<Record<string, unknown>>(collection, payload);
    const id = String(dept.$id ?? dept.id ?? "");
    existing.push({ ...dept, $id: id, name: draft.name });
    const permissions = draft.permissions.length
      ? await upsertDepartmentPermissions(runtime, organizationId, id, draft.permissions)
      : [];
    created.push({
      id,
      name: draft.name,
      description: draft.description,
      color: String(payload.color),
      permissions,
    });
  }
  return toolResult({ created: true, departments: created });
}

export async function departmentPermissionAdd(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const organizationId = await resolveOrganizationId(args, runtime, auth);
  await requireDepartmentsManage(runtime, auth, organizationId);
  const collection = runtime.collections.departments;
  if (!collection) throw invalidParams("Departments are unavailable.");
  const keys = requireOrgPermissionKeys(args.permissions ?? args.permissionKeys ?? args.permissionKey);
  if (!keys.length) throw invalidParams("Provide permissionKey or permissions");
  const departments = await listAllDocuments(runtime, collection, [
    { type: "equal", field: "organizationId", value: organizationId },
  ]);
  const departmentId = optionalString(args, "departmentId");
  const departmentName = optionalString(args, "departmentName") || optionalString(args, "name");
  const dept = departmentId
    ? departments.find((doc) => String(doc.$id ?? doc.id ?? "") === departmentId)
    : departments.find(
        (doc) => String(doc.name ?? "").trim().toLowerCase() === (departmentName ?? "").toLowerCase(),
      );
  if (!dept) throw notFoundError("Department not found");
  const id = String(dept.$id ?? dept.id ?? "");
  const permissions = await upsertDepartmentPermissions(runtime, organizationId, id, keys);
  return toolResult({
    updated: true,
    department: { id, name: String(dept.name ?? ""), permissions },
  });
}
