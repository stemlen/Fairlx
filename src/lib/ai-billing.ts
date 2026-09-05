/**
 * Token billing math shared by server metering and unit tests.
 *
 * Customer price = Azure / provider list price × 15% markup.
 * Example: $10 / 1M output tokens → $11.50 billed.
 */

export const AI_CUSTOMER_MARKUP = 1.15;
export const WALLET_OVERDRAFT_LIMIT_USD = 20;

export type TokenPricePerMillion = {
    inputPricePerMillionTokens: number;
    outputPricePerMillionTokens: number;
    cachedInputPricePerMillionTokens?: number;
};

export type ProviderTokenUsage = {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    totalTokens: number;
    estimated: boolean;
};

function asNumber(value: unknown): number {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export function roundUsd(value: number): number {
    return Number(value.toFixed(6));
}

export function applyCustomerMarkup(providerCostUSD: number, markup = AI_CUSTOMER_MARKUP): number {
    return roundUsd(Math.max(0, providerCostUSD) * markup);
}

/**
 * Provider cost before Fairlx markup.
 * Cached tokens are billed at the cache rate; the rest of the prompt at input rate.
 */
export function calculateProviderTokenCostUSD(
    pricing: TokenPricePerMillion,
    promptTokens: number,
    completionTokens: number,
    cachedTokens = 0,
): number {
    const prompt = Math.max(0, promptTokens || 0);
    const completion = Math.max(0, completionTokens || 0);
    const cached = Math.min(Math.max(0, cachedTokens || 0), prompt);
    const cacheRate = pricing.cachedInputPricePerMillionTokens;
    const billCachedSeparately = typeof cacheRate === "number" && cacheRate >= 0 && cached > 0;
    const uncachedPrompt = billCachedSeparately ? prompt - cached : prompt;

    const inputCost = (uncachedPrompt / 1_000_000) * pricing.inputPricePerMillionTokens;
    const cacheCost = billCachedSeparately ? (cached / 1_000_000) * cacheRate : 0;
    const outputCost = (completion / 1_000_000) * pricing.outputPricePerMillionTokens;
    return roundUsd(inputCost + cacheCost + outputCost);
}

export function calculateCustomerTokenCostUSD(
    pricing: TokenPricePerMillion,
    promptTokens: number,
    completionTokens: number,
    cachedTokens = 0,
): { providerCostUSD: number; costUSD: number; markup: number } {
    const providerCostUSD = calculateProviderTokenCostUSD(
        pricing,
        promptTokens,
        completionTokens,
        cachedTokens,
    );
    return {
        providerCostUSD,
        costUSD: applyCustomerMarkup(providerCostUSD),
        markup: AI_CUSTOMER_MARKUP,
    };
}

function readUsageObject(raw: unknown): Record<string, unknown> | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (record.usage && typeof record.usage === "object") {
        return record.usage as Record<string, unknown>;
    }
    if (
        "prompt_tokens" in record ||
        "input_tokens" in record ||
        "completion_tokens" in record ||
        "output_tokens" in record
    ) {
        return record;
    }
    return null;
}

/**
 * Parse OpenAI / Azure Foundry / xAI chat.completions `usage` payloads.
 */
export function parseChatCompletionUsage(raw: unknown): ProviderTokenUsage | null {
    const usage = readUsageObject(raw);
    if (!usage) return null;

    const promptTokens = asNumber(usage.prompt_tokens ?? usage.input_tokens);
    const completionTokens = asNumber(usage.completion_tokens ?? usage.output_tokens);
    const details =
        usage.prompt_tokens_details && typeof usage.prompt_tokens_details === "object"
            ? (usage.prompt_tokens_details as Record<string, unknown>)
            : usage.input_tokens_details && typeof usage.input_tokens_details === "object"
                ? (usage.input_tokens_details as Record<string, unknown>)
                : {};
    const cachedTokens = Math.min(
        promptTokens,
        asNumber(
            details.cached_tokens ??
            details.cache_read_tokens ??
            usage.cached_tokens ??
            usage.cache_read_input_tokens ??
            usage.cached_input_tokens,
        ),
    );
    if (promptTokens <= 0 && completionTokens <= 0) return null;

    return {
        promptTokens,
        completionTokens,
        cachedTokens,
        totalTokens: asNumber(usage.total_tokens) || promptTokens + completionTokens,
        estimated: false,
    };
}
