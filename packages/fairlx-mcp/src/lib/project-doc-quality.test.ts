import { describe, expect, it } from "vitest";

import {
  countMarkdownWords,
  extractHttpUrls,
  MIN_PROJECT_DOC_CHARS,
  projectDocQualityError,
} from "./project-doc-quality";

function researchedDoc(title: string): string {
  const analysis =
    "This analysis covers school operations, parent communication, attendance, grading, timetable conflicts, and staff permissions. Each requirement names the actor, the record that changes, and what happens when data is late or missing. ";
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

describe("projectDocQualityError", () => {
  it("rejects short Fairlx-only outlines", () => {
    const stub = `# Title
*tagline*
> [!NOTE]
> note
## Sources
- fairlx_work_item_list
## Steps
1. Write
## Risks
- none
${"padding ".repeat(200)}`;
    expect(projectDocQualityError(stub)).toMatch(/too short|Research is missing|sections/i);
  });

  it("accepts a long cited study", () => {
    const doc = researchedDoc("School Stacker PRD");
    expect(doc.length).toBeGreaterThan(MIN_PROJECT_DOC_CHARS);
    expect(countMarkdownWords(doc)).toBeGreaterThan(1800);
    expect(extractHttpUrls(doc).length).toBeGreaterThanOrEqual(3);
    expect(projectDocQualityError(doc)).toBeNull();
  });
});
