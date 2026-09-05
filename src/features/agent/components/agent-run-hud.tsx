"use client";

import { useState } from "react";
import { Bot, Check, ChevronDown, ChevronRight, ChevronUp, Files, Loader2, Sparkles, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AgentRun } from "../types";
import { activeSubagents, editedFilePaths, latestContextMeter } from "../lib/context-meter";
import {
  aggregateLlmUsage,
  contextUtilizationPercent,
  formatCompactUsageLine,
  formatPricePerMillion,
  formatTokenCount,
  formatUsd,
} from "../lib/run-usage";

export function AgentWorkingDropUp({ run }: { run?: AgentRun }) {
  const [open, setOpen] = useState(false);

  if (!run) return null;

  const events = run.events ?? [];
  const thoughts = events.filter((event) => event.type === "thought");
  const lastThought = thoughts[thoughts.length - 1];
  const subagents = activeSubagents(events);
  const files = editedFilePaths(events);
  const live = run.status === "running" || subagents.length > 0;
  const inFlight = [...events].reverse().find((event) =>
    event.type === "subagent_progress" || event.type === "mcp_call" || event.type === "delegate_agent",
  );

  // If run is completely idle and no events yet, don't show
  if (run.status === "idle" && !events.length) return null;

  const statusLabel = lastThought?.title || (live ? "Working" : "Idle");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-muted hover:text-foreground font-medium transition-colors cursor-pointer select-none text-[11px] shrink-0",
            open && "bg-muted text-foreground",
            live ? "text-primary font-semibold" : "text-muted-foreground"
          )}
          title={`Status: ${statusLabel} (click for details)`}
          aria-label={`Status: ${statusLabel}`}
        >
          {live ? (
            <Loader2 className="size-3 animate-spin text-primary shrink-0" />
          ) : (
            <Sparkles className="size-3 text-primary shrink-0" />
          )}
          <span className="truncate max-w-[130px]">{statusLabel}</span>
          <ChevronUp className="size-3 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-[340px] sm:w-[400px] p-3.5 bg-popover/95 dark:bg-zinc-900/95 backdrop-blur-md border border-border/80 dark:border-zinc-800 shadow-xl rounded-xl text-popover-foreground space-y-2.5 z-50 select-none"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 text-xs min-w-0">
            {live ? (
              <Loader2 className="size-3.5 mt-0.5 animate-spin text-primary shrink-0" />
            ) : (
              <Sparkles className="size-3.5 mt-0.5 text-primary shrink-0" />
            )}
            <div className="min-w-0 leading-snug">
              <span className="font-semibold text-foreground">{statusLabel}</span>
              {lastThought?.detail ? (
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed break-words">
                  {lastThought.detail}
                </p>
              ) : null}
              {inFlight && live ? (
                <p className="text-primary mt-0.5 text-[11px] font-medium truncate">
                  · {inFlight.title}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="size-5 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="h-px bg-border/60" />

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Bot className="size-3 text-primary shrink-0" />
            <span className="text-foreground font-medium">
              {subagents.length
                ? `${subagents.length} subagent${subagents.length === 1 ? "" : "s"}`
                : "Orchestrator"}
            </span>
          </span>

          {subagents.slice(0, 4).map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1">
              <span className="font-medium text-foreground">{item.specialist}</span>
              <span>from {item.parent}</span>
            </span>
          ))}

          <span className="inline-flex items-center gap-1">
            <Files className="size-3 text-primary shrink-0" />
            <span className="text-foreground font-medium">
              {files.length ? `${files.length} file${files.length === 1 ? "" : "s"} edited` : "No files edited"}
            </span>
          </span>
        </div>

        {files.length ? (
          <p className="text-[11px] text-muted-foreground truncate font-mono bg-muted/40 px-2 py-1 rounded">
            {files.slice(-4).join(" · ")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// Backwards-compatible export
export const AgentRunHud = AgentWorkingDropUp;

export function AgentTurnUsageCard({
  events,
  modelFallback,
  live,
}: {
  events: AgentRun["events"];
  modelFallback?: string;
  live?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const usage = aggregateLlmUsage(events);
  const meter = latestContextMeter(events);
  if (!usage) return null;
  const contextPct = contextUtilizationPercent(meter?.tokens ?? 0, meter?.maxInputTokens ?? 0);
  const line = formatCompactUsageLine({
    ...usage,
    models: usage.models.length ? usage.models : modelFallback ? [modelFallback] : usage.models,
  });

  return (
    <div className="min-w-0 max-w-[46rem]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex max-w-full items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
        title="Token and cost breakdown"
      >
        {live ? (
          <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
        ) : (
          <Check className="size-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="truncate">{live ? `Usage so far · ${line}` : line}</span>
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
      </button>
      {open ? (
        <div
          className={cn(
            "mt-1.5 ml-1 border-l border-border/80 pl-3 py-1.5 text-[12px]",
            live && "border-primary/30",
          )}
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 text-muted-foreground">
            <div>
              <dt className="text-[10px] uppercase tracking-wide">Input</dt>
              <dd className="text-foreground tabular-nums">{formatTokenCount(usage.promptTokens)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide">Output</dt>
              <dd className="text-foreground tabular-nums">{formatTokenCount(usage.completionTokens)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide">Cached</dt>
              <dd className="text-foreground tabular-nums">
                {formatTokenCount(usage.cachedTokens)}
                {usage.promptTokens > 0 ? ` · ${Math.round(usage.cacheHitPercent)}%` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide">Cache rate</dt>
              <dd className="text-foreground tabular-nums">
                {formatPricePerMillion(usage.cachedInputPricePerMillionTokens)} / 1M
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide">Input / output</dt>
              <dd className="text-foreground tabular-nums">
                {formatPricePerMillion(usage.inputPricePerMillionTokens)} / {formatPricePerMillion(usage.outputPricePerMillionTokens)} per 1M
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide">{usage.billed ? "Billed" : "Provider (BYOK)"}</dt>
              <dd className="text-foreground tabular-nums">
                {usage.billed ? formatUsd(usage.costUSD) : `${formatUsd(usage.providerCostUSD)} not billed`}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {`${usage.calls} model call${usage.calls === 1 ? "" : "s"}`}
            {usage.subagentCalls ? ` · ${usage.subagentCalls} subagent` : ""}
            {usage.estimated ? " · estimated tokens" : ""}
            {meter?.maxInputTokens
              ? ` · context ${formatTokenCount(meter.tokens)} / ${formatTokenCount(meter.maxInputTokens)}${contextPct ? ` (${Math.round(contextPct)}%)` : ""}`
              : ""}
            {usage.billed ? " · includes 15% Fairlx markup" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
