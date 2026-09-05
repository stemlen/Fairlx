import { describe, expect, it } from "vitest";

import {
  calculateContextUsage,
  chatTokenTotal,
  formatTokenCount,
  formatTokenHeader,
  latestContextMeter,
  estimateTokensFromText,
  takeHigherChatPeak,
} from "./context-meter";
import type { AgentHarness, AgentRun, AgentSkill } from "../types";
import { DEFAULT_ENABLED_TOOLS } from "../constants";

function harness(overrides: Partial<AgentHarness> = {}): AgentHarness {
  return {
    id: "h1",
    userId: "u1",
    skills: [],
    automations: [],
    knowledge: [],
    workPatterns: [],
    settings: {
      mode: "agent",
      enabledTools: [...DEFAULT_ENABLED_TOOLS],
      sessionMode: "agent",
    },
    gitStaging: { items: [], updatedAt: new Date(0).toISOString() },
    chatMeta: { pinnedRunIds: [], archivedRunIds: [] },
    plugins: [],
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function tokens(usage: ReturnType<typeof calculateContextUsage>, id: string) {
  return usage.categories.find((c) => c.id === id)?.tokens ?? 0;
}

describe("context-meter", () => {
  describe("formatTokenCount", () => {
    it("formats zero and negative numbers", () => {
      expect(formatTokenCount(0)).toBe("0");
      expect(formatTokenCount(-5)).toBe("0");
    });

    it("formats small token counts without K suffix", () => {
      expect(formatTokenCount(194)).toBe("194");
      expect(formatTokenCount(732)).toBe("732");
      expect(formatTokenCount(888)).toBe("888");
      expect(formatTokenCount(999)).toBe("999");
    });

    it("formats thousands below 10K with exact counts", () => {
      expect(formatTokenCount(1100)).toBe("1,100");
      expect(formatTokenCount(2400)).toBe("2,400");
      expect(formatTokenCount(3200)).toBe("3,200");
      expect(formatTokenCount(3461)).toBe("3,461");
      expect(formatTokenCount(3491)).toBe("3,491");
    });

    it("formats 10K and above with K suffix", () => {
      expect(formatTokenCount(10300)).toBe("10.3K");
      expect(formatTokenCount(88500)).toBe("88.5K");
      expect(formatTokenCount(109300)).toBe("109.3K");
      expect(formatTokenCount(256000)).toBe("256K");
    });

    it("formats millions with M suffix", () => {
      expect(formatTokenCount(1000000)).toBe("1M");
      expect(formatTokenCount(1500000)).toBe("1.5M");
      expect(formatTokenCount(2000000)).toBe("2M");
    });
  });

  describe("formatTokenHeader", () => {
    it("formats small and large token headers", () => {
      expect(formatTokenHeader(194, 64000)).toBe("194 / 64K Tokens");
      expect(formatTokenHeader(3461, 64000)).toBe("3,461 / 64K Tokens");
      expect(formatTokenHeader(109300, 256000)).toBe("~109.3K / 256K Tokens");
    });
  });

  describe("takeHigherChatPeak", () => {
    it("keeps the larger chat peak", () => {
      expect(chatTokenTotal(takeHigherChatPeak({ conversation: 8000, summarized_conversation: 2000 }, { conversation: 1469, summarized_conversation: 1655 }))).toBe(10000);
    });
  });

  describe("calculateContextUsage", () => {
    it("returns all 8 categories with expected colors", () => {
      const usage = calculateContextUsage({});
      expect(usage.categories).toHaveLength(8);

      const categoryIds = usage.categories.map((c) => c.id);
      expect(categoryIds).toEqual([
        "system_prompt",
        "tool_definitions",
        "rules",
        "skills",
        "mcp_dynamic_tools",
        "subagent_definitions",
        "summarized_conversation",
        "conversation",
      ]);

      const categoryNames = usage.categories.map((c) => c.name);
      expect(categoryNames).toEqual([
        "System prompt",
        "Tool definitions",
        "Rules",
        "Skills",
        "MCP & dynamic tools",
        "Subagent definitions",
        "Summarized conversation",
        "Conversation",
      ]);

      expect(usage.totalTokens).toBe(0);
      expect(usage.maxTokens).toBe(64000);
      expect(usage.percentFull).toBe(0);
    });

    it("resets conversation on a new chat", () => {
      const usage = calculateContextUsage({});
      expect(tokens(usage, "conversation")).toBe(0);
      expect(tokens(usage, "summarized_conversation")).toBe(0);
      expect(usage.totalTokens).toBe(0);
      expect(usage.percentFull).toBe(0);
    });

    it("does not carry previous-run meter into a new chat", () => {
      const previous: AgentRun = {
        id: "old-run",
        userId: "user-1",
        title: "Old",
        prompt: "previous work",
        status: "completed",
        mode: "agent",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "A".repeat(4000),
            createdAt: new Date().toISOString(),
          },
        ],
        events: [
          {
            id: "e1",
            type: "context_meter",
            title: "Context",
            payload: {
              tokens: 17200,
              maxInputTokens: 64000,
              subagents: 0,
              breakdown: {
                system_prompt: 1100,
                tool_definitions: 10300,
                rules: 2400,
                skills: 2000,
                mcp_dynamic_tools: 732,
                subagent_definitions: 676,
                summarized_conversation: 0,
                conversation: 8000,
              },
            },
            createdAt: new Date().toISOString(),
            runId: "old-run",
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const previousUsage = calculateContextUsage({ run: previous });
      const freshUsage = calculateContextUsage({});

      expect(tokens(previousUsage, "conversation")).toBeGreaterThan(0);
      expect(tokens(freshUsage, "conversation")).toBe(0);
      expect(tokens(freshUsage, "summarized_conversation")).toBe(0);
      expect(tokens(freshUsage, "tool_definitions")).toBe(0);
      expect(tokens(freshUsage, "skills")).toBe(0);
      expect(freshUsage.totalTokens).toBe(0);
    });

    it("counts enabled skills only after a skill is loaded", () => {
      const longInstructions = "Prefer existing Fairlx UI components and tokens. ".repeat(30);
      const skill: AgentSkill = {
        id: "s1",
        name: "Frontend",
        description: "UI work",
        instructions: longInstructions,
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      const h = harness({ skills: [skill] });
      const unused = calculateContextUsage({
        harness: h,
        draftPrompt: "hello",
      });
      const loaded = calculateContextUsage({
        harness: h,
        run: {
          id: "run-skill",
          userId: "user-1",
          title: "Skill",
          prompt: "use frontend",
          status: "running",
          mode: "agent",
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "",
              toolCalls: [{ id: "c1", name: "use_skill", arguments: "{}" }],
              createdAt: new Date().toISOString(),
            },
          ],
          events: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      expect(tokens(unused, "skills")).toBe(0);
      expect(tokens(loaded, "skills")).toBe(estimateTokensFromText(`Frontend\nUI work\n${longInstructions}`));
    });

    it("accounts for draft prompt in conversation tokens", () => {
      const usageWithoutDraft = calculateContextUsage({ draftPrompt: "" });
      const promptText = "Please write a full stack application with authentication and tests.";
      const usageWithDraft = calculateContextUsage({ draftPrompt: promptText });

      expect(tokens(usageWithoutDraft, "conversation")).toBe(0);
      expect(tokens(usageWithDraft, "conversation")).toBe(estimateTokensFromText(promptText));
      expect(usageWithDraft.totalTokens).toBeGreaterThan(usageWithoutDraft.totalTokens);
    });

    it("shows a longer draft as a higher formatted total than a short hi", () => {
      const hi = calculateContextUsage({
        harness: harness(),
        draftPrompt: "hi",
      });
      const longer = calculateContextUsage({
        harness: harness(),
        draftPrompt: "Please explain the Fairlx agent context meter and how conversation tokens are counted in detail. ".repeat(8),
      });
      expect(longer.totalTokens).toBeGreaterThan(hi.totalTokens);
      expect(formatTokenHeader(hi.totalTokens, hi.maxTokens)).not.toBe(
        formatTokenHeader(longer.totalTokens, longer.maxTokens),
      );
    });

    it("uses run messages and model context window", () => {
      const mockRun: AgentRun = {
        id: "run-1",
        userId: "user-1",
        title: "Test Run",
        prompt: "Initial prompt",
        status: "completed",
        mode: "agent",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "Build an issue tracker feature",
            createdAt: new Date().toISOString(),
          },
          {
            id: "msg-2",
            role: "assistant",
            content: "Here is the implementation plan for the issue tracker feature...",
            createdAt: new Date().toISOString(),
          },
        ],
        events: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const usage = calculateContextUsage({
        run: mockRun,
        maxInputTokens: 128000,
      });

      expect(usage.maxTokens).toBe(128000);
      expect(tokens(usage, "conversation")).toBeGreaterThan(0);
    });

    it("moves compacted tool results into summarized instead of shrinking the total", () => {
      const now = new Date().toISOString();
      const fatTool = JSON.stringify({
        items: Array.from({ length: 40 }, (_, index) => ({
          id: `item-${index}`,
          title: `Work item ${index} with a descriptive title`,
        })),
      });
      const makeRun = (extraCount: number): AgentRun => ({
        id: "compress-run",
        userId: "user-1",
        title: "Compress",
        prompt: "list items",
        status: "completed",
        mode: "agent",
        messages: [
          { id: "u0", role: "user", content: "list work items", createdAt: now },
          {
            id: "t0",
            role: "tool",
            content: fatTool,
            toolName: "fairlx_work_item_list",
            toolCallId: "c0",
            createdAt: now,
          },
          ...Array.from({ length: 7 + extraCount }, (_, index) => ({
            id: `u${index + 1}`,
            role: "user" as const,
            content: `follow up ${index}`,
            createdAt: now,
          })),
        ],
        events: [],
        createdAt: now,
        updatedAt: now,
      });

      const before = calculateContextUsage({ run: makeRun(0) });
      const after = calculateContextUsage({ run: makeRun(1) });
      expect(tokens(after, "summarized_conversation")).toBeGreaterThan(tokens(before, "summarized_conversation"));
      expect(after.totalTokens).toBeGreaterThanOrEqual(before.totalTokens);
    });

    it("keeps truncated stored messages as summarized using the last context_meter", () => {
      const now = new Date().toISOString();
      const fullContent = "Please build a complete issue tracker with auth, tests, and docs. ".repeat(40);
      const fullRun: AgentRun = {
        id: "trunc-run",
        userId: "user-1",
        title: "Trunc",
        prompt: fullContent,
        status: "completed",
        mode: "agent",
        messages: [{ id: "u1", role: "user", content: fullContent, createdAt: now }],
        events: [],
        createdAt: now,
        updatedAt: now,
      };
      const full = calculateContextUsage({ run: fullRun });
      const truncated: AgentRun = {
        ...fullRun,
        messages: [{ id: "u1", role: "user", content: "hi", createdAt: now }],
        events: [
          {
            id: "meter",
            type: "context_meter",
            title: "Context",
            payload: {
              tokens: full.totalTokens,
              maxInputTokens: 64000,
              subagents: 0,
              breakdown: Object.fromEntries(full.categories.map((cat) => [cat.id, cat.tokens])),
            },
            createdAt: now,
            runId: "trunc-run",
          },
        ],
      };
      const after = calculateContextUsage({ run: truncated });
      expect(tokens(after, "summarized_conversation")).toBeGreaterThan(0);
      expect(after.totalTokens).toBeGreaterThanOrEqual(full.totalTokens);
    });

    it("restores chat tokens from a persisted peak after stored messages shrink", () => {
      const now = new Date().toISOString();
      const truncated: AgentRun = {
        id: "refresh-run",
        userId: "user-1",
        title: "Refresh",
        prompt: "hi",
        status: "completed",
        mode: "agent",
        messages: [{ id: "u1", role: "user", content: "hi", createdAt: now }],
        events: [],
        contextPeak: { conversation: 8000, summarized_conversation: 2000 },
        createdAt: now,
        updatedAt: now,
      };
      const usage = calculateContextUsage({ run: truncated });
      expect(tokens(usage, "conversation") + tokens(usage, "summarized_conversation")).toBe(10000);
      expect(tokens(usage, "summarized_conversation")).toBeGreaterThan(2000);
    });

    it("omits tool definitions in ask mode", () => {
      const usage = calculateContextUsage({
        harness: harness({
          settings: {
            mode: "manual",
            enabledTools: [...DEFAULT_ENABLED_TOOLS],
            sessionMode: "ask",
          },
        }),
        draftPrompt: "What is the sprint status?",
      });
      expect(tokens(usage, "tool_definitions")).toBe(0);
      expect(tokens(usage, "mcp_dynamic_tools")).toBe(0);
    });
  });

  describe("latestContextMeter", () => {
    it("parses context_meter event from run events", () => {
      const events = [
        {
          id: "e1",
          type: "context_meter" as const,
          title: "Context",
          payload: {
            tokens: 15400,
            maxInputTokens: 128000,
            subagents: 2,
          },
          createdAt: new Date().toISOString(),
          runId: "r1",
        },
      ];

      const meter = latestContextMeter(events);
      expect(meter).toBeDefined();
      expect(meter?.tokens).toBe(15400);
      expect(meter?.maxInputTokens).toBe(128000);
      expect(meter?.subagents).toBe(2);
    });
  });
});
