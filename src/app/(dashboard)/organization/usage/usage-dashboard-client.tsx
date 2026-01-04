"use client";

import { UsageDashboardClient } from "../../workspaces/[workspaceId]/admin/usage/client";

/**
 * Organization Usage Dashboard Client
 * 
 * Reuses the main UsageDashboardClient but is rendered at the
 * organization level where workspaceId is null.
 */
export function OrganizationUsageDashboardClient() {
    return <UsageDashboardClient />;
}
