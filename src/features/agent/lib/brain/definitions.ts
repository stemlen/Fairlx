import type { AgentSpecialistId } from "../../types";

export const AGENT_DEFINITIONS: Record<
  AgentSpecialistId,
  {
    identity: string;
    done: string;
    model: "orchestrator" | "worker";
    tools: string[];
    prefixes: string[];
  }
> = {
  orchestrator: {
    identity: "Route work, keep context, and finish with a concise answer.",
    done: "The user has a complete answer or a pending Accept/Connect action.",
    model: "orchestrator",
    tools: ["delegate_agent", "request_capability", "search_harness", "persist_memory"],
    prefixes: ["fairlx_", "mail_", "github_", "security_", "agent_job"],
  },
  planner: {
    identity: "Write a shippable plan with ordered steps, stories, and work to create.",
    done: "One concrete plan with stories, acceptance criteria, and sprint fit.",
    model: "worker",
    tools: [
      "search_harness",
      "fairlx_work_item_list",
      "fairlx_sprint_list",
      "fairlx_project_get",
      "fairlx_project_members_list",
      "use_skill",
      "personal_read",
    ],
    prefixes: ["fairlx_work_item", "fairlx_sprint", "fairlx_doc"],
  },
  researcher: {
    identity: "Search Fairlx records, docs, repos, and the public web. Cite URLs from web_search and web_fetch. Do not write documents.",
    done: "Cited findings from tools, not guesses.",
    model: "worker",
    tools: [
      "search_harness",
      "web_search",
      "web_fetch",
      "file_search",
      "code_inspect",
      "github_read_file",
      "github_list_files",
      "fairlx_organization_get",
      "fairlx_organization_list",
      "fairlx_organization_workspaces_list",
      "fairlx_workspace_get",
      "mcp_resources",
      "personal_read",
    ],
    prefixes: ["fairlx_", "github_read", "github_list"],
  },
  builder: {
    identity: "Create Fairlx work items and sprints from the assigned subject. One module per pass.",
    done: "Proposed or applied changes, waiting for Accept when required.",
    model: "worker",
    tools: [
      "use_skill",
      "create_project",
      "web_search",
      "web_fetch",
      "github_read_file",
      "github_list_files",
      "github_write_file",
      "github_open_pr",
      "fairlx_work_item_create",
      "fairlx_work_item_update",
      "fairlx_work_item_bulk_update",
      "fairlx_sprint_create",
      "fairlx_sprint_update",
      "fairlx_sprint_list",
      "fairlx_project_create",
    ],
    prefixes: ["github_", "fairlx_work_item", "fairlx_sprint", "fairlx_project", "fairlx_doc"],
  },
  git: {
    identity: "Inspect linked repos and open real GitHub PRs. Never run git on the Fairlx host.",
    done: "Repo status, file diffs, or a pull request URL.",
    model: "worker",
    tools: [
      "git_status",
      "git_stage",
      "git_unstage",
      "git_commit_plan",
      "github_read_file",
      "github_list_files",
      "github_write_file",
      "github_open_pr",
    ],
    prefixes: ["git_", "github_"],
  },
  reviewer: {
    identity: "Check plans and diffs against work patterns and safety rules. Never grade your own work.",
    done: "Pass/fail with specific gaps.",
    model: "worker",
    tools: [
      "github_read_file",
      "github_list_files",
      "code_inspect",
      "search_harness",
      "fairlx_work_item_get",
      "fairlx_work_item_list",
    ],
    prefixes: ["github_read", "github_list", "fairlx_work_item_get", "fairlx_work_item_list"],
  },
  ops: {
    identity: "Company actions: org/workspace invites, project teams, assignments, and mail when the user asked to send email.",
    done: "The person is invited or the requested company action is completed.",
    model: "worker",
    tools: [
      "mail_send",
      "fairlx_work_item_get",
      "fairlx_work_item_list",
      "fairlx_work_item_update",
      "fairlx_work_item_bulk_update",
      "fairlx_comment_add",
      "fairlx_workspace_invite_get",
      "fairlx_workspace_member_add",
      "fairlx_workspace_members_list",
      "fairlx_organization_members_list",
      "fairlx_organization_get",
      "fairlx_organization_list",
      "fairlx_organization_workspaces_list",
      "fairlx_organization_update",
      "fairlx_project_team_create",
      "fairlx_project_member_add",
      "fairlx_project_team_member_add",
      "fairlx_project_team_list",
      "fairlx_usage_summary",
      "request_capability",
    ],
    prefixes: ["mail_", "fairlx_workspace", "fairlx_organization", "fairlx_project_member", "fairlx_project_team", "fairlx_comment", "fairlx_work_item", "fairlx_usage"],
  },
  security: {
    identity: "Review linked source for vulnerabilities. Cite file paths. Never exploit production.",
    done: "Verified findings with file paths, or a running security job id.",
    model: "worker",
    tools: [
      "security_review",
      "github_read_file",
      "github_list_files",
      "code_inspect",
      "agent_job_status",
      "request_capability",
    ],
    prefixes: ["security_", "github_read", "github_list", "agent_job"],
  },
  workflow: {
    identity: "Inspect and propose Fairlx workflow statuses and transitions.",
    done: "A concrete workflow change the user can Accept.",
    model: "worker",
    tools: ["fairlx_workflow_get", "search_harness", "use_skill"],
    prefixes: ["fairlx_workflow"],
  },
};

export function specialistToolAllowlist(id: AgentSpecialistId): { names: Set<string>; prefixes: string[] } {
  const def = AGENT_DEFINITIONS[id] ?? AGENT_DEFINITIONS.orchestrator;
  return { names: new Set(def.tools), prefixes: def.prefixes };
}
