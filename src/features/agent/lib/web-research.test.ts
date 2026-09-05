import { describe, expect, it } from "vitest";

import {
  fetchPublicPage,
  htmlToVisibleText,
  isBlockedResearchUrl,
  PAGE_TEXT_MAX,
  parseDuckDuckGoHtml,
  searchPublicWeb,
} from "./web-research";

describe("isBlockedResearchUrl", () => {
  it("blocks private hosts and allows public https", () => {
    expect(isBlockedResearchUrl("http://127.0.0.1/secret")).toMatch(/not a public|Private/);
    expect(isBlockedResearchUrl("https://169.254.169.254/latest")).toMatch(/Private|not a public/);
    expect(isBlockedResearchUrl("file:///etc/passwd")).toMatch(/http/);
    expect(isBlockedResearchUrl("https://en.wikipedia.org/wiki/School")).toBeNull();
  });
});

describe("parseDuckDuckGoHtml", () => {
  it("unwraps uddg result links", () => {
    const html = `
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FSIS">Student information system</a>
      <a class="result__a" href="https://html.duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.ed.gov%2Fferpa">FERPA</a>
    `;
    const hits = parseDuckDuckGoHtml(html);
    expect(hits.map((hit) => hit.url)).toEqual([
      "https://en.wikipedia.org/wiki/SIS",
      "https://www.ed.gov/ferpa",
    ]);
  });
});

describe("htmlToVisibleText", () => {
  it("strips scripts and keeps visible copy", () => {
    expect(htmlToVisibleText("<html><script>alert(1)</script><p>Hello world</p></html>")).toBe("Hello world");
  });

  it("caps page text so Wikipedia fetches cannot fill a 72k window", () => {
    const html = `<html><p>${"word ".repeat(8_000)}</p></html>`;
    expect(htmlToVisibleText(html).length).toBe(PAGE_TEXT_MAX);
    expect(PAGE_TEXT_MAX).toBeLessThanOrEqual(3_500);
  });
});

describe("searchPublicWeb", () => {
  it("merges Wikipedia extracts with DuckDuckGo hits", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("wikipedia.org")) {
        return new Response(
          JSON.stringify({
            query: {
              pages: {
                "1": {
                  title: "Student information system",
                  extract: "A SIS manages student data.",
                  fullurl: "https://en.wikipedia.org/wiki/Student_information_system",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        `<a class="result__a" href="/l/?uddg=https%3A%2F%2Fwww.ed.gov%2Fferpa">FERPA</a>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    };
    const result = await searchPublicWeb("school SIS", fetchImpl);
    expect(result.extracts[0]?.title).toMatch(/Student information system/);
    expect(result.hits.some((hit) => hit.url.includes("ed.gov"))).toBe(true);
  });
});

describe("fetchPublicPage", () => {
  it("refuses localhost", async () => {
    const result = await fetchPublicPage("http://localhost:3000/admin");
    expect(result).toMatchObject({ error: expect.stringMatching(/public|Private|localhost/i) });
  });
});
