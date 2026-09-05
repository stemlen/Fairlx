import { forbiddenError, invalidParams, notFoundError } from "../protocol/errors";
import type { McpToolResult } from "../protocol/types";
import type { AuthContext } from "../auth/context";
import { hasScope } from "../auth/scopes";
import { PERMISSIONS, type McpRuntime } from "../runtime/types";
import { parseAssignPercent, pickAssignShareKeys } from "../runtime/assign-share";
import {
  compactWorkItem,
  hydrateMembers,
  hydrateWorkItemAssignees,
  hydrateWorkItemEpics,
  toolResult,
  withId,
} from "../runtime/output";
import { requireProjectAccess, assertWorkspaceBound } from "../runtime/rbac";
import { loadProject, loadWorkItem, workItemDocumentId } from "../runtime/tenant";
import { withIdempotency } from "../runtime/idempotency";
import {
  audit,
  LINK_INVERSE,
  listAllDocuments,
  loadBlocksLinks,
  optionalBoolean,
  optionalString,
  parseCustomFields,
  redactGithubRepo,
  requireString,
  wouldCreateCycle,
} from "./helpers";
import {
  isWorkspaceAdminRole,
  matchWorkspaceMember,
  normalizeMemberRole,
  type NamedMember,
} from "./member-match";
import {
  hasNotionDocStructure,
  normalizeMarkdownSpacing,
  NOTION_DOC_STRUCTURE_ERROR,
} from "../lib/project-doc-markdown";
import { isDocPackCategory } from "../lib/project-doc-pack";
import { projectDocQualityError } from "../lib/project-doc-quality";
import {
  projectMemberAdd,
  projectTeamCreate,
  projectTeamMemberAdd,
  projectTeamUpdate,
} from "./write-team";
import { organizationUpdate, departmentCreate, departmentPermissionAdd } from "./organization";

export async function handleWriteTool(
  name: string,
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  switch (name) {
    case "fairlx_project_create":
      return projectCreate(args, runtime, auth);
    case "fairlx_project_update":
      return projectUpdate(args, runtime, auth);
    case "fairlx_work_item_create":
      return workItemCreate(args, runtime, auth);
    case "fairlx_work_item_update":
      return workItemUpdate(args, runtime, auth);
    case "fairlx_work_item_bulk_update":
      return workItemBulkUpdate(args, runtime, auth);
    case "fairlx_work_item_split":
      return workItemSplit(args, runtime, auth);
    case "fairlx_sprint_create":
      return sprintCreate(args, runtime, auth);
    case "fairlx_sprint_start":
      return sprintStart(args, runtime, auth);
    case "fairlx_sprint_complete":
      return sprintComplete(args, runtime, auth);
    case "fairlx_link_create":
      return linkCreate(args, runtime, auth);
    case "fairlx_comment_add":
      return commentAdd(args, runtime, auth);
    case "fairlx_comment_update":
      return commentUpdate(args, runtime, auth);
    case "fairlx_time_log_add":
      return timeLogAdd(args, runtime, auth);
    case "fairlx_doc_create":
      return docCreate(args, runtime, auth);
    case "fairlx_doc_update":
      return docUpdate(args, runtime, auth);
    case "fairlx_custom_field_set":
      return customFieldSet(args, runtime, auth);
    case "fairlx_webhook_create":
      return webhookCreate(args, runtime, auth);
    case "fairlx_github_sync":
      return githubSync(args, runtime, auth);
    // ── New write tools ──
    case "fairlx_subtask_create":
      return subtaskCreate(args, runtime, auth);
    case "fairlx_subtask_update":
      return subtaskUpdate(args, runtime, auth);
    case "fairlx_notification_mark_read":
      return notificationMarkRead(args, runtime, auth);
    case "fairlx_saved_view_create":
      return savedViewCreate(args, runtime, auth);
    case "fairlx_sprint_update":
      return sprintUpdate(args, runtime, auth);
    case "fairlx_workspace_member_update":
      return workspaceMemberUpdate(args, runtime, auth);
    case "fairlx_workspace_member_add":
      return workspaceMemberAdd(args, runtime, auth);
    case "fairlx_project_team_create":
      return projectTeamCreate(args, runtime, auth);
    case "fairlx_project_team_update":
      return projectTeamUpdate(args, runtime, auth);
    case "fairlx_project_member_add":
      return projectMemberAdd(args, runtime, auth);
    case "fairlx_project_team_member_add":
      return projectTeamMemberAdd(args, runtime, auth);
    case "fairlx_organization_update":
      return organizationUpdate(args, runtime, auth);
    case "fairlx_department_create":
      return departmentCreate(args, runtime, auth);
    case "fairlx_department_permission_add":
      return departmentPermissionAdd(args, runtime, auth);
    default:
      throw invalidParams(`Unknown write tool: ${name}`);
  }
}

async function projectCreate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  const name = requireString(args, "name");
  assertWorkspaceBound(auth, workspaceId);
  const members = await runtime.store.list<Record<string, unknown>>(runtime.collections.members, [
    { type: "equal", field: "userId", value: auth.actorUserId },
    { type: "equal", field: "workspaceId", value: workspaceId },
    { type: "limit", value: 1 },
  ]);
  if (members.documents.length === 0) throw notFoundError("Not found");

  const run = async () => {
    const project = await runtime.store.create<Record<string, unknown>>(runtime.collections.projects, {
      name,
      workspaceId,
      description: optionalString(args, "description") ?? "",
      boardType: optionalString(args, "boardType") ?? "SCRUM",
      status: "ACTIVE",
    });
    await audit(runtime, {
      workspaceId,
      projectId: project.$id,
      userId: auth.actorUserId,
      action: "mcp.project.create",
      resourceType: "project",
      resourceId: project.$id,
      resourceName: name,
    });
    return toolResult({ project: withId(project) });
  };
  const key = optionalString(args, "idempotencyKey");
  if (key) return withIdempotency(runtime, key, "fairlx_project_create", run);
  return run();
}

async function projectUpdate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_SETTINGS, [
    "admin:manage",
  ]);
  const patch: Record<string, unknown> = {};
  if (args.name !== undefined) patch.name = requireString(args, "name");
  if (args.description !== undefined) patch.description = String(args.description);
  if (args.status !== undefined) patch.status = requireString(args, "status");
  const project = await runtime.store.update<Record<string, unknown>>(
    runtime.collections.projects,
    projectId,
    patch
  );
  await audit(runtime, {
    projectId,
    userId: auth.actorUserId,
    action: "mcp.project.update",
    resourceType: "project",
    resourceId: projectId,
  });
  return toolResult({ project: withId(project) });
}

async function workItemCreate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  const title = requireString(args, "title");
  const access = await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.CREATE_TASKS, [
    "tasks:write",
  ]);
  const project = await loadProject(runtime, auth, projectId);
  const workspaceId = String(project.workspaceId ?? "");
  const run = async () => {
    const key = await runtime.generateWorkItemKey(projectId);
    const assigneeInput = assigneeInputFromArgs(args);
    const assigneeIds =
      assigneeInput === undefined
        ? []
        : await resolveAssigneeIds(runtime, auth, { workspaceId, projectId }, assigneeInput);
    const item = await runtime.store.create<Record<string, unknown>>(runtime.collections.workItems, {
      title,
      name: title,
      key,
      workspaceId,
      projectId,
      type: optionalString(args, "type") ?? "TASK",
      status: "TODO",
      priority: optionalString(args, "priority") ?? "MEDIUM",
      description: optionalString(args, "description") ?? "",
      sprintId: optionalString(args, "sprintId") ?? null,
      assigneeIds,
      storyPoints: typeof args.storyPoints === "number" ? args.storyPoints : undefined,
      dueDate: optionalString(args, "dueDate") ?? undefined,
      epicId:
        args.epicId !== undefined
          ? await resolveEpicId(
              runtime,
              projectId,
              optionalString(args, "type") ?? "TASK",
              args.epicId,
            )
          : null,
      labels: Array.isArray(args.labels) ? args.labels.map(String).filter(Boolean) : [],
      reporterId: auth.actorUserId,
      flagged: false,
    });
    await audit(runtime, {
      workspaceId: project.workspaceId,
      projectId,
      userId: auth.actorUserId,
      action: "mcp.work_item.create",
      resourceType: "work_item",
      resourceId: item.$id,
      resourceName: title,
    });
    void access;
    const names = (await hydrateWorkItemAssignees(runtime, [item]))[0] ?? [];
    const epic = (await hydrateWorkItemEpics(runtime, [item]))[0] ?? null;
    return toolResult({
      workItem: compactWorkItem(item, names, epic),
      assigned: names.length > 0,
    });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_work_item_create", run);
  return run();
}

async function namedWorkspaceAssignees(
  runtime: McpRuntime,
  workspaceId: string
): Promise<Array<NamedMember & { membershipId: string }>> {
  const docs = await listAllDocuments(runtime, runtime.collections.members, [
    { type: "equal", field: "workspaceId", value: workspaceId },
  ]);
  const hydrated = await hydrateMembers(runtime, docs);
  return docs.map((doc, index) => ({
    id: String(doc.userId ?? ""),
    membershipId: String(doc.$id ?? doc.id ?? ""),
    name: hydrated[index]?.name ?? "",
    email: hydrated[index]?.email ?? "",
    role: hydrated[index]?.role ?? String(doc.role ?? "MEMBER"),
    status: hydrated[index]?.status ?? String(doc.status ?? "ACTIVE"),
  }));
}

function assigneeInputFromArgs(args: Record<string, unknown>): unknown {
  if (args.assigneeIds !== undefined) return args.assigneeIds;
  if (args.assigneeId !== undefined) return args.assigneeId;
  if (args.assignee !== undefined) return args.assignee;
  return undefined;
}

function coerceAssigneeList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  throw invalidParams("assigneeIds must be an array of user ids, names, or emails");
}

async function resolveAssigneeIds(
  runtime: McpRuntime,
  auth: AuthContext,
  item: Record<string, unknown>,
  raw: unknown
): Promise<string[]> {
  const entries = coerceAssigneeList(raw);
  const workspaceId = String(item.workspaceId ?? auth.workspaceId ?? "");
  const projectId = String(item.projectId ?? auth.projectId ?? "");
  const named = workspaceId ? await namedWorkspaceAssignees(runtime, workspaceId) : [];
  const resolved: string[] = [];

  for (const entry of entries) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const value = entry.trim();
    if (workspaceId && value === workspaceId) {
      throw invalidParams(
        "assigneeIds must be a person (name, email, or user id), not the workspace id.",
      );
    }
    if (projectId && value === projectId) {
      throw invalidParams("assigneeIds must be a person (name, email, or user id), not the project id.");
    }
    const byMembership = named.find((member) => member.membershipId === value);
    if (byMembership?.membershipId) {
      resolved.push(byMembership.membershipId);
      continue;
    }
    const byUserId = named.find((member) => member.id === value);
    if (byUserId?.membershipId) {
      resolved.push(byUserId.membershipId);
      continue;
    }
    const matched = matchWorkspaceMember(value, named);
    if (matched.kind === "one") {
      const person = named.find(
        (member) => member.id === matched.member.id && member.email === matched.member.email
      );
      if (!person?.membershipId) {
        throw invalidParams(
          `Matched ${matched.member.name || matched.member.email} but they have no workspace membership id.`,
        );
      }
      resolved.push(person.membershipId);
      continue;
    }
    if (matched.kind === "many") {
      throw invalidParams(
        `Several people match "${value}". Say which one: ${matched.members
          .map((member) => member.name || member.email)
          .join(", ")}`,
      );
    }
    throw invalidParams(
      `No workspace member matches "${value}". They must be in this workspace first. Pass their name or email, not a project or workspace id.`,
    );
  }
  return [...new Set(resolved)];
}

function isEpicType(value: unknown): boolean {
  return String(value ?? "").toUpperCase() === "EPIC";
}

function normalizeEpicTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function epicTitleScore(itemTitle: string, epicTitle: string): number {
  const item = normalizeEpicTitle(itemTitle);
  const epic = normalizeEpicTitle(epicTitle);
  if (!item || !epic) return 0;
  if (item === epic) return 1000;
  if (item.includes(epic) || epic.includes(item)) return 400 + Math.min(epic.length, 80);
  const itemTokens = new Set(item.split(" ").filter((token) => token.length > 2));
  const epicTokens = epic.split(" ").filter((token) => token.length > 2);
  if (!epicTokens.length) return 0;
  let hits = 0;
  for (const token of epicTokens) {
    if (itemTokens.has(token)) hits += 1;
  }
  return hits * 20;
}

async function listProjectEpics(
  runtime: McpRuntime,
  projectId: string,
): Promise<Record<string, unknown>[]> {
  const docs = await listAllDocuments(runtime, runtime.collections.workItems, [
    { type: "equal", field: "projectId", value: projectId },
  ]);
  return docs.filter((doc) => isEpicType(doc.type));
}

async function resolveEpicId(
  runtime: McpRuntime,
  projectId: string,
  itemType: string,
  raw: unknown,
): Promise<string | null> {
  if (raw === null || raw === undefined || raw === "" || raw === "none" || raw === "null") {
    return null;
  }
  if (typeof raw !== "string" || !raw.trim()) {
    throw invalidParams("epicId must be an epic key, title, or document id");
  }
  if (isEpicType(itemType)) {
    throw invalidParams("Epics cannot be parented to another epic. Pass epicId on stories, tasks, and bugs.");
  }
  const value = raw.trim();
  const epics = await listProjectEpics(runtime, projectId);
  if (!epics.length) {
    throw invalidParams("No epics in this project. Create an EPIC work item first, then assign it.");
  }
  const byId = epics.find((epic) => String(epic.$id ?? epic.id ?? "") === value);
  if (byId) return String(byId.$id ?? byId.id);
  const byKey = epics.find((epic) => String(epic.key ?? "").toUpperCase() === value.toUpperCase());
  if (byKey) return String(byKey.$id ?? byKey.id);
  const wanted = normalizeEpicTitle(value);
  const titleMatches = epics.filter((epic) => {
    const title = normalizeEpicTitle(String(epic.title ?? epic.name ?? ""));
    return title === wanted || title.includes(wanted) || wanted.includes(title);
  });
  if (titleMatches.length === 1) return String(titleMatches[0]!.$id ?? titleMatches[0]!.id);
  if (titleMatches.length > 1) {
    throw invalidParams(
      `Several epics match "${value}". Pass the epic key: ${titleMatches
        .map((epic) => String(epic.key ?? epic.title ?? ""))
        .join(", ")}`,
    );
  }
  throw invalidParams(
    `No epic matches "${value}". Pass an epic key or title from type=EPIC items.`,
  );
}

function pickEpicForItem(
  title: string,
  epics: Record<string, unknown>[],
  fallbackIndex: number,
): { epic: Record<string, unknown>; matchedBy: "title" | "fallback" } {
  let best = epics[0]!;
  let bestScore = -1;
  for (const epic of epics) {
    const score = epicTitleScore(title, String(epic.title ?? epic.name ?? ""));
    if (score > bestScore) {
      bestScore = score;
      best = epic;
    }
  }
  if (bestScore <= 0) {
    return { epic: epics[fallbackIndex % epics.length]!, matchedBy: "fallback" };
  }
  return { epic: best, matchedBy: "title" };
}

async function compactUpdatedWorkItem(
  runtime: McpRuntime,
  item: Record<string, unknown>,
) {
  const names = (await hydrateWorkItemAssignees(runtime, [item]))[0] ?? [];
  const epic = (await hydrateWorkItemEpics(runtime, [item]))[0] ?? null;
  return compactWorkItem(item, names, epic);
}

async function workItemUpdate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  const item = await loadWorkItem(runtime, auth, workItemId);
  const documentId = workItemDocumentId(item);
  const projectId = String(item.projectId);
  const access = await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_TASKS, [
    "tasks:write",
  ]);
  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) {
    patch.title = requireString(args, "title");
    patch.name = patch.title;
  }
  if (args.priority !== undefined) patch.priority = requireString(args, "priority");
  if (args.description !== undefined) patch.description = String(args.description);
  if (args.sprintId !== undefined) patch.sprintId = args.sprintId;
  const assigneeInput = assigneeInputFromArgs(args);
  if (assigneeInput !== undefined) {
    patch.assigneeIds = await resolveAssigneeIds(runtime, auth, item, assigneeInput);
  }
  if (args.storyPoints !== undefined) patch.storyPoints = args.storyPoints;
  if (args.dueDate !== undefined) patch.dueDate = args.dueDate ? String(args.dueDate) : null;
  if (args.epicId !== undefined) {
    patch.epicId = await resolveEpicId(
      runtime,
      projectId,
      String(item.type ?? "TASK"),
      args.epicId,
    );
  }
  if (args.labels !== undefined) {
    patch.labels = Array.isArray(args.labels) ? args.labels.map(String).filter(Boolean) : [];
  }
  if (args.status !== undefined) {
    const toStatus = requireString(args, "status");
    const fromStatus = String(item.status ?? "TODO");
    const project = await loadProject(runtime, auth, projectId);
    const check = await runtime.validateStatusTransition({
      workflowId: String(project.workflowId ?? ""),
      fromStatus,
      toStatus,
      userId: auth.actorUserId,
      projectId,
      memberRole: access.role,
    });
    if (!check.allowed) {
      throw invalidParams(check.reason ?? "Status transition not allowed");
    }
    patch.status = toStatus;
  }
  const updated = await runtime.store.update<Record<string, unknown>>(
    runtime.collections.workItems,
    documentId,
    patch
  );
  const names = (await hydrateWorkItemAssignees(runtime, [updated]))[0] ?? [];
  const epic = (await hydrateWorkItemEpics(runtime, [updated]))[0] ?? null;
  return toolResult({
    workItem: compactWorkItem(updated, names, epic),
    assigned: assigneeInput !== undefined ? names.length > 0 : undefined,
  });
}

async function assignEpicsInProject(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const projectId = optionalString(args, "projectId") || auth.projectId;
  if (!projectId) {
    throw invalidParams("projectId is required when assignEpics is true");
  }
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_TASKS, ["tasks:write"]);
  const docs = await listAllDocuments(runtime, runtime.collections.workItems, [
    { type: "equal", field: "projectId", value: projectId },
  ]);
  const epics = docs.filter((doc) => isEpicType(doc.type));
  if (!epics.length) {
    throw invalidParams("No epics in this project. Create EPIC work items first, then assign them.");
  }
  const requested = Array.isArray(args.workItemIds)
    ? new Set(
        args.workItemIds
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          .map((id) => id.trim().toUpperCase()),
      )
    : null;
  const epicIds = new Set(epics.map((epic) => String(epic.$id ?? epic.id ?? "")));
  const children = docs.filter((doc) => {
    if (isEpicType(doc.type)) return false;
    const key = String(doc.key ?? "").toUpperCase();
    const id = String(doc.$id ?? doc.id ?? "");
    if (requested && requested.size > 0) {
      return requested.has(key) || requested.has(id.toUpperCase());
    }
    const current = String(doc.epicId ?? "").trim();
    return !current || !epicIds.has(current);
  });
  const updated: unknown[] = [];
  const mapping: Array<{ key: string; epicKey: string; epicTitle: string; matchedBy: string }> = [];
  let fallbackIndex = 0;
  for (const item of children) {
    const title = String(item.title ?? item.name ?? "");
    const picked = pickEpicForItem(title, epics, fallbackIndex);
    fallbackIndex += 1;
    const epicId = String(picked.epic.$id ?? picked.epic.id ?? "");
    const doc = await runtime.store.update<Record<string, unknown>>(
      runtime.collections.workItems,
      workItemDocumentId(item),
      { epicId },
    );
    updated.push(await compactUpdatedWorkItem(runtime, doc));
    mapping.push({
      key: String(doc.key ?? item.key ?? ""),
      epicKey: String(picked.epic.key ?? ""),
      epicTitle: String(picked.epic.title ?? picked.epic.name ?? ""),
      matchedBy: picked.matchedBy,
    });
  }
  return toolResult({
    count: updated.length,
    assignedKeys: mapping.map((row) => row.key).filter(Boolean),
    mapping,
    workItems: updated,
  });
}

function documentSprintId(doc: Record<string, unknown>): string {
  if (doc.sprintId == null) return "";
  const value = String(doc.sprintId).trim();
  if (!value || value === "null" || value === "undefined") return "";
  return value;
}

function sprintOrdinal(name: string): number | undefined {
  const match = name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .match(/^sprint\s+(\d+)\b/);
  return match ? Number(match[1]) : undefined;
}

function sprintNameMatches(name: string, query: string): boolean {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  const q = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!n || !q) return false;
  if (n === q) return true;
  const numbered = q.match(/^(?:sprint\s+)?(\d+)$/);
  if (numbered) return sprintOrdinal(n) === Number(numbered[1]);
  if (n.startsWith(q) && (n.length === q.length || /[\s—–-]/.test(n[q.length] ?? ""))) return true;
  return false;
}

async function resolveSprintId(
  runtime: McpRuntime,
  projectId: string,
  raw: string,
): Promise<string> {
  const query = raw.trim();
  if (!query) throw invalidParams("sprintId is required");
  try {
    const sprint = await runtime.store.get<Record<string, unknown>>(runtime.collections.sprints, query);
    if (String(sprint.projectId ?? "") === projectId) {
      return String(sprint.$id ?? sprint.id ?? query);
    }
  } catch {
    // Resolve by sprint name / number next.
  }
  const docs = await listAllDocuments(runtime, runtime.collections.sprints, [
    { type: "equal", field: "projectId", value: projectId },
  ]);
  const matches = docs.filter((doc) => sprintNameMatches(String(doc.name ?? ""), query));
  if (matches.length === 1) return String(matches[0]!.$id ?? matches[0]!.id ?? "");
  if (matches.length > 1) {
    throw invalidParams(
      `Several sprints match "${query}": ${matches
        .map((doc) => String(doc.name ?? ""))
        .filter(Boolean)
        .join(", ")}. Pass the sprint id.`,
    );
  }
  throw notFoundError(`Sprint not found: ${query}`);
}

function isEmptyAssigneeInput(raw: unknown): boolean {
  if (raw === undefined) return true;
  if (Array.isArray(raw)) {
    return raw.every((entry) => typeof entry !== "string" || !entry.trim());
  }
  if (typeof raw === "string") return !raw.trim();
  return false;
}

function workItemKeysOf(docs: Record<string, unknown>[]): string[] {
  return docs.map((doc) => String(doc.key ?? doc.$id ?? "")).filter(Boolean);
}

async function workItemBulkUpdate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const percent = parseAssignPercent(args.assignPercent ?? args.percent);
  if (percent !== undefined && percent !== 0 && (percent < 1 || percent > 100)) {
    throw invalidParams("assignPercent must be 0 (clear assignees) or between 1 and 100");
  }
  const assignEpics = optionalBoolean(args, "assignEpics") === true;
  if (assignEpics) {
    return assignEpicsInProject(args, runtime, auth);
  }
  const explicitIds = Array.isArray(args.workItemIds)
    ? args.workItemIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  let ids = explicitIds;
  const sprintRef =
    optionalString(args, "sprint") ||
    optionalString(args, "sprintName") ||
    optionalString(args, "sprintId");
  const assigneeInput = assigneeInputFromArgs(args);
  const clearAssignees =
    optionalBoolean(args, "clearAssignees") === true ||
    percent === 0 ||
    (ids.length === 0 && args.assigneeIds !== undefined && isEmptyAssigneeInput(assigneeInput));
  const wantsSprintAssign =
    ids.length === 0 && !clearAssignees && Boolean(sprintRef) && !isEmptyAssigneeInput(assigneeInput);
  let share:
    | {
        total: number;
        percent: number;
        target: number;
        already: string[];
        pick: string[];
      }
    | undefined;
  let sprintUsedAsScope = false;
  if (ids.length === 0 && (clearAssignees || wantsSprintAssign)) {
    const projectId = optionalString(args, "projectId") || auth.projectId;
    if (!projectId) {
      throw invalidParams("projectId is required when updating a sprint or clearing assignees without workItemIds");
    }
    await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_TASKS, ["tasks:write"]);
    sprintUsedAsScope = true;
    const docs = await listAllDocuments(runtime, runtime.collections.workItems, [
      { type: "equal", field: "projectId", value: projectId },
    ]);
    let scoped = docs;
    if (sprintRef) {
      const sprintId = await resolveSprintId(runtime, projectId, sprintRef);
      scoped = docs.filter((doc) => documentSprintId(doc) === sprintId);
    } else if (optionalBoolean(args, "includeBacklog") !== true) {
      scoped = docs.filter((doc) => Boolean(documentSprintId(doc)));
    }
    ids = workItemKeysOf(scoped);
    if (ids.length === 0) {
      return toolResult({
        count: 0,
        cleared: clearAssignees,
        assigned: false,
        assignedKeys: [],
        workItems: [],
      });
    }
  } else if (ids.length === 0 && percent !== undefined && percent > 0) {
    const projectId = optionalString(args, "projectId") || auth.projectId;
    if (!projectId) {
      throw invalidParams("projectId is required when using assignPercent without workItemIds");
    }
    await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_TASKS, ["tasks:write"]);
    if (isEmptyAssigneeInput(assigneeInput)) {
      throw invalidParams("assigneeIds is required when using assignPercent");
    }
    const person = String(coerceAssigneeList(assigneeInput)[0] ?? "").trim();
    const docs = await listAllDocuments(runtime, runtime.collections.workItems, [
      { type: "equal", field: "projectId", value: projectId },
    ]);
    const namesByRow = await hydrateWorkItemAssignees(runtime, docs);
    const listed = docs.map((doc, index) => {
      const names = namesByRow[index] ?? [];
      const compact = compactWorkItem(doc, names);
      return {
        key: compact.key,
        unassigned: compact.unassigned,
        assignees: names,
      };
    });
    share = pickAssignShareKeys(listed, person, percent);
    ids = share.pick;
    if (ids.length === 0) {
      return toolResult({
        count: 0,
        assigned: share.already.length >= share.target,
        target: share.target,
        alreadyAssigned: share.already,
        assignedKeys: [],
        workItems: [],
      });
    }
  } else if (ids.length === 0 && args.epicId !== undefined) {
    const projectId = optionalString(args, "projectId") || auth.projectId;
    if (!projectId) {
      throw invalidParams("projectId is required when setting epicId without workItemIds");
    }
    await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_TASKS, ["tasks:write"]);
    const docs = await listAllDocuments(runtime, runtime.collections.workItems, [
      { type: "equal", field: "projectId", value: projectId },
    ]);
    ids = docs
      .filter((doc) => !isEpicType(doc.type) && !String(doc.epicId ?? "").trim())
      .map((doc) => String(doc.key ?? doc.$id ?? ""))
      .filter(Boolean);
    if (ids.length === 0) {
      return toolResult({ count: 0, assignedKeys: [], workItems: [], alreadyHadEpic: true });
    }
  } else if (ids.length === 0) {
    throw invalidParams(
      "workItemIds is required. To unassign every sprint item, pass clearAssignees: true. To assign a whole sprint, pass sprintId (name or number) and assigneeIds.",
    );
  }
  const updated: unknown[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const item = await loadWorkItem(runtime, auth, id);
    await requireProjectAccess(runtime, auth, String(item.projectId), PERMISSIONS.EDIT_TASKS, [
      "tasks:write",
    ]);
    const patch: Record<string, unknown> = {};
    if (args.status !== undefined) patch.status = args.status;
    if (!sprintUsedAsScope && explicitIds.length > 0 && args.sprintId !== undefined) {
      patch.sprintId = args.sprintId;
    }
    if (clearAssignees) {
      patch.assigneeIds = [];
    } else if (assigneeInput !== undefined) {
      patch.assigneeIds = await resolveAssigneeIds(runtime, auth, item, assigneeInput);
    }
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.epicId !== undefined) {
      patch.epicId = await resolveEpicId(
        runtime,
        String(item.projectId),
        String(item.type ?? "TASK"),
        args.epicId,
      );
    }
    const doc = await runtime.store.update(
      runtime.collections.workItems,
      workItemDocumentId(item),
      patch
    );
    updated.push(await compactUpdatedWorkItem(runtime, doc as Record<string, unknown>));
  }
  return toolResult({
    workItems: updated,
    count: updated.length,
    cleared: clearAssignees,
    assigned: clearAssignees
      ? false
      : updated.every((item) => (item as { unassigned?: boolean }).unassigned !== true),
    assignedKeys: updated
      .map((item) => String((item as { key?: unknown }).key ?? ""))
      .filter(Boolean),
    ...(share
      ? {
          target: share.target,
          alreadyAssigned: share.already,
          total: share.total,
        }
      : {}),
  });
}

async function workItemSplit(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  if (!Array.isArray(args.titles) || args.titles.length === 0) {
    throw invalidParams("titles is required");
  }
  const source = await loadWorkItem(runtime, auth, workItemId);
  const documentId = workItemDocumentId(source);
  const projectId = String(source.projectId);
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.CREATE_TASKS, ["tasks:write"]);
  const run = async () => {
    const created = [];
    for (const title of args.titles as unknown[]) {
      if (typeof title !== "string" || !title) continue;
      const key = await runtime.generateWorkItemKey(projectId);
      const child = await runtime.store.create<Record<string, unknown>>(
        runtime.collections.workItems,
        {
          title,
          name: title,
          key,
          workspaceId: String(source.workspaceId),
          projectId,
          type: source.type ?? "TASK",
          status: source.status ?? "TODO",
          priority: source.priority ?? "MEDIUM",
          sprintId: source.sprintId ?? null,
          epicId: source.epicId ?? null,
          assigneeIds: source.assigneeIds ?? [],
          reporterId: auth.actorUserId,
          flagged: false,
        }
      );
      await runtime.store.create(runtime.collections.workItemLinks, {
        workspaceId: source.workspaceId,
        projectId,
        sourceItemId: child.$id,
        targetItemId: documentId,
        linkType: "SPLIT_FROM",
        createdBy: auth.actorUserId,
      });
      await runtime.store.create(runtime.collections.workItemLinks, {
        workspaceId: source.workspaceId,
        projectId,
        sourceItemId: documentId,
        targetItemId: child.$id,
        linkType: "SPLIT_TO",
        createdBy: auth.actorUserId,
      });
      created.push(withId(child));
    }
    return toolResult({ sourceId: documentId, created });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_work_item_split", run);
  return run();
}

async function sprintCreate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  const name = requireString(args, "name");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.CREATE_SPRINTS, [
    "sprints:manage",
  ]);
  const project = await loadProject(runtime, auth, projectId);
  const existing = await runtime.store.list<Record<string, unknown>>(runtime.collections.sprints, [
    { type: "equal", field: "projectId", value: projectId },
    { type: "limit", value: 1 },
  ]);
  const isFirstSprint = existing.total === 0 && existing.documents.length === 0;
  let startOnCreate = isFirstSprint;
  if (startOnCreate) {
    try {
      await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.START_SPRINT, [
        "sprints:manage",
      ]);
    } catch {
      startOnCreate = false;
    }
  }
  const run = async () => {
    const sprint = await runtime.store.create<Record<string, unknown>>(runtime.collections.sprints, {
      name,
      workspaceId: String(project.workspaceId),
      projectId,
      goal: optionalString(args, "goal") ?? "",
      startDate: optionalString(args, "startDate"),
      endDate: optionalString(args, "endDate"),
      status: startOnCreate ? "ACTIVE" : "PLANNED",
      position: 0,
    });
    if (startOnCreate) {
      await audit(runtime, {
        projectId,
        userId: auth.actorUserId,
        action: "mcp.sprint.start",
        resourceType: "sprint",
        resourceId: sprint.$id,
      });
    }
    return toolResult({ sprint: withId(sprint), started: startOnCreate });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_sprint_create", run);
  return run();
}

async function sprintStart(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const sprintId = requireString(args, "sprintId");
  let sprint: Record<string, unknown>;
  try {
    sprint = await runtime.store.get<Record<string, unknown>>(runtime.collections.sprints, sprintId);
  } catch {
    throw notFoundError("Not found");
  }
  await requireProjectAccess(
    runtime,
    auth,
    String(sprint.projectId),
    PERMISSIONS.START_SPRINT,
    ["sprints:manage"]
  );
  const updated = await runtime.store.update<Record<string, unknown>>(
    runtime.collections.sprints,
    sprintId,
    { status: "ACTIVE" }
  );
  await audit(runtime, {
    projectId: sprint.projectId,
    userId: auth.actorUserId,
    action: "mcp.sprint.start",
    resourceType: "sprint",
    resourceId: sprintId,
  });
  return toolResult({ sprint: withId(updated) });
}

async function sprintComplete(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const sprintId = requireString(args, "sprintId");
  let sprint: Record<string, unknown>;
  try {
    sprint = await runtime.store.get<Record<string, unknown>>(runtime.collections.sprints, sprintId);
  } catch {
    throw notFoundError("Not found");
  }
  await requireProjectAccess(
    runtime,
    auth,
    String(sprint.projectId),
    PERMISSIONS.COMPLETE_SPRINT,
    ["sprints:manage"]
  );
  const updated = await runtime.store.update<Record<string, unknown>>(
    runtime.collections.sprints,
    sprintId,
    { status: "COMPLETED" }
  );
  await audit(runtime, {
    projectId: sprint.projectId,
    userId: auth.actorUserId,
    action: "mcp.sprint.complete",
    resourceType: "sprint",
    resourceId: sprintId,
  });
  return toolResult({ sprint: withId(updated) });
}

async function linkCreate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const sourceItemId = requireString(args, "sourceItemId");
  const targetItemId = requireString(args, "targetItemId");
  const linkType = requireString(args, "linkType");
  const source = await loadWorkItem(runtime, auth, sourceItemId);
  const target = await loadWorkItem(runtime, auth, targetItemId);
  const sourceId = workItemDocumentId(source);
  const targetId = workItemDocumentId(target);
  if (String(source.projectId) !== String(target.projectId)) {
    throw invalidParams("Links must be within the same project");
  }
  const projectId = String(source.projectId);
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_TASKS, ["tasks:write"]);
  if (linkType === "BLOCKS") {
    const existing = await loadBlocksLinks(runtime, projectId);
    if (wouldCreateCycle(existing, sourceId, targetId)) {
      throw invalidParams("Link would create a cycle");
    }
  }
  const run = async () => {
    const link = await runtime.store.create<Record<string, unknown>>(
      runtime.collections.workItemLinks,
      {
        workspaceId: source.workspaceId,
        projectId,
        sourceItemId: sourceId,
        targetItemId: targetId,
        linkType,
        description: optionalString(args, "description"),
        createdBy: auth.actorUserId,
      }
    );
    let inverse = null;
    if (args.createInverse && LINK_INVERSE[linkType]) {
      inverse = await runtime.store.create(runtime.collections.workItemLinks, {
        workspaceId: source.workspaceId,
        projectId,
        sourceItemId: targetId,
        targetItemId: sourceId,
        linkType: LINK_INVERSE[linkType],
        createdBy: auth.actorUserId,
      });
    }
    return toolResult({ link: withId(link), inverse });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_link_create", run);
  return run();
}

async function commentAdd(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  const content = requireString(args, "content");
  const item = await loadWorkItem(runtime, auth, workItemId);
  const documentId = workItemDocumentId(item);
  await requireProjectAccess(
    runtime,
    auth,
    String(item.projectId),
    PERMISSIONS.CREATE_COMMENTS,
    ["comments:write"]
  );
  const run = async () => {
    const comment = await runtime.store.create<Record<string, unknown>>(runtime.collections.comments, {
      taskId: documentId,
      projectId: item.projectId,
      workspaceId: item.workspaceId,
      authorId: auth.actorUserId,
      content,
      isEdited: false,
      parentId: optionalString(args, "parentId") ?? null,
    });
    return toolResult({ comment: withId(comment) });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_comment_add", run);
  return run();
}

async function commentUpdate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const commentId = requireString(args, "commentId");
  const content = requireString(args, "content");
  let comment: Record<string, unknown>;
  try {
    comment = await runtime.store.get<Record<string, unknown>>(
      runtime.collections.comments,
      commentId
    );
  } catch {
    throw notFoundError("Not found");
  }
  await requireProjectAccess(
    runtime,
    auth,
    String(comment.projectId),
    PERMISSIONS.CREATE_COMMENTS,
    ["comments:write"]
  );
  const updated = await runtime.store.update<Record<string, unknown>>(
    runtime.collections.comments,
    commentId,
    { content, isEdited: true }
  );
  return toolResult({ comment: withId(updated) });
}

async function timeLogAdd(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  if (typeof args.loggedHours !== "number") throw invalidParams("loggedHours is required");
  const item = await loadWorkItem(runtime, auth, workItemId);
  const documentId = workItemDocumentId(item);
  await requireProjectAccess(runtime, auth, String(item.projectId), PERMISSIONS.EDIT_TASKS, [
    "time:write",
  ]);
  const run = async () => {
    const log = await runtime.store.create<Record<string, unknown>>(runtime.collections.timeLogs, {
      taskId: documentId,
      projectId: item.projectId,
      workspaceId: item.workspaceId,
      userId: auth.actorUserId,
      loggedHours: args.loggedHours,
      logDate: optionalString(args, "logDate") ?? new Date().toISOString(),
      description: optionalString(args, "description") ?? "",
      isBillable: args.isBillable === true,
      createdBy: auth.actorUserId,
    });
    return toolResult({ timeLog: withId(log) });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_time_log_add", run);
  return run();
}

const MAX_DOC_DESCRIPTION_CHARS = 4000;
const MAX_DOC_BODY_CHARS = 65000;
const INLINE_DOC_FILE_ID = "mcp-inline";

async function findInlineDocByCategory(
  runtime: McpRuntime,
  projectId: string,
  category: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const page = await runtime.store.list<Record<string, unknown>>(runtime.collections.projectDocs, [
      { type: "equal", field: "projectId", value: projectId },
      { type: "limit", value: 100 },
    ]);
    return page.documents.find(
      (doc) =>
        String(doc.category ?? "") === category &&
        String(doc.fileId ?? "") === INLINE_DOC_FILE_ID &&
        doc.isArchived !== true,
    );
  } catch {
    return undefined;
  }
}

function splitProjectDocContent(content: string): { description: string; aiSummary: string; size: number } {
  const body = content.trim();
  return {
    description: body.slice(0, MAX_DOC_DESCRIPTION_CHARS),
    aiSummary: body.slice(0, MAX_DOC_BODY_CHARS),
    size: body.length,
  };
}

function requireSubstantialDoc(content: string, sources: unknown): string {
  const body = content.trim();
  const qualityError = projectDocQualityError(body, sources);
  if (qualityError) throw invalidParams(qualityError);
  if (!hasNotionDocStructure(body)) {
    throw invalidParams(NOTION_DOC_STRUCTURE_ERROR);
  }
  return normalizeMarkdownSpacing(body);
}

async function docCreate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  const title = requireString(args, "title");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.CREATE_DOCS, ["docs:write"]);
  const project = await loadProject(runtime, auth, projectId);
  const content = requireSubstantialDoc(optionalString(args, "content") ?? "", args.sources);
  const split = splitProjectDocContent(content);
  const category = optionalString(args, "category") ?? "other";
  const run = async () => {
    const existing =
      isDocPackCategory(category) ? await findInlineDocByCategory(runtime, projectId, category) : undefined;
    if (existing?.$id || existing?.id) {
      await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_DOCS, ["docs:write"]);
      const docId = String(existing.$id ?? existing.id);
      const updated = await runtime.store.update<Record<string, unknown>>(
        runtime.collections.projectDocs,
        docId,
        {
          title,
          name: title,
          description: split.description,
          aiSummary: split.aiSummary,
          size: split.size,
          mimeType: "text/markdown",
          tags: Array.isArray(args.tags) ? args.tags : existing.tags,
          category,
        },
      );
      return toolResult({ doc: withId(updated), updated: true });
    }
    const doc = await runtime.store.create<Record<string, unknown>>(
      runtime.collections.projectDocs,
      {
        title,
        name: title,
        description: split.description,
        aiSummary: split.aiSummary,
        projectId,
        workspaceId: String(project.workspaceId),
        category,
        size: split.size,
        mimeType: "text/markdown",
        fileId: INLINE_DOC_FILE_ID,
        uploadedBy: auth.actorUserId,
        tags: Array.isArray(args.tags) ? args.tags : [],
        version: "1.0",
        isArchived: false,
      }
    );
    return toolResult({ doc: withId(doc), updated: false });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_doc_create", run);
  return run();
}

async function docUpdate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const docId = requireString(args, "docId");
  let doc: Record<string, unknown>;
  try {
    doc = await runtime.store.get<Record<string, unknown>>(runtime.collections.projectDocs, docId);
  } catch {
    throw notFoundError("Not found");
  }
  await requireProjectAccess(runtime, auth, String(doc.projectId), PERMISSIONS.EDIT_DOCS, [
    "docs:write",
  ]);
  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) {
    patch.title = requireString(args, "title");
    patch.name = patch.title;
  }
  if (args.content !== undefined) {
    const body = requireSubstantialDoc(String(args.content), args.sources);
    const split = splitProjectDocContent(body);
    patch.description = split.description;
    patch.aiSummary = split.aiSummary;
    patch.size = split.size;
    patch.mimeType = "text/markdown";
  }
  if (args.category !== undefined) patch.category = args.category;
  if (args.tags !== undefined) patch.tags = args.tags;
  if (args.isArchived !== undefined) patch.isArchived = args.isArchived;
  const updated = await runtime.store.update<Record<string, unknown>>(
    runtime.collections.projectDocs,
    docId,
    patch
  );
  return toolResult({ doc: withId(updated) });
}

async function customFieldSet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  const fieldId = requireString(args, "fieldId");
  const item = await loadWorkItem(runtime, auth, workItemId);
  const documentId = workItemDocumentId(item);
  await requireProjectAccess(runtime, auth, String(item.projectId), PERMISSIONS.EDIT_TASKS, [
    "tasks:write",
  ]);
  const fields = parseCustomFields(item.customFields);
  const idx = fields.findIndex((f) => f.fieldId === fieldId);
  if (idx >= 0) fields[idx] = { fieldId, value: args.value };
  else fields.push({ fieldId, value: args.value });
  const updated = await runtime.store.update<Record<string, unknown>>(
    runtime.collections.workItems,
    documentId,
    { customFields: JSON.stringify(fields) }
  );
  return toolResult({ workItem: withId(updated), customFields: fields });
}

async function webhookCreate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  const name = requireString(args, "name");
  const url = requireString(args, "url");
  if (!Array.isArray(args.events)) throw invalidParams("events is required");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_SETTINGS, [
    "admin:manage",
  ]);
  const project = await loadProject(runtime, auth, projectId);
  const run = async () => {
    const webhook = await runtime.store.create<Record<string, unknown>>(
      runtime.collections.projectWebhooks,
      {
        projectId,
        workspaceId: String(project.workspaceId),
        name,
        url,
        secret: optionalString(args, "secret") ?? "",
        events: JSON.stringify(args.events),
        enabled: true,
        createdByUserId: auth.actorUserId,
        failureCount: 0,
      }
    );
    return toolResult({ webhook: withId(webhook) });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_webhook_create", run);
  return run();
}

async function githubSync(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_SETTINGS, [
    "admin:manage",
  ]);
  const repos = await runtime.store.list<Record<string, unknown>>(runtime.collections.githubRepos, [
    { type: "equal", field: "projectId", value: projectId },
    { type: "limit", value: 50 },
  ]);
  const synced = [];
  const now = runtime.now();
  for (const repo of repos.documents) {
    const updated = await runtime.store.update<Record<string, unknown>>(
      runtime.collections.githubRepos,
      String(repo.$id),
      { status: "syncing", lastSyncedAt: now }
    );
    synced.push(redactGithubRepo(withId(updated)));
  }
  return toolResult({ repositories: synced, count: synced.length });
}

// ═══════════════════════════════════════════════════════════════════
// NEW write tools
// ═══════════════════════════════════════════════════════════════════

async function subtaskCreate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  const title = requireString(args, "title");
  const item = await loadWorkItem(runtime, auth, workItemId);
  const documentId = workItemDocumentId(item);
  await requireProjectAccess(
    runtime,
    auth,
    String(item.projectId),
    PERMISSIONS.EDIT_TASKS,
    ["tasks:write"]
  );
  const run = async () => {
    const subtask = await runtime.store.create<Record<string, unknown>>(runtime.collections.subtasks, {
      parentTaskId: documentId,
      projectId: item.projectId,
      workspaceId: item.workspaceId,
      title,
      isCompleted: false,
      createdBy: auth.actorUserId,
    });
    return toolResult({ subtask: withId(subtask) });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_subtask_create", run);
  return run();
}

async function subtaskUpdate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const subtaskId = requireString(args, "subtaskId");
  let subtask: Record<string, unknown>;
  try {
    subtask = await runtime.store.get<Record<string, unknown>>(runtime.collections.subtasks, subtaskId);
  } catch {
    throw notFoundError("Not found");
  }
  const projectId = String(subtask.projectId);
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_TASKS, ["tasks:write"]);
  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) patch.title = requireString(args, "title");
  if (args.isCompleted !== undefined) patch.isCompleted = Boolean(args.isCompleted);
  const updated = await runtime.store.update<Record<string, unknown>>(
    runtime.collections.subtasks,
    subtaskId,
    patch
  );
  return toolResult({ subtask: withId(updated) });
}

async function notificationMarkRead(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const notificationId = optionalString(args, "notificationId");
  const markAll = args.markAll === true;
  if (!notificationId && !markAll) {
    throw invalidParams("notificationId or markAll is required");
  }
  if (notificationId) {
    let notification: Record<string, unknown>;
    try {
      notification = await runtime.store.get<Record<string, unknown>>(
        runtime.collections.notifications,
        notificationId
      );
    } catch {
      throw notFoundError("Not found");
    }
    // Only allow marking own notifications
    if (String(notification.userId) !== auth.actorUserId) {
      throw notFoundError("Not found");
    }
    const updated = await runtime.store.update<Record<string, unknown>>(
      runtime.collections.notifications,
      notificationId,
      { isRead: true }
    );
    return toolResult({ notification: withId(updated) });
  }
  // Mark all unread notifications as read
  const queries: import("../runtime/types").McpQuery[] = [
    { type: "equal", field: "userId", value: auth.actorUserId },
    { type: "equal", field: "isRead", value: false },
    { type: "limit", value: 100 },
  ];
  const workspaceId = optionalString(args, "workspaceId");
  if (workspaceId) {
    queries.push({ type: "equal", field: "workspaceId", value: workspaceId });
  }
  const unread = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.notifications,
    queries
  );
  let count = 0;
  for (const n of unread.documents) {
    await runtime.store.update(runtime.collections.notifications, String(n.$id), { isRead: true });
    count++;
  }
  return toolResult({ markedRead: count });
}

async function savedViewCreate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  const name = requireString(args, "name");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.CREATE_VIEWS, ["views:write"]);
  const project = await loadProject(runtime, auth, projectId);
  const run = async () => {
    const view = await runtime.store.create<Record<string, unknown>>(runtime.collections.savedViews, {
      projectId,
      workspaceId: String(project.workspaceId),
      name,
      filters: optionalString(args, "filters") ?? "{}",
      isShared: args.isShared === true,
      createdBy: auth.actorUserId,
    });
    return toolResult({ view: withId(view) });
  };
  const idem = optionalString(args, "idempotencyKey");
  if (idem) return withIdempotency(runtime, idem, "fairlx_saved_view_create", run);
  return run();
}

async function sprintUpdate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const sprintId = requireString(args, "sprintId");
  let sprint: Record<string, unknown>;
  try {
    sprint = await runtime.store.get<Record<string, unknown>>(runtime.collections.sprints, sprintId);
  } catch {
    throw notFoundError("Not found");
  }
  await requireProjectAccess(
    runtime,
    auth,
    String(sprint.projectId),
    PERMISSIONS.EDIT_SPRINTS,
    ["sprints:manage"]
  );
  const patch: Record<string, unknown> = {};
  if (args.name !== undefined) patch.name = requireString(args, "name");
  if (args.goal !== undefined) patch.goal = String(args.goal);
  if (args.startDate !== undefined) patch.startDate = String(args.startDate);
  if (args.endDate !== undefined) patch.endDate = String(args.endDate);
  const updated = await runtime.store.update<Record<string, unknown>>(
    runtime.collections.sprints,
    sprintId,
    patch
  );
  await audit(runtime, {
    projectId: sprint.projectId,
    userId: auth.actorUserId,
    action: "mcp.sprint.update",
    resourceType: "sprint",
    resourceId: sprintId,
  });
  return toolResult({ sprint: withId(updated) });
}

async function listAllWorkspaceMembers(
  runtime: McpRuntime,
  workspaceId: string
): Promise<Record<string, unknown>[]> {
  return listAllDocuments(runtime, runtime.collections.members, [
    { type: "equal", field: "workspaceId", value: workspaceId },
  ]);
}

async function requireWorkspaceAdmin(
  runtime: McpRuntime,
  auth: AuthContext,
  workspaceId: string
): Promise<{ role: string }> {
  assertWorkspaceBound(auth, workspaceId);
  if (!hasScope(auth.scopes, ["admin:manage"])) {
    throw forbiddenError("Insufficient MCP scope");
  }
  const membership = await runtime.store.list<Record<string, unknown>>(runtime.collections.members, [
    { type: "equal", field: "userId", value: auth.actorUserId },
    { type: "equal", field: "workspaceId", value: workspaceId },
    { type: "limit", value: 1 },
  ]);
  const actor = membership.documents[0];
  if (!actor) throw notFoundError("Not found");
  const role = String(actor.role ?? "");
  if (!isWorkspaceAdminRole(role)) {
    throw forbiddenError("Only workspace admins can manage members");
  }
  return { role: role.toUpperCase() };
}

async function workspaceMemberUpdate(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  const actor = await requireWorkspaceAdmin(runtime, auth, workspaceId);
  let role: "OWNER" | "ADMIN" | "MEMBER";
  try {
    role = normalizeMemberRole(requireString(args, "role"));
  } catch (error) {
    throw invalidParams(error instanceof Error ? error.message : "Invalid role");
  }
  if (role === "OWNER" && actor.role !== "OWNER") {
    throw forbiddenError("Only the workspace owner can grant owner");
  }

  const docs = await listAllWorkspaceMembers(runtime, workspaceId);
  const hydrated = await hydrateMembers(runtime, docs);
  const named: NamedMember[] = docs.map((doc, index) => ({
    id: String(doc.$id ?? doc.id ?? ""),
    name: hydrated[index]?.name ?? "",
    email: hydrated[index]?.email ?? "",
    role: hydrated[index]?.role ?? String(doc.role ?? "MEMBER"),
    status: hydrated[index]?.status ?? String(doc.status ?? "ACTIVE"),
  }));

  const query = optionalString(args, "email") || optionalString(args, "name") || "";
  if (!query) throw invalidParams("Provide the member's name or email");
  const matched = matchWorkspaceMember(query, named);
  if (matched.kind === "none") {
    return toolResult(
      {
        error: `No member matches "${query}".`,
        members: named.map(({ name, email, role: memberRole }) => ({
          name,
          email,
          role: memberRole,
        })),
      },
      true
    );
  }
  if (matched.kind === "many") {
    return toolResult(
      {
        error: "Several people match. Say which one.",
        matches: matched.members.map(({ name, email, role: memberRole }) => ({
          name,
          email,
          role: memberRole,
        })),
      },
      true
    );
  }

  const target = matched.member;
  const targetDoc = docs.find((doc) => String(doc.$id ?? doc.id ?? "") === target.id);
  if (!targetDoc) throw notFoundError("Not found");
  const currentRole = String(targetDoc.role ?? target.role);
  if (currentRole === "OWNER" && actor.role !== "OWNER") {
    throw forbiddenError("Only the workspace owner can change the owner's role");
  }
  if (docs.length === 1 && role !== "OWNER" && currentRole === "OWNER") {
    throw invalidParams("Cannot downgrade the only member");
  }
  if (currentRole === role) {
    return toolResult({
      member: { name: target.name, email: target.email, role, status: target.status },
      unchanged: true,
    });
  }

  await runtime.store.update(runtime.collections.members, target.id, { role });
  try {
    await runtime.onMembershipChanged?.({ userId: String(targetDoc.userId ?? ""), workspaceId });
  } catch {
    // Cache invalidation must never fail the role change.
  }
  await audit(runtime, {
    workspaceId,
    userId: auth.actorUserId,
    action: "mcp.workspace_member.update_role",
    resourceType: "member",
    resourceId: target.id,
    resourceName: target.name,
    metadata: { from: currentRole, to: role },
  });
  return toolResult({
    member: { name: target.name, email: target.email, role, status: target.status },
  });
}

async function namedWorkspaceMembers(runtime: McpRuntime, workspaceId: string) {
  const docs = await listAllWorkspaceMembers(runtime, workspaceId);
  const hydrated = await hydrateMembers(runtime, docs);
  const named: NamedMember[] = docs.map((doc, index) => ({
    id: String(doc.$id ?? doc.id ?? ""),
    name: hydrated[index]?.name ?? "",
    email: hydrated[index]?.email ?? "",
    role: hydrated[index]?.role ?? String(doc.role ?? "MEMBER"),
    status: hydrated[index]?.status ?? String(doc.status ?? "ACTIVE"),
  }));
  return { docs, named };
}

function matchQueryResult(
  query: string,
  named: NamedMember[],
  emptyMessage: string
) {
  const matched = matchWorkspaceMember(query, named);
  if (matched.kind === "none") {
    return {
      error: true as const,
      payload: {
        error: emptyMessage,
        members: named.map(({ name, email, role: memberRole }) => ({
          name,
          email,
          role: memberRole,
        })),
      },
    };
  }
  if (matched.kind === "many") {
    return {
      error: true as const,
      payload: {
        error: "Several people match. Say which one.",
        matches: matched.members.map(({ name, email, role: memberRole }) => ({
          name,
          email,
          role: memberRole,
        })),
      },
    };
  }
  return { error: false as const, member: matched.member };
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function displayNameFromInvite(args: Record<string, unknown>, email: string): string {
  return optionalString(args, "name") || email.split("@")[0] || "Member";
}

async function workspaceMemberAdd(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  const actor = await requireWorkspaceAdmin(runtime, auth, workspaceId);
  let role: "OWNER" | "ADMIN" | "MEMBER" = "MEMBER";
  const rawRole = optionalString(args, "role");
  if (rawRole) {
    try {
      role = normalizeMemberRole(rawRole);
    } catch (error) {
      throw invalidParams(error instanceof Error ? error.message : "Invalid role");
    }
  }
  if (role === "OWNER" && actor.role !== "OWNER") {
    throw forbiddenError("Only the workspace owner can grant owner");
  }

  const query = optionalString(args, "email") || optionalString(args, "name") || "";
  if (!query) throw invalidParams("Provide the person's name or email");
  const inviteEmail =
    optionalString(args, "email") || (looksLikeEmail(query) ? query.trim().toLowerCase() : "");

  const workspace = await runtime.store.get<Record<string, unknown>>(
    runtime.collections.workspaces,
    workspaceId
  );
  const organizationId = String(workspace.organizationId ?? "").trim();
  if (!organizationId) {
    return toolResult(
      {
        error:
          "This workspace is not in an organization. Share the invite link from fairlx_workspace_invite_get instead of adding someone by name.",
      },
      true
    );
  }
  const orgCollection = runtime.collections.organizationMembers;
  if (!orgCollection) {
    return toolResult({ error: "Organization members are unavailable." }, true);
  }

  const orgDocs = await listAllDocuments(runtime, orgCollection, [
    { type: "equal", field: "organizationId", value: organizationId },
  ]);
  const hydrated = await hydrateMembers(runtime, orgDocs);
  const named: NamedMember[] = orgDocs.map((doc, index) => ({
    id: String(doc.userId ?? doc.$id ?? ""),
    name: hydrated[index]?.name ?? "",
    email: hydrated[index]?.email ?? "",
    role: hydrated[index]?.role ?? String(doc.role ?? "MEMBER"),
    status: hydrated[index]?.status ?? String(doc.status ?? "ACTIVE"),
  }));
  const matched = matchWorkspaceMember(query, named);
  let userId = "";
  let memberName = "";
  let memberEmail = "";
  let invitedToOrganization = false;
  let emailSent: boolean | undefined;
  let emailError: string | undefined;

  if (matched.kind === "many") {
    return toolResult(
      {
        error: "Several people match. Say which one.",
        matches: matched.members.map(({ name, email, role: memberRole }) => ({
          name,
          email,
          role: memberRole,
        })),
      },
      true
    );
  }

  if (matched.kind === "one") {
    userId = matched.member.id;
    memberName = matched.member.name;
    memberEmail = matched.member.email;
  } else if (inviteEmail && runtime.inviteOrganizationMember) {
    try {
      const invited = await runtime.inviteOrganizationMember({
        actorUserId: auth.actorUserId,
        organizationId,
        email: inviteEmail,
        name: displayNameFromInvite(args, inviteEmail),
        workspaceId,
      });
      userId = invited.userId;
      memberName = invited.name;
      memberEmail = invited.email;
      invitedToOrganization = true;
      emailSent = invited.emailSent;
      emailError = invited.emailError;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to invite this person to the organization.";
      return toolResult(
        {
          error: message,
          members: named.map(({ name, email, role: memberRole }) => ({
            name,
            email,
            role: memberRole,
          })),
        },
        true
      );
    }
  } else {
    return toolResult(
      {
        error: inviteEmail
          ? `No organization member matches "${query}". A workspace admin can invite this email to the organization and this workspace with fairlx_workspace_member_add — do not wait for the organization owner.`
          : `No organization member matches "${query}". Provide their email to invite them to the organization and this workspace.`,
        members: named.map(({ name, email, role: memberRole }) => ({
          name,
          email,
          role: memberRole,
        })),
      },
      true
    );
  }

  const existing = await runtime.store.list<Record<string, unknown>>(runtime.collections.members, [
    { type: "equal", field: "workspaceId", value: workspaceId },
    { type: "equal", field: "userId", value: userId },
    { type: "limit", value: 1 },
  ]);
  if (existing.documents.length > 0) {
    return toolResult(
      {
        error: `${memberName || memberEmail} is already a workspace member.`,
        member: {
          name: memberName,
          email: memberEmail,
          role: String(existing.documents[0]?.role ?? "MEMBER"),
        },
      },
      true
    );
  }

  const created = await runtime.store.create<Record<string, unknown>>(runtime.collections.members, {
    workspaceId,
    userId,
    role,
    status: "ACTIVE",
  });
  try {
    await runtime.onMembershipChanged?.({ userId, workspaceId });
  } catch {
    // Cache invalidation must never fail the add.
  }
  await audit(runtime, {
    workspaceId,
    userId: auth.actorUserId,
    action: "mcp.workspace_member.add",
    resourceType: "member",
    resourceId: String(created.$id ?? created.id ?? ""),
    resourceName: memberName,
    metadata: { role, invitedToOrganization },
  });
  return toolResult({
    member: { name: memberName, email: memberEmail, role, status: "ACTIVE" },
    added: true,
    addedToOrganization: invitedToOrganization,
    addedToWorkspace: true,
    invitedToOrganization,
    ...(invitedToOrganization
      ? { emailSent: Boolean(emailSent), ...(emailError ? { emailError } : {}) }
      : {}),
    message: invitedToOrganization
      ? emailSent === false
        ? `Added to the organization and this workspace, but the welcome email did not send${
            emailError ? `: ${emailError}` : ""
          }. Tell the user to resend it from Organization → Members, or check Appwrite Messaging SMTP.`
        : "Added to the organization and this workspace. A welcome email was sent. Organization and workspace are different; both memberships are now in place. Do not wait for the organization owner. Next add them to the project team, then assign the work item."
      : "Added to this workspace from the organization. Next add them to the project team if asked, then assign work.",
  });
}

export async function workspaceMemberRemove(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  await requireWorkspaceAdmin(runtime, auth, workspaceId);
  const query = optionalString(args, "email") || optionalString(args, "name") || "";
  if (!query) throw invalidParams("Provide the member's name or email");

  const { docs, named } = await namedWorkspaceMembers(runtime, workspaceId);
  const matched = matchQueryResult(query, named, `No member matches "${query}".`);
  if (matched.error) return toolResult(matched.payload, true);

  const target = matched.member;
  const targetDoc = docs.find((doc) => String(doc.$id ?? doc.id ?? "") === target.id);
  if (!targetDoc) throw notFoundError("Not found");
  if (String(targetDoc.role ?? target.role) === "OWNER") {
    throw forbiddenError("Cannot remove the workspace owner. They must transfer ownership first.");
  }
  if (docs.length === 1) {
    throw invalidParams("Cannot delete the only member.");
  }

  await runtime.store.delete(runtime.collections.members, target.id);
  try {
    await runtime.onMembershipChanged?.({ userId: String(targetDoc.userId ?? ""), workspaceId });
  } catch {
    // Cache invalidation must never fail the remove.
  }
  await audit(runtime, {
    workspaceId,
    userId: auth.actorUserId,
    action: "mcp.workspace_member.remove",
    resourceType: "member",
    resourceId: target.id,
    resourceName: target.name,
  });
  return toolResult({
    removed: true,
    member: { name: target.name, email: target.email, role: target.role },
  });
}

