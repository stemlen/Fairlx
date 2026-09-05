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
    currency?: string;
    exchangeRate?: number;
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

    // For PieChart, label is often absent, so we use the first entry's name
    const title = label || payload[0]?.name;
    const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0);

    return (
        <div
            style={{
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                padding: '12px',
                minWidth: '200px',
                zIndex: 9999
            }}
        >
            {title && (
                <p
                    style={{
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: '14px',
                        marginBottom: '12px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        paddingBottom: '8px'
                    }}
                >
                    {title}
                </p>
            )}
            <div className="space-y-2">
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2.5 h-2.5 rounded-sm"
                                style={{ backgroundColor: entry.color }}
                            />
                            <span style={{ color: '#d1d5db' }} className="whitespace-nowrap">
                                {MODULE_LABELS[entry.name?.toLowerCase() || ''] || entry.name}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span style={{ color: '#ffffff', fontWeight: 500 }}>
                                {unit && unit !== "units"
                                    ? formatValue(entry.value * (unit === "GB" ? 1024 * 1024 * 1024 : unit === "MB" ? 1024 * 1024 : unit === "KB" ? 1024 : 1), "B")
                                    : entry.value.toLocaleString()}
                            </span>
                            <span style={{ color: '#9ca3af', fontSize: '10px' }}>
                                ({total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0}%)
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            {payload.length > 1 && (
                <div
                    style={{
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        marginTop: '12px',
                        paddingTop: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#ffffff'
                    }}
                >
                    <span>Total</span>
                    <span>
                        {unit && unit !== "units"
                            ? formatValue(total * (unit === "GB" ? 1024 * 1024 * 1024 : unit === "MB" ? 1024 * 1024 : unit === "KB" ? 1024 : 1), "B")
                            : total.toLocaleString()}
                    </span>
                </div>
            )}
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

export function UsageCharts({
    events,
    summary,
    isLoading,
    currency = "USD",
    exchangeRate = 1
}: UsageChartsProps) {
    // Determine the best unit for display based on max value
    const { timeSeriesData, displayUnit } = useMemo(() => {
        const data = summary?.dailyUsage || [];
        if (!data.length) return { timeSeriesData: [], displayUnit: "B", divisor: 1 };

        // We need to calculate cumulative storage because the backend provides deltas
        let cumulativeStorage = 0;
        
        // Find max traffic/storage/compute value to determine scale
        let maxVal = 0;
        data.forEach((p) => {
            const traffic = Number(p.traffic || 0);
            // Calculate what the storage would be at this point
            const currentStorage = cumulativeStorage + Number(p.storage || 0);
            cumulativeStorage = Math.max(0, currentStorage); // Prevent negative storage
            
            const docs = Number(p.docs || 0);
            const ai = Number(p.ai || 0);
            maxVal = Math.max(maxVal, traffic, cumulativeStorage, docs, ai);
        });

        let unit = "B";
        let div = 1;
        if (maxVal >= 1024 * 1024 * 1024) { unit = "GB"; div = 1024 * 1024 * 1024; }
        else if (maxVal >= 1024 * 1024) { unit = "MB"; div = 1024 * 1024; }
        else if (maxVal >= 1024) { unit = "KB"; div = 1024; }

        // Reset for the actual mapping
        let runningStorage = 0;
        const scaledData = data.map((p) => {
            runningStorage = Math.max(0, runningStorage + Number(p.storage || 0));
            return {
                ...p,
                traffic: Number(p.traffic || 0) / div,
                storage: runningStorage / div,
                docs: Number(p.docs || 0) / div,
                github: Number(p.github || 0) / div,
                ai: Number(p.ai || 0) / div,
                compute: Number(p.compute || 0) / div,
            };
        });

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

    // Aggregate AI events by model for the AI Costs tab
    const aiCostBreakdown = useMemo(() => {
        const aiEvents = events.filter((e) => {
            if (e.source?.toLowerCase() === "ai") return true;
            try {
                const meta = typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata;
                return meta?.isAI === true;
            } catch { return false; }
        });

        if (!aiEvents.length) return { models: [], totalCost: 0, totalCalls: 0, totalTokens: 0 };

        const byModel: Record<string, { calls: number; promptTokens: number; completionTokens: number; cachedTokens: number; totalTokens: number; costUSD: number }> = {};

        for (const event of aiEvents) {
            const meta = typeof event.metadata === "string" ? JSON.parse(event.metadata) : (event.metadata || {});
            const model = (meta.model as string) || "unknown";
            const costUsd = Number(meta.costUSD || 0);
            const convertedCost = costUsd * exchangeRate;
            if (!byModel[model]) {
                byModel[model] = { calls: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0, costUSD: 0 };
            }
            byModel[model].calls++;
            byModel[model].promptTokens += Number(meta.promptTokens || 0);
            byModel[model].completionTokens += Number(meta.completionTokens || 0);
            byModel[model].cachedTokens += Number(meta.cachedTokens || 0);
            byModel[model].totalTokens += Number(meta.totalTokens || meta.tokensUsed || 0);
            byModel[model].costUSD += convertedCost;
        }

        const models = Object.entries(byModel)
            .map(([model, data]) => ({ model, ...data }))
            .sort((a, b) => b.costUSD - a.costUSD);

        return {
            models,
            totalCost: models.reduce((s, m) => s + m.costUSD, 0),
            totalCalls: models.reduce((s, m) => s + m.calls, 0),
            totalTokens: models.reduce((s, m) => s + m.totalTokens, 0),
        };
    }, [events, exchangeRate]);

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
                    <TabsList className="bg-muted border border-border">
                        <TabsTrigger value="timeline">Usage Over Time</TabsTrigger>
                        <TabsTrigger value="modules">By Module</TabsTrigger>
                        <TabsTrigger value="sources">By Source</TabsTrigger>
                        <TabsTrigger value="ai-costs">AI Costs</TabsTrigger>
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
                                        dataKey="ai"
                                        name="AI"
                                        stackId="1"
                                        stroke={MODULE_COLORS.ai}
                                        fill={`url(#gradient-ai)`}
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
                                        <Tooltip content={<CustomTooltip />} />
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

                    <TabsContent value="ai-costs" className="min-h-80">
                        {aiCostBreakdown.models.length === 0 ? (
                            <EmptyState message="No AI usage data available" />
                        ) : (
                            <div className="space-y-6">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="rounded-lg border border-border bg-muted/50 p-4">
                                        <div className="text-sm text-muted-foreground">Total Cost</div>
                                        <div className="text-2xl font-bold text-emerald-500">
                                            {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(aiCostBreakdown.totalCost)}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground mt-1">Billed at Azure list + 15%</div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-muted/50 p-4">
                                        <div className="text-sm text-muted-foreground">Total Calls</div>
                                        <div className="text-2xl font-bold">{aiCostBreakdown.totalCalls.toLocaleString()}</div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-muted/50 p-4">
                                        <div className="text-sm text-muted-foreground">Total Tokens</div>
                                        <div className="text-2xl font-bold">{aiCostBreakdown.totalTokens.toLocaleString()}</div>
                                    </div>
                                </div>

                                {/* Per-model table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-muted-foreground">
                                                <th className="text-left py-2 px-3 font-medium">Model</th>
                                                <th className="text-right py-2 px-3 font-medium">Calls</th>
                                                <th className="text-right py-2 px-3 font-medium">Input Tokens</th>
                                                <th className="text-right py-2 px-3 font-medium">Cached Tokens</th>
                                                <th className="text-right py-2 px-3 font-medium">Output Tokens</th>
                                                <th className="text-right py-2 px-3 font-medium">Billed ({currency})</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {aiCostBreakdown.models.map((m) => (
                                                <tr key={m.model} className="border-b border-border/50 hover:bg-muted/30">
                                                    <td className="py-2 px-3">
                                                        <span className="inline-flex items-center rounded-full bg-pink-500/10 px-2.5 py-0.5 text-xs font-medium text-pink-400">
                                                            {m.model}
                                                        </span>
                                                    </td>
                                                    <td className="text-right py-2 px-3">{m.calls.toLocaleString()}</td>
                                                    <td className="text-right py-2 px-3">{m.promptTokens.toLocaleString()}</td>
                                                    <td className="text-right py-2 px-3">{m.cachedTokens.toLocaleString()}</td>
                                                    <td className="text-right py-2 px-3">{m.completionTokens.toLocaleString()}</td>
                                                    <td className="text-right py-2 px-3 font-semibold text-emerald-500">
                                                        {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(m.costUSD)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t border-border font-semibold">
                                                <td className="py-2 px-3">Total</td>
                                                <td className="text-right py-2 px-3">{aiCostBreakdown.totalCalls.toLocaleString()}</td>
                                                <td className="text-right py-2 px-3">{aiCostBreakdown.models.reduce((s, m) => s + m.promptTokens, 0).toLocaleString()}</td>
                                                <td className="text-right py-2 px-3">{aiCostBreakdown.models.reduce((s, m) => s + m.cachedTokens, 0).toLocaleString()}</td>
                                                <td className="text-right py-2 px-3">{aiCostBreakdown.models.reduce((s, m) => s + m.completionTokens, 0).toLocaleString()}</td>
                                                <td className="text-right py-2 px-3 text-emerald-500">
                                                    {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(aiCostBreakdown.totalCost)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* Cost bar chart by model */}
                                {aiCostBreakdown.models.length > 1 && (
                                    <div className="h-48">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={aiCostBreakdown.models} layout="vertical">
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                                <XAxis type="number" className="text-xs" tickFormatter={(v: number) => `$${v.toFixed(4)}`} />
                                                <YAxis dataKey="model" type="category" className="text-xs" width={120} />
                                                <Tooltip
                                                    content={({ active, payload }) => {
                                                        if (!active || !payload?.[0]) return null;
                                                        const d = payload[0].payload as { model: string; costUSD: number; calls: number; totalTokens: number };
                                                        return (
                                                            <div style={{ backgroundColor: 'rgba(0,0,0,0.95)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: 12, fontSize: 12 }}>
                                                                <p style={{ color: '#fff', fontWeight: 600 }}>{d.model}</p>
                                                                <p style={{ color: '#10b981' }}>Cost: ${d.costUSD.toFixed(4)}</p>
                                                                <p style={{ color: '#d1d5db' }}>{d.calls} calls · {d.totalTokens.toLocaleString()} tokens</p>
                                                            </div>
                                                        );
                                                    }}
                                                />
                                                <Bar dataKey="costUSD" name="Cost (USD)" fill="#ec4899" radius={[0, 4, 4, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
