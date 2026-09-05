# Changelog

This file is generated on every `git commit` and `git push`. Do not edit it by hand.

Older session notes live in [docs/changelog-history.md](docs/changelog-history.md).

## Unreleased

Files in this commit:

- `.env.example`
- `next.config.mjs`
- `packages/fairlx-mcp/package.json`
- `packages/fairlx-mcp/src/auth/scopes.ts`
- `packages/fairlx-mcp/src/catalog.test.ts`
- `packages/fairlx-mcp/src/lib/project-doc-markdown.test.ts`
- `packages/fairlx-mcp/src/lib/project-doc-markdown.ts`
- `packages/fairlx-mcp/src/lib/project-doc-pack.test.ts`
- `packages/fairlx-mcp/src/lib/project-doc-pack.ts`
- `packages/fairlx-mcp/src/lib/project-doc-quality.test.ts`
- `packages/fairlx-mcp/src/lib/project-doc-quality.ts`
- `packages/fairlx-mcp/src/runtime/types.ts`
- `packages/fairlx-mcp/src/skills/generate-prd/SKILL.md`
- `packages/fairlx-mcp/src/skills/registry.ts`
- `packages/fairlx-mcp/src/tools/billing.test.ts`
- `packages/fairlx-mcp/src/tools/billing.ts`
- `packages/fairlx-mcp/src/tools/catalog.ts`
- `packages/fairlx-mcp/src/tools/index.ts`
- `packages/fairlx-mcp/src/tools/organization.test.ts`
- `packages/fairlx-mcp/src/tools/organization.ts`
- `packages/fairlx-mcp/src/tools/read.ts`
- `packages/fairlx-mcp/src/tools/write-docs.test.ts`
- `packages/fairlx-mcp/src/tools/write-work-item.test.ts`
- `packages/fairlx-mcp/src/tools/write.ts`
- `scripts/database-initialization/collections/ai-model-pricing.ts`
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/workspaces/[workspaceId]/projects/[projectId]/docs/client.tsx`
- `src/app/error.tsx`
- `src/app/layout.tsx`
- `src/components/account-lifecycle-provider.tsx`
- `src/components/chunk-load-recovery.tsx`
- `src/components/navbar.tsx`
- `src/features/agent/api/use-agent-runs.poll.test.ts`
- `src/features/agent/api/use-agent-runs.ts`
- `src/features/agent/components/agent-app-shell.tsx`
- `src/features/agent/components/agent-chat-thread.tsx`
- `src/features/agent/components/agent-run-hud.tsx`
- `src/features/agent/components/agent-scope-bar.tsx`
- `src/features/agent/components/manage-models-dialog.tsx`
- `src/features/agent/components/workflow-view.tsx`
- `src/features/agent/constants.ts`
- `src/features/agent/lib/agent-core.test.ts`
- `src/features/agent/lib/ai-usage-billing.ts`
- `src/features/agent/lib/brain/brain.test.ts`
- `src/features/agent/lib/brain/compress.ts`
- `src/features/agent/lib/brain/definitions.ts`
- `src/features/agent/lib/brain/index.ts`
- `src/features/agent/lib/brain/isolate.ts`
- `src/features/agent/lib/brain/select.ts`
- `src/features/agent/lib/complete-text.ts`
- `src/features/agent/lib/defaults.ts`
- `src/features/agent/lib/doc-turn-limits.test.ts`
- `src/features/agent/lib/doc-turn-limits.ts`
- `src/features/agent/lib/github-scope.test.ts`
- `src/features/agent/lib/github-scope.ts`
- `src/features/agent/lib/harness.ts`
- `src/features/agent/lib/intent-compiler.test.ts`
- `src/features/agent/lib/intent-compiler.ts`
- `src/features/agent/lib/openai-responses.test.ts`
- `src/features/agent/lib/openai-responses.ts`
- `src/features/agent/lib/parallel-work.test.ts`
- `src/features/agent/lib/parallel-work.ts`
- `src/features/agent/lib/parse-tool-calls.test.ts`
- `src/features/agent/lib/parse-tool-calls.ts`
- `src/features/agent/lib/platform-credentials.test.ts`
- `src/features/agent/lib/platform-credentials.ts`
- `src/features/agent/lib/prompt.ts`
- `src/features/agent/lib/run-usage.test.ts`
- `src/features/agent/lib/run-usage.ts`
- `src/features/agent/lib/runtime.ts`
- `src/features/agent/lib/tool-loop.test.ts`
- `src/features/agent/lib/tool-loop.ts`
- `src/features/agent/lib/tools-scope.test.ts`
- `src/features/agent/lib/tools.ts`
- `src/features/agent/lib/transcript.ts`
- `src/features/agent/lib/truncate.test.ts`
- `src/features/agent/lib/truncate.ts`
- `src/features/agent/lib/turn-errors.test.ts`
- `src/features/agent/lib/turn-errors.ts`
- `src/features/agent/lib/web-research.test.ts`
- `src/features/agent/lib/web-research.ts`
- `src/features/agent/lib/write-guard.test.ts`
- `src/features/agent/lib/write-guard.ts`
- `src/features/agent/plugins/catalog.test.ts`
- `src/features/agent/plugins/github-helpers.ts`
- `src/features/agent/plugins/github.ts`
- `src/features/agent/types.ts`
- `src/features/billing/api/use-get-billing-account.ts`
- `src/features/billing/components/index.ts`
- `src/features/billing/components/wallet-billing-alerts.tsx`
- `src/features/billing/server/cron.ts`
- `src/features/billing/types.ts`
- `src/features/github-integration/api/use-github.ts`
- `src/features/github-integration/components/connect-repository.tsx`
- `src/features/github-integration/components/documentation-view.tsx`
- `src/features/github-integration/components/github-optional-prompt.tsx`
- `src/features/github-integration/components/index.ts`
- `src/features/github-integration/lib/gemini-api.ts`
- `src/features/github-integration/server/documentation-route.ts`
- `src/features/mcp/appwrite-store.ts`
- `src/features/mcp/bind-runtime.ts`
- `src/features/organizations/audit.ts`
- `src/features/organizations/components/organization-audit-logs.tsx`
- `src/features/project-docs/api/use-project-docs.ts`
- `src/features/project-docs/components/document-card.tsx`
- `src/features/project-docs/components/document-download-menu.tsx`
- `src/features/project-docs/components/document-list.tsx`
- `src/features/project-docs/components/document-markdown.tsx`
- `src/features/project-docs/components/document-preview-modal.tsx`
- `src/features/project-docs/lib/document-export.ts`
- `src/features/project-docs/lib/document-file.test.ts`
- `src/features/project-docs/lib/document-file.ts`
- `src/features/project-docs/lib/format-markdown.test.ts`
- `src/features/project-docs/lib/format-markdown.ts`
- `src/features/project-docs/schemas.ts`
- `src/features/project-docs/server/ai-route.ts`
- `src/features/project-docs/server/route.ts`
- `src/features/project-docs/types.ts`
- `src/features/usage/components/usage-charts.tsx`
- `src/features/usage/components/usage-events-table.tsx`
- `src/features/usage/components/usage-kpi-cards.tsx`
- `src/features/usage/types.ts`
- `src/features/wallet/api/use-wallet-billing-alert.ts`
- `src/features/wallet/services/__tests__/wallet-service.test.ts`
- `src/features/wallet/services/wallet-service.ts`
- `src/features/wallet/types.ts`
- `src/lib/ai-billing.test.ts`
- `src/lib/ai-billing.ts`
- `src/lib/ai-model-pricing.ts`
- `src/lib/ai-pricing-sync-job.ts`
- `src/lib/ai-service.ts`
- `src/lib/usage-ledger.ts`
- `src/lib/usage-metering.ts`
- `tsconfig.json`
- `vitest.config.ts`

## Recent commits

| Date | Commit | Message | Author |
|------|--------|---------|--------|
| 2026-09-05 | `2108acc` | chore: bump version to 0.2.100 [skip ci] | github-actions[bot] |
| 2026-09-05 | `6259f4f` | Merge pull request #303 from ANCIENTINSANE/contrib/ancientinsane-agent-org-sync | Surendra Codes |
| 2026-09-05 | `76b6b22` | checkpoint before checking out main | ANCIENTINSANE |
| 2026-09-05 | `6f733c8` | chore: bump version to 0.2.99 [skip ci] | github-actions[bot] |
| 2026-09-05 | `77834c5` | Merge pull request #302 from ANCIENTINSANE/contrib/ancientinsane-agent-org-sync | Surendra Codes |
| 2026-09-05 | `4d69739` | Merge stemlen/main into contrib branch for cross-repo contribution | ANCIENTINSANE |
| 2026-09-05 | `e0a995a` | Ship leftover org invite, agent board, and docs-hook work. | ANCIENTINSANE |
| 2026-09-05 | `7a39a96` | Raise agent model timeouts and pass attached specs to subject sub-agents. | ANCIENTINSANE |
| 2026-09-04 | `f5a80e2` | chore: bump version to 0.2.98 [skip ci] | github-actions[bot] |
| 2026-09-04 | `fe8e336` | Merge pull request #300 from Happyesss/main | Shashank Kumar Rathour |
| 2026-09-04 | `13c0f8e` | feat: add Fairlx Agent harness with plugins, GitHub PRs, and isolated jobs | ANCIENTINSANE |
| 2026-09-04 | `5374c1c` | chore: bump version to 0.2.97 [skip ci] | github-actions[bot] |
| 2026-09-04 | `dd9c18e` | feat: enhance pending confirmation handling and improve write tool call detection | Happyesss |
| 2026-09-04 | `a49f12d` | chore: bump version to 0.2.96 [skip ci] | github-actions[bot] |
| 2026-09-04 | `94a5580` | Merge pull request #299 from Happyesss/main | Shashank Kumar Rathour |
| 2026-09-04 | `715640b` | chore: bump version to 0.2.95 [skip ci] | github-actions[bot] |
| 2026-09-04 | `05a058b` | Merge branch 'main' into main | Shashank Kumar Rathour |
| 2026-09-04 | `cfd443d` | chore: bump version to 0.2.94 [skip ci] | github-actions[bot] |
| 2026-09-04 | `40b9db9` | refactor: optimize message and event retrieval using useMemo for performance | Happyesss |
| 2026-09-04 | `e805894` | chore: bump version to 0.2.93 [skip ci] | github-actions[bot] |
| 2026-09-04 | `7901b84` | feat: add AgentFloatingChat component for interactive agent communication | Happyesss |
| 2026-09-03 | `3426bbe` | chore: bump version to 0.2.93 [skip ci] | github-actions[bot] |
| 2026-09-04 | `5c99783` | Merge pull request #298 from Happyesss/main | Shashank Kumar Rathour |
| 2026-09-03 | `5c24ef5` | chore: bump version to 0.2.92 [skip ci] | github-actions[bot] |
| 2026-09-04 | `16f1b6d` | feat: implement personalized agent training workflows, task prioritization, and project team management tools. | Happyesss |
| 2026-09-03 | `ab595ff` | chore: bump version to 0.2.91 [skip ci] | github-actions[bot] |
| 2026-09-03 | `b8eb6dd` | refactor: standardize priority UI logic and introduce modular project-based quick actions for agent commands | Happyesss |
| 2026-09-02 | `7cf95d2` | chore: bump version to 0.2.90 [skip ci] | github-actions[bot] |
| 2026-09-03 | `6661845` | feat: introduce personal agent functionality with new tools, update environment configurations, and enhance agent run management | Happyesss |
| 2026-09-01 | `9f29adb` | chore: bump version to 0.2.89 [skip ci] | github-actions[bot] |
| 2026-09-02 | `3481abe` | Merge pull request #297 from Happyesss/main | Shashank Kumar Rathour |
| 2026-09-01 | `b14b78f` | chore: bump version to 0.2.88 [skip ci] | github-actions[bot] |
| 2026-09-02 | `36d43ba` | refactor: add runtime-scoped run management to AgentScopeBar and conditionally toggle Grok availability based on environment configuration | Happyesss |
| 2026-09-01 | `531c9d9` | chore: bump version to 0.2.87 [skip ci] | github-actions[bot] |
| 2026-09-02 | `2ba8883` | Merge pull request #296 from Happyesss/main | Shashank Kumar Rathour |
| 2026-09-01 | `b37fa04` | chore: bump version to 0.2.86 [skip ci] | github-actions[bot] |
| 2026-09-02 | `e791b19` | feat: add workspace member removal, implement intent compiler for work item queries, and introduce agent-side member/work-item table components. | Happyesss |
| 2026-09-01 | `9f76456` | chore: bump version to 0.2.85 [skip ci] | github-actions[bot] |
| 2026-09-01 | `a3a5d2e` | feat: add Grok 4.6 support, introduce run deletion confirmation, and refine MCP work item pagination and polling logic. | Happyesss |
| 2026-09-01 | `589cab6` | chore: bump version to 0.2.84 [skip ci] | github-actions[bot] |
| 2026-09-01 | `05ee50e` | feat: add collapsible navigation sections to agent app shell and remove unused model picker and mode switcher | Happyesss |
| 2026-09-01 | `950b4f7` | chore: bump version to 0.2.83 [skip ci] | github-actions[bot] |
| 2026-09-01 | `ebccefa` | Merge pull request #295 from Happyesss/main | Shashank Kumar Rathour |
| 2026-09-01 | `41cd28d` | chore: bump version to 0.2.82 [skip ci] | github-actions[bot] |
| 2026-09-01 | `af9d275` | refactor: implement adaptive message truncation logic with priority for assistant content and add comprehensive test suite for tool loops and state management | Happyesss |
| 2026-08-31 | `bce5065` | chore: bump version to 0.2.81 [skip ci] | github-actions[bot] |
| 2026-09-01 | `c10f872` | Merge pull request #294 from Happyesss/main | Shashank Kumar Rathour |
| 2026-08-31 | `c2d53c1` | chore: bump version to 0.2.80 [skip ci] | github-actions[bot] |
| 2026-09-01 | `c3c8fda` | feat: add workspace member management and user profile lookup to MCP runtime | Happyesss |
| 2026-08-31 | `9b686e2` | chore: bump version to 0.2.79 [skip ci] | github-actions[bot] |
| 2026-09-01 | `fd92b85` | feat: add project selection to workflow view and exclude internal servers from external MCP counts | Happyesss |
| 2026-08-31 | `ae4218a` | chore: bump version to 0.2.78 [skip ci] | github-actions[bot] |
| 2026-09-01 | `8a1701e` | refactor: update agent dashboard UI components to use standardized design system tokens and typography | Happyesss |
| 2026-08-31 | `a91edfc` | chore: bump version to 0.2.77 [skip ci] | github-actions[bot] |
| 2026-09-01 | `41bee0b` | Merge pull request #293 from Happyesss/main | Shashank Kumar Rathour |
| 2026-08-31 | `9121a98` | chore: bump version to 0.2.76 [skip ci] | github-actions[bot] |
| 2026-09-01 | `263ce1f` | refactor: improve performance with useMemo hooks, strengthen agent runtime type safety, and update deployment environment variables. | Happyesss |
| 2026-08-31 | `b359c75` | chore: bump version to 0.2.75 [skip ci] | github-actions[bot] |
| 2026-08-31 | `bdab4c8` | Merge pull request #292 from ANCIENTINSANE/main | Shashank Kumar Rathour |
| 2026-08-31 | `fd1ef9c` | Changes — harness staging (paths, status, branch) | ANCIENTINSANE |
| 2026-08-31 | `a095820` | feat: expand agent harness with specialists, MCP, and chat ops | ANCIENTINSANE |
| 2026-08-31 | `a83ccf3` | fix: keep agent workflow live while model turns run in the background | ANCIENTINSANE |
| 2026-08-31 | `c54459b` | chore: bump version to 0.2.74 [skip ci] | github-actions[bot] |
| 2026-08-31 | `45ab287` | Merge pull request #291 from ANCIENTINSANE/main | Shashank Kumar Rathour |
| 2026-08-31 | `8050192` | feat: replace static agent dashboard with live harness screens and run loop | ANCIENTINSANE |
| 2026-08-31 | `bc96244` | fix: add targeted setup for agent MCP and AI Appwrite collections | ANCIENTINSANE |
| 2026-08-31 | `527582e` | feat: seed Azure Grok 4.6 and DeepSeek V4 Flash as agent platform models | ANCIENTINSANE |
| 2026-08-30 | `6cbc2cb` | feat: add agent MCP servers and AI model configuration | ANCIENTINSANE |
| 2026-08-30 | `5ef28b8` | chore: bump version to 0.2.73 [skip ci] | github-actions[bot] |
| 2026-08-30 | `a44a939` | Merge pull request #290 from ANCIENTINSANE/main | Shashank Kumar Rathour |
| 2026-08-30 | `3fd5675` | Merge branch 'stemlen:main' into main | Surendra Codes |
| 2026-08-30 | `2709267` | chore: bump version to 0.2.72 [skip ci] | github-actions[bot] |
| 2026-08-30 | `2d5db2e` | Merge pull request #289 from Happyesss/main | Shashank Kumar Rathour |
| 2026-08-30 | `15a2169` | chore: bump version to 0.2.71 [skip ci] | github-actions[bot] |
| 2026-08-30 | `e490237` | feat: add support for subtask, saved view, and webhook management tools to MCP registry | Happyesss |
| 2026-08-30 | `904542e` | Merge branch 'stemlen:main' into main | Shashank Kumar Rathour |
| 2026-08-29 | `a9b20be` | chore: bump version to 0.2.71 [skip ci] | github-actions[bot] |
| 2026-08-30 | `95d3471` | Merge pull request #288 from Happyesss/main | Shashank Kumar Rathour |
| 2026-08-29 | `f9946da` | chore: bump version to 0.2.70 [skip ci] | github-actions[bot] |
| 2026-08-30 | `f26a57b` | feat: implement Model Context Protocol (MCP) server package and workspace integration panel | Happyesss |
| 2026-08-28 | `5cc9f57` | fix: align org usage costs to USD billing with local display currency | ANCIENTINSANE |
| 2026-08-28 | `1fa59fc` | chore: bump version to 0.2.69 [skip ci] | github-actions[bot] |
| 2026-08-28 | `16d13e5` | Merge pull request #287 from ANCIENTINSANE/main | Shashank Kumar Rathour |
| 2026-08-28 | `3a527cd` | Merge branch 'stemlen:main' into main | Surendra Codes |
| 2026-08-28 | `34fb666` | fix: load organization audit logs on /organization | ANCIENTINSANE |
| 2026-08-28 | `7ca56a1` | chore: bump version to 0.2.68 [skip ci] | github-actions[bot] |
| 2026-08-28 | `7881912` | Merge pull request #286 from Happyesss/main | Shashank Kumar Rathour |
| 2026-08-28 | `cf0bec8` | chore: bump version to 0.2.67 [skip ci] | github-actions[bot] |
| 2026-08-28 | `e535814` | refactor: remove codebase QA feature and associated GitHub integration modules | Happyesss |
| 2026-08-28 | `28a345f` | fix: resolve Invoices View All 404 for organization billing | ANCIENTINSANE |
| 2026-08-28 | `cded1dd` | chore: bump version to 0.2.66 [skip ci] | github-actions[bot] |
| 2026-08-28 | `47f5602` | Merge pull request #285 from ANCIENTINSANE/main | Shashank Kumar Rathour |
| 2026-08-28 | `975cf12` | fix: implement Timeline PNG and PDF export via canvas Gantt renderer | ANCIENTINSANE |
| 2026-08-28 | `942694e` | fix: accept Appwrite Document in department permission parser | ANCIENTINSANE |
| 2026-08-28 | `64d9c95` | fix: align department member/permission writes with live Appwrite schema | ANCIENTINSANE |

Last generated: 2026-09-05T18:48:43.625Z
