"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { UsageKPICards } from "./usage-kpi-cards";
import { UsageCharts } from "./usage-charts";
import { UsageEventsTable } from "./usage-events-table";
import { useGetUsageEvents, useGetUsageSummary } from "../api";
import { useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface WorkspaceUsageDrawerProps {
    workspaceId: string | null;
    workspaceName?: string;
    isOpen: boolean;
    onClose: () => void;
}

export function WorkspaceUsageDrawer({
    workspaceId,
    workspaceName,
    isOpen,
    onClose
}: WorkspaceUsageDrawerProps) {
    const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    const [page, setPage] = useState(0);
    const pageSize = 10;

    // Query usage data specifically for this workspace
    const { data: summary, isLoading: isSummaryLoading } = useGetUsageSummary({
        workspaceId: workspaceId || "",
        period: format(new Date(), "yyyy-MM"),
    });

    const { data: eventsData, isLoading: isEventsLoading } = useGetUsageEvents({
        workspaceId: workspaceId || "",
        startDate: dateRange.from?.toISOString(),
        endDate: dateRange.to?.toISOString(),
        limit: pageSize,
        offset: page * pageSize,
    });

    const events = eventsData?.data?.documents || [];
    const totalEvents = eventsData?.data?.total || 0;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-xl md:max-w-3xl overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle>Usage: {workspaceName || "Workspace"}</SheetTitle>
                    <SheetDescription>
                        Detailed usage breakdown and meter readings for this workspace.
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-6 pb-6">
                    {/* Date Picker */}
                    <div className="flex items-center justify-end">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                        "justify-start text-left font-normal text-xs",
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
                            </PopoverContent>
                        </Popover>
                    </div>

                    <UsageKPICards summary={summary?.data || null} isLoading={isSummaryLoading} />

                    <UsageCharts events={events} summary={summary?.data || null} isLoading={isEventsLoading || isSummaryLoading} />

                    <div className="border rounded-md">
                        <UsageEventsTable
                            events={events}
                            total={totalEvents}
                            isLoading={isEventsLoading}
                            page={page}
                            pageSize={pageSize}
                            onPageChange={setPage}
                            onExport={() => { }}
                            resourceTypeFilter={undefined}
                            sourceFilter={undefined}
                            onResourceTypeFilterChange={() => { }}
                            onSourceFilterChange={() => { }}
                            dateRange={dateRange}
                            onDateRangeChange={setDateRange}
                        />
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
