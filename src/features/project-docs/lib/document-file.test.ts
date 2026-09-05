import { describe, expect, it } from "vitest";

import { markdownToDocxParagraphs } from "./document-export";
import {
  contentDisposition,
  documentBody,
  downloadFileName,
  isInlineFileId,
  isMarkdownDocument,
  splitDocContent,
} from "./document-file";

describe("document file helpers", () => {
  it("treats MCP inline docs as markdown even without a mime type", () => {
    expect(isInlineFileId("mcp-inline")).toBe(true);
    expect(isMarkdownDocument({ fileId: "mcp-inline", mimeType: "text/markdown" })).toBe(true);
    expect(isMarkdownDocument({ fileId: "abc", mimeType: "application/pdf" })).toBe(false);
    expect(isMarkdownDocument({ fileId: "abc", mimeType: "application/octet-stream", title: "PRD.md" })).toBe(true);
  });

  it("prefers the long body over the short description", () => {
    expect(documentBody({ aiSummary: "# Full spec", description: "Short" })).toBe("# Full spec");
    expect(documentBody({ description: "Short" })).toBe("Short");
  });

  it("splits long markdown so Appwrite description does not truncate the body", () => {
    const body = `${"A".repeat(5000)}\n\n# Rest`;
    const split = splitDocContent(body);
    expect(split.description.length).toBe(4000);
    expect(split.aiSummary.startsWith("A")).toBe(true);
    expect(split.size).toBe(body.trim().length);
  });

  it("builds a download filename and content-disposition header", () => {
    expect(downloadFileName("School PRD.md", "pdf")).toBe("School PRD.pdf");
    expect(contentDisposition('Q2 "Plan".md')).toContain("filename=");
    expect(contentDisposition("Plan.md")).toContain("filename*=UTF-8''Plan.md");
  });
});

describe("markdown to pdf", () => {
  it("renders a pdf buffer from markdown", async () => {
    const { markdownToPdfBuffer } = await import("./document-export");
    const bytes = markdownToPdfBuffer("Title", "# Hello\n\nBody");
    expect(bytes.byteLength).toBeGreaterThan(100);
  });
});

describe("markdown to docx", () => {
  it("turns headings and bullets into paragraphs", () => {
    const paragraphs = markdownToDocxParagraphs("# Title\n\n- one\nBody text");
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
  });
});
