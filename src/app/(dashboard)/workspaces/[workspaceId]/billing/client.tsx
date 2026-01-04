"use client";

import { useParams } from "next/navigation";
import { Building2, CreditCard, TrendingUp, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAccountType } from "@/features/organizations/hooks/use-account-type";
import { useGetOrganizations } from "@/features/organizations/api/use-get-organizations";
import { useGetUsageSummary } from "@/features/usage/api/use-get-usage-summary";
import { useGetUsageEvents } from "@/features/usage/api/use-get-usage-events";
import { WorkspaceUsageBreakdown } from "@/features/usage/components";

export const BillingDashboardClient = () => {
    const params = useParams();
    const workspaceId = params.workspaceId as string;
    const { isOrg, primaryOrganizationId, accountType } = useAccountType();
    const { data: organizations } = useGetOrganizations();
    const { data: usageSummary, isLoading: usageLoading } = useGetUsageSummary({
        workspaceId,
        period: new Date().toISOString().slice(0, 7), // Current month YYYY-MM
    });

    // Fetch events for workspace breakdown
    const { data: eventsData, isLoading: eventsLoading } = useGetUsageEvents({
        workspaceId: isOrg ? undefined : workspaceId,
        organizationId: isOrg ? primaryOrganizationId : undefined,
        limit: 500,
    });

    // Get current org for ORG accounts
    const currentOrg = isOrg && primaryOrganizationId
        ? organizations?.documents?.find((o: { $id: string }) => o.$id === primaryOrganizationId)
        : null;

    return (
        <div className="flex flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Billing & Usage</h1>
                    <p className="text-muted-foreground">
                        {isOrg
                            ? `Organization billing for ${(currentOrg as { name?: string })?.name || "your organization"}`
                            : "Personal account billing"
                        }
                    </p>
                </div>
                <Badge variant={isOrg ? "default" : "secondary"} className="text-xs">
                    {accountType} Account
                </Badge>
            </div>

            <Separator />

            {/* Billing Entity Card */}
            <Card>
                <CardHeader className="flex flex-row items-center gap-3">
                    {isOrg ? (
                        <Building2 className="h-8 w-8 text-primary" />
                    ) : (
                        <CreditCard className="h-8 w-8 text-primary" />
                    )}
                    <div>
                        <CardTitle>
                            {isOrg ? (currentOrg as { name?: string })?.name || "Organization" : "Personal Plan"}
                        </CardTitle>
                        <CardDescription>
                            {isOrg
                                ? "All workspaces in this organization share billing"
                                : "Individual workspace billing"
                            }
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground">Billing Scope</span>
                            <span className="font-medium">{isOrg ? "Organization" : "User"}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground">Billing Entity ID</span>
                            <span className="font-mono text-sm truncate">
                                {isOrg ? primaryOrganizationId : "User"}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground">Current Period</span>
                            <span className="font-medium flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Usage Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Traffic Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {usageLoading ? "..." : `${usageSummary?.data?.trafficTotalGB?.toFixed(2) || 0} GB`}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <TrendingUp className="h-3 w-3" />
                            This month
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Storage Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {usageLoading ? "..." : `${usageSummary?.data?.storageAvgGB?.toFixed(2) || 0} GB`}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            Average this month
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Compute Units
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {usageLoading ? "..." : (usageSummary?.data?.computeTotalUnits?.toLocaleString() || 0)}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            AI + automation
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Organization Workspaces Breakdown (ORG only) */}
            {isOrg && primaryOrganizationId && (
                <WorkspaceUsageBreakdown
                    organizationId={primaryOrganizationId}
                    summary={usageSummary?.data || null}
                    events={eventsData?.data?.documents || []}
                    isLoading={usageLoading || eventsLoading}
                />
            )}

            {/* Upgrade CTA for Personal accounts */}
            {!isOrg && (
                <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
                    <CardContent className="py-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold">Upgrade to Organization</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Create unlimited workspaces, invite team members, and get organization-level billing.
                                </p>
                            </div>
                            <Button>
                                <Building2 className="mr-2 h-4 w-4" />
                                Upgrade Now
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
