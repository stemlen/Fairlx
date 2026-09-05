import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InferRequestType, InferResponseType } from "hono";
import { toast } from "sonner";

import { client } from "@/lib/rpc";
import { GITHUB_INTEGRATION_QUERY_KEYS } from "../constants";

// Link Repository
type LinkRepositoryRequest = InferRequestType<
  typeof client.api.github.repository.link["$post"]
>;
type LinkRepositoryResponse = InferResponseType<
  typeof client.api.github.repository.link["$post"],
  200
>;

export const useLinkRepository = () => {
  const queryClient = useQueryClient();

  return useMutation<LinkRepositoryResponse, Error, LinkRepositoryRequest>({
    mutationFn: async ({ json }) => {
      const response = await client.api.github.repository.link["$post"]({ json });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to link repository");
      }

      return await response.json();
    },
    onSuccess: async ({ data }) => {
      toast.success("Repository linked successfully");
      
      // Invalidate all related queries
      queryClient.invalidateQueries({
        queryKey: GITHUB_INTEGRATION_QUERY_KEYS.repository(data.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: GITHUB_INTEGRATION_QUERY_KEYS.documentation(data.projectId),
      });
      queryClient.invalidateQueries({ queryKey: ["agent-context"] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to link repository");
    },
  });
};

// Get Repository
export const useGetRepository = (projectId: string) => {
  return useQuery({
    queryKey: GITHUB_INTEGRATION_QUERY_KEYS.repository(projectId),
    queryFn: async () => {
      const response = await client.api.github.repository.$get({
        query: { projectId },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch repository");
      }

      const { data } = await response.json();
      return data;
    },
    enabled: !!projectId,
  });
};

// Disconnect Repository
type DisconnectRepositoryRequest = {
  param: { repositoryId: string };
  projectId: string;
};

export const useDisconnectRepository = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DisconnectRepositoryRequest>({
    mutationFn: async ({ param }) => {
      const response = await client.api.github.repository[":repositoryId"].$delete({
        param,
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect repository");
      }
    },
    onSuccess: async (_, variables) => {
      toast.success("Repository disconnected");
      
      // Invalidate all related queries
      queryClient.invalidateQueries({
        queryKey: ["github-repo"],
      });
      queryClient.invalidateQueries({
        queryKey: GITHUB_INTEGRATION_QUERY_KEYS.documentation(variables.projectId),
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to disconnect repository");
    },
  });
};

// Generate Documentation
type GenerateDocumentationRequest = InferRequestType<
  typeof client.api.github.documentation.generate["$post"]
>;
type GenerateDocumentationResponse = InferResponseType<
  typeof client.api.github.documentation.generate["$post"],
  200
>;

export const useGenerateDocumentation = () => {
  return useMutation<
    GenerateDocumentationResponse,
    Error,
    GenerateDocumentationRequest
  >({
    mutationFn: async ({ json }) => {
      const response = await client.api.github.documentation.generate["$post"]({
        json,
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to generate documentation");
      }

      return await response.json();
    },
    onSuccess: () => {
      toast.success("Documentation generated for preview");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate documentation");
    },
  });
};

// Refine Documentation
type RefineDocumentationRequest = InferRequestType<
  typeof client.api.github.documentation.refine["$post"]
>;
type RefineDocumentationResponse = InferResponseType<
  typeof client.api.github.documentation.refine["$post"],
  200
>;

export const useRefineDocumentation = () => {
  return useMutation<RefineDocumentationResponse, Error, RefineDocumentationRequest>({
    mutationFn: async ({ json }) => {
      const response = await client.api.github.documentation.refine["$post"]({ json });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to refine documentation");
      }

      return await response.json();
    },
    onSuccess: () => {
      toast.success("Documentation refined for preview");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to refine documentation");
    },
  });
};

// Save Documentation
type SaveDocumentationRequest = InferRequestType<
  typeof client.api.github.documentation.save["$post"]
>;
type SaveDocumentationResponse = InferResponseType<
  typeof client.api.github.documentation.save["$post"],
  200
>;

export const useSaveDocumentation = () => {
  const queryClient = useQueryClient();

  return useMutation<SaveDocumentationResponse, Error, SaveDocumentationRequest>({
    mutationFn: async ({ json }) => {
      const response = await client.api.github.documentation.save["$post"]({ json });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to save documentation");
      }

      return await response.json();
    },
    onSuccess: ({ data }) => {
      toast.success("Documentation saved successfully");
      queryClient.invalidateQueries({
        queryKey: GITHUB_INTEGRATION_QUERY_KEYS.documentation(data.projectId),
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save documentation");
    },
  });
};

// Get Documentation
export const useGetDocumentation = (projectId: string) => {
  return useQuery({
    queryKey: GITHUB_INTEGRATION_QUERY_KEYS.documentation(projectId),
    queryFn: async () => {
      const response = await client.api.github.documentation["$get"]({
        query: { projectId },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch documentation");
      }

      const { data } = await response.json();
      return data;
    },
    enabled: !!projectId,
  });
};

// Get OAuth configuration status
export const useGetOAuthStatus = () => {
  return useQuery({
    queryKey: ["github-oauth-status"],
    queryFn: async () => {
      const response = await client.api.github.oauth.status.$get();

      if (!response.ok) {
        throw new Error("Failed to fetch GitHub OAuth status");
      }

      return await response.json();
    },
  });
};

// Update Repository Settings
type UpdateRepositorySettingsRequest = {
  param: { repositoryId: string };
  json: {
    autoFetchCommits?: boolean;
    linkCommitsToTasks?: boolean;
    syncComments?: boolean;
    allowPrMerge?: boolean;
    createTasksFromIssues?: boolean;
  };
  projectId: string;
};

export const useUpdateRepositorySettings = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, UpdateRepositorySettingsRequest>({
    mutationFn: async ({ param, json }) => {
      const response = await client.api.github.repository[":repositoryId"].settings.$patch({
        param,
        json,
      });

      if (!response.ok) {
        throw new Error("Failed to update repository settings");
      }

      return await response.json();
    },
    onSuccess: (_, variables) => {
      toast.success("Repository settings saved");
      queryClient.invalidateQueries({
        queryKey: GITHUB_INTEGRATION_QUERY_KEYS.repository(variables.projectId),
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update settings");
    },
  });
};

// Fetch user repositories for connected account
export const useGetGitHubRepos = (projectId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["github-user-repos", projectId],
    queryFn: async () => {
      const response = await client.api.github.repository["user-repos"].$get({
        query: { projectId },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch GitHub repositories");
      }
      const { data } = await response.json();
      return data as Array<{
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        html_url: string;
        owner: { login: string };
        default_branch: string;
      }>;
    },
    enabled: !!projectId && enabled,
  });
};

// Fetch branches for a specific repository
export const useGetGitHubBranches = (projectId: string, owner: string, repo: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["github-repo-branches", projectId, owner, repo],
    queryFn: async () => {
      const response = await client.api.github.repository.branches.$get({
        query: { projectId, owner, repo },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch branches");
      }
      const { data } = await response.json();
      return data as Array<{
        name: string;
        commit: { sha: string };
        protected: boolean;
      }>;
    },
    enabled: !!projectId && !!owner && !!repo && enabled,
  });
};

// Fetch GitHub events (commits & PRs) for a specific task key
export const useGetTaskGitHubEvents = (taskKey: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["github-task-events", taskKey],
    queryFn: async () => {
      const response = await client.api.github.repository["task-events"][":taskKey"].$get({
        param: { taskKey },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch task development events");
      }
      const { data } = await response.json();
      return data as unknown as {
        commits: Array<{
          $id: string;
          commitSha: string;
          commitMessage: string;
          commitUrl: string;
          authorName: string;
          authorEmail: string;
          branchName: string;
          repoFullName: string;
          processedAt: string;
        }>;
        pullRequests: Array<{
          $id: string;
          prNumber: number;
          prTitle: string;
          prState: "open" | "closed" | "merged";
          prUrl: string;
          branchName: string;
          repoFullName: string;
          processedAt: string;
        }>;
      };
    },
    enabled: !!taskKey && enabled,
  });
};

// Fetch GitHub releases for a project
export const useGetGitHubReleases = (projectId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["github-releases", projectId],
    queryFn: async () => {
      const response = await client.api.github.repository.releases.$get({
        query: { projectId },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch project releases");
      }
      const { data } = await response.json();
      return data as unknown as Array<{
        $id: string;
        projectId: string;
        tagName: string;
        name: string;
        body: string;
        publishedAt: string;
        htmlUrl: string;
        authorName: string;
      }>;
    },
    enabled: !!projectId && enabled,
  });
};

// Fetch GitHub issues for a project
export const useGetGitHubIssues = (projectId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["github-issues", projectId],
    queryFn: async () => {
      const response = await client.api.github.repository.issues.$get({
        query: { projectId },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch project issues");
      }
      const { data } = await response.json();
      return data as unknown as Array<{
        $id: string;
        projectId: string;
        taskId: string;
        issueId: number;
        number: number;
        title: string;
        htmlUrl: string;
        state: "open" | "closed";
        repoFullName: string;
        processedAt?: string;
        task?: {
          $id: string;
          title: string;
          key: string;
          status: string;
        } | null;
      }>;
    },
    enabled: !!projectId && enabled,
    refetchInterval: 4000, // Poll every 4 seconds to reflect issues raised on GitHub live
  });
};

// Fetch GitHub commits for a project
export const useGetProjectCommits = (projectId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["github-project-commits", projectId],
    queryFn: async () => {
      const response = await client.api.github.repository.commits.$get({
        query: { projectId },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch project commits");
      }
      const { data } = await response.json();
      return data as unknown as Array<{
        $id: string;
        commitSha: string;
        commitMessage: string;
        commitUrl: string;
        authorName: string;
        authorEmail: string;
        branchName: string;
        repoFullName: string;
        processedAt: string;
        taskId?: string;
      }>;
    },
    enabled: !!projectId && enabled,
  });
};

// Fetch GitHub pull requests for a project
export const useGetProjectPullRequests = (projectId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["github-project-pull-requests", projectId],
    queryFn: async () => {
      const response = await client.api.github.repository["pull-requests"].$get({
        query: { projectId },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch project pull requests");
      }
      const { data } = await response.json();
      return data as unknown as Array<{
        $id: string;
        prNumber: number;
        prTitle: string;
        prState: "open" | "closed" | "merged";
        prUrl: string;
        branchName: string;
        repoFullName: string;
        processedAt: string;
        taskId?: string;
      }>;
    },
    enabled: !!projectId && enabled,
  });
};

// Sync historical GitHub data (commits, PRs, issues, releases)
type SyncGitHubHistoryRequest = {
  json: { projectId: string };
};

export const useSyncGitHubHistory = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, SyncGitHubHistoryRequest>({
    mutationFn: async ({ json }) => {
      const response = await client.api.github.repository["sync-history"].$post({ json });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to sync GitHub history");
      }

      return await response.json();
    },
    onSuccess: (_, variables) => {
      toast.success("GitHub repository history successfully synchronized!");
      
      // Invalidate all related queries to refresh the UI
      queryClient.invalidateQueries({
        queryKey: GITHUB_INTEGRATION_QUERY_KEYS.repository(variables.json.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ["github-releases", variables.json.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["github-issues", variables.json.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["github-project-commits", variables.json.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["github-project-pull-requests", variables.json.projectId],
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sync history");
    },
  });
};


