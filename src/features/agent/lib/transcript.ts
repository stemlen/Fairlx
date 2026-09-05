import { AGENT_TOOL_CATALOG } from "../constants";
import type { AgentChatMessage, AgentToolCall, AgentToolEvent } from "../types";
import { isTrainingKickoffContent } from "./session-context";
import { unwrapMcpToolContent } from "./truncate";
import type { AgentWorkItem } from "./work-item-table";
import { memberLookupKey, type AgentMember } from "./member-table";
import { looksLikeLlmUsageEvent } from "./run-usage";

export type TranscriptStep = {
  call: AgentToolCall;
  result?: AgentChatMessage;
  event?: AgentToolEvent;
};

export type TranscriptBlock =
  | { kind: "user"; message: AgentChatMessage }
  | { kind: "assistant"; message: AgentChatMessage }
  | { kind: "steps"; lead?: AgentChatMessage; steps: TranscriptStep[] };

function toolAsCall(message: AgentChatMessage): AgentToolCall {
  return {
    id: message.toolCallId || message.id,
    name: message.toolName || "tool",
    arguments: "",
  };
}

export function groupTranscript(
  messages: AgentChatMessage[],
  events: AgentToolEvent[] = [],
): TranscriptBlock[] {
  return groupTranscriptWithLeftovers(messages, events).blocks;
}

export function groupTranscriptWithLeftovers(
  messages: AgentChatMessage[],
  events: AgentToolEvent[] = [],
): { blocks: TranscriptBlock[]; leftoverEvents: AgentToolEvent[] } {
  const leftoverEvents = [...events];
  const takeEvent = (name: string) => {
    const pretty = name.replace(/^fairlx_/, "").replaceAll("_", " ");
    const index = leftoverEvents.findIndex((event) => {
      if (isTranscriptMetaEvent(event)) return false;
      if (event.type === name || event.title.includes(name)) return true;
      if (pretty && event.title.toLowerCase().includes(pretty.toLowerCase())) return true;
      const payload = event.payload as { tool?: unknown } | undefined;
      return Boolean(payload && typeof payload === "object" && payload.tool === name);
    });
    if (index === -1) return undefined;
    return leftoverEvents.splice(index, 1)[0];
  };

  const consumeTools = (start: number, pending: AgentToolCall[]) => {
    const remaining = [...pending];
    const steps: TranscriptStep[] = [];
    let i = start;
    while (i + 1 < messages.length && messages[i + 1]?.role === "tool") {
      i += 1;
      const result = messages[i]!;
      const matchIdx = remaining.findIndex(
        (call) => call.id === result.toolCallId || call.name === result.toolName,
      );
      const call = matchIdx >= 0 ? remaining.splice(matchIdx, 1)[0]! : toolAsCall(result);
      steps.push({ call, result, event: takeEvent(call.name) });
    }
    for (const call of remaining) {
      steps.push({ call, event: takeEvent(call.name) });
    }
    return { steps, index: i };
  };

  const blocks: TranscriptBlock[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]!;
    if (message.role === "user") {
      if (isTrainingKickoffContent(message.content)) continue;
      blocks.push({ kind: "user", message });
      continue;
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      const consumed = consumeTools(i, message.toolCalls);
      blocks.push({ kind: "steps", lead: message, steps: consumed.steps });
      i = consumed.index;
      continue;
    }
    if (message.role === "tool") {
      const steps: TranscriptStep[] = [{ call: toolAsCall(message), result: message, event: takeEvent(message.toolName || "") }];
      while (i + 1 < messages.length && messages[i + 1]?.role === "tool") {
        i += 1;
        const result = messages[i]!;
        steps.push({ call: toolAsCall(result), result, event: takeEvent(result.toolName || "") });
      }
      blocks.push({ kind: "steps", steps });
      continue;
    }
    if (message.role === "assistant") {
      blocks.push({ kind: "assistant", message });
    }
  }
  return { blocks, leftoverEvents };
}

const THINKING_EVENT_TYPES = new Set<AgentToolEvent["type"]>(["thought"]);

const HIDDEN_ACTIVITY_TYPES = new Set<AgentToolEvent["type"]>([
  "thought",
  "context_meter",
  "confirmation",
  "confirmation_resolved",
  "llm_usage",
]);

const TRANSCRIPT_META_TYPES = new Set<AgentToolEvent["type"]>([
  "thought",
  "context_meter",
  "confirmation",
  "confirmation_resolved",
  "llm_usage",
  "subagent_started",
  "subagent_progress",
  "subagent_done",
]);

export function isTranscriptMetaEvent(event: AgentToolEvent): boolean {
  return TRANSCRIPT_META_TYPES.has(event.type) || looksLikeLlmUsageEvent(event);
}

export function isHiddenActivityEvent(event: AgentToolEvent): boolean {
  return HIDDEN_ACTIVITY_TYPES.has(event.type) || looksLikeLlmUsageEvent(event);
}

export type ConversationTurn = {
  user?: AgentChatMessage;
  thoughts: AgentToolEvent[];
  activity: AgentToolEvent[];
  usage: AgentToolEvent[];
  blocks: TranscriptBlock[];
  startedAt: string;
  endedAt?: string;
};

function turnFromSlice(
  user: AgentChatMessage | undefined,
  rest: AgentChatMessage[],
  events: AgentToolEvent[],
): ConversationTurn {
  const { blocks, leftoverEvents } = groupTranscriptWithLeftovers(user ? [user, ...rest] : rest, events);
  const last = rest[rest.length - 1];
  const lastEvent = leftoverEvents[leftoverEvents.length - 1];
  return {
    user,
    thoughts: leftoverEvents.filter((event) => THINKING_EVENT_TYPES.has(event.type)),
    activity: leftoverEvents.filter((event) => !isHiddenActivityEvent(event)),
    usage: leftoverEvents.filter((event) => looksLikeLlmUsageEvent(event) || event.type === "context_meter"),
    blocks: blocks.filter((block) => block.kind !== "user"),
    startedAt: user?.createdAt || events[0]?.createdAt || leftoverEvents[0]?.createdAt || new Date().toISOString(),
    endedAt: last?.createdAt || lastEvent?.createdAt,
  };
}

export function groupConversationTurns(
  messages: AgentChatMessage[],
  events: AgentToolEvent[] = [],
): ConversationTurn[] {
  const visible = messages.filter(
    (message) => !(message.role === "user" && isTrainingKickoffContent(message.content)),
  );
  const userIndexes: number[] = [];
  visible.forEach((message, index) => {
    if (message.role === "user") userIndexes.push(index);
  });

  if (!userIndexes.length) {
    if (!visible.length && !events.length) return [];
    return [turnFromSlice(undefined, visible, events)];
  }

  return userIndexes.map((start, index) => {
    const end = index + 1 < userIndexes.length ? userIndexes[index + 1]! : visible.length;
    const user = visible[start]!;
    const rest = visible.slice(start + 1, end);
    const nextUser = index + 1 < userIndexes.length ? visible[userIndexes[index + 1]!] : undefined;
    const startMs = new Date(user.createdAt).getTime();
    const endMs = nextUser ? new Date(nextUser.createdAt).getTime() : Number.POSITIVE_INFINITY;
    const turnEvents = events.filter((event) => {
      const time = new Date(event.createdAt).getTime();
      return time >= startMs && time < endMs;
    });
    return turnFromSlice(user, rest, turnEvents);
  });
}

export function formatThinkingDuration(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const minutes = Math.floor(sec / 60);
  const remain = sec % 60;
  return remain ? `${minutes}m ${remain}s` : `${minutes}m`;
}

export function thinkingDurationMs(
  thoughts: AgentToolEvent[],
  startedAt?: string,
  endedAt?: string,
  live = false,
): number {
  const startSource = thoughts[0]?.createdAt || startedAt;
  if (!startSource) return 0;
  const start = new Date(startSource).getTime();
  if (Number.isNaN(start)) return 0;
  const endSource = live ? undefined : thoughts[thoughts.length - 1]?.createdAt || endedAt;
  const end = endSource ? new Date(endSource).getTime() : Date.now();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - start);
}

const GENERIC_THOUGHT = /^(Working|Thinking|Planning next steps)$/i;
const PASS_DETAIL = /^Pass \d+$/i;

/** Cursor-style thought body: keep reasoning, drop repeated "Pass N" noise. */
export function visibleThoughtLines(thoughts: AgentToolEvent[]): AgentToolEvent[] {
  const reasoning = thoughts.filter((event) => {
    const detail = event.detail?.trim();
    return Boolean(detail && detail !== event.title && !PASS_DETAIL.test(detail));
  });
  if (reasoning.length) return reasoning;
  const seen = new Set<string>();
  const unique: AgentToolEvent[] = [];
  for (const event of thoughts) {
    if (GENERIC_THOUGHT.test(event.title.trim()) && !event.detail?.trim()) continue;
    const key = event.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique;
}

function asRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(unwrapMcpToolContent(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function toolLabel(name: string) {
  const catalog = AGENT_TOOL_CATALOG.find((tool) => tool.id === name);
  if (catalog) return catalog.name;
  const mcp = name.startsWith("fairlx_") ? name.slice("fairlx_".length) : name;
  return mcp.replaceAll("_", " ");
}

export function summarizeToolResult(name: string, content?: string): { ok: boolean; detail: string } {
  if (!content?.trim()) return { ok: true, detail: "Done" };
  const parsed = asRecord(content);
  if (!parsed) {
    const text = content.trim();
    return { ok: !/error|failed/i.test(text), detail: text.slice(0, 140) };
  }
  const error = typeof parsed.error === "string" ? parsed.error : "";
  if (error) return { ok: false, detail: error };

  if (name === "git_status") {
    const repos = Array.isArray(parsed.repos) ? parsed.repos.length : 0;
    const staged = Array.isArray((parsed.staging as { items?: unknown[] } | undefined)?.items)
      ? ((parsed.staging as { items: unknown[] }).items.filter((item) => (item as { status?: string }).status === "staged")
          .length)
      : 0;
    return { ok: true, detail: `${repos} repos · ${staged} staged` };
  }
  if (name === "mcp_call") {
    const tool = String(parsed.tool || "tool").replace(/^fairlx_/, "").replaceAll("_", " ");
    const result = parsed.result;
    const nestedError =
      result && typeof result === "object" && "error" in result
        ? String((result as { error?: unknown }).error || "")
        : "";
    if (nestedError) return { ok: false, detail: nestedError };
    const denied = typeof parsed.error === "string" && /denied/i.test(parsed.error);
    if (denied) return { ok: false, detail: "Denied" };
    return { ok: true, detail: tool };
  }
  if (
    name === "list_work_items" ||
    name === "list_projects" ||
    name === "list_workspaces" ||
    name === "fairlx_work_item_list" ||
    name === "fairlx_project_list" ||
    name === "fairlx_workspace_list"
  ) {
    if (parsed.repeated === true) {
      return { ok: true, detail: "Reused previous result" };
    }
    const key =
      name === "list_workspaces" || name === "fairlx_workspace_list"
        ? "workspaces"
        : name === "list_projects" || name === "fairlx_project_list"
          ? "projects"
          : "workItems";
    const count = Array.isArray(parsed[key])
      ? (parsed[key] as unknown[]).length
      : Array.isArray(parsed.items)
        ? (parsed.items as unknown[]).length
        : 0;
    if (key === "workItems") {
      const total = typeof parsed.total === "number" ? parsed.total : count;
      const unassignedCount =
        typeof parsed.unassignedCount === "number"
          ? parsed.unassignedCount
          : Array.isArray(parsed.workItems)
            ? (parsed.workItems as Array<{ unassigned?: boolean }>).filter((item) => item.unassigned).length
            : 0;
      const matched = typeof parsed.matched === "number" ? parsed.matched : count;
      return {
        ok: true,
        detail: `Listed ${total} items · ${unassignedCount} unassigned${matched !== count ? ` · showing ${count}` : ""}`,
      };
    }
    return { ok: true, detail: `${count} ${key}` };
  }
  if (name === "search_harness" || name === "web_search" || name === "web_fetch" || name === "file_search") {
    const hits = Array.isArray(parsed.hits) ? parsed.hits.length : Array.isArray(parsed.related) ? parsed.related.length : 0;
    const query = String(parsed.query || "");
    return { ok: true, detail: query ? `${query}${hits ? ` · ${hits} hits` : ""}` : `${hits} hits` };
  }
  if (name === "create_project" || name === "fairlx_project_create") {
    const project = parsed.project && typeof parsed.project === "object" ? (parsed.project as Record<string, unknown>) : parsed;
    return { ok: true, detail: String(project.name || parsed.name || "Project created") };
  }
  if (name === "fairlx_sprint_create" || name === "fairlx_sprint_start") {
    const sprint = parsed.sprint && typeof parsed.sprint === "object" ? (parsed.sprint as Record<string, unknown>) : parsed;
    const sprintName = String(sprint.name || "Sprint");
    const started = parsed.started === true || sprint.status === "ACTIVE" || name === "fairlx_sprint_start";
    return { ok: true, detail: started ? `Started ${sprintName}` : `Created ${sprintName}` };
  }
  if (name === "database_query") {
    const collection = String(parsed.collection || parsed.table || parsed.from || "records");
    const rows = Array.isArray(parsed.documents)
      ? parsed.documents.length
      : Array.isArray(parsed.rows)
        ? parsed.rows.length
        : Array.isArray(parsed.items)
          ? parsed.items.length
          : typeof parsed.total === "number"
            ? parsed.total
            : null;
    return { ok: true, detail: rows === null ? collection : `${collection} · ${rows} rows` };
  }
  if (parsed.ok === false) {
    return { ok: false, detail: String(parsed.message || parsed.error || "Failed") };
  }
  if (parsed.workItem && typeof parsed.workItem === "object") {
    const item = parsed.workItem as Record<string, unknown>;
    const title = String(item.title || item.name || "").trim();
    const key = String(item.key || "").trim();
    const action = name.includes("update") ? "Updated" : "Created";
    const label = key && title ? `${key}: ${title}` : title || key || "Work item";
    return { ok: true, detail: `${action} ${label}` };
  }
  const countKeys = ["workspaces", "projects", "workItems", "docs", "servers", "skills", "items", "members"];
  for (const key of countKeys) {
    if (Array.isArray(parsed[key])) return { ok: true, detail: `${(parsed[key] as unknown[]).length} ${key}` };
  }
  return { ok: true, detail: toolLabel(name) };
}

export function isRepeatedToolResult(content?: string): boolean {
  const parsed = asRecord(content ?? "");
  return parsed?.repeated === true;
}

export type WorkItemListRow = AgentWorkItem;

export function workItemListRows(content?: string): WorkItemListRow[] {
  const parsed = asRecord(content ?? "");
  if (!parsed || !Array.isArray(parsed.workItems)) return [];
  return parsed.workItems.filter((item): item is WorkItemListRow => Boolean(item) && typeof item === "object");
}

export function collectWorkItemLookup(messages: AgentChatMessage[]): Map<string, AgentWorkItem> {
  const map = new Map<string, AgentWorkItem>();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const row of workItemListRows(message.content)) {
      const key = String(row.key ?? "").trim().toUpperCase();
      if (key) map.set(key, row);
    }
  }
  return map;
}

export function workspaceMemberRows(content?: string): AgentMember[] {
  const parsed = asRecord(content ?? "");
  if (!parsed) return [];
  if (Array.isArray(parsed.members)) {
    return parsed.members.filter((item): item is AgentMember => Boolean(item) && typeof item === "object");
  }
  if (parsed.member && typeof parsed.member === "object") {
    return [parsed.member as AgentMember];
  }
  return [];
}

export function collectMemberLookup(messages: AgentChatMessage[]): Map<string, AgentMember> {
  const map = new Map<string, AgentMember>();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const row of workspaceMemberRows(message.content)) {
      const emailKey = memberLookupKey(row);
      if (emailKey) map.set(emailKey, row);
      const name = String(row.name ?? "").trim().toLowerCase();
      if (name) map.set(`name:${name}`, row);
    }
  }
  return map;
}

export function activitySummary(events: AgentToolEvent[]) {
  const thoughts = events.filter((event) => event.type === "thought");
  const searches = events.filter((event) =>
    event.type === "file_search" || event.type === "web_search" || event.type === "web_fetch" || event.type === "search_harness" || event.type === "code_inspect",
  );
  const edits = events.filter((event) =>
    event.type === "git_stage" || event.type === "git_unstage" || event.type === "git_commit_plan" || event.type === "create_project",
  );
  const terminals = events.filter((event) => event.type === "terminal");
  let thoughtMs = 0;
  if (thoughts.length >= 2) {
    thoughtMs = new Date(thoughts[thoughts.length - 1]!.createdAt).getTime() - new Date(thoughts[0]!.createdAt).getTime();
  } else if (thoughts.length === 1 && events.length > 1) {
    const next = events.find((event) => event.id !== thoughts[0]!.id);
    if (next) thoughtMs = new Date(next.createdAt).getTime() - new Date(thoughts[0]!.createdAt).getTime();
  }
  const thoughtSec = Math.max(1, Math.round(thoughtMs / 1000));
  const parts: string[] = [];
  if (thoughts.length) parts.push(`Thought for ${thoughtSec}s`);
  if (searches.length) parts.push(`Explored ${searches.length} ${searches.length === 1 ? "search" : "searches"}`);
  if (edits.length) parts.push(`${edits.length} ${edits.length === 1 ? "change" : "changes"}`);
  if (terminals.length) parts.push(`${terminals.length} terminal ${terminals.length === 1 ? "command" : "commands"}`);
  return { parts, thoughtSec, searches: searches.length, edits: edits.length, terminals: terminals.length };
}
