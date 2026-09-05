"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
    FileText,
    User,
    Building2,
    UserPlus,
    UserMinus,
    RefreshCcw,
    ChevronLeft,
    ChevronRight,
    Filter,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { useGetOrgAuditLogs } from "../api/use-get-org-audit-logs";
import { OrgAuditAction } from "../audit";

interface AuditLogEntry {
    $id: string;
    organizationId: string;
    actorUserId: string;
    actionType: string;
    metadata: string | Record<string, unknown>;
    timestamp: string;
}

interface OrganizationAuditLogsProps {
    organizationId: string;
}

export function OrganizationAuditLogs({ organizationId }: OrganizationAuditLogsProps) {
    const [offset, setOffset] = useState(0);
    const [actionFilter, setActionFilter] = useState<string>("all");
    const limit = 20;

    const { data, isLoading, isError, refetch, isRefetching } = useGetOrgAuditLogs({
        organizationId,
        limit,
        offset,
        actionType: actionFilter === "all" ? undefined : actionFilter,
    });

    const logs = (data?.data || []) as AuditLogEntry[];
    const total = data?.total || 0;
    const hasNext = offset + limit < total;
    const hasPrev = offset > 0;

    const handleNext = () => setOffset((o) => o + limit);
    const handlePrev = () => setOffset((o) => Math.max(0, o - limit));

    const getActionIcon = (action: string) => {
        switch (action) {
            case OrgAuditAction.ORGANIZATION_CREATED:
            case OrgAuditAction.ORGANIZATION_DELETED:
            case OrgAuditAction.ORGANIZATION_RESTORED:
                return <Building2 className="h-3.5 w-3.5" />;
            case OrgAuditAction.ACCOUNT_CONVERTED:
                return <RefreshCcw className="h-3.5 w-3.5" />;
            case OrgAuditAction.MEMBER_ADDED:
                return <UserPlus className="h-3.5 w-3.5" />;
            case OrgAuditAction.MEMBER_REMOVED:
                return <UserMinus className="h-3.5 w-3.5" />;
            default:
                return <FileText className="h-3.5 w-3.5" />;
        }
    };

    const getActionColor = (action: string) => {
        if (action.includes("deleted") || action.includes("removed") || action.includes("locked")) return "text-red-600 bg-red-100";
        if (action.includes("created") || action.includes("added")) return "text-emerald-600 bg-emerald-100";
        return "text-blue-600 bg-blue-100";
    };

    const getBadgeClass = (action: string) => {
        if (action.includes("deleted") || action.includes("removed") || action.includes("locked"))
            return "bg-red-100 text-red-700 border-red-200";
        if (action.includes("created") || action.includes("added"))
            return "bg-emerald-100 text-emerald-700 border-emerald-200";
        return "bg-blue-100 text-blue-700 border-blue-200";
    };

    const formatAction = (action: string) => {
        return action
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase());
    };

    const formatMetadata = (metadata: string | Record<string, unknown>) => {
        try {
            const parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
            const entries = Object.entries(parsed).slice(0, 3);
            return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
        } catch {
            return "-";
        }
    };

    const safeFormatDate = (timestamp: string | undefined | null, formatStr: string) => {
        try {
            if (!timestamp) return "-";
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return "-";
            return format(date, formatStr);
        } catch {
            return "-";
        }
    };

    if (isError) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Failed to load audit logs</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
                    Try Again
                </Button>
            </div>
        );
    }

    return (
        <section>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-[18px] font-semibold">Audit Logs</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Read-only view of organization activity for compliance
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setOffset(0); }}>
                        <SelectTrigger className="w-[160px] h-8 text-xs">
                            <Filter className="h-3 w-3 mr-1.5" />
                            <SelectValue placeholder="Filter by action" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Actions</SelectItem>
                            <SelectItem value={OrgAuditAction.ORGANIZATION_CREATED}>Created</SelectItem>
                            <SelectItem value={OrgAuditAction.ACCOUNT_CONVERTED}>Converted</SelectItem>
                            <SelectItem value={OrgAuditAction.MEMBER_ADDED}>Member Added</SelectItem>
                            <SelectItem value={OrgAuditAction.MEMBER_REMOVED}>Member Removed</SelectItem>
                            <SelectItem value={OrgAuditAction.MEMBER_ROLE_CHANGED}>Role Changed</SelectItem>
                            <SelectItem value={OrgAuditAction.ORGANIZATION_DELETED}>Deleted</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => refetch()} disabled={isRefetching}>
                        <RefreshCcw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/30 border-b">
                        <Skeleton className="h-4 w-8" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-28" />
                    </div>
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b">
                            <Skeleton className="h-7 w-7 rounded-full" />
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-4 flex-1" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-28" />
                        </div>
                    ))}
                </div>
            ) : logs.length === 0 ? (
                <div className="text-center py-12 border rounded-lg border-dashed text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No audit logs found</p>
                </div>
            ) : (
                <>
                    <div className="border rounded-lg overflow-hidden">
                        {/* Table Header */}
                        <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
                            <div className="w-7 shrink-0" />
                            <div className="w-36 shrink-0">Event</div>
                            <div className="flex-1">Details</div>
                            <div className="w-32 shrink-0">Actor</div>
                            <div className="w-32 shrink-0 text-right">Date & Time</div>
                        </div>

                        {/* Table Body */}
                        <div className="divide-y divide-border">
                            {logs.map((log) => (
                                <div
                                    key={log.$id}
                                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
                                >
                                    <div className="w-7 shrink-0 flex items-center justify-center">
                                        <div className={`size-7 rounded-full flex items-center justify-center ${getActionColor(log.actionType)}`}>
                                            {getActionIcon(log.actionType)}
                                        </div>
                                    </div>
                                    <div className="w-36 shrink-0">
                                        <Badge
                                            variant="outline"
                                            className={`text-[10px] font-medium ${getBadgeClass(log.actionType)}`}
                                        >
                                            {formatAction(log.actionType)}
                                        </Badge>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground truncate">
                                            {formatMetadata(log.metadata)}
                                        </p>
                                    </div>
                                    <div className="w-32 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <User className="h-3 w-3 shrink-0" />
                                        <span className="truncate font-mono">
                                            {log.actorUserId ? `${log.actorUserId.slice(0, 10)}...` : "Unknown"}
                                        </span>
                                    </div>
                                    <div className="w-32 shrink-0 text-right">
                                        <p className="text-xs font-medium">
                                            {safeFormatDate(log.timestamp, "MMM d, yyyy")}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {safeFormatDate(log.timestamp, "h:mm a")}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4 pt-2">
                        <p className="text-xs text-muted-foreground">
                            Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
                        </p>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={handlePrev}
                                disabled={!hasPrev}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={handleNext}
                                disabled={!hasNext}
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}
