
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { client } from "@/lib/rpc";
import { toast } from "sonner";

import { Sprint } from "../types";

// Manually defining types until RPC inference catches up
type ResponseType = { data: Sprint };
type RequestType = {
    param: { sprintId: string };
    json: {
        workspaceId: string;
        projectId: string;
        unfinishedDetails?: {
            moveTo: "backlog" | { sprintId: string };
        };
    };
};

export const useCompleteSprint = () => {
    const queryClient = useQueryClient();

    const mutation = useMutation<
        ResponseType,
        Error,
        RequestType
    >({
        mutationFn: async ({ param, json }) => {
            const response = await client.api.sprints[":sprintId"]["complete"]["$post"]({
                param,
                json,
            });

            if (!response.ok) {
                throw new Error("Failed to complete sprint");
            }

            return await response.json();
        },
        onSuccess: () => {
            toast.success("Sprint completed");
            queryClient.invalidateQueries({ queryKey: ["sprints"] });
            queryClient.invalidateQueries({ queryKey: ["work-items"] });
        },
        onError: (error) => {
            console.error(error);
            toast.error("Failed to complete sprint");
        }
    });

    return mutation;
};
