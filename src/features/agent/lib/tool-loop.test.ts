import { describe, expect, it } from "vitest";

import type { AgentChatMessage, AgentToolCall } from "../types";
import {
  canonicalizeToolCall,
  collapseWorkItemListFanOut,
  collapseRedundantReadFanOut,
  documentationWriteTools,
  fingerprintsFromMessages,
  isFailedToolContent,
  listSliceKey,
  rememberListSlice,
  repeatedToolMessage,
  resolveListSliceCall,
  shouldForceAnswer,
  stableToolArgs,
  toolCallFingerprint,
} from "./tool-loop";

describe("toolCallFingerprint", () => {
  it("is stable for the same name and argument values regardless of key order", () => {
    const left = toolCallFingerprint(
      "fairlx_work_item_list",
      JSON.stringify({ workspaceId: "w1", projectId: "p1" }),
    );
    const right = toolCallFingerprint(
      "fairlx_work_item_list",
      JSON.stringify({ projectId: "p1", workspaceId: "w1" }),
    );
    expect(left).toBe(right);
    expect(stableToolArgs('{"b":1,"a":2}')).toBe(stableToolArgs('{"a":2,"b":1}'));
  });
});

describe("repeatedToolMessage", () => {
  it("is not treated as a failed tool result", () => {
    const content = repeatedToolMessage(JSON.stringify({ workItems: [{ id: "i1" }] }));
    expect(isFailedToolContent(content)).toBe(false);
    expect(JSON.parse(content).repeated).toBe(true);
  });

  it("tells the model to bulk-update after a repeated work item list", () => {
    const items = Array.from({ length: 22 }, (_, i) => ({ key: `SCHO-${i + 1}` }));
    const content = repeatedToolMessage(
      JSON.stringify({ workItems: items, hasMore: false }),
      "fairlx_work_item_list",
    );
    const parsed = JSON.parse(content) as {
      message: string;
      previous: { workItems: { key: string }[] };
    };
    expect(parsed.message).toMatch(/assignPercent/);
    expect(parsed.message).not.toMatch(/answer the user now/i);
    expect(parsed.previous.workItems).toHaveLength(22);
    expect(parsed.previous.workItems[12]?.key).toBe("SCHO-13");
  });
});

describe("shouldForceAnswer", () => {
  it("does not abort after duplicate list skips", () => {
    expect(shouldForceAnswer(0)).toBe(false);
    expect(shouldForceAnswer(2)).toBe(false);
  });

  it("aborts only after consecutive tool failures", () => {
    expect(shouldForceAnswer(3)).toBe(true);
  });
});

describe("fingerprintsFromMessages", () => {
  it("maps assistant toolCalls then matching tool results", () => {
    const now = new Date().toISOString();
    const messages: AgentChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "c1",
            name: "fairlx_work_item_list",
            arguments: JSON.stringify({ workspaceId: "w1" }),
          },
        ],
        createdAt: now,
      },
      {
        id: "t1",
        role: "tool",
        content: JSON.stringify({ workItems: [] }),
        toolCallId: "c1",
        toolName: "fairlx_work_item_list",
        createdAt: now,
      },
    ];
    const map = fingerprintsFromMessages(messages);
    const fingerprint = toolCallFingerprint(
      "fairlx_work_item_list",
      JSON.stringify({ workspaceId: "w1" }),
    );
    expect(map.get(fingerprint)).toBe(JSON.stringify({ workItems: [] }));
  });
});

describe("list slice cache", () => {
  it("ignores cursorAfter when building the slice key", () => {
    expect(
      listSliceKey("fairlx_work_item_list", { projectId: "p1", cursorAfter: "first" }),
    ).toBe(listSliceKey("fairlx_work_item_list", { projectId: "p1", cursorAfter: "last" }));
  });

  it("blocks a second page when hasMore is false", () => {
    const cache = new Map();
    rememberListSlice(
      cache,
      "fairlx_work_item_list",
      { projectId: "p1" },
      JSON.stringify({ hasMore: false, nextCursor: null, workItems: [{ id: "a" }] }),
    );
    const skip = resolveListSliceCall(cache, "fairlx_work_item_list", {
      projectId: "p1",
      cursorAfter: "anything",
    });
    expect(skip.action).toBe("skip");
    if (skip.action === "skip") expect(skip.content).toMatch(/No further pages/);
  });

  it("allows the next page when hasMore is nested in an MCP text envelope", () => {
    const cache = new Map();
    rememberListSlice(
      cache,
      "fairlx_work_item_list",
      { projectId: "p1" },
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({ hasMore: true, nextCursor: "doc_last", workItems: [{ key: "A-1" }] }),
          },
        ],
      }),
    );
    const ok = resolveListSliceCall(cache, "fairlx_work_item_list", {
      projectId: "p1",
      cursorAfter: "doc_last",
    });
    expect(ok.action).toBe("execute");
  });

  it("treats assignee and unassigned lists as the same project slice", () => {
    expect(listSliceKey("fairlx_work_item_list", { projectId: "p1" })).toBe(
      listSliceKey("fairlx_work_item_list", { projectId: "p1", unassigned: true }),
    );
    expect(listSliceKey("fairlx_work_item_list", { projectId: "p1" })).toBe(
      listSliceKey("fairlx_work_item_list", { projectId: "p1", assigneeId: "fogef" }),
    );
    expect(listSliceKey("fairlx_work_item_list", { projectId: "p1", backlog: true })).not.toBe(
      listSliceKey("fairlx_work_item_list", { projectId: "p1" }),
    );
    expect(listSliceKey("fairlx_sprint_list", { projectId: "p1", status: "ACTIVE" })).toBe(
      listSliceKey("fairlx_sprint_list", { projectId: "p1", status: "ALL", limit: 50 }),
    );
  });

  it("strips sprint list status so ACTIVE and ALL are the same call", () => {
    const call = canonicalizeToolCall({
      id: "s1",
      name: "fairlx_sprint_list",
      arguments: JSON.stringify({ projectId: "p1", status: "ACTIVE", limit: 50, cursorAfter: "" }),
    });
    expect(JSON.parse(call.arguments)).toEqual({ projectId: "p1", limit: 100 });
  });

  it("skips a second sprint list after one already loaded", () => {
    const cache = new Map();
    rememberListSlice(
      cache,
      "fairlx_sprint_list",
      { projectId: "p1", status: "ACTIVE" },
      JSON.stringify({ sprints: [{ name: "Sprint 1" }], total: 1 }),
    );
    const skip = resolveListSliceCall(cache, "fairlx_sprint_list", {
      projectId: "p1",
      status: "PLANNED",
    });
    expect(skip.action).toBe("skip");
    if (skip.action === "skip") expect(skip.content).toMatch(/Do not list sprints again/);
  });

  it("projects an unassigned skip from the already-loaded list", () => {
    const cache = new Map();
    rememberListSlice(
      cache,
      "fairlx_work_item_list",
      { projectId: "p1" },
      JSON.stringify({
        workItems: [
          { key: "SCHO-1", unassigned: true, assignees: [] },
          { key: "SCHO-2", unassigned: false, assignees: [{ name: "fogef" }] },
        ],
      }),
    );
    const skip = resolveListSliceCall(cache, "fairlx_work_item_list", {
      projectId: "p1",
      unassigned: true,
    });
    expect(skip.action).toBe("skip");
    if (skip.action !== "skip") return;
    const parsed = JSON.parse(skip.content) as {
      previous: {
        workItems: { key: string }[];
        assignment: { byAssignee: Record<string, string[]>; unassignedKeys: string[] };
      };
    };
    expect(parsed.previous.workItems.map((item) => item.key)).toEqual(["SCHO-1"]);
    expect(parsed.previous.assignment.byAssignee.fogef).toEqual(["SCHO-2"]);
    expect(parsed.previous.assignment.unassignedKeys).toEqual(["SCHO-1"]);
  });

  it("rejects a cursor that is not the stored nextCursor", () => {
    const cache = new Map();
    rememberListSlice(
      cache,
      "fairlx_work_item_list",
      { projectId: "p1" },
      JSON.stringify({ hasMore: true, nextCursor: "doc_last", workItems: [] }),
    );
    const skip = resolveListSliceCall(cache, "fairlx_work_item_list", {
      projectId: "p1",
      cursorAfter: "doc_first",
    });
    expect(skip.action).toBe("skip");
    if (skip.action === "skip") expect(skip.content).toMatch(/Invalid cursorAfter/);
    const ok = resolveListSliceCall(cache, "fairlx_work_item_list", {
      projectId: "p1",
      cursorAfter: "doc_last",
    });
    expect(ok.action).toBe("execute");
  });
});

describe("collapseWorkItemListFanOut", () => {
  it("rewrites overlapping BUG and TODO lists into one project list", () => {
    const calls: AgentToolCall[] = [
      { id: "c1", name: "fairlx_work_item_list", arguments: JSON.stringify({ projectId: "p1", type: "BUG" }) },
      { id: "c2", name: "fairlx_work_item_list", arguments: JSON.stringify({ projectId: "p1", status: "TODO" }) },
      { id: "c3", name: "fairlx_sprint_list", arguments: JSON.stringify({ projectId: "p1" }) },
    ];
    const { calls: next, coalescedIds } = collapseWorkItemListFanOut(calls);
    expect(JSON.parse(next[0]!.arguments)).toEqual({ projectId: "p1" });
    expect(JSON.parse(next[1]!.arguments)).toEqual({ projectId: "p1" });
    expect(next[2]!.name).toBe("fairlx_sprint_list");
    expect(JSON.parse(next[2]!.arguments)).toEqual({ projectId: "p1", limit: 100 });
    expect([...coalescedIds]).toEqual(["c2"]);
  });

  it("collapses ACTIVE and PLANNED sprint lists into one unfiltered list", () => {
    const calls: AgentToolCall[] = [
      { id: "s1", name: "fairlx_sprint_list", arguments: JSON.stringify({ projectId: "p1", status: "ACTIVE" }) },
      { id: "s2", name: "fairlx_sprint_list", arguments: JSON.stringify({ projectId: "p1", status: "PLANNED" }) },
    ];
    const { calls: next, coalescedIds } = collapseWorkItemListFanOut(calls);
    expect(JSON.parse(next[0]!.arguments)).toEqual({ projectId: "p1", limit: 100 });
    expect(JSON.parse(next[1]!.arguments)).toEqual({ projectId: "p1", limit: 100 });
    expect([...coalescedIds]).toEqual(["s2"]);
  });

  it("does not merge an unassigned list with a typed list", () => {
    const calls: AgentToolCall[] = [
      { id: "c1", name: "fairlx_work_item_list", arguments: JSON.stringify({ projectId: "p1", unassigned: true }) },
      { id: "c2", name: "fairlx_work_item_list", arguments: JSON.stringify({ projectId: "p1", type: "TASK" }) },
    ];
    const { calls: next, coalescedIds } = collapseWorkItemListFanOut(calls);
    expect(JSON.parse(next[0]!.arguments)).toEqual({ projectId: "p1" });
    expect(JSON.parse(next[1]!.arguments)).toEqual({ projectId: "p1" });
    expect([...coalescedIds]).toEqual(["c2"]);
  });
});

describe("collapseRedundantReadFanOut", () => {
  it("keeps one work-item get and four page fetches per step", () => {
    const calls: AgentToolCall[] = [
      { id: "g1", name: "fairlx_work_item_get", arguments: JSON.stringify({ workItemId: "SCHO-1" }) },
      { id: "g2", name: "fairlx_work_item_get", arguments: JSON.stringify({ workItemId: "SCHO-2" }) },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `f${index}`,
        name: "web_fetch",
        arguments: JSON.stringify({ url: `https://example.com/${index}` }),
      })),
    ];
    const { skipIds } = collapseRedundantReadFanOut(calls);
    expect(skipIds.has("g1")).toBe(false);
    expect(skipIds.has("g2")).toBe(true);
    expect(skipIds.has("f0")).toBe(false);
    expect(skipIds.has("f3")).toBe(false);
    expect(skipIds.has("f4")).toBe(true);
  });
});

describe("documentationWriteTools", () => {
  it("narrows to document tools so a full context can still save a PRD", () => {
    const tools = ["web_fetch", "fairlx_doc_create", "fairlx_work_item_get", "fairlx_doc_list"].map((name) => ({
      function: { name },
    }));
    expect(documentationWriteTools(tools).map((tool) => tool.function.name)).toEqual([
      "fairlx_doc_create",
      "fairlx_doc_list",
    ]);
  });
});
