import { isOrgInviteIntent, isSendMailIntent } from "../../plugins/catalog";

export type SelectableTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const ALWAYS = [
  "delegate_agent",
  "request_capability",
  "search_harness",
  "persist_memory",
  "mcp_call",
  "mcp_list",
];

/** Board tools the in-app agent must always see so it does not fall back to native list_* APIs. */
export const CORE_FAIRLX_TOOLS = [
  "fairlx_work_item_list",
  "fairlx_work_item_get",
  "fairlx_work_item_create",
  "fairlx_work_item_update",
  "fairlx_work_item_bulk_update",
  "fairlx_sprint_list",
  "fairlx_sprint_get",
  "fairlx_comment_list",
  "fairlx_comment_add",
  "fairlx_workspace_members_list",
  "fairlx_project_get",
  "fairlx_project_members_list",
];

export const SELECT_MAX_TOOLS = 40;

const DOC_RESEARCH_QUERY =
  /\b(document(?:ation)?s?|prd|frd|srs|brd|user guide|api docs?|write(?: the)? docs?|researched prd|product requirements)\b/i;

export function isDocResearchQuery(query: string): boolean {
  return DOC_RESEARCH_QUERY.test(query);
}

type Bucket = { pattern: RegExp; names: string[] };

const BUCKETS: Bucket[] = [
  {
    pattern: /\b(send|draft|compose).{0,80}(e-?mail|mail)|outlook|gmail|resend|smtp|inbox\b/i,
    names: [
      "mail_send",
      "fairlx_work_item_get",
      "fairlx_work_item_list",
      "fairlx_comment_add",
      "request_capability",
    ],
  },
  {
    pattern: /\b(organiz(ation|e)|org name|company name|rename the org|org members?|org bill)\b/i,
    names: [
      "fairlx_organization_get",
      "fairlx_organization_list",
      "fairlx_organization_workspaces_list",
      "fairlx_organization_update",
      "fairlx_organization_members_list",
      "fairlx_usage_summary",
    ],
  },
  {
    pattern: /\b(invite|member|role|team|add from org|join link|share link|assign)\b/i,
    names: [
      "fairlx_workspace_invite_get",
      "fairlx_workspace_member_add",
      "fairlx_workspace_member_remove",
      "fairlx_workspace_member_update",
      "fairlx_workspace_members_list",
      "fairlx_organization_members_list",
      "fairlx_project_team_create",
      "fairlx_project_member_add",
      "fairlx_project_team_member_add",
      "fairlx_project_team_list",
      "fairlx_work_item_update",
      "fairlx_work_item_bulk_update",
      "fairlx_work_item_list",
    ],
  },
  {
    pattern: /\b(pr\b|pull request|commit|branch|repo|repository|diff|github|edit the code|patch)\b/i,
    names: [
      "git_status",
      "github_list_files",
      "github_read_file",
      "github_write_file",
      "github_open_pr",
      "code_inspect",
      "git_stage",
      "git_unstage",
      "git_commit_plan",
    ],
  },
  {
    pattern: /\b(security|vulnerab|xss|ssrf|pentest|shannon|cve|secret scan)\b/i,
    names: ["security_review", "github_read_file", "github_list_files", "code_inspect", "agent_job_status"],
  },
  {
    pattern: /\b(workflow|status|transition)\b/i,
    names: ["fairlx_workflow_get"],
  },
  {
    pattern: /\b(unassigned|work item|bug|story|sprint|board|task|issue|backlog|epic|plan|roadmap|story points?)\b/i,
    names: [
      "fairlx_work_item_list",
      "fairlx_work_item_get",
      "fairlx_sprint_list",
      "fairlx_sprint_create",
      "fairlx_sprint_update",
      "fairlx_comment_list",
      "fairlx_work_item_create",
      "fairlx_work_item_update",
      "fairlx_work_item_bulk_update",
      "fairlx_work_item_delete",
      "fairlx_project_members_list",
    ],
  },
  {
    pattern: /\b(document(?:ation)?s?|prd|frd|srs|brd|user guide|api docs?|write(?: the)? docs?)\b/i,
    names: [
      "fairlx_doc_list",
      "fairlx_doc_get",
      "fairlx_doc_create",
      "fairlx_doc_update",
      "fairlx_work_item_list",
      "fairlx_sprint_list",
      "github_list_files",
      "github_read_file",
      "search_harness",
      "web_search",
      "web_fetch",
      "file_search",
      "code_inspect",
    ],
  },
  {
    pattern: /\b(search|find|look up|web|docs?)\b/i,
    names: ["web_search", "web_fetch", "file_search", "code_inspect", "search_harness", "personal_read", "fairlx_doc_list", "fairlx_doc_get"],
  },
  {
    pattern: /\b(bill(?:ing)?|invoice|usage|spend|wallet|credits?|how much (did|have we)|grok bill|luna bill)\b/i,
    names: ["fairlx_usage_summary", "fairlx_organization_get"],
  },
  {
    pattern: /\b(notification|inbox|mentions?)\b/i,
    names: ["fairlx_notification_list", "fairlx_notification_mark_read"],
  },
];

const FALLBACK = [
  "fairlx_work_item_list",
  "fairlx_work_item_get",
  "fairlx_sprint_list",
  "code_inspect",
  "use_skill",
  "personal_read",
  "list_workspaces",
  "list_projects",
];

function scoreName(name: string, query: string, wanted: Set<string>): number {
  if (ALWAYS.includes(name)) return 100;
  if (CORE_FAIRLX_TOOLS.includes(name)) {
    if (name === "fairlx_work_item_get" && !wanted.has(name)) return 0;
    return 90;
  }
  if (wanted.has(name)) return 80;
  const needle = query.toLowerCase();
  const hay = name.replace(/^fairlx_/, "").replaceAll("_", " ");
  if (needle && hay && needle.includes(hay.split(" ")[0] ?? "")) return 40;
  if (FALLBACK.includes(name)) return 20;
  return 0;
}

export function wantedToolNames(query: string): Set<string> {
  const wanted = new Set<string>([...ALWAYS, ...CORE_FAIRLX_TOOLS]);
  if (isDocResearchQuery(query) && !/\b(work item|ticket|assign|bug|story)\b/i.test(query)) {
    wanted.delete("fairlx_work_item_get");
  }
  const sendMail = isSendMailIntent(query);
  const invite = isOrgInviteIntent(query);
  for (const bucket of BUCKETS) {
    const isMailBucket = bucket.names.includes("mail_send");
    if (isMailBucket && !sendMail) continue;
    if (bucket.pattern.test(query) || (invite && bucket.names.includes("fairlx_workspace_member_add"))) {
      for (const name of bucket.names) {
        if (name === "mail_send" && !sendMail) continue;
        wanted.add(name);
      }
    }
  }
  if (wanted.size <= ALWAYS.length + CORE_FAIRLX_TOOLS.length) {
    for (const name of FALLBACK) wanted.add(name);
  }
  return wanted;
}

export function selectToolsForTurn<T extends SelectableTool>(
  tools: T[],
  query: string,
  options?: { hasGithubRepo?: boolean },
): T[] {
  if (!tools.length) return tools;
  const wanted = wantedToolNames(query);
  const skipGithubRead =
    options?.hasGithubRepo === false &&
    !/\b(pr\b|pull request|commit|github|repo|repository|edit the code|patch)\b/i.test(query);
  const ranked = [...tools].sort(
    (a, b) => scoreName(b.function.name, query, wanted) - scoreName(a.function.name, query, wanted),
  );
  const picked: T[] = [];
  const seen = new Set<string>();
  for (const tool of ranked) {
    const name = tool.function.name;
    if (skipGithubRead && /^(github_list_files|github_read_file|code_inspect)$/.test(name)) continue;
    if (name === "fairlx_work_item_get" && !wanted.has(name)) continue;
    const keep = wanted.has(name) || ALWAYS.includes(name) || scoreName(name, query, wanted) >= 40;
    if (/personal_backlog/.test(name) && !/\bpersonal\b/i.test(query)) continue;
    if (!keep && picked.length >= 12) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    picked.push(tool);
    if (picked.length >= SELECT_MAX_TOOLS) break;
  }
  if (picked.length < 8) {
    for (const tool of tools) {
      if (picked.length >= SELECT_MAX_TOOLS) break;
      if (skipGithubRead && /^(github_list_files|github_read_file|code_inspect)$/.test(tool.function.name)) continue;
      if (tool.function.name === "fairlx_work_item_get" && !wanted.has(tool.function.name)) continue;
      if (/personal_backlog/.test(tool.function.name) && !/\bpersonal\b/i.test(query)) continue;
      if (seen.has(tool.function.name)) continue;
      seen.add(tool.function.name);
      picked.push(tool);
    }
  }
  return picked;
}
