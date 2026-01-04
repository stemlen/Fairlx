"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAccountLifecycle } from "@/components/account-lifecycle-provider";
import { useGetWorkspaces } from "@/features/workspaces/api/use-get-workspaces";
import { useGetOrganizations } from "@/features/organizations/api/use-get-organizations";

/**
 * App Readiness Provider - Data Loading Layer
 * 
 * NOTE: Routing/lifecycle guards are now handled by LifecycleGuard.
 * This provider only handles data loading readiness.
 * 
 * The app is considered READY when:
 * - Lifecycle state is loaded
 * - Workspaces are loaded
 * - Organizations are loaded (if ORG account)
 */

interface AppReadinessContextValue {
    isAppReady: boolean;
    isTimedOut: boolean;
    loadingMessage: string;
    retry: () => void;
}

const AppReadinessContext = createContext<AppReadinessContextValue | undefined>(undefined);

const TIMEOUT_MS = 15000; // 15 seconds

export const useAppReadiness = () => {
    const context = useContext(AppReadinessContext);
    if (!context) {
        throw new Error("useAppReadiness must be used within AppReadinessProvider");
    }
    return context;
};

interface AppReadinessProviderProps {
    children: React.ReactNode;
}

export const AppReadinessProvider = ({ children }: AppReadinessProviderProps) => {
    const [isTimedOut, setIsTimedOut] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    const { lifecycleState, isLoaded, refreshLifecycle } = useAccountLifecycle();
    const {
        isAuthenticated,
        hasOrg
    } = lifecycleState;

    const { isLoading: isWorkspacesLoading, refetch: refetchWorkspaces } = useGetWorkspaces();
    const { isLoading: isOrgsLoading, refetch: refetchOrgs } = useGetOrganizations();

    // Calculate overall loading state
    const isLoading = !isLoaded || isWorkspacesLoading || (hasOrg && isOrgsLoading);

    // App is ready when all data is loaded
    const isAppReady = !isLoading && isAuthenticated && !isTimedOut;

    // Determine loading message
    const getLoadingMessage = useCallback(() => {
        if (!isLoaded) return "Setting things up…";
        if (isWorkspacesLoading) return "Loading your workspace…";
        if (isOrgsLoading && hasOrg) return "Loading organization…";
        return "Almost ready…";
    }, [isLoaded, isWorkspacesLoading, isOrgsLoading, hasOrg]);

    const retry = useCallback(() => {
        setIsTimedOut(false);
        setRetryCount((c) => c + 1);
        refreshLifecycle();
        refetchWorkspaces();
        if (hasOrg) {
            refetchOrgs();
        }
    }, [refreshLifecycle, refetchWorkspaces, refetchOrgs, hasOrg]);

    // Timeout handling
    useEffect(() => {
        if (isAppReady) {
            setIsTimedOut(false);
            return;
        }

        const timer = setTimeout(() => {
            if (!isAppReady) {
                setIsTimedOut(true);
            }
        }, TIMEOUT_MS);

        return () => clearTimeout(timer);
    }, [isAppReady, retryCount]);

    const value: AppReadinessContextValue = {
        isAppReady,
        isTimedOut,
        loadingMessage: getLoadingMessage(),
        retry,
    };

    return (
        <AppReadinessContext.Provider value={value}>
            {children}
        </AppReadinessContext.Provider>
    );
};
