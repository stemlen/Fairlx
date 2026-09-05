import { Databases, ID, Query } from "node-appwrite";

import { AGENT_HARNESS_ID, AGENT_RUNS_ID, DATABASE_ID } from "@/config";
import { DEFAULT_ENABLED_TOOLS, NEW_AGENT_TOOL_IDS, STARTER_SKILLS, STARTER_WORK_PATTERNS } from "../constants";
import type {
  AgentAutomation,
  AgentChatMeta,
  AgentGitStaging,
  AgentHarness,
  AgentHarnessSettings,
  AgentKnowledgeItem,
  AgentPluginConnection,
  AgentSkill,
  AgentWorkPattern,
} from "../types";
import { emptyChatMeta, emptyGitStaging, parseChatMeta, parseGitStaging } from "./git-staging";
import { isAgentSessionMode } from "./session-context";
import { parseJson, stringifyBounded } from "./truncate";

type HarnessDocument = {
  $id: string;
  $updatedAt?: string;
  userId: string;
  skillsJson: string;
  automationsJson: string;
  knowledgeJson: string;
  workPatternsJson: string;
  settingsJson: string;
  gitStagingJson?: string;
  chatMetaJson?: string;
  pluginsJson?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function withIds<T extends { name: string }>(
  items: Array<Omit<T, "id" | "createdAt">>,
): Array<T & { id: string; createdAt: string }> {
  const createdAt = nowIso();
  return items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    createdAt,
  })) as Array<T & { id: string; createdAt: string }>;
}

export function defaultHarnessSettings(): AgentHarnessSettings {
  return {
    mode: "agent",
    enabledTools: [...DEFAULT_ENABLED_TOOLS],
    sessionMode: "agent",
    permissionType: "staged",
  };
}

export function defaultHarnessData(): Pick<
  AgentHarness,
  "skills" | "automations" | "knowledge" | "workPatterns" | "settings" | "gitStaging" | "chatMeta" | "plugins"
> {
  return {
    skills: withIds<AgentSkill>(STARTER_SKILLS),
    automations: [],
    knowledge: [],
    workPatterns: withIds<AgentWorkPattern>(STARTER_WORK_PATTERNS),
    settings: defaultHarnessSettings(),
    gitStaging: emptyGitStaging(),
    chatMeta: emptyChatMeta(),
    plugins: [],
  };
}

function mergeEnabledTools(saved: string[] | undefined): string[] {
  const base = !Array.isArray(saved)
    ? [...DEFAULT_ENABLED_TOOLS]
    : NEW_AGENT_TOOL_IDS.some((id) => saved.includes(id))
      ? saved
      : [...saved, ...NEW_AGENT_TOOL_IDS];
  return base.includes("web_fetch") ? base : [...base, "web_fetch"];
}

function parsePlugins(raw: unknown): AgentPluginConnection[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is AgentPluginConnection => Boolean(item && typeof item === "object"));
}

export function parseHarness(doc: HarnessDocument): AgentHarness {
  const defaults = defaultHarnessData();
  const settings = {
    ...defaults.settings,
    ...parseJson<Partial<AgentHarnessSettings>>(doc.settingsJson, {}),
  };
  settings.enabledTools = mergeEnabledTools(settings.enabledTools);
  const sessionMode = settings.sessionMode;
  if (isAgentSessionMode(sessionMode)) {
    settings.sessionMode = sessionMode === "multitask" ? "personal" : sessionMode;
  } else {
    settings.sessionMode = "agent";
  }
  if (settings.sessionMode === "ask") {
    settings.mode = "manual";
  } else if (settings.mode !== "manual") {
    settings.mode = "agent";
  }
  if (settings.permissionType !== "all_access") {
    settings.permissionType = "staged";
  }

  const settingsExtras = parseJson<{ gitStaging?: unknown; chatMeta?: unknown; plugins?: unknown }>(
    doc.settingsJson,
    {},
  );

  return {
    id: doc.$id,
    userId: doc.userId,
    skills: parseJson<AgentSkill[]>(doc.skillsJson, defaults.skills),
    automations: parseJson<AgentAutomation[]>(doc.automationsJson, defaults.automations),
    knowledge: parseJson<AgentKnowledgeItem[]>(doc.knowledgeJson, defaults.knowledge),
    workPatterns: parseJson<AgentWorkPattern[]>(doc.workPatternsJson, defaults.workPatterns),
    settings,
    gitStaging: parseGitStaging(
      parseJson<AgentGitStaging | null>(doc.gitStagingJson, null) ?? settingsExtras.gitStaging ?? defaults.gitStaging,
    ),
    chatMeta: parseChatMeta(
      parseJson<AgentChatMeta | null>(doc.chatMetaJson, null) ?? settingsExtras.chatMeta ?? defaults.chatMeta,
    ),
    plugins: parsePlugins(parseJson(doc.pluginsJson, settingsExtras.plugins ?? defaults.plugins)),
    updatedAt: doc.$updatedAt || nowIso(),
  };
}

async function getHarnessDocument(databases: Databases, userId: string) {
  const result = await databases.listDocuments(DATABASE_ID, AGENT_HARNESS_ID, [
    Query.equal("userId", userId),
    Query.limit(1),
  ]);
  return (result.documents[0] as unknown as HarnessDocument | undefined) ?? null;
}

function corePayload(payload: Record<string, string>) {
  const { gitStagingJson, chatMetaJson, pluginsJson, ...core } = payload;
  const settings = parseJson<Record<string, unknown>>(core.settingsJson, {});
  return {
    ...core,
    settingsJson: stringifyBounded(
      {
        ...settings,
        gitStaging: parseJson(gitStagingJson, emptyGitStaging()),
        chatMeta: parseJson(chatMetaJson, emptyChatMeta()),
        plugins: parseJson(pluginsJson, []),
      },
      4096,
    ),
  };
}

async function createHarnessDocument(databases: Databases, payload: Record<string, string>) {
  try {
    return (await databases.createDocument(
      DATABASE_ID,
      AGENT_HARNESS_ID,
      ID.unique(),
      payload,
    )) as unknown as HarnessDocument;
  } catch {
    return (await databases.createDocument(
      DATABASE_ID,
      AGENT_HARNESS_ID,
      ID.unique(),
      corePayload(payload),
    )) as unknown as HarnessDocument;
  }
}

async function updateHarnessDocument(databases: Databases, id: string, payload: Record<string, string>) {
  try {
    return (await databases.updateDocument(
      DATABASE_ID,
      AGENT_HARNESS_ID,
      id,
      payload,
    )) as unknown as HarnessDocument;
  } catch {
    return (await databases.updateDocument(
      DATABASE_ID,
      AGENT_HARNESS_ID,
      id,
      corePayload(payload),
    )) as unknown as HarnessDocument;
  }
}

export async function getOrCreateHarness(databases: Databases, userId: string): Promise<AgentHarness> {
  const existing = await getHarnessDocument(databases, userId);
  if (existing) return parseHarness(existing);

  const seed = defaultHarnessData();
  const created = await createHarnessDocument(databases, {
    userId,
    skillsJson: stringifyBounded(seed.skills),
    automationsJson: stringifyBounded(seed.automations),
    knowledgeJson: stringifyBounded(seed.knowledge),
    workPatternsJson: stringifyBounded(seed.workPatterns),
    settingsJson: stringifyBounded(seed.settings, 4096),
    gitStagingJson: stringifyBounded(seed.gitStaging),
    chatMetaJson: stringifyBounded(seed.chatMeta, 4096),
    pluginsJson: stringifyBounded(seed.plugins),
  });

  return parseHarness(created);
}

export async function upsertHarness(
  databases: Databases,
  userId: string,
  patch: Partial<
    Pick<AgentHarness, "skills" | "automations" | "knowledge" | "workPatterns" | "gitStaging" | "chatMeta" | "plugins">
  > & {
    settings?: Partial<AgentHarnessSettings>;
  },
): Promise<AgentHarness> {
  const current = await getOrCreateHarness(databases, userId);
  const next: AgentHarness = {
    ...current,
    skills: patch.skills ?? current.skills,
    automations: patch.automations ?? current.automations,
    knowledge: patch.knowledge ?? current.knowledge,
    workPatterns: patch.workPatterns ?? current.workPatterns,
    gitStaging: patch.gitStaging ?? current.gitStaging,
    chatMeta: patch.chatMeta ?? current.chatMeta,
    plugins: patch.plugins ?? current.plugins,
    settings: {
      ...current.settings,
      ...(patch.settings ?? {}),
      enabledTools: mergeEnabledTools(patch.settings?.enabledTools ?? current.settings.enabledTools),
    },
  };
  if (next.settings.sessionMode === "ask") {
    next.settings.mode = "manual";
  } else if (patch.settings?.sessionMode && patch.settings.sessionMode !== "ask") {
    next.settings.mode = patch.settings.mode ?? "agent";
  }

  const payload: Record<string, string> = {
    userId,
    skillsJson: stringifyBounded(next.skills),
    automationsJson: stringifyBounded(next.automations),
    knowledgeJson: stringifyBounded(next.knowledge),
    workPatternsJson: stringifyBounded(next.workPatterns),
    settingsJson: stringifyBounded(next.settings, 4096),
    gitStagingJson: stringifyBounded(next.gitStaging),
    chatMetaJson: stringifyBounded(next.chatMeta, 4096),
    pluginsJson: stringifyBounded(next.plugins),
  };

  const existing = await getHarnessDocument(databases, userId);
  const saved = existing
    ? await updateHarnessDocument(databases, existing.$id, payload)
    : await createHarnessDocument(databases, payload);

  return parseHarness(saved);
}

export async function resetHarness(databases: Databases, userId: string): Promise<AgentHarness> {
  const seed = defaultHarnessData();
  return upsertHarness(databases, userId, seed);
}

export async function deleteUserRuns(databases: Databases, userId: string): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < 20; i += 1) {
    const page = await databases.listDocuments(DATABASE_ID, AGENT_RUNS_ID, [
      Query.equal("userId", userId),
      Query.limit(100),
    ]);
    if (page.documents.length === 0) break;
    await Promise.all(
      page.documents.map((doc) => databases.deleteDocument(DATABASE_ID, AGENT_RUNS_ID, doc.$id)),
    );
    deleted += page.documents.length;
    if (page.documents.length < 100) break;
  }
  return deleted;
}
