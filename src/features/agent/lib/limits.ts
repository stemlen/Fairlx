/** One model HTTP call. Paid 1M-context models routinely exceed 60s on planning turns. */
export const DEFAULT_AGENT_CHAT_TIMEOUT_MS = 480_000;

/** Cap so a bad env value cannot hang a worker forever. */
export const MAX_AGENT_CHAT_TIMEOUT_MS = 15 * 60_000;

/** Appwrite `agent_runs.prompt` attribute size. */
export const AGENT_PROMPT_ATTR_MAX = 4096;

/** HTTP body for create-run / follow-up. ~10k-line markdown fits. */
export const AGENT_PROMPT_HTTP_MAX = 2_000_000;

/** New optional `attachmentsJson` attribute (created at this size). */
export const AGENT_ATTACHMENTS_JSON_MAX = 2_000_000;

/** Appwrite `agent_runs.messagesJson` size. Must match the collection attribute. */
export const AGENT_MESSAGES_JSON_MAX = 1_048_576;

/** Appwrite `agent_runs.eventsJson` size. Must match the collection attribute. */
export const AGENT_EVENTS_JSON_MAX = 1_048_576;

export const MAX_ATTACHED_FILE_CHARS = 2_000_000;

/** Full spec goes to a specialist when it is under this many characters. */
export const SPECIALIST_FULL_ATTACH_MAX = 120_000;

export function agentChatTimeoutMs(env = process.env.AGENT_CHAT_TIMEOUT_MS): number {
  const parsed = Number(env);
  if (!Number.isFinite(parsed) || parsed < 30_000) return DEFAULT_AGENT_CHAT_TIMEOUT_MS;
  return Math.min(Math.floor(parsed), MAX_AGENT_CHAT_TIMEOUT_MS);
}
