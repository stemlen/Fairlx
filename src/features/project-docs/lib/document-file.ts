import type { ProjectDocument } from "../types";

export const INLINE_DOC_FILE_ID = "mcp-inline";
export const MAX_DOC_DESCRIPTION_CHARS = 4000;
export const MAX_DOC_BODY_CHARS = 65000;

export type DownloadDocumentFormat = "md" | "pdf" | "docx";

export function isInlineFileId(fileId: string | undefined): boolean {
  const id = String(fileId || "").trim().toLowerCase();
  return !id || id === INLINE_DOC_FILE_ID || id.startsWith("mcp-");
}

export function isMarkdownDocument(doc: {
  mimeType?: string;
  fileId?: string;
  title?: string;
  name?: string;
}): boolean {
  if (isInlineFileId(doc.fileId)) return true;
  const mime = String(doc.mimeType || "").toLowerCase();
  if (mime.includes("markdown") || mime === "text/plain" || mime === "text/x-markdown") return true;
  const title = `${doc.title || ""} ${doc.name || ""}`.toLowerCase();
  return /\.(md|markdown|txt)(\s|$)/.test(title) || title.trim().endsWith(".md");
}

export function documentBody(doc: {
  aiSummary?: string;
  description?: string;
}): string {
  const summary = String(doc.aiSummary || "").trim();
  const description = String(doc.description || "").trim();
  return summary || description;
}

export function splitDocContent(content: string): { description: string; aiSummary: string; size: number } {
  const body = content.trim();
  return {
    description: body.slice(0, MAX_DOC_DESCRIPTION_CHARS),
    aiSummary: body.slice(0, MAX_DOC_BODY_CHARS),
    size: body.length,
  };
}

export function downloadFileName(title: string, ext: DownloadDocumentFormat): string {
  const base = String(title || "document")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/["\r\n]+/g, "")
    .trim() || "document";
  return `${base}.${ext}`;
}

export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function defaultDownloadFormat(doc: Parameters<typeof isMarkdownDocument>[0]): DownloadDocumentFormat {
  const mime = String(doc.mimeType || "").toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || mime === "application/msword") return "docx";
  return "md";
}

export function populatedTitle(doc: Pick<ProjectDocument, "title" | "name">): string {
  return String(doc.title || doc.name || "document");
}
