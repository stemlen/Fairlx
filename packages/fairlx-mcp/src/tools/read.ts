import { invalidParams, notFoundError, forbiddenError } from "../protocol/errors";
import type { McpToolResult } from "../protocol/types";
import type { AuthContext } from "../auth/context";
import { PERMISSIONS, type McpQuery, type McpRuntime } from "../runtime/types";
import {
  assigneeQueryMatches,
  compactWorkItem,
  hydrateMembers,
  hydrateWorkItemAssignees,
  hydrateWorkItemEpics,
  isWorkItemKeyCursor,
  locationSummary,
  paginationMeta,
  toolResult,
  WORK_ITEM_LIST_PAGE_SIZE,
  WORK_ITEM_LIST_SCAN_CAP,
  withId,
  wrapUntrusted,
} from "../runtime/output";
import { assignmentSummary } from "../runtime/assign-share";
import { requireProjectAccess, assertWorkspaceBound } from "../runtime/rbac";
import { loadProject, loadWorkItem, paginationQueries } from "../runtime/tenant";
import { listQuery, optionalBoolean, optionalString, requireString, redactGithubRepo, workspaceInviteUrl, listAllDocuments } from "./helpers";
import { isWorkspaceAdminRole } from "./member-match";
import {
  organizationGet,
  organizationList,
  organizationName,
  organizationWorkspacesList,
  resolveOrganizationId,
  actorCanReadOrganization,
  departmentList,
} from "./organization";
import { handlePersonalTool } from "../personal/load";
import { generateDailyBriefing, type PersonaRole } from "@fairlx/multi-agent";
import { usageSummary } from "./billing";

export async function handleReadTool(
  name: string,
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  switch (name) {
    case "fairlx_workspace_list":
      return workspaceList(args, runtime, auth);
    case "fairlx_project_list":
      return projectList(args, runtime, auth);
    case "fairlx_project_get":
      return projectGet(args, runtime, auth);
    case "fairlx_project_members_list":
      return projectMembersList(args, runtime, auth);
    case "fairlx_work_item_list":
      return workItemList(args, runtime, auth);
    case "fairlx_work_item_get":
      return workItemGet(args, runtime, auth);
    case "fairlx_sprint_list":
      return sprintList(args, runtime, auth);
    case "fairlx_sprint_get":
      return sprintGet(args, runtime, auth);
    case "fairlx_link_list":
      return linkList(args, runtime, auth);
    case "fairlx_comment_list":
      return commentList(args, runtime, auth);
    case "fairlx_time_log_list":
      return timeLogList(args, runtime, auth);
    case "fairlx_doc_list":
      return docList(args, runtime, auth);
    case "fairlx_doc_get":
      return docGet(args, runtime, auth);
    case "fairlx_workflow_get":
      return workflowGet(args, runtime, auth);
    case "fairlx_agent_context_get":
      return agentContextGet(args, runtime, auth);
    case "fairlx_agent_briefing":
      return agentBriefing(args, runtime, auth);
    case "fairlx_agent_next_assignment":
      return agentNextAssignment(args, runtime, auth);
    // ── New read tools ──
    case "fairlx_workspace_members_list":
      return workspaceMembersList(args, runtime, auth);
    case "fairlx_workspace_member_get":
      return workspaceMemberGet(args, runtime, auth);
    case "fairlx_workspace_get":
      return workspaceGet(args, runtime, auth);
    case "fairlx_workspace_invite_get":
      return workspaceInviteGet(args, runtime, auth);
    case "fairlx_organization_members_list":
      return organizationMembersList(args, runtime, auth);
    case "fairlx_organization_get":
      return organizationGet(args, runtime, auth);
    case "fairlx_organization_list":
      return organizationList(args, runtime, auth);
    case "fairlx_organization_workspaces_list":
      return organizationWorkspacesList(args, runtime, auth);
    case "fairlx_department_list":
      return departmentList(args, runtime, auth);
    case "fairlx_subtask_list":
      return subtaskList(args, runtime, auth);
    case "fairlx_notification_list":
      return notificationList(args, runtime, auth);
    case "fairlx_saved_view_list":
      return savedViewList(args, runtime, auth);
    case "fairlx_saved_view_get":
      return savedViewGet(args, runtime, auth);
    case "fairlx_custom_field_list":
      return customFieldList(args, runtime, auth);
    case "fairlx_project_team_list":
      return projectTeamList(args, runtime, auth);
    case "fairlx_project_team_members_list":
      return projectTeamMembersList(args, runtime, auth);
    case "fairlx_space_list":
      return spaceList(args, runtime, auth);
    case "fairlx_space_get":
      return spaceGet(args, runtime, auth);
    case "fairlx_program_list":
      return programList(args, runtime, auth);
    case "fairlx_program_get":
      return programGet(args, runtime, auth);
    case "fairlx_program_milestone_list":
      return programMilestoneList(args, runtime, auth);
    case "fairlx_personal_backlog_list":
      return personalBacklogList(args, runtime, auth);
    case "fairlx_audit_log_list":
      return auditLogList(args, runtime, auth);
    case "fairlx_attachment_list":
      return attachmentList(args, runtime, auth);
    case "fairlx_webhook_list":
      return webhookList(args, runtime, auth);
    case "fairlx_github_repo_list":
      return githubRepoList(args, runtime, auth);
    case "fairlx_usage_summary":
      return usageSummary(args, runtime, auth);
    case "fairlx_personal_harness_get":
    case "fairlx_personal_search":
    case "fairlx_personal_skill_list":
    case "fairlx_personal_knowledge_list":
    case "fairlx_personal_chat_list":
      return handlePersonalTool(name, args, runtime, auth);
    default:
      throw invalidParams(`Unknown read tool: ${name}`);
  }
}

async function workspaceList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const members = await runtime.store.list<Record<string, unknown>>(runtime.collections.members, [
    { type: "equal", field: "userId", value: auth.actorUserId },
    { type: "limit", value: 100 },
  ]);
  let workspaceIds = members.documents
    .map((m) => String(m.workspaceId ?? ""))
    .filter(Boolean);
  if (auth.workspaceId) {
    workspaceIds = workspaceIds.filter((id) => id === auth.workspaceId);
  }
  const workspaces = [];
  for (const id of workspaceIds.slice(0, typeof args.limit === "number" ? args.limit : 50)) {
    try {
      const ws = await runtime.store.get<Record<string, unknown>>(runtime.collections.workspaces, id);
      const organizationId = String(ws.organizationId ?? "").trim();
      const organization = organizationId ? await organizationName(runtime, organizationId) : null;
      workspaces.push({
        name: String(ws.name ?? ""),
        organization: organization ? { name: organization } : null,
      });
    } catch {
      // skip missing
    }
  }
  return toolResult({ workspaces });
}

async function projectList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  assertWorkspaceBound(auth, workspaceId);
  const extra: McpQuery[] = [{ type: "equal", field: "workspaceId", value: workspaceId }];
  if (auth.projectId) extra.push({ type: "equal", field: "$id", value: auth.projectId });
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.projects,
    listQuery(args, extra)
  );
  const visible = [];
  for (const project of result.documents) {
    try {
      await requireProjectAccess(
        runtime,
        auth,
        String(project.$id),
        PERMISSIONS.VIEW_PROJECT,
        ["project:read"]
      );
      visible.push(withId(project));
    } catch {
      // hide unauthorized
    }
  }
  return toolResult({ projects: visible, total: visible.length });
}

async function projectGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_PROJECT, ["project:read"]);
  const project = await loadProject(runtime, auth, projectId);
  return toolResult({ project: withId(project) });
}

async function projectMembersList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_MEMBERS, ["project:read"]);
  let members = await runtime.store.list<Record<string, unknown>>(runtime.collections.projectMembers, [
    { type: "equal", field: "projectId", value: projectId },
    { type: "limit", value: 100 },
  ]);
  if (members.documents.length === 0) {
    members = await runtime.store.list<Record<string, unknown>>(
      runtime.collections.projectTeamMembers,
      [
        { type: "equal", field: "projectId", value: projectId },
        { type: "limit", value: 100 },
      ]
    );
  }
  return toolResult({ members: await hydrateMembers(runtime, members.documents) });
}

async function fetchWorkItemPages(
  runtime: McpRuntime,
  extra: McpQuery[],
  cursorAfter: string | undefined,
  scanAll: boolean,
  pageLimit: number
): Promise<{ documents: Record<string, unknown>[]; total: number; scannedAll: boolean }> {
  const pageSize = scanAll ? WORK_ITEM_LIST_PAGE_SIZE : pageLimit;
  const documents: Record<string, unknown>[] = [];
  let cursor = cursorAfter;
  let total = 0;
  const maxPages = scanAll ? Math.ceil(WORK_ITEM_LIST_SCAN_CAP / WORK_ITEM_LIST_PAGE_SIZE) : 1;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await runtime.store.list<Record<string, unknown>>(
      runtime.collections.workItems,
      listQuery({ limit: pageSize, cursorAfter: cursor }, extra)
    );
    total = result.total;
    if (!scanAll) {
      return {
        documents: result.documents,
        total,
        scannedAll: result.documents.length >= total,
      };
    }
    documents.push(...result.documents);
    if (
      result.documents.length < pageSize ||
      documents.length >= total ||
      documents.length >= WORK_ITEM_LIST_SCAN_CAP
    ) {
      break;
    }
    const last = result.documents[result.documents.length - 1];
    cursor = String(last?.$id ?? last?.id ?? "").trim() || undefined;
    if (!cursor) break;
  }
  const capped = documents.slice(0, WORK_ITEM_LIST_SCAN_CAP);
  return {
    documents: capped,
    total,
    scannedAll: capped.length >= total,
  };
}

async function workItemList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_TASKS, ["tasks:read"]);
  const extra: McpQuery[] = [{ type: "equal", field: "projectId", value: projectId }];
  const sprintId = optionalString(args, "sprintId");
  const status = optionalString(args, "status");
  const type = optionalString(args, "type");
  const unassigned = optionalBoolean(args, "unassigned") === true;
  const backlog = optionalBoolean(args, "backlog") === true;
  const withoutEpic = optionalBoolean(args, "withoutEpic") === true;
  const assigneeId = optionalString(args, "assigneeId");
  if (sprintId && !backlog) extra.push({ type: "equal", field: "sprintId", value: sprintId });
  if (status) extra.push({ type: "equal", field: "status", value: status });
  if (type) extra.push({ type: "equal", field: "type", value: type });
  const { limit, cursorAfter } = paginationQueries(args);
  const cursorError = isWorkItemKeyCursor(cursorAfter)
    ? "cursorAfter must be nextCursor from the previous list result"
    : undefined;
  const startCursor = cursorError ? undefined : cursorAfter;
  const needsFilter = unassigned || backlog || withoutEpic || Boolean(assigneeId);
  const scanAll = needsFilter || !startCursor;
  const fetched = await fetchWorkItemPages(runtime, extra, startCursor, scanAll, limit);
  const namesByRow = await hydrateWorkItemAssignees(runtime, fetched.documents);
  const epicsByRow = await hydrateWorkItemEpics(runtime, fetched.documents);
  const rows = fetched.documents.map((doc, index) => {
    const names = runtime.collections.members ? namesByRow[index] ?? [] : undefined;
    return { compact: compactWorkItem(doc, names, epicsByRow[index] ?? null), names: names ?? [] };
  });
  let filtered = unassigned ? rows.filter((row) => row.compact.unassigned === true) : rows;
  if (backlog) {
    filtered = filtered.filter((row) => row.compact.location === "backlog");
  }
  if (withoutEpic) {
    filtered = filtered.filter(
      (row) => String(row.compact.type ?? "").toUpperCase() !== "EPIC" && row.compact.hasEpic !== true,
    );
  }
  if (assigneeId) {
    filtered = filtered.filter((row) => assigneeQueryMatches(row.names, assigneeId));
  }
  const explicitLimit = typeof args.limit === "number";
  const maxReturn = scanAll && !explicitLimit ? WORK_ITEM_LIST_SCAN_CAP : limit;
  const workItems = filtered.slice(0, maxReturn).map((row) => row.compact);
  const lastFetched = fetched.documents[fetched.documents.length - 1];
  const page = scanAll
    ? {
        hasMore: !fetched.scannedAll,
        nextCursor: fetched.scannedAll
          ? null
          : String(lastFetched?.$id ?? lastFetched?.id ?? "").trim() || null,
        returned: workItems.length,
        total: fetched.total,
      }
    : paginationMeta(fetched.documents, fetched.total, limit);
  const location = locationSummary(rows.map((row) => row.compact));
  return toolResult(
    {
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      returned: workItems.length,
      total: fetched.total,
      matched: filtered.length,
      unassignedCount: rows.filter((row) => row.compact.unassigned === true).length,
      missingEpicCount: rows.filter(
        (row) => String(row.compact.type ?? "").toUpperCase() !== "EPIC" && row.compact.hasEpic !== true,
      ).length,
      location,
      assignment: assignmentSummary(
        rows.map((row) => ({
          key: row.compact.key,
          unassigned: row.compact.unassigned,
          assignees: row.names,
        })),
      ),
      ...(cursorError ? { error: cursorError } : {}),
      workItems,
    },
    false,
    { compact: true }
  );
}

async function workItemGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  const item = await loadWorkItem(runtime, auth, workItemId);
  await requireProjectAccess(
    runtime,
    auth,
    String(item.projectId),
    PERMISSIONS.VIEW_TASKS,
    ["tasks:read"]
  );
  return toolResult({
    workItem: withId(item),
    untrusted: wrapUntrusted("work_item", {
      title: item.title,
      description: item.description,
    }),
  });
}

async function sprintList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_SPRINTS, ["sprints:read"]);
  const extra: McpQuery[] = [{ type: "equal", field: "projectId", value: projectId }];
  const status = optionalString(args, "status");
  if (status && /^(ACTIVE|PLANNED|COMPLETED)$/i.test(status)) {
    extra.push({ type: "equal", field: "status", value: status.toUpperCase() });
  }
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.sprints,
    listQuery(args, extra)
  );
  return toolResult({ sprints: result.documents.map((d) => withId(d)), total: result.total });
}

async function sprintGet(
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
    PERMISSIONS.VIEW_SPRINTS,
    ["sprints:read"]
  );
  return toolResult({ sprint: withId(sprint) });
}

async function linkList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = optionalString(args, "workItemId");
  const projectIdArg = optionalString(args, "projectId");
  let projectId = projectIdArg;
  if (workItemId) {
    const item = await loadWorkItem(runtime, auth, workItemId);
    projectId = String(item.projectId);
  }
  if (!projectId) throw invalidParams("workItemId or projectId is required");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_TASKS, ["tasks:read"]);
  const extra: McpQuery[] = [{ type: "equal", field: "projectId", value: projectId }];
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.workItemLinks,
    listQuery(args, extra)
  );
  let docs = result.documents;
  if (workItemId) {
    docs = docs.filter(
      (d) => d.sourceItemId === workItemId || d.targetItemId === workItemId
    );
  }
  return toolResult({ links: docs.map((d) => withId(d)) });
}

async function commentList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  const item = await loadWorkItem(runtime, auth, workItemId);
  await requireProjectAccess(
    runtime,
    auth,
    String(item.projectId),
    PERMISSIONS.VIEW_TASKS,
    ["tasks:read"]
  );
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.comments,
    listQuery(args, [{ type: "equal", field: "taskId", value: workItemId }])
  );
  return toolResult({
    comments: result.documents.map((d) => ({
      ...withId(d),
      untrusted: wrapUntrusted("comment", d.content),
    })),
  });
}

async function timeLogList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = optionalString(args, "workItemId");
  const projectIdArg = optionalString(args, "projectId");
  let projectId = projectIdArg;
  if (workItemId) {
    const item = await loadWorkItem(runtime, auth, workItemId);
    projectId = String(item.projectId);
  }
  if (!projectId) throw invalidParams("workItemId or projectId is required");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_TASKS, ["tasks:read"]);
  const extra: McpQuery[] = workItemId
    ? [{ type: "equal", field: "taskId", value: workItemId }]
    : [{ type: "equal", field: "projectId", value: projectId }];
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.timeLogs,
    listQuery(args, extra)
  );
  return toolResult({ timeLogs: result.documents.map((d) => withId(d)) });
}

async function docList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_DOCS, ["docs:read"]);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.projectDocs,
    listQuery(args, [{ type: "equal", field: "projectId", value: projectId }])
  );
  return toolResult({
    docs: result.documents.map((d) => ({
      id: d.$id,
      title: d.title ?? d.name,
      name: d.name,
      category: d.category,
      mimeType: d.mimeType,
      size: d.size,
      version: d.version,
      isArchived: d.isArchived,
      tags: d.tags,
    })),
  });
}

async function docGet(
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
  const projectId = String(doc.projectId);
  if (args.projectId && args.projectId !== projectId) throw notFoundError("Not found");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_DOCS, ["docs:read"]);
  return toolResult({
    doc: withId(doc),
    content: String(doc.aiSummary || doc.description || ""),
    untrusted: wrapUntrusted("document", doc.aiSummary ?? doc.description ?? doc.title ?? doc.name),
  });
}

async function workflowGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_PROJECT, [
    "workflows:read",
  ]);
  const project = await loadProject(runtime, auth, projectId);
  const workflowId = String(project.workflowId ?? "");
  if (!workflowId) {
    return toolResult({ workflow: null, statuses: [], transitions: [] });
  }
  const workflow = await runtime.store.get<Record<string, unknown>>(
    runtime.collections.workflows,
    workflowId
  );
  const statuses = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.workflowStatuses,
    [
      { type: "equal", field: "workflowId", value: workflowId },
      { type: "limit", value: 100 },
    ]
  );
  const transitions = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.workflowTransitions,
    [
      { type: "equal", field: "workflowId", value: workflowId },
      { type: "limit", value: 100 },
    ]
  );
  return toolResult({
    workflow: withId(workflow),
    statuses: statuses.documents.map((d) => withId(d)),
    transitions: transitions.documents.map((d) => withId(d)),
  });
}

async function agentContextGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  const item = await loadWorkItem(runtime, auth, workItemId);
  const projectId = String(item.projectId);
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_TASKS, ["tasks:read"]);
  const project = await loadProject(runtime, auth, projectId);
  const comments = await runtime.store.list<Record<string, unknown>>(runtime.collections.comments, [
    { type: "equal", field: "taskId", value: workItemId },
    { type: "limit", value: 50 },
    { type: "orderDesc", field: "$createdAt" },
  ]);
  const links = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.workItemLinks,
    [
      { type: "equal", field: "projectId", value: projectId },
      { type: "limit", value: 50 },
    ]
  );
  let sprint = null;
  if (item.sprintId) {
    try {
      sprint = await runtime.store.get(runtime.collections.sprints, String(item.sprintId));
    } catch {
      sprint = null;
    }
  }
  return toolResult({
    workItem: withId(item),
    project: withId(project),
    sprint,
    comments: comments.documents.map((d) => withId(d)),
    links: links.documents.filter(
      (d) => d.sourceItemId === workItemId || d.targetItemId === workItemId
    ),
    untrusted: wrapUntrusted("agent_context", {
      title: item.title,
      description: item.description,
      comments: comments.documents.map((d) => d.content),
    }),
  });
}

function toBriefingItem(doc: Record<string, unknown>) {
  return {
    id: String(doc.$id ?? doc.id ?? ""),
    key: typeof doc.key === "string" ? doc.key : undefined,
    title: String(doc.title ?? "Untitled"),
    status: typeof doc.status === "string" ? doc.status : undefined,
    priority: typeof doc.priority === "string" ? doc.priority : undefined,
    type: typeof doc.type === "string" ? doc.type : undefined,
  };
}

async function loadProjectItems(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
) {
  const projectId = optionalString(args, "projectId");
  if (!projectId) return [];
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_TASKS, ["tasks:read"]);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.workItems,
    listQuery({ limit: 40 }, [{ type: "equal", field: "projectId", value: projectId }]),
  );
  return result.documents.map(toBriefingItem);
}

async function agentBriefing(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const workItems = await loadProjectItems(args, runtime, auth);
  const persona = optionalString(args, "personaRole") as PersonaRole | undefined;
  const briefing = generateDailyBriefing({
    personaRole: persona,
    workItems,
    unassigned: workItems.filter((item) => !item.status),
    blockers: workItems.filter((item) => /block/i.test(item.status || "")),
  });
  return toolResult(briefing);
}

async function agentNextAssignment(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const workItems = await loadProjectItems(args, runtime, auth);
  const next = workItems.find((item) => {
    const status = String(item.status || "").toUpperCase();
    return status !== "DONE" && status !== "CLOSED" && status !== "COMPLETE";
  });
  return toolResult({
    next: next ?? null,
    message: next
      ? `Your Fairlx Personal Agent would have you pick up ${[next.key, next.title].filter(Boolean).join(" — ")} next.`
      : "No open work items in this project.",
  });
}

// ═══════════════════════════════════════════════════════════════════
// NEW read tools
// ═══════════════════════════════════════════════════════════════════

async function workspaceMembersList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  assertWorkspaceBound(auth, workspaceId);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.members,
    listQuery(args, [{ type: "equal", field: "workspaceId", value: workspaceId }])
  );
  return toolResult({
    members: await hydrateMembers(runtime, result.documents),
    total: result.total,
  });
}

async function workspaceMemberGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const memberId = requireString(args, "memberId");
  let member: Record<string, unknown>;
  try {
    member = await runtime.store.get<Record<string, unknown>>(runtime.collections.members, memberId);
  } catch {
    throw notFoundError("Not found");
  }
  const workspaceId = String(member.workspaceId ?? "");
  assertWorkspaceBound(auth, workspaceId);
  return toolResult({ member: (await hydrateMembers(runtime, [member]))[0] });
}

async function workspaceGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  assertWorkspaceBound(auth, workspaceId);
  // Verify the actor is a member of this workspace
  const membership = await runtime.store.list<Record<string, unknown>>(runtime.collections.members, [
    { type: "equal", field: "userId", value: auth.actorUserId },
    { type: "equal", field: "workspaceId", value: workspaceId },
    { type: "limit", value: 1 },
  ]);
  if (membership.documents.length === 0) throw notFoundError("Not found");
  const ws = await runtime.store.get<Record<string, unknown>>(runtime.collections.workspaces, workspaceId);
  const organizationId = String(ws.organizationId ?? "").trim();
  const organization = organizationId ? await organizationName(runtime, organizationId) : null;
  return toolResult({
    workspace: { name: String(ws.name ?? "") },
    organization: organization ? { name: organization } : null,
  });
}

async function workspaceInviteGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  assertWorkspaceBound(auth, workspaceId);

  const membership = await runtime.store.list<Record<string, unknown>>(runtime.collections.members, [
    { type: "equal", field: "userId", value: auth.actorUserId },
    { type: "equal", field: "workspaceId", value: workspaceId },
    { type: "limit", value: 1 },
  ]);
  const actor = membership.documents[0];
  if (!actor) throw notFoundError("Not found");
  if (!isWorkspaceAdminRole(String(actor.role ?? ""))) {
    throw forbiddenError("Only workspace admins can view the invite link");
  }

  const workspace = await runtime.store.get<Record<string, unknown>>(
    runtime.collections.workspaces,
    workspaceId
  );
  const name = String(workspace.name ?? "this workspace");
  if (workspace.organizationId) {
    return toolResult({
      available: false,
      reason: "ORG_INVITE_DISABLED",
      workspace: name,
      message:
        "Invite links are disabled for organization workspaces. Add people from the organization instead of sharing a join link.",
    });
  }

  const inviteCode = String(workspace.inviteCode ?? "").trim();
  if (!inviteCode) {
    return toolResult({
      available: false,
      reason: "MISSING_INVITE_CODE",
      workspace: name,
      message: "This workspace has no invite code yet. Reset the invite link in Members to create one.",
    });
  }

  return toolResult({
    available: true,
    workspace: name,
    inviteUrl: workspaceInviteUrl(workspaceId, inviteCode),
  });
}

async function organizationMembersList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const organizationId = await resolveOrganizationId(args, runtime, auth);
  if (!(await actorCanReadOrganization(runtime, auth, organizationId))) {
    throw notFoundError("Not found");
  }

  const collection = runtime.collections.organizationMembers;
  if (!collection) {
    return toolResult({ organization: true, members: [], error: "Organization members are unavailable." }, true);
  }

  const workspaceId = optionalString(args, "workspaceId") || auth.workspaceId || "";
  const orgDocs = await listAllDocuments(runtime, collection, [
    { type: "equal", field: "organizationId", value: organizationId },
  ]);
  const workspaceDocs = workspaceId
    ? await listAllDocuments(runtime, runtime.collections.members, [
        { type: "equal", field: "workspaceId", value: workspaceId },
      ])
    : [];
  const inWorkspace = new Set(
    workspaceDocs.map((doc) => String(doc.userId ?? "")).filter(Boolean)
  );
  const hydrated = await hydrateMembers(runtime, orgDocs);
  const orgName = await organizationName(runtime, organizationId);
  let workspaceName = "";
  if (workspaceId) {
    try {
      const workspace = await runtime.store.get<Record<string, unknown>>(
        runtime.collections.workspaces,
        workspaceId,
      );
      workspaceName = String(workspace.name ?? "");
    } catch {
      workspaceName = "";
    }
  }
  return toolResult({
    organization: true,
    organizationName: orgName,
    workspace: workspaceName,
    note: "These are organization members, not workspace members. To invite a new email, call fairlx_workspace_member_add.",
    members: hydrated.map((person, index) => {
      const userId = String(orgDocs[index]?.userId ?? "");
      return {
        name: person.name,
        email: person.email,
        orgRole: person.role,
        inWorkspace: workspaceId ? inWorkspace.has(userId) : undefined,
      };
    }),
  });
}

async function subtaskList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  const item = await loadWorkItem(runtime, auth, workItemId);
  await requireProjectAccess(
    runtime,
    auth,
    String(item.projectId),
    PERMISSIONS.VIEW_TASKS,
    ["tasks:read"]
  );
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.subtasks,
    listQuery(args, [{ type: "equal", field: "parentTaskId", value: workItemId }])
  );
  return toolResult({
    subtasks: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function notificationList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const extra: McpQuery[] = [
    { type: "equal", field: "userId", value: auth.actorUserId },
  ];
  const workspaceId = optionalString(args, "workspaceId");
  if (workspaceId) {
    assertWorkspaceBound(auth, workspaceId);
    extra.push({ type: "equal", field: "workspaceId", value: workspaceId });
  }
  if (args.isRead === true) {
    extra.push({ type: "equal", field: "isRead", value: true });
  } else if (args.isRead === false) {
    extra.push({ type: "equal", field: "isRead", value: false });
  }
  extra.push({ type: "orderDesc", field: "$createdAt" });
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.notifications,
    listQuery(args, extra)
  );
  return toolResult({
    notifications: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function savedViewList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_VIEWS, ["views:read"]);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.savedViews,
    listQuery(args, [{ type: "equal", field: "projectId", value: projectId }])
  );
  return toolResult({
    views: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function savedViewGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const viewId = requireString(args, "viewId");
  let view: Record<string, unknown>;
  try {
    view = await runtime.store.get<Record<string, unknown>>(runtime.collections.savedViews, viewId);
  } catch {
    throw notFoundError("Not found");
  }
  const projectId = String(view.projectId);
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_VIEWS, ["views:read"]);
  return toolResult({ view: withId(view) });
}

async function customFieldList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_TASKS, ["tasks:read"]);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.customFields,
    listQuery(args, [{ type: "equal", field: "projectId", value: projectId }])
  );
  return toolResult({
    customFields: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function projectTeamList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_MEMBERS, ["members:read"]);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.projectTeams,
    listQuery(args, [{ type: "equal", field: "projectId", value: projectId }])
  );
  return toolResult({
    teams: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function projectTeamMembersList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const teamId = requireString(args, "teamId");
  // Resolve the project from the team or from the arg
  let projectId = optionalString(args, "projectId");
  if (!projectId) {
    let team: Record<string, unknown>;
    try {
      team = await runtime.store.get<Record<string, unknown>>(runtime.collections.projectTeams, teamId);
    } catch {
      throw notFoundError("Not found");
    }
    projectId = String(team.projectId);
  }
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_MEMBERS, ["members:read"]);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.projectTeamMembers,
    listQuery(args, [{ type: "equal", field: "teamId", value: teamId }])
  );
  return toolResult({
    members: await hydrateMembers(runtime, result.documents),
    total: result.total,
  });
}

async function spaceList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  assertWorkspaceBound(auth, workspaceId);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.spaces,
    listQuery(args, [{ type: "equal", field: "workspaceId", value: workspaceId }])
  );
  return toolResult({
    spaces: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function spaceGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const spaceId = requireString(args, "spaceId");
  let space: Record<string, unknown>;
  try {
    space = await runtime.store.get<Record<string, unknown>>(runtime.collections.spaces, spaceId);
  } catch {
    throw notFoundError("Not found");
  }
  const workspaceId = String(space.workspaceId ?? "");
  assertWorkspaceBound(auth, workspaceId);
  return toolResult({ space: withId(space) });
}

async function programList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workspaceId = requireString(args, "workspaceId");
  assertWorkspaceBound(auth, workspaceId);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.programs,
    listQuery(args, [{ type: "equal", field: "workspaceId", value: workspaceId }])
  );
  return toolResult({
    programs: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function programGet(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const programId = requireString(args, "programId");
  let program: Record<string, unknown>;
  try {
    program = await runtime.store.get<Record<string, unknown>>(runtime.collections.programs, programId);
  } catch {
    throw notFoundError("Not found");
  }
  const workspaceId = String(program.workspaceId ?? "");
  assertWorkspaceBound(auth, workspaceId);
  return toolResult({ program: withId(program) });
}

async function programMilestoneList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const programId = requireString(args, "programId");
  // Resolve the workspace from the program
  let program: Record<string, unknown>;
  try {
    program = await runtime.store.get<Record<string, unknown>>(runtime.collections.programs, programId);
  } catch {
    throw notFoundError("Not found");
  }
  assertWorkspaceBound(auth, String(program.workspaceId ?? ""));
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.programMilestones,
    listQuery(args, [{ type: "equal", field: "programId", value: programId }])
  );
  return toolResult({
    milestones: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function personalBacklogList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.personalBacklog,
    listQuery(args, [{ type: "equal", field: "userId", value: auth.actorUserId }])
  );
  return toolResult({
    backlogItems: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function auditLogList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const extra: McpQuery[] = [];
  const workspaceId = optionalString(args, "workspaceId");
  if (workspaceId) {
    assertWorkspaceBound(auth, workspaceId);
    extra.push({ type: "equal", field: "organizationId", value: workspaceId });
  } else if (auth.workspaceId) {
    extra.push({ type: "equal", field: "organizationId", value: auth.workspaceId });
  }
  const actionType = optionalString(args, "actionType");
  if (actionType) {
    extra.push({ type: "equal", field: "actionType", value: actionType });
  }
  extra.push({ type: "orderDesc", field: "$createdAt" });
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.organizationAuditLogs,
    listQuery(args, extra)
  );
  return toolResult({
    auditLogs: result.documents.map((d) => withId(d)),
    total: result.total,
  });
}

async function attachmentList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const workItemId = requireString(args, "workItemId");
  const item = await loadWorkItem(runtime, auth, workItemId);
  await requireProjectAccess(
    runtime,
    auth,
    String(item.projectId),
    PERMISSIONS.VIEW_ATTACHMENTS,
    ["attachments:read"]
  );
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.attachments,
    listQuery(args, [{ type: "equal", field: "taskId", value: workItemId }])
  );
  return toolResult({
    attachments: result.documents.map((d) => ({
      id: d.$id,
      name: d.name ?? d.fileName,
      fileName: d.fileName,
      mimeType: d.mimeType,
      size: d.size,
      uploadedBy: d.uploadedBy,
      createdAt: d.$createdAt,
    })),
    total: result.total,
  });
}

async function webhookList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.EDIT_SETTINGS, ["admin:manage"]);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.projectWebhooks,
    listQuery(args, [{ type: "equal", field: "projectId", value: projectId }])
  );
  return toolResult({
    webhooks: result.documents.map((d) => ({
      ...withId(d),
      secret: undefined, // redact webhook secrets
    })),
    total: result.total,
  });
}

async function githubRepoList(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const projectId = requireString(args, "projectId");
  await requireProjectAccess(runtime, auth, projectId, PERMISSIONS.VIEW_PROJECT, ["project:read"]);
  const result = await runtime.store.list<Record<string, unknown>>(
    runtime.collections.githubRepos,
    listQuery(args, [{ type: "equal", field: "projectId", value: projectId }])
  );
  return toolResult({
    repositories: result.documents.map((d) => redactGithubRepo(withId(d))),
    total: result.total,
  });
}
