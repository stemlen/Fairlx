"use client";

import { Activity, HardDrive, Cpu, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { UsageSummary } from "../types";

interface UsageKPICardsProps {
    summary: UsageSummary | null;
    isLoading: boolean;
    currency?: string;
    exchangeRate?: number;
    walletBalance?: number;
    walletCurrency?: string;
}

interface KPICardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
    className?: string;
}

function KPICard({ title, value, subtitle, icon, trend, trendValue, className }: KPICardProps) {
    return (
        <Card className={cn(
            "relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 group border-border/50 bg-card/50 backdrop-blur-sm",
            className
        )}>
            <CardContent className="p-6">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground group-hover:text-primary/80 transition-colors">{title}</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
                            {trend && trendValue && (
                                <span
                                    className={cn(
                                        "flex items-center text-xs font-medium",
                                        trend === "up" && "text-emerald-600",
                                        trend === "down" && "text-red-600",
                                        trend === "neutral" && "text-muted-foreground"
                                    )}
                                >
                                    {trend === "up" ? (
                                        <TrendingUp className="h-3 w-3 mr-0.5" />
                                    ) : trend === "down" ? (
                                        <TrendingDown className="h-3 w-3 mr-0.5" />
                                    ) : null}
                                    {trendValue}
                                </span>
                            )}
                        </div>
                        {subtitle && (
                            <p className="text-xs text-muted-foreground">{subtitle}</p>
                        )}
                    </div>
                    <div className="rounded-xl bg-primary/5 p-3 text-primary border border-primary/10 group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-300">
                        {icon}
                    </div>
                </div>
            </CardContent>
            {/* Background Accent Gradient */}
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all duration-500" />
        </Card>
    );
}

export function UsageKPICards({
    summary,
    isLoading,
    currency = "USD",
    exchangeRate = 1,
    walletBalance,
    walletCurrency: _walletCurrency = "USD",
}: UsageKPICardsProps) {
    if (isLoading) {
        return (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(5)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                        <CardContent className="p-6">
                            <div className="space-y-3">
                                <div className="h-4 w-24 bg-muted rounded" />
                                <div className="h-8 w-32 bg-muted rounded" />
                                <div className="h-3 w-20 bg-muted rounded" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    const formatNumber = (num: number, decimals = 2) => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(decimals)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(decimals)}K`;
        return num.toFixed(decimals);
    };

    const formatCurrency = (amountUsd: number) => {
        const converted = amountUsd * exchangeRate;
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: converted < 0.1 && converted > 0 ? 6 : 2,
        }).format(converted);
    };

    const formatBytes = (bytes: number) => {
        if (bytes <= 0) return "0 B";
        const k = 1024;
        const dm = 2;
        const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const safeIndex = Math.max(0, Math.min(i, sizes.length - 1));
        return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(dm)) + " " + sizes[safeIndex];
    };

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <KPICard
                title="Wallet Balance"
                value={walletBalance !== undefined ? formatCurrency(walletBalance) : formatCurrency(0)}
                subtitle={
                    walletBalance !== undefined && walletBalance < 0
                        ? "Negative — account locks at -$20.00"
                        : "Available for compute (billed in USD)"
                }
                icon={<DollarSign className="h-5 w-5" />}
                className={
                    walletBalance !== undefined && walletBalance < 0
                        ? "border-l-4 border-l-red-600 bg-gradient-to-br from-red-500/10 to-amber-500/5"
                        : "border-l-4 border-l-blue-600 bg-gradient-to-br from-blue-500/5 to-indigo-500/5"
                }
            />
            <KPICard
                title="Traffic Used"
                value={summary ? formatBytes(summary.trafficTotalBytes) : "0 B"}
                subtitle={summary ? `${formatNumber(summary.trafficTotalGB)} GB total` : undefined}
                icon={<Activity className="h-5 w-5" />}
                className="border-l-4 border-l-blue-500"
            />
            <KPICard
                title="Storage Used"
                value={summary ? formatBytes(Math.max(0, summary.storageAvgBytes)) : "0 B"}
                subtitle="Billed GB-month (time-weighted)"
                icon={<HardDrive className="h-5 w-5" />}
                className="border-l-4 border-l-amber-500"
            />
            <KPICard
                title="Job Compute"
                value={summary ? formatNumber(summary.computeTotalUnits, 0) : "0"}
                subtitle="Runner units"
                icon={<Cpu className="h-5 w-5" />}
                className="border-l-4 border-l-purple-500"
            />
            <KPICard
                title="AI Usage"
                value={summary ? formatNumber(summary.aiTokensTotal, 0) : "0"}
                subtitle="Tokens"
                icon={<Activity className="h-5 w-5" />}
                className="border-l-4 border-l-pink-500"
            />
            <KPICard
                title="Estimated Cost"
                value={summary ? formatCurrency(summary.estimatedCost.total) : "$0.00"}
                subtitle={
                    summary
                        ? `Billed in USD. Traffic: ${formatCurrency(summary.estimatedCost.traffic)} | AI: ${formatCurrency(summary.estimatedCost.ai)}`
                        : undefined
                }
                icon={<DollarSign className="h-5 w-5" />}
                className="border-l-4 border-l-emerald-500"
            />
        </div>
    );
}
