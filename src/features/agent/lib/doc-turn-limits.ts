export const MAX_PROJECT_DOCS_PER_TURN = 2;
export const MIN_WEB_RESEARCH_CALLS_BEFORE_DOC = 3;
export const MAX_WEB_FETCHES_PER_TURN = 6;

export type DocTurnLimits = { docCreates: number; webResearchCalls: number; webFetches: number };

export function emptyDocTurnLimits(): DocTurnLimits {
  return { docCreates: 0, webResearchCalls: 0, webFetches: 0 };
}

export function seedDocTurnLimitsFromMessages(
  messages: Array<{ role?: string; toolName?: string }>,
): DocTurnLimits {
  const limits = emptyDocTurnLimits();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const name = message.toolName ?? "";
    if (name === "web_search" || name === "web_fetch") noteWebResearch(limits);
    if (name === "web_fetch") {
      limits.webFetches = Math.min(MAX_WEB_FETCHES_PER_TURN, limits.webFetches + 1);
    }
  }
  return limits;
}

export function noteWebResearch(limits: DocTurnLimits): void {
  limits.webResearchCalls += 1;
}

export function hasRequiredWebResearch(limits: DocTurnLimits): boolean {
  return limits.webResearchCalls >= MIN_WEB_RESEARCH_CALLS_BEFORE_DOC;
}

export function reserveDocCreateSlot(limits: DocTurnLimits): boolean {
  if (limits.docCreates >= MAX_PROJECT_DOCS_PER_TURN) return false;
  limits.docCreates += 1;
  return true;
}

export function releaseDocCreateSlot(limits: DocTurnLimits): void {
  if (limits.docCreates > 0) limits.docCreates -= 1;
}

export function reserveWebFetchSlot(limits: DocTurnLimits): boolean {
  if (limits.webFetches >= MAX_WEB_FETCHES_PER_TURN) return false;
  limits.webFetches += 1;
  return true;
}

export function researchRequiredPayload(calls: number) {
  return {
    error: "research_required",
    webResearchCalls: calls,
    minRequired: MIN_WEB_RESEARCH_CALLS_BEFORE_DOC,
    instruction:
      "Do not create a document yet. Call web_search at least 3 times with different queries (market, competitors, users, regulations, similar products), then web_fetch the most useful URLs. Analyze those findings. Only then write one long cited document. Fairlx work items alone are not research. Do not fairlx_work_item_get every epic.",
  };
}

export function webFetchCapPayload(fetches: number) {
  return {
    skipped: true,
    webFetches: fetches,
    maxFetchesPerTurn: MAX_WEB_FETCHES_PER_TURN,
    instruction:
      "This turn already fetched enough public pages. Do not web_fetch again. Call fairlx_doc_create now and write the PRD from the searches and pages already in context. Cite the http URLs you have.",
  };
}

export function docPackCompletePayload(createdThisTurn: number) {
  return {
    packComplete: true,
    createdThisTurn,
    maxCreatesPerTurn: MAX_PROJECT_DOCS_PER_TURN,
    instruction:
      "This turn already saved the maximum of 2 researched documents. Do not call fairlx_doc_create again. Summarize what was saved. The user can send another message for the next document in the pack.",
  };
}
