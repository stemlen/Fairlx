"use client";

import React, { createContext, useContext, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useGetAccountLifecycle, LifecycleRouting } from "@/features/auth/api/use-account-lifecycle";
import { AccountLifecycleState } from "@/features/auth/types";

const AppTour = dynamic(() => import("./app-tour").then((mod) => mod.AppTour), {
  ssr: false,
});

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
    activeOrgName: null,
    activeOrgImageUrl: null,
    activeWorkspaceId: null,
    mustResetPassword: false,
    orgRole: null,
    mustAcceptLegal: false,
    legalBlocked: false,
    isTrialExpired: false,
    trialCreditGranted: false,
    trialCreditExpiresAt: null,
};

const INITIAL_ROUTING: LifecycleRouting = {
    state: "LOADING",
    redirectTo: null, // CRITICAL: Don't redirect during initial load
    allowedPaths: [],
    blockedPaths: [], // Don't block anything during initial load
    isTrialExpired: false,
    trialCreditGranted: false,
    trialCreditExpiresAt: null,
};

interface AccountLifecycleContextValue {
    /** The full lifecycle state */
    lifecycleState: AccountLifecycleState;
    /** Server-derived lifecycle routing (state, redirectTo, allowed/blocked paths) */
    lifecycleRouting: LifecycleRouting;
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
    /** 
     * Derived: Is this an ORG member without workspace (restricted mode)?
     * These users should NOT see Create Workspace, Manage Org CTAs.
     */
    isRestrictedOrgMember: boolean;
    /**
     * Derived: Can this user create workspaces?
     * - PERSONAL accounts: yes (up to their limit)
     * - ORG OWNER/ADMIN: yes
     * - ORG MEMBER/MODERATOR: NO
     */
    canCreateWorkspace: boolean;
    /**
     * Derived: Can this user manage auth providers (link Google/GitHub)?
     * - PERSONAL accounts: yes
     * - ORG OWNER/ADMIN: yes
     * - ORG MEMBER/MODERATOR: NO (managed by org)
     */
    canManageAuthProviders: boolean;
}

const AccountLifecycleContext = createContext<AccountLifecycleContextValue | null>(null);

interface AccountLifecycleProviderProps {
    children: React.ReactNode;
}

/**
 * AccountLifecycleProvider - The SINGLE source of truth for account lifecycle STATE.
 * 
 * IMPORTANT: This provider ONLY provides state. All routing decisions are handled
 * exclusively by LifecycleGuard to prevent race conditions and duplicate redirects.
 * 
 * Provides:
 * - lifecycleState: Full account lifecycle state
 * - lifecycleRouting: Server-derived routing rules (consumed by LifecycleGuard)
 * - refreshLifecycle: Function to refresh state
 * - Derived helpers: isPersonal, isOrg, isFullySetup, isRestrictedOrgMember, canCreateWorkspace, canManageAuthProviders
 * 
 * All components should use useAccountLifecycle() to access lifecycle state.
 */
export function AccountLifecycleProvider({ children }: AccountLifecycleProviderProps) {
    const { lifecycleState, lifecycleRouting, refreshLifecycle, isLoaded } = useGetAccountLifecycle();

    const value = useMemo<AccountLifecycleContextValue>(() => {
        const state = lifecycleState ?? INITIAL_STATE;
        const routing = lifecycleRouting ?? INITIAL_ROUTING;
        const isOrg = state.accountType === "ORG";
        const isPersonal = state.accountType === "PERSONAL";
        const isOwner = state.orgRole === "OWNER";

        // SECURITY: Only OWNER has implicit org-level permissions
        // ADMIN/MODERATOR/MEMBER must use department-based permissions
        // (checked via useUserAccess hook, not here)

        // Workspace creation: PERSONAL or ORG OWNER only
        // Non-owner org members need WORKSPACE_CREATE permission from departments
        const canCreateWorkspace = isPersonal || isOwner;

        // Auth provider linking: PERSONAL or ORG OWNER only
        // Non-owner org members cannot link - managed by organization
        const canManageAuthProviders = isPersonal || isOwner;

        return {
            lifecycleState: state,
            lifecycleRouting: routing,
            refreshLifecycle,
            isPersonal,
            isOrg,
            isFullySetup: state.hasWorkspace ?? false,
            isLoaded,
            // Restricted mode: (ORG OR has membership) + not OWNER + no workspace
            // This ensures invited members see the holding state even if accountType is not yet synced
            isRestrictedOrgMember: (isOrg || state.hasOrg) && !isOwner && !state.hasWorkspace,
            canCreateWorkspace,
            canManageAuthProviders,
        };
    }, [lifecycleState, lifecycleRouting, refreshLifecycle, isLoaded]);

    const pathname = usePathname();

    // SECURITY & UX: Re-verify lifecycle state on every navigation
    // This ensures that state transitions (e.g. finishing onboarding) are reflected immediately
    // without requiring manual refreshes or waiting for the poll interval.
    useEffect(() => {
        if (isLoaded) {
            refreshLifecycle();
        }
    }, [pathname, isLoaded, refreshLifecycle]);

    // NOTE: Route guards are handled exclusively by LifecycleGuard.
    // This provider MUST NOT redirect - it only provides state.

    return (
        <AccountLifecycleContext.Provider value={value}>
            {children}
            {value.isFullySetup && (
                <AppTour />
            )}
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
