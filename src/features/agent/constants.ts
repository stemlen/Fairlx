import type {
  AgentModel,
  AgentProviderStored,
  AgentProviderType,
  AgentSkill,
  AgentWorkPattern,
  McpServerConfig,
} from "./types";

export const AGENT_MCP_QUERY_KEY = ["agent-mcp-config"] as const;
export const AGENT_AI_QUERY_KEY = ["agent-ai-config"] as const;
export const AGENT_RUNS_QUERY_KEY = ["agent-runs"] as const;
export const AGENT_HARNESS_QUERY_KEY = ["agent-harness"] as const;
export const AGENT_CONTEXT_QUERY_KEY = ["agent-context"] as const;
export const AGENT_BRIEFING_QUERY_KEY = ["agent-briefing"] as const;
export const PERSONAL_AGENT_QUERY_KEY = ["personal-agent"] as const;
export const AGENT_PLUGINS_QUERY_KEY = ["agent-plugins"] as const;
export const AGENT_JOBS_QUERY_KEY = ["agent-jobs"] as const;

export const PLATFORM_XAI_PROVIDER_ID = "platform-xai";
export const PLATFORM_DEEPSEEK_PROVIDER_ID = "platform-deepseek";
export const PLATFORM_FOUNDRY_PROVIDER_ID = "platform-foundry";
export const GROK_46_MODEL_ID = "grok-4.6";
export const DEEPSEEK_FLASH_MODEL_ID = "deepseek-flash";
export const FOUNDRY_GPT_LUNA_MODEL_ID = "gpt-5.6-luna";
export const LEGACY_FOUNDRY_DEEPSEEK_MODEL_ID = "foundry-deepseek-v4";

export const DEFAULT_FAIRLX_MCP_SERVER_NAME = "fairlx";
export const PERSONAL_MCP_SERVER_NAME = "fairlx-personal";
export const PERSONAL_MCP_URL = "in-process://personal";

export function isInternalMcpServer(name: string, server?: McpServerConfig): boolean {
  if (name === DEFAULT_FAIRLX_MCP_SERVER_NAME || name === PERSONAL_MCP_SERVER_NAME) return true;
  const url = String(server?.url || "");
  if (url === PERSONAL_MCP_URL || url === "/api/mcp" || url.endsWith("/api/mcp")) return true;
  return false;
}

export const PROVIDER_CATALOG: Array<{
  type: AgentProviderType;
  label: string;
  icon: string;
  defaultBaseUrl?: string;
  needsBaseUrl?: boolean;
}> = [
  { type: "anthropic", label: "Anthropic", icon: "fa-solid fa-brain" },
  { type: "azure", label: "Azure", icon: "fa-solid fa-cloud", needsBaseUrl: true },
  { type: "google", label: "Google", icon: "fa-brands fa-google" },
  { type: "openai", label: "OpenAI", icon: "fa-solid fa-microchip" },
  { type: "openrouter", label: "Open Router", icon: "fa-solid fa-route", defaultBaseUrl: "https://openrouter.ai/api/v1" },
  { type: "xai", label: "xAI", icon: "fa-solid fa-bolt", defaultBaseUrl: "https://api.x.ai/v1" },
  { type: "ollama", label: "Ollama", icon: "fa-solid fa-server", defaultBaseUrl: "http://localhost:11434", needsBaseUrl: true },
  { type: "custom", label: "Custom", icon: "fa-solid fa-plug", needsBaseUrl: true },
];

export function isPlatformGrokEnabled(): boolean {
  if (typeof process !== "undefined" && process.env) {
    if (process.env.ENABLE_PLATFORM_GROK === "true") return true;
    if (process.env.ENABLE_PLATFORM_GROK === "false") return false;
    if (process.env.NODE_ENV === "production") return false;
  }
  return true;
}

export const PLATFORM_XAI_PROVIDER: AgentProviderStored = {
  id: PLATFORM_XAI_PROVIDER_ID,
  provider: "azure",
  displayName: "Azure Grok (Fairlx)",
  baseUrl: "https://personal-use-g1-resource.openai.azure.com",
  extra: {
    vendor: "azure",
    deployment: "grok-4.6",
    openaiPath: "/openai/v1",
    authHeader: "api-key",
  },
  isEnabled: true,
  isPlatform: true,
};

export const PLATFORM_DEEPSEEK_PROVIDER: AgentProviderStored = {
  id: PLATFORM_DEEPSEEK_PROVIDER_ID,
  provider: "azure",
  displayName: "Azure DeepSeek (Fairlx)",
  baseUrl: "https://projectfairlx-resource.services.ai.azure.com/api/projects/projectfairlx",
  extra: {
    vendor: "azure",
    deployment: "DeepSeek-V4-Flash",
    openaiPath: "/openai/v1",
    authHeader: "api-key",
    project: "projectfairlx",
  },
  isEnabled: true,
  isPlatform: true,
};

export const PLATFORM_FOUNDRY_PROVIDER: AgentProviderStored = {
  id: PLATFORM_FOUNDRY_PROVIDER_ID,
  provider: "azure",
  displayName: "Azure Foundry (Fairlx)",
  baseUrl: "https://projectfairlx-resource.services.ai.azure.com",
  extra: {
    vendor: "azure",
    deployment: "gpt-5.6-luna",
    openaiPath: "/openai/v1",
    authHeader: "api-key",
    api: "responses",
  },
  isEnabled: true,
  isPlatform: true,
};

export const PLATFORM_GROK_MODEL: AgentModel = {
  id: GROK_46_MODEL_ID,
  providerId: PLATFORM_XAI_PROVIDER_ID,
  modelId: "grok-4.6",
  displayName: "Grok 4.6",
  role: "default",
  isEnabled: true,
  isPlatform: true,
  toolCalling: true,
  vision: true,
  maxInputTokens: 72000,
  maxOutputTokens: 128000,
};

export const PLATFORM_DEEPSEEK_MODEL: AgentModel = {
  id: DEEPSEEK_FLASH_MODEL_ID,
  providerId: PLATFORM_DEEPSEEK_PROVIDER_ID,
  modelId: "DeepSeek-V4-Flash",
  displayName: "DeepSeek V4 Flash",
  role: "default",
  isEnabled: true,
  isPlatform: true,
  toolCalling: true,
  vision: true,
  maxInputTokens: 64000,
  maxOutputTokens: 8192,
};

export const PLATFORM_FOUNDRY_MODEL: AgentModel = {
  id: FOUNDRY_GPT_LUNA_MODEL_ID,
  providerId: PLATFORM_FOUNDRY_PROVIDER_ID,
  modelId: "gpt-5.6-luna",
  displayName: "GPT-5.6 Luna",
  role: "custom",
  isEnabled: true,
  isPlatform: true,
  toolCalling: true,
  vision: true,
  maxInputTokens: 128000,
  maxOutputTokens: 128000,
};

export function getPlatformProviders(): AgentProviderStored[] {
  if (isPlatformGrokEnabled()) {
    return [PLATFORM_XAI_PROVIDER, PLATFORM_FOUNDRY_PROVIDER, PLATFORM_DEEPSEEK_PROVIDER];
  }
  return [PLATFORM_FOUNDRY_PROVIDER, PLATFORM_DEEPSEEK_PROVIDER];
}

export function getPlatformModels(): AgentModel[] {
  if (isPlatformGrokEnabled()) {
    return [
      PLATFORM_GROK_MODEL,
      { ...PLATFORM_FOUNDRY_MODEL, role: "custom" },
      { ...PLATFORM_DEEPSEEK_MODEL, role: "flash" },
    ];
  }
  return [
    { ...PLATFORM_FOUNDRY_MODEL, role: "custom" },
    { ...PLATFORM_DEEPSEEK_MODEL, role: "default" },
  ];
}

export function getPlatformDefaultModelId(): string {
  return isPlatformGrokEnabled() ? GROK_46_MODEL_ID : DEEPSEEK_FLASH_MODEL_ID;
}

// Public Azure resource URLs only. API keys live in server env (AGENT_*_AZURE_API_KEY).
export const PLATFORM_PROVIDERS: AgentProviderStored[] = [
  PLATFORM_XAI_PROVIDER,
  PLATFORM_FOUNDRY_PROVIDER,
  PLATFORM_DEEPSEEK_PROVIDER,
];

export const PLATFORM_MODELS: AgentModel[] = [
  PLATFORM_GROK_MODEL,
  { ...PLATFORM_FOUNDRY_MODEL, role: "custom" },
  { ...PLATFORM_DEEPSEEK_MODEL, role: "flash" },
];

export function getMcpServerIcon(name: string): { kind: "icon" | "badge"; value: string; className?: string } {
  const key = name.toLowerCase();
  if (key.includes("github")) return { kind: "icon", value: "fa-brands fa-github", className: "text-foreground" };
  if (key.includes("postgres") || key.includes("pgsql") || key.includes("database")) {
    return { kind: "icon", value: "fa-solid fa-database", className: "text-blue-500" };
  }
  if (key.includes("slack")) return { kind: "icon", value: "fa-brands fa-slack", className: "text-foreground" };
  if (key.includes("linear")) return { kind: "icon", value: "fa-solid fa-chart-gantt", className: "text-foreground" };
  if (key.includes("notion")) return { kind: "badge", value: "N" };
  if (key.includes("fairlx") || key.includes("personal")) return { kind: "icon", value: "fa-solid fa-cube", className: "text-primary" };
  return { kind: "icon", value: "fa-solid fa-server", className: "text-muted-foreground" };
}

export function getProviderCatalogItem(type: AgentProviderType) {
  return PROVIDER_CATALOG.find((item) => item.type === type);
}

export const AGENT_NAV = [
  { href: "/agent/dashboard", label: "Agent Home", icon: "fa-solid fa-house-chimney", shortcut: "⌘H" },
  { href: "/agent/chats", label: "Chats", icon: "fa-regular fa-comments" },
  { href: "/agent/projects", label: "Projects", icon: "fa-solid fa-folder" },
  { href: "/agent/workspaces", label: "Workspaces", icon: "fa-solid fa-briefcase" },
  { href: "/agent/git", label: "Git & staging", icon: "fa-solid fa-code-merge" },
  { href: "/agent/skills", label: "Skills", icon: "fa-solid fa-wrench" },
  { href: "/agent/tools", label: "Tools", icon: "fa-solid fa-screwdriver-wrench" },
  { href: "/agent/mcp", label: "MCP Servers", icon: "fa-solid fa-server" },
  { href: "/agent/automations", label: "Automations", icon: "fa-solid fa-bolt" },
  { href: "/agent/integrations", label: "Integrations", icon: "fa-solid fa-puzzle-piece" },
  { href: "/agent/knowledge", label: "Knowledge Base", icon: "fa-solid fa-book" },
  { href: "/agent/settings", label: "Settings", icon: "fa-solid fa-gear" },
] as const;

export const AGENT_SETTINGS_NAV = [
  { href: "/agent/settings#reset", label: "Reset", icon: "fa-solid fa-rotate-left" },
  { href: "/agent/settings#work-patterns", label: "Work patterns", icon: "fa-solid fa-diagram-project" },
] as const;

export const AGENT_TOOL_CATALOG = [
  {
    id: "code_inspect",
    name: "Code inspector",
    icon: "fa-solid fa-code",
    description: "Inspect work items, repositories, and docs.",
  },
  {
    id: "terminal",
    name: "Terminal",
    icon: "fa-solid fa-terminal",
    description: "Record planned shell commands. Never executed on the Fairlx host.",
  },
  {
    id: "file_search",
    name: "File search",
    icon: "fa-solid fa-file-magnifying-glass",
    description: "Search Fairlx docs and work items.",
  },
  {
    id: "web_search",
    name: "Web search",
    icon: "fa-solid fa-globe",
    description: "Search Wikipedia and the public web for research.",
  },
  {
    id: "web_fetch",
    name: "Fetch page",
    icon: "fa-solid fa-file-lines",
    description: "Fetch a public web page for research. Use after web search.",
  },
  {
    id: "database_query",
    name: "Database queries",
    icon: "fa-solid fa-database",
    description: "Query Fairlx workspaces, projects, items, and docs.",
  },
  {
    id: "use_skill",
    name: "Skills",
    icon: "fa-solid fa-bullseye",
    description: "Apply a saved skill from the harness.",
  },
  {
    id: "list_workspaces",
    name: "List workspaces",
    icon: "fa-solid fa-border-all",
    description: "List your Fairlx workspaces.",
  },
  {
    id: "list_projects",
    name: "List projects",
    icon: "fa-regular fa-folder",
    description: "List projects in your workspaces.",
  },
  {
    id: "list_work_items",
    name: "List work items",
    icon: "fa-regular fa-square-check",
    description: "List work items assigned to you.",
  },
  {
    id: "mcp_list",
    name: "MCP servers",
    icon: "fa-solid fa-server",
    description: "List configured MCP servers.",
  },
  {
    id: "mcp_call",
    name: "Call MCP tool",
    icon: "fa-solid fa-plug",
    description: "Call a tool on Fairlx MCP, personal MCP, or a connected HTTP MCP server.",
  },
  {
    id: "mcp_resources",
    name: "MCP resources",
    icon: "fa-solid fa-layer-group",
    description: "List MCP resources including personal harness content.",
  },
  {
    id: "delegate_agent",
    name: "Delegate specialist",
    icon: "fa-solid fa-sitemap",
    description: "Hand work to a planner, researcher, builder, git, ops, security, workflow, or reviewer specialist.",
  },
  {
    id: "search_harness",
    name: "Harness search",
    icon: "fa-solid fa-magnifying-glass",
    description: "Search chats, skills, knowledge, work, and MCP across the harness.",
  },
  {
    id: "create_project",
    name: "Create project",
    icon: "fa-regular fa-folder-plus",
    description: "Create a Fairlx project in a workspace you belong to.",
  },
  {
    id: "git_status",
    name: "Git status",
    icon: "fa-brands fa-git-alt",
    description: "Show linked repositories and the Agent staging buffer.",
  },
  {
    id: "git_stage",
    name: "Git stage",
    icon: "fa-solid fa-plus",
    description: "Stage a planned change in the harness buffer.",
  },
  {
    id: "git_unstage",
    name: "Git unstage",
    icon: "fa-solid fa-minus",
    description: "Remove a change from the staging buffer.",
  },
  {
    id: "git_commit_plan",
    name: "Git commit plan",
    icon: "fa-solid fa-code-commit",
    description: "Mark staged changes as a planned commit. Never runs git on the host.",
  },
  {
    id: "run_automation",
    name: "Run automation",
    icon: "fa-solid fa-bolt",
    description: "Apply a saved harness automation to the current context.",
  },
  {
    id: "personal_read",
    name: "Personal content",
    icon: "fa-regular fa-user",
    description: "Read skills, knowledge, rules, automations, chats, and staging from personal MCP.",
  },
  {
    id: "request_capability",
    name: "Request plugin",
    icon: "fa-solid fa-plug",
    description: "Ask the user to connect a missing plugin such as Outlook, Gmail, or GitHub write access.",
  },
  {
    id: "persist_memory",
    name: "Persist memory",
    icon: "fa-solid fa-brain",
    description: "Store a verified fact in harness STATE for later turns.",
  },
  {
    id: "mail_send",
    name: "Send mail",
    icon: "fa-regular fa-envelope",
    description: "Send email through a connected mail plugin after Accept.",
  },
  {
    id: "github_list_files",
    name: "List repo files",
    icon: "fa-solid fa-folder-tree",
    description: "List files in a linked GitHub repository.",
  },
  {
    id: "github_read_file",
    name: "Read repo file",
    icon: "fa-regular fa-file-code",
    description: "Read a file from a linked GitHub repository.",
  },
  {
    id: "github_write_file",
    name: "Write repo file",
    icon: "fa-solid fa-file-pen",
    description: "Create or update a file on a GitHub branch. Opens no host shell.",
  },
  {
    id: "github_open_pr",
    name: "Open pull request",
    icon: "fa-solid fa-code-pull-request",
    description: "Open a GitHub pull request from a branch.",
  },
  {
    id: "security_review",
    name: "Security review",
    icon: "fa-solid fa-shield-halved",
    description: "Scan linked source for vulnerabilities. Never exploits production.",
  },
  {
    id: "agent_job_status",
    name: "Job status",
    icon: "fa-solid fa-hourglass-half",
    description: "Check a long-running agent job such as a security scan.",
  },
] as const;

export const DEFAULT_ENABLED_TOOLS = AGENT_TOOL_CATALOG.map((tool) => tool.id);

export const NEW_AGENT_TOOL_IDS = [
  "mcp_call",
  "mcp_resources",
  "delegate_agent",
  "search_harness",
  "create_project",
  "git_status",
  "git_stage",
  "git_unstage",
  "git_commit_plan",
  "run_automation",
  "personal_read",
  "request_capability",
  "persist_memory",
  "mail_send",
  "github_list_files",
  "github_read_file",
  "github_write_file",
  "github_open_pr",
  "security_review",
  "agent_job_status",
  "web_fetch",
] as const;

export const STARTER_SKILLS: Omit<AgentSkill, "id" | "createdAt">[] = [
  {
    name: "Frontend",
    description: "UI, React, Next.js, and Tailwind in Fairlx.",
    instructions:
      "Prefer existing Fairlx UI components and fairlx-* tokens. Keep screens dynamic with live data. Avoid mock content and inaccessible markup.",
    enabled: true,
  },
  {
    name: "Backend",
    description: "Hono routes, Appwrite, and Fairlx domain APIs.",
    instructions:
      "Use existing Fairlx collections and RPC patterns. Validate input, return { data } or { error }, and never leak secrets. Prefer session-aware queries.",
    enabled: true,
  },
  {
    name: "DevOps",
    description: "Deployments, env, and operational safety.",
    instructions:
      "Do not execute host shell commands. Record planned commands instead. Never commit .env.local or secrets. Prefer existing setup scripts.",
    enabled: true,
  },
];

export const STARTER_WORK_PATTERNS: Omit<AgentWorkPattern, "id" | "createdAt">[] = [
  {
    name: "Ship small PRs",
    instructions: "Prefer small, reviewable changes. Summarize what changed and why.",
    enabled: true,
  },
  {
    name: "Ask before destructive actions",
    instructions: "Never delete, overwrite, or reset data without an explicit user request.",
    enabled: true,
  },
  {
    name: "Cursor-grade agent loop",
    instructions:
      "Inspect live Fairlx context first. Use MCP and harness tools instead of guessing. Stage planned git changes instead of claiming host execution. Keep answers short and shippable.",
    enabled: true,
  },
];

export const AGENT_FIELD_CLASS =
  "border-border bg-background text-foreground placeholder:text-muted-foreground";
