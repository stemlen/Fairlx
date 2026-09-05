export type DocPackItem = {
  category: string;
  title: string;
};

/** Product planning pack when no GitHub repo is linked. */
export const COMPLETE_DOC_PACK: readonly DocPackItem[] = [
  { category: "prd", title: "Product Requirements Document (PRD)" },
  { category: "frd", title: "Functional Requirements (FRD)" },
  { category: "brd", title: "Business Requirements (BRD)" },
  { category: "user_stories", title: "User Stories and Acceptance Criteria" },
  { category: "user_guide", title: "User Guide" },
  { category: "test_plan", title: "Test Plan" },
  { category: "release_notes", title: "Release Readiness" },
  { category: "srs", title: "Software Requirements (SRS)" },
] as const;

/** Same pack, with architecture replacing SRS when a repo can ground it. */
export const COMPLETE_DOC_PACK_WITH_GITHUB: readonly DocPackItem[] = [
  ...COMPLETE_DOC_PACK.slice(0, 7),
  { category: "architecture", title: "Architecture" },
] as const;

const PACK_CATEGORIES = new Set([
  ...COMPLETE_DOC_PACK.map((item) => item.category),
  ...COMPLETE_DOC_PACK_WITH_GITHUB.map((item) => item.category),
  "technical_spec",
  "api_doc",
  "design_doc",
]);

export function isDocPackCategory(category: string | undefined): boolean {
  return Boolean(category && PACK_CATEGORIES.has(category));
}

export function documentationPack(hasGithubRepo: boolean): readonly DocPackItem[] {
  return hasGithubRepo ? COMPLETE_DOC_PACK_WITH_GITHUB : COMPLETE_DOC_PACK;
}

export function documentationPackInstructions(hasGithubRepo: boolean): string {
  const pack = documentationPack(hasGithubRepo);
  const lines = pack.map((item, index) => `${index + 1}. ${item.category} — ${item.title}`);
  const eighth = hasGithubRepo
    ? "Fold API notes into architecture. Skip technical_spec, api_doc, and a separate SRS."
    : "Skip technical_spec, api_doc, and code-derived architecture until a repo is linked. Fold API notes into the FRD.";
  return [
    "When asked for project documentation, a PRD, FRD, BRD, specs, or all required documents, the complete pack is:",
    ...lines,
    "That pack is a roadmap, not a reason to dump eight stubs. Save at most 2 documents this turn — each must be a long researched study (1800+ words, 8+ sections, at least 3 public http URLs in Sources).",
    eighth,
    "Without web research, do not call fairlx_doc_create at all. First fairlx_doc_list, fairlx_work_item_list, and fairlx_sprint_list for project facts."
      + (hasGithubRepo
        ? " Then github_list_files or github_read_file when code is relevant."
        : " No GitHub repo is linked — do not call github_list_files or github_read_file, and do not ask the user to create a repository first."),
    "Then run at least 3 web_search queries with different angles (market, competitors, users/jobs, regulations or similar products) and web_fetch at most 4 URLs. Read the extracts. Analyze what applies to THIS project. If search returns little, try better queries — never invent citations.",
    "Do not fairlx_work_item_get each epic or story — the list plus 3 searches is enough. As soon as you have those, call fairlx_doc_create for the PRD. Extra fetches fill Grok's context and hang the run.",
    "Only after that write. Start with the PRD unless the user named another type. In staged mode wait for Accept before saving.",
    "If fairlx_doc_list already has an AI (mcp-inline) doc in that category, fairlx_doc_create updates it in place only when the new body is still a full researched study.",
    "Do not emit one delegate_agent per document type. A researcher may search first; one writer then saves. Parallel doc specialists produce waste.",
    "If a create result is research_required, keep searching and fetching. If it is packComplete, stop creating and summarize. The user can send another message for the next pack item.",
    "Never save a namesake outline, a 100-line summary, or Sources that are only Fairlx tool names.",
  ].join(" ");
}
