import { describe, expect, it } from "vitest";

import { formatProjectGithubLine, hasProjectGithubRepo } from "./github-scope";
import type { AgentContext } from "../types";

function context(repos: AgentContext["githubRepos"] = []): AgentContext {
  return {
    user: { id: "u1", name: "Ada", email: "ada@fairlx.dev" },
    workspaces: [{ id: "w1", name: "Acme" }],
    projects: [{ id: "p1", name: "Website", workspaceId: "w1" }],
    workItems: [],
    notifications: [],
    githubRepos: repos,
    integrations: [],
    docs: [],
  };
}

describe("github scope", () => {
  it("treats another project's repo as missing for this project", () => {
    const ctx = context([{ id: "r1", owner: "acme", repositoryName: "other", projectId: "p2" }]);
    expect(hasProjectGithubRepo(ctx, "p1")).toBe(false);
    expect(formatProjectGithubLine(ctx, "p1")).toMatch(/none linked/i);
  });

  it("detects a repo on the current project", () => {
    const ctx = context([{ id: "r1", owner: "acme", repositoryName: "app", projectId: "p1" }]);
    expect(hasProjectGithubRepo(ctx, "p1")).toBe(true);
    expect(formatProjectGithubLine(ctx, "p1")).toContain("acme/app");
  });
});
