import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InferRequestType, InferResponseType } from "hono";

import { client } from "@/lib/rpc";
import { QUERY_CONFIG } from "@/lib/query-config";

import { AGENT_RUNS_QUERY_KEY } from "../constants";

type CreateRunResponse = InferResponseType<(typeof client.api)["agent"]["runs"]["$post"], 200>;
type CreateRunRequest = InferRequestType<(typeof client.api)["agent"]["runs"]["$post"]>;
type SendMessageResponse = InferResponseType<
  (typeof client.api)["agent"]["runs"][":runId"]["messages"]["$post"],
  200
>;
type SendMessageRequest = InferRequestType<
  (typeof client.api)["agent"]["runs"][":runId"]["messages"]["$post"]
>;
type StopRunResponse = InferResponseType<
  (typeof client.api)["agent"]["runs"][":runId"]["stop"]["$post"],
  200
>;
type ContinueRunResponse = InferResponseType<
  (typeof client.api)["agent"]["runs"][":runId"]["continue"]["$post"],
  200
>;
type PatchRunResponse = InferResponseType<
  (typeof client.api)["agent"]["runs"][":runId"]["$patch"],
  200
>;
type PatchRunRequest = InferRequestType<(typeof client.api)["agent"]["runs"][":runId"]["$patch"]>;

async function readError(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => ({ error: fallback }));
  throw new Error(
    "error" in body && typeof body.error === "string" ? body.error : fallback
  );
}

export const agentRunQueryKey = (runId: string) => ["agent-run", runId] as const;

export function shouldPollAgentRun(status?: string): boolean {
  return status === "running" || status === "awaiting_confirmation" || status === "awaiting_plugin";
}

export function agentRunPollMs(status?: string): number | false {
  if (status === "running") return 800;
  if (status === "awaiting_confirmation" || status === "awaiting_plugin") return 2500;
  return false;
}

const STALE_APPROVAL_ERROR = "Nothing is waiting for approval.";

export const useGetAgentRuns = () => {
  return useQuery({
    queryKey: AGENT_RUNS_QUERY_KEY,
    staleTime: QUERY_CONFIG.DYNAMIC.staleTime,
    gcTime: QUERY_CONFIG.DYNAMIC.gcTime,
    queryFn: async () => {
      const response = await client.api.agent.runs.$get();
      if (!response.ok) {
        throw new Error("Failed to fetch agent runs.");
      }
      const { data } = await response.json();
      return data;
    },
  });
};

export const useGetAgentRun = (runId?: string) => {
  return useQuery({
    queryKey: agentRunQueryKey(runId ?? ""),
    enabled: Boolean(runId),
    staleTime: QUERY_CONFIG.REALTIME.staleTime,
    gcTime: QUERY_CONFIG.REALTIME.gcTime,
    refetchInterval: (query) => agentRunPollMs(query.state.data?.status),
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const response = await client.api.agent.runs[":runId"].$get({
        param: { runId: runId! },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch agent run.");
      }
      const { data } = await response.json();
      return data;
    },
  });
};

export const useCreateAgentRun = () => {
  const queryClient = useQueryClient();

  return useMutation<CreateRunResponse, Error, CreateRunRequest>({
    mutationFn: async ({ json }) => {
      const response = await client.api.agent.runs.$post({ json });
      if (!response.ok) {
        await readError(response, "Failed to start agent run.");
      }
      return (await response.json()) as CreateRunResponse;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(agentRunQueryKey(result.data.id), {
        ...result.data,
        status: "running",
      });
      queryClient.invalidateQueries({ queryKey: agentRunQueryKey(result.data.id) });
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to start agent run.");
    },
  });
};

export const useSendAgentMessage = () => {
  const queryClient = useQueryClient();

  return useMutation<SendMessageResponse, Error, SendMessageRequest>({
    mutationFn: async ({ param, json }) => {
      const response = await client.api.agent.runs[":runId"].messages.$post({ param, json });
      if (!response.ok) {
        await readError(response, "Failed to send message.");
      }
      return (await response.json()) as SendMessageResponse;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(agentRunQueryKey(result.data.id), {
        ...result.data,
        status: "running",
      });
      queryClient.invalidateQueries({ queryKey: agentRunQueryKey(result.data.id) });
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send message.");
    },
  });
};

export const useContinueAgentRun = () => {
  const queryClient = useQueryClient();

  return useMutation<ContinueRunResponse, Error, { runId: string }>({
    mutationFn: async ({ runId }) => {
      const response = await client.api.agent.runs[":runId"]["continue"].$post({
        param: { runId },
      });
      if (!response.ok) {
        await readError(response, "Failed to continue agent run.");
      }
      return (await response.json()) as ContinueRunResponse;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(agentRunQueryKey(result.data.id), result.data);
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to continue agent run.");
    },
  });
};

export const useConfirmAgentRun = () => {
  const queryClient = useQueryClient();

  return useMutation<{ data: { id: string } } | ContinueRunResponse, Error, { runId: string }>({
    mutationFn: async ({ runId }) => {
      const response = await client.api.agent.runs[":runId"].confirm.$post({
        param: { runId },
      });
      if (!response.ok) {
        await readError(response, "Failed to accept the action.");
      }
      return (await response.json()) as ContinueRunResponse;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(agentRunQueryKey(result.data.id), {
        ...result.data,
        status: "running",
      });
      queryClient.invalidateQueries({ queryKey: agentRunQueryKey(result.data.id) });
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
    },
    onError: (error, variables) => {
      queryClient.invalidateQueries({ queryKey: agentRunQueryKey(variables.runId) });
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
      if (error.message === STALE_APPROVAL_ERROR) return;
      toast.error(error.message || "Failed to accept the action.");
    },
  });
};

export const useDenyAgentRun = () => {
  const queryClient = useQueryClient();

  return useMutation<ContinueRunResponse, Error, { runId: string }>({
    mutationFn: async ({ runId }) => {
      const response = await client.api.agent.runs[":runId"].deny.$post({
        param: { runId },
      });
      if (!response.ok) {
        await readError(response, "Failed to deny the action.");
      }
      return (await response.json()) as ContinueRunResponse;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(agentRunQueryKey(result.data.id), {
        ...result.data,
        status: "running",
      });
      queryClient.invalidateQueries({ queryKey: agentRunQueryKey(result.data.id) });
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
    },
    onError: (error, variables) => {
      queryClient.invalidateQueries({ queryKey: agentRunQueryKey(variables.runId) });
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
      if (error.message === STALE_APPROVAL_ERROR) return;
      toast.error(error.message || "Failed to deny the action.");
    },
  });
};

export const useStopAgentRun = () => {
  const queryClient = useQueryClient();

  return useMutation<StopRunResponse, Error, { runId: string }>({
    mutationFn: async ({ runId }) => {
      const response = await client.api.agent.runs[":runId"].stop.$post({
        param: { runId },
      });
      if (!response.ok) {
        await readError(response, "Failed to stop agent run.");
      }
      return (await response.json()) as StopRunResponse;
    },
    onSuccess: (result) => {
      toast.success("Run stopped.");
      queryClient.setQueryData(agentRunQueryKey(result.data.id), result.data);
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to stop agent run.");
    },
  });
};

export const useDeleteAgentRun = () => {
  const queryClient = useQueryClient();

  return useMutation<{ data: { id: string } }, Error, { runId: string }>({
    mutationFn: async ({ runId }) => {
      const response = await client.api.agent.runs[":runId"].$delete({
        param: { runId },
      });
      if (!response.ok) {
        await readError(response, "Failed to delete agent run.");
      }
      return (await response.json()) as { data: { id: string } };
    },
    onSuccess: (_result, { runId }) => {
      toast.success("Chat deleted.");
      queryClient.removeQueries({ queryKey: agentRunQueryKey(runId) });
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete agent run.");
    },
  });
};

export const usePatchAgentRun = () => {
  const queryClient = useQueryClient();

  return useMutation<PatchRunResponse, Error, PatchRunRequest>({
    mutationFn: async ({ param, json }) => {
      const response = await client.api.agent.runs[":runId"].$patch({ param, json });
      if (!response.ok) {
        await readError(response, "Failed to update agent run.");
      }
      return (await response.json()) as PatchRunResponse;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(agentRunQueryKey(result.data.id), result.data);
      queryClient.invalidateQueries({ queryKey: AGENT_RUNS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update agent run.");
    },
  });
};
