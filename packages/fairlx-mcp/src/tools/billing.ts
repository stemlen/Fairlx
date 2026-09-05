import { forbiddenError, invalidParams } from "../protocol/errors";
import type { McpToolResult } from "../protocol/types";
import type { AuthContext } from "../auth/context";
import type { McpQuery, McpRuntime } from "../runtime/types";
import { toolResult } from "../runtime/output";
import { listAllDocuments, optionalString } from "./helpers";
import { actorCanReadOrganization, organizationName, resolveOrganizationId } from "./organization";

const EVENT_SCAN_CAP = 5000;
const OVERDRAFT_USD = 20;

export type UsageEventLike = {
  $id?: string;
  workspaceId?: string;
  projectId?: string;
  resourceType?: string;
  source?: string;
  units?: number;
  weightedUnits?: number;
  module?: string;
  metadata?: unknown;
  timestamp?: string;
};

export type UsageTotals = {
  events: number;
  billedUSD: number;
  aiTokens: number;
  trafficBytes: number;
  storageBytes: number;
  computeUnits: number;
};

function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function parseEventMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function displayModelName(raw: string): string {
  const n = raw.trim().toLowerCase();
  if (!n) return "Unknown model";
  if (/luna|gpt-5\.6/.test(n)) return "GPT-5.6 Luna";
  if (/grok/.test(n)) return "Grok 4.6";
  if (/deepseek|v4-flash/.test(n)) return "DeepSeek V4 Flash";
  return raw.trim();
}

export function purposeLabel(event: UsageEventLike, meta: Record<string, unknown>): string {
  const operation = String(meta.operation || "").toLowerCase();
  const module = String(meta.module || event.module || "").toLowerCase();
  if (operation === "agent_chat" || operation.startsWith("agent_")) return "Agent chat";
  if (module === "docs") return "Project docs AI";
  if (module === "github") return "GitHub AI";
  if (event.source === "ai" || module === "ai") return "Other AI";
  if (event.resourceType === "traffic") return "API traffic";
  if (event.resourceType === "storage") return "Storage";
  if (event.resourceType === "compute") return "Compute";
  return "Other";
}

type Bucket = {
  key: string;
  label: string;
  events: number;
  billedUSD: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
};

function addBucket(map: Map<string, Bucket>, key: string, label: string, patch: Omit<Bucket, "key" | "label">) {
  const current = map.get(key) ?? {
    key,
    label,
    events: 0,
    billedUSD: 0,
    tokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
  };
  current.events += patch.events;
  current.billedUSD = roundUsd(current.billedUSD + patch.billedUSD);
  current.tokens += patch.tokens;
  current.promptTokens += patch.promptTokens;
  current.completionTokens += patch.completionTokens;
  current.cachedTokens += patch.cachedTokens;
  map.set(key, current);
}

export function summarizeUsageEvents(events: UsageEventLike[]) {
  const totals: UsageTotals = {
    events: events.length,
    billedUSD: 0,
    aiTokens: 0,
    trafficBytes: 0,
    storageBytes: 0,
    computeUnits: 0,
  };
  const byModel = new Map<string, Bucket>();
  const byPurpose = new Map<string, Bucket>();
  const byWorkspace = new Map<string, Bucket>();

  for (const event of events) {
    const meta = parseEventMetadata(event.metadata);
    const units = asNumber(event.units);
    const cost = asNumber(meta.costUSD);
    const promptTokens = asNumber(meta.promptTokens);
    const completionTokens = asNumber(meta.completionTokens);
    const cachedTokens = asNumber(meta.cachedTokens);
    const tokens = asNumber(meta.totalTokens) || (event.source === "ai" ? units : 0);
    const billed = meta.billed === false ? 0 : cost;
    totals.billedUSD = roundUsd(totals.billedUSD + billed);

    if (event.resourceType === "traffic") totals.trafficBytes += units;
    else if (event.resourceType === "storage") totals.storageBytes += units;
    else if (event.resourceType === "compute" && event.source !== "ai") {
      totals.computeUnits += asNumber(event.weightedUnits) || units;
    }
    if (event.source === "ai") totals.aiTokens += tokens || units;

    const purpose = purposeLabel(event, meta);
    addBucket(byPurpose, purpose, purpose, {
      events: 1,
      billedUSD: billed,
      tokens: tokens || units,
      promptTokens,
      completionTokens,
      cachedTokens,
    });

    const workspaceId = String(event.workspaceId || "");
    if (workspaceId) {
      addBucket(byWorkspace, workspaceId, workspaceId, {
        events: 1,
        billedUSD: billed,
        tokens: tokens || units,
        promptTokens,
        completionTokens,
        cachedTokens,
      });
    }

    if (event.source !== "ai" && !meta.model && !meta.modelId && !meta.displayName) continue;
    const rawName = String(meta.displayName || meta.model || meta.modelId || "").trim();
    const label = displayModelName(rawName);
    addBucket(byModel, label, label, {
      events: 1,
      billedUSD: billed,
      tokens: tokens || units,
      promptTokens,
      completionTokens,
      cachedTokens,
    });
  }

  const sortBuckets = (items: Bucket[]) =>
    [...items].sort((a, b) => b.billedUSD - a.billedUSD || b.tokens - a.tokens);

  return {
    totals,
    byModel: sortBuckets([...byModel.values()]),
    byPurpose: sortBuckets([...byPurpose.values()]),
    byWorkspace: sortBuckets([...byWorkspace.values()]),
  };
}

function periodBounds(period?: string): { period: string; start: string; end: string } {
  const raw = period?.trim() || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    throw invalidParams("period must be YYYY-MM");
  }
  const start = `${raw}-01T00:00:00.000Z`;
  const next = new Date(`${raw}-01T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { period: raw, start, end: next.toISOString() };
}

async function isWorkspaceAdmin(
  runtime: McpRuntime,
  auth: AuthContext,
  workspaceId: string,
): Promise<boolean> {
  const membership = await runtime.store.list<Record<string, unknown>>(runtime.collections.members, [
    { type: "equal", field: "userId", value: auth.actorUserId },
    { type: "equal", field: "workspaceId", value: workspaceId },
    { type: "limit", value: 1 },
  ]);
  const role = String(membership.documents[0]?.role ?? "").toUpperCase();
  return role === "OWNER" || role === "ADMIN" || role === "WS_ADMIN";
}

async function canViewOrgBilling(runtime: McpRuntime, auth: AuthContext, organizationId: string): Promise<boolean> {
  if (runtime.resolveUserOrgAccess) {
    const access = await runtime.resolveUserOrgAccess(auth.actorUserId, organizationId);
    if (access.isOwner) return true;
    if (access.permissions.includes("org.billing.view") || access.permissions.includes("org.billing.manage")) {
      return true;
    }
  }
  return false;
}

async function listPeriodEvents(
  runtime: McpRuntime,
  collection: string,
  workspaceIds: string[],
  start: string,
  end: string,
): Promise<UsageEventLike[]> {
  if (!workspaceIds.length) return [];
  const documents: UsageEventLike[] = [];
  let cursor: string | undefined;
  const workspaceFilter: McpQuery =
    workspaceIds.length === 1
      ? { type: "equal", field: "workspaceId", value: workspaceIds[0]! }
      : { type: "equal", field: "workspaceId", value: workspaceIds };
  for (;;) {
    const queries: McpQuery[] = [
      workspaceFilter,
      { type: "greaterThanEqual", field: "timestamp", value: start },
      { type: "lessThan", field: "timestamp", value: end },
      { type: "limit", value: 100 },
      { type: "orderDesc", field: "timestamp" },
      ...(cursor ? [{ type: "cursorAfter" as const, value: cursor }] : []),
    ];
    const page = await runtime.store.list<UsageEventLike>(collection, queries);
    documents.push(...page.documents);
    if (page.documents.length === 0 || documents.length >= Math.min(page.total, EVENT_SCAN_CAP)) break;
    const last = page.documents[page.documents.length - 1];
    cursor = String(last?.$id ?? "");
    if (!cursor) break;
  }
  return documents.slice(0, EVENT_SCAN_CAP);
}

async function loadWallet(
  runtime: McpRuntime,
  options: { organizationId?: string; userId?: string },
) {
  const collection = runtime.collections.wallets;
  if (!collection) return null;
  const extra: McpQuery[] = options.organizationId
    ? [{ type: "equal", field: "organizationId", value: options.organizationId }]
    : [{ type: "equal", field: "userId", value: options.userId || "" }];
  const result = await runtime.store.list<Record<string, unknown>>(collection, [
    ...extra,
    { type: "limit", value: 1 },
  ]);
  const wallet = result.documents[0];
  if (!wallet) return null;
  const balance = asNumber(wallet.balance);
  const lockedBalance = asNumber(wallet.lockedBalance);
  return {
    balance: roundUsd(balance),
    lockedBalance: roundUsd(lockedBalance),
    available: roundUsd(balance - lockedBalance),
    currency: String(wallet.currency || "USD"),
    status: String(wallet.status || "active"),
    locksAtUSD: -OVERDRAFT_USD,
  };
}

export async function usageSummary(
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext,
): Promise<McpToolResult> {
  const collection = runtime.collections.usageEvents;
  if (!collection) {
    return toolResult({ error: "Usage ledger is not configured." }, true);
  }

  const { period, start, end } = periodBounds(optionalString(args, "period"));
  const workspaceId = optionalString(args, "workspaceId") || auth.workspaceId;
  const wantOrg =
    Boolean(optionalString(args, "organizationId")) ||
    String(args.scope || "").toLowerCase() === "organization" ||
    String(args.scope || "").toLowerCase() === "org";

  let organizationId: string | undefined;
  try {
    organizationId = await resolveOrganizationId(
      { ...args, workspaceId: workspaceId || auth.workspaceId },
      runtime,
      auth,
    );
  } catch {
    organizationId = optionalString(args, "organizationId") || auth.organizationId;
  }

  const orgName = organizationId ? await organizationName(runtime, organizationId) : null;
  let workspaceIds: string[] = [];
  let scope: "organization" | "workspace" = "workspace";
  let note: string | undefined;

  if (wantOrg || (!workspaceId && organizationId)) {
    if (!organizationId) throw invalidParams("Provide organizationId or a workspace in an organization.");
    if (!(await actorCanReadOrganization(runtime, auth, organizationId))) {
      throw forbiddenError("You do not have access to this organization.");
    }
    const canOrg = await canViewOrgBilling(runtime, auth, organizationId);
    const workspaces = await listAllDocuments(runtime, runtime.collections.workspaces, [
      { type: "equal", field: "organizationId", value: organizationId },
    ]);
    const orgWorkspaceIds = workspaces.map((doc) => String(doc.$id ?? doc.id ?? "")).filter(Boolean);
    if (canOrg) {
      workspaceIds = orgWorkspaceIds;
      scope = "organization";
    } else if (workspaceId && (await isWorkspaceAdmin(runtime, auth, workspaceId))) {
      workspaceIds = [workspaceId];
      scope = "workspace";
      note = "Org-wide billing needs org.billing.view. Showing this workspace only.";
    } else {
      throw forbiddenError("Organization billing requires org.billing.view or workspace admin access.");
    }
  } else {
    if (!workspaceId) throw invalidParams("Provide workspaceId or organizationId.");
    const admin = await isWorkspaceAdmin(runtime, auth, workspaceId);
    const orgOk = organizationId ? await canViewOrgBilling(runtime, auth, organizationId) : false;
    if (!admin && !orgOk) {
      throw forbiddenError("Billing and usage require a workspace admin or org billing access.");
    }
    workspaceIds = [workspaceId];
    scope = "workspace";
  }

  const events = await listPeriodEvents(runtime, collection, workspaceIds, start, end);
  const summary = summarizeUsageEvents(events);
  const wallet = await loadWallet(
    runtime,
    organizationId ? { organizationId } : { userId: auth.actorUserId },
  );

  const workspaceName =
    workspaceId && workspaceIds.length === 1
      ? String(
          (
            await runtime.store.get<Record<string, unknown>>(runtime.collections.workspaces, workspaceId).catch(() => ({
              name: "",
            }))
          ).name ?? "",
        ) || undefined
      : undefined;

  return toolResult({
    period,
    scope,
    organizationId: organizationId || undefined,
    organizationName: orgName || undefined,
    workspaceId: scope === "workspace" ? workspaceIds[0] : undefined,
    workspaceName,
    workspaceCount: workspaceIds.length,
    wallet,
    totals: summary.totals,
    byModel: summary.byModel.map(({ key: _key, ...rest }) => rest),
    byPurpose: summary.byPurpose.map(({ key: _key, ...rest }) => rest),
    note,
    hint: "AI amounts include Fairlx markup when billed. BYOK calls show $0 billed. Wallet is the prepaid org/user balance.",
  });
}
