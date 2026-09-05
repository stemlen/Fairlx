export {
  COMPLETE_DOC_PACK,
  COMPLETE_DOC_PACK_WITH_GITHUB,
  documentationPack,
  documentationPackInstructions,
  isDocPackCategory,
} from "./project-doc-pack";
export type { DocPackItem } from "./project-doc-pack";

export type DocCalloutKind = "note" | "tip" | "warning" | "risk" | "important";

const CALLOUT_ALIASES: Record<string, DocCalloutKind> = {
  note: "note",
  info: "note",
  tip: "tip",
  hint: "tip",
  warning: "warning",
  caution: "warning",
  important: "important",
  risk: "risk",
  danger: "risk",
};

export const PROJECT_DOC_MARKDOWN_GUIDE = [
  "Every project document must be a Notion-quality researched study, not a wall of text and not a short outline.",
  "Required skeleton: `# Title`, then a one-line italic tagline (*like this*), then a `> [!NOTE]` summary, then at least eight `##` / `###` sections.",
  "Put a blank line before every heading, callout, and list. Use `-` and numbered lists, tables when comparing, **bold** for UI labels, and ==highlight== for key terms.",
  "Use `> [!TIP]` and `> [!RISK]` callouts. Always include Sources, Steps, and Risks — Sources must be public http URLs you fetched.",
  "Minimum bar: about 1800 words, 8 sections, and 3 cited public URLs. If you have not searched the web, do not save.",
].join(" ");

export const NOTION_DOC_STRUCTURE_ERROR =
  "Use Notion-quality markdown: # Title, an italic tagline, ## sections, lists, and a > [!NOTE] (or TIP/RISK) callout. Include Sources, Steps, and Risks. Do not save a wall of unformatted text.";

const isFence = (line: string) => /^```/.test(line.trim());
const isHeading = (line: string) => /^#{1,6}\s/.test(line);
const isList = (line: string) => /^(?:[-*+]|\d+\.)\s/.test(line);
const isQuote = (line: string) => /^>\s?/.test(line);

export function normalizeMarkdownSpacing(markdown: string): string {
  let text = markdown.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/^>\s*\[!(\w+)\][ \t]+(\S.*)$/gm, "> [!$1]\n> $2");

  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const wasInFence = inFence;
    if (isFence(line)) inFence = !inFence;

    if (!wasInFence && out.length > 0) {
      const prev = out[out.length - 1]!;
      const prevTrim = prev.trim();
      const needBlankBefore =
        (isHeading(line) && prevTrim !== "") ||
        (isFence(line) && prevTrim !== "") ||
        (isQuote(line) && prevTrim !== "" && !isQuote(prev)) ||
        (isList(line) && prevTrim !== "" && !isList(prev) && !isQuote(prev));
      if (needBlankBefore && prev !== "") out.push("");
      if (isHeading(prev) && line.trim() !== "" && prev !== "") {
        if (out[out.length - 1] !== "") out.push("");
      }
    }

    out.push(line);
  }

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function parseCalloutKind(text: string): { kind: DocCalloutKind; rest: string } | null {
  const match = text
    .trim()
    .match(/^\[!(NOTE|TIP|HINT|INFO|WARNING|CAUTION|IMPORTANT|RISK|DANGER)\]\s*([\s\S]*)$/i);
  if (!match) return null;
  const kind = CALLOUT_ALIASES[match[1]!.toLowerCase()] ?? "note";
  return { kind, rest: match[2]!.trim() };
}

function hasItalicTagline(markdown: string): boolean {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const titleIdx = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (titleIdx < 0) return false;
  let seen = 0;
  for (let i = titleIdx + 1; i < lines.length && seen < 6; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) break;
    seen += 1;
    if (/^\*(?!\*)[^*\n]+\*$/.test(line) || /^_(?!_)[^_\n]+_$/.test(line)) return true;
  }
  return false;
}

export function hasNotionDocStructure(markdown: string): boolean {
  const body = markdown.replace(/\r\n/g, "\n");
  const hasTitle = /^#\s+\S/m.test(body);
  const hasSection = /^##\s+\S/m.test(body);
  const hasList = /^(?:[-*+]|\d+\.)\s+\S/m.test(body);
  const hasCallout = /^>\s*\[!\w+\]/m.test(body);
  return hasTitle && hasSection && hasList && hasCallout && hasItalicTagline(body);
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s*\[!\w+\]\s*/i, "")
    .replace(/^>\s?/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
