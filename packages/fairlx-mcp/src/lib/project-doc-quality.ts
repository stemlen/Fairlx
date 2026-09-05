export const MIN_PROJECT_DOC_CHARS = 12000;
export const MIN_PROJECT_DOC_WORDS = 1800;
export const MIN_PROJECT_DOC_SECTIONS = 8;
export const MIN_WEB_SOURCE_URLS = 3;

const PLACEHOLDER_HOST = /example\.com|example\.org|localhost|127\.0\.0\.1|invalid|placeholder/i;

export function countMarkdownWords(markdown: string): number {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function countMarkdownSections(markdown: string): number {
  return markdown.split("\n").filter((line) => /^##\s+\S/.test(line.trim())).length;
}

export function extractHttpUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s)\]>'"]+/gi) ?? [];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of found) {
    const cleaned = raw.replace(/[.,;:]+$/, "");
    let host = "";
    try {
      host = new URL(cleaned).hostname;
    } catch {
      continue;
    }
    if (PLACEHOLDER_HOST.test(host)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
  }
  return unique;
}

function sourceStrings(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];
  return sources.map((item) => (typeof item === "string" ? item : String(item ?? "")));
}

export function projectDocQualityError(content: string, sources?: unknown): string | null {
  const body = content.trim();
  if (body.length < MIN_PROJECT_DOC_CHARS || countMarkdownWords(body) < MIN_PROJECT_DOC_WORDS) {
    return `Document is too short for a researched study (${body.length} chars, ${countMarkdownWords(body)} words). Write at least ${MIN_PROJECT_DOC_WORDS} words (~${MIN_PROJECT_DOC_CHARS} characters) with analysis, not a summary. Search the web, fetch sources, then write.`;
  }
  if (countMarkdownSections(body) < MIN_PROJECT_DOC_SECTIONS) {
    return `Document needs at least ${MIN_PROJECT_DOC_SECTIONS} ## sections (problem, users, market/research, analysis, requirements, steps, risks, sources). Thin outlines are rejected.`;
  }
  const urls = extractHttpUrls(`${body}\n${sourceStrings(sources).join("\n")}`);
  if (urls.length < MIN_WEB_SOURCE_URLS) {
    return `Research is missing. Cite at least ${MIN_WEB_SOURCE_URLS} public http(s) URLs you actually searched or fetched (Wikipedia, vendor docs, regulations, competitors). Fairlx tool names alone are not research. Do not save this document.`;
  }
  const hasSources = /\bsources?\b/i.test(body) || sourceStrings(sources).length > 0;
  const hasSteps = /\bsteps?\b/i.test(body) || /\b(procedure|how to|implementation)\b/i.test(body);
  const hasRisk = /\brisks?\b/i.test(body);
  if (!hasSources || !hasSteps || !hasRisk) {
    return "Each document must include Sources (public URLs you looked up), Steps, and Risks.";
  }
  return null;
}
