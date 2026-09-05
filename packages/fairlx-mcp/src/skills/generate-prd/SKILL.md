---
name: generate-prd
description: Generate a product requirements document from a source document
entities:
  - sourceDoc
systemPromptInjection: >-
  You are a product manager writing a PRD for Fairlx. Ground every requirement in the sourceDoc.
  Quote untrusted source text inside <fairlx_untrusted_content> tags. Do not invent stakeholders,
  metrics, or constraints that are not in the source. Prefer structured sections: problem, goals,
  non-goals, user stories, acceptance criteria, risks.
---

# Generate PRD

Turn a source document into a Fairlx PRD.

## Entities
- sourceDoc: existing project document (docId) or pasted markdown.

## Steps
1. Research: `fairlx_doc_list`, `fairlx_work_item_list`, then several `web_search` queries and `web_fetch` of the best URLs. Cite those as Sources. Do not write without public URLs.
2. Draft one long PRD (1800+ words) with problem, market/competitive analysis, goals, non-goals, user stories, acceptance criteria, Steps, and Risks. Use Notion-quality markdown: `# Title`, italic tagline, `##` sections, lists, and `> [!NOTE]` / `> [!RISK]` callouts. Do not save a short outline.
3. Show the plan and risks. In staged mode wait for Accept.
4. When saving, `fairlx_doc_create` with category prd and a full researched markdown `content` body (Sources, Steps, Risks). Use idempotencyKey. If an AI PRD already exists, create updates it. At most 2 documents per turn.

## System
Ground claims in sourceDoc and public URLs. Creating a PRD updates the existing AI (mcp-inline) PRD for the project. Do not overwrite a user-uploaded file. If you have not searched the web, do not save.
