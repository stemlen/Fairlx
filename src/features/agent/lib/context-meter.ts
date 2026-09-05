import { listToolsForClient } from "../../../../packages/fairlx-mcp/src/tools/catalog";
import { DEFAULT_ENABLED_TOOLS, isInternalMcpServer } from "../constants";
import type {
  AgentAiConfigPublic,
  AgentChatMessage,
  AgentContext,
  AgentContextChip,
  AgentHarness,
  AgentRun,
  AgentRunMode,
  AgentToolEvent,
  McpConfig,
} from "../types";
import { AGENT_DEFINITIONS } from "./brain/definitions";
import { compressMessages } from "./brain/compress";
import { selectToolsForTurn } from "./brain/select";
import { AGENT_SPECIALISTS } from "./graph";
import { SYSTEM_PROMPT_RULE_LINES, splitSystemPromptBudget } from "./prompt-budget";
import { isPersonalSessionMode, runModeForSession, SESSION_MODE_INSTRUCTIONS } from "./session-context";
import { openaiToolsForTurn, type OpenAiTool } from "./tool-schemas";

export type ContextCategoryId =
  | "system_prompt"
  | "tool_definitions"
  | "rules"
  | "skills"
  | "mcp_dynamic_tools"
  | "subagent_definitions"
  | "summarized_conversation"
  | "conversation";

export type ContextCategory = {
  id: ContextCategoryId;
  name: string;
  tokens: number;
  color: string;
};

export type ContextUsageDetails = {
  totalTokens: number;
  maxTokens: number;
  percentFull: number;
  categories: ContextCategory[];
};

export type ContextMeterPayload = {
  tokens: number;
  maxInputTokens: number;
  subagents: number;
  breakdown: Record<ContextCategoryId, number>;
};

export type ContextChatPeak = {
  conversation: number;
  summarized_conversation: number;
};

export function chatTokenTotal(peak?: Partial<ContextChatPeak> | null): number {
  return Math.max(0, (peak?.conversation ?? 0) + (peak?.summarized_conversation ?? 0));
}

export function takeHigherChatPeak(
  current?: Partial<ContextChatPeak> | null,
  incoming?: Partial<ContextChatPeak> | null,
): ContextChatPeak {
  const incomingTotal = chatTokenTotal(incoming);
  if (incomingTotal >= chatTokenTotal(current)) {
    return {
      conversation: Math.max(0, incoming?.conversation ?? 0),
      summarized_conversation: Math.max(0, incoming?.summarized_conversation ?? 0),
    };
  }
  return {
    conversation: Math.max(0, current?.conversation ?? 0),
    summarized_conversation: Math.max(0, current?.summarized_conversation ?? 0),
  };
}

export const CONTEXT_MESSAGE_WINDOW = 24;

export const CONTEXT_CATEGORIES_CONFIG: Array<{
  id: ContextCategoryId;
  name: string;
  color: string;
}> = [
  { id: "system_prompt", name: "System prompt", color: "#64748b" },
  { id: "tool_definitions", name: "Tool definitions", color: "#8b5cf6" },
  { id: "rules", name: "Rules", color: "#10b981" },
  { id: "skills", name: "Skills", color: "#d97706" },
  { id: "mcp_dynamic_tools", name: "MCP & dynamic tools", color: "#c026d3" },
  { id: "subagent_definitions", name: "Subagent definitions", color: "#0284c7" },
  { id: "summarized_conversation", name: "Summarized conversation", color: "#e11d48" },
  { id: "conversation", name: "Conversation", color: "#ea580c" },
];

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateTokensFromJson(value: unknown): number {
  if (value == null) return 0;
  if (Array.isArray(value) && value.length === 0) return 0;
  try {
    return estimateTokensFromText(JSON.stringify(value));
  } catch {
    return 0;
  }
}

export function formatTokenCount(tokens: number): string {
  if (!tokens || tokens <= 0) return "0";
  if (tokens >= 1_000_000) {
    const val = tokens / 1_000_000;
    return `${val.toFixed(1).replace(/\.0$/, "")}M`;
  }
  // Keep exact counts below 10K so a longer prompt is visible (3461 and 3491 both
  // used to display as "3.5K").
  if (tokens >= 10_000) {
    const val = tokens / 1000;
    return `${val.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return tokens.toLocaleString("en-US");
}

export function formatTokenHeader(totalTokens: number, maxTokens: number): string {
  const approximate = totalTokens >= 10_000;
  const totalFormatted = approximate ? `~${formatTokenCount(totalTokens)}` : formatTokenCount(totalTokens);
  const maxFormatted = formatTokenCount(maxTokens);
  return `${totalFormatted} / ${maxFormatted} Tokens`;
}

function estimateMessageTokens(message: AgentChatMessage): number {
  let chars = message.content?.length ?? 0;
  chars += message.role.length;
  if (message.toolName) chars += message.toolName.length;
  if (message.toolCallId) chars += message.toolCallId.length;
  if (message.toolCalls?.length) {
    for (const call of message.toolCalls) {
      chars += call.id.length + call.name.length + (call.arguments?.length ?? 0);
    }
  }
  return estimateTokensFromText("x".repeat(chars));
}

export function estimateRunTokens(messages: AgentChatMessage[], systemChars = 0): number {
  const messageTokens = messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  return messageTokens + estimateTokensFromText("x".repeat(systemChars));
}

function isMcpOrDynamicTool(name: string): boolean {
  return name.startsWith("fairlx_") || name.startsWith("mcp_");
}

function partitionTools(tools: OpenAiTool[]): { native: OpenAiTool[]; mcp: OpenAiTool[] } {
  const native: OpenAiTool[] = [];
  const mcp: OpenAiTool[] = [];
  for (const tool of tools) {
    if (isMcpOrDynamicTool(tool.function.name)) mcp.push(tool);
    else native.push(tool);
  }
  return { native, mcp };
}

function partitionConversation(
  messages: AgentChatMessage[],
  extraText = "",
): { conversation: number; summarized: number } {
  if (!messages.length && !extraText) {
    return { conversation: 0, summarized: 0 };
  }

  const compressed = compressMessages(messages);
  let recent = compressed.slice(-CONTEXT_MESSAGE_WINDOW);
  const firstUser = messages.find((message) => message.role === "user");
  if (firstUser && !recent.some((message) => message.id === firstUser.id)) {
    recent = [firstUser, ...recent.filter((message) => message.id !== firstUser.id)].slice(
      0,
      CONTEXT_MESSAGE_WINDOW + 1,
    );
  }

  const recentIds = new Set(recent.map((message) => message.id));
  const dropped = messages.filter((message) => !recentIds.has(message.id));
  const originalById = new Map(messages.map((message) => [message.id, message]));

  let conversation = extraText ? estimateTokensFromText(extraText) : 0;
  let summarized = dropped.reduce((sum, message) => sum + estimateMessageTokens(message), 0);

  for (const message of recent) {
    const original = originalById.get(message.id);
    const wasCompressed =
      Boolean(original) && original !== message && (original?.content ?? "") !== (message.content ?? "");
    // Count the original size in Summarized so compaction moves tokens instead of
    // deleting them from the meter (compressed bodies are only a few hundred chars).
    if (wasCompressed) summarized += estimateMessageTokens(original!);
    else conversation += estimateMessageTokens(message);
  }

  return { conversation, summarized };
}

function skillsText(harness?: AgentHarness): string {
  if (!harness?.skills?.length) return "";
  return harness.skills
    .filter((skill) => skill.enabled)
    .map((skill) => [skill.name, skill.description, skill.instructions].filter(Boolean).join("\n"))
    .join("\n\n");
}

function workPatternText(harness?: AgentHarness): string {
  if (!harness?.workPatterns?.length) return "";
  return harness.workPatterns
    .filter((pattern) => pattern.enabled)
    .map((pattern) => [pattern.name, pattern.instructions].filter(Boolean).join("\n"))
    .join("\n\n");
}

function connectedPluginText(harness?: AgentHarness): string {
  if (!harness?.plugins?.length) return "";
  return harness.plugins
    .filter((plugin) => plugin.status === "connected")
    .map((plugin) => `${plugin.displayName} ${plugin.catalogId} ${plugin.capabilities.join(" ")}`)
    .join("\n");
}

function externalMcpText(mcp?: McpConfig): string {
  if (!mcp?.mcpServers) return "";
  return Object.entries(mcp.mcpServers)
    .filter(([name, server]) => !isInternalMcpServer(name, server) && !server.disabled)
    .map(([name, server]) => `${name} ${server.transport ?? ""} ${server.url ?? server.command ?? ""}`)
    .join("\n");
}

function subagentDefinitionsText(): string {
  return JSON.stringify({
    specialists: AGENT_SPECIALISTS,
    definitions: AGENT_DEFINITIONS,
  });
}

function emptyContext(): AgentContext {
  return {
    user: { id: "", name: "", email: "" },
    workspaces: [],
    projects: [],
    workItems: [],
    notifications: [],
    githubRepos: [],
    integrations: [],
    docs: [],
    organizations: [],
  };
}

function previewRun(params: {
  run?: AgentRun;
  harness?: AgentHarness;
  workspaceId?: string;
  projectId?: string;
  mode: AgentRunMode;
}): AgentRun {
  if (params.run) return params.run;
  return {
    id: "",
    userId: "",
    title: "",
    prompt: "",
    status: "idle",
    mode: params.mode,
    workspaceId: params.workspaceId || params.harness?.settings.defaultWorkspaceId,
    projectId: params.projectId || params.harness?.settings.defaultProjectId,
    messages: [],
    events: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function resolveRunMode(harness?: AgentHarness, run?: AgentRun): AgentRunMode {
  if (run?.mode) return run.mode;
  return runModeForSession(harness?.settings.sessionMode || "agent");
}

function toolsForPreview(params: {
  mode: AgentRunMode;
  harness?: AgentHarness;
}): OpenAiTool[] {
  if (params.mode !== "agent") return [];
  const enabledTools = params.harness?.settings.enabledTools ?? DEFAULT_ENABLED_TOOLS;
  // Keep the empty-query tool set so the meter does not jump when the last user
  // message changes (selectToolsForTurn otherwise swaps MCP vs native tools).
  return selectToolsForTurn(
    openaiToolsForTurn({
      mode: params.mode,
      enabledTools,
      mcpTools: listToolsForClient(),
    }),
    "",
  );
}

function skillsWereLoaded(messages: AgentChatMessage[], chips: AgentContextChip[]): boolean {
  if (chips.some((chip) => chip.kind === "skill")) return true;
  return messages.some(
    (message) =>
      message.toolName === "use_skill" || message.toolCalls?.some((call) => call.name === "use_skill"),
  );
}

function subagentsWereUsed(run?: AgentRun): boolean {
  return Boolean(
    run?.events?.some(
      (event) => event.type === "subagent_started" || event.type === "delegate_agent" || event.type === "subagent_done",
    ),
  );
}

function emptyUsage(maxTokens: number): ContextUsageDetails {
  return {
    totalTokens: 0,
    maxTokens,
    percentFull: 0,
    categories: CONTEXT_CATEGORIES_CONFIG.map((cfg) => ({
      id: cfg.id,
      name: cfg.name,
      color: cfg.color,
      tokens: 0,
    })),
  };
}

function systemPromptForPreview(params: {
  harness?: AgentHarness;
  context?: AgentContext;
  run?: AgentRun;
  workspaceId?: string;
  projectId?: string;
  mode: AgentRunMode;
  personalPrompt?: string;
}): string {
  const context = params.context ?? emptyContext();
  const run = previewRun(params);
  const sessionMode = params.harness?.settings.sessionMode || "agent";
  const personal = isPersonalSessionMode(sessionMode);
  const workspace =
    context.workspaces.find((item) => item.id === run.workspaceId) ??
    context.workspaces.find((item) => item.id === params.harness?.settings.defaultWorkspaceId) ??
    context.workspaces[0];
  const project =
    context.projects.find((item) => item.id === run.projectId) ??
    context.projects.find((item) => item.id === params.harness?.settings.defaultProjectId);
  const role = workspace?.role ? ` Role: ${workspace.role}.` : "";
  const organization =
    (workspace?.organizationId
      ? context.organizations?.find((item) => item.id === workspace.organizationId)
      : undefined) ?? context.organizations?.[0];
  const orgRole = organization?.role ? ` Role: ${organization.role}.` : "";
  const connected = (params.harness?.plugins ?? []).filter((plugin) => plugin.status === "connected");
  const permission = params.harness?.settings.permissionType === "all_access" ? "all_access" : "staged";
  const lines = [
    personal
      ? "You are the Fairlx Personal Agent, the user's Chief of Staff. Talk to the user in plain language."
      : "You are the Fairlx Agent. Talk to the user in plain language.",
    workspace && project ? `${workspace.name} / ${project.name}` : workspace?.name || "",
    `Mode: ${params.mode === "agent" ? "tools on" : "chat only"}.`,
    workspace
      ? `Workspace: ${workspace.name}.${role} workspaceId: ${workspace.id}`
      : "No workspace selected.",
    organization
      ? `Organization: ${organization.name}.${orgRole} organizationId: ${organization.id}`
      : workspace?.organizationId
        ? "This workspace belongs to an organization. Call fairlx_organization_get for the name."
        : "No organization (personal workspace).",
    project
      ? `Project: ${project.name}${project.key ? ` (${project.key})` : ""}. projectId: ${project.id}`
      : "No project selected.",
  ];
  if (personal) lines.push(SESSION_MODE_INSTRUCTIONS.personal);
  if (personal && params.personalPrompt?.trim()) {
    lines.push(
      "",
      "Trained Personal Agent operating system (user-authored; follow over generic defaults):",
      params.personalPrompt.trim(),
    );
  }
  if (connected.length) {
    lines.push(`Plugins: ${connected.map((plugin) => plugin.displayName).join(", ")}.`);
  } else {
    lines.push("Plugins: Fairlx platform only. Mail, GitHub write, and extra MCP need connecting.");
  }
  lines.push(`Permission type: ${permission}. Fairlx RBAC still applies to every write.`);
  lines.push("", "Rules:", ...SYSTEM_PROMPT_RULE_LINES);
  return lines.filter((line) => line !== undefined).join("\n");
}

export function computeContextBreakdown(params: {
  system: string;
  tools: OpenAiTool[];
  messages: AgentChatMessage[];
  harness?: AgentHarness;
  mcp?: McpConfig;
  extraConversationText?: string;
  includeSubagents?: boolean;
}): Record<ContextCategoryId, number> {
  const { identity, rules } = splitSystemPromptBudget(params.system);
  const { native, mcp } = partitionTools(params.tools);
  const { conversation, summarized } = partitionConversation(params.messages, params.extraConversationText);
  const includeSubagents = params.includeSubagents ?? true;

  return {
    system_prompt: estimateTokensFromText(identity),
    tool_definitions: estimateTokensFromJson(native),
    rules: estimateTokensFromText(rules) + estimateTokensFromText(workPatternText(params.harness)),
    skills: estimateTokensFromText(skillsText(params.harness)),
    mcp_dynamic_tools:
      estimateTokensFromJson(mcp) +
      estimateTokensFromText(connectedPluginText(params.harness)) +
      estimateTokensFromText(externalMcpText(params.mcp)),
    subagent_definitions: includeSubagents ? estimateTokensFromText(subagentDefinitionsText()) : 0,
    summarized_conversation: summarized,
    conversation,
  };
}

export function buildContextMeterPayload(params: {
  system: string;
  tools: OpenAiTool[];
  messages: AgentChatMessage[];
  harness?: AgentHarness;
  mcp?: McpConfig;
  maxInputTokens: number;
  subagents?: number;
}): ContextMeterPayload {
  const breakdown = computeContextBreakdown(params);
  const tokens = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return {
    tokens,
    maxInputTokens: params.maxInputTokens || 0,
    subagents: params.subagents ?? 0,
    breakdown,
  };
}

export function latestContextMeter(events: AgentToolEvent[]): {
  tokens: number;
  maxInputTokens: number;
  subagents: number;
  breakdown?: Partial<Record<ContextCategoryId, number>>;
} | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.type !== "context_meter") continue;
    const payload = event.payload as {
      tokens?: number;
      maxInputTokens?: number;
      subagents?: number;
      breakdown?: Partial<Record<ContextCategoryId, number>>;
    } | undefined;
    if (!payload) continue;
    return {
      tokens: Number(payload.tokens) || 0,
      maxInputTokens: Number(payload.maxInputTokens) || 0,
      subagents: Number(payload.subagents) || 0,
      breakdown: payload.breakdown,
    };
  }
  return undefined;
}

export function calculateContextUsage(params: {
  run?: AgentRun;
  harness?: AgentHarness;
  context?: AgentContext;
  ai?: AgentAiConfigPublic;
  mcp?: McpConfig;
  draftPrompt?: string;
  chips?: AgentContextChip[];
  personalPrompt?: string;
  modelId?: string;
  maxInputTokens?: number;
  workspaceId?: string;
  projectId?: string;
}): ContextUsageDetails {
  const {
    run,
    harness,
    context,
    ai,
    mcp,
    draftPrompt = "",
    chips = [],
    personalPrompt,
    modelId,
    maxInputTokens,
    workspaceId,
    projectId,
  } = params;

  const events = run?.events ?? [];
  const meter = run ? latestContextMeter(events) : undefined;
  const selectedModelId = modelId || run?.modelId || ai?.selectedModelId || ai?.resolvedModelId;
  const matchedModel = ai?.models.find((m) => m.id === selectedModelId);
  const maxTokens =
    maxInputTokens ||
    meter?.maxInputTokens ||
    matchedModel?.maxInputTokens ||
    64000;

  const mode = resolveRunMode(harness, run);
  const extraConversation = [
    draftPrompt,
    ...chips.map((chip) => [chip.label, chip.meta, chip.content].filter(Boolean).join(" ")),
  ]
    .filter(Boolean)
    .join("\n");
  const hasChatContent = Boolean((run?.messages?.length ?? 0) > 0 || extraConversation.trim());

  if (!hasChatContent) {
    return emptyUsage(maxTokens);
  }

  const live = computeContextBreakdown({
    system: systemPromptForPreview({
      harness,
      context,
      run,
      workspaceId,
      projectId,
      mode,
      personalPrompt,
    }),
    tools: toolsForPreview({ mode, harness }),
    messages: run?.messages ?? [],
    harness,
    mcp,
    extraConversationText: extraConversation,
    includeSubagents: mode === "agent" && subagentsWereUsed(run),
  });
  if (!skillsWereLoaded(run?.messages ?? [], chips)) {
    live.skills = 0;
  }

  const meterChat = Math.max(
    (meter?.breakdown?.conversation ?? 0) + (meter?.breakdown?.summarized_conversation ?? 0),
    chatTokenTotal(run?.contextPeak),
  );
  const liveChat = live.conversation + live.summarized_conversation;
  const vanishedChat = Math.max(0, Math.round(meterChat - liveChat));
  if (vanishedChat > 0) {
    live.summarized_conversation += vanishedChat;
  }

  const breakdown = live;

  const categories: ContextCategory[] = CONTEXT_CATEGORIES_CONFIG.map((cfg) => ({
    id: cfg.id,
    name: cfg.name,
    color: cfg.color,
    tokens: Math.max(0, Math.round(breakdown[cfg.id] ?? 0)),
  }));

  const totalTokens = categories.reduce((sum, cat) => sum + cat.tokens, 0);
  const percentFull = maxTokens > 0 ? Math.min(100, Math.max(0, Math.round((totalTokens / maxTokens) * 100))) : 0;

  return {
    totalTokens,
    maxTokens,
    percentFull,
    categories,
  };
}

export function activeSubagents(events: AgentToolEvent[]) {
  const started = events.filter((event) => event.type === "subagent_started");
  const done = new Set(
    events
      .filter((event) => event.type === "subagent_done")
      .map((event) => {
        const payload = event.payload as { id?: string } | undefined;
        return payload?.id;
      })
      .filter(Boolean),
  );
  return started
    .map((event) => {
      const payload = (event.payload ?? {}) as {
        id?: string;
        specialist?: string;
        parent?: string;
        task?: string;
      };
      return {
        id: payload.id || event.id,
        specialist: payload.specialist || "worker",
        parent: payload.parent || "orchestrator",
        task: payload.task || event.detail || event.title,
        done: done.has(payload.id || event.id),
        title: event.title,
      };
    })
    .filter((item) => !item.done);
}

export function editedFilePaths(events: AgentToolEvent[]): string[] {
  const paths: string[] = [];
  for (const event of events) {
    if (event.type !== "github_write_file" && event.type !== "git_stage") continue;
    const payload = event.payload as { path?: string } | undefined;
    const path = payload?.path || event.detail;
    if (path && !paths.includes(path)) paths.push(path);
  }
  return paths;
}
