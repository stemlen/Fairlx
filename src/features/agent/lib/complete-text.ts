import type { AgentAiConfigStored } from "../types";
import { fromResponsesResponse, isResponsesResponse, stripUnsupportedSamplingParams, toResponsesRequest } from "./openai-responses";
import { resolveChatTarget } from "./runtime";

const COMPILE_TIMEOUT_MS = 45_000;

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : String((part as { text?: string })?.text ?? "")))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export async function completePlainText(params: {
  stored: AgentAiConfigStored;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const target = resolveChatTarget(params.stored);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMPILE_TIMEOUT_MS);
  const body = {
    model: target.model,
    temperature: 0.2,
    max_tokens: params.maxTokens ?? Math.min(target.maxOutputTokens ?? 4096, 4096),
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  };
  const payload =
    target.api === "responses"
      ? toResponsesRequest(stripUnsupportedSamplingParams(target.model, body))
      : stripUnsupportedSamplingParams(target.model, body);
  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: target.headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    let json: { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } } = {};
    try {
      json = text ? (JSON.parse(text) as typeof json) : {};
    } catch {
      json = { error: { message: text } };
    }
    if (!response.ok) {
      throw new Error(json.error?.message || `Prompt compile failed (${response.status})`);
    }
    const normalized =
      target.api === "responses" || isResponsesResponse(json) ? fromResponsesResponse(json) : json;
    const content = extractText(normalized.choices?.[0]?.message?.content);
    if (!content.trim()) throw new Error("Prompt compiler returned an empty response.");
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}
