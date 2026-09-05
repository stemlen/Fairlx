import { describe, expect, it } from "vitest";

import {
    AI_CUSTOMER_MARKUP,
    applyCustomerMarkup,
    calculateCustomerTokenCostUSD,
    calculateProviderTokenCostUSD,
    parseChatCompletionUsage,
} from "./ai-billing";

const grok46 = {
    inputPricePerMillionTokens: 2,
    outputPricePerMillionTokens: 6,
    cachedInputPricePerMillionTokens: 0.5,
};

describe("AI token billing", () => {
    it("marks Azure list prices up by 15%", () => {
        expect(AI_CUSTOMER_MARKUP).toBe(1.15);
        expect(applyCustomerMarkup(10)).toBe(11.5);
        expect(applyCustomerMarkup(6)).toBe(6.9);
    });

    it("bills Grok 4.6 input/output/cache at Foundry rates then markup", () => {
        const billed = calculateCustomerTokenCostUSD(grok46, 1_000_000, 1_000_000, 0);
        expect(billed.providerCostUSD).toBe(8);
        expect(billed.costUSD).toBe(9.2);

        const cached = calculateCustomerTokenCostUSD(grok46, 1_000_000, 0, 1_000_000);
        expect(cached.providerCostUSD).toBe(0.5);
        expect(cached.costUSD).toBe(0.575);
    });

    it("bills GPT-5.6 Luna input/output/cache at Foundry rates then markup", () => {
        const luna = {
            inputPricePerMillionTokens: 0.2,
            outputPricePerMillionTokens: 1.2,
            cachedInputPricePerMillionTokens: 0.02,
        };
        const billed = calculateCustomerTokenCostUSD(luna, 1_000_000, 1_000_000, 0);
        expect(billed.providerCostUSD).toBe(1.4);
        expect(billed.costUSD).toBe(1.61);

        const cached = calculateCustomerTokenCostUSD(luna, 1_000_000, 0, 1_000_000);
        expect(cached.providerCostUSD).toBe(0.02);
        expect(cached.costUSD).toBe(0.023);
    });

    it("does not double-count cached prompt tokens", () => {
        const provider = calculateProviderTokenCostUSD(grok46, 1000, 0, 400);
        // 600 uncached @ $2 + 400 cached @ $0.50 = 0.0012 + 0.0002
        expect(provider).toBe(0.0014);
    });

    it("parses Azure/OpenAI usage including cached tokens", () => {
        const usage = parseChatCompletionUsage({
            usage: {
                prompt_tokens: 1200,
                completion_tokens: 80,
                total_tokens: 1280,
                prompt_tokens_details: { cached_tokens: 900 },
            },
        });
        expect(usage).toEqual({
            promptTokens: 1200,
            completionTokens: 80,
            cachedTokens: 900,
            totalTokens: 1280,
            estimated: false,
        });
    });

    it("parses Responses API usage with input/output token names", () => {
        const usage = parseChatCompletionUsage({
            usage: {
                input_tokens: 291,
                output_tokens: 43,
                total_tokens: 334,
                input_tokens_details: { cached_tokens: 0 },
            },
        });
        expect(usage).toEqual({
            promptTokens: 291,
            completionTokens: 43,
            cachedTokens: 0,
            totalTokens: 334,
            estimated: false,
        });
    });
});
