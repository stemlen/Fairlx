import type { AgentChatMessage, AgentToolCall } from "../types";
import { compactJsonString, truncateString, unwrapMcpToolContent } from "./truncate";

const PREVIOUS_RESULT_MAX = 1500;
const LIST_PREVIOUS_MAX = 8000;
export const MAX_CONSECUTIVE_TOOL_FAILURES = 3;
/** Duplicate reads must not abort the run; the model still needs tools for the follow-up write. */
export const MAX_DUPLICATE_SKIPS = Number.POSITIVE_INFINITY;

export function shouldForceAnswer(failStreak: number): boolean {
  return failStreak >= MAX_CONSECUTIVE_TOOL_FAILURES;
}
export const WORK_ITEM_LIST_TOOL = "fairlx_work_item_list";
export const SPRINT_LIST_TOOL = "fairlx_sprint_list";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function stableToolArgs(raw: string): string {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object") return JSON.stringify(sortKeys(parsed));
  } catch {
    // keep raw
  }
  return raw || "{}";
}

export function toolCallFingerprint(name: string, args: string): string {
  return `${name}:${stableToolArgs(args)}`;
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // keep empty
  }
  return {};
}

export function unwrapListCall(call: AgentToolCall): {
  tool: string;
  args: Record<string, unknown>;
} {
  const outer = parseObject(call.arguments);
  if (call.name === "mcp_call") {
    const inner =
      outer.arguments && typeof outer.arguments === "object" && !Array.isArray(outer.arguments)
        ? (outer.arguments as Record<string, unknown>)
        : {};
    return { tool: String(outer.tool || outer.name || ""), args: inner };
  }
  return { tool: call.name, args: outer };
}

export type ListSliceState = {
  hasMore: boolean;
  nextCursor: string | null;
  content: string;
};

export function listSliceKey(tool: string, args: Record<string, unknown>): string | null {
  if (tool === SPRINT_LIST_TOOL) {
    return JSON.stringify({
      tool,
      projectId: String(args.projectId ?? ""),
    });
  }
  if (tool !== WORK_ITEM_LIST_TOOL) return null;
  return JSON.stringify({
    tool,
    projectId: String(args.projectId ?? ""),
    sprintId: String(args.sprintId ?? ""),
    backlog: args.backlog === true || args.backlog === "true",
  });
}

export function canonicalizeToolCall(call: AgentToolCall): AgentToolCall {
  const { tool, args } = unwrapListCall(call);
  if (tool !== SPRINT_LIST_TOOL) return call;
  const next: Record<string, unknown> = { ...args };
  delete next.status;
  if (!asCursor(next.cursorAfter)) delete next.cursorAfter;
  if (typeof next.limit !== "number" || next.limit < 100) next.limit = 100;
  return withListArgs(call, next);
}

function asCursor(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseListPageMeta(content: string): { hasMore: boolean; nextCursor: string | null } {
  try {
    const parsed = JSON.parse(unwrapMcpToolContent(content)) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { hasMore: false, nextCursor: null };
    const nextCursor = asCursor(parsed.nextCursor) || null;
    return { hasMore: parsed.hasMore === true, nextCursor };
  } catch {
    return { hasMore: false, nextCursor: null };
  }
}

export function rememberListSlice(
  cache: Map<string, ListSliceState>,
  tool: string,
  args: Record<string, unknown>,
  content: string,
): void {
  const key = listSliceKey(tool, args);
  if (!key) return;
  const meta = parseListPageMeta(content);
  cache.set(key, { ...meta, content });
}

export function hydrateListSliceCache(messages: AgentChatMessage[]): Map<string, ListSliceState> {
  const cache = new Map<string, ListSliceState>();
  const pending = new Map<string, { tool: string; args: Record<string, unknown> }>();
  for (const message of messages) {
    if (message.role === "assistant" && message.toolCalls?.length) {
      for (const call of message.toolCalls) {
        pending.set(call.id, unwrapListCall(call));
      }
    }
    if (message.role === "tool" && message.toolCallId) {
      const origin = pending.get(message.toolCallId);
      pending.delete(message.toolCallId);
      if (origin) rememberListSlice(cache, origin.tool, origin.args, message.content);
    }
  }
  return cache;
}

type ListedItem = {
  key?: unknown;
  unassigned?: unknown;
  location?: unknown;
  sprintId?: unknown;
  assignees?: Array<string | { name?: string; email?: string }>;
};

function listedAssigneeLabels(item: ListedItem): string[] {
  const raw = item.assignees;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry.trim()];
    if (entry && typeof entry === "object") {
      return [entry.name, entry.email].filter((value): value is string => Boolean(value?.trim()));
    }
    return [];
  });
}

function summarizeCachedAssignment(items: ListedItem[]) {
  const unassignedKeys: string[] = [];
  const byAssignee: Record<string, string[]> = {};
  for (const item of items) {
    const key = typeof item.key === "string" ? item.key.trim() : "";
    if (!key) continue;
    const names = listedAssigneeLabels(item).filter((value) => !value.includes("@"));
    if (item.unassigned === true || names.length === 0) {
      unassignedKeys.push(key);
      continue;
    }
    for (const name of names) {
      (byAssignee[name] ??= []).push(key);
    }
  }
  return {
    total: items.filter((item) => typeof item.key === "string" && item.key.trim()).length,
    unassignedCount: unassignedKeys.length,
    unassignedKeys,
    byAssignee,
  };
}

function parseListedPayload(previous: string): Record<string, unknown> {
  const compact = compactPrevious(previous, LIST_PREVIOUS_MAX);
  if (!compact || typeof compact !== "object" || Array.isArray(compact)) return { workItems: [] };
  const record = compact as Record<string, unknown>;
  if (record.previous && typeof record.previous === "object" && !Array.isArray(record.previous)) {
    return record.previous as Record<string, unknown>;
  }
  return record;
}

export function projectCachedWorkItemList(previous: string, args?: Record<string, unknown>): unknown {
  const payload = parseListedPayload(previous);
  const items = Array.isArray(payload.workItems) ? (payload.workItems as ListedItem[]) : [];
  const assignment =
    payload.assignment && typeof payload.assignment === "object"
      ? payload.assignment
      : summarizeCachedAssignment(items);
  let next = items;
  const unassigned = args?.unassigned === true || args?.unassigned === "true";
  const backlog = args?.backlog === true || args?.backlog === "true";
  const assigneeId = typeof args?.assigneeId === "string" ? args.assigneeId.trim() : "";
  if (unassigned) next = items.filter((item) => item.unassigned === true);
  if (backlog) {
    next = next.filter(
      (item) => item.location === "backlog" || item.sprintId == null || item.sprintId === "",
    );
  }
  if (assigneeId) {
    const query = assigneeId.toLowerCase();
    next = next.filter((item) =>
      listedAssigneeLabels(item).some((value) => value.toLowerCase() === query || value.toLowerCase().includes(query)),
    );
  }
  return {
    filtered: unassigned || backlog || Boolean(assigneeId),
    assignment,
    returned: next.length,
    unassignedCount: (assignment as { unassignedCount?: number }).unassignedCount,
    workItems: next,
  };
}

function sprintListSkipMessage(kind: "loaded" | "no_more" | "bad_cursor", previous?: string): string {
  const previousPayload = previous ? compactPrevious(previous, LIST_PREVIOUS_MAX) : undefined;
  if (kind === "loaded") {
    return JSON.stringify({
      repeated: true,
      message:
        "Sprints for this project are already loaded. Do not list sprints again (omit status; do not fan out ACTIVE/PLANNED/ALL). To unassign sprint items, call fairlx_work_item_bulk_update with clearAssignees: true. To assign a whole sprint, pass sprintId as the sprint name and assigneeIds.",
      previous: previousPayload,
    });
  }
  if (kind === "no_more") {
    return JSON.stringify({
      repeated: true,
      hasMore: false,
      nextCursor: null,
      message: "No further sprint pages. Do not list sprints again.",
      previous: previousPayload,
    });
  }
  return JSON.stringify({
    repeated: true,
    message: "Invalid cursorAfter. Stop listing sprints and continue the task.",
    previous: previousPayload,
  });
}

export function listSliceSkipMessage(
  kind: "loaded" | "no_more" | "bad_cursor",
  previous?: string,
  args?: Record<string, unknown>,
  tool = WORK_ITEM_LIST_TOOL,
): string {
  if (tool === SPRINT_LIST_TOOL) return sprintListSkipMessage(kind, previous);
  const projected = previous ? projectCachedWorkItemList(previous, args) : undefined;
  if (kind === "loaded") {
    return JSON.stringify({
      repeated: true,
      message:
        "This project's work items are already loaded. Do not list again. assignment.byAssignee is who the board shows — never treat other keys as assigned. location.backlogKeys is the project Backlog (not Unassigned). To unassign sprint items, call fairlx_work_item_bulk_update with clearAssignees: true. To assign a whole sprint, pass sprintId (Sprint 1) and assigneeIds. To assign a share of the project, pass assignPercent and assigneeIds. To parent stories under epics, call it with assignEpics: true.",
      previous: projected,
    });
  }
  if (kind === "no_more") {
    return JSON.stringify({
      repeated: true,
      hasMore: false,
      nextCursor: null,
      message:
        "No further pages. hasMore was false. If the task is to assign, call fairlx_work_item_bulk_update next. Do not list again.",
      previous: projected,
    });
  }
  return JSON.stringify({
    repeated: true,
    message:
      "Invalid cursorAfter. Pass nextCursor from the previous list result unchanged, or stop paginating.",
    previous: projected,
  });
}

export function resolveListSliceCall(
  cache: Map<string, ListSliceState>,
  tool: string,
  args: Record<string, unknown>,
): { action: "execute" } | { action: "skip"; content: string } {
  const key = listSliceKey(tool, args);
  if (!key) return { action: "execute" };
  const cursor = asCursor(args.cursorAfter);
  const prior = cache.get(key);
  if (!cursor) {
    if (prior) return { action: "skip", content: listSliceSkipMessage("loaded", prior.content, args, tool) };
    return { action: "execute" };
  }
  if (!prior) return { action: "execute" };
  if (!prior.hasMore) return { action: "skip", content: listSliceSkipMessage("no_more", prior.content, undefined, tool) };
  if (cursor !== prior.nextCursor) {
    return { action: "skip", content: listSliceSkipMessage("bad_cursor", prior.content, undefined, tool) };
  }
  return { action: "execute" };
}

function withListArgs(call: AgentToolCall, args: Record<string, unknown>): AgentToolCall {
  if (call.name === "mcp_call") {
    const outer = parseObject(call.arguments);
    return {
      ...call,
      arguments: JSON.stringify({ ...outer, arguments: args }),
    };
  }
  return { ...call, arguments: JSON.stringify(args) };
}

export function coalescedListMessage(previous: string, tool = WORK_ITEM_LIST_TOOL): string {
  if (tool === SPRINT_LIST_TOOL || /sprint_list/i.test(tool)) {
    return JSON.stringify({
      coalesced: true,
      repeated: true,
      message:
        "Sprint lists were combined into one project list (all statuses). Do not list sprints again. Next: fairlx_work_item_bulk_update with clearAssignees or sprintId + assigneeIds.",
      previous: compactPrevious(previous, LIST_PREVIOUS_MAX),
    });
  }
  return JSON.stringify({
    coalesced: true,
    repeated: true,
    message:
      "Overlapping work-item list filters were combined into one project list. assignment.byAssignee is who the board shows. To unassign or assign a sprint, call fairlx_work_item_bulk_update with clearAssignees or sprintId + assigneeIds. Do not list again.",
    previous: projectCachedWorkItemList(previous),
  });
}

export function collapseWorkItemListFanOut(calls: AgentToolCall[]): {
  calls: AgentToolCall[];
  coalescedIds: Set<string>;
} {
  const coalescedIds = new Set<string>();
  const lists = calls
    .map((call, index) => ({ call, index, parts: unwrapListCall(call) }))
    .filter(
      (row) =>
        row.parts.tool === WORK_ITEM_LIST_TOOL &&
        row.parts.args.backlog !== true &&
        row.parts.args.backlog !== "true",
    );

  const next = [...calls];
  if (lists.length >= 2) {
    const byProject = new Map<string, typeof lists>();
    for (const row of lists) {
      const projectId = String(row.parts.args.projectId ?? "");
      const group = byProject.get(projectId) ?? [];
      group.push(row);
      byProject.set(projectId, group);
    }

    for (const group of byProject.values()) {
      if (group.length < 2) continue;
      const allUnassigned = group.every(
        (row) => row.parts.args.unassigned === true || row.parts.args.unassigned === "true",
      );
      const assigneeIds = new Set(group.map((row) => String(row.parts.args.assigneeId ?? "")));
      const sprints = new Set(group.map((row) => String(row.parts.args.sprintId ?? "")));
      const sharedSprint = sprints.size === 1 ? [...sprints][0] : "";
      const mixedFilters = group.some((row, index) => {
        if (index === 0) return false;
        const a = group[0]!.parts.args;
        const b = row.parts.args;
        return (
          a.status !== b.status ||
          a.type !== b.type ||
          a.sprintId !== b.sprintId ||
          Boolean(a.unassigned) !== Boolean(b.unassigned) ||
          String(a.assigneeId ?? "") !== String(b.assigneeId ?? "")
        );
      });
      const canonical: Record<string, unknown> = {
        projectId: String(group[0]!.parts.args.projectId ?? ""),
      };
      if (sharedSprint) canonical.sprintId = sharedSprint;
      if (!mixedFilters && allUnassigned) canonical.unassigned = true;
      if (!mixedFilters && assigneeIds.size === 1 && [...assigneeIds][0]) {
        canonical.assigneeId = [...assigneeIds][0];
      }
      for (const row of group) {
        next[row.index] = withListArgs(row.call, canonical);
      }
      for (const row of group.slice(1)) coalescedIds.add(row.call.id);
    }
  }

  const sprintRows = next
    .map((call, index) => ({ call, index, parts: unwrapListCall(call) }))
    .filter((row) => row.parts.tool === SPRINT_LIST_TOOL);
  const sprintsByProject = new Map<string, typeof sprintRows>();
  for (const row of sprintRows) {
    const projectId = String(row.parts.args.projectId ?? "");
    const group = sprintsByProject.get(projectId) ?? [];
    group.push(row);
    sprintsByProject.set(projectId, group);
  }
  for (const group of sprintsByProject.values()) {
    const canonical: Record<string, unknown> = {
      projectId: String(group[0]!.parts.args.projectId ?? ""),
      limit: 100,
    };
    for (const row of group) {
      next[row.index] = withListArgs(row.call, canonical);
    }
    for (const row of group.slice(1)) coalescedIds.add(row.call.id);
  }

  return { calls: next, coalescedIds };
}

const WORK_ITEM_GET_TOOL = "fairlx_work_item_get";

/** One list is enough for a PRD. Extra get-per-epic calls blow the context window. */
export function collapseRedundantReadFanOut(calls: AgentToolCall[]): { skipIds: Set<string> } {
  const skipIds = new Set<string>();
  const gets = calls.filter((call) => unwrapListCall(call).tool === WORK_ITEM_GET_TOOL);
  for (const extra of gets.slice(1)) skipIds.add(extra.id);
  const fetches = calls.filter((call) => call.name === "web_fetch");
  for (const extra of fetches.slice(4)) skipIds.add(extra.id);
  return { skipIds };
}

export const SKIPPED_WORK_ITEM_GET = JSON.stringify({
  skipped: true,
  message:
    "Do not fetch work items one by one. Use the fairlx_work_item_list already in context and write the document. Extra get calls were skipped to keep the model context from filling up.",
});

export const SKIPPED_WEB_FETCH = JSON.stringify({
  skipped: true,
  message:
    "Enough pages are already in context for this step. Write the document from the searches and fetches you have. Do not fetch more pages.",
});

export function documentationWriteTools<T extends { function: { name: string } }>(tools: T[]): T[] {
  const next = tools.filter((tool) => /^fairlx_doc_(create|update|list|get)$/.test(tool.function.name));
  return next.length ? next : tools;
}

export function toolsWhenContextIsTight<T extends { function: { name: string } }>(
  tools: T[],
  researched: boolean,
): T[] {
  if (researched) return documentationWriteTools(tools);
  const next = tools.filter((tool) =>
    /^(web_search|fairlx_doc_list|fairlx_work_item_list)$/.test(tool.function.name),
  );
  return next.length ? next : tools;
}

export function fingerprintsFromMessages(messages: AgentChatMessage[]): Map<string, string> {
  const map = new Map<string, string>();
  const pending = new Map<string, string>();
  for (const message of messages) {
    if (message.role === "assistant" && message.toolCalls?.length) {
      for (const call of message.toolCalls) {
        pending.set(call.id, toolCallFingerprint(call.name, call.arguments));
      }
    }
    if (message.role === "tool" && message.toolCallId) {
      const fingerprint = pending.get(message.toolCallId);
      if (fingerprint) {
        map.set(fingerprint, message.content);
        pending.delete(message.toolCallId);
      }
    }
  }
  return map;
}

export function repeatedToolMessage(previous: string, tool = ""): string {
  const workList = /work_item_list/i.test(tool);
  const sprintList = /sprint_list/i.test(tool);
  const message = sprintList
    ? "Sprints for this project are already loaded. Do not list sprints again. Call fairlx_work_item_bulk_update with clearAssignees: true to unassign sprint items, or sprintId (Sprint 1) and assigneeIds to assign a whole sprint."
    : workList
      ? "This project's work items are already loaded. Do not list again. assignment.byAssignee is who the board shows. Call fairlx_work_item_bulk_update with clearAssignees, sprintId + assigneeIds, or assignPercent — do not pick keys or list again. To parent stories under epics, call it with assignEpics: true."
      : "This exact tool call was already made. Use the previous result and continue the task. Do not call this tool again with the same arguments.";
  return JSON.stringify({
    repeated: true,
    message,
    previous: compactPrevious(previous, workList || sprintList ? LIST_PREVIOUS_MAX : PREVIOUS_RESULT_MAX),
  });
}

function compactPrevious(previous: string, max = PREVIOUS_RESULT_MAX): unknown {
  const compact = compactJsonString(previous, max);
  try {
    return JSON.parse(compact) as unknown;
  } catch {
    return truncateString(previous, max);
  }
}

export function isFailedToolContent(content: string): boolean {
  if (!content?.trim()) return false;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      if (parsed.repeated === true) return false;
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        if (Array.isArray(parsed.workItems) && parsed.workItems.length >= 0) return false;
        return true;
      }
      if (parsed.ok === false) return true;
    }
  } catch {
    return /error|failed|rate limit|unknown tool/i.test(content);
  }
  return /rate limit/i.test(content);
}
