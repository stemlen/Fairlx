import "server-only";

import { Databases, Models, Query } from "node-appwrite";
import { DATABASE_ID, AI_MODEL_PRICING_ID } from "@/config";
import {
    calculateCustomerTokenCostUSD,
    calculateProviderTokenCostUSD,
} from "@/lib/ai-billing";

export { AI_CUSTOMER_MARKUP, WALLET_OVERDRAFT_LIMIT_USD } from "@/lib/ai-billing";

// ============================================================================
// TYPES
// ============================================================================

export type AIPricingSource =
    | "google_scraper"
    | "google_api"
    | "azure_foundry"
    | "admin_override"
    | "fallback_default";

export interface AIModelPricing {
    modelId: string;
    displayName: string;
    inputPricePerMillionTokens: number;
    outputPricePerMillionTokens: number;
    cachedInputPricePerMillionTokens?: number;
    isActive: boolean;
    tier: "economy" | "standard" | "flagship";
    pricingSource: AIPricingSource;
    lastSyncedAt?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedMethods?: string[];
}

// Appwrite document shape
type AIModelPricingDoc = Models.Document & AIModelPricing & {
    supportedMethods?: string; // stored as JSON string in DB
};

// ============================================================================
// HARDCODED FALLBACK DEFAULTS (emergency-only)
// ============================================================================

/**
 * Fallback pricing used ONLY when both DB and pricing sync are unavailable.
 *
 * Grok 4.6 Global Standard (Microsoft Foundry, Aug 2026):
 * $2.00 input / $6.00 output / $0.50 cached per 1M tokens.
 * DeepSeek V4 Flash (Microsoft Foundry): $0.19 / $0.51 / $0.028 cached.
 * GPT-5.6 Luna (Microsoft Foundry, Aug 2026 OpenAI parity):
 * $0.20 input / $1.20 output / $0.02 cached per 1M tokens.
 */
const AI_MODEL_PRICING_DEFAULTS: Record<string, AIModelPricing> = {
    "grok-4.6": {
        modelId: "grok-4.6",
        displayName: "Grok 4.6",
        inputPricePerMillionTokens: 2.00,
        outputPricePerMillionTokens: 6.00,
        cachedInputPricePerMillionTokens: 0.50,
        isActive: true,
        tier: "flagship",
        pricingSource: "azure_foundry",
        lastSyncedAt: "2026-09-05T00:00:00.000Z",
    },
    "grok-4": {
        modelId: "grok-4",
        displayName: "Grok 4",
        inputPricePerMillionTokens: 3.00,
        outputPricePerMillionTokens: 15.00,
        cachedInputPricePerMillionTokens: 0.75,
        isActive: true,
        tier: "flagship",
        pricingSource: "azure_foundry",
    },
    "grok-4-fast": {
        modelId: "grok-4-fast",
        displayName: "Grok 4 Fast",
        inputPricePerMillionTokens: 0.20,
        outputPricePerMillionTokens: 0.50,
        cachedInputPricePerMillionTokens: 0.05,
        isActive: true,
        tier: "economy",
        pricingSource: "azure_foundry",
    },
    "DeepSeek-V4-Flash": {
        modelId: "DeepSeek-V4-Flash",
        displayName: "DeepSeek V4 Flash",
        inputPricePerMillionTokens: 0.19,
        outputPricePerMillionTokens: 0.51,
        cachedInputPricePerMillionTokens: 0.028,
        isActive: true,
        tier: "economy",
        pricingSource: "azure_foundry",
    },
    "DeepSeek-V4-Flash-0731": {
        modelId: "DeepSeek-V4-Flash-0731",
        displayName: "DeepSeek V4 Flash 0731",
        inputPricePerMillionTokens: 0.44,
        outputPricePerMillionTokens: 1.32,
        cachedInputPricePerMillionTokens: 0.014,
        isActive: true,
        tier: "standard",
        pricingSource: "azure_foundry",
    },
    "gpt-5.6-luna": {
        modelId: "gpt-5.6-luna",
        displayName: "GPT-5.6 Luna",
        inputPricePerMillionTokens: 0.20,
        outputPricePerMillionTokens: 1.20,
        cachedInputPricePerMillionTokens: 0.02,
        isActive: true,
        tier: "economy",
        pricingSource: "azure_foundry",
        lastSyncedAt: "2026-09-05T00:00:00.000Z",
        inputTokenLimit: 1050000,
        outputTokenLimit: 128000,
    },
    "gemini-2.5-flash": {
        modelId: "gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        inputPricePerMillionTokens: 0.15,
        outputPricePerMillionTokens: 0.60,
        cachedInputPricePerMillionTokens: 0.0375,
        isActive: true,
        tier: "economy",
        pricingSource: "fallback_default",
    },
    "gemini-2.5-pro": {
        modelId: "gemini-2.5-pro",
        displayName: "Gemini 2.5 Pro",
        inputPricePerMillionTokens: 1.25,
        outputPricePerMillionTokens: 10.00,
        cachedInputPricePerMillionTokens: 0.3125,
        isActive: true,
        tier: "standard",
        pricingSource: "fallback_default",
    },
    "gemini-2.5-flash-lite": {
        modelId: "gemini-2.5-flash-lite",
        displayName: "Gemini 2.5 Flash Lite",
        inputPricePerMillionTokens: 0.075,
        outputPricePerMillionTokens: 0.30,
        cachedInputPricePerMillionTokens: 0.01875,
        isActive: true,
        tier: "economy",
        pricingSource: "fallback_default",
    },
    "gemini-2.0-flash": {
        modelId: "gemini-2.0-flash",
        displayName: "Gemini 2.0 Flash",
        inputPricePerMillionTokens: 0.10,
        outputPricePerMillionTokens: 0.40,
        cachedInputPricePerMillionTokens: 0.025,
        isActive: true,
        tier: "economy",
        pricingSource: "fallback_default",
    },
    "gemini-3-flash-preview": {
        modelId: "gemini-3-flash-preview",
        displayName: "Gemini 3 Flash Preview",
        inputPricePerMillionTokens: 0.15,
        outputPricePerMillionTokens: 0.60,
        cachedInputPricePerMillionTokens: 0.0375,
        isActive: true,
        tier: "standard",
        pricingSource: "fallback_default",
    },
    "gemini-3.1-pro-preview": {
        modelId: "gemini-3.1-pro-preview",
        displayName: "Gemini 3.1 Pro Preview",
        inputPricePerMillionTokens: 1.25,
        outputPricePerMillionTokens: 10.00,
        cachedInputPricePerMillionTokens: 0.3125,
        isActive: true,
        tier: "flagship",
        pricingSource: "fallback_default",
    },
};

function docToPricing(doc: AIModelPricingDoc): AIModelPricing {
    const cached = Number(doc.cachedInputPricePerMillionTokens);
    return {
        modelId: doc.modelId,
        displayName: doc.displayName,
        inputPricePerMillionTokens: doc.inputPricePerMillionTokens,
        outputPricePerMillionTokens: doc.outputPricePerMillionTokens,
        cachedInputPricePerMillionTokens: Number.isFinite(cached) && cached >= 0 ? cached : undefined,
        isActive: doc.isActive,
        tier: doc.tier,
        pricingSource: doc.pricingSource,
        lastSyncedAt: doc.lastSyncedAt,
        inputTokenLimit: doc.inputTokenLimit,
        outputTokenLimit: doc.outputTokenLimit,
        supportedMethods: doc.supportedMethods
            ? JSON.parse(doc.supportedMethods as string)
            : undefined,
    };
}

// ============================================================================
// IN-MEMORY CACHE (5-min TTL)
// ============================================================================

interface CacheEntry {
    pricing: AIModelPricing;
    expiresAt: number;
}

const pricingCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cache for all active models (used by model picker UI)
let allModelsCache: { models: AIModelPricing[]; expiresAt: number } | null = null;
const ALL_MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Normalize a model ID to its base form.
 *
 * Gemini API responses sometimes include suffixes like ":generateContent"
 * or version prefixes like "models/". Strip those for pricing lookup.
 *
 * Examples:
 *   "models/gemini-2.5-flash:generateContent" → "gemini-2.5-flash"
 *   "models/gemini-2.5-flash" → "gemini-2.5-flash"
 *   "gemini-2.5-flash" → "gemini-2.5-flash"
 */
export function normalizeModelId(rawModelId: string): string {
    let modelId = rawModelId.trim();

    // Strip "models/" prefix
    if (modelId.startsWith("models/")) {
        modelId = modelId.slice(7);
    }

    // Strip ":generateContent" or similar method suffix
    const colonIdx = modelId.indexOf(":");
    if (colonIdx !== -1) {
        modelId = modelId.slice(0, colonIdx);
    }

    return modelId;
}

/**
 * Get pricing for a specific AI model.
 *
 * Resolution order:
 * 1. In-memory cache (5-min TTL)
 * 2. Database (ai_model_pricing collection)
 * 3. Hardcoded fallback defaults
 *
 * @param databases - Appwrite Databases instance
 * @param rawModelId - Model ID (may include "models/" prefix or ":generateContent" suffix)
 * @returns AIModelPricing for the requested model
 */
export async function getAIModelPricing(
    databases: Databases,
    rawModelId: string
): Promise<AIModelPricing> {
    const modelId = normalizeModelId(rawModelId);

    // 1. Check in-memory cache
    const cached = pricingCache.get(modelId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.pricing;
    }

    // 2. Try database
    try {
        const docs = await databases.listDocuments<AIModelPricingDoc>(
            DATABASE_ID,
            AI_MODEL_PRICING_ID,
            [
                Query.equal("modelId", modelId),
                Query.equal("isActive", true),
                Query.limit(1),
            ]
        );

        if (docs.total > 0) {
            const pricing = docToPricing(docs.documents[0]);

            // Update cache
            pricingCache.set(modelId, {
                pricing,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });

            return pricing;
        }
    } catch (error) {
        console.warn(`[AIModelPricing] DB lookup failed for "${modelId}":`, error);
        // Fall through to hardcoded defaults
    }

    // 3. Hardcoded fallback
    return getFallbackPricing(modelId);
}

/**
 * Get fallback pricing for a model.
 *
 * Tries exact match first, then partial match on the base model family.
 * If no match found, returns a safe economy-tier default.
 */
export function getFallbackPricing(rawModelId: string): AIModelPricing {
    const modelId = normalizeModelId(rawModelId);

    // Exact match (case-insensitive for Azure deployment names)
    const exact = AI_MODEL_PRICING_DEFAULTS[modelId]
        || Object.entries(AI_MODEL_PRICING_DEFAULTS).find(([key]) => key.toLowerCase() === modelId.toLowerCase())?.[1];
    if (exact) {
        return { ...exact, modelId };
    }

    // Longest-prefix match so grok-4.6 is not billed as grok-4.
    const lower = modelId.toLowerCase();
    const matches = Object.entries(AI_MODEL_PRICING_DEFAULTS)
        .filter(([key]) => lower.startsWith(key.toLowerCase()) || key.toLowerCase().startsWith(lower))
        .sort((a, b) => b[0].length - a[0].length);
    if (matches[0]) {
        return { ...matches[0][1], modelId };
    }

    // Ultimate fallback: return a safe economy-tier default
    // WHY: We never want to crash just because we don't recognize a model.
    // Use the cheapest tier so we at least log *some* cost.
    console.warn(`[AIModelPricing] No pricing found for "${modelId}", using economy fallback`);
    return {
        modelId,
        displayName: modelId,
        inputPricePerMillionTokens: 0.15,
        outputPricePerMillionTokens: 0.60,
        cachedInputPricePerMillionTokens: 0.0375,
        isActive: true,
        tier: "economy",
        pricingSource: "fallback_default",
    };
}

/**
 * Customer USD cost for an AI call: provider list × 15% markup.
 */
export function calculateAICallCostUSD(
    pricing: AIModelPricing,
    promptTokens: number,
    completionTokens: number,
    cachedTokens = 0,
): number {
    return calculateCustomerTokenCostUSD(
        pricing,
        promptTokens,
        completionTokens,
        cachedTokens,
    ).costUSD;
}

export function calculateAICallCosts(
    pricing: AIModelPricing,
    promptTokens: number,
    completionTokens: number,
    cachedTokens = 0,
) {
    return calculateCustomerTokenCostUSD(
        pricing,
        promptTokens,
        completionTokens,
        cachedTokens,
    );
}

export function calculateProviderAICallCostUSD(
    pricing: AIModelPricing,
    promptTokens: number,
    completionTokens: number,
    cachedTokens = 0,
): number {
    return calculateProviderTokenCostUSD(
        pricing,
        promptTokens,
        completionTokens,
        cachedTokens,
    );
}

/**
 * Get all active AI models from the database.
 *
 * Used by the future model-picker UI to show available models.
 * Results are cached for 5 minutes.
 *
 * @param databases - Appwrite Databases instance
 * @returns Array of active model pricing records
 */
export async function getAllActiveModels(
    databases: Databases
): Promise<AIModelPricing[]> {
    // Check cache
    if (allModelsCache && allModelsCache.expiresAt > Date.now()) {
        return allModelsCache.models;
    }

    try {
        const docs = await databases.listDocuments<AIModelPricingDoc>(
            DATABASE_ID,
            AI_MODEL_PRICING_ID,
            [
                Query.equal("isActive", true),
                Query.orderAsc("displayName"),
                Query.limit(100),
            ]
        );

        const models: AIModelPricing[] = docs.documents.map((doc) => docToPricing(doc));

        // Update cache
        allModelsCache = {
            models,
            expiresAt: Date.now() + ALL_MODELS_CACHE_TTL_MS,
        };

        return models;
    } catch (error) {
        console.warn("[AIModelPricing] Failed to fetch all models:", error);

        // Return fallback defaults
        return Object.values(AI_MODEL_PRICING_DEFAULTS);
    }
}

/**
 * Invalidate the pricing cache for a specific model or all models.
 * Called after the pricing sync job updates DB records.
 */
export function invalidatePricingCache(modelId?: string): void {
    if (modelId) {
        pricingCache.delete(normalizeModelId(modelId));
    } else {
        pricingCache.clear();
        allModelsCache = null;
    }
}

export function listFallbackPricing(): AIModelPricing[] {
    return Object.values(AI_MODEL_PRICING_DEFAULTS);
}
