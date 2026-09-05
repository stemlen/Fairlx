import type { AgentChatMessage } from "../../types";
import { compactJsonString, unwrapMcpToolContent } from "../truncate";

export const COMPRESS_KEEP_RECENT = 8;
export const SPECIALIST_RESULT_MAX = 24000;
export const MODEL_HISTORY = 24;
export const CONTEXT_BUDGET_RATIO = 0.72;

function summarizeToolBody(content: string): string {
  const raw = unwrapMcpToolContent(content);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return compactJsonString(raw, 400);
    const slim: Record<string, unknown> = { compressed: true };
    for (const key of ["error", "key", "title", "status", "path", "url", "html_url", "message", "ok", "jobId", "skipped"]) {
      if (parsed[key] != null) slim[key] = parsed[key];
    }
    if (Array.isArray(parsed.items)) slim.itemCount = parsed.items.length;
    if (Array.isArray(parsed.workItems)) slim.workItemCount = parsed.workItems.length;
    if (Array.isArray(parsed.findings)) slim.findingCount = parsed.findings.length;
    if (Array.isArray(parsed.hits)) slim.hitCount = parsed.hits.length;
    if (Array.isArray(parsed.extracts)) slim.extractCount = parsed.extracts.length;
    if (typeof parsed.content === "string") slim.contentPreview = parsed.content.slice(0, 180);
    if (typeof parsed.text === "string") slim.textPreview = parsed.text.slice(0, 400);
    if (typeof parsed.extract === "string") slim.extractPreview = parsed.extract.slice(0, 400);
    return compactJsonString(JSON.stringify(slim), 700);
  } catch {
    return compactJsonString(raw, 400);
  }
}

export function compressMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  if (messages.length <= COMPRESS_KEEP_RECENT) return messages;
  const cut = messages.length - COMPRESS_KEEP_RECENT;
  return messages.map((message, index) => {
    if (index >= cut) return message;
    if (message.role !== "tool") return message;
    return { ...message, content: summarizeToolBody(message.content) };
  });
}

export function capSpecialistResult(content: string): string {
  return compactJsonString(content, SPECIALIST_RESULT_MAX);
}

function payloadChars(system: string, messages: AgentChatMessage[]): number {
  const body = messages.reduce((sum, message) => {
    const args =
      message.toolCalls?.reduce((inner, call) => inner + call.arguments.length + call.name.length, 0) ?? 0;
    return sum + (message.content?.length ?? 0) + args;
  }, 0);
  return system.length + body;
}

function shrinkToolContent(message: AgentChatMessage, cap: number): AgentChatMessage {
  if (message.role !== "tool") return message;
  return { ...message, content: compactJsonString(message.content ?? "", cap) };
}

/**
 * Keep the prompt inside the model's input window so a research turn cannot hang
 * on a 72k+ Grok call after Wikipedia fetches.
 */
export function fitMessagesForModel(
  system: string,
  messages: AgentChatMessage[],
  maxInputTokens?: number,
  budgetRatio = CONTEXT_BUDGET_RATIO,
): AgentChatMessage[] {
  let next = compressMessages(messages);
  const firstUser = messages.find((message) => message.role === "user");
  if (firstUser && !next.some((message) => message.id === firstUser.id)) {
    next = [firstUser, ...next.filter((message) => message.id !== firstUser.id)];
  }
  next = next.slice(-MODEL_HISTORY);

  if (!maxInputTokens || maxInputTokens <= 0) return next;
  const budgetChars = Math.max(12_000, Math.floor(maxInputTokens * 4 * budgetRatio) - 4_000);
  if (payloadChars(system, next) <= budgetChars) return next;

  next = next.map((message) => shrinkToolContent(message, 2_500));
  if (payloadChars(system, next) <= budgetChars) return next;

  const toolIndexes = next.map((message, index) => (message.role === "tool" ? index : -1)).filter((index) => index >= 0);
  const keepRecent = new Set(toolIndexes.slice(-2));
  next = next.map((message, index) => {
    if (message.role !== "tool") return message;
    if (keepRecent.has(index)) return shrinkToolContent(message, 1_800);
    return { ...message, content: summarizeToolBody(message.content) };
  });
  if (payloadChars(system, next) <= budgetChars) return next;

  next = next.map((message) => (message.role === "tool" ? { ...message, content: summarizeToolBody(message.content) } : message));
  return next;
}

export function estimatedFittedTokens(
  system: string,
  messages: AgentChatMessage[],
  maxInputTokens?: number,
  budgetRatio = CONTEXT_BUDGET_RATIO,
): number {
  const chars = payloadChars(system, fitMessagesForModel(system, messages, maxInputTokens, budgetRatio));
  return Math.max(1, Math.ceil(chars / 4));
}
