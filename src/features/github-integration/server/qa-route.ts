import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { CODE_DOCS_ID, DATABASE_ID, GITHUB_REPOS_ID, PROJECTS_ID } from "@/config";
import { sessionMiddleware } from "@/lib/session-middleware";
import { getMember } from "@/features/members/utils";
import { trackUsage, createIdempotencyKey, estimateTokens } from "@/lib/track-usage";
import { ResourceType, UsageSource, UsageModule } from "@/features/usage/types";
import { GitHubAPI } from "../lib/github-api";
import { GeminiAPI } from "../lib/gemini-api";
import { GitHubRepository } from "../types";

interface Documentation {
  projectId: string;
  content: string;
  [key: string]: unknown;
}

const app = new Hono()
  // Ask a question about the codebase (real-time, not stored)
  .post(
    "/ask",
    sessionMiddleware,
    zValidator(
      "json",
      z.object({
        projectId: z.string(),
        question: z.string().min(3).max(1000),
      })
    ),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");
      const { projectId, question } = c.req.valid("json");

      try {
        // 1. Get the linked repository
        const repositories = await databases.listDocuments(
          DATABASE_ID,
          GITHUB_REPOS_ID,
          []
        );

        const repository = repositories.documents.find(
          (r) => (r as unknown as GitHubRepository).projectId === projectId
        ) as unknown as GitHubRepository | undefined;

        if (!repository) {
          return c.json(
            { error: "No GitHub repository linked to this project" },
            404
          );
        }

        // 2. Get the project to verify workspace membership
        const project = await databases.getDocument(
          DATABASE_ID,
          PROJECTS_ID,
          projectId
        );

        // 3. Verify workspace membership
        const member = await getMember({
          databases,
          workspaceId: project.workspaceId,
          userId: user.$id,
        });

        if (!member) {
          return c.json({ error: "Unauthorized" }, 403);
        }

        // 4. Check if documentation exists (to use as context)
        const docs = await databases.listDocuments(
          DATABASE_ID,
          CODE_DOCS_ID,
          []
        );

        const documentation = docs.documents.find(
          (d) => (d as unknown as Documentation).projectId === projectId
        ) as unknown as Documentation | undefined;

        // 5. Initialize GitHub API with token for authenticated requests
        const githubAPI = new GitHubAPI(repository.accessToken);

        // 6. Fetch some files for context (limit for performance)
        const files = await githubAPI.getAllFiles(
          repository.owner,
          repository.repositoryName,
          repository.branch,
          "",
          20 // Limit to 20 files for performance
        );

        if (files.length === 0) {
          return c.json(
            {
              error: "No code files found in repository",
            },
            400
          );
        }

        // 7. Fetch commit history for questions about commits, authors, or history
        // Keywords that suggest the question is about commits/history
        const historyKeywords = ['commit', 'author', 'contributor', 'history', 'when', 'who', 'initial', 'first', 'last', 'recent'];
        const needsCommitHistory = historyKeywords.some(keyword =>
          question.toLowerCase().includes(keyword)
        );

        let commits: Array<{
          hash: string;
          message: string;
          author: string;
          date: string;
          url: string;
        }> = [];

        if (needsCommitHistory) {
          try {
            // Fetch commits (limit to 100 for performance)
            const rawCommits = await githubAPI.getCommits(
              repository.owner,
              repository.repositoryName,
              repository.branch,
              100
            );

            commits = rawCommits.map((c: { sha: string; commit: { message: string; author: { name: string; date: string } }; html_url: string }) => ({
              hash: c.sha,
              message: c.commit.message,
              author: c.commit.author.name,
              date: c.commit.author.date,
              url: c.html_url,
            }));
          } catch (error) {
            console.error("Error fetching commits for Q&A:", error);
            // Continue without commits if fetch fails
          }
        }

        // 8. Generate answer using Gemini (real-time)
        const geminiAPI = new GeminiAPI();

        if (!geminiAPI.isConfigured()) {
          return c.json(
            {
              error: "AI Q&A requires GEMINI_API_KEY to be configured in environment variables",
            },
            400
          );
        }

        const codebaseContext: {
          files: Array<{ path: string; content: string; summary?: string }>;
          documentation?: string;
          commits?: Array<{
            hash: string;
            message: string;
            author: string;
            date: string;
            url: string;
          }>;
        } = {
          files: files.map((f) => ({
            path: f.path,
            content: f.content.slice(0, 10000), // Limit content size
          })),
          documentation: documentation?.content,
          commits,
        };

        const answer = await geminiAPI.answerQuestion(question, codebaseContext);

        // Track usage for GitHub Q&A (non-blocking)
        trackUsage({
          workspaceId: project.workspaceId,
          projectId,
          module: UsageModule.GITHUB,
          resourceType: ResourceType.COMPUTE,
          units: 1,
          source: UsageSource.AI,
          metadata: {
            operation: "ask_question",
            repositoryName: repository.repositoryName,
            filesUsed: files.length,
            questionLength: question.length,
            answerLength: answer.length,
            tokensEstimate: estimateTokens(question + answer),
          },
          idempotencyKey: createIdempotencyKey(UsageModule.GITHUB, "qa", projectId),
        });

        return c.json({
          data: {
            question,
            answer,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error: unknown) {
        console.error("Error answering question:", error);
        return c.json(
          {
            error: error instanceof Error
              ? error.message
              : "Failed to answer question. Please check your API configuration.",
          },
          500
        );
      }
    }
  );

export default app;
