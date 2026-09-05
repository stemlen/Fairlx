import { compactLlmUsagePayload } from "./run-usage";

export function parseJson<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function truncateString(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

/** Prefer a paragraph/sentence/word break so user-visible prose is not cut mid-word. */
export function truncateAtBoundary(value: string, max: number): string {
  if (value.length <= max) return value;
  const ellipsis = "…";
  const budget = Math.max(0, max - ellipsis.length);
  if (budget < 32) return truncateString(value, max);
  const slice = value.slice(0, budget);
  const markers = ["\n\n", "\n", ". ", "? ", "! ", " "];
  for (const marker of markers) {
    const idx = slice.lastIndexOf(marker);
    if (idx >= Math.floor(budget * 0.55)) {
      const end = idx + (marker === ". " || marker === "? " || marker === "! " ? 1 : 0);
      return `${slice.slice(0, end).trimEnd()}${ellipsis}`;
    }
  }
  return `${slice.trimEnd()}${ellipsis}`;
}

const FALLBACK_JSON = '{"truncated":true}';
const TOOL_CONTENT_SOFT = 1200;
const TOOL_CONTENT_HARD = 400;
const EVENT_PAYLOAD_MAX = 600;
const DETAIL_MAX = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unwrapMcpValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return unwrapMcpValue(JSON.parse(trimmed) as unknown, depth + 1);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (!isRecord(value)) return value;
  const content = value.content;
  if (Array.isArray(content)) {
    const textItem = content.find(
      (item) => isRecord(item) && item.type === "text" && typeof item.text === "string",
    );
    if (textItem && isRecord(textItem) && typeof textItem.text === "string") {
      return unwrapMcpValue(textItem.text, depth + 1);
    }
  }
  if ("result" in value) {
    return unwrapMcpValue(value.result, depth + 1);
  }
  return value;
}

/** Flatten MCP `{ content: [{ type: "text", text }] }` envelopes to the inner JSON string. */
export function unwrapMcpToolContent(content: string): string {
  if (!content) return content;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) return content;
    const isEnvelope =
      Array.isArray(parsed.content) ||
      ("result" in parsed && (parsed.server != null || parsed.tool != null || Array.isArray(parsed.content)));
    if (!isEnvelope) return content;
    const inner = unwrapMcpValue(parsed);
    return typeof inner === "string" ? inner : JSON.stringify(inner);
  } catch {
    return content;
  }
}

function isWorkItemListPayload(value: unknown): value is Record<string, unknown> & { workItems: unknown[] } {
  return isRecord(value) && Array.isArray(value.workItems);
}

const LIST_META_KEYS = [
  "hasMore",
  "nextCursor",
  "returned",
  "total",
  "matched",
  "unassignedCount",
  "assignment",
  "location",
  "error",
] as const;

function assignmentMetaFromItems(rows: unknown[]) {
  const unassignedKeys: string[] = [];
  const byAssignee: Record<string, string[]> = {};
  for (const row of rows) {
    if (!isRecord(row) || typeof row.key !== "string" || !row.key.trim()) continue;
    const key = row.key.trim();
    const people = Array.isArray(row.assignees) ? row.assignees : [];
    const names = people.flatMap((entry) => {
      if (typeof entry === "string" && entry.trim() && !entry.includes("@")) return [entry.trim()];
      if (entry && typeof entry === "object" && typeof (entry as { name?: string }).name === "string") {
        const name = (entry as { name: string }).name.trim();
        return name ? [name] : [];
      }
      return [];
    });
    if (row.unassigned === true || names.length === 0) {
      unassignedKeys.push(key);
      continue;
    }
    for (const name of names) {
      (byAssignee[name] ??= []).push(key);
    }
  }
  return {
    total: unassignedKeys.length + Object.values(byAssignee).reduce((sum, keys) => sum + keys.length, 0),
    unassignedCount: unassignedKeys.length,
    unassignedKeys,
    byAssignee,
  };
}

export function compactWorkItemListPayload(payload: Record<string, unknown>, max: number): string {
  const original = Array.isArray(payload.workItems) ? (payload.workItems as unknown[]) : [];
  const items = [...original];
  const meta: Record<string, unknown> = {};
  for (const key of LIST_META_KEYS) {
    if (payload[key] !== undefined) meta[key] = payload[key];
  }
  if (meta.assignment === undefined) {
    meta.assignment = assignmentMetaFromItems(original);
  }
  const build = (rows: unknown[], omitted: number) => {
    const next: Record<string, unknown> = {
      ...meta,
      returned: rows.length,
      workItems: rows,
    };
    if (omitted > 0) {
      next.truncated = true;
      next.omitted = omitted;
    }
    return JSON.stringify(next);
  };
  let json = build(items, 0);
  if (json.length <= max) return json;
  while (items.length > 0) {
    items.pop();
    json = build(items, original.length - items.length);
    if (json.length <= max) return json;
  }
  return build([], original.length);
}

export function compactJsonString(raw: string, max: number): string {
  if (!raw) return raw;
  const normalized = unwrapMcpToolContent(raw);
  if (normalized.length <= max) return normalized;
  try {
    const inner = JSON.parse(normalized) as unknown;
    if (isWorkItemListPayload(inner)) {
      return compactWorkItemListPayload(inner, max);
    }
    const compacted = compactUnknown(inner, max);
    const json = JSON.stringify(compacted);
    if (json.length <= max) return json;
    if (isWorkItemListPayload(compacted)) {
      return compactWorkItemListPayload(compacted as Record<string, unknown>, max);
    }
    return JSON.stringify({
      truncated: true,
      preview: truncateString(json, Math.max(32, max - 40)),
    });
  } catch {
    // Prose / markdown is not JSON. Truncate in place so chat bubbles stay readable.
    return truncateString(normalized, max);
  }
}

function compactUnknown(value: unknown, budget: number): unknown {
  if (typeof value === "string") {
    return truncateString(value, Math.min(value.length, Math.max(80, Math.floor(budget / 2))));
  }
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    for (const item of value) {
      next.push(compactUnknown(item, Math.max(80, Math.floor(budget / Math.max(2, next.length + 1)))));
      if (JSON.stringify(next).length > budget) {
        next.pop();
        break;
      }
    }
    return next;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      if (key === "payload") {
        if (record.type === "confirmation") {
          next[key] = nested;
          continue;
        }
        try {
          if (JSON.stringify(nested).length > EVENT_PAYLOAD_MAX) continue;
        } catch {
          continue;
        }
      }
      next[key] = compactUnknown(nested, budget);
      if (JSON.stringify(next).length > budget) {
        if (record.type === "confirmation" && key === "payload") {
          // Keep confirmation payload intact
          continue;
        }
        if (typeof next[key] === "string") {
          next[key] = truncateString(next[key] as string, 120);
        } else {
          delete next[key];
        }
        break;
      }
    }
    return next;
  }
  return value;
}

function compactArrayItems(items: unknown[]): unknown[] {
  return items.map((item) => {
    if (!isRecord(item)) return item;
    const next: Record<string, unknown> = { ...item };
    const isToolMessage = next.role === "tool";
    if (isToolMessage && typeof next.content === "string" && next.content.length > TOOL_CONTENT_SOFT) {
      next.content = compactJsonString(next.content, TOOL_CONTENT_SOFT);
    }
    if (typeof next.detail === "string" && next.detail.length > DETAIL_MAX) {
      next.detail = truncateString(next.detail, DETAIL_MAX);
    }
    if (next.type === "llm_usage") {
      const compact = compactLlmUsagePayload(next.payload);
      if (compact) next.payload = compact;
    } else if (next.type !== "confirmation" && next.type !== "context_meter" && next.payload !== undefined) {
      try {
        if (JSON.stringify(next.payload).length > EVENT_PAYLOAD_MAX) next.payload = undefined;
      } catch {
        next.payload = undefined;
      }
    }
    return next;
  });
}

function isFinalVisibleMessage(item: unknown): boolean {
  if (!isRecord(item)) return false;
  if (item.role !== "user" && item.role !== "assistant") return false;
  if (item.role === "assistant" && Array.isArray(item.toolCalls) && item.toolCalls.length > 0) {
    return false;
  }
  return true;
}

/** Keep the latest user prompt + final assistant answer out of compaction. */
function splitPinnedTail(items: unknown[]): { rest: unknown[]; pinned: unknown[] } {
  if (!items.length) return { rest: items, pinned: [] };
  const pinned: unknown[] = [];
  let i = items.length - 1;
  if (isFinalVisibleMessage(items[i])) {
    pinned.unshift(items[i]);
    i -= 1;
    if (i >= 0) {
      const prev = items[i];
      if (isRecord(prev) && prev.role === "user") {
        pinned.unshift(prev);
        i -= 1;
      }
    }
  }
  return { rest: items.slice(0, i + 1), pinned };
}

function shrinkPinned(pinned: unknown[], max: number): unknown[] {
  if (!pinned.length) return pinned;
  if (JSON.stringify(pinned).length <= max) return pinned;
  const last = pinned[pinned.length - 1];
  if (!isRecord(last) || typeof last.content !== "string") return pinned;
  const overhead = JSON.stringify(pinned).length - last.content.length;
  const budget = Math.max(80, max - overhead - 8);
  const next = [...pinned];
  next[next.length - 1] = {
    ...last,
    content: truncateAtBoundary(last.content, budget),
    payload: undefined,
    toolCalls: undefined,
  };
  return next;
}

function isEventItem(item: unknown): boolean {
  return isRecord(item) && typeof item.type === "string" && item.role == null;
}

function isPinnedEvent(item: unknown): boolean {
  if (!isRecord(item)) return false;
  return item.type === "confirmation" || item.type === "confirmation_resolved" || item.type === "error" || item.type === "context_meter" || item.type === "llm_usage";
}

/** Drop bulky payloads from the activity trail so thought titles survive the Appwrite cap. */
function slimEventItems(items: unknown[]): unknown[] {
  return items.map((item) => {
    if (!isEventItem(item) || !isRecord(item) || isPinnedEvent(item)) return item;
    const next: Record<string, unknown> = { ...item };
    if (next.type === "llm_usage") {
      const compact = compactLlmUsagePayload(next.payload);
      if (compact) next.payload = compact;
    } else if (next.payload !== undefined) {
      delete next.payload;
    }
    if (typeof next.detail === "string" && next.detail.length > 160) {
      next.detail = truncateString(next.detail, 160);
    }
    return next;
  });
}

function dropOldestEvents(items: unknown[], max: number): unknown[] {
  const next = [...items];
  while (JSON.stringify(next).length > max && next.length > 1) {
    const index = next.findIndex((item) => !isPinnedEvent(item));
    if (index === -1) break;
    next.splice(index, 1);
  }
  return next;
}

function dropDispensable(items: unknown[], max: number): unknown[] {
  const next = [...items];
  const predicates: Array<(item: unknown) => boolean> = [
    (item) => isRecord(item) && item.role === "tool",
    (item) =>
      isRecord(item) &&
      item.role === "assistant" &&
      Array.isArray(item.toolCalls) &&
      item.toolCalls.length > 0,
    (item) =>
      isRecord(item) &&
      typeof item.type === "string" &&
      item.role == null &&
      !isPinnedEvent(item) &&
      item.type !== "thought" &&
      item.type !== "context_meter",
    (item) => isRecord(item) && item.type === "thought",
  ];
  for (const pred of predicates) {
    while (JSON.stringify(next).length > max && next.length > 1) {
      const index = next.findIndex(pred);
      if (index === -1) break;
      next.splice(index, 1);
    }
  }
  return next;
}

function keepNewestThatFit(items: unknown[], max: number): unknown[] {
  const kept: unknown[] = [];
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const candidate = [items[i], ...kept];
    if (JSON.stringify(candidate).length <= max) kept.unshift(items[i]);
  }
  if (kept.length) return kept;
  const last = items[items.length - 1];
  if (!isRecord(last)) return [];
  const compact: Record<string, unknown> = {
    ...last,
    payload: undefined,
    toolCalls: undefined,
  };
  const originalContent = typeof compact.content === "string" ? compact.content : null;
  const originalDetail = typeof compact.detail === "string" ? compact.detail : null;
  const isTool = compact.role === "tool";
  const contentBudget = isTool ? TOOL_CONTENT_HARD : Math.max(TOOL_CONTENT_HARD, max - 256);
  const cutContent = (text: string, budget: number) =>
    isTool ? truncateString(text, budget) : truncateAtBoundary(text, budget);
  if (originalContent != null) {
    compact.content = cutContent(originalContent, contentBudget);
  }
  if (originalDetail != null) {
    compact.detail = truncateString(originalDetail, TOOL_CONTENT_HARD);
  }
  let json = JSON.stringify([compact]);
  if (json.length <= max) return [compact];
  if (originalContent != null) {
    let budget = Math.floor(contentBudget / 2);
    while (budget >= 80) {
      compact.content = cutContent(originalContent, budget);
      json = JSON.stringify([compact]);
      if (json.length <= max) return [compact];
      budget = Math.floor(budget / 2);
    }
  }
  return [];
}

export function stringifyBounded(value: unknown, max = 16384): string {
  let json = JSON.stringify(value);
  if (json.length <= max) return json;

  if (Array.isArray(value)) {
    const { rest, pinned } = splitPinnedTail(value);
    const attach = (head: unknown[]) => (pinned.length ? [...head, ...pinned] : head);

    const compacted = compactArrayItems(rest);
    json = JSON.stringify(attach(compacted));
    if (json.length <= max) return json;

    const pinnedLen = pinned.length ? JSON.stringify(pinned).length : 0;
    const restMax = Math.max(2, max - pinnedLen);
    const eventTrail = compacted.some(isEventItem);
    const slimmed = eventTrail ? slimEventItems(compacted) : compacted;
    if (eventTrail) {
      json = JSON.stringify(attach(slimmed));
      if (json.length <= max) return json;
    }
    const pruned = eventTrail ? dropOldestEvents(slimmed, restMax) : dropDispensable(slimmed, restMax);
    json = JSON.stringify(attach(pruned));
    if (json.length <= max) return json;

    const kept = keepNewestThatFit(pruned, restMax);
    json = JSON.stringify(attach(kept));
    if (json.length <= max) return json;

    if (pinned.length) {
      json = JSON.stringify(shrinkPinned(pinned, max));
      if (json.length <= max) return json;
    }
  } else if (value && typeof value === "object") {
    json = JSON.stringify(compactUnknown(value, max));
    if (json.length <= max) return json;
  }

  return FALLBACK_JSON;
}
