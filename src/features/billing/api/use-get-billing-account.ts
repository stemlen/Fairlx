import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/rpc";
import { BillingAccount } from "../types";

interface UseGetBillingAccountOptions {
    userId?: string;
    organizationId?: string;
    enabled?: boolean;
    refetchOnMount?: boolean | "always";
}

interface BillingAccountResponse {
    data: BillingAccount | null;
    hasPaymentMethod: boolean;
    needsSetup: boolean;
    daysUntilSuspension?: number;
    currency: string;
    walletBalance?: number;
    walletLockedBalance?: number;
    availableBalance?: number;
    walletCurrency?: string;
    trialExpiresAt?: string;
    initialTrialAmount?: number;
}

/**
 * Hook to get billing account for user or organization
 */
export function useGetBillingAccount(options: UseGetBillingAccountOptions = {}) {
    const { userId, organizationId, enabled = true, refetchOnMount } = options;

    return useQuery<BillingAccountResponse>({
        queryKey: ["billing-account", { userId, organizationId }],
        queryFn: async () => {
            const params: Record<string, string> = {};
            if (userId) params.userId = userId;
            if (organizationId) params.organizationId = organizationId;

            const response = await client.api.billing.account.$get({
                query: params,
            });

            if (!response.ok) {
                throw new Error("Failed to fetch billing account");
            }

            return response.json() as Promise<BillingAccountResponse>;
        },
        enabled,
        refetchOnMount,
        refetchOnWindowFocus: true,
    });
}
