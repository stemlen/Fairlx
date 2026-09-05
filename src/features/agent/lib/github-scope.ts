import type { AgentContext, AgentContextRepo } from "../types";

export function projectGithubRepos(context: AgentContext, projectId?: string): AgentContextRepo[] {
  if (!projectId) return [];
  return context.githubRepos.filter((repo) => repo.projectId === projectId);
}

export function hasProjectGithubRepo(context: AgentContext, projectId?: string): boolean {
  return projectGithubRepos(context, projectId).length > 0;
}

export function formatProjectGithubLine(context: AgentContext, projectId?: string): string {
  const repos = projectGithubRepos(context, projectId);
  if (!repos.length) {
    return "GitHub: none linked for this project. Skip github_list_files and github_read_file. Do not stall asking for a repository. Write planning documents from work items and sprints. Skip technical_spec, api_doc, and code-derived architecture until a repo is added.";
  }
  const labels = repos
    .slice(0, 3)
    .map((repo) =>
      repo.owner && repo.repositoryName ? `${repo.owner}/${repo.repositoryName}` : repo.repositoryName || "repo",
    );
  return `GitHub: ${labels.join(", ")} linked.`;
}
