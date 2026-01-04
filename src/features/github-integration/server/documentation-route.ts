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
import { trackUsage, createIdempotencyKey } from "@/lib/track-usage";
import { ResourceType, UsageSource, UsageModule } from "@/features/usage/types";

import { generateDocumentationSchema } from "../schemas";
import { GitHubRepository, CodeDocumentation } from "../types";
import { githubAPI } from "../lib/github-api";
import { geminiAPI } from "../lib/gemini-api";

const app = new Hono()
  // Generate documentation for a project
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

        try {
          // Get repository info
          const repoInfo = await githubAPI.getRepository(
            repository.owner,
            repository.repositoryName
          );

          // Fetch files from repository (limit to 50 for performance)
          const files = await githubAPI.getAllFiles(
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

          // Generate comprehensive documentation in ONE Gemini API call
          const filesToDocument = files.slice(0, 20);

          const documentation = await geminiAPI.generateDocumentation(
            {
              name: repository.repositoryName,
              description: repoInfo.description || undefined,
              language: repoInfo.language || undefined,
            },
            filesToDocument
          );

          // Track usage for GitHub documentation generation (non-blocking)
          trackUsage({
            workspaceId: project.workspaceId,
            projectId,
            module: UsageModule.GITHUB,
            resourceType: ResourceType.COMPUTE,
            units: 1 + filesToDocument.length, // 1 base + files processed
            source: UsageSource.AI,
            metadata: {
              operation: "generate_documentation",
              repositoryName: repository.repositoryName,
              filesProcessed: filesToDocument.length,
              documentationLength: documentation.length,
            },
            idempotencyKey: createIdempotencyKey(UsageModule.GITHUB, "doc_gen", projectId),
          });

          // Save or update documentation
          const existingDocs = await databases.listDocuments<CodeDocumentation>(
            DATABASE_ID,
            CODE_DOCS_ID,
            [Query.equal("projectId", projectId), Query.limit(1)]
          );

          let doc: CodeDocumentation;

          if (existingDocs.total > 0) {
            doc = await databases.updateDocument<CodeDocumentation>(
              DATABASE_ID,
              CODE_DOCS_ID,
              existingDocs.documents[0].$id,
              {
                content: documentation,
                fileStructure,
                mermaidDiagram,
                generatedAt: new Date().toISOString(),
              }
            );
          } else {
            doc = await databases.createDocument<CodeDocumentation>(
              DATABASE_ID,
              CODE_DOCS_ID,
              ID.unique(),
              {
                projectId,
                content: documentation,
                fileStructure,
                mermaidDiagram,
                generatedAt: new Date().toISOString(),
              }
            );
          }

          return c.json({ data: doc });
        } catch (error: unknown) {
          console.error("Error generating documentation:", error);

          // Update repository status to error
          await databases.updateDocument(
            DATABASE_ID,
            GITHUB_REPOS_ID,
            repository.$id,
            {
              status: "error",
              error: error instanceof Error ? error.message : "Failed to generate documentation",
            }
          );

          throw error;
        }
      } catch (error: unknown) {
        console.error("Error in documentation generation:", error);
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

        // Get documentation
        const docs = await databases.listDocuments<CodeDocumentation>(
          DATABASE_ID,
          CODE_DOCS_ID,
          [Query.equal("projectId", projectId), Query.limit(1)]
        );

        if (docs.total === 0) {
          return c.json({ data: null });
        }

        return c.json({ data: docs.documents[0] });
      } catch (error: unknown) {
        console.error("Error fetching documentation:", error);
        return c.json(
          {
            error: "Failed to fetch documentation",
            message: error instanceof Error ? error.message : "Unknown error",
          },
          500
        );
      }
    }
  );

export default app;
