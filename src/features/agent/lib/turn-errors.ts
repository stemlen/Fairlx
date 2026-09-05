import { agentChatTimeoutMs } from "./limits";

export const AGENT_CHAT_TIMEOUT_MS = agentChatTimeoutMs();

export function isContextLengthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /context.?length|maximum context|prompt is too long|too many tokens|max(?:imum)? input|input.*(too large|exceed)|exceeds? (the )?model/i.test(
    message,
  );
}

export function isTransientModelFetchError(error: unknown): boolean {
  if (isContextLengthError(error)) return false;
  if (!(error instanceof Error)) {
    return /fetch failed|failed to fetch/i.test(String(error));
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") return false;
  const cause =
    "cause" in error && error.cause instanceof Error
      ? `${error.cause.name} ${error.cause.message}`
      : String((error as { cause?: unknown }).cause ?? "");
  const blob = `${error.name} ${error.message} ${cause}`;
  return /fetch failed|failed to fetch|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR_|socket hang up|other side closed|EPIPE|network/i.test(
    blob,
  );
}

export async function withTransientFetchRetry<T>(
  run: () => Promise<T>,
  options?: { attempts?: number; shouldRetry?: () => boolean },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      const retry =
        attempt < attempts &&
        isTransientModelFetchError(error) &&
        (options?.shouldRetry?.() ?? true);
      if (!retry) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw last;
}

export function formatAgentTurnError(error: unknown, timeoutMs = AGENT_CHAT_TIMEOUT_MS): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  const aborted =
    name === "AbortError" ||
    name === "TimeoutError" ||
    /this operation was aborted/i.test(message) ||
    /aborted due to timeout/i.test(message) ||
    /the operation was aborted/i.test(message);

  if (aborted) {
    return `The model request timed out after ${Math.round(timeoutMs / 1000)}s. Try again.`;
  }

  if (isTransientModelFetchError(error) || /fetch failed/i.test(message)) {
    return "The model provider connection dropped. Retry the same message.";
  }

  return message || "Agent turn failed.";
}
