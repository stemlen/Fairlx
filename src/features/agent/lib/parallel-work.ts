import type { AgentToolCall } from "../types";

/** Concurrent specialist passes the orchestrator will start at once. */
export const MAX_PARALLEL_SUBAGENTS = 6;

/** Specialists that can own one spec subject without waiting on siblings. */
export const PARALLEL_FANOUT_AGENTS = new Set([
  "builder",
  "researcher",
  "git",
  "security",
]);

export function chunkForParallel<T>(items: T[], size = MAX_PARALLEL_SUBAGENTS): T[][] {
  const n = Math.max(1, size);
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += n) {
    batches.push(items.slice(i, i + n));
  }
  return batches;
}

/**
 * Consecutive items that are safe to overlap stay in one parallel group.
 * Writes (and anything that must stay ordered) each get their own sequential group.
 */
export function groupParallelizable<T>(
  items: T[],
  canRunInParallel: (item: T) => boolean,
): Array<{ parallel: boolean; items: T[] }> {
  const groups: Array<{ parallel: boolean; items: T[] }> = [];
  for (const item of items) {
    const parallel = canRunInParallel(item);
    const last = groups[groups.length - 1];
    if (last && last.parallel && parallel) {
      last.items.push(item);
    } else {
      groups.push({ parallel, items: [item] });
    }
  }
  return groups;
}

export function isDocumentationTask(text: string): boolean {
  const value = text.toLowerCase();
  if (/\b(all required documents|documentation pack|project docs?)\b/.test(value)) return true;
  if (
    /\b(prd|frd|brd|srs|product requirements)\b/.test(value) &&
    /\b(doc|docs|documentation|researched|generate|write|draft|create)\b/.test(value)
  ) {
    return true;
  }
  return (
    /\b(create|write|draft|generate)\b/.test(value) &&
    /\b(user guide|test plan|release notes|user stories)\b/.test(value)
  );
}

export function parseJsonObject(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * If the parent launched one unscoped builder/researcher/git/security pass
 * against a multi-subject spec, split it into one delegate per heading so
 * those specialists start together instead of covering the whole spec alone.
 */
export function fanOutDelegatesForSubjects(
  calls: AgentToolCall[],
  subjects: Array<{ title: string }>,
): { calls: AgentToolCall[]; expanded: boolean } {
  if (calls.length !== 1 || subjects.length < 2) {
    return { calls, expanded: false };
  }
  const call = calls[0]!;
  const args = parseJsonObject(call.arguments);
  const agent = String(args.agent || "").trim();
  if (!PARALLEL_FANOUT_AGENTS.has(agent)) {
    return { calls, expanded: false };
  }
  if (String(args.subject || "").trim()) {
    return { calls, expanded: false };
  }
  const task = String(args.task || args.prompt || "").trim();
  if (isDocumentationTask(task)) {
    return { calls, expanded: false };
  }
  return {
    expanded: true,
    calls: subjects.map((subject, index) => ({
      id: index === 0 ? call.id : crypto.randomUUID(),
      name: call.name,
      arguments: JSON.stringify({
        ...args,
        subject: subject.title,
        task: task
          ? `${task}\n\nWork only on this subject: ${subject.title}.`
          : `Handle only this subject: ${subject.title}.`,
      }),
    })),
  };
}

/** Serialize persist so parallel specialists merge events instead of overwriting. */
export function createMergedEventPersister<T>(options: {
  getEvents: () => T[];
  setEvents: (events: T[]) => void;
  merge: (target: T[], extra: T[]) => T[];
  persist: (events: T[]) => Promise<unknown>;
}): (extra: T[]) => Promise<void> {
  let tail = Promise.resolve();
  return (extra: T[]) => {
    const next = tail.then(async () => {
      const merged = options.merge([...options.getEvents()], extra);
      options.setEvents(merged);
      await options.persist(merged);
    });
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
