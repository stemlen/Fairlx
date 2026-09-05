/**
 * Unified AI Service - Google Gemini API wrapper
 * 
 * This module provides a centralized AI service that works with Google's Gemini AI.
 * 
 * Environment variables:
 * - GEMINI_API_KEY: API key for Google Gemini authentication
 * - GEMINI_MODEL: Default model to use (default: gemini-2.5-flash)
 */

// OpenAI-compatible response types
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Token usage metadata returned by every AI call.
 * Enables model-aware, token-accurate billing.
 */
export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

/**
 * Response from every AIService method.
 * Contains the text result AND token usage for billing.
 */
export interface AIServiceResponse {
  /** The generated text content */
  text: string;
  /** Actual token usage from Gemini usageMetadata */
  tokenUsage: AITokenUsage;
  /** The model that was used (normalized, e.g. "gemini-2.5-flash") */
  model: string;
}


/**
 * Unified AI Service class for all AI-powered features
 */
export class AIService {
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    this.defaultModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  }

  /**
   * Check if the AI service is properly configured
   */
  public isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Ensure the service is configured, throw error if not
   */
  public ensureConfigured(): void {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY must be configured in the environment");
    }
  }

  /**
   * Get available models from the API
   */
  async getModels(): Promise<string[]> {
    this.ensureConfigured();
    
    try {
      const res = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
        method: "GET",
      });

      if (!res.ok) {
        throw new Error(`Failed to get models: ${res.status}`);
      }

      const data = await res.json();
      return data.models?.map((m: { name: string }) => m.name) || [];
    } catch (err) {
      console.error("Error fetching models:", err);
      return [];
    }
  }

  /**
   * Send a chat completion request to Gemini
   */
  private async chatCompletion(
    messages: ChatMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
    retries = 4
  ): Promise<AIServiceResponse> {
    this.ensureConfigured();

    const model = options?.model || this.defaultModel;
    
    // Convert messages to Gemini format
    const systemInstruction = messages.find(m => m.role === "system")?.content;
    const conversationMessages = messages.filter(m => m.role !== "system");
    
    const contents = conversationMessages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    }));

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.3,
        maxOutputTokens: options?.maxTokens ?? 2000,
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    try {
      const res = await fetch(
        `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!res.ok) {
        const text = await res.text();

        // Detect daily quota exhaustion — retrying is futile
        if (res.status === 429) {
          try {
            const errorData = JSON.parse(text);
            const isQuotaExhausted = errorData.error?.details?.some(
              (d: { "@type"?: string; quotaMetric?: string; violations?: Array<{ quotaId?: string }> }) => {
                if (d["@type"]?.includes("QuotaFailure")) {
                  return d.violations?.some((v: { quotaId?: string }) =>
                    v.quotaId?.includes("PerDay") || v.quotaId?.includes("FreeTier")
                  );
                }
                return false;
              }
            );

            if (isQuotaExhausted) {
              console.error("[AIService] Daily quota exhausted. Not retrying — upgrade your plan or wait until the quota resets.");
              throw new Error(
                "QUOTA_EXHAUSTED: Your daily Gemini API request limit has been reached. " +
                "Please upgrade your plan at https://ai.google.dev or wait for the quota to reset."
              );
            }
          } catch (parseErr) {
            // If it's our own QUOTA_EXHAUSTED error, re-throw it
            if (parseErr instanceof Error && parseErr.message.startsWith("QUOTA_EXHAUSTED")) {
              throw parseErr;
            }
            // Otherwise fall through to retry logic
          }
        }

        // Capped exponential backoff: start at 2s, grow by 1.5x, max 8s
        const retryDelay = Math.min(8000, 2000 * Math.pow(1.5, 4 - retries));

        // Retry on transient 429, 503, or other 5xx
        if ((res.status === 429 || res.status === 503 || res.status >= 500) && retries > 0) {
          console.warn(`[AIService] ${res.status} encountered. Retrying in ${Math.round(retryDelay)}ms... (${retries} retries left)`);
          await new Promise((r) => setTimeout(r, retryDelay));
          return this.chatCompletion(messages, options, retries - 1);
        }
        throw new Error(`Gemini API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      // gemini-2.5-flash (and other thinking models) returns multiple parts:
      // thought parts (thought: true) contain internal reasoning and must be excluded;
      // only non-thought parts carry the actual output text.
      const parts: Array<{ text?: string; thought?: boolean }> =
        data.candidates?.[0]?.content?.parts || [];
      const text = parts
        .filter((p) => !p.thought)
        .map((p) => p.text || "")
        .join("") || "";

      // Extract token usage from Gemini usageMetadata
      const usageMetadata = data.usageMetadata;
      const tokenUsage: AITokenUsage = {
        promptTokens: usageMetadata?.promptTokenCount ?? 0,
        completionTokens: usageMetadata?.candidatesTokenCount ?? 0,
        cachedTokens: usageMetadata?.cachedContentTokenCount ?? 0,
        totalTokens: usageMetadata?.totalTokenCount ?? 0,
      };

      return { text, tokenUsage, model };
    } catch (err) {
      // Re-throw quota exhaustion immediately — do not retry
      if (err instanceof Error && err.message.startsWith("QUOTA_EXHAUSTED")) {
        throw err;
      }
      if (retries > 0) {
        const backoff = Math.min(8000, 2000 * Math.pow(1.5, 4 - retries));
        await new Promise((r) => setTimeout(r, backoff));
        return this.chatCompletion(messages, options, retries - 1);
      }
      throw err;
    }
  }

  /**
   * Generate a response from a simple prompt
   */
  async generate(
    prompt: string,
    options?: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<AIServiceResponse> {
    const messages: ChatMessage[] = [];
    
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    
    messages.push({ role: "user", content: prompt });

    return this.chatCompletion(messages, {
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
  }

  /**
   * Summarize a code file
   */
  async summarizeFile(filePath: string, content: string): Promise<AIServiceResponse> {
    const prompt = `Analyze this code file and provide a concise summary (max 200 words):

File: ${filePath}

\`\`\`
${content.slice(0, 5000)}
\`\`\`

Summarize:
- What this file does
- Key components/functions
- Main responsibilities`;

    return this.generate(prompt, { maxTokens: 400 });
  }

  /**
   * Generate comprehensive documentation for a repository
   */
  async generateDocumentation(
    repositoryInfo: { name: string; description?: string; language?: string },
    files: Array<{ path: string; content: string; summary?: string }>
  ): Promise<AIServiceResponse> {
    const fileContext = files
      .map((f, index) => {
        const preview = f.content.slice(0, 3000);
        const lines = preview.split('\n').length;
        return `
## File ${index + 1}: \`${f.path}\`
**Lines analyzed:** ${lines}
**Content preview:**
\`\`\`
${preview}
\`\`\`
`;
      })
      .join("\n");

    const prompt = `You are an elite Lead Technical Architect and Documentation Specialist. Analyze the provided codebase and architect a world-class, production-grade technical manual.

## REPOSITORY CONTEXT
- **Project Name:** ${repositoryInfo.name}
- **Overview:** ${repositoryInfo.description || "Inferred from codebase analysis."}
- **Primary Technology Stack:** ${repositoryInfo.language || "Polyglot"}
- **Scope of Analysis:** ${files.length} core architecture files

## SOURCE CODE ANALYSIS
${fileContext}

---

## DOCUMENTATION REQUIREMENTS (ULTRA-PROFESSIONAL THEME)
Construct a comprehensive technical manual in Markdown. The style must be extremely formal, authoritative, and structured for executive and engineering review. Use clear hierarchy, Mermaid-compatible descriptions where applicable, and high-impact code examples.

### MANDATORY SECTIONS:
1.  **Executive Summary** - The high-level value proposition and system essence.
2.  **System Architecture** - Deep dive into design patterns (e.g., MVC, Microservices, Clean Architecture), core modules, and data flow.
3.  **Core Technical Features** - Detailed breakdown of functionality with focus on implementation logic.
4.  **Engineering Onboarding** - Precise prerequisites, deterministic installation steps, and environment configuration.
5.  **API & Interface Specification** - Exhaustive documentation of primary endpoints with request/response schemas.
6.  **Development Standards** - Naming conventions, architectural constraints, and contribution workflow.
7.  **Quality Assurance** - Testing strategies (Unit, Integration, E2E) and verification procedures.
8.  **DevOps & Deployment** - CI/CD pipeline overview, infrastructure requirements, and production release protocols.
9.  **Security Posture** - Threat models, authentication mechanisms, and data protection strategies.
10. **Operational Runbook** - Common failure modes, troubleshooting, and scalability considerations.

### AESTHETIC GUIDELINES:
- Use clear table of contents.
- Employ clean typography-friendly Markdown.
- Ensure every section provides unique, actionable technical value.
- DO NOT use generic placeholders; derive all content from the provided source code.`;

    return this.generate(prompt, { maxTokens: 8000, temperature: 0.1 });
  }

  /**
   * Refine existing documentation based on user feedback
   */
  async refineDocumentation(
    currentDocumentation: string,
    prompt: string,
    files: Array<{ path: string; content: string }>
  ): Promise<AIServiceResponse> {
    const fileContext = files
      .slice(0, 5)
      .map(f => `File: ${f.path}\nContent Preview: ${f.content.slice(0, 1000)}`)
      .join("\n---\n");

    const aiPrompt = `You are a Lead Technical Architect. A user has requested specific refinements to the existing project documentation.

## CURRENT DOCUMENTATION
${currentDocumentation}

## USER REFINEMENT REQUEST
> ${prompt}

## ADDITIONAL CODEBASE CONTEXT
${fileContext}

---

## REFINEMENT INSTRUCTIONS
Apply the user's requested changes precisely while maintaining the ultra-professional, structured, and authoritative tone of the original document. 
- If the user asks for a structural change, reorganize accordingly.
- If the user identifies missing details, derive them from the codebase context.
- Ensure the output is a COMPLETE, updated version of the documentation, not just the changes.`;

    return this.generate(aiPrompt, { maxTokens: 8000, temperature: 0.1 });
  }

  /**
   * Analyze code quality
   */
  async analyzeCodeQuality(files: Array<{ path: string; content: string }>): Promise<AIServiceResponse> {
    const codeSnippets = files.slice(0, 5).map((f) => `${f.path}:\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``).join("\n\n");

    const prompt = `Analyze the code quality of this project and provide actionable insights:

${codeSnippets}

Provide analysis on:
1. Code organization and structure
2. Potential improvements
3. Security considerations
4. Performance opportunities
5. Best practices adherence

Keep it constructive and specific.`;

    return this.generate(prompt, { maxTokens: 800 });
  }
}

// Export singleton instance
export const aiService = new AIService();
