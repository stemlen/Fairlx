import { AGENT_TOOL_CATALOG } from "../constants";
import type { AgentToolCall } from "../types";

const HARNESS_TOOL_IDS = new Set<string>(AGENT_TOOL_CATALOG.map((tool) => tool.id));

export const HARNESS_TO_MCP: Record<string, string> = {
  list_workspaces: "fairlx_workspace_list",
  list_projects: "fairlx_project_list",
  list_work_items: "fairlx_work_item_list",
  create_project: "fairlx_project_create",
};

function preferMcp(resolved: string, mcpToolNames: string[]): string {
  const mapped = HARNESS_TO_MCP[resolved];
  if (mapped && mcpToolNames.includes(mapped)) return mapped;
  return resolved;
}

const ALIASES: Record<string, string> = {
  listworkitems: "list_work_items",
  list_work_items: "list_work_items",
  workitemlist: "list_work_items",
  work_item_list: "fairlx_work_item_list",
  bulkupdateworkitems: "fairlx_work_item_bulk_update",
  work_item_bulk_update: "fairlx_work_item_bulk_update",
  bulk_update: "fairlx_work_item_bulk_update",
  listworkspacemembers: "fairlx_workspace_members_list",
  list_workspace_members: "fairlx_workspace_members_list",
  workspacemembers: "fairlx_workspace_members_list",
  workspace_members_list: "fairlx_workspace_members_list",
  listworkspacemember: "fairlx_workspace_members_list",
  updateworkspacemember: "fairlx_workspace_member_update",
  workspacememberupdate: "fairlx_workspace_member_update",
  changememberrole: "fairlx_workspace_member_update",
  updatememberrole: "fairlx_workspace_member_update",
  setmemberrole: "fairlx_workspace_member_update",
  addworkspacemember: "fairlx_workspace_member_add",
  workspace_member_add: "fairlx_workspace_member_add",
  addfromorg: "fairlx_workspace_member_add",
  add_member: "fairlx_workspace_member_add",
  addmember: "fairlx_workspace_member_add",
  invitemember: "fairlx_workspace_member_add",
  removeworkspacemember: "fairlx_workspace_member_remove",
  workspace_member_remove: "fairlx_workspace_member_remove",
  remove_member: "fairlx_workspace_member_remove",
  removemember: "fairlx_workspace_member_remove",
  createteam: "fairlx_project_team_create",
  create_team: "fairlx_project_team_create",
  projectteamcreate: "fairlx_project_team_create",
  project_team_create: "fairlx_project_team_create",
  updateteam: "fairlx_project_team_update",
  update_team: "fairlx_project_team_update",
  projectteamupdate: "fairlx_project_team_update",
  deleteteam: "fairlx_project_team_delete",
  delete_team: "fairlx_project_team_delete",
  projectteamdelete: "fairlx_project_team_delete",
  addteammember: "fairlx_project_team_member_add",
  add_team_member: "fairlx_project_team_member_add",
  projectteammemberadd: "fairlx_project_team_member_add",
  project_team_member_add: "fairlx_project_team_member_add",
  addtoproject: "fairlx_project_member_add",
  add_to_project: "fairlx_project_member_add",
  addfromworkspace: "fairlx_project_member_add",
  add_from_workspace: "fairlx_project_member_add",
  projectmemberadd: "fairlx_project_member_add",
  project_member_add: "fairlx_project_member_add",
  removeteammember: "fairlx_project_team_member_remove",
  remove_team_member: "fairlx_project_team_member_remove",
  projectteammemberremove: "fairlx_project_team_member_remove",
  listorganizationmembers: "fairlx_organization_members_list",
  organization_members_list: "fairlx_organization_members_list",
  getorganization: "fairlx_organization_get",
  organization_get: "fairlx_organization_get",
  org_get: "fairlx_organization_get",
  listorganizations: "fairlx_organization_list",
  organization_list: "fairlx_organization_list",
  listorgworkspaces: "fairlx_organization_workspaces_list",
  organization_workspaces_list: "fairlx_organization_workspaces_list",
  updateorganization: "fairlx_organization_update",
  organization_update: "fairlx_organization_update",
  renameorganization: "fairlx_organization_update",
  createdepartment: "fairlx_department_create",
  create_department: "fairlx_department_create",
  org_department_create: "fairlx_department_create",
  department_create: "fairlx_department_create",
  listdepartments: "fairlx_department_list",
  list_departments: "fairlx_department_list",
  department_list: "fairlx_department_list",
  addpermission: "fairlx_department_permission_add",
  add_permission: "fairlx_department_permission_add",
  create_permission: "fairlx_department_permission_add",
  assign_permission: "fairlx_department_permission_add",
  permission_grant: "fairlx_department_permission_add",
  department_permission_add: "fairlx_department_permission_add",
  getworkspaceinvite: "fairlx_workspace_invite_get",
  workspace_invite_get: "fairlx_workspace_invite_get",
  workspaceinvite: "fairlx_workspace_invite_get",
  invitelink: "fairlx_workspace_invite_get",
  invite_link: "fairlx_workspace_invite_get",
  getinvitelink: "fairlx_workspace_invite_get",
  listprojects: "list_projects",
  list_projects: "list_projects",
  project_list: "fairlx_project_list",
  listworkspaces: "list_workspaces",
  list_workspaces: "list_workspaces",
  workspace_list: "fairlx_workspace_list",
  mcplist: "mcp_list",
  mcp_list: "mcp_list",
  mcpcall: "mcp_call",
  mcp_call: "mcp_call",
  mcpresources: "mcp_resources",
  createproject: "create_project",
  create_project: "create_project",
  project_create: "fairlx_project_create",
  usagesummary: "fairlx_usage_summary",
  usage_summary: "fairlx_usage_summary",
  orgbill: "fairlx_usage_summary",
  org_bill: "fairlx_usage_summary",
  projectteamslist: "fairlx_project_team_list",
  project_teams_list: "fairlx_project_team_list",
  fairlx_project_teams_list: "fairlx_project_team_list",
};

export function camelToSnake(value: string): string {
  return value
    .replace(/[:./]/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

export function stripToolPrefix(name: string): string {
  return name
    .trim()
    .replace(/^(fairlx|mcp|tool|function)[_:]/i, "")
    .replace(/^mcp__/i, "");
}

function compactKey(value: string): string {
  return camelToSnake(stripToolPrefix(value)).replace(/_/g, "");
}

export function resolveToolName(rawName: string, mcpToolNames: string[] = []): string {
  const trimmed = rawName.trim();
  if (!trimmed) return trimmed;
  if (HARNESS_TOOL_IDS.has(trimmed)) return preferMcp(trimmed, mcpToolNames);
  if (mcpToolNames.includes(trimmed)) return trimmed;

  const snake = camelToSnake(stripToolPrefix(trimmed));
  const compact = compactKey(trimmed);
  const aliased = ALIASES[snake] || ALIASES[compact];
  if (aliased) return preferMcp(aliased, mcpToolNames);
  if (HARNESS_TOOL_IDS.has(snake)) return preferMcp(snake, mcpToolNames);
  if (mcpToolNames.includes(snake)) return snake;

  const fairlxPrefixed = snake.startsWith("fairlx_") ? snake : `fairlx_${snake}`;
  if (mcpToolNames.includes(fairlxPrefixed)) return fairlxPrefixed;

  if (snake.startsWith("list_")) {
    const rest = snake.slice(5);
    const asList = `fairlx_${rest}_list`;
    if (mcpToolNames.includes(asList)) return asList;
    const singular = rest.replace(/s$/, "");
    const asSingularList = `fairlx_${singular}_list`;
    if (mcpToolNames.includes(asSingularList)) return asSingularList;
  }

  const needle = snake.replace(/^fairlx_/, "").replace(/^list_/, "").replace(/_list$/, "");
  const match = mcpToolNames.find((name) => {
    const target = name.replace(/^fairlx_/, "").replace(/_list$/, "");
    return target === needle || target.replace(/s$/, "") === needle.replace(/s$/, "");
  });
  return preferMcp(match || snake, mcpToolNames);
}

function parseObjectLiteral(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // continue
  }
  const wrapped = trimmed.replace(/'/g, '"');
  try {
    const parsed = JSON.parse(wrapped);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

export function normalizeAgentToolCall(call: AgentToolCall, mcpToolNames: string[] = []): AgentToolCall {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(call.arguments || "{}");
    if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
  } catch {
    args = {};
  }
  if (call.name === "mcp_call") {
    const tool = resolveToolName(String(args.tool || args.name || ""), mcpToolNames);
    const inner =
      args.arguments && typeof args.arguments === "object"
        ? (args.arguments as Record<string, unknown>)
        : {};
    return {
      ...call,
      name: "mcp_call",
      arguments: JSON.stringify({ server: String(args.server || "fairlx"), tool, arguments: inner }),
    };
  }
  return { ...toCall(call.name, args, mcpToolNames, call.id), ...(call.itemId ? { itemId: call.itemId } : {}) };
}

function toCall(
  name: string,
  args: Record<string, unknown>,
  mcpToolNames: string[],
  id = crypto.randomUUID(),
): AgentToolCall {
  const resolved = resolveToolName(name, mcpToolNames);
  return {
    id,
    name: resolved,
    arguments: JSON.stringify(args),
  };
}

const CLOSED_XML_RE =
  /<\/\s*(?:([\w-]+):)?([A-Za-z][\w.]*)\s*>/g;
const XML_BLOCK_RE =
  /<((?:[\w-]+:)?[A-Za-z][\w.]*)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>/g;
const INLINE_XML_RE =
  /(?:<)?(?:([\w-]+):)?([A-Za-z][\w]*)\s+(\{[\s\S]*?\})\s*<\/\s*(?:\1:)?\2\s*>/g;
const TOOL_CALL_TAG_RE =
  /<tool_call>\s*(?:<name>|<tool>)([\s\S]*?)(?:<\/name>|<\/tool>)\s*(?:<arguments>|<args>)?([\s\S]*?)(?:<\/arguments>|<\/args>)?\s*<\/tool_call>/gi;
const DSML_INVOKE_RE = /invoke\s+name="([^"]+)"\s*>([\s\S]*?)invoke/gi;
const DSML_PARAM_RE = /parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/[^>]*parameter/gi;

function parseDsmlParameters(body: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const match of body.matchAll(DSML_PARAM_RE)) {
    const key = (match[1] ?? "").trim();
    const value = (match[2] ?? "").trim();
    if (!key || !value) continue;
    if (/^-?\d+(\.\d+)?$/.test(value)) args[key] = Number(value);
    else if (value === "true" || value === "false") args[key] = value === "true";
    else args[key] = value;
  }
  return args;
}

export function stripToolCallMarkup(content: string): string {
  if (!content) return "";
  return content
    .replace(XML_BLOCK_RE, "")
    .replace(INLINE_XML_RE, "")
    .replace(TOOL_CALL_TAG_RE, "")
    .replace(DSML_INVOKE_RE, "")
    .replace(CLOSED_XML_RE, "")
    .replace(/<[^>]*(?:DSML|invoke|parameter|tool_calls)[^>]*>/gi, "")
    .replace(/[\uFF5C|]?DSML[\uFF5C|]?/g, "")
    .replace(/<\/?[A-Za-z][\w.:-]*\b[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractToolCallsFromText(content: string, mcpToolNames: string[] = []): AgentToolCall[] {
  if (!content?.trim()) return [];
  const calls: AgentToolCall[] = [];
  const seen = new Set<string>();

  const push = (name: string, argsRaw: string) => {
    const resolvedName = name.trim();
    if (!resolvedName) return;
    const args = parseObjectLiteral(argsRaw);
    const call = toCall(resolvedName, args, mcpToolNames);
    const key = `${call.name}:${call.arguments}`;
    if (seen.has(key)) return;
    seen.add(key);
    calls.push(call);
  };

  for (const match of content.matchAll(TOOL_CALL_TAG_RE)) {
    push(match[1] ?? "", match[2] ?? "{}");
  }
  for (const match of content.matchAll(XML_BLOCK_RE)) {
    const tag = match[1] ?? "";
    if (/^(think|thinking|reason|reasoning|fairlx_untrusted_content)$/i.test(tag)) continue;
    push(tag, match[2] ?? "{}");
  }
  for (const match of content.matchAll(INLINE_XML_RE)) {
    push(`${match[1] ? `${match[1]}:` : ""}${match[2] ?? ""}`, match[3] ?? "{}");
  }
  for (const match of content.matchAll(DSML_INVOKE_RE)) {
    const args = parseDsmlParameters(match[2] ?? "");
    push(match[1] ?? "", JSON.stringify(args));
  }

  return calls;
}

export function mergeToolCalls(native: AgentToolCall[], fromText: AgentToolCall[]): AgentToolCall[] {
  const keyOf = (call: AgentToolCall) => `${call.name}:${call.arguments}`;
  const seen = new Set(native.map(keyOf));
  const extra = fromText.filter((call) => !seen.has(keyOf(call)));
  return extra.length ? [...native, ...extra] : native;
}
