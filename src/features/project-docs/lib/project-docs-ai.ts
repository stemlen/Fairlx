/**
 * Project Docs AI - Gemini API wrapper for project documentation AI features
 * 
 * This is a standalone AI utility specifically for the project-docs feature.
 * It provides AI-powered Q&A based on project documents, tasks, and details.
 */

// Gemini API response types
interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  parts?: GeminiPart[];
  text?: string;
}

interface GeminiCandidate {
  content?: GeminiContent | string | GeminiContent[];
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  output?: { content?: unknown }[];
  text?: string;
  output_text?: string;
}

interface GeminiPayload {
  contents: {
    parts: { text: string }[];
  }[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

/**
 * Extract text from Gemini API response
 */
function extractTextFromResponse(json: GeminiResponse): string {
  if (!json) return "";

  // Gemini API format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
  if (Array.isArray(json.candidates) && json.candidates[0]?.content) {
    const content = json.candidates[0].content;
    if (typeof content === 'object' && content !== null && 'parts' in content) {
      const parts = content.parts;
      if (Array.isArray(parts)) {
        return parts.map((p) => p.text || "").join("");
      }
    }
  }

  // Legacy format: { candidates: [{ content: "..." }] }
  if (Array.isArray(json.candidates) && json.candidates[0]?.content) {
    const content = json.candidates[0].content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((c) => (typeof c === 'object' && c !== null && 'text' in c ? c.text : String(c))).join("\n");
    }
  }

  // Example: { output_text: "..." }
  if (typeof json.output_text === "string") return json.output_text;

  // Example: { text: "..." }
  if (typeof json.text === "string") return json.text;

  // Last resort: return stringified JSON
  try {
    return JSON.stringify(json);
  } catch {
    return String(json);
  }
}

/**
 * Project Docs AI class for handling AI-powered project context Q&A
 */
export class ProjectDocsAI {
  private apiKey: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
  }

  public isConfigured(): boolean {
    return !!this.apiKey;
  }

  public ensureConfigured(): void {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY must be configured in the environment");
    }
  }

  private async callGemini(payload: GeminiPayload, retries = 2): Promise<string> {
    this.ensureConfigured();

    const url = `${this.baseUrl}?key=${this.apiKey}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        // Retry on 429/5xx
        if ((res.status === 429 || res.status >= 500) && retries > 0) {
          await new Promise((r) => setTimeout(r, 500));
          return this.callGemini(payload, retries - 1);
        }
        throw new Error(`Gemini API error ${res.status}: ${text}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        return extractTextFromResponse(json);
      }

      return await res.text();
    } catch (err) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 500));
        return this.callGemini(payload, retries - 1);
      }
      console.error("Gemini call failed:", err);
      throw err;
    }
  }

  private buildPayload(prompt: string, options?: { maxTokens?: number; temperature?: number }): GeminiPayload {
    return {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: options?.temperature ?? 0.3,
        maxOutputTokens: options?.maxTokens ?? 2000,
      }
    };
  }

  /**
   * Answer a question about the project using provided context
   */
  async answerProjectQuestion(prompt: string): Promise<string> {
    const payload = this.buildPayload(prompt, {
      maxTokens: 2000,
      temperature: 0.3
    });
    return this.callGemini(payload);
  }

  /**
   * Generate a summary of the project based on documents and tasks
   */
  async generateProjectSummary(
    projectName: string,
    documents: Array<{ name: string; category: string; content: string }>,
    tasks: Array<{ name: string; status: string; description?: string }>
  ): Promise<string> {
    const docContext = documents
      .slice(0, 10)
      .map((d) => `- **${d.name}** (${d.category}): ${d.content.slice(0, 500)}`)
      .join("\n");

    const taskContext = tasks
      .slice(0, 20)
      .map((t) => `- ${t.name} [${t.status}]: ${t.description?.slice(0, 100) || "No description"}`)
      .join("\n");

    const prompt = `Generate a comprehensive project summary for "${projectName}".

## Project Documents
${docContext || "No documents available."}

## Project Tasks
${taskContext || "No tasks created."}

---

Create a professional project summary including:
1. **Overview**: What is this project about?
2. **Key Documents**: What documentation exists and what do they cover?
3. **Current Work**: What tasks are in progress or planned?
4. **Status Assessment**: Overall project health and progress

Format in clean Markdown. Be concise but informative.`;

    const payload = this.buildPayload(prompt, { maxTokens: 1500 });
    return this.callGemini(payload);
  }

  /**
   * Extract key insights from a document
   */
  async extractDocumentInsights(
    documentName: string,
    documentContent: string,
    category: string
  ): Promise<string> {
    const prompt = `Analyze this ${category} document and extract key insights:

## Document: ${documentName}

${documentContent.slice(0, 8000)}

---

Provide:
1. **Summary**: Brief overview of the document
2. **Key Points**: Main takeaways (bullet points)
3. **Action Items**: Any tasks or requirements mentioned
4. **Dependencies**: External dependencies or requirements

Format in clean Markdown.`;

    const payload = this.buildPayload(prompt, { maxTokens: 1500 });
    return this.callGemini(payload);
  }
}

// Export singleton instance
export const projectDocsAI = new ProjectDocsAI();
