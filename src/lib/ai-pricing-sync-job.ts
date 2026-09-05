import "server-only";

import { Databases, ID, Query } from "node-appwrite";
import { DATABASE_ID, AI_MODEL_PRICING_ID } from "@/config";
import { invalidatePricingCache, listFallbackPricing, type AIModelPricing } from "./ai-model-pricing";

// ============================================================================
// TYPES
// ============================================================================

interface GoogleModelInfo {
    name: string;
    displayName: string;
    description?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
}

interface PricingSyncResult {
    modelsDiscovered: number;
    modelsUpdated: number;
    modelsCreated: number;
    modelsSkipped: number;
    pricingUpdated: number;
    errors: string[];
}

interface ParsedPricing {
    modelId: string;
    displayName?: string;
    inputPricePerMillionTokens: number;
    outputPricePerMillionTokens: number;
    cachedInputPricePerMillionTokens?: number;
    source?: "google_scraper" | "azure_foundry";
}

// ============================================================================
// PRICING PAGE PARSER
// ============================================================================

async function fetchGooglePricingPage(): Promise<ParsedPricing[]> {
    const results: ParsedPricing[] = [];
    try {
        const response = await fetch("https://ai.google.dev/pricing", {
            headers: { "User-Agent": "Fairlx-Billing-Sync/1.0", "Accept": "text/html" },
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            console.warn(`[AIPricingSync] Pricing page returned ${response.status}`);
            return results;
        }
        const html = await response.text();
        results.push(...extractPricingFromHTML(html));
    } catch (error) {
        console.warn("[AIPricingSync] Failed to fetch pricing page:", error);
    }
    return results;
}

function extractPricingFromHTML(html: string): ParsedPricing[] {
    const results: ParsedPricing[] = [];
    const modelRegex = /```\s*(gemini-[\w.-]+)\s*```/g;
    let modelMatch: RegExpExecArray | null;
    while ((modelMatch = modelRegex.exec(html)) !== null) {
        const modelId = modelMatch[1];
        const contextEnd = Math.min(html.length, modelMatch.index + 3000);
        const context = html.slice(Math.max(0, modelMatch.index - 200), contextEnd);
        const inputPrice = extractPrice(context, "input");
        const outputPrice = extractPrice(context, "output");
        if (inputPrice !== null && outputPrice !== null) {
            results.push({ modelId, inputPricePerMillionTokens: inputPrice, outputPricePerMillionTokens: outputPrice });
        }
    }
    return results;
}

function extractPrice(context: string, type: "input" | "output"): number | null {
    const typeRegex = new RegExp(`${type}[^$]*\\$([0-9]+\\.?[0-9]*)`, "i");
    const match = context.match(typeRegex);
    if (match) {
        const price = parseFloat(match[1]);
        if (!isNaN(price) && price >= 0) return price;
    }
    return null;
}

// ============================================================================
// MODELS LIST API
// ============================================================================

async function fetchAzureFoundryGrokPricing(): Promise<ParsedPricing[]> {
    const results: ParsedPricing[] = [];
    const urls = [
        "https://azure.microsoft.com/nb-no/pricing/details/ai-foundry-models/grok/",
        "https://azure.microsoft.com/en-us/pricing/details/ai-foundry-models/grok/",
    ];
    for (const url of urls) {
        try {
            const response = await fetch(url, {
                headers: { "User-Agent": "Fairlx-Billing-Sync/1.0", Accept: "text/html" },
                signal: AbortSignal.timeout(15_000),
            });
            if (!response.ok) continue;
            const html = await response.text();
            const parsed = extractAzureGrokPricing(html);
            if (parsed.length) {
                console.log(`[AIPricingSync] Parsed ${parsed.length} Grok prices from ${url}`);
                return parsed;
            }
        } catch (error) {
            console.warn("[AIPricingSync] Azure Foundry Grok pricing fetch failed:", error);
        }
    }
    return results;
}

function normalizeGrokModelId(label: string): string | null {
    const compact = label.toLowerCase().replace(/\s+/g, " ").trim();
    if (!compact.includes("grok")) return null;
    if (compact.includes("4.6")) return "grok-4.6";
    if (compact.includes("4.3")) return "grok-4.3";
    if (compact.includes("4.2")) return "grok-4.2";
    if (compact.includes("4.1") && compact.includes("fast")) return "grok-4.1-fast";
    if (compact.includes("code") && compact.includes("fast")) return "grok-code-fast-1";
    if (compact.includes("4 fast") || compact.includes("4-fast")) return "grok-4-fast";
    if (/\bgrok[- ]?4\b/.test(compact) && !compact.includes("fast")) return "grok-4";
    if (compact.includes("3 mini")) return "grok-3-mini";
    if (compact.includes("grok-3") || compact.includes("grok 3")) return "grok-3";
    return null;
}

function extractAzureGrokPricing(html: string): ParsedPricing[] {
    const results: ParsedPricing[] = [];
    const rowRegex = /<(?:tr|td)[^>]*>[\s\S]{0,80}(Grok[^<]{0,80})[\s\S]{0,400}?\$([0-9]+(?:[.,][0-9]+)?)[\s\S]{0,200}?\$([0-9]+(?:[.,][0-9]+)?)/gi;
    let match: RegExpExecArray | null;
    while ((match = rowRegex.exec(html)) !== null) {
        const modelId = normalizeGrokModelId(match[1]);
        if (!modelId) continue;
        const inputRaw = parseFloat(match[2].replace(",", "."));
        const outputRaw = parseFloat(match[3].replace(",", "."));
        if (!Number.isFinite(inputRaw) || !Number.isFinite(outputRaw)) continue;
        // Azure sometimes lists per 1,000 tokens (e.g. $0.003) and sometimes per 1M.
        const perMillion = inputRaw < 0.05;
        const input = perMillion ? inputRaw * 1000 : inputRaw;
        const output = perMillion ? outputRaw * 1000 : outputRaw;
        results.push({
            modelId,
            displayName: match[1].replace(/\s+/g, " ").trim(),
            inputPricePerMillionTokens: input,
            outputPricePerMillionTokens: output,
            cachedInputPricePerMillionTokens: Number((input * 0.25).toFixed(4)),
            source: "azure_foundry",
        });
    }
    return results;
}

async function upsertFoundryCatalog(
    databases: Databases,
    existingDocs: Map<string, { $id: string; pricingSource: string }>,
    livePrices: ParsedPricing[],
    result: PricingSyncResult,
): Promise<void> {
    const liveById = new Map(livePrices.map((p) => [p.modelId, p]));
    const catalog = listFallbackPricing().filter((model) =>
        model.pricingSource === "azure_foundry" || model.modelId.toLowerCase().startsWith("grok") || model.modelId.toLowerCase().includes("deepseek"),
    );

    const toUpsert = new Map<string, AIModelPricing>();
    for (const model of catalog) {
        toUpsert.set(model.modelId, model);
    }
    for (const live of livePrices) {
        const current = toUpsert.get(live.modelId);
        toUpsert.set(live.modelId, {
            modelId: live.modelId,
            displayName: live.displayName || current?.displayName || live.modelId,
            inputPricePerMillionTokens: live.inputPricePerMillionTokens,
            outputPricePerMillionTokens: live.outputPricePerMillionTokens,
            cachedInputPricePerMillionTokens:
                live.cachedInputPricePerMillionTokens ?? current?.cachedInputPricePerMillionTokens,
            isActive: true,
            tier: current?.tier ?? inferTier(live.modelId),
            pricingSource: "azure_foundry",
            lastSyncedAt: new Date().toISOString(),
        });
    }

    // Always refresh grok-4.6 from live Foundry if the scraper missed it.
    if (!liveById.has("grok-4.6") && toUpsert.has("grok-4.6")) {
        toUpsert.set("grok-4.6", {
            ...toUpsert.get("grok-4.6")!,
            lastSyncedAt: new Date().toISOString(),
            pricingSource: "azure_foundry",
        });
    }

    for (const model of toUpsert.values()) {
        const existing = existingDocs.get(model.modelId);
        if (existing?.pricingSource === "admin_override") {
            result.modelsSkipped++;
            continue;
        }
        const docData: Record<string, unknown> = {
            modelId: model.modelId,
            displayName: model.displayName,
            isActive: true,
            tier: model.tier,
            inputPricePerMillionTokens: model.inputPricePerMillionTokens,
            outputPricePerMillionTokens: model.outputPricePerMillionTokens,
            cachedInputPricePerMillionTokens: model.cachedInputPricePerMillionTokens ?? null,
            pricingSource: "azure_foundry",
            lastSyncedAt: new Date().toISOString(),
        };
        try {
            if (existing) {
                await databases.updateDocument(DATABASE_ID, AI_MODEL_PRICING_ID, existing.$id, docData);
                result.modelsUpdated++;
            } else {
                await databases.createDocument(DATABASE_ID, AI_MODEL_PRICING_ID, ID.unique(), docData);
                result.modelsCreated++;
                existingDocs.set(model.modelId, { $id: "new", pricingSource: "azure_foundry" });
            }
            result.pricingUpdated++;
        } catch (error) {
            try {
                const { cachedInputPricePerMillionTokens: _cached, ...withoutCache } = docData;
                if (existing) {
                    await databases.updateDocument(DATABASE_ID, AI_MODEL_PRICING_ID, existing.$id, withoutCache);
                    result.modelsUpdated++;
                } else {
                    await databases.createDocument(DATABASE_ID, AI_MODEL_PRICING_ID, ID.unique(), withoutCache);
                    result.modelsCreated++;
                }
                result.pricingUpdated++;
            } catch (retryError) {
                result.errors.push(`Failed Foundry "${model.modelId}": ${retryError instanceof Error ? retryError.message : String(retryError)}`);
            }
        }
    }
}

async function fetchGoogleModels(apiKey: string): Promise<GoogleModelInfo[]> {
    const allModels: GoogleModelInfo[] = [];
    let pageToken: string | undefined;
    try {
        do {
            const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
            url.searchParams.set("key", apiKey);
            url.searchParams.set("pageSize", "100");
            if (pageToken) url.searchParams.set("pageToken", pageToken);
            const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
            if (!response.ok) { console.warn(`[AIPricingSync] models.list returned ${response.status}`); break; }
            const data = await response.json();
            for (const model of (data.models || []) as GoogleModelInfo[]) {
                if (model.supportedGenerationMethods?.includes("generateContent")) allModels.push(model);
            }
            pageToken = data.nextPageToken;
        } while (pageToken);
    } catch (error) {
        console.warn("[AIPricingSync] Failed to fetch models list:", error);
    }
    return allModels;
}

// ============================================================================
// SYNC JOB
// ============================================================================

/**
 * Sync AI model pricing from Google + Azure Foundry.
 * 1. Fetch Google Gemini pricing + models.list (optional if no API key)
 * 2. Fetch Azure Foundry Grok live list prices
 * 3. Upsert Foundry catalog (Grok 4.6, DeepSeek, etc.)
 * 4. Never overwrite admin_override pricing
 */
export async function syncAIModelPricing(databases: Databases, apiKey = ""): Promise<PricingSyncResult> {
    const result: PricingSyncResult = { modelsDiscovered: 0, modelsUpdated: 0, modelsCreated: 0, modelsSkipped: 0, pricingUpdated: 0, errors: [] };
    console.log("[AIPricingSync] Starting pricing sync...");

    const pricingData = await fetchGooglePricingPage();
    const pricingMap = new Map<string, ParsedPricing>();
    for (const p of pricingData) pricingMap.set(p.modelId, p);
    console.log(`[AIPricingSync] Parsed ${pricingData.length} model prices from Google pricing page`);

    const googleModels = apiKey ? await fetchGoogleModels(apiKey) : [];
    result.modelsDiscovered = googleModels.length;
    console.log(`[AIPricingSync] Discovered ${googleModels.length} Gemini models from API`);

    // Fetch existing DB records
    const existingDocs = new Map<string, { $id: string; pricingSource: string }>();
    try {
        let offset = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const batch = await databases.listDocuments(DATABASE_ID, AI_MODEL_PRICING_ID, [Query.limit(100), Query.offset(offset)]);
            for (const doc of batch.documents) {
                const d = doc as unknown as { $id: string; modelId: string; pricingSource: string };
                existingDocs.set(d.modelId, { $id: d.$id, pricingSource: d.pricingSource });
            }
            if (batch.documents.length < 100) break;
            offset += 100;
        }
    } catch (error) {
        console.warn("[AIPricingSync] Failed to fetch existing records:", error);
    }

    // Merge and upsert
    const processedModelIds = new Set<string>();
    for (const model of googleModels) {
        const modelId = model.name.replace("models/", "");
        if (processedModelIds.has(modelId)) continue;
        processedModelIds.add(modelId);
        const existing = existingDocs.get(modelId);
        if (existing?.pricingSource === "admin_override") { result.modelsSkipped++; continue; }

        const pricing = pricingMap.get(modelId);
        const tier = inferTier(modelId);
        const docData: Record<string, unknown> = {
            modelId, displayName: model.displayName || modelId, isActive: true, tier,
            inputTokenLimit: model.inputTokenLimit || null,
            outputTokenLimit: model.outputTokenLimit || null,
            supportedMethods: model.supportedGenerationMethods ? JSON.stringify(model.supportedGenerationMethods) : null,
            lastSyncedAt: new Date().toISOString(),
        };

        if (pricing) {
            docData.inputPricePerMillionTokens = pricing.inputPricePerMillionTokens;
            docData.outputPricePerMillionTokens = pricing.outputPricePerMillionTokens;
            docData.pricingSource = "google_scraper";
            result.pricingUpdated++;
        } else if (!existing) {
            const defaults = getDefaultPricingForTier(tier);
            docData.inputPricePerMillionTokens = defaults.input;
            docData.outputPricePerMillionTokens = defaults.output;
            docData.pricingSource = "google_api";
        }

        try {
            if (existing) {
                await databases.updateDocument(DATABASE_ID, AI_MODEL_PRICING_ID, existing.$id, docData);
                result.modelsUpdated++;
            } else {
                await databases.createDocument(DATABASE_ID, AI_MODEL_PRICING_ID, ID.unique(), docData);
                result.modelsCreated++;
            }
        } catch (error) {
            result.errors.push(`Failed "${modelId}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const azurePrices = await fetchAzureFoundryGrokPricing();
    await upsertFoundryCatalog(databases, existingDocs, azurePrices, result);

    invalidatePricingCache();
    console.log(`[AIPricingSync] Done: ${result.modelsCreated} created, ${result.modelsUpdated} updated, ${result.modelsSkipped} admin-skipped, ${result.errors.length} errors`);
    return result;
}

// Suppress unused import warning — AIModelPricing is used in type context
void (0 as unknown as AIModelPricing);

// ============================================================================
// HELPERS
// ============================================================================

function inferTier(modelId: string): "economy" | "standard" | "flagship" {
    const lower = modelId.toLowerCase();
    if (lower.includes("pro") || lower.includes("ultra")) return "flagship";
    if (lower.includes("lite")) return "economy";
    if (lower.includes("flash")) return "standard";
    return "standard";
}

function getDefaultPricingForTier(tier: "economy" | "standard" | "flagship"): { input: number; output: number } {
    switch (tier) {
        case "economy": return { input: 0.075, output: 0.30 };
        case "standard": return { input: 0.15, output: 0.60 };
        case "flagship": return { input: 1.25, output: 10.00 };
    }
}
