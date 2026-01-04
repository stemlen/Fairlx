"use client";

import { createContext, useContext, useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AccountState } from "@/features/auth/types";
import { resolveAccountState } from "@/features/auth/server/actions";

type AccountContextType = {
    state: AccountState;
    refreshState: () => Promise<void>;
};

const AccountContext = createContext<AccountContextType | null>(null);

const PUBLIC_ROUTES = [
    "/sign-in",
    "/sign-up",
    "/verify-email",
    "/forgot-password",
    "/reset-password"
];

export function AccountProvider({ children, initialState }: { children: React.ReactNode, initialState: AccountState }) {
    const [state, setState] = useState<AccountState>(initialState);
    const [, startTransition] = useTransition();
    const router = useRouter();
    const pathname = usePathname();

    const refreshState = async () => {
        startTransition(async () => {
            try {
                const newState = await resolveAccountState();
                setState(newState);
            } catch (error) {
                console.error("Failed to refresh account state", error);
            }
        });
    };

    // Route Guards
    useEffect(() => {
        if (state.isLoading) return;

        const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));

        // 1. Unauthenticated User on Protected Route
        if (!state.isAuthenticated && !isPublicRoute) {
            // Let middleware handle this primarily, but client-side backup:
            // router.push("/sign-in");
            // Commented out to avoid conflict with middleware
            return;
        }

        // 2. Authenticated but Email NOT Verified
        if (state.isAuthenticated && !state.isEmailVerified && !isPublicRoute && pathname !== "/verify-email-sent") {
            // router.push("/verify-email-needed"); 
            // Allow them to proceed for now, blocking at specific actions might be better UX
            // Or redirect if strictly enforced
        }

        // 3. Authenticated Logic
        if (state.isAuthenticated && !isPublicRoute) {

            // Case A: No Account Type Selected -> Always Onboarding
            if (!state.accountType && !pathname.startsWith("/onboarding")) {
                router.push("/onboarding");
                return;
            }

            // Case B: ORG Account - Needs Org + Workspace
            if (state.accountType === "ORG") {
                // 1. Missing Org
                if (!state.hasOrg && !pathname.startsWith("/onboarding") && !pathname.startsWith("/invite") && !pathname.startsWith("/join")) {
                    router.push("/onboarding");
                    return;
                }

                // 2. Has Org but No Workspace
                if (state.hasOrg && !state.hasWorkspace) {
                    // Allowed routes: /welcome, /organization, /onboarding, /invite, /join
                    const allowedOnboardingPaths = ["/welcome", "/organization", "/onboarding", "/invite", "/join"];
                    const isAllowed = allowedOnboardingPaths.some(p => pathname.startsWith(p));
                    if (!isAllowed && pathname.startsWith("/workspaces")) {
                        router.push("/welcome");
                        return;
                    }
                }
            }

            // Case C: PERSONAL Account - Needs Workspace
            if (state.accountType === "PERSONAL") {
                if (!state.hasWorkspace && !pathname.startsWith("/onboarding")) {
                    router.push("/onboarding");
                    return;
                }
            }

            // Case D: Fully Setup - Block access to onboarding and welcome
            if (state.hasWorkspace) {
                if (pathname.startsWith("/onboarding") || pathname === "/welcome") {
                    // Redirect to active workspace or first one
                    if (state.activeWorkspaceId) {
                        router.push(`/workspaces/${state.activeWorkspaceId}`);
                    } else {
                        router.push("/");
                    }
                    return;
                }
            }
        }

    }, [pathname, state, router]);

    return (
        <AccountContext.Provider value={{ state, refreshState }}>
            {children}
        </AccountContext.Provider>
    );
}

export const useAccount = () => {
    const context = useContext(AccountContext);
    if (!context) {
        throw new Error("useAccount must be used within an AccountProvider");
    }
    return context;
};
