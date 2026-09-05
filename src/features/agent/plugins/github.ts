import { Query, type Databases } from "node-appwrite";

import { DATABASE_ID, GITHUB_REPOS_ID } from "@/config";
import { GitHubAPI } from "@/features/github-integration/lib/github-api";
import { decryptToken } from "@/features/github-integration/lib/encryption";

import type { AgentCapability, AgentContext, AgentContextRepo, AgentPluginConnection } from "../types";
import { decryptSecret } from "../lib/secrets";

export { githubCapabilityGap, parsePrFiles } from "./github-helpers";

function tryDecrypt(value: string): string {
  try {
    return decryptToken(value);
  } catch {
    try {
      return decryptSecret(value);
    } catch {
      return value;
    }
  }
}

export type GithubRepoOk = {
  api: GitHubAPI;
  owner: string;
  repo: string;
  branch: string;
  repoId?: string;
};

export type GithubRepoErr = { error: string; capability?: AgentCapability; skipped?: boolean };

export const NO_LINKED_GITHUB_REPO =
  "No GitHub repository is linked. Skip code analysis and continue from Fairlx work items and sprints. Do not create technical_spec or api_doc until a repo is added. Planning docs (prd, frd, user_stories, user_guide, test_plan) are fine.";

export async function resolveGithubRepo(params: {
  databases?: Databases;
  context: AgentContext;
  plugins: AgentPluginConnection[];
  repoId?: string;
  projectId?: string;
  owner?: string;
  repo?: string;
  branch?: string;
}): Promise<GithubRepoOk | GithubRepoErr> {
  const override = params.plugins.find(
    (plugin) => plugin.catalogId === "github" && plugin.status === "connected" && plugin.secrets?.accessTokenEncrypted,
  );
  const overrideToken = override?.secrets?.accessTokenEncrypted
    ? decryptSecret(override.secrets.accessTokenEncrypted)
    : "";
  const extraOwner = override?.secrets?.extra?.owner;
  const extraRepo = override?.secrets?.extra?.repo;

  let match: AgentContextRepo | undefined = params.context.githubRepos.find((item) => {
    if (params.repoId && item.id === params.repoId) return true;
    if (params.projectId && item.projectId === params.projectId) return true;
    if (params.owner && params.repo) {
      return item.owner === params.owner && item.repositoryName === params.repo;
    }
    return false;
  });
  if (!match && !params.projectId) match = params.context.githubRepos[0];

  const owner = params.owner || match?.owner || extraOwner || "";
  const repo = params.repo || match?.repositoryName || extraRepo || "";
  const branch = params.branch || match?.branch || "main";
  if (!owner || !repo) {
    return {
      error: NO_LINKED_GITHUB_REPO,
      skipped: true,
    };
  }

  let token = overrideToken;
  if (!token && params.databases && match?.id) {
    try {
      const doc = await params.databases.getDocument(DATABASE_ID, GITHUB_REPOS_ID, match.id);
      const stored = String((doc as { accessToken?: string }).accessToken || "");
      if (stored) token = tryDecrypt(stored);
    } catch {
      const listed = await params.databases.listDocuments(DATABASE_ID, GITHUB_REPOS_ID, [
        Query.equal("projectId", match.projectId || params.projectId || ""),
        Query.limit(1),
      ]);
      const stored = String((listed.documents[0] as { accessToken?: string } | undefined)?.accessToken || "");
      if (stored) token = tryDecrypt(stored);
    }
  }

  if (!token) {
    return {
      error: "GitHub token is missing or cannot push. Add a PAT with repo scope, or reconnect GitHub.",
      capability: "code.write",
    };
  }

  return {
    api: new GitHubAPI(token),
    owner,
    repo,
    branch,
    repoId: match?.id,
  };
}

export async function githubListFiles(params: {
  databases?: Databases;
  context: AgentContext;
  plugins: AgentPluginConnection[];
  path?: string;
  repoId?: string;
  projectId?: string;
}) {
  const resolved = await resolveGithubRepo(params);
  if ("error" in resolved) return resolved;
  const entries = await resolved.api.getContents(resolved.owner, resolved.repo, params.path || "", resolved.branch);
  return {
    owner: resolved.owner,
    repo: resolved.repo,
    branch: resolved.branch,
    items: entries.map((item) => ({ name: item.name, path: item.path, type: item.type, size: item.size })),
  };
}

export async function githubReadFile(params: {
  databases?: Databases;
  context: AgentContext;
  plugins: AgentPluginConnection[];
  path: string;
  repoId?: string;
  projectId?: string;
  branch?: string;
}) {
  const resolved = await resolveGithubRepo(params);
  if ("error" in resolved) return resolved;
  const content = await resolved.api.getFileContent(resolved.owner, resolved.repo, params.path, params.branch || resolved.branch);
  return {
    owner: resolved.owner,
    repo: resolved.repo,
    branch: params.branch || resolved.branch,
    path: params.path,
    content: content.slice(0, 20000),
  };
}

export async function githubWriteFile(params: {
  databases?: Databases;
  context: AgentContext;
  plugins: AgentPluginConnection[];
  path: string;
  content: string;
  message: string;
  branch?: string;
  repoId?: string;
  projectId?: string;
}) {
  const resolved = await resolveGithubRepo(params);
  if ("error" in resolved) {
    return resolved.skipped ? { ...resolved, capability: "code.write" as const } : resolved;
  }
  const branch = params.branch || `fairlx/${Date.now().toString(36)}`;
  const result = await resolved.api.putFile({
    owner: resolved.owner,
    repo: resolved.repo,
    path: params.path,
    content: params.content,
    message: params.message || `Update ${params.path}`,
    branch,
    baseBranch: resolved.branch,
  });
  return {
    owner: resolved.owner,
    repo: resolved.repo,
    branch,
    path: params.path,
    sha: result.sha,
    html_url: result.html_url,
  };
}

export async function githubOpenPullRequest(params: {
  databases?: Databases;
  context: AgentContext;
  plugins: AgentPluginConnection[];
  title: string;
  body?: string;
  head: string;
  base?: string;
  repoId?: string;
  projectId?: string;
}) {
  const resolved = await resolveGithubRepo(params);
  if ("error" in resolved) {
    return resolved.skipped ? { ...resolved, capability: "code.write" as const } : resolved;
  }
  const pr = await resolved.api.createPullRequest({
    owner: resolved.owner,
    repo: resolved.repo,
    title: params.title,
    body: params.body || "",
    head: params.head,
    base: params.base || resolved.branch,
  });
  return {
    owner: resolved.owner,
    repo: resolved.repo,
    number: pr.number,
    html_url: pr.html_url,
    title: pr.title,
  };
}

export async function githubCommitFilesAndOpenPr(params: {
  databases?: Databases;
  context: AgentContext;
  plugins: AgentPluginConnection[];
  title: string;
  body?: string;
  files: Array<{ path: string; content: string; message?: string }>;
  branch?: string;
  base?: string;
  repoId?: string;
  projectId?: string;
  onProgress?: (step: string, percent: number) => Promise<void> | void;
}) {
  const resolved = await resolveGithubRepo(params);
  if ("error" in resolved) {
    return resolved.skipped ? { ...resolved, capability: "code.write" as const } : resolved;
  }
  const branch = params.branch || `fairlx/${Date.now().toString(36)}`;
  const written: Array<{ path: string; sha: string; html_url?: string }> = [];
  for (let index = 0; index < params.files.length; index += 1) {
    const file = params.files[index]!;
    await params.onProgress?.(`Writing ${file.path}`, Math.round(((index + 1) / Math.max(params.files.length + 1, 1)) * 90));
    const result = await resolved.api.putFile({
      owner: resolved.owner,
      repo: resolved.repo,
      path: file.path,
      content: file.content,
      message: file.message || params.title || `Update ${file.path}`,
      branch,
      baseBranch: params.base || resolved.branch,
    });
    written.push({ path: file.path, sha: result.sha, html_url: result.html_url });
  }
  await params.onProgress?.("Opening pull request", 95);
  const pr = await resolved.api.createPullRequest({
    owner: resolved.owner,
    repo: resolved.repo,
    title: params.title,
    body: params.body || "",
    head: branch,
    base: params.base || resolved.branch,
  });
  return {
    owner: resolved.owner,
    repo: resolved.repo,
    branch,
    number: pr.number,
    html_url: pr.html_url,
    title: pr.title,
    files: written,
  };
}
