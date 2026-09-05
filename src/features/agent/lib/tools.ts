import type { Databases } from "node-appwrite";
import type { AuthContext } from "@fairlx/mcp-server";

import type {
  AgentCapability,
  AgentContext,
  AgentHarness,
  AgentPluginConnection,
  AgentRun,
  AgentRunMode,
  AgentSpecialistId,
  AgentToolEvent,
  AgentToolEventType,
  McpConfig,
} from "../types";
import { AGENT_TOOL_CATALOG } from "../constants";
import { specialistById } from "./graph";
import { commitStaged, stageItem, unstageItem } from "./git-staging";
import { callMcpServerTool, ensurePersonalMcp, listMcpResourcesForServer } from "./mcp-bridge";
import { createFairlxProject } from "./mutations";
import { readPersonalContent } from "./personal";
import { compilePersonalPrompt, isPersonalPersonaRole } from "./personal-training";
import { upsertPersonalAgent } from "./personal-agent-store";
import { toPublicMcpConfig } from "./public-mcp";
import { matchingAutomations, searchAgentIndex } from "./search";
import { HARNESS_TO_MCP } from "./parse-tool-calls";
import { compactJsonString, unwrapMcpToolContent } from "./truncate";
import {
  MAX_PROJECT_DOCS_PER_TURN,
  docPackCompletePayload,
  emptyDocTurnLimits,
  hasRequiredWebResearch,
  noteWebResearch,
  releaseDocCreateSlot,
  researchRequiredPayload,
  reserveDocCreateSlot,
  reserveWebFetchSlot,
  webFetchCapPayload,
  type DocTurnLimits,
} from "./doc-turn-limits";
import { fetchPublicPage, searchPublicWeb } from "./web-research";
import { attachedSearchPayload, extractAttachedFiles } from "./attachments";
import { catalogForCapability, missingCapabilities } from "../plugins/catalog";
import { sendMailViaPlugin } from "../plugins/mail";
import { githubCapabilityGap, parsePrFiles } from "../plugins/github-helpers";
import {
  githubCommitFilesAndOpenPr,
  githubListFiles,
  githubOpenPullRequest,
  githubReadFile,
  githubWriteFile,
  resolveGithubRepo,
} from "../plugins/github";
import { scanSourceFiles, verifyFindings } from "../plugins/security";
import { commentMailedWorkItem, publishSecurityFindings } from "./fairlx-side-effects";
import { createAgentJob, getAgentJob } from "./jobs";
import { scheduleAgentJob } from "./schedule-job";

export type OpenAiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolExecutionContext = {
  runId: string;
  userId: string;
  context: AgentContext;
  harness: AgentHarness;
  mcp: McpConfig;
  databases?: Databases;
  runs?: AgentRun[];
  workspaceId?: string;
  projectId?: string;
  mcpAuth?: AuthContext;
  allowPersonalSave?: boolean;
  plugins?: AgentPluginConnection[];
  sourcePrompt?: string;
  turnLimits?: DocTurnLimits;
};

export { MAX_PROJECT_DOCS_PER_TURN } from "./doc-turn-limits";

export type ToolExecutionResult = {
  content: string;
  event: AgentToolEvent;
  harnessPatch?: Partial<Pick<AgentHarness, "gitStaging" | "chatMeta" | "knowledge" | "plugins">>;
  delegate?: { agent: AgentSpecialistId; task: string; subject?: string };
  missingCapability?: AgentCapability;
};

const TOOL_PARAMETERS: Record<string, { description: string; parameters: Record<string, unknown> }> = {
  code_inspect: {
    description: "Inspect Fairlx work items, repositories, and docs related to the current user.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to inspect." },
        kind: { type: "string", enum: ["work_item", "repo", "doc", "all"] },
      },
    },
  },
  terminal: {
    description: "Record a planned shell command. Never executed on the Fairlx host.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["command"],
    },
  },
  file_search: {
    description: "Search Fairlx docs and work items.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  web_search: {
    description:
      "Search Wikipedia and the public web. Use several distinct queries (market, competitors, users, regulations). Then web_fetch the best URLs. Required before creating project docs.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  web_fetch: {
    description:
      "Fetch a public http(s) page and return visible text for research. Use after web_search. Do not fetch localhost or private IPs.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  database_query: {
    description: "Query Fairlx workspaces, projects, work items, or docs.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", enum: ["workspaces", "projects", "work_items", "docs", "all"] },
        query: { type: "string" },
      },
    },
  },
  use_skill: {
    description: "Load an enabled harness skill by id or name.",
    parameters: {
      type: "object",
      properties: {
        skillId: { type: "string" },
        name: { type: "string" },
      },
    },
  },
  list_workspaces: {
    description: "List the user's Fairlx workspaces.",
    parameters: { type: "object", properties: {} },
  },
  list_projects: {
    description: "List Fairlx projects, optionally filtered by workspaceId.",
    parameters: {
      type: "object",
      properties: { workspaceId: { type: "string" } },
    },
  },
  list_work_items: {
    description: "List assigned work items, optionally filtered.",
    parameters: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        projectId: { type: "string" },
        query: { type: "string" },
      },
    },
  },
  mcp_list: {
    description: "List configured MCP servers without leaking secrets.",
    parameters: { type: "object", properties: {} },
  },
  mcp_call: {
    description: "Call a tool on an external MCP server only. For Fairlx platform data, call the native fairlx_* tools directly — do not wrap them in mcp_call.",
    parameters: {
      type: "object",
      properties: {
        server: { type: "string" },
        tool: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["tool"],
    },
  },
  mcp_resources: {
    description: "List MCP resources for a server, including fairlx://me/* personal content.",
    parameters: {
      type: "object",
      properties: { server: { type: "string" } },
    },
  },
  delegate_agent: {
    description:
      "Delegate one subject to a specialist. Independent work MUST be multiple delegate_agent calls in the same step so they run in parallel. Set subject to a spec heading (one module). Planner = timeline; builder = create that subject's work; ops = assign a percent. Do not delegate once per PRD/FRD/BRD — documentation is one builder or the orchestrator.",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          enum: ["planner", "researcher", "builder", "git", "reviewer", "ops", "security", "workflow"],
        },
        subject: {
          type: "string",
          description: "One spec heading or module name. Required when splitting a product spec.",
        },
        task: { type: "string" },
      },
      required: ["task"],
    },
  },
  search_harness: {
    description: "Search chats, workspaces, projects, skills, knowledge, automations, docs, repos, MCP, and staging.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  create_project: {
    description: "Create a Fairlx project in a workspace the user belongs to.",
    parameters: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  git_status: {
    description: "Show linked GitHub repositories and the Agent git staging buffer.",
    parameters: { type: "object", properties: {} },
  },
  git_stage: {
    description: "Stage a planned change. Does not run git on the host.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        summary: { type: "string" },
        repoId: { type: "string" },
        branch: { type: "string" },
      },
      required: ["path"],
    },
  },
  git_unstage: {
    description: "Unstage a planned change by id or path.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, path: { type: "string" } },
    },
  },
  git_commit_plan: {
    description: "Mark staged items as a planned commit. Never executes git commit on the host.",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
  run_automation: {
    description: "Load a saved automation and return the action the Agent should follow.",
    parameters: {
      type: "object",
      properties: { automationId: { type: "string" }, name: { type: "string" } },
    },
  },
  personal_read: {
    description: "Read personal MCP content: harness, skills, knowledge, rules, automations, chats, staging.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["harness", "skills", "knowledge", "rules", "automations", "chats", "staging"],
        },
        query: { type: "string" },
      },
    },
  },
  save_personal_agent: {
    description:
      "Save the trained Personal Agent standing prompt from this interview. Call only after covering the agenda. Include every question and answer plus a detailed compiledPrompt.",
    parameters: {
      type: "object",
      properties: {
        personaRole: { type: "string", enum: ["tech_lead", "frontend", "qa", "pm"] },
        jobTitle: { type: "string" },
        compiledPrompt: { type: "string" },
        answers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              answer: { type: "string" },
            },
            required: ["question", "answer"],
          },
        },
      },
      required: ["personaRole", "answers", "compiledPrompt"],
    },
  },
  request_capability: {
    description: "Request the user connect a missing plugin. Use when mail, GitHub write, or another capability is not configured.",
    parameters: {
      type: "object",
      properties: {
        capability: {
          type: "string",
          enum: ["email.send", "code.read", "code.write", "security.review", "chat.notify"],
        },
        reason: { type: "string" },
      },
      required: ["capability"],
    },
  },
  persist_memory: {
    description: "Store a short verified fact in harness STATE.",
    parameters: {
      type: "object",
      properties: { fact: { type: "string" } },
      required: ["fact"],
    },
  },
  mail_send: {
    description: "Send email through a connected Outlook, Gmail, Resend, or mail MCP plugin. Waits for Accept.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        cc: { type: "string" },
        workItemKey: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  github_list_files: {
    description: "List files in a linked GitHub repository.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, repoId: { type: "string" }, branch: { type: "string" } },
    },
  },
  github_read_file: {
    description: "Read a file from a linked GitHub repository.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, repoId: { type: "string" }, branch: { type: "string" } },
      required: ["path"],
    },
  },
  github_write_file: {
    description: "Create or update a file on a GitHub branch. Never runs git on the Fairlx host. Waits for Accept.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        message: { type: "string" },
        branch: { type: "string" },
        repoId: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  github_open_pr: {
    description: "Open a GitHub pull request. Pass files[] to commit then open the PR. Waits for Accept. Large batches become a durable job.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        head: { type: "string" },
        base: { type: "string" },
        repoId: { type: "string" },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
      required: ["title"],
    },
  },
  security_review: {
    description: "Scan linked source for vulnerabilities. Isolated. Never exploits production.",
    parameters: {
      type: "object",
      properties: {
        repoId: { type: "string" },
        deep: { type: "boolean", description: "Queue a durable job that scans more files." },
      },
    },
  },
  agent_job_status: {
    description: "Get status and result of a durable agent job.",
    parameters: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
  },
};

export function openaiToolsForMode(mode: AgentRunMode, enabledTools: string[]): OpenAiTool[] {
  if (mode !== "agent") return [];
  const enabled = new Set(enabledTools);
  return AGENT_TOOL_CATALOG.filter((tool) => enabled.has(tool.id)).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.id,
      description: TOOL_PARAMETERS[tool.id]?.description ?? tool.description,
      parameters: TOOL_PARAMETERS[tool.id]?.parameters ?? { type: "object", properties: {} },
    },
  }));
}

function mcpToolDescription(tool: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}): string {
  const required = Array.isArray(tool.inputSchema?.required)
    ? (tool.inputSchema.required as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  const parts = [tool.description?.trim() || tool.name];
  if (required.length) parts.push(`Required arguments: ${required.join(", ")}.`);
  parts.push("Call this tool directly; do not wrap it in mcp_call.");
  return parts.join(" ");
}

export function openaiToolsForTurn(params: {
  mode: AgentRunMode;
  enabledTools: string[];
  mcpTools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}): OpenAiTool[] {
  const mcpTools = params.mcpTools ?? [];
  const mcpNames = new Set(mcpTools.map((tool) => tool.name));
  const harness = openaiToolsForMode(params.mode, params.enabledTools).filter((tool) => {
    const mapped = HARNESS_TO_MCP[tool.function.name];
    if (mapped && mcpNames.has(mapped)) return false;
    if (
      mcpNames.has("fairlx_work_item_list") &&
      (tool.function.name === "database_query" ||
        tool.function.name === "list_work_items" ||
        tool.function.name === "list_workspaces" ||
        tool.function.name === "list_projects")
    ) {
      return false;
    }
    return true;
  });
  if (params.mode !== "agent") return harness;
  const existing = new Set(harness.map((tool) => tool.function.name));
  const mcp = mcpTools
    .filter((tool) => !existing.has(tool.name))
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: mcpToolDescription(tool),
        parameters: tool.inputSchema?.type ? tool.inputSchema : { type: "object", properties: tool.inputSchema ?? {} },
      },
    }));
  return [...harness, ...mcp];
}

export function trainingSaveTool(): OpenAiTool {
  const spec = TOOL_PARAMETERS.save_personal_agent;
  return {
    type: "function",
    function: {
      name: "save_personal_agent",
      description: spec?.description ?? "Save the trained Personal Agent standing prompt.",
      parameters: spec?.parameters ?? { type: "object", properties: {} },
    },
  };
}

function compactEventPayload(payload: unknown): unknown {
  if (payload == null) return payload;
  try {
    if (JSON.stringify(payload).length <= 600) return payload;
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { truncated: true };
  }
  const source = payload as Record<string, unknown>;
  const slim: Record<string, unknown> = {};
  for (const key of ["server", "tool", "error", "query", "name", "kind", "command", "cwd", "status"]) {
    if (source[key] != null) slim[key] = source[key];
  }
  return Object.keys(slim).length ? slim : { truncated: true };
}

function event(
  runId: string,
  type: AgentToolEventType,
  title: string,
  detail?: string,
  payload?: unknown,
): AgentToolEvent {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    detail,
    payload: compactEventPayload(payload),
    createdAt: new Date().toISOString(),
    runId,
  };
}

function parseArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return { raw: args };
    }
  }
  if (args && typeof args === "object") return args as Record<string, unknown>;
  return {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function isDocCreateTool(name: string, parsed: Record<string, unknown>): boolean {
  if (name === "fairlx_doc_create") return true;
  if (name !== "mcp_call") return false;
  const tool = asString(parsed.tool || parsed.name || parsed.method);
  return tool === "fairlx_doc_create";
}

function researchRequiredResult(runId: string, calls: number): ToolExecutionResult {
  const payload = researchRequiredPayload(calls);
  return {
    content: JSON.stringify(payload),
    event: event(runId, "mcp_call", "Research required before saving", payload.instruction, payload),
  };
}

function ensureTurnLimits(ctx: ToolExecutionContext): DocTurnLimits {
  const limits = ctx.turnLimits ?? emptyDocTurnLimits();
  if (typeof limits.webResearchCalls !== "number") limits.webResearchCalls = 0;
  if (typeof limits.docCreates !== "number") limits.docCreates = 0;
  if (typeof limits.webFetches !== "number") limits.webFetches = 0;
  ctx.turnLimits = limits;
  return limits;
}

function tooManyDocsResult(runId: string, createdThisTurn: number): ToolExecutionResult {
  const payload = docPackCompletePayload(createdThisTurn);
  return {
    content: JSON.stringify(payload),
    event: event(runId, "mcp_call", "Documentation pack complete", payload.instruction, payload),
  };
}

export function applyScopeDefaults(args: Record<string, unknown>, ctx: ToolExecutionContext): Record<string, unknown> {
  const next = { ...args };
  const rawWs = asString(next.workspaceId);
  if (!rawWs) {
    if (ctx.workspaceId) next.workspaceId = ctx.workspaceId;
  } else {
    const matchedWs = ctx.context.workspaces.find(
      (w) => w.id === rawWs || w.name.toLowerCase() === rawWs.toLowerCase()
    );
    if (matchedWs) next.workspaceId = matchedWs.id;
  }
  const rawProj = asString(next.projectId);
  if (!rawProj) {
    if (ctx.projectId) next.projectId = ctx.projectId;
  } else {
    const matchedProj = ctx.context.projects.find(
      (p) =>
        p.id === rawProj ||
        p.name.toLowerCase() === rawProj.toLowerCase() ||
        (p.key && p.key.toLowerCase() === rawProj.toLowerCase())
    );
    if (matchedProj) next.projectId = matchedProj.id;
  }
  if (next.arguments && typeof next.arguments === "object") {
    next.arguments = applyScopeDefaults(next.arguments as Record<string, unknown>, ctx);
  }
  return next;
}

function matchesQuery(haystack: string, query: string): boolean {
  if (!query.trim()) return true;
  return haystack.toLowerCase().includes(query.toLowerCase());
}

export async function executeTool(
  name: string,
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const parsed = applyScopeDefaults(parseArgs(args), ctx);
  const limits = ensureTurnLimits(ctx);
  if (isDocCreateTool(name, parsed)) {
    if (!hasRequiredWebResearch(limits)) {
      return researchRequiredResult(ctx.runId, limits.webResearchCalls);
    }
    if (name === "fairlx_doc_create" && limits.docCreates >= MAX_PROJECT_DOCS_PER_TURN) {
      return tooManyDocsResult(ctx.runId, limits.docCreates);
    }
  }
  if (name.startsWith("fairlx_")) {
    const inner = await executeTool(
      "mcp_call",
      { server: "fairlx", tool: name, arguments: parsed },
      ctx,
    );
    return {
      ...inner,
      content: compactJsonString(unwrapMcpToolContent(inner.content), 8000),
    };
  }
  const query = asString(parsed.query || parsed.q || parsed.search);
  const { context, harness, mcp, runId } = ctx;
  const publicMcp = toPublicMcpConfig(ensurePersonalMcp(mcp));
  const mcpCtx = {
    userId: ctx.userId,
    mcp,
    harness,
    runs: ctx.runs,
    databases: ctx.databases,
    auth: ctx.mcpAuth,
  };

  switch (name) {
    case "code_inspect": {
      const kind = asString(parsed.kind) || "all";
      const workItems = context.workItems.filter((item) =>
        matchesQuery(`${item.key ?? ""} ${item.title} ${item.status ?? ""}`, query),
      );
      const repos = context.githubRepos.filter((repo) =>
        matchesQuery(`${repo.repositoryName ?? ""} ${repo.owner ?? ""} ${repo.githubUrl ?? ""}`, query),
      );
      const docs = context.docs.filter((doc) =>
        matchesQuery(`${doc.title ?? ""} ${doc.name ?? ""} ${doc.description ?? ""}`, query),
      );
      const payload = {
        kind,
        query,
        workItems: kind === "repo" || kind === "doc" ? [] : workItems.slice(0, 12),
        repos: kind === "work_item" || kind === "doc" ? [] : repos.slice(0, 12),
        docs: kind === "work_item" || kind === "repo" ? [] : docs.slice(0, 12),
      };
      return {
        content: JSON.stringify(payload),
        event: event(
          runId,
          "code_inspect",
          "Inspected Fairlx code context",
          query || "Current work items, repos, and docs",
          payload,
        ),
      };
    }
    case "terminal": {
      const command = asString(parsed.command || parsed.cmd || parsed.input);
      const cwd = asString(parsed.cwd) || ".";
      const payload = {
        command,
        cwd,
        status: "recorded",
        note: "sandbox: command recorded, not executed on host",
      };
      return {
        content: JSON.stringify(payload),
        event: event(
          runId,
          "terminal",
          command || "Recorded terminal command",
          "sandbox: command recorded, not executed on host",
          payload,
        ),
      };
    }
    case "file_search": {
      const attached = attachedSearchPayload(query, extractAttachedFiles(ctx.sourcePrompt || ""));
      const docs = context.docs.filter((doc) =>
        matchesQuery(`${doc.title ?? ""} ${doc.name ?? ""} ${doc.description ?? ""} ${doc.category ?? ""}`, query),
      );
      const workItems = context.workItems.filter((item) =>
        matchesQuery(`${item.key ?? ""} ${item.title}`, query),
      );
      const payload = { query, docs: docs.slice(0, 20), workItems: workItems.slice(0, 20), ...(attached ?? {}) };
      return {
        content: JSON.stringify(payload),
        event: event(
          runId,
          "file_search",
          query ? `Searched files for "${query}"` : "Searched Fairlx files",
          undefined,
          payload,
        ),
      };
    }
    case "web_search": {
      if (!query.trim()) {
        const payload = { error: "query is required" };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "web_search", "Web search missing query", payload.error, payload),
        };
      }
      const result = await searchPublicWeb(query);
      const limits = ensureTurnLimits(ctx);
      noteWebResearch(limits);
      const payload = {
        query: result.query,
        hits: result.hits,
        extracts: result.extracts,
        hint:
          result.hits.length === 0
            ? "No hits. Try a more specific query, then web_fetch known public URLs (Wikipedia, vendor docs, regulations)."
            : hasRequiredWebResearch(limits)
              ? "Research bar is met. Fetch at most two more pages if needed, then fairlx_doc_create the PRD. Do not fairlx_work_item_get each epic."
              : "web_fetch the most relevant URLs and cite them in Sources. Do not save a document until you have done this for several queries.",
      };
      return {
        content: JSON.stringify(payload),
        event: event(
          runId,
          "web_search",
          `Web search: ${query}`,
          result.hits[0]?.title || `${result.hits.length} hits`,
          { query, hits: result.hits.length, extracts: result.extracts.length },
        ),
      };
    }
    case "web_fetch": {
      const url = asString(parsed.url || parsed.href || query);
      const fetchLimits = ensureTurnLimits(ctx);
      if (!reserveWebFetchSlot(fetchLimits)) {
        const payload = webFetchCapPayload(fetchLimits.webFetches);
        return {
          content: JSON.stringify(payload),
          event: event(runId, "web_fetch", "Fetch cap reached", payload.instruction, payload),
        };
      }
      const fetched = await fetchPublicPage(url);
      if ("error" in fetched) {
        if (fetchLimits.webFetches > 0) fetchLimits.webFetches -= 1;
        return {
          content: JSON.stringify(fetched),
          event: event(runId, "web_fetch", "Web fetch failed", fetched.error, fetched),
        };
      }
      noteWebResearch(ensureTurnLimits(ctx));
      return {
        content: JSON.stringify(fetched),
        event: event(runId, "web_fetch", `Fetched ${fetched.title || url}`, url, { url: fetched.url }),
      };
    }
    case "database_query": {
      const collection = asString(parsed.collection || parsed.table || parsed.target) || "all";
      const payload = {
        collection,
        query,
        workspaces: collection === "all" || collection === "workspaces" ? context.workspaces : [],
        projects: collection === "all" || collection === "projects" ? context.projects : [],
        workItems: collection === "all" || collection === "work_items" ? context.workItems : [],
        docs: collection === "all" || collection === "docs" ? context.docs : [],
      };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "database_query", `Queried ${collection}`, query || undefined, payload),
      };
    }
    case "use_skill": {
      const skillId = asString(parsed.skillId || parsed.id);
      const skillName = asString(parsed.name);
      const skill =
        harness.skills.find((item) => item.id === skillId || item.name.toLowerCase() === skillName.toLowerCase()) ??
        harness.skills.find((item) => item.enabled);
      const payload = skill
        ? {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            instructions: skill.instructions,
            enabled: skill.enabled,
          }
        : { error: "Skill not found", skillId, skillName };
      return {
        content: JSON.stringify(payload),
        event: event(
          runId,
          "use_skill",
          skill ? `Used skill: ${skill.name}` : "Skill not found",
          skill?.description,
          payload,
        ),
      };
    }
    case "list_workspaces": {
      const orgs = new Map((context.organizations ?? []).map((item) => [item.id, item.name]));
      const payload = {
        workspaces: context.workspaces.map(({ inviteCode: _inviteCode, ...rest }) => ({
          ...rest,
          organizationName: rest.organizationId ? orgs.get(rest.organizationId) : undefined,
        })),
        organizations: (context.organizations ?? []).map(({ id: _id, ...rest }) => rest),
      };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "list_workspaces", `${context.workspaces.length} workspaces`, undefined, payload),
      };
    }
    case "list_projects": {
      const workspaceId = asString(parsed.workspaceId);
      const projects = workspaceId
        ? context.projects.filter((project) => project.workspaceId === workspaceId)
        : context.projects;
      const payload = { workspaceId: workspaceId || undefined, projects };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "list_projects", `${projects.length} projects`, undefined, payload),
      };
    }
    case "list_work_items": {
      const workspaceId = asString(parsed.workspaceId);
      const projectId = asString(parsed.projectId);
      const items = context.workItems.filter((item) => {
        if (workspaceId && item.workspaceId !== workspaceId) return false;
        if (projectId && item.projectId !== projectId) return false;
        return matchesQuery(`${item.key ?? ""} ${item.title} ${item.status ?? ""}`, query);
      });
      const payload = { workspaceId: workspaceId || undefined, projectId: projectId || undefined, workItems: items };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "list_work_items", `${items.length} work items`, undefined, payload),
      };
    }
    case "mcp_list": {
      const servers = Object.entries(publicMcp.mcpServers ?? {}).map(([serverName, server]) => ({
        name: serverName,
        transport: server.transport,
        url: server.url,
        command: server.command,
        disabled: Boolean(server.disabled),
        personal: serverName === "fairlx-personal",
      }));
      const payload = { servers };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "mcp_list", `${servers.length} MCP servers`, undefined, payload),
      };
    }
    case "mcp_call": {
      const tool = asString(parsed.tool || parsed.name || parsed.method);
      const server = asString(parsed.server) || "fairlx";
      const callArgs =
        parsed.arguments && typeof parsed.arguments === "object"
          ? (parsed.arguments as Record<string, unknown>)
          : parsed.args && typeof parsed.args === "object"
            ? (parsed.args as Record<string, unknown>)
            : {};
      if (!tool) {
        const payload = { error: "tool is required" };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "mcp_call", "MCP call missing tool", undefined, payload),
        };
      }
      const effectiveArgs = applyScopeDefaults(callArgs, ctx);
      console.log(`[Fairlx Agent] 🛠️ Calling MCP Tool -> Server: "${server}", Tool: "${tool}", Args:`, JSON.stringify(effectiveArgs));
      const limits = ensureTurnLimits(ctx);
      if (tool === "fairlx_doc_create" && !hasRequiredWebResearch(limits)) {
        return researchRequiredResult(runId, limits.webResearchCalls);
      }
      if (tool === "fairlx_doc_create" && !reserveDocCreateSlot(limits)) {
        return tooManyDocsResult(runId, limits.docCreates);
      }
      try {
        const result = await callMcpServerTool({
          server,
          tool,
          args: effectiveArgs,
          ctx: mcpCtx,
        });
        console.log(`[Fairlx Agent] ✅ MCP Tool "${tool}" succeeded:`, JSON.stringify(result));
        return {
          content: compactJsonString(JSON.stringify(result), 8000),
          event: event(runId, "mcp_call", tool.replace(/^fairlx_/, "").replaceAll("_", " "), undefined, { server, tool }),
        };
      } catch (error) {
        if (tool === "fairlx_doc_create") releaseDocCreateSlot(limits);
        const errorMessage = error instanceof Error ? error.message : "MCP call failed";
        console.error(`[Fairlx Agent] ❌ MCP Tool "${tool}" failed:`, errorMessage, { server, args: effectiveArgs });
        const payload = { server, tool, error: errorMessage };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", `${tool.replace(/^fairlx_/, "").replaceAll("_", " ")} failed`, payload.error, payload),
        };
      }
    }
    case "mcp_resources": {
      const server = asString(parsed.server) || "fairlx-personal";
      try {
        const result = await listMcpResourcesForServer(server, mcpCtx);
        return {
          content: JSON.stringify(result),
          event: event(runId, "mcp_resources", `Resources: ${server}`, undefined, result),
        };
      } catch (error) {
        const payload = { error: error instanceof Error ? error.message : "Failed to list MCP resources" };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "MCP resources failed", payload.error, payload),
        };
      }
    }
    case "delegate_agent": {
      const agent = specialistById(asString(parsed.agent) || "planner");
      const task = asString(parsed.task || parsed.prompt || query);
      const subject = asString(parsed.subject) || undefined;
      const payload = { agent, task, subject };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "delegate_agent", `Delegated to ${agent}${subject ? ` · ${subject}` : ""}`, task || undefined, payload),
        delegate: {
          agent: agent === "orchestrator" ? "planner" : agent,
          task: task || "Continue the current request.",
          subject,
        },
      };
    }
    case "search_harness": {
      const files = extractAttachedFiles(ctx.sourcePrompt || "");
      if (files.length) {
        const attached = attachedSearchPayload(query || files[0]!.name, files) ?? {
          source: "attached_files",
          files: files.map((file) => ({ name: file.name, content: file.body })),
        };
        return {
          content: JSON.stringify(attached),
          event: event(
            runId,
            "search_harness",
            query ? `Attached spec: ${query}` : "Attached spec",
            `${files.length} attached files`,
            attached as Record<string, unknown>,
          ),
        };
      }
      const hits = searchAgentIndex({
        query,
        runs: ctx.runs,
        context,
        harness,
        mcp: publicMcp,
        limit: 24,
      });
      const payload = { query, hits };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "search_harness", query ? `Search: ${query}` : "Harness search", `${hits.length} hits`, payload),
      };
    }
    case "create_project": {
      const workspaceId =
        asString(parsed.workspaceId) || harness.settings.defaultWorkspaceId || context.workspaces[0]?.id || "";
      const name = asString(parsed.name || parsed.title);
      if (!ctx.databases) {
        const payload = { error: "Project creation is unavailable in this turn." };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "Create project unavailable", undefined, payload),
        };
      }
      try {
        const created = await createFairlxProject({
          databases: ctx.databases,
          userId: ctx.userId,
          workspaceId,
          name,
          description: asString(parsed.description) || undefined,
        });
        return {
          content: JSON.stringify(created),
          event: event(runId, "create_project", `Created project ${created.name}`, created.workspaceId, created),
        };
      } catch (error) {
        const payload = { error: error instanceof Error ? error.message : "Failed to create project." };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "Create project failed", payload.error, payload),
        };
      }
    }
    case "git_status": {
      const payload = {
        repos: context.githubRepos,
        staging: harness.gitStaging,
        note: "Use github_write_file and github_open_pr for real GitHub commits and PRs. Fairlx never runs git on the host.",
      };
      return {
        content: JSON.stringify(payload),
        event: event(
          runId,
          "git_status",
          `${context.githubRepos.length} repos · ${harness.gitStaging.items.filter((item) => item.status === "staged").length} staged`,
          undefined,
          payload,
        ),
      };
    }
    case "git_stage": {
      const next = stageItem(harness.gitStaging, {
        path: asString(parsed.path || parsed.file),
        summary: asString(parsed.summary || parsed.message),
        repoId: asString(parsed.repoId) || undefined,
        branch: asString(parsed.branch) || undefined,
        content: asString(parsed.content) || undefined,
      });
      const payload = { staging: next };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "git_stage", `Staged ${asString(parsed.path)}`, undefined, payload),
        harnessPatch: { gitStaging: next },
      };
    }
    case "git_unstage": {
      const next = unstageItem(harness.gitStaging, asString(parsed.id || parsed.path));
      const payload = { staging: next };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "git_unstage", "Unstaged change", undefined, payload),
        harnessPatch: { gitStaging: next },
      };
    }
    case "git_commit_plan": {
      const planned = commitStaged(harness.gitStaging, asString(parsed.message || parsed.commit));
      const payload = {
        message: planned.message,
        committed: planned.committed,
        staging: planned.staging,
        note: "Commit recorded in the harness buffer. Not executed on the host.",
      };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "git_commit_plan", planned.message, `${planned.committed.length} files`, payload),
        harnessPatch: { gitStaging: planned.staging },
      };
    }
    case "run_automation": {
      const id = asString(parsed.automationId || parsed.id);
      const nameArg = asString(parsed.name);
      const automation =
        harness.automations.find((item) => item.id === id || item.name.toLowerCase() === nameArg.toLowerCase()) ??
        matchingAutomations(harness, query || nameArg)[0];
      const payload = automation
        ? {
            id: automation.id,
            name: automation.name,
            trigger: automation.trigger,
            action: automation.action,
            enabled: automation.enabled,
          }
        : { error: "Automation not found", id, name: nameArg };
      return {
        content: JSON.stringify(payload),
        event: event(
          runId,
          "run_automation",
          automation ? `Automation: ${automation.name}` : "Automation not found",
          automation?.action,
          payload,
        ),
      };
    }
    case "personal_read": {
      const kind = asString(parsed.kind) || "harness";
      const payload = readPersonalContent({ kind, harness, runs: ctx.runs, query });
      return {
        content: JSON.stringify(payload),
        event: event(runId, "personal_read", `Personal ${kind}`, undefined, payload),
      };
    }
    case "save_personal_agent": {
      if (!ctx.allowPersonalSave) {
        const payload = { error: "save_personal_agent is only available during Personal Agent training." };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "Save personal agent unavailable", undefined, payload),
        };
      }
      if (!ctx.databases) {
        const payload = { error: "Saving the Personal Agent is unavailable in this turn." };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "Save personal agent unavailable", undefined, payload),
        };
      }
      const personaRole = isPersonalPersonaRole(parsed.personaRole) ? parsed.personaRole : "frontend";
      const rawAnswers = Array.isArray(parsed.answers) ? parsed.answers : [];
      const answers = rawAnswers
        .map((item, index) => {
          const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          const question = asString(row.question);
          const answer = asString(row.answer);
          return {
            questionId: asString(row.questionId) || `q${index + 1}`,
            question,
            answer,
          };
        })
        .filter((item) => item.question && item.answer);
      if (answers.length < 4) {
        const payload = { error: "Need at least four detailed question/answer pairs before saving." };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "Interview incomplete", undefined, payload),
        };
      }
      const workspace =
        context.workspaces.find((item) => item.id === ctx.workspaceId) ?? context.workspaces[0];
      const project =
        context.projects.find((item) => item.id === ctx.projectId) ??
        context.projects.find((item) => item.workspaceId === workspace?.id);
      const compiled =
        asString(parsed.compiledPrompt).trim().length >= 400
          ? asString(parsed.compiledPrompt).trim()
          : compilePersonalPrompt({
              userName: context.user.name || context.user.email || "this user",
              personaRole,
              jobTitle: asString(parsed.jobTitle) || undefined,
              workspaceRole: workspace?.role,
              workspaceName: workspace?.name,
              projectName: project?.name,
              answers,
            });
      try {
        const profile = await upsertPersonalAgent(ctx.databases, ctx.userId, {
          personaRole,
          jobTitle: asString(parsed.jobTitle) || undefined,
          workspaceRole: workspace?.role,
          status: "trained",
          answers,
          compiledPrompt: compiled,
        });
        const payload = {
          saved: true,
          version: profile.promptVersion,
          personaRole: profile.personaRole,
        };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "save_personal_agent", "Personal Agent trained", `v${profile.promptVersion}`, payload),
        };
      } catch (error) {
        const payload = { error: error instanceof Error ? error.message : "Failed to save personal agent." };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "Save personal agent failed", payload.error, payload),
        };
      }
    }
    case "request_capability": {
      const capability = (asString(parsed.capability) || "email.send") as AgentCapability;
      const catalog = catalogForCapability(capability);
      const payload = {
        capability,
        reason: asString(parsed.reason),
        catalogIds: catalog.map((item) => item.id),
        missing: missingCapabilities(`${capability} ${asString(parsed.reason)}`, ctx.plugins ?? harness.plugins, context),
      };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "request_capability", `Need ${capability}`, payload.reason, payload),
        missingCapability: capability,
      };
    }
    case "persist_memory": {
      const fact = asString(parsed.fact);
      if (!fact) {
        return {
          content: JSON.stringify({ error: "fact is required" }),
          event: event(runId, "error", "Memory missing fact"),
        };
      }
      const existing = harness.knowledge.find((item) => item.title === "Agent STATE");
      const nextItem = existing
        ? { ...existing, content: `${existing.content}\n- ${fact}`.slice(-4000), createdAt: new Date().toISOString() }
        : {
            id: crypto.randomUUID(),
            title: "Agent STATE",
            content: `- ${fact}`,
            source: "brain",
            createdAt: new Date().toISOString(),
          };
      const knowledge = existing
        ? harness.knowledge.map((item) => (item.id === existing.id ? nextItem : item))
        : [...harness.knowledge, nextItem];
      return {
        content: JSON.stringify({ stored: true, fact }),
        event: event(runId, "persist_memory", "Stored a fact", fact.slice(0, 120)),
        harnessPatch: { knowledge },
      };
    }
    case "mail_send": {
      const workItemKey = asString(parsed.workItemKey) || undefined;
      const result = await sendMailViaPlugin({
        plugins: ctx.plugins ?? harness.plugins,
        mcp,
        input: {
          to: asString(parsed.to),
          subject: asString(parsed.subject),
          body: asString(parsed.body),
          cc: asString(parsed.cc) || undefined,
          workItemKey,
        },
      });
      const failed = typeof result.error === "string";
      let comment: { commented: boolean; workItemId?: string } | undefined;
      if (!failed && workItemKey) {
        comment = await commentMailedWorkItem({
          databases: ctx.databases,
          context,
          mcp,
          harness,
          userId: ctx.userId,
          mcpAuth: ctx.mcpAuth,
          runs: ctx.runs,
          workItemKey,
          to: asString(parsed.to),
          subject: asString(parsed.subject),
        });
      }
      const updatedPlugin = result.updatedPlugin as AgentPluginConnection | undefined;
      const payload = comment ? { ...result, comment } : result;
      const publicPayload = { ...payload };
      delete publicPayload.updatedPlugin;
      return {
        content: JSON.stringify(publicPayload),
        event: event(
          runId,
          failed ? "error" : "mail_send",
          failed ? "Mail failed" : `Mailed ${asString(parsed.to)}`,
          asString(parsed.subject),
          publicPayload,
        ),
        missingCapability: failed && result.capability === "email.send" ? "email.send" : undefined,
        harnessPatch: updatedPlugin
          ? { plugins: harness.plugins.map((item) => (item.id === updatedPlugin.id ? updatedPlugin : item)) }
          : undefined,
      };
    }
    case "github_list_files": {
      const result = await githubListFiles({
        databases: ctx.databases,
        context,
        plugins: ctx.plugins ?? harness.plugins,
        path: asString(parsed.path) || undefined,
        repoId: asString(parsed.repoId) || undefined,
        projectId: ctx.projectId,
      });
      return {
        content: JSON.stringify(result),
        event: event(runId, "github_list_files", "Listed repo files", undefined, result),
        missingCapability: githubCapabilityGap(result),
      };
    }
    case "github_read_file": {
      const path = asString(parsed.path);
      const result = await githubReadFile({
        databases: ctx.databases,
        context,
        plugins: ctx.plugins ?? harness.plugins,
        path,
        repoId: asString(parsed.repoId) || undefined,
        projectId: ctx.projectId,
        branch: asString(parsed.branch) || undefined,
      });
      return {
        content: JSON.stringify(result),
        event: event(runId, "github_read_file", path || "Read file", undefined, { path }),
        missingCapability: githubCapabilityGap(result),
      };
    }
    case "github_write_file": {
      try {
        const result = await githubWriteFile({
          databases: ctx.databases,
          context,
          plugins: ctx.plugins ?? harness.plugins,
          path: asString(parsed.path),
          content: asString(parsed.content),
          message: asString(parsed.message) || `Update ${asString(parsed.path)}`,
          branch: asString(parsed.branch) || undefined,
          repoId: asString(parsed.repoId) || undefined,
          projectId: ctx.projectId,
        });
        const failed = "error" in result;
        return {
          content: JSON.stringify(result),
          event: event(
            runId,
            failed ? "error" : "github_write_file",
            failed ? "GitHub write failed" : `Wrote ${asString(parsed.path)}`,
            asString(parsed.path) || undefined,
            { ...result, path: asString(parsed.path) },
          ),
          missingCapability: githubCapabilityGap(result),
        };
      } catch (error) {
        const payload = { error: error instanceof Error ? error.message : "GitHub write failed" };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "GitHub write failed", payload.error, payload),
          missingCapability: githubCapabilityGap(payload),
        };
      }
    }
    case "github_open_pr": {
      try {
        const plugins = ctx.plugins ?? harness.plugins;
        const files = parsePrFiles(parsed.files);
        const title = asString(parsed.title);
        const body = asString(parsed.body) || undefined;
        const repoId = asString(parsed.repoId) || undefined;
        if (files.length >= 3 && ctx.databases) {
          const job = await createAgentJob(ctx.databases, {
            userId: ctx.userId,
            runId,
            kind: "github_pr",
            payload: {
              repoId,
              projectId: ctx.projectId,
              title,
              body,
              branch: asString(parsed.head || parsed.branch) || undefined,
              base: asString(parsed.base) || undefined,
              files,
            },
          });
          if (job) {
            scheduleAgentJob({
              databases: ctx.databases,
              userId: ctx.userId,
              jobId: job.id,
              context,
              plugins,
              mcp,
              mcpAuth: ctx.mcpAuth,
              harness,
              projectId: ctx.projectId,
              workspaceId: ctx.workspaceId,
            });
            return {
              content: JSON.stringify({ jobId: job.id, status: job.status, files: files.length }),
              event: event(runId, "github_open_pr", "Queued pull request job", job.id, { jobId: job.id }),
            };
          }
        }
        const result = files.length
          ? await githubCommitFilesAndOpenPr({
              databases: ctx.databases,
              context,
              plugins,
              title,
              body,
              files,
              branch: asString(parsed.head || parsed.branch) || undefined,
              base: asString(parsed.base) || undefined,
              repoId,
              projectId: ctx.projectId,
            })
          : await githubOpenPullRequest({
              databases: ctx.databases,
              context,
              plugins,
              title,
              body,
              head: asString(parsed.head || parsed.branch),
              base: asString(parsed.base) || undefined,
              repoId,
              projectId: ctx.projectId,
            });
        return {
          content: JSON.stringify(result),
          event: event(runId, "github_open_pr", title || "Opened pull request", undefined, result),
          missingCapability: githubCapabilityGap(result),
        };
      } catch (error) {
        const payload = { error: error instanceof Error ? error.message : "Failed to open pull request" };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "Open PR failed", payload.error, payload),
          missingCapability: githubCapabilityGap(payload),
        };
      }
    }
    case "security_review": {
      const plugins = ctx.plugins ?? harness.plugins;
      if (parsed.deep === true && ctx.databases) {
        const job = await createAgentJob(ctx.databases, {
          userId: ctx.userId,
          runId,
          kind: "security_review",
          payload: { repoId: asString(parsed.repoId), projectId: ctx.projectId },
        });
        if (job) {
          scheduleAgentJob({
            databases: ctx.databases,
            userId: ctx.userId,
            jobId: job.id,
            context,
            plugins,
            mcp,
            mcpAuth: ctx.mcpAuth,
            harness,
            projectId: ctx.projectId,
            workspaceId: ctx.workspaceId,
          });
          return {
            content: JSON.stringify({ jobId: job.id, status: job.status, deep: true }),
            event: event(runId, "security_review", "Queued security review", job.id, { jobId: job.id }),
          };
        }
      }
      const resolved = await resolveGithubRepo({
        databases: ctx.databases,
        context,
        plugins,
        repoId: asString(parsed.repoId) || undefined,
        projectId: ctx.projectId,
      });
      if ("error" in resolved) {
        return {
          content: JSON.stringify(resolved),
          event: event(runId, "error", "Security review blocked", resolved.error, resolved),
          missingCapability: githubCapabilityGap(resolved) ?? "security.review",
        };
      }
      try {
        const files = await resolved.api.getAllFiles(resolved.owner, resolved.repo, resolved.branch, "", 20);
        const findings = verifyFindings(scanSourceFiles(files));
        const published = await publishSecurityFindings({
          databases: ctx.databases,
          mcp,
          harness,
          userId: ctx.userId,
          mcpAuth: ctx.mcpAuth,
          runs: ctx.runs,
          projectId: ctx.projectId,
          workspaceId: ctx.workspaceId,
          repoLabel: `${resolved.owner}/${resolved.repo}`,
          findings,
        });
        const payload = {
          owner: resolved.owner,
          repo: resolved.repo,
          filesScanned: files.length,
          findings,
          bugs: published.bugs,
          notified: published.notified,
        };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "security_review", `${findings.length} verified findings`, undefined, payload),
        };
      } catch (error) {
        const payload = { error: error instanceof Error ? error.message : "Security review failed" };
        return {
          content: JSON.stringify(payload),
          event: event(runId, "error", "Security review failed", payload.error, payload),
        };
      }
    }
    case "agent_job_status": {
      if (!ctx.databases) {
        return {
          content: JSON.stringify({ error: "Jobs are unavailable in this turn." }),
          event: event(runId, "error", "Job status unavailable"),
        };
      }
      const job = await getAgentJob(ctx.databases, ctx.userId, asString(parsed.jobId));
      const payload = job ?? { error: "Job not found" };
      return {
        content: JSON.stringify(payload),
        event: event(runId, "agent_job_status", job ? `${job.kind} ${job.status}` : "Job not found", undefined, payload),
      };
    }
    default: {
      const payload = { name, args: parsed };
      return {
        content: JSON.stringify({ error: `Unknown tool: ${name}` }),
        event: event(runId, "error", `Unknown tool: ${name}`, undefined, payload),
      };
    }
  }
}
