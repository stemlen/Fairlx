export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
  source: "wikipedia" | "duckduckgo";
};

export type WebSearchResult = {
  query: string;
  hits: WebSearchHit[];
  extracts: Array<{ title: string; url: string; extract: string }>;
};

export type FetchedPage = {
  url: string;
  title: string;
  text: string;
};

const RESEARCH_UA = "FairlxResearch/1.0 (project documentation; +https://fairlx.app)";
const FETCH_TIMEOUT_MS = 12_000;
const SEARCH_TIMEOUT_MS = 10_000;
export const PAGE_TEXT_MAX = 3_500;
export const WIKIPEDIA_EXTRACT_MAX = 1_200;

export function isBlockedResearchUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "URL is invalid.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http and https URLs can be fetched.";
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return "That host is not a public research source.";
  }
  if (host.includes(":") && (host.startsWith("fd") || host.startsWith("fc") || host.startsWith("fe80:"))) {
    return "Private or link-local addresses cannot be fetched.";
  }
  if (
    /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host) ||
    host === "metadata"
  ) {
    return "Private or link-local addresses cannot be fetched.";
  }
  return null;
}

export function htmlToVisibleText(html: string): string {
  const without = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const title = without.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const text = `${title} ${without.replace(/<[^>]+>/g, " ")}`
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, PAGE_TEXT_MAX);
}

export function parseDuckDuckGoHtml(html: string): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) && hits.length < 8) {
    const href = decodeDuckDuckGoHref(match[1] ?? "");
    const title = htmlToVisibleText(match[2] ?? "");
    if (!href || !title || seen.has(href) || isBlockedResearchUrl(href)) continue;
    seen.add(href);
    hits.push({ title, url: href, snippet: "", source: "duckduckgo" });
  }
  return hits;
}

function decodeDuckDuckGoHref(href: string): string {
  try {
    const parsed = new URL(href, "https://html.duckduckgo.com/");
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch {
    return "";
  }
  return "";
}

type FetchLike = typeof fetch;

async function fetchText(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  const blocked = isBlockedResearchUrl(url);
  if (blocked) return { ok: false, status: 0, text: blocked, finalUrl: url };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop < 4; hop += 1) {
      const hopBlock = isBlockedResearchUrl(current);
      if (hopBlock) return { ok: false, status: 0, text: hopBlock, finalUrl: current };
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "text/html,application/json,text/plain;q=0.9", "User-Agent": RESEARCH_UA },
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { ok: false, status: response.status, text: "", finalUrl: current };
        current = new URL(location, current).href;
        continue;
      }
      const text = await response.text();
      return { ok: response.ok, status: response.status, text, finalUrl: current };
    }
    return { ok: false, status: 0, text: "Too many redirects.", finalUrl: current };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: error instanceof Error ? error.message : "Fetch failed",
      finalUrl: url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function wikipediaHits(json: unknown): { hits: WebSearchHit[]; extracts: WebSearchResult["extracts"] } {
  const pages =
    json && typeof json === "object" && "query" in json
      ? ((json as { query?: { pages?: Record<string, { title?: string; extract?: string; fullurl?: string; canonicalurl?: string }> } })
          .query?.pages ?? {})
      : {};
  const extracts: WebSearchResult["extracts"] = [];
  const hits: WebSearchHit[] = [];
  for (const page of Object.values(pages)) {
    const title = String(page.title ?? "").trim();
    const url = String(page.fullurl || page.canonicalurl || "").trim();
    const extract = String(page.extract ?? "").trim();
    if (!title || !url) continue;
    hits.push({ title, url, snippet: extract.slice(0, 280), source: "wikipedia" });
    if (extract) extracts.push({ title, url, extract: extract.slice(0, WIKIPEDIA_EXTRACT_MAX) });
  }
  return { hits, extracts };
}

export async function searchPublicWeb(
  query: string,
  fetchImpl: FetchLike = fetch,
): Promise<WebSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { query: "", hits: [], extracts: [] };

  const wikiUrl =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=5&prop=extracts|info&exintro=1&explaintext=1&inprop=url&gsrsearch=" +
    encodeURIComponent(trimmed);
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;

  const [wiki, ddg] = await Promise.all([
    fetchText(wikiUrl, fetchImpl, SEARCH_TIMEOUT_MS),
    fetchText(ddgUrl, fetchImpl, SEARCH_TIMEOUT_MS),
  ]);

  let wikiParsed: { hits: WebSearchHit[]; extracts: WebSearchResult["extracts"] } = { hits: [], extracts: [] };
  if (wiki.ok && wiki.text) {
    try {
      wikiParsed = wikipediaHits(JSON.parse(wiki.text) as unknown);
    } catch {
      wikiParsed = { hits: [], extracts: [] };
    }
  }

  const ddgHits = ddg.ok ? parseDuckDuckGoHtml(ddg.text) : [];
  const seen = new Set(wikiParsed.hits.map((hit) => hit.url));
  const hits = [...wikiParsed.hits];
  for (const hit of ddgHits) {
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);
    hits.push(hit);
  }

  return { query: trimmed, hits: hits.slice(0, 12), extracts: wikiParsed.extracts };
}

export async function fetchPublicPage(url: string, fetchImpl: FetchLike = fetch): Promise<FetchedPage | { error: string }> {
  const blocked = isBlockedResearchUrl(url);
  if (blocked) return { error: blocked };
  const result = await fetchText(url, fetchImpl, FETCH_TIMEOUT_MS);
  if (!result.ok) {
    return { error: result.text || `Fetch failed (${result.status})` };
  }
  const title = result.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    url: result.finalUrl,
    title: htmlToVisibleText(title ?? result.finalUrl).slice(0, 180),
    text: htmlToVisibleText(result.text),
  };
}
