"use client";

import { cn } from "@/lib/utils";
import { Settings, User, FolderKanban, Users2, Calendar, Clock as ClockIcon, Activity, Layers, Shield, Building2, CreditCard } from "lucide-react";
import Link from "next/link";
import {
  GoCheckCircle,
  GoCheckCircleFill,
  GoHome,
  GoHomeFill,
} from "react-icons/go";

import { usePathname } from "next/navigation";
import { useCurrentMember } from "@/features/members/hooks/use-current-member";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";
import { useProjectId } from "@/features/projects/hooks/use-project-id";

import { useCurrentOrgMember } from "@/features/organizations/api/use-current-org-member";

/**
 * Route configuration with scope distinction:
 * - workspaceScoped: true = requires active workspace (hidden when no workspace)
 * - orgRoute: true = uses dashboard-level route (not workspace-prefixed)
 */
const routes = [
  {
    label: "Home",
    href: "",
    icon: GoHome,
    activeIcon: GoHomeFill,
    workspaceScoped: true, // Only available when workspace exists
  },
  {
    label: "My Spaces",
    href: "/tasks",
    icon: GoCheckCircle,
    activeIcon: GoCheckCircleFill,
    workspaceScoped: true,
  },
  {
    label: "Programs",
    href: "/programs",
    icon: FolderKanban,
    activeIcon: FolderKanban,
    workspaceScoped: true,
  },
  {
    label: "Spaces",
    href: "/spaces",
    icon: Layers,
    activeIcon: Layers,
    workspaceScoped: true,
  },
  {
    label: "Teams",
    href: "/teams",
    icon: Users2,
    activeIcon: Users2,
    workspaceScoped: true,
  },
  {
    label: "Timeline",
    href: "/timeline",
    icon: Calendar,
    activeIcon: Calendar,
    workspaceScoped: true,
  },
  {
    label: "Time Tracking",
    href: "/time-tracking",
    icon: ClockIcon,
    activeIcon: ClockIcon,
    workspaceScoped: true,
  },
  {
    label: "Audit Log",
    href: "/audit-logs",
    icon: Activity,
    activeIcon: Activity,
    workspaceScoped: true,
  },
  {
    label: "Admin Panel",
    href: "/admin/usage",
    icon: Shield,
    activeIcon: Shield,
    adminOnly: true,
    workspaceScoped: true,
  },
  {
    label: "Billing",
    href: "/billing",
    icon: CreditCard,
    activeIcon: CreditCard,
    adminOnly: true,
    workspaceScoped: true,
  },
  {
    label: "Organization",
    href: "/organization",
    icon: Building2,
    activeIcon: Building2,
    orgOnly: true, // Only show for ORG accounts
    orgAdminOnly: true, // Requires org admin/owner role
    orgRoute: true, // Uses dashboard-level route (not workspace-prefixed)
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    activeIcon: Settings,
    workspaceScoped: true,
  },
  {
    label: "Members",
    href: "/members",
    icon: User,
    activeIcon: User,
    workspaceScoped: true,
  },
];

interface NavigationProps {
  hasWorkspaces?: boolean;
}

import { useAccountLifecycle } from "@/components/account-lifecycle-provider";

export const Navigation = ({ hasWorkspaces = true }: NavigationProps) => {
  const urlWorkspaceId = useWorkspaceId();
  const { lifecycleState: state } = useAccountLifecycle();
  const { hasOrg, activeOrgId, activeWorkspaceId } = state;

  // Use URL workspaceId if available, otherwise fallback to global active workspaceId
  const selectedWorkspaceId = urlWorkspaceId || activeWorkspaceId;

  const projectId = useProjectId();
  const pathname = usePathname();
  const { isAdmin } = useCurrentMember({ workspaceId: (selectedWorkspaceId || "") as string });

  const { canEdit: isOrgAdmin } = useCurrentOrgMember({
    organizationId: (activeOrgId || "") as string
  });

  // Filter routes based on permissions, account type, and workspace existence
  const visibleRoutes = routes.filter(route => {
    // Hide workspace-scoped routes ONLY if user has no workspaces at all
    if (route.workspaceScoped && !hasWorkspaces) return false;
    // Hide workspace admin-only routes for non-admins (when in workspace context)
    if (route.adminOnly && hasWorkspaces && !isAdmin) return false;
    // Hide org-only routes for PERSONAL accounts
    if (route.orgOnly && !hasOrg) return false;
    // Hide org admin-only routes for non org-admins
    if (route.orgAdminOnly && !isOrgAdmin) return false;
    return true;
  });

  return (
    <div className="p-3 border-b-[1.5px] border-neutral-200 flex-shrink-0">
      <ul className="flex flex-col ">
        {visibleRoutes.map((item) => {
          // Determine the correct href based on route type
          let fullHref: string;
          let isActive: boolean;
          let isOrgRoute = item.orgRoute;

          // Special case: Admin Panel should be org-level for ORG accounts
          if (item.label === "Admin Panel" && hasOrg) {
            fullHref = "/organization/usage";
            isActive = pathname === "/organization/usage";
            isOrgRoute = true;
          } else if (isOrgRoute) {
            // Org-level routes: dashboard-level, no workspace prefix
            fullHref = item.href;
            isActive = pathname === item.href;
          } else {
            // Workspace-scoped routes require an ID
            if (!selectedWorkspaceId) return null;

            if (item.href === "/timeline") {
              // Timeline: pass workspaceId and projectId as search params for SSR
              fullHref = `/workspaces/${selectedWorkspaceId}${item.href}?workspaceId=${selectedWorkspaceId}${projectId ? `&projectId=${projectId}` : ""}`;
            } else {
              // Standard workspace-scoped routes
              fullHref = `/workspaces/${selectedWorkspaceId}${item.href}`;
            }
            isActive = pathname === `/workspaces/${selectedWorkspaceId}${item.href}`;
          }

          const Icon = isActive ? item.activeIcon : item.icon;

          return (
            <div key={item.href || item.label}>
              <Link href={fullHref}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 p-2.5 rounded-md font-medium  transition text-neutral-500",
                    isActive && "bg-neutral-200 shadow-sm hover:opacity-100 text-primary"
                  )}
                >
                  <Icon className={cn("size-5 text-neutral-500", isActive && "text-primary")} />
                  <p className="text-[13px] tracking-tight font-medium">
                    {item.label}
                  </p>
                </div>
              </Link>
            </div>
          );
        })}
      </ul>
    </div>
  );
};

