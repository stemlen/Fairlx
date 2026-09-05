import type { AgentContext, AgentHarness, AgentRun, AgentSpecialistId, McpConfig, PersonalTrainingAnswer } from "../types";
import { compilePersonaPrompt, inferPersonaRole } from "@fairlx/multi-agent";
import { AGENT_DEFINITIONS } from "./brain";
import { AGENT_SPECIALISTS, specialistById } from "./graph";
import { extractAttachedFiles, subjectsFromFiles, subjectsToc } from "./attachments";
import { matchingAutomations, rankKnowledge } from "./search";
import { isPersonalSessionMode, SESSION_MODE_INSTRUCTIONS } from "./session-context";
import { firstName } from "./agent-ui";
import { PROJECT_DOC_MARKDOWN_GUIDE, documentationPackInstructions } from "@fairlx/mcp-server/markdown";
import { formatProjectGithubLine, hasProjectGithubRepo } from "./github-scope";
import {
  buildTrainingInterviewPrompt,
  formatTrainingSnapshot,
  isTrainingRun,
  suggestedPersonaRole,
} from "./personal-training";
import { SYSTEM_PROMPT_RULE_LINES } from "./prompt-budget";

export { SYSTEM_PROMPT_RULE_LINES, splitSystemPromptBudget } from "./prompt-budget";

export function buildSystemPrompt(params: {
  harness: AgentHarness;
  context: AgentContext;
  run: AgentRun;
  mcp?: McpConfig;
  specialist?: AgentSpecialistId;
  personalPrompt?: string;
  personalAnswers?: PersonalTrainingAnswer[];
}): string {
  const { harness, context, run } = params;
  const lastUser = [...run.messages].reverse().find((message) => message.role === "user");
  const query = lastUser?.content || run.prompt || "";
  const specialist = specialistById(params.specialist || "orchestrator");
  const workspace =
    context.workspaces.find((item) => item.id === run.workspaceId) ??
    context.workspaces.find((item) => item.id === harness.settings.defaultWorkspaceId) ??
    context.workspaces[0];
  const project =
    context.projects.find((item) => item.id === run.projectId) ??
    context.projects.find((item) => item.id === harness.settings.defaultProjectId);
  const knowledge = rankKnowledge(query, harness, 3);
  const automations = matchingAutomations(harness, query).slice(0, 3);
  const role = workspace?.role ? ` Role: ${workspace.role}.` : "";
  const organization =
    (workspace?.organizationId
      ? context.organizations?.find((item) => item.id === workspace.organizationId)
      : undefined) ?? context.organizations?.[0];
  const orgRole = organization?.role ? ` Role: ${organization.role}.` : "";
  const personaRole = inferPersonaRole({ workspaceRole: workspace?.role, prompt: query, title: run.title });
  const persona = compilePersonaPrompt(personaRole, workspace?.name, project?.name);
  const sessionMode = harness.settings.sessionMode;
  const personal = isPersonalSessionMode(sessionMode);
  const training = isTrainingRun(run);

  if (training) {
    const trainingRole = suggestedPersonaRole(context, run.workspaceId || harness.settings.defaultWorkspaceId);
    return buildTrainingInterviewPrompt({
      userName: firstName(context.user.name, context.user.email),
      personaRole: trainingRole,
      workspaceRole: workspace?.role,
      workspaceName: workspace?.name,
      projectName: project?.name,
      retraining: Boolean(params.personalPrompt?.trim()),
      snapshot: formatTrainingSnapshot(
        context,
        run.workspaceId || harness.settings.defaultWorkspaceId || workspace?.id,
        run.projectId || harness.settings.defaultProjectId || project?.id,
      ),
      covered: params.personalAnswers,
    });
  }

  const lines = [
    personal
      ? "You are the Fairlx Personal Agent, the user's Chief of Staff. Talk to the user in plain language."
      : "You are the Fairlx Agent. Talk to the user in plain language.",
    persona,
    `Mode: ${run.mode === "agent" ? "tools on" : "chat only"}.`,
    workspace
      ? `Workspace: ${workspace.name}.${role} workspaceId: ${workspace.id}`
      : "No workspace selected.",
    organization
      ? `Organization: ${organization.name}.${orgRole} organizationId: ${organization.id}`
      : workspace?.organizationId
        ? "This workspace belongs to an organization. Call fairlx_organization_get for the name."
        : "No organization (personal workspace).",
    project
      ? `Project: ${project.name}${project.key ? ` (${project.key})` : ""}. projectId: ${project.id}${
          project.customLabels?.length
            ? ` Labels: ${project.customLabels.map((l) => l.name).join(", ")}.`
            : ""
        }`
      : "No project selected.",
    formatProjectGithubLine(context, project?.id),
  ];
  if (personal) lines.push(SESSION_MODE_INSTRUCTIONS.personal);
  if (personal && params.personalPrompt?.trim()) {
    lines.push(
      "",
      "Trained Personal Agent operating system (user-authored; follow over generic defaults):",
      params.personalPrompt.trim(),
    );
  }
  if (query) lines.push(`Task: ${query.slice(0, 400)}`);
  const connected = (harness.plugins ?? []).filter((plugin) => plugin.status === "connected");
  if (connected.length) {
    lines.push(`Plugins: ${connected.map((plugin) => plugin.displayName).join(", ")}.`);
  } else {
    lines.push("Plugins: Fairlx platform only. Mail, GitHub write, and extra MCP need connecting.");
  }
  const permission = harness.settings.permissionType === "all_access" ? "all_access" : "staged";
  lines.push(`Permission type: ${permission}. Fairlx RBAC still applies to every write.`);
  if (permission === "all_access") {
    lines.push("All-access mode: do not wait for Accept. Keep working until the Task is finished or the user Stops.");
  } else {
    lines.push(
      "Staged mode: create/update work items run immediately. Mail, GitHub writes/PRs, deletes, invites, project create, and project documents wait for Accept.",
    );
  }
  lines.push(
    "",
    "Rules:",
    ...SYSTEM_PROMPT_RULE_LINES,
    "- Independent specialists MUST launch together: emit every delegate_agent call in the same assistant step (not one per turn). The runtime runs them in parallel (up to 6 at once). Do not wait for one specialist to finish before launching others that do not depend on its result.",
    "- fairlx_sprint_list at most once per project. Omit status — do not call it for ACTIVE, then PLANNED, then ALL. status ALL is ignored. Skip listing entirely when the task is to unassign or assign a sprint.",
    "- To unassign every sprint item, call fairlx_work_item_bulk_update once with clearAssignees: true — do not pass assignPercent 0 with a person, and do not list first. To put one person on every item in a named sprint, call it once with sprintId as \"Sprint 1\" (name or number) and assigneeIds: [\"Name\"]; that replaces assignees.",
    "- Documentation is not parallel specialist work. Do not emit one delegate_agent per PRD, FRD, BRD, or other document type. A researcher may search the web first; then one writer saves at most two researched documents.",
    "- For billing, usage, spend, wallet balance, invoices, or cost by model (Grok, Luna, DeepSeek), call fairlx_usage_summary. Pass scope=organization (or organizationId) for the org bill; omit ids for this workspace. period is YYYY-MM. Do not search_harness for billing — spend lives in the usage ledger, not local knowledge.",
    "- Org departments own org permissions (billing, members, settings). List them with fairlx_department_list. Create with fairlx_department_create — pass departments: [{ name, permissions }] using keys like org.members.view and org.billing.manage. Add keys to an existing department with fairlx_department_permission_add. Do not invent org_department_create, create_role, or permission_grant.",
    hasProjectGithubRepo(context, project?.id)
      ? "- Edit code through github_read_file, github_write_file, and github_open_pr on linked repos. Pass files[] on github_open_pr for multi-file PRs. Never claim you ran git on the Fairlx host."
      : "- No GitHub repo is linked. Do not call github_write_file or github_open_pr. If the user asked to edit code, tell them to add a repository (Add one) — do not block planning or documentation on that.",
    `- ${documentationPackInstructions(hasProjectGithubRepo(context, project?.id))} ${PROJECT_DOC_MARKDOWN_GUIDE}`,
    "- Be concise in chat replies. Project documents are the opposite: long, cited research studies. Never save a short outline.",
  );

  if (knowledge.length) {
    lines.push("", "Notes:");
    for (const item of knowledge) {
      lines.push(`- ${item.title}: ${item.content.slice(0, 180)}`);
    }
  }
  if (automations.length) {
    lines.push("", "Automations:");
    for (const item of automations) {
      lines.push(`- ${item.name}: ${item.action}`);
    }
  }
  const attachedFromRun = params.run.messages.flatMap((message) =>
    message.role === "user" ? extractAttachedFiles(message.content) : [],
  );
  const attached = attachedFromRun.length ? attachedFromRun : extractAttachedFiles(query);
  if (attached.length) {
    const subjects = subjectsFromFiles(attached);
    lines.push("", "Attached spec files (full text is in the user message — do not search for them):");
    for (const file of attached) {
      lines.push(`- ${file.name} (${file.body.length} chars)`);
    }
    if (subjects.length) {
      lines.push(
        "Subjects — when creating work items, call delegate_agent once per subject with that heading as subject. When writing project documentation, ignore this split: research on the web, then save at most two long cited documents:",
      );
      lines.push(subjectsToc(subjects));
    }
  }
  if (specialist !== "orchestrator" && !personal) {
    const specialistDef = AGENT_SPECIALISTS.find((item) => item.id === specialist);
    const definition = AGENT_DEFINITIONS[specialist];
    lines.push(
      "",
      `Stay in the ${specialistDef?.name ?? specialist} role: ${definition?.identity ?? specialistDef?.role ?? ""}`.trim(),
    );
    if (definition?.done) lines.push(`Done when: ${definition.done}`);
  }
  return lines.join("\n");
}
