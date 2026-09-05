import { describe, expect, it } from "vitest";

import {
  hasNotionDocStructure,
  normalizeMarkdownSpacing,
  parseCalloutKind,
  stripInlineMarkdown,
} from "./project-doc-markdown";

const sample = `# Authentication

*How sessions, cookies, and RBAC work in this product.*

> [!NOTE]
> Grounded in the current repo — not a stub.

## Sources
- fairlx_work_item_list
- github_read_file

## Steps
1. Confirm login.
2. Document token lifetime.
`;

describe("normalizeMarkdownSpacing", () => {
  it("inserts a blank line after headings and before lists, but not between list items", () => {
    const raw = "# Title\n*tagline*\n## Sources\n- a\n- b\nParagraph\n- c";
    const next = normalizeMarkdownSpacing(raw);
    expect(next).toContain("# Title\n\n*tagline*");
    expect(next).toContain("## Sources\n\n- a\n- b");
    expect(next).toContain("Paragraph\n\n- c");
  });

  it("splits same-line callouts onto two quote lines", () => {
    expect(normalizeMarkdownSpacing("> [!NOTE] Hello world")).toContain("> [!NOTE]\n> Hello world");
  });
});

describe("hasNotionDocStructure", () => {
  it("accepts a title, tagline, sections, lists, and a callout", () => {
    expect(hasNotionDocStructure(sample)).toBe(true);
  });

  it("rejects a wall of text even when it is long", () => {
    expect(hasNotionDocStructure(`${"Research notes without headings. ".repeat(80)}`)).toBe(false);
  });
});

describe("parseCalloutKind", () => {
  it("maps aliases", () => {
    expect(parseCalloutKind("[!DANGER] leak")?.kind).toBe("risk");
    expect(parseCalloutKind("[!NOTE]\nHello")?.rest).toBe("Hello");
  });
});

describe("stripInlineMarkdown", () => {
  it("removes emphasis markers for exports", () => {
    expect(stripInlineMarkdown("Use **Accept** on ==staged== writes")).toBe("Use Accept on staged writes");
  });
});
