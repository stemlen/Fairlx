import { describe, expect, it } from "vitest";

import {
  MAX_PROJECT_DOCS_PER_TURN,
  MAX_WEB_FETCHES_PER_TURN,
  MIN_WEB_RESEARCH_CALLS_BEFORE_DOC,
  docPackCompletePayload,
  emptyDocTurnLimits,
  hasRequiredWebResearch,
  noteWebResearch,
  releaseDocCreateSlot,
  reserveDocCreateSlot,
  reserveWebFetchSlot,
  seedDocTurnLimitsFromMessages,
} from "./doc-turn-limits";

describe("doc turn limits", () => {
  it("reserves at most two creates and is safe for parallel callers", () => {
    const limits = emptyDocTurnLimits();
    const reserved = Array.from({ length: 6 }, () => reserveDocCreateSlot(limits));
    expect(reserved.filter(Boolean)).toHaveLength(MAX_PROJECT_DOCS_PER_TURN);
    expect(limits.docCreates).toBe(2);
    expect(reserveDocCreateSlot(limits)).toBe(false);

    releaseDocCreateSlot(limits);
    expect(limits.docCreates).toBe(1);
    expect(reserveDocCreateSlot(limits)).toBe(true);
    expect(limits.docCreates).toBe(2);
  });

  it("requires web research before a document can be saved", () => {
    const limits = emptyDocTurnLimits();
    expect(hasRequiredWebResearch(limits)).toBe(false);
    noteWebResearch(limits);
    noteWebResearch(limits);
    expect(hasRequiredWebResearch(limits)).toBe(false);
    noteWebResearch(limits);
    expect(limits.webResearchCalls).toBe(MIN_WEB_RESEARCH_CALLS_BEFORE_DOC);
    expect(hasRequiredWebResearch(limits)).toBe(true);
  });

  it("tells the model the pack is complete instead of asking it to retry create", () => {
    const payload = docPackCompletePayload(2);
    expect(payload.packComplete).toBe(true);
    expect(payload.instruction).toMatch(/Do not call fairlx_doc_create again/);
  });

  it("caps public page fetches so research cannot overflow the model window", () => {
    const limits = emptyDocTurnLimits();
    const reserved = Array.from({ length: MAX_WEB_FETCHES_PER_TURN + 3 }, () => reserveWebFetchSlot(limits));
    expect(reserved.filter(Boolean)).toHaveLength(MAX_WEB_FETCHES_PER_TURN);
    expect(reserveWebFetchSlot(limits)).toBe(false);
  });

  it("seeds research and fetch counts from an existing transcript", () => {
    const limits = seedDocTurnLimitsFromMessages([
      { role: "tool", toolName: "web_search" },
      { role: "tool", toolName: "web_search" },
      { role: "tool", toolName: "web_fetch" },
      { role: "tool", toolName: "fairlx_work_item_list" },
    ]);
    expect(limits.webResearchCalls).toBe(3);
    expect(limits.webFetches).toBe(1);
    expect(hasRequiredWebResearch(limits)).toBe(true);
  });
});
