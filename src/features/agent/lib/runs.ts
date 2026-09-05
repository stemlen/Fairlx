import { Databases, ID, Query } from "node-appwrite";

import { AGENT_RUNS_ID, DATABASE_ID } from "@/config";
import type { AgentChatMessage, AgentRun, AgentRunMode, AgentRunStatus, AgentToolEvent } from "../types";
import { extractAttachedFiles, serializeAttachments, withAttachedFiles } from "./attachments";
import { AGENT_EVENTS_JSON_MAX, AGENT_MESSAGES_JSON_MAX, AGENT_PROMPT_ATTR_MAX } from "./limits";
import { isTrainingRun } from "./personal-training";
import { displayUserContent } from "./session-context";
import { parseJson, stringifyBounded, truncateString } from "./truncate";

type RunDocument = {
  $id: string;
  $createdAt: string;
  $updatedAt?: string;
  userId: string;
  title: string;
  prompt: string;
  status: AgentRunStatus;
  mode: AgentRunMode;
  workspaceId?: string;
  projectId?: string;
  modelId?: string;
  messagesJson: string;
  eventsJson: string;
  error?: string;
    extraJson?: string;
  attachmentsJson?: string;
};

type RunExtra = {
  kind?: string;
  contextPeak?: {
    conversation: number;
    summarized_conversation: number;
  };
};

export function parseRun(doc: RunDocument): AgentRun {
  const extra = parseJson<RunExtra>(doc.extraJson, {});
  const prompt = doc.prompt;
  const kind = isTrainingRun({ kind: extra.kind, prompt }) ? "training" : "chat";
  const attachments = parseJson<Array<{ name: string; body: string }>>(doc.attachmentsJson, []);
  const messages = parseJson<AgentChatMessage[]>(doc.messagesJson, []).map((message, index) => {
    if (index !== 0 || message.role !== "user" || !attachments.length) return message;
    return { ...message, content: withAttachedFiles(message.content, attachments) };
  });
  const contextPeak = extra.contextPeak;
  return {
    id: doc.$id,
    userId: doc.userId,
    title: doc.title,
    prompt,
    status: doc.status,
    mode: doc.mode === "manual" ? "manual" : "agent",
    workspaceId: doc.workspaceId || undefined,
    projectId: doc.projectId || undefined,
    modelId: doc.modelId || undefined,
    messages,
    events: parseJson<AgentToolEvent[]>(doc.eventsJson, []),
    error: doc.error || undefined,
    kind,
    contextPeak:
      contextPeak && typeof contextPeak.conversation === "number"
        ? {
            conversation: Math.max(0, contextPeak.conversation),
            summarized_conversation: Math.max(0, contextPeak.summarized_conversation ?? 0),
          }
        : undefined,
    createdAt: doc.$createdAt,
    updatedAt: doc.$updatedAt || doc.$createdAt,
  };
}

export async function listRuns(databases: Databases, userId: string, limit = 50): Promise<AgentRun[]> {
  const result = await databases.listDocuments(DATABASE_ID, AGENT_RUNS_ID, [
    Query.equal("userId", userId),
    Query.orderDesc("$createdAt"),
    Query.limit(Math.min(limit, 100)),
  ]);
  return result.documents.map((doc) => parseRun(doc as unknown as RunDocument));
}

export async function getRun(databases: Databases, userId: string, runId: string): Promise<AgentRun | null> {
  try {
    const doc = await databases.getDocument(DATABASE_ID, AGENT_RUNS_ID, runId);
    const run = parseRun(doc as unknown as RunDocument);
    if (run.userId !== userId) return null;
    return run;
  } catch {
    return null;
  }
}

export async function createRun(
  databases: Databases,
  input: {
    userId: string;
    prompt: string;
    mode: AgentRunMode;
    workspaceId?: string;
    projectId?: string;
    modelId?: string;
    messages?: AgentChatMessage[];
    kind?: "chat" | "training";
    title?: string;
  },
): Promise<AgentRun> {
  const fullPrompt = input.prompt.trim();
  const attachments = extractAttachedFiles(fullPrompt);
  const visible = displayUserContent(fullPrompt) || fullPrompt;
  const prompt = truncateString(visible, AGENT_PROMPT_ATTR_MAX);
  const kind = isTrainingRun({ kind: input.kind, prompt: fullPrompt }) ? "training" : "chat";
  const title = truncateString(
    input.title?.trim() || (kind === "training" ? "Train Personal Agent" : visible.replace(/\s+/g, " ")),
    80,
  );
  const createdAt = new Date().toISOString();
  const messages = input.messages ?? [
    {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: fullPrompt,
      createdAt,
    },
  ];

  const payload: Record<string, unknown> = {
    userId: input.userId,
    title,
    prompt,
    status: "running",
    mode: input.mode,
    workspaceId: input.workspaceId || "",
    projectId: input.projectId || "",
    modelId: input.modelId || "",
    messagesJson: stringifyBounded(messages, AGENT_MESSAGES_JSON_MAX),
    eventsJson: stringifyBounded([], AGENT_EVENTS_JSON_MAX),
    extraJson: stringifyBounded({ kind }, 4096),
    attachmentsJson: serializeAttachments(attachments),
    error: "",
  };

  let doc;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      doc = await databases.createDocument(DATABASE_ID, AGENT_RUNS_ID, ID.unique(), { ...payload });
      break;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(/Unknown attribute:\s*"([^"]+)"/i);
      if (match && match[1] && match[1] in payload) {
        delete payload[match[1]];
        continue;
      }
      throw error;
    }
  }

  if (!doc) {
    throw new Error("Failed to create agent run document.");
  }

  const parsed = parseRun(doc as unknown as RunDocument);
  const first = parsed.messages[0];
  if (first?.role === "user" && fullPrompt.length > (first.content?.length ?? 0)) {
    return {
      ...parsed,
      messages: [{ ...first, content: fullPrompt }, ...parsed.messages.slice(1)],
    };
  }
  return parsed;
}

export async function updateRun(
  databases: Databases,
  runId: string,
  patch: Partial<{
    title: string;
    status: AgentRunStatus;
    workspaceId: string;
    projectId: string;
    modelId: string;
    messages: AgentChatMessage[];
    events: AgentToolEvent[];
    error: string;
    extra: {
      kind?: string;
      contextPeak?: {
        conversation: number;
        summarized_conversation: number;
      };
    };
  }>,
): Promise<AgentRun> {
  const payload: Record<string, string> = {};
  if (patch.title !== undefined) payload.title = truncateString(patch.title, 512);
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.workspaceId !== undefined) payload.workspaceId = patch.workspaceId || "";
  if (patch.projectId !== undefined) payload.projectId = patch.projectId || "";
  if (patch.modelId !== undefined) payload.modelId = patch.modelId || "";
  if (patch.messages !== undefined) {
    payload.messagesJson = stringifyBounded(patch.messages, AGENT_MESSAGES_JSON_MAX);
    const files = patch.messages.flatMap((message) =>
      message.role === "user" ? extractAttachedFiles(message.content) : [],
    );
    if (files.length) payload.attachmentsJson = serializeAttachments(files);
  }
  if (patch.events !== undefined) payload.eventsJson = stringifyBounded(patch.events, AGENT_EVENTS_JSON_MAX);
  if (patch.error !== undefined) payload.error = truncateString(patch.error, 2048);
  if (patch.extra !== undefined) payload.extraJson = stringifyBounded(patch.extra, 4096);

  let doc;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      doc = await databases.updateDocument(DATABASE_ID, AGENT_RUNS_ID, runId, { ...payload });
      break;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(/Unknown attribute:\s*"([^"]+)"/i);
      if (match && match[1] && match[1] in payload) {
        delete payload[match[1]];
        continue;
      }
      throw error;
    }
  }

  if (!doc) {
    throw new Error(`Failed to update agent run document ${runId}.`);
  }

  const parsed = parseRun(doc as unknown as RunDocument);
  if (patch.messages) {
    return {
      ...parsed,
      messages: patch.messages,
      events: patch.events ?? parsed.events,
      contextPeak: patch.extra?.contextPeak ?? parsed.contextPeak,
    };
  }
  if (patch.events) {
    return {
      ...parsed,
      events: patch.events,
      contextPeak: patch.extra?.contextPeak ?? parsed.contextPeak,
    };
  }
  if (patch.extra?.contextPeak) {
    return { ...parsed, contextPeak: patch.extra.contextPeak };
  }
  return parsed;
}

export async function deleteRun(databases: Databases, userId: string, runId: string): Promise<boolean> {
  const existing = await getRun(databases, userId, runId);
  if (!existing) return false;
  await databases.deleteDocument(DATABASE_ID, AGENT_RUNS_ID, runId);
  return true;
}
