"use client";

import { useState } from "react";
import { Bot, Check, ChevronDown, ChevronRight, Files, Layers, Loader2, Square, Users } from "lucide-react";

import { cn } from "@/lib/utils";

import type { AgentRun } from "../types";
import { useGetAgentAiConfig } from "../api/use-agent-ai-config";
import { useStopAgentRun } from "../api/use-agent-runs";
import { resolvedModelDisplayName } from "../lib/client-defaults";
import { activeSubagents, editedFilePaths, estimateRunTokens, latestContextMeter } from "../lib/context-meter";
import {
  aggregateLlmUsage,
  contextUtilizationPercent,
  formatCompactUsageLine,
  formatPricePerMillion,
  formatTokenCount,
  formatUsd,
} from "../lib/run-usage";

export function AgentRunHud({ run }: { run: AgentRun }) {
  const { data: ai } = useGetAgentAiConfig();
  const stopRun = useStopAgentRun();
  const events = run.events ?? [];
  const thoughts = events.filter((event) => event.type === "thought");
  const lastThought = thoughts[thoughts.length - 1];
  const subagents = activeSubagents(events);
  const files = editedFilePaths(events);
  const meter = latestContextMeter(events);
  const usage = aggregateLlmUsage(events);
  const modelLabel =
    usage?.displayName ||
    ai?.models.find((model) => model.id === (run.modelId || ai.resolvedModelId))?.displayName ||
    resolvedModelDisplayName(ai) ||
    run.modelId ||
    "Model";
  const maxTokens =
    meter?.maxInputTokens ||
    ai?.models.find((model) => model.id === (run.modelId || ai.resolvedModelId))?.maxInputTokens ||
    0;
  const tokens = meter?.tokens || estimateRunTokens(run.messages ?? []);
  const live =
    run.status === "running" ||
    run.status === "awaiting_confirmation" ||
    run.status === "awaiting_plugin" ||
    subagents.length > 0;
  const inFlight = [...events].reverse().find(
    (event) =>
      event.type === "subagent_progress" ||
      event.type === "subagent_started" ||
      event.type === "mcp_call" ||
      event.type === "delegate_agent" ||
      event.type === "thought",
  );

  if (!live) return null;

  const headline = inFlight?.title || lastThought?.title || "Working";
  const detail = inFlight?.detail || lastThought?.detail;
  const contextPct = contextUtilizationPercent(tokens, maxTokens);

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-xs">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
        <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
          Working
        </div>
        <button
          type="button"
          onClick={() => stopRun.mutate({ runId: run.id })}
          disabled={stopRun.isPending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <Square className="size-2.5 fill-current" />
          Stop all
        </button>
      </div>
      <div className="px-3 py-2 space-y-2">
        <p className="min-w-0 truncate text-[12.5px] leading-snug text-foreground">
          <span className="font-medium">{headline}</span>
          {detail ? <span className="text-muted-foreground"> — {detail}</span> : null}
        </p>
        {subagents.length ? (
          <ul className="space-y-1">
            {subagents.map((agent) => (
              <li key={agent.id} className="flex items-start gap-2 text-[11.5px] text-muted-foreground">
                <Users className="mt-0.5 size-3 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="font-medium text-foreground/90 capitalize">{agent.specialist}</span>
                  {agent.task ? <span> · {agent.task}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Bot className="size-3" />
            {modelLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" />
            {subagents.length
              ? `${subagents.length} subagent${subagents.length === 1 ? "" : "s"}`
              : "Orchestrator"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Layers className="size-3" />
            {formatTokenCount(usage?.totalTokens || tokens)}
            {maxTokens ? ` / ${maxTokens.toLocaleString()}` : ""} tokens
            {contextPct > 0 ? ` · ${Math.round(contextPct)}% context` : ""}
          </span>
          {usage ? (
            <span>
              {formatUsd(usage.costUSD)}
              {usage.cachedTokens > 0 ? ` · ${Math.round(usage.cacheHitPercent)}% cached` : ""}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Files className="size-3" />
            {files.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : "No files"}
          </span>
        </div>
      </div>
    </div>
  );
}

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
