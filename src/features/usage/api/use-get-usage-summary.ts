import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/rpc";
import { UsageSummary } from "../types";

interface UseGetUsageSummaryParams {
    workspaceId?: string;
    organizationId?: string;
    period?: string;
}

export const useGetUsageSummary = (params: UseGetUsageSummaryParams) => {
    return useQuery({
        queryKey: ["usage-summary", params],
        queryFn: async () => {
            const response = await client.api.usage.summary.$get({
                query: {
                    workspaceId: params.workspaceId,
                    organizationId: params.organizationId,
                    period: params.period,
                },
            });

            if (!response.ok) {
                throw new Error("Failed to fetch usage summary");
            }

            return await response.json() as { data: UsageSummary };
        },
        enabled: !!(params.workspaceId || params.organizationId),
    });
};
