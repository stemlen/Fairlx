"use client";

import { useState, useMemo } from "react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
    CalendarIcon,
    RefreshCw,
    Shield,
    Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { PageLoader } from "@/components/page-loader";
import { PageError } from "@/components/page-error";
import { cn } from "@/lib/utils";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";
import { useGetWorkspaces } from "@/features/workspaces/api/use-get-workspaces";
import { useGetProjects } from "@/features/projects/api/use-get-projects";
import { useCurrentMember } from "@/features/members/hooks/use-current-member";
import { useCurrent } from "@/features/auth/api/use-current";
import { useAccountType } from "@/features/organizations/hooks/use-account-type";
import { useGetOrganizations } from "@/features/organizations/api/use-get-organizations";
import { useCurrentOrgMember } from "@/features/organizations/api/use-current-org-member";
import {
    useGetUsageEvents,
    useGetUsageSummary,
    useGetUsageAlerts,
    useExportUsage,
} from "@/features/usage/api";
import {
    UsageKPICards,
    UsageCharts,
    UsageEventsTable,
    UsageAlertsManager,
    CostSummary,
    WorkspaceUsageBreakdown,
} from "@/features/usage/components";
import { BillingEntityBadge } from "@/components/billing-entity-badge";
import { ResourceType, UsageSource } from "@/features/usage/types";

export function UsageDashboardClient() {
    const workspaceId = useWorkspaceId();
    const { data: user } = useCurrent();
    const { isAdmin, isLoading: isMemberLoading } = useCurrentMember({ workspaceId });
    const { isOrg, primaryOrganizationId } = useAccountType();
    const { data: organizations } = useGetOrganizations();
    const { data: workspacesData } = useGetWorkspaces();
    const { data: projectsData } = useGetProjects({ workspaceId });
    const { canEdit: isOrgAdmin, isLoading: isOrgMemberLoading } = useCurrentOrgMember({
        organizationId: primaryOrganizationId || ""
    });

    // Get current org for ORG accounts
    const currentOrg = isOrg && primaryOrganizationId
        ? organizations?.documents?.find((o: { $id: string }) => o.$id === primaryOrganizationId)
        : null;

    // Create name lookup maps for context display
    const workspaceNames = useMemo(() => {
        const map = new Map<string, string>();
        if (workspacesData?.documents) {
            for (const ws of workspacesData.documents) {
                map.set(ws.$id, ws.name);
            }
        }
        return map;
    }, [workspacesData]);

    const projectNames = useMemo(() => {
        const map = new Map<string, string>();
        if (projectsData?.documents) {
            for (const proj of projectsData.documents) {
                map.set(proj.$id, proj.name);
            }
        }
        return map;
    }, [projectsData]);

    // State for filters
    const [page, setPage] = useState(0);
    const pageSize = 10;
    const [resourceTypeFilter, setResourceTypeFilter] = useState<ResourceType | undefined>();
    const [sourceFilter, setSourceFilter] = useState<UsageSource | undefined>();
    const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    // Current period for summary
    const currentPeriod = format(new Date(), "yyyy-MM");

    // CRITICAL FIX: Determine query parameters based on account type
    // For ORG accounts, use organizationId for org-level aggregation
    // For PERSONAL accounts, use workspaceId for workspace-level queries
    const usageQueryParams = isOrg && primaryOrganizationId
        ? { organizationId: primaryOrganizationId }
        : { workspaceId };

    // Queries - now using correct context for org vs personal
    const {
        data: eventsData,
        isLoading: isEventsLoading,
        refetch: refetchEvents,
    } = useGetUsageEvents({
        ...usageQueryParams,
        resourceType: resourceTypeFilter,
        source: sourceFilter,
        startDate: dateRange.from?.toISOString(),
        endDate: dateRange.to?.toISOString(),
        limit: pageSize,
        offset: page * pageSize,
    });

    const { data: summaryData, isLoading: isSummaryLoading } = useGetUsageSummary({
        ...usageQueryParams,
        period: currentPeriod,
    });

    const { data: alertsData, isLoading: isAlertsLoading } = useGetUsageAlerts({
        ...usageQueryParams,
    });

    const exportUsage = useExportUsage();

    // Handle export
    const handleExport = async (format: "csv" | "json") => {
        try {
            const result = await exportUsage.mutateAsync({
                ...usageQueryParams,
                format,
                startDate: dateRange.from?.toISOString(),
                endDate: dateRange.to?.toISOString(),
                resourceType: resourceTypeFilter,
            });

            if (format === "csv" && result instanceof Blob) {
                const url = URL.createObjectURL(result);
                const a = document.createElement("a");
                a.href = url;
                a.download = `usage-export-${new Date().toISOString().split("T")[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else if (format === "json") {
                const blob = new Blob([JSON.stringify(result, null, 2)], {
                    type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `usage-export-${new Date().toISOString().split("T")[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error("Export failed:", error);
        }
    };

    // Loading state
    if (isMemberLoading || isOrgMemberLoading) {
        return <PageLoader />;
    }

    // Admin check - either workspace admin (if in workspace) or org admin (if org account)
    const hasAdminAccess = workspaceId ? isAdmin : (isOrg && isOrgAdmin);

    if (!hasAdminAccess) {
        return (
            <PageError message="You need admin access to view the usage dashboard." />
        );
    }

    const events = eventsData?.data?.documents || [];
    const totalEvents = eventsData?.data?.total || 0;
    const summary = summaryData?.data || null;
    const alerts = alertsData?.data?.documents || [];

    return (
        <div>
            <div className="max-w-[1600px] mx-auto">
                {/* Header Section - Matching workspace dashboard style */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-blue-600 dark:text-blue-400">
                            {isOrg
                                ? "Organization-wide usage monitoring and billing insights"
                                : "Monitor and optimize your resource usage"}
                        </p>
                        <BillingEntityBadge />
                    </div>
                    <div className="flex items-center gap-3 mb-1">
                        {isOrg && <Building2 className="h-8 w-8 text-primary" />}
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                            {isOrg
                                ? `${(currentOrg as { name?: string })?.name || "Organization"} Usage Dashboard`
                                : `Welcome to Admin Dashboard${user?.name ? `, ${user.name.split(' ')[0]}` : ""}.`}
                        </h1>
                    </div>
                    {isOrg && (
                        <p className="text-sm text-muted-foreground">
                            Viewing aggregated usage across all workspaces in your organization
                        </p>
                    )}
                </div>

                {/* Toolbar - Matching workspace dashboard style */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <Shield className="h-3.5 w-3.5" />
                            <span className="font-medium">Admin Only</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Date Range Picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                        "justify-start text-left font-normal text-xs bg-blue-50 dark:bg-slate-700 text-blue-900 dark:text-blue-100 px-3 py-1.5 border border-blue-200 dark:border-slate-600 hover:bg-blue-100 dark:hover:bg-slate-600",
                                        !dateRange.from && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                    {dateRange.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "LLL dd")} -{" "}
                                                {format(dateRange.to, "LLL dd, y")}
                                            </>
                                        ) : (
                                            format(dateRange.from, "LLL dd, y")
                                        )
                                    ) : (
                                        <span>Pick a date range</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange.from}
                                    selected={{ from: dateRange.from, to: dateRange.to }}
                                    onSelect={(range) =>
                                        setDateRange({ from: range?.from, to: range?.to })
                                    }
                                    numberOfMonths={2}
                                />
                                <div className="flex gap-2 p-3 border-t">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setDateRange({
                                                from: startOfMonth(new Date()),
                                                to: endOfMonth(new Date()),
                                            })
                                        }
                                    >
                                        This Month
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const lastMonth = subMonths(new Date(), 1);
                                            setDateRange({
                                                from: startOfMonth(lastMonth),
                                                to: endOfMonth(lastMonth),
                                            });
                                        }}
                                    >
                                        Last Month
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => refetchEvents()}
                            className="h-7 w-7 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        >
                            <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </Button>
                    </div>
                </div>

                {/* Main Grid Layout - Matching workspace dashboard 12-column grid */}
                <div className="grid grid-cols-12 gap-4">
                    {/* Left Section (9 columns) */}
                    <div className="col-span-12 xl:col-span-9 space-y-4">
                        {/* KPI Cards */}
                        <UsageKPICards summary={summary} isLoading={isSummaryLoading} />

                        {/* Charts */}
                        <UsageCharts events={events} summary={summary} isLoading={isEventsLoading || isSummaryLoading} />

                        {/* Events Table */}
                        <UsageEventsTable
                            events={events}
                            total={totalEvents}
                            isLoading={isEventsLoading}
                            page={page}
                            pageSize={pageSize}
                            onPageChange={setPage}
                            onExport={handleExport}
                            resourceTypeFilter={resourceTypeFilter}
                            sourceFilter={sourceFilter}
                            onResourceTypeFilterChange={setResourceTypeFilter}
                            onSourceFilterChange={setSourceFilter}
                            workspaceNames={workspaceNames}
                            projectNames={projectNames}
                            dateRange={dateRange}
                            onDateRangeChange={setDateRange}
                        />

                        {/* Workspace Breakdown - ORG accounts only */}
                        {isOrg && primaryOrganizationId && (
                            <WorkspaceUsageBreakdown
                                organizationId={primaryOrganizationId}
                                events={eventsData?.data?.documents || []}
                                summary={summary}
                                workspaces={workspacesData?.documents?.map((w) => ({ $id: w.$id, name: w.name })) || []}
                                isLoading={isEventsLoading || isSummaryLoading}
                            />
                        )}
                    </div>

                    {/* Right Sidebar (3 columns) - Matching workspace dashboard */}
                    <div className="col-span-12 xl:col-span-3 flex flex-col space-y-4">
                        {/* Cost Summary */}
                        <CostSummary summary={summary} isLoading={isSummaryLoading} />

                        {/* Alerts Manager */}
                        <UsageAlertsManager
                            alerts={alerts}
                            workspaceId={workspaceId}
                            isLoading={isAlertsLoading}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
