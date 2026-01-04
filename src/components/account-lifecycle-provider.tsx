"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useGetAccountLifecycle } from "@/features/auth/api/use-account-lifecycle";
import { AccountLifecycleState } from "@/features/auth/types";

/**
 * Initial unresolved lifecycle state.
 */
const INITIAL_STATE: AccountLifecycleState = {
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

interface AccountLifecycleContextValue {
    /** The full lifecycle state */
    lifecycleState: AccountLifecycleState;
    /** Refresh lifecycle state from server */
    refreshLifecycle: () => Promise<void>;
    /** Derived: Is this a PERSONAL account? */
    isPersonal: boolean;
    /** Derived: Is this an ORG account? */
    isOrg: boolean;
    /** Derived: Is the user fully setup (has workspace)? */
    isFullySetup: boolean;
    /** Derived: Is state loaded? */
    isLoaded: boolean;
}

const AccountLifecycleContext = createContext<AccountLifecycleContextValue | null>(null);

interface AccountLifecycleProviderProps {
    children: React.ReactNode;
}

/**
 * AccountLifecycleProvider - The SINGLE source of truth for account lifecycle.
 * 
 * Wraps the application and provides:
 * - lifecycleState: Full account lifecycle state
 * - refreshLifecycle: Function to refresh state
 * - Derived helpers: isPersonal, isOrg, isFullySetup
 * 
 * All components should use useAccountLifecycle() to access lifecycle state.
 */
export function AccountLifecycleProvider({ children }: AccountLifecycleProviderProps) {
    const { lifecycleState, refreshLifecycle, isLoaded } = useGetAccountLifecycle();

    const value = useMemo<AccountLifecycleContextValue>(() => ({
        lifecycleState: lifecycleState ?? INITIAL_STATE,
        refreshLifecycle,
        isPersonal: lifecycleState?.accountType === "PERSONAL",
        isOrg: lifecycleState?.accountType === "ORG",
        isFullySetup: lifecycleState?.hasWorkspace ?? false,
        isLoaded,
    }), [lifecycleState, refreshLifecycle, isLoaded]);

    return (
        <AccountLifecycleContext.Provider value={value}>
            {children}
        </AccountLifecycleContext.Provider>
    );
}

/**
 * Hook to access account lifecycle state.
 * 
 * This is the PRIMARY way to access lifecycle state in the app.
 * All components should use this instead of direct API calls.
 */
export function useAccountLifecycle() {
    const context = useContext(AccountLifecycleContext);
    if (!context) {
        throw new Error("useAccountLifecycle must be used within AccountLifecycleProvider");
    }
    return context;
}

// Legacy aliases for backward compatibility during migration
export { AccountLifecycleProvider as AccountProvider };
export const useAccount = () => {
    const { lifecycleState, refreshLifecycle } = useAccountLifecycle();
    return {
        state: lifecycleState,
        refreshState: refreshLifecycle,
    };
};
