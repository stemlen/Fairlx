import { Models } from "node-appwrite";

/**
 * AccountLifecycleState - The single source of truth for account lifecycle.
 * 
 * isLoaded: Distinguishes between initial unresolved state (false) and fully resolved state (true).
 * Once isLoaded === true, no field should be undefined.
 */
export type AccountLifecycleState = {
    isLoaded: boolean;
    isLoading: boolean;
    isAuthenticated: boolean;
    hasUser: boolean;
    isEmailVerified: boolean;
    hasOrg: boolean;
    hasWorkspace: boolean;
    user: Models.User<Models.Preferences> | null;
    accountType: "PERSONAL" | "ORG" | null;
    activeMember: Models.Document | null;
    activeOrgId: string | null;
    activeWorkspaceId: string | null;
};

// Legacy alias for backward compatibility during migration
export type AccountState = AccountLifecycleState;
