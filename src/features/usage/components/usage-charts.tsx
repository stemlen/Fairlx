"use client";

import { useMemo } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsageEvent, UsageSummary } from "../types";
import { Inbox, TrendingUp } from "lucide-react";

interface UsageChartsProps {
    events: UsageEvent[];
    summary: UsageSummary | null;
    isLoading: boolean;
}

// Module color palette for consistent styling
const MODULE_COLORS: Record<string, string> = {
    traffic: "#3b82f6",   // blue
    storage: "#f59e0b",   // amber
    docs: "#10b981",      // emerald
    github: "#7c3aed",    // violet
    ai: "#ec4899",        // pink
    compute: "#8b5cf6",   // purple
};

// Friendly display names for modules
const MODULE_LABELS: Record<string, string> = {
    traffic: "Traffic",
    storage: "Storage",
    docs: "Docs AI",
    github: "GitHub",
    ai: "AI",
    compute: "Compute",
};

/**
 * Extract module from usage event
 */
function getModuleFromEvent(event: UsageEvent): string {
    if (event.module) return (event.module as string).toLowerCase();
    if (event.metadata) {
        try {
            const meta = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
            if (meta.module) return meta.module.toLowerCase();
        } catch { /* ignore */ }
    }
    return event.resourceType.toLowerCase();
}

/**
 * Format large numbers with appropriate units (B, KB, MB, GB)
 */
function formatValue(value: number, unit: string) {
    if (unit === "units") return value.toLocaleString();
    if (value === 0) return "0";

    const units = ["B", "KB", "MB", "GB", "TB"];
    let index = units.indexOf(unit);
    if (index === -1) index = 0;

    let val = value;
    while (val >= 1024 && index < units.length - 1) {
        val /= 1024;
        index++;
    }

    return `${val.toFixed(2)} ${units[index]}`;
}

// Custom tooltip component for better UX
interface CustomTooltipProps {
    active?: boolean;
    payload?: {
        value: number;
        color: string;
        name: string;
        dataKey: string;
    }[];
    label?: string;
    unit?: string;
}

function CustomTooltip({ active, payload, label, unit }: CustomTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0);

    return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg min-w-[200px] z-50">
            <p className="font-semibold text-sm mb-3 border-b pb-2">{label}</p>
            <div className="space-y-2">
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2.5 h-2.5 rounded-sm"
                                style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-muted-foreground whitespace-nowrap">{MODULE_LABELS[entry.dataKey] || entry.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-medium">
                                {unit && unit !== "units"
                                    ? formatValue(entry.value * (unit === "GB" ? 1024 * 1024 * 1024 : unit === "MB" ? 1024 * 1024 : unit === "KB" ? 1024 : 1), "B")
                                    : entry.value.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-muted-foreground opacity-70">
                                ({total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0}%)
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="border-t border-border mt-3 pt-2 flex justify-between text-xs font-semibold">
                <span>Total</span>
                <span>
                    {unit && unit !== "units"
                        ? formatValue(total * (unit === "GB" ? 1024 * 1024 * 1024 : unit === "MB" ? 1024 * 1024 : unit === "KB" ? 1024 : 1), "B")
                        : total.toLocaleString()}
                </span>
            </div>
        </div>
    );
}

// Empty state component
function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
            <Inbox className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-center">{message}</p>
            <p className="text-sm text-center mt-2 opacity-75">
                Usage data will appear here once you start using features
            </p>
        </div>
    );
}

export function UsageCharts({ events, summary, isLoading }: UsageChartsProps) {
    // Determine the best unit for display based on max value
    const { timeSeriesData, displayUnit } = useMemo(() => {
        const data = summary?.dailyUsage || [];
        if (!data.length) return { timeSeriesData: [], displayUnit: "B", divisor: 1 };

        // Find max traffic/storage value to determine scale
        let maxVal = 0;
        data.forEach((p) => {
            const traffic = Number(p.traffic || 0);
            const storage = Number(p.storage || 0);
            const docs = Number(p.docs || 0);
            maxVal = Math.max(maxVal, traffic, storage, docs);
        });

        let unit = "B";
        let div = 1;
        if (maxVal >= 1024 * 1024 * 1024) { unit = "GB"; div = 1024 * 1024 * 1024; }
        else if (maxVal >= 1024 * 1024) { unit = "MB"; div = 1024 * 1024; }
        else if (maxVal >= 1024) { unit = "KB"; div = 1024; }

        const scaledData = data.map((p) => ({
            ...p,
            traffic: Number(p.traffic || 0) / div,
            storage: Number(p.storage || 0) / div,
            docs: Number(p.docs || 0) / div,
            github: Number(p.github || 0) / div,
            ai: Number(p.ai || 0) / div,
            compute: Number(p.compute || 0) / div,
        }));

        return { timeSeriesData: scaledData, displayUnit: unit };
    }, [summary]);

    // Aggregate by module for pie chart
    const moduleBreakdown = useMemo(() => {
        if (!events.length) return [];

        const totals: Record<string, number> = {
            traffic: 0,
            storage: 0,
            docs: 0,
            github: 0,
            ai: 0,
            compute: 0,
        };

        for (const event of events) {
            const moduleKey = getModuleFromEvent(event);
            if (totals[moduleKey] !== undefined) {
                totals[moduleKey] += event.units;
            }
        }

        const total = Object.values(totals).reduce((a, b) => a + b, 0);

        return Object.entries(totals)
            .filter(([, value]) => value > 0)
            .map(([name, value]) => ({
                name: MODULE_LABELS[name] || name,
                key: name,
                value,
                percentage: ((value / total) * 100).toFixed(1),
            }))
            .sort((a, b) => b.value - a.value);
    }, [events]);

    // Aggregate by source with module breakdown for stacked bar chart
    const sourceBreakdown = useMemo(() => {
        if (!events.length) return [];

        const totals: Record<string, Record<string, number>> = {};

        for (const event of events) {
            const source = event.source.toUpperCase();
            if (!totals[source]) {
                totals[source] = { docs: 0, github: 0, ai: 0, traffic: 0, storage: 0, compute: 0 };
            }

            const moduleKey = getModuleFromEvent(event);
            if (totals[source][moduleKey] !== undefined) {
                totals[source][moduleKey] += event.units;
            }
        }

        return Object.entries(totals).map(([source, modules]) => ({
            source,
            ...modules,
            total: Object.values(modules).reduce((a, b) => a + b, 0),
        }));
    }, [events]);

    if (isLoading) {
        return (
            <Card className="animate-pulse">
                <CardHeader>
                    <div className="h-6 w-48 bg-muted rounded" />
                </CardHeader>
                <CardContent>
                    <div className="h-80 bg-muted rounded" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5" />
                            Usage Analytics
                        </CardTitle>
                        <CardDescription>
                            Visual breakdown of your usage by module over time
                        </CardDescription>
                    </div>
                    {events.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                            {events.length.toLocaleString()} events
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="timeline" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="timeline">Usage Over Time</TabsTrigger>
                        <TabsTrigger value="modules">By Module</TabsTrigger>
                        <TabsTrigger value="sources">By Source</TabsTrigger>
                    </TabsList>

                    <TabsContent value="timeline" className="h-80">
                        {timeSeriesData.length === 0 ? (
                            <EmptyState message="No usage data available for this period" />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={timeSeriesData}>
                                    <defs>
                                        {Object.entries(MODULE_COLORS).map(([key, color]) => (
                                            <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={color} stopOpacity={0.8} />
                                                <stop offset="100%" stopColor={color} stopOpacity={0.1} />
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="date" className="text-xs" />
                                    <YAxis className="text-xs" tickFormatter={(val) => val === 0 ? "0" : `${val.toFixed(1)}${displayUnit}`} />
                                    <Tooltip content={<CustomTooltip unit={displayUnit} />} />
                                    <Legend />
                                    <Area
                                        type="monotone"
                                        dataKey="docs"
                                        name="Docs AI"
                                        stackId="1"
                                        stroke={MODULE_COLORS.docs}
                                        fill={`url(#gradient-docs)`}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="github"
                                        name="GitHub"
                                        stackId="1"
                                        stroke={MODULE_COLORS.github}
                                        fill={`url(#gradient-github)`}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="traffic"
                                        name="Traffic"
                                        stackId="1"
                                        stroke={MODULE_COLORS.traffic}
                                        fill={`url(#gradient-traffic)`}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="storage"
                                        name="Storage"
                                        stackId="1"
                                        stroke={MODULE_COLORS.storage}
                                        fill={`url(#gradient-storage)`}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="compute"
                                        name="Compute"
                                        stackId="1"
                                        stroke={MODULE_COLORS.compute}
                                        fill={`url(#gradient-compute)`}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </TabsContent>

                    <TabsContent value="modules" className="h-80">
                        {moduleBreakdown.length === 0 ? (
                            <EmptyState message="No module data available" />
                        ) : (
                            <div className="flex h-full">
                                <ResponsiveContainer width="60%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={moduleBreakdown}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="value"
                                        >
                                            {moduleBreakdown.map((entry) => (
                                                <Cell
                                                    key={entry.key}
                                                    fill={MODULE_COLORS[entry.key as keyof typeof MODULE_COLORS]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number) => value.toLocaleString()}
                                            contentStyle={{
                                                backgroundColor: "hsl(var(--background))",
                                                border: "1px solid hsl(var(--border))",
                                                borderRadius: "8px",
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="w-[40%] flex flex-col justify-center space-y-3">
                                    {moduleBreakdown.map((item) => (
                                        <div key={item.key} className="flex items-center gap-3">
                                            <div
                                                className="w-4 h-4 rounded-full"
                                                style={{ backgroundColor: MODULE_COLORS[item.key as keyof typeof MODULE_COLORS] }}
                                            />
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-medium">{item.name}</span>
                                                    <span className="text-sm text-muted-foreground">{item.percentage}%</span>
                                                </div>
                                                <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-500"
                                                        style={{
                                                            width: `${item.percentage}%`,
                                                            backgroundColor: MODULE_COLORS[item.key as keyof typeof MODULE_COLORS],
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="sources" className="h-80">
                        {sourceBreakdown.length === 0 ? (
                            <EmptyState message="No source data available" />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={sourceBreakdown} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis type="number" className="text-xs" />
                                    <YAxis dataKey="source" type="category" className="text-xs" width={60} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />
                                    <Bar dataKey="docs" name="Docs AI" stackId="a" fill={MODULE_COLORS.docs} />
                                    <Bar dataKey="github" name="GitHub" stackId="a" fill={MODULE_COLORS.github} />
                                    <Bar dataKey="traffic" name="Traffic" stackId="a" fill={MODULE_COLORS.traffic} />
                                    <Bar dataKey="storage" name="Storage" stackId="a" fill={MODULE_COLORS.storage} />
                                    <Bar dataKey="compute" name="Compute" stackId="a" fill={MODULE_COLORS.compute} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
