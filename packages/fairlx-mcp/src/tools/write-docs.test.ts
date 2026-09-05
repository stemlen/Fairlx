import { describe, expect, it } from "vitest";

import { jwtToAuthContext } from "../auth/context";
import { PERMISSIONS, type McpRuntime } from "../runtime/types";
import { callTool } from "./index";

function docsRuntime() {
  const docs: Record<string, unknown>[] = [];
  const runtime = {
    collections: {
      projectDocs: "project_docs",
      projects: "projects",
    },
    store: {
      list: async () => ({ documents: docs, total: docs.length }),
      get: async (collection: string, id: string) => {
        if (collection === "projects" && id === "proj_1") {
          return { $id: "proj_1", workspaceId: "ws_1", name: "School Stacker" };
        }
        const doc = docs.find((item) => item.$id === id);
        if (!doc) throw new Error("missing");
        return doc;
      },
      create: async (_collection: string, data: Record<string, unknown>) => {
        const doc = { $id: `doc_${docs.length + 1}`, ...data };
        docs.push(doc);
        return doc;
      },
      update: async (_collection: string, id: string, data: Record<string, unknown>) => {
        const doc = docs.find((item) => item.$id === id);
        if (!doc) throw new Error("missing");
        Object.assign(doc, data);
        return doc;
      },
    },
    lookupUsers: async () => [],
    resolveUserProjectAccess: async () => ({
      hasAccess: true,
      isOwner: true,
      isAdmin: true,
      permissions: [PERMISSIONS.CREATE_DOCS, PERMISSIONS.EDIT_DOCS, PERMISSIONS.VIEW_DOCS],
      role: "ADMIN",
    }),
    hasProjectPermission: () => true,
  } as unknown as McpRuntime;
  return { runtime, docs };
}

const auth = jwtToAuthContext("admin_1", {
  workspaceId: "ws_1",
  projectId: "proj_1",
  scopes: ["docs:write", "docs:read"],
});

const analysis =
  "This analysis covers school operations, parent communication, attendance, grading, timetable conflicts, and staff permissions. Each requirement names the actor, the record that changes, and what happens when data is late or missing. ";

function researchedBody(title: string): string {
  const sections = [
    "Problem",
    "Users and jobs to be done",
    "Market and landscape",
    "Competitive analysis",
    "Goals and non-goals",
    "Requirements",
    "Steps",
    "Risks",
    "Sources",
  ];
  const body = sections
    .map((heading) => {
      if (heading === "Sources") {
        return `## Sources
- [Student information system](https://en.wikipedia.org/wiki/Student_information_system)
- [Learning management system](https://en.wikipedia.org/wiki/Learning_management_system)
- [FERPA](https://www.ed.gov/laws-and-policy/ferpa)
`;
      }
      if (heading === "Steps") {
        return `## Steps
1. Ground claims in public sources and current work items.
2. Separate must-have workflows from later polish.
3. Call out privacy, offline, and accessibility risks before writing stories.
${analysis.repeat(6)}`;
      }
      if (heading === "Risks") {
        return `## Risks
- Treating a summary as a specification hides missing workflows.
- Copying a competitor without citing sources produces unusable requirements.
${analysis.repeat(6)}`;
      }
      return `## ${heading}\n\n${analysis.repeat(8)}`;
    })
    .join("\n\n");
  return `# ${title}

*A researched product study, not a placeholder outline.*

> [!NOTE]
> Grounded in public sources and project work items.

${body}
`;
}

const body = researchedBody("Authentication");

describe("fairlx_doc_create", () => {
  it("rejects short stub documents", async () => {
    const { runtime } = docsRuntime();
    await expect(
      callTool("fairlx_doc_create", { projectId: "proj_1", title: "Auth", content: "TODO" }, runtime, auth),
    ).rejects.toThrow(/too short/i);
  });

  it("rejects long Fairlx-only outlines that are not researched", async () => {
    const { runtime } = docsRuntime();
    const padded = `# Auth

*tagline here for structure*

> [!NOTE]
> Not researched.

## Problem
${"padding word ".repeat(400)}
## Users
${"padding word ".repeat(400)}
## Market
${"padding word ".repeat(400)}
## Analysis
${"padding word ".repeat(400)}
## Goals
${"padding word ".repeat(400)}
## Requirements
${"padding word ".repeat(400)}
## Steps
1. Write something.
${"padding word ".repeat(200)}
## Risks
- Guessing.
${"padding word ".repeat(200)}
## Sources
- fairlx_work_item_list
`;
    await expect(
      callTool("fairlx_doc_create", { projectId: "proj_1", title: "Auth", content: padded }, runtime, auth),
    ).rejects.toThrow(/Research is missing/i);
  });

  it("stores the full markdown body for preview and download", async () => {
    const { runtime, docs } = docsRuntime();
    const result = await callTool(
      "fairlx_doc_create",
      { projectId: "proj_1", title: "Authentication", content: body, category: "architecture" },
      runtime,
      auth,
    );
    expect(docs).toHaveLength(1);
    expect(String(docs[0]?.aiSummary)).toContain("## Risks");
    expect(String(docs[0]?.aiSummary)).toContain("*A researched product study");
    expect(String(docs[0]?.aiSummary)).toContain("> [!NOTE]");
    expect(String(docs[0]?.aiSummary)).toMatch(/# Authentication\n\n\*/);
    expect(String(docs[0]?.fileId)).toBe("mcp-inline");
    expect(result.content[0]?.type).toBe("text");
  });

  it("updates an existing AI document in the same pack category instead of duplicating it", async () => {
    const { runtime, docs } = docsRuntime();
    await callTool(
      "fairlx_doc_create",
      { projectId: "proj_1", title: "Authentication", content: body, category: "architecture" },
      runtime,
      auth,
    );
    const result = await callTool(
      "fairlx_doc_create",
      {
        projectId: "proj_1",
        title: "Architecture",
        content: researchedBody("Architecture"),
        category: "architecture",
      },
      runtime,
      auth,
    );
    expect(docs).toHaveLength(1);
    expect(String(docs[0]?.title)).toBe("Architecture");
    expect(String(result.content[0]?.text ?? "")).toMatch(/"updated": true/);
  });

  it("rejects long walls of text that are not Notion-quality markdown", async () => {
    const { runtime } = docsRuntime();
    const wall = `# Auth
Sources and Steps and Risks.
https://en.wikipedia.org/wiki/A
https://en.wikipedia.org/wiki/B
https://en.wikipedia.org/wiki/C
## Problem
## Users
## Market
## Analysis
## Goals
## Requirements
## Steps
## Risks
## Sources
${"Unformatted research dump without a tagline or callout. ".repeat(400)}`;
    await expect(
      callTool("fairlx_doc_create", { projectId: "proj_1", title: "Auth", content: wall }, runtime, auth),
    ).rejects.toThrow(/Notion-quality markdown/i);
  });
});
