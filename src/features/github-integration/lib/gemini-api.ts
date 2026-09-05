import { DOCUMENTATION_QUESTIONS } from "../constants";
import { aiService, type AIServiceResponse } from "@/lib/ai-service";

/**
 * GeminiAPI wrapper - uses the unified AI service (Google Gemini)
 * 
 * This class maintains backward compatibility with existing code while
 * delegating all AI calls to the centralized AI service.
 * 
 * All methods now return AIServiceResponse (text + tokenUsage + model)
 * to enable token-accurate, model-aware billing.
 * 
 * Environment variables (via AIService):
 * - GEMINI_API_KEY: API key for Google Gemini authentication
 * - GEMINI_MODEL: Default model to use (default: gemini-2.5-flash)
 */
export class GeminiAPI {
  public isConfigured(): boolean {
    return aiService.isConfigured();
  }

  public ensureConfigured(): void {
    aiService.ensureConfigured();
  }

  async summarizeFile(filePath: string, content: string): Promise<AIServiceResponse> {
    return aiService.summarizeFile(filePath, content);
  }

  async generateDocumentation(
    repositoryInfo: { name: string; description?: string; language?: string },
    files: Array<{ path: string; content: string; summary?: string }>
  ): Promise<AIServiceResponse> {
    return aiService.generateDocumentation(repositoryInfo, files);
  }

  async refineDocumentation(
    currentDocumentation: string,
    prompt: string,
    files: Array<{ path: string; content: string }>
  ): Promise<AIServiceResponse> {
    return aiService.refineDocumentation(currentDocumentation, prompt, files);
  }

  /**
   * Generate FAQ — aggregates token usage across all FAQ calls.
   * Returns the FAQ Record + combined token usage from all individual calls.
   */
  async generateFAQ(
    files: Array<{ path: string; content: string }>,
    repositoryName: string
  ): Promise<{ faq: Record<string, string>; tokenUsage: AIServiceResponse["tokenUsage"]; model: string }> {
    const faq: Record<string, string> = {};
    const fileContext = files.slice(0, 15).map((f) => `${f.path}: ${f.content.slice(0, 800)}`).join("\n---\n");

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCachedTokens = 0;
    let totalTokens = 0;
    let model = "";

    for (const question of DOCUMENTATION_QUESTIONS) {
      try {
        const prompt = `Project: ${repositoryName}\n\nCodebase Files:\n${fileContext}\n\nQuestion: ${question}\n\nProvide a detailed, informative answer (max 300 words):`;
        const response = await aiService.generate(prompt, { maxTokens: 400 });
        faq[question] = response.text;
        totalPromptTokens += response.tokenUsage.promptTokens;
        totalCompletionTokens += response.tokenUsage.completionTokens;
        totalCachedTokens += response.tokenUsage.cachedTokens;
        totalTokens += response.tokenUsage.totalTokens;
        if (!model) model = response.model;
        // small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 250));
      } catch {
        faq[question] = "Unable to generate answer at this time.";
      }
    }

    return {
      faq,
      tokenUsage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        cachedTokens: totalCachedTokens,
        totalTokens,
      },
      model,
    };
  }

  async analyzeCodeQuality(files: Array<{ path: string; content: string }>): Promise<AIServiceResponse> {
    return aiService.analyzeCodeQuality(files);
  }
}

export const geminiAPI = new GeminiAPI();
