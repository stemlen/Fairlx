import { describe, expect, it } from "vitest";

import {
  COMPLETE_DOC_PACK,
  COMPLETE_DOC_PACK_WITH_GITHUB,
  documentationPack,
  documentationPackInstructions,
  isDocPackCategory,
} from "./project-doc-pack";

describe("documentation pack", () => {
  it("is exactly 8 documents and covers PRD, FRD, and BRD", () => {
    expect(COMPLETE_DOC_PACK).toHaveLength(8);
    expect(COMPLETE_DOC_PACK.map((item) => item.category)).toEqual([
      "prd",
      "frd",
      "brd",
      "user_stories",
      "user_guide",
      "test_plan",
      "release_notes",
      "srs",
    ]);
    expect(COMPLETE_DOC_PACK_WITH_GITHUB).toHaveLength(8);
    expect(COMPLETE_DOC_PACK_WITH_GITHUB.at(-1)?.category).toBe("architecture");
  });

  it("treats pack and related spec categories as upsertable", () => {
    expect(isDocPackCategory("prd")).toBe(true);
    expect(isDocPackCategory("architecture")).toBe(true);
    expect(isDocPackCategory("meeting_notes")).toBe(false);
    expect(isDocPackCategory("other")).toBe(false);
  });

  it("tells the agent to research the web and save at most two documents", () => {
    const withoutRepo = documentationPackInstructions(false);
    expect(documentationPack(false)).toBe(COMPLETE_DOC_PACK);
    expect(withoutRepo).toMatch(/at most 2 documents/i);
    expect(withoutRepo).toMatch(/Do not emit one delegate_agent per document type/);
    expect(withoutRepo).toMatch(/Do not fairlx_work_item_get each epic/);
    expect(withoutRepo).toMatch(/web_search/);
    expect(withoutRepo).toMatch(/packComplete/);
    expect(withoutRepo).toMatch(/Skip technical_spec, api_doc/);
    expect(withoutRepo).toMatch(/do not call github_list_files/i);

    const withRepo = documentationPackInstructions(true);
    expect(withRepo).toMatch(/github_list_files or github_read_file/);
    expect(withRepo).not.toMatch(/do not call github_list_files/i);
  });
});
