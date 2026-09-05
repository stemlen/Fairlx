import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "./prompt";
import { searchAgentIndex } from "./search";
import { commitStaged, emptyChatMeta, emptyGitStaging, stageItem, unstageItem } from "./git-staging";
import { resolveSpecialist, buildContextGraph } from "./graph";
import { readPersonalContent } from "./personal";
import { defaultHarnessData } from "./harness";
import { groupConversationTurns, groupTranscript, summarizeToolResult, visibleThoughtLines } from "./transcript";
import { composeUserPrompt, displayUserContent, AGENT_SESSION_MODES, trainingSaveReady } from "./session-context";
import { trainingKickoffPrompt } from "./personal-training";
import { compileFairlxListIntent } from "./intent-compiler";
import type { AgentContext, AgentRun } from "../types";

function harness() {
  const data = defaultHarnessData();
  return {
    ...data,
    id: "h1",
    userId: "u1",
    updatedAt: new Date().toISOString(),
    knowledge: [
      {
        id: "k1",
        title: "Release checklist",
        content: "Always run tests before shipping.",
        createdAt: new Date().toISOString(),
      },
    ],
    automations: [
      {
        id: "a1",
        name: "Triage bugs",
        description: "Summarize new bugs",
        trigger: "New high-priority bug",
        action: "Inspect the item and draft a fix plan",
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function context(): AgentContext {
  return {
    user: { id: "u1", name: "Ada", email: "ada@fairlx.dev" },
    workspaces: [{ id: "w1", name: "Acme", organizationId: "org_1" }],
    organizations: [{ id: "org_1", name: "Stemlen", role: "ADMIN" }],
    projects: [{ id: "p1", name: "Website", workspaceId: "w1", key: "WEB" }],
    workItems: [{ id: "i1", title: "Fix login", workspaceId: "w1", projectId: "p1", key: "WEB-1", status: "TODO" }],
    notifications: [],
    githubRepos: [{ id: "r1", repositoryName: "acme", owner: "acme", branch: "main", workspaceId: "w1", projectId: "p1" }],
    integrations: [],
    docs: [{ id: "d1", title: "API docs", workspaceId: "w1", projectId: "p1" }],
  };
}

function run(prompt = "Plan the login fix"): AgentRun {
  return {
    id: "run1",
    userId: "u1",
    title: prompt,
    prompt,
    status: "running",
    mode: "agent",
    workspaceId: "w1",
    projectId: "p1",
    messages: [{ id: "m1", role: "user", content: prompt, createdAt: new Date().toISOString() }],
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("agent search", () => {
  it("ranks projects and knowledge for a query", () => {
    const hits = searchAgentIndex({
      query: "login",
      context: context(),
      harness: harness(),
      runs: [run("Fix login")],
    });
    expect(hits.some((hit) => hit.kind === "work_item" && hit.title === "Fix login")).toBe(true);
    expect(hits.some((hit) => hit.kind === "run")).toBe(true);
  });
});

describe("git staging", () => {
  it("stages, unstages, and plans a commit", () => {
    let staging = emptyGitStaging();
    staging = stageItem(staging, { path: "src/app.ts", summary: "wire search" });
    expect(staging.items[0]?.status).toBe("staged");
    staging = unstageItem(staging, "src/app.ts");
    expect(staging.items[0]?.status).toBe("unstaged");
    staging = stageItem(staging, { path: "src/app.ts" });
    const planned = commitStaged(staging, "Add search");
    expect(planned.committed).toHaveLength(1);
    expect(planned.staging.items[0]?.status).toBe("committed");
  });
});

describe("graph and prompt", () => {
  it("routes git prompts to the git specialist", () => {
    expect(resolveSpecialist("stage the login change and plan a commit")).toBe("git");
  });

  it("routes mail and security prompts to isolated specialists", () => {
    expect(resolveSpecialist("Send a mail about WEB-12 to the client")).toBe("ops");
    expect(resolveSpecialist("security review this repo for xss")).toBe("security");
  });

  it("routes plan-a-feature prompts to the planner", () => {
    expect(resolveSpecialist("Plan a new feature for the current Fairlx workspace.")).toBe("planner");
  });

  it("builds a context graph and system prompt with automations and knowledge", () => {
    const h = harness();
    const graph = buildContextGraph({
      harness: h,
      context: context(),
      run: run(),
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
    });
    expect(graph.nodes.some((node) => node.kind === "workspace")).toBe(true);
    const prompt = buildSystemPrompt({
      harness: h,
      context: context(),
      run: run("New high-priority bug on login"),
      mcp: { mcpServers: { "fairlx-personal": { url: "in-process://personal" } } },
    });
    expect(prompt).toContain("Fairlx Agent");
    expect(prompt).toContain("Personal Agent");
    expect(prompt).toContain("Triage bugs");
    expect(prompt).toContain("Release checklist");
    expect(prompt).not.toContain("(w1)");
    expect(prompt).toContain("workspaceId: w1");
    expect(prompt).toContain("Organization: Stemlen");
    expect(prompt).toMatch(/organization name is already in context/i);
    expect(prompt).toMatch(/fairlx_usage_summary/);
    expect(prompt).not.toMatch(/Use mcp_list/);
    expect(prompt).toMatch(/change a member's role/i);
    expect(prompt).toMatch(/adds them to the organization and this workspace/i);
    expect(prompt).toMatch(/do not wait for the organization owner/i);
    expect(prompt).toMatch(/workItemId set to the item key/i);
    expect(prompt).toMatch(/fairlx_work_item_bulk_update/);
    expect(prompt).toMatch(/assignPercent/);
    expect(prompt).toMatch(/clearAssignees/);
    expect(prompt).toMatch(/Omit status/);
    expect(prompt).toMatch(/do not say they are assigned/i);
    expect(prompt).toContain("Task: New high-priority bug on login");
    expect(prompt).toMatch(/One fairlx_work_item_list per project/);
    expect(prompt).toMatch(/backlog=true/);
    expect(prompt).toMatch(/Do not assume the active sprint/);
  });

  it("tells the agent to write a feature plan instead of a workspace census", () => {
    const prompt = buildSystemPrompt({
      harness: harness(),
      context: context(),
      run: run("Plan a new feature for the current Fairlx workspace."),
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
    });
    expect(prompt).toMatch(/propose one concrete feature/i);
    expect(prompt).toMatch(/delegate_agent/);
    expect(prompt).toMatch(/same assistant step/i);
    expect(prompt).toMatch(/in parallel/i);
    expect(prompt).toMatch(/one subject/i);
    expect(prompt).not.toMatch(/Stay in the Planner role/);
    expect(prompt).not.toMatch(/return findings only/);
  });

  it("requires researched project documentation instead of stub files", () => {
    const prompt = buildSystemPrompt({
      harness: harness(),
      context: context(),
      run: run("Create project documentation"),
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
    });
    expect(prompt).toMatch(/at most 2 documents/i);
    expect(prompt).toMatch(/Sources, Steps, and Risks/);
    expect(prompt).toMatch(/project documents wait for Accept/);
    expect(prompt).toMatch(/Notion-quality/i);
    expect(prompt).toMatch(/italic tagline/);
    expect(prompt).toMatch(/web_search/);
    expect(prompt).toMatch(/Do not emit one delegate_agent per document type/);
    expect(prompt).toMatch(/Do not fairlx_work_item_get each epic/);
    expect(prompt).toMatch(/packComplete/);
    expect(prompt).toMatch(/research_required/);
  });

  it("skips GitHub code analysis when the project has no linked repo", () => {
    const ctx = context();
    ctx.githubRepos = [];
    const prompt = buildSystemPrompt({
      harness: harness(),
      context: ctx,
      run: run("Create project documentation"),
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
    });
    expect(prompt).toMatch(/none linked/i);
    expect(prompt).toMatch(/do not call github_list_files/i);
    expect(prompt).toMatch(/Skip technical_spec, api_doc/);
    expect(prompt).not.toMatch(/then github_list_files or github_read_file/);
  });

  it("locks specialist passes into their role", () => {
    const prompt = buildSystemPrompt({
      harness: harness(),
      context: context(),
      run: run("Create stories for analytics."),
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
      specialist: "planner",
    });
    expect(prompt).toMatch(/Stay in the Planner role/);
  });

  it("tells the agent the first sprint on a new project starts automatically", () => {
    const prompt = buildSystemPrompt({
      harness: harness(),
      context: context(),
      run: run("Create a school management project"),
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
    });
    expect(prompt).toMatch(/first sprint.*starts automatically/i);
    expect(prompt).toMatch(/do not call fairlx_sprint_start/i);
  });

  it("tells the agent to create project teams with tools instead of Settings", () => {
    const prompt = buildSystemPrompt({
      harness: harness(),
      context: context(),
      run: run("Create a Developers team and add Surendra"),
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
    });
    expect(prompt).toMatch(/fairlx_project_team_create/);
    expect(prompt).toMatch(/fairlx_project_member_add/);
    expect(prompt).toMatch(/fairlx_project_team_member_add/);
    expect(prompt).toMatch(/Do not send the user to Settings → Teams/);
  });

  it("keeps the Personal Agent as orchestrator instead of a specialist", () => {
    const prompt = buildSystemPrompt({
      harness: { ...harness(), settings: { ...harness().settings, sessionMode: "personal" } },
      context: context(),
      run: run("Plan a new feature for the current Fairlx workspace."),
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
    });
    expect(prompt).toContain("You are the Fairlx Personal Agent, the user's Chief of Staff");
    expect(prompt).toMatch(/delegate to planner, builder, QA\/tester/i);
    expect(prompt).not.toMatch(/Stay in the Planner role/);
  });

  it("injects the trained standing prompt into Personal Agent turns", () => {
    const prompt = buildSystemPrompt({
      harness: { ...harness(), settings: { ...harness().settings, sessionMode: "personal" } },
      context: context(),
      run: run("What should I work on first today?"),
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
      personalPrompt: "## Identity and role\nYou operate as Ada's Staff frontend with a shippable-slice quality bar.",
    });
    expect(prompt).toContain("Trained Personal Agent operating system");
    expect(prompt).toContain("Ada's Staff frontend");
  });

  it("uses the interview prompt for training runs instead of the standing Personal Agent prompt", () => {
    const prompt = buildSystemPrompt({
      harness: { ...harness(), settings: { ...harness().settings, sessionMode: "personal" } },
      context: context(),
      run: { ...run(trainingKickoffPrompt()), kind: "training" },
      mcp: { mcpServers: { fairlx: { url: "/api/mcp", transport: "http" } } },
      personalPrompt: "## Identity\nDo not inject this during training.",
    });
    expect(prompt).toMatch(/Hi Ada/i);
    expect(prompt).toMatch(/one agenda question per turn/i);
    expect(prompt).toContain("[[choices]]");
    expect(prompt).toContain("Acme");
    expect(prompt).toContain("save_personal_agent");
    expect(prompt).not.toContain("Trained Personal Agent operating system");
    expect(prompt).not.toContain("Do not inject this during training");
  });
});

describe("personal MCP", () => {
  it("reads skills and chats from the harness", () => {
    const h = harness();
    const skills = readPersonalContent({ kind: "skills", harness: h }) as Array<{ name: string }>;
    expect(skills.some((item) => item.name === "Frontend")).toBe(true);
    const chats = readPersonalContent({
      kind: "chats",
      harness: { ...h, chatMeta: { ...emptyChatMeta(), pinnedRunIds: ["run1"] } },
      runs: [run("Pinned chat")],
    }) as Array<{ id: string; pinned: boolean }>;
    expect(chats[0]?.pinned).toBe(true);
  });
});

describe("session context", () => {
  it("prefixes attached work items and session mode onto the user prompt", () => {
    const content = composeUserPrompt(
      "Fix the login redirect",
      [{ kind: "work_item", id: "i1", label: "Fix login", meta: "WEB-1" }],
      "debug",
    );
    expect(content).toContain("[Session mode: debug]");
    expect(content).toContain("work_item: Fix login");
    expect(displayUserContent(content)).toBe("Fix the login redirect");
  });

  it("embeds attached markdown in the model prompt and hides it in the UI", () => {
    const content = composeUserPrompt(
      "Plan every module",
      [{ kind: "file", id: "f1", label: "spec.md", meta: "text", content: "# Companion\nChat tutor." }],
      "agent",
    );
    expect(content).toContain("<<<FAIRLX_ATTACH");
    expect(content).toContain("Chat tutor.");
    expect(displayUserContent(content)).toBe("Plan every module");
  });

  it("exposes Personal Agent in the chat session modes", () => {
    expect(AGENT_SESSION_MODES.map((mode) => mode.id)).toContain("personal");
    const content = composeUserPrompt("Fix mobile sidebar overflow and test it.", [], "personal");
    expect(content).toContain("[Session mode: personal]");
    expect(content).toContain("Chief of Staff");
    expect(displayUserContent(content)).toBe("Fix mobile sidebar overflow and test it.");
  });

  it("strips the train-personal marker from displayed user content", () => {
    expect(displayUserContent(trainingKickoffPrompt())).toBe(trainingKickoffPrompt());
    expect(displayUserContent("[Train personal agent] Retrain me in this chat.")).toBe(
      "Retrain me in this chat.",
    );
    expect(
      compileFairlxListIntent(displayUserContent(trainingKickoffPrompt()), { projectId: "p1" }),
    ).toBeNull();
  });

  it("does not allow saving the Personal Agent until several real replies exist", () => {
    expect(trainingSaveReady([{ role: "user", content: trainingKickoffPrompt() }])).toBe(false);
    expect(
      trainingSaveReady([
        { role: "user", content: "Yes, Tech Lead" },
        { role: "user", content: "Skip this" },
        { role: "user", content: "Keep it simple" },
      ]),
    ).toBe(false);
    expect(
      trainingSaveReady(
        Array.from({ length: 6 }, (_, index) => ({ role: "user", content: `Answer ${index + 1}` })),
      ),
    ).toBe(true);
  });
});

describe("transcript grouping", () => {
  it("groups tool calls into a collapsible step card instead of raw dumps", () => {
    const now = new Date().toISOString();
    const blocks = groupTranscript(
      [
        { id: "u1", role: "user", content: "hello", createdAt: now },
        {
          id: "a1",
          role: "assistant",
          content: "Looking that up.",
          createdAt: now,
          toolCalls: [{ id: "c1", name: "git_status", arguments: "{}" }],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "c1",
          toolName: "git_status",
          content: JSON.stringify({ repos: [{ id: "r1" }], staging: { items: [] } }),
          createdAt: now,
        },
        { id: "a2", role: "assistant", content: "Repo is clean.", createdAt: now },
      ],
      [{ id: "e1", type: "git_status", title: "Checked git status", createdAt: now, runId: "run1" }],
    );
    expect(blocks.map((block) => block.kind)).toEqual(["user", "steps", "assistant"]);
    const steps = blocks[1];
    expect(steps.kind).toBe("steps");
    if (steps.kind !== "steps") return;
    expect(steps.lead?.content).toBe("Looking that up.");
    expect(summarizeToolResult("git_status", steps.steps[0]?.result?.content).detail).toContain("repos");
  });

  it("summarizes an auto-started sprint", () => {
    const summary = summarizeToolResult(
      "fairlx_sprint_create",
      JSON.stringify({
        sprint: { name: "Sprint 1 — Foundation", status: "ACTIVE" },
        started: true,
      }),
    );
    expect(summary.ok).toBe(true);
    expect(summary.detail).toContain("Started Sprint 1 — Foundation");
  });

  it("hides the training kickoff so the agent speaks first", () => {
    const now = new Date().toISOString();
    const blocks = groupTranscript([
      { id: "u0", role: "user", content: "[Train personal agent]", createdAt: now },
      { id: "a1", role: "assistant", content: "Does Tech Lead sound right?", createdAt: now },
    ]);
    expect(blocks.map((block) => block.kind)).toEqual(["assistant"]);
  });

  it("surfaces MCP method errors as a failed step summary", () => {
    const summary = summarizeToolResult(
      "mcp_call",
      JSON.stringify({ server: "fairlx", tool: "triage", result: { error: "Method not found: triage" } }),
    );
    expect(summary.ok).toBe(false);
    expect(summary.detail).toContain("Method not found");
  });

  it("keeps thinking and errors on a failed turn instead of dropping them", () => {
    const t0 = "2026-09-05T10:00:00.000Z";
    const t1 = "2026-09-05T10:00:05.000Z";
    const t2 = "2026-09-05T10:00:12.000Z";
    const turns = groupConversationTurns(
      [
        { id: "u1", role: "user", content: "Assign epics", createdAt: t0 },
        {
          id: "a1",
          role: "assistant",
          content: "",
          createdAt: t1,
          toolCalls: [{ id: "c1", name: "fairlx_work_item_list", arguments: "{}" }],
        },
        {
          id: "t1",
          role: "tool",
          toolCallId: "c1",
          toolName: "fairlx_work_item_list",
          content: JSON.stringify({ workItems: [{ key: "SCHO-1" }] }),
          createdAt: t1,
        },
      ],
      [
        { id: "th1", type: "thought", title: "Thinking", createdAt: t0, runId: "run1" },
        { id: "th2", type: "thought", title: "Planning next steps", detail: "Need to match epics", createdAt: t1, runId: "run1" },
        { id: "e1", type: "list_work_items", title: "Listed work items", createdAt: t1, runId: "run1" },
        { id: "err", type: "error", title: "Turn failed", detail: "fetch failed", createdAt: t2, runId: "run1" },
      ],
    );
    expect(turns).toHaveLength(1);
    expect(turns[0]?.thoughts.map((event) => event.title)).toEqual(["Thinking", "Planning next steps"]);
    expect(turns[0]?.activity.some((event) => event.type === "error")).toBe(true);
    expect(turns[0]?.blocks.map((block) => block.kind)).toEqual(["steps"]);
  });

  it("keeps llm usage on the turn for the usage card", () => {
    const turns = groupConversationTurns(
      [{ id: "u1", role: "user", content: "Hi", createdAt: "2026-09-05T10:00:00.000Z" }],
      [
        {
          id: "u",
          type: "llm_usage",
          title: "GPT-5.6 Luna · 334 tokens",
          payload: {
            role: "orchestrator",
            displayName: "GPT-5.6 Luna",
            promptTokens: 291,
            completionTokens: 43,
            cachedTokens: 0,
            totalTokens: 334,
            billed: true,
            costUSD: 0.0001,
          },
          createdAt: "2026-09-05T10:00:02.000Z",
          runId: "run1",
        },
      ],
    );
    expect(turns[0]?.usage).toHaveLength(1);
    expect(turns[0]?.usage[0]?.type).toBe("llm_usage");
    expect(turns[0]?.activity.some((event) => event.type === "llm_usage")).toBe(false);
    expect(turns[0]?.activity.some((event) => /Grok|Luna|tokens/i.test(event.title))).toBe(false);
  });

  it("does not leak three model usage events into activity lines", () => {
    const turns = groupConversationTurns(
      [{ id: "u1", role: "user", content: "unassign sprint 1", createdAt: "2026-09-05T10:00:00.000Z" }],
      [
        { id: "th1", type: "thought", title: "Working", createdAt: "2026-09-05T10:00:01.000Z", runId: "run1" },
        {
          id: "u1e",
          type: "llm_usage",
          title: "Grok 4.6 · 8,388 tokens",
          detail: "$0.0187 · 0% cache",
          payload: { displayName: "Grok 4.6", totalTokens: 8388, promptTokens: 8000, completionTokens: 388, billed: true, costUSD: 0.0187 },
          createdAt: "2026-09-05T10:00:02.000Z",
          runId: "run1",
        },
        {
          id: "u2e",
          type: "llm_usage",
          title: "Grok 4.6 · 11,365 tokens",
          detail: "$0.0127 · 70% cache",
          payload: { displayName: "Grok 4.6", totalTokens: 11365, promptTokens: 11000, completionTokens: 365, billed: true, costUSD: 0.0127 },
          createdAt: "2026-09-05T10:00:03.000Z",
          runId: "run1",
        },
        {
          id: "u3e",
          type: "llm_usage",
          title: "Grok 4.6 · 9,784 tokens",
          detail: "$0.0085 · 86% cache",
          payload: { displayName: "Grok 4.6", totalTokens: 9784, promptTokens: 9500, completionTokens: 284, billed: true, costUSD: 0.0085 },
          createdAt: "2026-09-05T10:00:04.000Z",
          runId: "run1",
        },
      ],
    );
    expect(turns[0]?.usage.filter((event) => event.type === "llm_usage")).toHaveLength(3);
    expect(turns[0]?.activity).toEqual([]);
    expect(turns[0]?.thoughts.map((event) => event.title)).toEqual(["Working"]);
  });

  it("hides pass-number thought noise", () => {
    const lines = visibleThoughtLines([
      { id: "1", type: "thought", title: "Working", createdAt: "2026-09-05T10:00:00.000Z", runId: "r" },
      { id: "2", type: "thought", title: "Thinking", detail: "Pass 1", createdAt: "2026-09-05T10:00:01.000Z", runId: "r" },
      { id: "3", type: "thought", title: "Planning next steps", detail: "Pass 2", createdAt: "2026-09-05T10:00:02.000Z", runId: "r" },
      {
        id: "4",
        type: "thought",
        title: "Reasoning",
        detail: "Clear assignees, then assign Sprint 1 to Fogef.",
        createdAt: "2026-09-05T10:00:03.000Z",
        runId: "r",
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.detail).toMatch(/Fogef/);
  });
});
