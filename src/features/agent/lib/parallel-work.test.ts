import { describe, expect, it } from "vitest";

import type { AgentToolCall } from "../types";
import {
  MAX_PARALLEL_SUBAGENTS,
  chunkForParallel,
  createMergedEventPersister,
  fanOutDelegatesForSubjects,
  groupParallelizable,
} from "./parallel-work";

function call(name: string, args: Record<string, unknown>, id = "c1"): AgentToolCall {
  return { id, name, arguments: JSON.stringify(args) };
}

describe("chunkForParallel", () => {
  it("batches specialists so at most MAX_PARALLEL_SUBAGENTS run at once", () => {
    const items = Array.from({ length: 13 }, (_, i) => i);
    expect(chunkForParallel(items).map((batch) => batch.length)).toEqual([6, 6, 1]);
    expect(MAX_PARALLEL_SUBAGENTS).toBe(6);
  });
});

describe("groupParallelizable", () => {
  it("keeps consecutive reads in one parallel group and isolates writes", () => {
    const groups = groupParallelizable(
      ["list_a", "list_b", "create", "list_c"],
      (name) => !name.startsWith("create"),
    );
    expect(groups).toEqual([
      { parallel: true, items: ["list_a", "list_b"] },
      { parallel: false, items: ["create"] },
      { parallel: true, items: ["list_c"] },
    ]);
  });
});

describe("fanOutDelegatesForSubjects", () => {
  const subjects = [{ title: "Auth" }, { title: "Billing" }, { title: "Reports" }];

  it("splits one unscoped builder into one delegate per subject", () => {
    const { calls, expanded } = fanOutDelegatesForSubjects(
      [call("delegate_agent", { agent: "builder", task: "Create epics and stories" }, "orig")],
      subjects,
    );
    expect(expanded).toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls[0]?.id).toBe("orig");
    expect(calls.slice(1).every((item) => item.id !== "orig")).toBe(true);
    expect(calls.map((item) => JSON.parse(item.arguments).subject)).toEqual([
      "Auth",
      "Billing",
      "Reports",
    ]);
    expect(JSON.parse(calls[1]!.arguments).task).toMatch(/Billing/);
  });

  it("does not split a documentation pack into one specialist per spec heading", () => {
    expect(
      fanOutDelegatesForSubjects(
        [call("delegate_agent", { agent: "builder", task: "Draft PRD, FRD, and BRD documents" })],
        subjects,
      ).expanded,
    ).toBe(false);
    expect(
      fanOutDelegatesForSubjects(
        [call("delegate_agent", { agent: "builder", task: "Generate me a researched PRD" })],
        subjects,
      ).expanded,
    ).toBe(false);
  });

  it("does not split a planner, a scoped builder, or multiple delegates", () => {
    expect(
      fanOutDelegatesForSubjects(
        [call("delegate_agent", { agent: "planner", task: "Write the sprint timeline" })],
        subjects,
      ).expanded,
    ).toBe(false);
    expect(
      fanOutDelegatesForSubjects(
        [call("delegate_agent", { agent: "builder", subject: "Auth", task: "Build auth" })],
        subjects,
      ).expanded,
    ).toBe(false);
    expect(
      fanOutDelegatesForSubjects(
        [
          call("delegate_agent", { agent: "builder", task: "Auth" }, "a"),
          call("delegate_agent", { agent: "builder", task: "Billing" }, "b"),
        ],
        subjects,
      ).expanded,
    ).toBe(false);
  });
});

describe("createMergedEventPersister", () => {
  it("merges sibling specialist events instead of letting the last persist win", async () => {
    let snapshot: Array<{ id: string }> = [{ id: "parent" }];
    const persisted: Array<Array<{ id: string }>> = [];
    let releaseA: () => void = () => undefined;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const persist = createMergedEventPersister({
      getEvents: () => snapshot,
      setEvents: (events) => {
        snapshot = events;
      },
      merge: (target, extra) => {
        const seen = new Set(target.map((event) => event.id));
        for (const event of extra) {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          target.push(event);
        }
        return target;
      },
      persist: async (events) => {
        persisted.push(events.map((event) => ({ id: event.id })));
        if (events.some((event) => event.id === "a") && !events.some((event) => event.id === "b")) {
          await gateA;
        }
      },
    });

    const first = persist([{ id: "a" }]);
    const second = persist([{ id: "b" }]);
    releaseA();
    await Promise.all([first, second]);

    expect(snapshot.map((event) => event.id)).toEqual(["parent", "a", "b"]);
    expect(persisted.at(-1)?.map((event) => event.id)).toEqual(["parent", "a", "b"]);
  });
});
