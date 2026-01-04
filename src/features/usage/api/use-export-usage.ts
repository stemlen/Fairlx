import { useMutation } from "@tanstack/react-query";
import { client } from "@/lib/rpc";
import { ResourceType, ExportFormat } from "../types";

interface ExportUsageParams {
    workspaceId?: string;
    organizationId?: string;
    format: ExportFormat;
    startDate?: string;
    endDate?: string;
    resourceType?: ResourceType;
}

export const useExportUsage = () => {
    return useMutation({
        mutationFn: async (params: ExportUsageParams) => {
            const response = await client.api.usage.events.export.$get({
                query: {
                    workspaceId: params.workspaceId,
                    organizationId: params.organizationId,
                    format: params.format,
                    startDate: params.startDate,
                    endDate: params.endDate,
                    resourceType: params.resourceType,
                },
            });

            if (!response.ok) {
                throw new Error("Failed to export usage data");
            }

            // Handle different response types
            if (params.format === "json") {
                return await response.json();
            } else {
                // CSV - return as blob for download
                const blob = await response.blob();
                return blob;
            }
        },
    });
};
