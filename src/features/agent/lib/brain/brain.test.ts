import { describe, expect, it } from "vitest";

import { compressMessages, estimatedFittedTokens, fitMessagesForModel } from "./compress";
import { wantedToolNames, selectToolsForTurn } from "./select";
import { factsFromTurn, mergeStateKnowledge } from "./write";
import { filterToolsForSpecialist } from "./isolate";
import type { AgentChatMessage } from "../../types";
import type { SelectableTool } from "./select";

function tool(name: string): SelectableTool {
  return { type: "function", function: { name, description: name, parameters: { type: "object", properties: {} } } };
}

describe("selectToolsForTurn", () => {
  it("keeps mail tools for send-mail prompts and drops unrelated catalog noise", () => {
    const tools = [
      tool("mail_send"),
      tool("fairlx_work_item_get"),
      tool("github_open_pr"),
      tool("security_review"),
      tool("delegate_agent"),
      tool("fairlx_sprint_delete"),
    ];
    const selected = selectToolsForTurn(tools, "Send a mail about WEB-12 to the client");
    const names = selected.map((item) => item.function.name);
    expect(names).toContain("mail_send");
    expect(names).toContain("delegate_agent");
    expect(wantedToolNames("Send a mail about WEB-12").has("mail_send")).toBe(true);
  });

  it("always keeps core Fairlx MCP board tools", () => {
    const names = wantedToolNames("hello");
    expect(names.has("fairlx_work_item_bulk_update")).toBe(true);
    expect(names.has("fairlx_sprint_list")).toBe(true);
    expect(names.has("fairlx_work_item_update")).toBe(true);
  });

  it("keeps invite tools and drops mail_send for add-by-email-id prompts", () => {
    const query =
      "add fogef to the project and this mail id is fogefe9321@94an.com and team is developer";
    const names = wantedToolNames(query);
    expect(names.has("fairlx_workspace_member_add")).toBe(true);
    expect(names.has("fairlx_project_member_add")).toBe(true);
    expect(names.has("fairlx_project_team_member_add")).toBe(true);
    expect(names.has("fairlx_project_team_list")).toBe(true);
    expect(names.has("mail_send")).toBe(false);
  });

  it("keeps bulk assign tools for unassign-all and assign-sprint prompts", () => {
    const names = wantedToolNames(
      "remove all assignees for all work items in all sprints and assign all workitems in sprint 1 to Fogef only",
    );
    expect(names.has("fairlx_work_item_bulk_update")).toBe(true);
    expect(names.has("fairlx_sprint_list")).toBe(true);
  });

  it("keeps sprint create tools for planning prompts", () => {
    const names = wantedToolNames("Plan all sprints, work items, and epics from the spec");
    expect(names.has("fairlx_sprint_create")).toBe(true);
    expect(names.has("fairlx_work_item_create")).toBe(true);
    expect(names.has("fairlx_work_item_bulk_update")).toBe(true);
  });

  it("keeps sprint list and work-item delete for backlog delete prompts", () => {
    const names = wantedToolNames("delete all work items in the backlog");
    expect(names.has("fairlx_work_item_list")).toBe(true);
    expect(names.has("fairlx_sprint_list")).toBe(true);
    expect(names.has("fairlx_work_item_delete")).toBe(true);
  });

  it("keeps GitHub write tools for PR prompts", () => {
    const names = wantedToolNames("open a pull request for the login fix");
    expect(names.has("github_open_pr")).toBe(true);
    expect(names.has("github_write_file")).toBe(true);
  });

  it("selects organization tools when asked for the org name", () => {
    const names = wantedToolNames("what is the organization name?");
    expect(names.has("fairlx_organization_get")).toBe(true);
    expect(names.has("fairlx_organization_list")).toBe(true);
  });

  it("selects usage summary for billing and org-bill prompts", () => {
    expect(wantedToolNames("tell me org bill").has("fairlx_usage_summary")).toBe(true);
    expect(wantedToolNames("how much billing usage did Grok and Luna use").has("fairlx_usage_summary")).toBe(true);
  });

  it("selects documentation tools for create-docs prompts", () => {
    const names = wantedToolNames("create project documentation for this app");
    expect(names.has("fairlx_doc_create")).toBe(true);
    expect(names.has("fairlx_doc_list")).toBe(true);
    expect(names.has("web_search")).toBe(true);
    expect(names.has("web_fetch")).toBe(true);
    expect(names.has("github_list_files")).toBe(true);
    expect(names.has("fairlx_work_item_get")).toBe(false);
  });

  it("drops github read tools for documentation when no repo is linked", () => {
    const tools = ["fairlx_doc_create", "github_list_files", "github_read_file", "code_inspect", "fairlx_work_item_list"].map(
      (name) => tool(name),
    );
    const selected = selectToolsForTurn(tools, "create project documentation for this app", { hasGithubRepo: false });
    const names = selected.map((item) => item.function.name);
    expect(names).toContain("fairlx_doc_create");
    expect(names).not.toContain("github_list_files");
    expect(names).not.toContain("github_read_file");
  });
});

describe("compressMessages", () => {
  it("compresses old tool results and keeps recent ones", () => {
    const messages: AgentChatMessage[] = Array.from({ length: 12 }, (_, index) => ({
      id: String(index),
      role: index % 2 === 0 ? "user" : "tool",
      content: index % 2 === 0 ? "hi" : JSON.stringify({ items: [1, 2, 3], title: "x" }),
      toolCallId: index % 2 ? `c${index}` : undefined,
      toolName: index % 2 ? "fairlx_work_item_list" : undefined,
      createdAt: new Date().toISOString(),
    }));
    const compressed = compressMessages(messages);
    const oldTool = compressed[1];
    const recentTool = compressed[compressed.length - 1];
    expect(oldTool?.content).toContain("compressed");
    expect(recentTool?.content).toContain("items");
  });
});

describe("fitMessagesForModel", () => {
  it("keeps Wikipedia-sized research fetches under a 72k Grok window", () => {
    const blob = "W".repeat(20_000);
    const messages: AgentChatMessage[] = Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      role: index % 2 ? "tool" : "assistant",
      content: index % 2 ? JSON.stringify({ url: "https://en.wikipedia.org/wiki/X", text: blob }) : "fetching",
      toolCallId: index % 2 ? `c${index}` : undefined,
      toolName: index % 2 ? "web_fetch" : undefined,
      createdAt: new Date().toISOString(),
    }));
    const fitted = fitMessagesForModel("system prompt", messages, 8_000);
    const chars = fitted.reduce((sum, message) => sum + (message.content?.length ?? 0), 0);
    expect(chars).toBeLessThan(8_000 * 4 * 0.72);
    expect(estimatedFittedTokens("system prompt", messages, 8_000)).toBeLessThan(8_000);
    expect(estimatedFittedTokens("system prompt", messages, 72_000)).toBeLessThan(72_000);
  });
});

describe("isolate", () => {
  it("gives git specialists github tools and strips delegate_agent", () => {
    const filtered = filterToolsForSpecialist(
      [tool("delegate_agent"), tool("github_read_file"), tool("mail_send"), tool("git_status")],
      "git",
    );
    const names = filtered.map((item) => item.function.name);
    expect(names).toContain("github_read_file");
    expect(names).toContain("git_status");
    expect(names).not.toContain("delegate_agent");
    expect(names).not.toContain("mail_send");
  });

  it("gives builder GitHub write tools, sprint writes, and not mail", () => {
    const filtered = filterToolsForSpecialist(
      [
        tool("delegate_agent"),
        tool("github_write_file"),
        tool("github_open_pr"),
        tool("mail_send"),
        tool("fairlx_sprint_create"),
        tool("fairlx_work_item_create"),
      ],
      "builder",
    );
    const names = filtered.map((item) => item.function.name);
    expect(names).toContain("github_write_file");
    expect(names).toContain("github_open_pr");
    expect(names).toContain("fairlx_sprint_create");
    expect(names).toContain("fairlx_work_item_create");
    expect(names).not.toContain("mail_send");
    expect(names).not.toContain("delegate_agent");
  });

  it("lets researchers read Fairlx records but not create documents", () => {
    const filtered = filterToolsForSpecialist(
      [
        tool("delegate_agent"),
        tool("fairlx_doc_list"),
        tool("fairlx_doc_create"),
        tool("web_search"),
        tool("web_fetch"),
        tool("fairlx_work_item_list"),
      ],
      "researcher",
    );
    const names = filtered.map((item) => item.function.name);
    expect(names).toContain("fairlx_doc_list");
    expect(names).toContain("web_search");
    expect(names).toContain("web_fetch");
    expect(names).not.toContain("fairlx_doc_create");
  });
});

describe("write facts", () => {
  it("merges STATE knowledge from tool outcomes", () => {
    const facts = factsFromTurn([
      {
        id: "t1",
        role: "tool",
        toolName: "mail_send",
        content: JSON.stringify({ sent: true, to: "ada@x.com" }),
        createdAt: new Date().toISOString(),
      },
    ]);
    expect(facts.some((fact) => /Mail sent/.test(fact))).toBe(true);
    const knowledge = mergeStateKnowledge([], facts);
    expect(knowledge[0]?.title).toBe("Agent STATE");
  });
});
