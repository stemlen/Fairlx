"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface UpdateOrganizationData {
    organizationId: string;
    name?: string;
    image?: File;
    billingSettings?: string;
}

/**
 * Hook for updating organization details
 * OWNER or ADMIN can update name and image
 */
export const useUpdateOrganization = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ organizationId, name, image, billingSettings }: UpdateOrganizationData) => {
            const formData = new FormData();
            if (name) formData.append("name", name);
            if (image) formData.append("image", image);
            if (billingSettings) formData.append("billingSettings", billingSettings);

            const response = await fetch(`/api/organizations/${organizationId}`, {
                method: "PATCH",
                body: formData,
                credentials: "include",
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || "Failed to update organization");
            }

            return response.json();
        },
        onSuccess: (_, variables) => {
            toast.success("Organization updated");
            queryClient.invalidateQueries({ queryKey: ["organization", variables.organizationId] });
            queryClient.invalidateQueries({ queryKey: ["organizations"] });
        },
        onError: (error: Error) => {
            toast.error(error.message || "Failed to update organization");
        },
    });
};
