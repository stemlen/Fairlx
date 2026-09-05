import "server-only";

import type { Databases } from "node-appwrite";

import { DATABASE_ID, WORKSPACES_ID } from "@/config";
import { logAIUsage } from "@/lib/usage-metering";
import { calculateAICallCosts, getAIModelPricing } from "@/lib/ai-model-pricing";
import { parseChatCompletionUsage, type ProviderTokenUsage } from "@/lib/ai-billing";
import { UsageModule } from "@/features/usage/types";
import type { AgentLlmUsagePayload, AgentToolEvent } from "../types";
import { estimateTokensFromText } from "./context-meter";
import { cacheHitPercent } from "./run-usage";

type BillableChatTarget = {
    model: string;
    modelId: string;
    displayName?: string;
    isPlatform?: boolean;
};

export type AgentChatUsageContext = {
    databases: Databases;
    userId: string;
    workspaceId?: string;
    projectId?: string;
    runId: string;
    operationId: string;
    target: BillableChatTarget;
    completion: unknown;
    estimatedPromptChars?: number;
    estimatedCompletionChars?: number;
    role?: AgentLlmUsagePayload["role"];
    specialist?: string;
    iteration?: number;
};

function tokensFromCompletion(params: AgentChatUsageContext): ProviderTokenUsage | null {
    const parsed = parseChatCompletionUsage(params.completion);
    const usage: ProviderTokenUsage = parsed ?? {
        promptTokens: estimateTokensFromText("x".repeat(params.estimatedPromptChars ?? 0)),
        completionTokens: estimateTokensFromText("x".repeat(params.estimatedCompletionChars ?? 0)),
        cachedTokens: 0,
        totalTokens: 0,
        estimated: true,
    };
    usage.totalTokens = usage.totalTokens || usage.promptTokens + usage.completionTokens;
    if (usage.totalTokens <= 0) return null;
    return usage;
}

export async function resolveAgentChatCharge(params: AgentChatUsageContext): Promise<AgentLlmUsagePayload | null> {
    const usage = tokensFromCompletion(params);
    if (!usage) return null;
    const modelId = params.target.model || params.target.modelId;
    const pricing = await getAIModelPricing(params.databases, modelId);
    const costs = calculateAICallCosts(
        pricing,
        usage.promptTokens,
        usage.completionTokens,
        usage.cachedTokens,
    );
    const billed = Boolean(params.target.isPlatform);
    return {
        role: params.role === "subagent" ? "subagent" : "orchestrator",
        specialist: params.specialist,
        iteration: params.iteration,
        operationId: params.operationId,
        model: params.target.model,
        modelId: params.target.modelId,
        displayName: params.target.displayName || modelId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedTokens: usage.cachedTokens,
        totalTokens: usage.totalTokens,
        estimated: usage.estimated,
        billed,
        inputPricePerMillionTokens: pricing.inputPricePerMillionTokens,
        outputPricePerMillionTokens: pricing.outputPricePerMillionTokens,
        cachedInputPricePerMillionTokens: pricing.cachedInputPricePerMillionTokens ?? 0,
        providerCostUSD: costs.providerCostUSD,
        costUSD: billed ? costs.costUSD : 0,
        markup: costs.markup,
        cacheHitPercent: cacheHitPercent(usage.promptTokens, usage.cachedTokens),
        pricingSource: pricing.pricingSource,
    };
}

export async function buildAgentLlmUsageEvent(params: AgentChatUsageContext): Promise<AgentToolEvent | null> {
    try {
        const payload = await resolveAgentChatCharge(params);
        if (!payload) return null;
        const who = payload.role === "subagent" ? payload.specialist || "subagent" : "Model call";
        return {
            id: crypto.randomUUID(),
            type: "llm_usage",
            title: who === "Model call" ? "Model call" : `${who} · model call`,
            detail: payload.billed
                ? `${payload.totalTokens.toLocaleString()} tokens · $${payload.costUSD.toFixed(4)} · ${payload.cacheHitPercent.toFixed(0)}% cache`
                : `${payload.totalTokens.toLocaleString()} tokens · BYOK · not billed`,
            payload,
            createdAt: new Date().toISOString(),
            runId: params.runId,
        };
    } catch (error) {
        console.error("[AgentBilling] Failed to build usage event:", {
            runId: params.runId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

export async function recordAgentChatUsage(params: AgentChatUsageContext): Promise<void> {
    try {
        const payload = await resolveAgentChatCharge(params);
        if (!payload) return;

        const workspaceId = params.workspaceId || (await firstWorkspaceId(params.databases, params.userId));
        if (!workspaceId) {
            console.warn("[AgentBilling] Skipping usage write — no workspace for run", params.runId);
            return;
        }

        await logAIUsage({
            databases: params.databases,
            workspaceId,
            projectId: params.projectId,
            model: payload.model || payload.modelId,
            promptTokens: payload.promptTokens,
            completionTokens: payload.completionTokens,
            totalTokens: payload.totalTokens,
            costUSD: payload.costUSD,
            units: payload.totalTokens,
            operationId: params.operationId,
            metadata: {
                operation: "agent_chat",
                module: UsageModule.AI,
                runId: params.runId,
                modelId: payload.modelId,
                cachedTokens: payload.cachedTokens,
                providerCostUSD: payload.providerCostUSD,
                markup: payload.markup,
                billed: payload.billed,
                estimated: payload.estimated,
                pricingSource: payload.pricingSource,
                inputPricePerMillionTokens: payload.inputPricePerMillionTokens,
                outputPricePerMillionTokens: payload.outputPricePerMillionTokens,
                cachedInputPricePerMillionTokens: payload.cachedInputPricePerMillionTokens,
                role: payload.role,
                specialist: payload.specialist,
            },
            sourceContext: {
                type: params.projectId ? "project" : "workspace",
                displayName: `Agent ${params.runId.slice(0, 8)}`,
            },
        });
    } catch (error) {
        console.error("[AgentBilling] Failed to record AI usage:", {
            runId: params.runId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function firstWorkspaceId(databases: Databases, userId: string): Promise<string | undefined> {
    try {
        const { Query } = await import("node-appwrite");
        const docs = await databases.listDocuments(DATABASE_ID, WORKSPACES_ID, [
            Query.equal("userId", userId),
            Query.limit(1),
        ]);
        return docs.documents[0]?.$id;
    } catch {
        return undefined;
    }
}
