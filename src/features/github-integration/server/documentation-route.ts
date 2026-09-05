import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { ID, Query } from "node-appwrite";

import {
  CODE_DOCS_ID,
  DATABASE_ID,
  GITHUB_REPOS_ID,
  PROJECTS_ID,
} from "@/config";
import { sessionMiddleware } from "@/lib/session-middleware";
import { getMember } from "@/features/members/utils";
import { logAIUsage } from "@/lib/usage-metering";
import { getAIModelPricing, calculateAICallCostUSD } from "@/lib/ai-model-pricing";
import { UsageModule } from "@/features/usage/types";

import { generateDocumentationSchema, refineDocumentationSchema, saveDocumentationSchema } from "../schemas";
import { GitHubRepository, CodeDocumentation } from "../types";
import { githubAPI, GitHubAPI } from "../lib/github-api";
import { geminiAPI } from "../lib/gemini-api";

const app = new Hono()
  // Generate documentation for a project (returns for preview)
  .post(
    "/generate",
    sessionMiddleware,
    zValidator("json", generateDocumentationSchema),
    async (c) => {
      try {
        const databases = c.get("databases");
        const user = c.get("user");
        const { projectId } = c.req.valid("json");

        // Get the project to verify workspace membership
        const project = await databases.getDocument(
          DATABASE_ID,
          PROJECTS_ID,
          projectId
        );

        if (!project) {
          return c.json({ error: "Project not found" }, 404);
        }

        // Check if user is a member of the workspace
        const member = await getMember({
          databases,
          workspaceId: project.workspaceId,
          userId: user.$id,
        });

        if (!member) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        // Get linked repository
        const repositories = await databases.listDocuments<GitHubRepository>(
          DATABASE_ID,
          GITHUB_REPOS_ID,
          [Query.equal("projectId", projectId), Query.limit(1)]
        );

        if (repositories.total === 0) {
          return c.json(
            { error: "No GitHub repository linked to this project" },
            400
          );
        }

        const repository = repositories.documents[0];

          // Initialize GitHub API with repository-specific token
          let token = repository.accessToken;
          if (token && token.includes(":")) {
            const { decryptToken } = await import("../lib/encryption");
            token = decryptToken(token);
          }
          const repoApi = new GitHubAPI(token);

          // Get repository info
          const repoInfo = await repoApi.getRepository(
            repository.owner,
            repository.repositoryName
          );

          // Fetch files from repository (limit to 50 for performance)
          const files = await repoApi.getAllFiles(
            repository.owner,
            repository.repositoryName,
            repository.branch,
            "",
            50
          );

          if (files.length === 0) {
            throw new Error("No code files found in repository");
          }

          // Generate file tree and mermaid diagram
          const fileStructure = githubAPI.generateFileTree(files);
          const mermaidDiagram = githubAPI.generateMermaidDiagram(files);

          // Generate comprehensive documentation
          const filesToDocument = files.slice(0, 20);

          const aiResponse = await geminiAPI.generateDocumentation(
            {
              name: repository.repositoryName,
              description: repoInfo.description || undefined,
              language: repoInfo.language || undefined,
            },
            filesToDocument
          );

          // Calculate model-aware cost and log with full token data
          const pricing = await getAIModelPricing(databases, aiResponse.model);
          const costUSD = calculateAICallCostUSD(pricing, aiResponse.tokenUsage.promptTokens, aiResponse.tokenUsage.completionTokens, aiResponse.tokenUsage.cachedTokens);

          logAIUsage({
            databases,
            workspaceId: project.workspaceId,
            projectId,
            model: aiResponse.model,
            promptTokens: aiResponse.tokenUsage.promptTokens,
            completionTokens: aiResponse.tokenUsage.completionTokens,
            cachedTokens: aiResponse.tokenUsage.cachedTokens,
            totalTokens: aiResponse.tokenUsage.totalTokens,
            costUSD,
            units: aiResponse.tokenUsage.totalTokens,
            metadata: {
              operation: "generate_documentation",
              repositoryName: repository.repositoryName,
              filesProcessed: filesToDocument.length,
              aiTier: pricing.tier,
              module: UsageModule.GITHUB,
            },
            sourceContext: {
              type: "project",
              displayName: repository.repositoryName,
            },
          });

          return c.json({ 
            data: {
              content: aiResponse.text,
              fileStructure,
              mermaidDiagram,
              projectId,
              workspaceId: project.workspaceId,
            } 
          });
      } catch (error) {
        console.error("[GitHub Doc Gen Error]:", error);
        return c.json(
          {
            error: "Failed to generate documentation",
            message: error instanceof Error ? error.message : "Unknown error",
          },
          500
        );
      }
    }
  )

  // Refine documentation based on user feedback
  .post(
    "/refine",
    sessionMiddleware,
    zValidator("json", refineDocumentationSchema),
    async (c) => {
      try {
        const databases = c.get("databases");
        const user = c.get("user");
        const { projectId, prompt, currentContent } = c.req.valid("json");

        // Verify project and membership
        const project = await databases.getDocument(DATABASE_ID, PROJECTS_ID, projectId);
        if (!project) return c.json({ error: "Project not found" }, 404);

        const member = await getMember({ databases, workspaceId: project.workspaceId, userId: user.$id });
        if (!member) return c.json({ error: "Unauthorized" }, 401);

        // Get linked repo for context
        const repositories = await databases.listDocuments<GitHubRepository>(
          DATABASE_ID, GITHUB_REPOS_ID, [Query.equal("projectId", projectId), Query.limit(1)]
        );
        if (repositories.total === 0) return c.json({ error: "No repository linked" }, 400);
        
        const repository = repositories.documents[0];
        
        // Initialize GitHub API with repository-specific token
        let token = repository.accessToken;
        if (token && token.includes(":")) {
          const { decryptToken } = await import("../lib/encryption");
          token = decryptToken(token);
        }
        const repoApi = new GitHubAPI(token);
        
        // Fetch a few files for context
        const files = await repoApi.getAllFiles(repository.owner, repository.repositoryName, repository.branch, "", 10);

        const aiResponse = await geminiAPI.refineDocumentation(
          currentContent,
          prompt,
          files.map((f: { path: string; content: string }) => ({ path: f.path, content: f.content }))
        );

        // Calculate model-aware cost and log with full token data
        const pricing = await getAIModelPricing(databases, aiResponse.model);
        const costUSD = calculateAICallCostUSD(pricing, aiResponse.tokenUsage.promptTokens, aiResponse.tokenUsage.completionTokens, aiResponse.tokenUsage.cachedTokens);

        logAIUsage({
          databases,
          workspaceId: project.workspaceId,
          projectId,
          model: aiResponse.model,
          promptTokens: aiResponse.tokenUsage.promptTokens,
          completionTokens: aiResponse.tokenUsage.completionTokens,
          cachedTokens: aiResponse.tokenUsage.cachedTokens,
          totalTokens: aiResponse.tokenUsage.totalTokens,
          costUSD,
          units: aiResponse.tokenUsage.totalTokens,
          metadata: {
            operation: "refine_documentation",
            promptLength: prompt.length,
            aiTier: pricing.tier,
            module: UsageModule.GITHUB,
          },
          sourceContext: {
            type: "project",
            displayName: repository.repositoryName,
          },
        });

        return c.json({ data: { content: aiResponse.text } });
      } catch (error) {
        return c.json({ error: "Failed to refine documentation", message: error instanceof Error ? error.message : "Unknown error" }, 500);
      }
    }
  )

  // Save documentation to database
  .post(
    "/save",
    sessionMiddleware,
    zValidator("json", saveDocumentationSchema),
    async (c) => {
      try {
        const databases = c.get("databases");
        const user = c.get("user");
        const { projectId, content, fileStructure, mermaidDiagram } = c.req.valid("json");
 
        const project = await databases.getDocument(DATABASE_ID, PROJECTS_ID, projectId);
        if (!project) return c.json({ error: "Project not found" }, 404);
 
        const member = await getMember({ databases, workspaceId: project.workspaceId, userId: user.$id });
        if (!member) return c.json({ error: "Unauthorized" }, 401);
 
        // Get existing or create new
        const existingDocs = await databases.listDocuments<CodeDocumentation>(
          DATABASE_ID, CODE_DOCS_ID, [Query.equal("projectId", projectId), Query.limit(1)]
        );
 
        let doc: CodeDocumentation;
        const updateData = { 
          content, 
          fileStructure, 
          mermaidDiagram, 
          generatedAt: new Date().toISOString() 
        };

        if (existingDocs.total > 0) {
          doc = await databases.updateDocument<CodeDocumentation>(
            DATABASE_ID, CODE_DOCS_ID, existingDocs.documents[0].$id,
            updateData
          );
        } else {
          doc = await databases.createDocument<CodeDocumentation>(
            DATABASE_ID, CODE_DOCS_ID, ID.unique(),
            { ...updateData, projectId, workspaceId: project.workspaceId }
          );
        }

        return c.json({ data: doc });
      } catch {
        return c.json({ error: "Failed to save documentation" }, 500);
      }
    }
  )

  // Get documentation for a project
  .get(
    "/",
    sessionMiddleware,
    zValidator("query", generateDocumentationSchema),
    async (c) => {
      try {
        const databases = c.get("databases");
        const user = c.get("user");
        const { projectId } = c.req.valid("query");

        const project = await databases.getDocument(DATABASE_ID, PROJECTS_ID, projectId);
        if (!project) return c.json({ error: "Project not found" }, 404);

        const member = await getMember({ databases, workspaceId: project.workspaceId, userId: user.$id });
        if (!member) return c.json({ error: "Unauthorized" }, 401);

        const docs = await databases.listDocuments<CodeDocumentation>(
          DATABASE_ID, CODE_DOCS_ID, [Query.equal("projectId", projectId), Query.limit(1)]
        );

        if (docs.total === 0) return c.json({ data: null });
        return c.json({ data: docs.documents[0] });
      } catch {
        return c.json({ error: "Failed to fetch documentation" }, 500);
      }
    }
  );

export default app;
