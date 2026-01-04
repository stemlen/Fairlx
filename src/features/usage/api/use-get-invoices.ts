import { useQuery } from "@tanstack/react-query";

import { client } from "@/lib/rpc";

interface UseGetInvoicesProps {
    workspaceId?: string;
    organizationId?: string;
    limit?: number;
    offset?: number;
}

/**
 * Fetch invoices for a workspace or organization
 */
export const useGetInvoices = ({
    workspaceId,
    organizationId,
    limit = 24,
    offset = 0,
}: UseGetInvoicesProps) => {
    const query = useQuery({
        queryKey: ["invoices", { workspaceId, organizationId, limit, offset }],
        queryFn: async () => {
            const response = await client.api.usage.invoices.$get({
                query: {
                    workspaceId: workspaceId || undefined,
                    organizationId: organizationId || undefined,
                    limit: limit.toString(),
                    offset: offset.toString(),
                },
            });

            if (!response.ok) {
                throw new Error("Failed to fetch invoices");
            }

            const { data } = await response.json();
            return data;
        },
        enabled: !!workspaceId || !!organizationId,
    });

    return query;
};
