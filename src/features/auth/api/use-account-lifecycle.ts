"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/rpc";
import { AccountLifecycleState } from "../types";

/**
 * Initial unresolved lifecycle state.
 * isLoaded: false indicates state has not been fetched yet.
 */
const INITIAL_LIFECYCLE_STATE: AccountLifecycleState = {
    isLoaded: false,
    isLoading: true,
    isAuthenticated: false,
    hasUser: false,
    isEmailVerified: false,
    hasOrg: false,
    hasWorkspace: false,
    user: null,
    accountType: null,
    activeMember: null,
    activeOrgId: null,
    activeWorkspaceId: null,
};

/**
 * Hook to fetch and manage account lifecycle state.
 * 
 * This is the primary hook for accessing lifecycle state on the client.
 * It fetches from /api/auth/lifecycle and caches the result.
 */
export const useGetAccountLifecycle = () => {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["account-lifecycle"],
        queryFn: async (): Promise<AccountLifecycleState> => {
            const response = await client.api.auth.lifecycle.$get();

            if (!response.ok) {
                // If unauthorized, return unauthenticated state
                return {
                    ...INITIAL_LIFECYCLE_STATE,
                    isLoaded: true,
                    isLoading: false,
                };
            }

            const { data } = await response.json();
            return data as AccountLifecycleState;
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: true,
        retry: 1,
    });

    const refreshLifecycle = async () => {
        await queryClient.invalidateQueries({ queryKey: ["account-lifecycle"] });
    };

    return {
        lifecycleState: query.data ?? INITIAL_LIFECYCLE_STATE,
        isLoaded: query.data?.isLoaded ?? false,
        isLoading: query.isLoading,
        isError: query.isError,
        refreshLifecycle,
    };
};
