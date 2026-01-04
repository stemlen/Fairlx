"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
    Activity,
    HardDrive,
    Cpu,
    Download,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Filter,
    CalendarClock,
    X,
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UsageEvent, ResourceType, UsageSource } from "../types";

interface UsageEventsTableProps {
    events: UsageEvent[];
    total: number;
    isLoading: boolean;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onExport: (format: "csv" | "json") => void;
    resourceTypeFilter?: ResourceType;
    sourceFilter?: UsageSource;
    onResourceTypeFilterChange: (type: ResourceType | undefined) => void;
    onSourceFilterChange: (source: UsageSource | undefined) => void;
    /** Lookup map: workspaceId -> workspaceName */
    workspaceNames?: Map<string, string>;
    /** Lookup map: projectId -> projectName */
    projectNames?: Map<string, string>;
    dateRange?: { from?: Date; to?: Date };
    onDateRangeChange?: (range: { from?: Date; to?: Date }) => void;
}

const getResourceIcon = (type: ResourceType) => {
    switch (type) {
        case ResourceType.TRAFFIC:
            return <Activity className="h-4 w-4 text-blue-500" />;
        case ResourceType.STORAGE:
            return <HardDrive className="h-4 w-4 text-amber-500" />;
        case ResourceType.COMPUTE:
            return <Cpu className="h-4 w-4 text-purple-500" />;
    }
};

const getSourceBadgeVariant = (source: UsageSource) => {
    switch (source) {
        case UsageSource.API:
            return "default";
        case UsageSource.FILE:
            return "secondary";
        case UsageSource.JOB:
            return "outline";
        case UsageSource.AI:
            return "destructive";
        default:
            return "default";
    }
};

const formatUnits = (units: number, type: ResourceType) => {
    if (type === ResourceType.COMPUTE) {
        return `${units.toLocaleString()} units`;
    }
    // Convert bytes
    if (units >= 1024 * 1024 * 1024) {
        return `${(units / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (units >= 1024 * 1024) {
        return `${(units / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (units >= 1024) {
        return `${(units / 1024).toFixed(2)} KB`;
    }
    return `${units} B`;
};

export function UsageEventsTable({
    events,
    total,
    isLoading,
    page,
    pageSize,
    onPageChange,
    onExport,
    resourceTypeFilter,
    sourceFilter,
    onResourceTypeFilterChange,
    onSourceFilterChange,
    workspaceNames = new Map(),
    projectNames = new Map(),
    dateRange,
    onDateRangeChange,
}: UsageEventsTableProps) {
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const totalPages = Math.ceil(total / pageSize);

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Usage Events</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Usage Events</CardTitle>
                        <CardDescription>
                            {total.toLocaleString()} total events
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Filters */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Filter className="h-4 w-4 mr-2" />
                                    Filters
                                    {(resourceTypeFilter || sourceFilter) && (
                                        <Badge variant="secondary" className="ml-2">
                                            {[resourceTypeFilter, sourceFilter].filter(Boolean).length}
                                        </Badge>
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Resource Type</DropdownMenuLabel>
                                <DropdownMenuCheckboxItem
                                    checked={!resourceTypeFilter}
                                    onCheckedChange={() => onResourceTypeFilterChange(undefined)}
                                >
                                    All Types
                                </DropdownMenuCheckboxItem>
                                {Object.values(ResourceType).map((type) => (
                                    <DropdownMenuCheckboxItem
                                        key={type}
                                        checked={resourceTypeFilter === type}
                                        onCheckedChange={() =>
                                            onResourceTypeFilterChange(
                                                resourceTypeFilter === type ? undefined : type
                                            )
                                        }
                                    >
                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </DropdownMenuCheckboxItem>
                                ))}
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Source</DropdownMenuLabel>
                                <DropdownMenuCheckboxItem
                                    checked={!sourceFilter}
                                    onCheckedChange={() => onSourceFilterChange(undefined)}
                                >
                                    All Sources
                                </DropdownMenuCheckboxItem>
                                {Object.values(UsageSource).map((source) => (
                                    <DropdownMenuCheckboxItem
                                        key={source}
                                        checked={sourceFilter === source}
                                        onCheckedChange={() =>
                                            onSourceFilterChange(
                                                sourceFilter === source ? undefined : source
                                            )
                                        }
                                    >
                                        {source.toUpperCase()}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Advanced Date/Time Filter */}
                        {onDateRangeChange && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className={dateRange ? "bg-blue-50 text-blue-700 border-blue-200" : ""}>
                                        <CalendarClock className="h-4 w-4 mr-2" />
                                        Time Range
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-72 p-4">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">Start Time</label>
                                            <input
                                                type="datetime-local"
                                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                value={dateRange?.from ? format(dateRange.from, "yyyy-MM-dd'T'HH:mm") : ""}
                                                onChange={(e) => onDateRangeChange({
                                                    ...dateRange,
                                                    from: e.target.value ? new Date(e.target.value) : undefined
                                                })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium">End Time</label>
                                            <input
                                                type="datetime-local"
                                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                value={dateRange?.to ? format(dateRange.to, "yyyy-MM-dd'T'HH:mm") : ""}
                                                onChange={(e) => onDateRangeChange({
                                                    ...dateRange,
                                                    to: e.target.value ? new Date(e.target.value) : undefined
                                                })}
                                            />
                                        </div>
                                        {/* Quick Presets */}
                                        <div className="grid grid-cols-2 gap-2 pt-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    const end = new Date();
                                                    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
                                                    onDateRangeChange({ from: start, to: end });
                                                }}
                                            >
                                                Last 24h
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    const end = new Date();
                                                    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
                                                    onDateRangeChange({ from: start, to: end });
                                                }}
                                            >
                                                Last 7d
                                            </Button>
                                        </div>
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {/* Clear Filters */}
                        {(resourceTypeFilter || sourceFilter || dateRange) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    onResourceTypeFilterChange(undefined);
                                    onSourceFilterChange(undefined);
                                    if (onDateRangeChange) onDateRangeChange({});
                                }}
                                className="h-8 px-2 lg:px-3"
                            >
                                Reset
                                <X className="ml-2 h-4 w-4" />
                            </Button>
                        )}

                        {/* Export */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Download className="h-4 w-4 mr-2" />
                                    Export
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuCheckboxItem onCheckedChange={() => onExport("csv")}>
                                    Export as CSV
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem onCheckedChange={() => onExport("json")}>
                                    Export as JSON
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div >
            </CardHeader >
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Units</TableHead>
                                <TableHead>Context</TableHead>
                                <TableHead>Timestamp</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {events.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No usage events found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                events.map((event) => (
                                    <TableRow
                                        key={event.$id}
                                        className="cursor-pointer"
                                        onClick={() =>
                                            setExpandedRow(expandedRow === event.$id ? null : event.$id)
                                        }
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getResourceIcon(event.resourceType)}
                                                <span className="capitalize">{event.resourceType}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getSourceBadgeVariant(event.source)}>
                                                {event.source.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono">
                                            {formatUnits(event.units, event.resourceType)}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {(() => {
                                                // Get workspace name
                                                const wsName = workspaceNames.get(event.workspaceId) || event.workspaceId?.slice(0, 8) || 'Unknown';
                                                // Get project name if available
                                                const projName = event.projectId ? projectNames.get(event.projectId) : null;

                                                if (projName) {
                                                    return (
                                                        <span>
                                                            <span className="text-foreground font-medium">{wsName}</span>
                                                            <span className="text-muted-foreground"> / {projName}</span>
                                                        </span>
                                                    );
                                                }
                                                return wsName;
                                            })()}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {format(new Date(event.timestamp), "MMM d, yyyy HH:mm")}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                            Page {page + 1} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={page === 0}
                                onClick={() => onPageChange(Math.max(0, page - 10))}
                                title="Previous 10 Pages"
                            >
                                <ChevronsLeft className="h-4 w-4" />
                                <span className="sr-only">Previous 10 Pages</span>
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={page === 0}
                                onClick={() => onPageChange(page - 1)}
                                title="Previous Page"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                <span className="sr-only">Previous</span>
                            </Button>

                            <div className="flex items-center gap-1">
                                {(() => {
                                    const pages = [];

                                    // Helper to add page button
                                    const addPage = (p: number) => (
                                        <Button
                                            key={p}
                                            variant={page === p ? "primary" : "outline"}
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => onPageChange(p)}
                                        >
                                            {p + 1}
                                        </Button>
                                    );

                                    // Helper to add ellipsis
                                    const addEllipsis = (key: string) => (
                                        <span key={key} className="px-1 text-muted-foreground">...</span>
                                    );

                                    if (totalPages <= 7) {
                                        // Show all pages if 7 or fewer
                                        for (let i = 0; i < totalPages; i++) {
                                            pages.push(addPage(i));
                                        }
                                    } else {
                                        // Always show first page
                                        pages.push(addPage(0));

                                        if (page > 3) {
                                            pages.push(addEllipsis("start-ellipsis"));
                                        }

                                        // Calculate range around current page
                                        // We want to show neighbors, but also bridge the gap to 1 or total if close
                                        const start = Math.max(1, page - 1);
                                        const end = Math.min(totalPages - 2, page + 1);

                                        // If we are close to start (e.g. page 2 or 3), extend start to 1 to avoid "1 ... 3"
                                        const adjustedStart = start <= 2 ? 1 : start;
                                        // If we are close to end, extend end
                                        const adjustedEnd = end >= totalPages - 3 ? totalPages - 2 : end;

                                        for (let i = adjustedStart; i <= adjustedEnd; i++) {
                                            pages.push(addPage(i));
                                        }

                                        if (page < totalPages - 4) {
                                            pages.push(addEllipsis("end-ellipsis"));
                                        }

                                        // Always show last page
                                        pages.push(addPage(totalPages - 1));
                                    }

                                    return pages;
                                })()}
                            </div>

                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={page >= totalPages - 1}
                                onClick={() => onPageChange(page + 1)}
                                title="Next Page"
                            >
                                <ChevronRight className="h-4 w-4" />
                                <span className="sr-only">Next</span>
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={page >= totalPages - 1}
                                onClick={() => onPageChange(Math.min(totalPages - 1, page + 10))}
                                title="Next 10 Pages"
                            >
                                <ChevronsRight className="h-4 w-4" />
                                <span className="sr-only">Next 10 Pages</span>
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card >
    );
}
