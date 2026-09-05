"use client";

import { useCurrent } from "@/features/auth/api/use-current";
import { useAccountType } from "@/features/organizations/hooks/use-account-type";
import { useGetBillingAccount } from "@/features/billing/api";
import { BillingStatus } from "@/features/billing/types";
import { WALLET_OVERDRAFT_LIMIT_USD } from "@/lib/ai-billing";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";

export function useWalletBillingAlert() {
    const { data: user, isLoading: isUserLoading } = useCurrent();
    const { isOrg, primaryOrganizationId, isLoading: isAccountLoading } = useAccountType();
    const workspaceId = useWorkspaceId();

    const organizationId = isOrg ? primaryOrganizationId : undefined;
    const userId = !organizationId ? user?.$id : undefined;

    const query = useGetBillingAccount({
        userId,
        organizationId,
        enabled: Boolean(userId || organizationId),
        refetchOnMount: "always",
    });

    const balance = query.data?.walletBalance ?? query.data?.availableBalance ?? 0;
    const status = query.data?.data?.billingStatus as BillingStatus | undefined;
    const locked =
        status === BillingStatus.SUSPENDED ||
        balance <= -WALLET_OVERDRAFT_LIMIT_USD;
    const negative = balance < 0;

    return {
        isLoading: isUserLoading || isAccountLoading || query.isLoading,
        balance,
        status,
        locked,
        negative,
        organizationId,
        billingHref: organizationId
            ? "/organization/billing"
            : workspaceId
                ? `/workspaces/${workspaceId}/billing`
                : "/organization/billing",
        lockThreshold: WALLET_OVERDRAFT_LIMIT_USD,
        refetch: query.refetch,
    };
}
