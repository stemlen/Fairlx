import { redirect } from "next/navigation";
import { getCurrent } from "@/features/auth/queries";
import { OrganizationUsageDashboardClient } from "./usage-dashboard-client";

/**
 * Organization-level Usage Dashboard
 * 
 * Accessible at /organization/usage
 * Shows aggregated usage across all workspaces in the organization.
 */
export default async function OrganizationUsagePage() {
    const user = await getCurrent();

    if (!user) {
        redirect("/sign-in");
    }

    // Check if this is an ORG account
    const prefs = user.prefs || {};
    if (prefs.accountType !== "ORG") {
        redirect("/");
    }

    return <OrganizationUsageDashboardClient />;
}
