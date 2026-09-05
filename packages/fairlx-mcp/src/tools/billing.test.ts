import { describe, expect, it } from "vitest";
import { jwtToAuthContext } from "../auth/context";
import type { McpQuery, McpRuntime } from "../runtime/types";
import { callTool } from "./index";
import { displayModelName, purposeLabel, summarizeUsageEvents } from "./billing";

describe("usage event summarizer", () => {
  it("splits Grok vs Luna spend and agent vs docs purpose", () => {
    const summary = summarizeUsageEvents([
      {
        workspaceId: "ws_1",
        resourceType: "compute",
        source: "ai",
        units: 8388,
        metadata: JSON.stringify({
          operation: "agent_chat",
          module: "ai",
          displayName: "Grok 4.6",
          model: "grok-4.6",
          promptTokens: 8000,
          completionTokens: 388,
          cachedTokens: 0,
          totalTokens: 8388,
          costUSD: 0.0187,
          billed: true,
        }),
      },
      {
        workspaceId: "ws_1",
        resourceType: "compute",
        source: "ai",
        units: 20353,
        metadata: {
          operation: "agent_chat",
          module: "ai",
          displayName: "GPT-5.6 Luna",
          model: "gpt-5.6-luna",
          promptTokens: 19000,
          completionTokens: 1353,
          cachedTokens: 14000,
          totalTokens: 20353,
          costUSD: 0.0023,
          billed: true,
        },
      },
      {
        workspaceId: "ws_1",
        resourceType: "compute",
        source: "ai",
        units: 1200,
        metadata: JSON.stringify({
          module: "docs",
          model: "gpt-5.6-luna",
          totalTokens: 1200,
          costUSD: 0.001,
          billed: true,
        }),
      },
      {
        workspaceId: "ws_1",
        resourceType: "traffic",
        source: "api",
        units: 5000,
      },
    ]);
    expect(summary.totals.billedUSD).toBeCloseTo(0.022);
    expect(summary.byModel.map((item) => item.label)).toEqual(["Grok 4.6", "GPT-5.6 Luna"]);
    const grok = summary.byModel.find((item) => item.label === "Grok 4.6");
    const luna = summary.byModel.find((item) => item.label === "GPT-5.6 Luna");
    expect(grok?.billedUSD).toBeCloseTo(0.0187);
    expect(luna?.billedUSD).toBeCloseTo(0.0033);
    expect(luna?.tokens).toBe(21553);
    expect(summary.byPurpose.find((item) => item.label === "Agent chat")?.events).toBe(2);
    expect(summary.byPurpose.find((item) => item.label === "Project docs AI")?.billedUSD).toBeCloseTo(0.001);
  });

  it("maps model ids onto product names", () => {
    expect(displayModelName("grok-4.6")).toBe("Grok 4.6");
    expect(displayModelName("gpt-5.6-luna")).toBe("GPT-5.6 Luna");
    expect(displayModelName("DeepSeek-V4-Flash")).toBe("DeepSeek V4 Flash");
  });

  it("labels agent chat separately from generic AI", () => {
    expect(purposeLabel({ source: "ai" }, { operation: "agent_chat" })).toBe("Agent chat");
    expect(purposeLabel({ source: "ai", module: "docs" }, { module: "docs" })).toBe("Project docs AI");
  });
});

function billingRuntime() {
  const members = [{ $id: "mem_1", workspaceId: "ws_1", userId: "admin_1", role: "ADMIN" }];
  const workspaces = [{ $id: "ws_1", name: "School Stacker", organizationId: "org_1" }];
  const organizations = [{ $id: "org_1", name: "Agent Test Org" }];
  const wallets = [
    {
      $id: "wal_1",
      organizationId: "org_1",
      balance: -0.08,
      lockedBalance: 0,
      currency: "USD",
      status: "active",
    },
  ];
  const events = [
    {
      $id: "e1",
      workspaceId: "ws_1",
      resourceType: "compute",
      source: "ai",
      units: 8388,
      timestamp: "2026-09-05T10:00:00.000Z",
      metadata: JSON.stringify({
        operation: "agent_chat",
        displayName: "Grok 4.6",
        model: "grok-4.6",
        totalTokens: 8388,
        costUSD: 0.0187,
        billed: true,
      }),
    },
    {
      $id: "e2",
      workspaceId: "ws_1",
      resourceType: "compute",
      source: "ai",
      units: 20353,
      timestamp: "2026-09-05T12:00:00.000Z",
      metadata: JSON.stringify({
        operation: "agent_chat",
        displayName: "GPT-5.6 Luna",
        model: "gpt-5.6-luna",
        totalTokens: 20353,
        costUSD: 0.0023,
        billed: true,
      }),
    },
  ];

  const runtime = {
    collections: {
      members: "members",
      workspaces: "workspaces",
      organizations: "organizations",
      organizationMembers: "organization_members",
      usageEvents: "usage_events",
      wallets: "wallets",
    },
    store: {
      list: async (collection: string, queries: McpQuery[]) => {
        let filtered: Record<string, unknown>[] =
          collection === "usage_events"
            ? events
            : collection === "wallets"
              ? wallets
              : collection === "workspaces"
                ? workspaces
                : collection === "organizations"
                  ? organizations
                  : members;
        for (const query of queries) {
          if (query.type === "equal" && query.field) {
            const value = query.value;
            filtered = filtered.filter((doc) => {
              const current = doc[query.field];
              return Array.isArray(value) ? value.includes(current as string) : current === value;
            });
          }
          if (query.type === "greaterThanEqual" && query.field) {
            filtered = filtered.filter((doc) => String(doc[query.field] ?? "") >= String(query.value));
          }
          if (query.type === "lessThan" && query.field) {
            filtered = filtered.filter((doc) => String(doc[query.field] ?? "") < String(query.value));
          }
        }
        return { documents: filtered, total: filtered.length };
      },
      get: async (collection: string, id: string) => {
        const pool = collection === "organizations" ? organizations : workspaces;
        const doc = pool.find((item) => item.$id === id);
        if (!doc) throw new Error("missing");
        return doc;
      },
      create: async () => {
        throw new Error("unused");
      },
      update: async () => {
        throw new Error("unused");
      },
      delete: async () => {
        throw new Error("unused");
      },
    },
    resolveUserOrgAccess: async () => ({
      isOwner: true,
      role: "OWNER",
      permissions: ["org.billing.view"],
      hasDepartmentAccess: true,
    }),
  } as unknown as McpRuntime;

  return runtime;
}

describe("fairlx_usage_summary", () => {
  it("returns org wallet plus Grok and Luna totals", async () => {
    const auth = jwtToAuthContext("admin_1", {
      workspaceId: "ws_1",
      organizationId: "org_1",
      scopes: ["billing:read", "project:read"],
    });
    const result = await callTool(
      "fairlx_usage_summary",
      { scope: "organization", period: "2026-09" },
      billingRuntime(),
      auth,
    );
    const text = result.content[0] && "text" in result.content[0] ? result.content[0].text : "";
    const payload = JSON.parse(text) as {
      organizationName?: string;
      wallet?: { balance: number };
      byModel?: Array<{ label: string; billedUSD: number }>;
      totals?: { billedUSD: number };
    };
    expect(payload.organizationName).toBe("Agent Test Org");
    expect(payload.wallet?.balance).toBeCloseTo(-0.08);
    expect(payload.totals?.billedUSD).toBeCloseTo(0.021);
    expect(payload.byModel?.map((item) => item.label)).toEqual(["Grok 4.6", "GPT-5.6 Luna"]);
  });
});
