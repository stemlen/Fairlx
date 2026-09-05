import { describe, expect, it } from "vitest";

import { agentRunPollMs, shouldPollAgentRun } from "./use-agent-runs";

describe("agent run polling", () => {
  it("polls running every second and awaiting confirmation a bit slower", () => {
    expect(shouldPollAgentRun("running")).toBe(true);
    expect(shouldPollAgentRun("completed")).toBe(false);
    expect(agentRunPollMs("running")).toBe(800);
    expect(agentRunPollMs("awaiting_confirmation")).toBe(2500);
    expect(shouldPollAgentRun("awaiting_plugin")).toBe(true);
    expect(agentRunPollMs("awaiting_plugin")).toBe(2500);
    expect(agentRunPollMs("completed")).toBe(false);
  });
});
