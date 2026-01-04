"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, TrendingUp, Activity, HardDrive, Cpu, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { UsageEvent, UsageSummary } from "../types";
import { WorkspaceUsageDrawer } from "./workspace-usage-drawer";

interface WorkspaceUsageData {
    workspaceId: string;
    workspaceName: string;
    trafficGB: number;
    storageGB: number;
    computeUnits: number;
    estimatedCost: number;
    status: "active" | "archived";
}

interface WorkspaceUsageBreakdownProps {
    organizationId: string;
    events?: UsageEvent[];
    summary: UsageSummary | null;
    workspaces?: Array<{ $id: string; name: string }>;
    isLoading?: boolean;
}

// Pricing (example rates - should match billing config)
const PRICING = {
    trafficPerGB: 0.10,
    storagePerGB: 0.02,
    computePerUnit: 0.001,
};

export function WorkspaceUsageBreakdown({
    summary,
    workspaces = [],
    isLoading
}: WorkspaceUsageBreakdownProps) {
    const [sortBy, setSortBy] = useState<keyof WorkspaceUsageData>("estimatedCost");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

    // Helper to get workspace name
    const getWorkspaceName = (id: string) => {
        const ws = workspaces.find(w => w.$id === id);
        return ws ? ws.name : "Unknown Workspace";
    };

    // Aggregate events by workspace
    const workspaceData = useMemo(() => {
        if (!workspaces.length) return [];

        const byWorkspace = summary?.breakdown?.byWorkspace || {};

        // Convert to display format, iterating through ALL workspaces
        return workspaces.map((ws) => {
            const data = byWorkspace[ws.$id] || { traffic: 0, storage: 0, compute: 0 };

            const trafficGB = (data.traffic || 0) / (1024 * 1024 * 1024);
            const storageGB = (data.storage || 0) / (1024 * 1024 * 1024);
            const computeUnits = data.compute || 0;

            const estimatedCost =
                (trafficGB * PRICING.trafficPerGB) +
                (storageGB * PRICING.storagePerGB) +
                (computeUnits * PRICING.computePerUnit);

            return {
                workspaceId: ws.$id,
                workspaceName: ws.name,
                trafficGB,
                storageGB,
                computeUnits,
                estimatedCost,
                status: "active" as const,
            };
        });
    }, [summary, workspaces]);

    const sortedWorkspaces = useMemo(() =>
        [...workspaceData].sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            const multiplier = sortOrder === "asc" ? 1 : -1;
            return (aVal > bVal ? 1 : -1) * multiplier;
        }),
        [workspaceData, sortBy, sortOrder]
    );

    const totals = useMemo(() =>
        workspaceData.reduce(
            (acc, ws) => ({
                trafficGB: acc.trafficGB + ws.trafficGB,
                storageGB: acc.storageGB + ws.storageGB,
                computeUnits: acc.computeUnits + ws.computeUnits,
                estimatedCost: acc.estimatedCost + ws.estimatedCost,
            }),
            { trafficGB: 0, storageGB: 0, computeUnits: 0, estimatedCost: 0 }
        ),
        [workspaceData]
    );

    const handleSort = (column: keyof WorkspaceUsageData) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortBy(column);
            setSortOrder("desc");
        }
    };

    const formatNumber = (num: number, decimals = 2) => {
        return num.toFixed(decimals);
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Workspace Usage Breakdown</CardTitle>
                    <CardDescription>Loading workspace usage data...</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="animate-pulse space-y-3">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-12 bg-muted rounded" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (workspaceData.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Workspace Usage Breakdown
                    </CardTitle>
                    <CardDescription>
                        Usage and costs by workspace for the current billing period
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Inbox className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-center">No usage data available for this period</p>
                        <p className="text-sm text-center mt-2 opacity-75">
                            Usage will appear here once workspaces start generating activity
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Workspace Usage Breakdown
                    </CardTitle>
                    <CardDescription>
                        Usage and costs by workspace for the current billing period
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Workspace</TableHead>
                                    <TableHead
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() => handleSort("trafficGB")}
                                    >
                                        <div className="flex items-center gap-1">
                                            <Activity className="h-3 w-3" />
                                            Traffic
                                            {sortBy === "trafficGB" && (sortOrder === "desc" ? " ↓" : " ↑")}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() => handleSort("storageGB")}
                                    >
                                        <div className="flex items-center gap-1">
                                            <HardDrive className="h-3 w-3" />
                                            Storage
                                            {sortBy === "storageGB" && (sortOrder === "desc" ? " ↓" : " ↑")}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() => handleSort("computeUnits")}
                                    >
                                        <div className="flex items-center gap-1">
                                            <Cpu className="h-3 w-3" />
                                            Compute
                                            {sortBy === "computeUnits" && (sortOrder === "desc" ? " ↓" : " ↑")}
                                        </div>
                                    </TableHead>
                                    <TableHead
                                        className="cursor-pointer hover:bg-muted/50 text-right"
                                        onClick={() => handleSort("estimatedCost")}
                                    >
                                        Est. Cost
                                        {sortBy === "estimatedCost" && (sortOrder === "desc" ? " ↓" : " ↑")}
                                    </TableHead>
                                    <TableHead className="w-[100px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedWorkspaces.map((workspace) => (
                                    <TableRow key={workspace.workspaceId}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                {workspace.workspaceName}
                                                <Badge variant={workspace.status === "active" ? "default" : "secondary"} className="text-xs">
                                                    {workspace.status}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>{formatNumber(workspace.trafficGB)} GB</TableCell>
                                        <TableCell>{formatNumber(workspace.storageGB)} GB</TableCell>
                                        <TableCell>{workspace.computeUnits.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-medium">
                                            ${formatNumber(workspace.estimatedCost)}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSelectedWorkspaceId(workspace.workspaceId)}
                                            >
                                                <ExternalLink className="h-3 w-3 mr-1" />
                                                View
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {/* Totals Row */}
                                <TableRow className="bg-muted/50 font-semibold">
                                    <TableCell className="font-bold">Total</TableCell>
                                    <TableCell>{formatNumber(totals.trafficGB)} GB</TableCell>
                                    <TableCell>{formatNumber(totals.storageGB)} GB</TableCell>
                                    <TableCell>{totals.computeUnits.toLocaleString()}</TableCell>
                                    <TableCell className="text-right font-bold">
                                        ${formatNumber(totals.estimatedCost)}
                                    </TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4">
                        Click column headers to sort. All usage is billed to the organization.
                    </p>
                </CardContent>
            </Card>

            <WorkspaceUsageDrawer
                workspaceId={selectedWorkspaceId}
                workspaceName={selectedWorkspaceId ? getWorkspaceName(selectedWorkspaceId) : undefined}
                isOpen={!!selectedWorkspaceId}
                onClose={() => setSelectedWorkspaceId(null)}
            />
        </>
    );
}
