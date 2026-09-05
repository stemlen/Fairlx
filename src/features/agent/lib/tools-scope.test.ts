import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentContext } from "../types";
import { defaultHarnessData } from "./harness";
import { applyScopeDefaults, openaiToolsForTurn, trainingSaveTool } from "./tools";
import { DEFAULT_ENABLED_TOOLS } from "../constants";

function context(): AgentContext {
  return {
    user: { id: "u1", name: "Ada", email: "ada@fairlx.dev" },
    workspaces: [{ id: "w1", name: "Acme" }],
    projects: [{ id: "p1", name: "Website", workspaceId: "w1", key: "WEB" }],
    workItems: [{ id: "i1", title: "Fix login", workspaceId: "w1", projectId: "p1", key: "WEB-1", status: "TODO" }],
    notifications: [],
    githubRepos: [{ id: "r1", repositoryName: "acme", owner: "acme", branch: "main", workspaceId: "w1", projectId: "p1" }],
    integrations: [],
    docs: [{ id: "d1", title: "API docs", workspaceId: "w1", projectId: "p1" }],
  };
}

function ctx(overrides: Partial<Parameters<typeof applyScopeDefaults>[1]> = {}): Parameters<typeof applyScopeDefaults>[1] {
  const data = defaultHarnessData();
  return {
    runId: "run1",
    userId: "u1",
    context: context(),
    harness: { ...data, id: "h1", userId: "u1", updatedAt: new Date().toISOString() },
    mcp: { mcpServers: {} },
    runs: [],
    workspaceId: "w1",
    projectId: "p1",
    ...overrides,
  };
}

describe("applyScopeDefaults", () => {
  it("fills missing workspaceId and projectId from context", () => {
    const next = applyScopeDefaults({}, ctx());
    expect(next.workspaceId).toBe("w1");
    expect(next.projectId).toBe("p1");
  });

  it("resolves workspace names and project keys to ids", () => {
    const next = applyScopeDefaults({ workspaceId: "Acme", projectId: "WEB" }, ctx());
    expect(next.workspaceId).toBe("w1");
    expect(next.projectId).toBe("p1");
  });

  it("does not substitute unmatched ids", () => {
    const next = applyScopeDefaults(
      { workspaceId: "other-ws", projectId: "other-proj" },
      ctx(),
    );
    expect(next.workspaceId).toBe("other-ws");
    expect(next.projectId).toBe("other-proj");
  });
});

describe("openaiToolsForTurn", () => {
  it("hides database_query and list stubs when Fairlx MCP list tools exist", () => {
    const tools = openaiToolsForTurn({
      mode: "agent",
      enabledTools: [...DEFAULT_ENABLED_TOOLS],
      mcpTools: [
        {
          name: "fairlx_work_item_list",
          description: "List work items",
          inputSchema: { type: "object", properties: { projectId: { type: "string" } } },
        },
        {
          name: "fairlx_workspace_list",
          description: "List workspaces",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "fairlx_project_list",
          description: "List projects",
          inputSchema: { type: "object", properties: { workspaceId: { type: "string" } } },
        },
      ],
    });
    const names = tools.map((tool) => tool.function.name);
    expect(names).toContain("fairlx_work_item_list");
    expect(names).not.toContain("database_query");
    expect(names).not.toContain("list_work_items");
    expect(names).not.toContain("list_workspaces");
    expect(names).not.toContain("list_projects");
  });

  it("hides native create_project when Fairlx MCP create exists", () => {
    const tools = openaiToolsForTurn({
      mode: "agent",
      enabledTools: [...DEFAULT_ENABLED_TOOLS],
      mcpTools: [
        {
          name: "fairlx_project_create",
          description: "Create a project",
          inputSchema: { type: "object", properties: { name: { type: "string" } } },
        },
      ],
    });
    const names = tools.map((tool) => tool.function.name);
    expect(names).toContain("fairlx_project_create");
    expect(names).not.toContain("create_project");
  });

  it("does not expose save_personal_agent on normal agent turns", () => {
    const tools = openaiToolsForTurn({
      mode: "agent",
      enabledTools: [...DEFAULT_ENABLED_TOOLS],
      mcpTools: [],
    });
    expect(tools.map((tool) => tool.function.name)).not.toContain("save_personal_agent");
    expect(trainingSaveTool().function.name).toBe("save_personal_agent");
  });
});
