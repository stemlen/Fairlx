import { useQuery } from "@tanstack/react-query";

import { client } from "@/lib/rpc";

import { SprintStatus } from "../types";

interface UseGetSprintsProps {
  workspaceId: string;
  projectId?: string;
  status?: SprintStatus;
  enabled?: boolean;
}

export const useGetSprints = ({
  workspaceId,
  projectId,
  status,
  enabled = true,
}: UseGetSprintsProps) => {
  const query = useQuery({
    queryKey: ["sprints", workspaceId, projectId, status],
    enabled: Boolean(workspaceId) && Boolean(projectId) && enabled,
    queryFn: async () => {
      if (!workspaceId || !projectId) {
        throw new Error("workspaceId and projectId are required to fetch sprints.");
      }

      const response = await client.api.sprints.$get({
        query: {
          workspaceId,
          projectId,
          status,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch sprints.");
      }

      const { data } = await response.json();

      return data;
    },
  });

  return query;
};
