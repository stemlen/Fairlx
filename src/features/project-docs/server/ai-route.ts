import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ID, Query, Storage as AppwriteStorage } from "node-appwrite";

import { sessionMiddleware } from "@/lib/session-middleware";
import { createAdminClient } from "@/lib/appwrite";
import { logAIUsage } from "@/lib/usage-metering";
import { getAIModelPricing, calculateAICallCostUSD } from "@/lib/ai-model-pricing";
import { UsageModule } from "@/features/usage/types";
import {
  DATABASE_ID,
  PROJECT_DOCS_ID,
  PROJECT_DOCS_BUCKET_ID,
  PROJECTS_ID,
  WORK_ITEMS_ID,
  MEMBERS_ID,
  GITHUB_REPOS_ID,
  CODE_DOCS_ID,
} from "@/config";
import { getMember } from "@/features/members/utils";
import { Member } from "@/features/members/types";
import { projectDocsAI } from "../lib/project-docs-ai";
import { ProjectDocument } from "../types";
import { WorkItem, WorkItemStatus, WorkItemPriority, WorkItemType } from "@/features/sprints/types";
import {
  ProjectAIContext,
  DocumentContext,
  TaskContext,
  MemberContext,
  ProjectAIAnswer,
  AITaskData,
  AITaskResponse,
} from "../types/ai-context";
import { generateWorkItemKey } from "@/features/sprints/lib/generate-work-item-key";

// Schema for asking questions
const askProjectQuestionSchema = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
  question: z.string().min(3).max(2000),
});

// Schema for getting AI context
const getProjectAIContextSchema = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
});

// Schema for creating a task using AI
const aiCreateTaskSchema = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
  prompt: z.string().min(3).max(2000),
  autoExecute: z.boolean().optional().default(false),
  type: z.string().optional(), // WorkItemType choice from user
});

// Schema for AI task update
const aiUpdateTaskSchema = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
  taskId: z.string(),
  prompt: z.string().min(5).max(2000),
  autoExecute: z.boolean().optional().default(false),
});

// Schema for executing AI task suggestion
const executeTaskSuggestionSchema = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
  taskData: z.object({
    name: z.string().optional(), // Optional for updates, required logic handled in endpoint
    description: z.string().optional().nullable(),
    status: z.string().optional(),
    priority: z.string().optional(),
    type: z.string().optional(),
    dueDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    assigneeIds: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
    estimatedHours: z.number().optional().nullable(),
  }),
  taskId: z.string().optional(), // For updates
});

/**
 * Extract text content from a document URL
 * For PDFs and text files, attempts to read the content
 */
async function extractDocumentText(
  storage: AppwriteStorage,
  bucketId: string,
  fileId: string,
  mimeType: string
): Promise<string> {
  try {
    const fileBuffer = await storage.getFileDownload(bucketId, fileId);

    // If it's a text-based file, convert to string
    if (
      mimeType.includes("text/") ||
      mimeType.includes("application/json") ||
      mimeType.includes("application/xml") ||
      mimeType.includes("javascript") ||
      mimeType.includes("typescript")
    ) {
      const decoder = new TextDecoder("utf-8");
      return decoder.decode(fileBuffer);
    }

    // PDF extraction using pdf-parse (v2.4.5+)
    // CRITICAL: webpackIgnore prevents webpack from wrapping this import with its
    // ESM interop code (Object.defineProperty on exports), which crashes pdfjs-dist.
    if (mimeType.includes("pdf")) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfModule = await import(/* webpackIgnore: true */ "pdf-parse") as any;
        
        // pdf-parse v2.4.5 exports PDFParse as a named export
        const PDFParseClass = pdfModule.PDFParse || pdfModule.default;
        
        if (PDFParseClass && typeof PDFParseClass === 'function') {
          const parser = new PDFParseClass({ data: Buffer.from(fileBuffer) });
          const result = await parser.getText();
          return result?.text || "[Empty PDF Document]";
        }
        
        // Fallback: maybe it's a callable default export (older API)
        if (typeof pdfModule === 'function') {
          const result = await pdfModule(Buffer.from(fileBuffer));
          return result?.text || "[Empty PDF Document]";
        }
        if (typeof pdfModule.default === 'function') {
          const result = await pdfModule.default(Buffer.from(fileBuffer));
          return result?.text || "[Empty PDF Document]";
        }
        
        console.warn(`[AI Context] pdf-parse module shape unexpected:`, Object.keys(pdfModule));
        return "[PDF Document - Parser not compatible]";
      } catch (pdfError) {
        console.warn(`[AI Context] PDF extraction failed for ${fileId}:`, pdfError);
        return "[PDF Document - Extraction failed]";
      }
    }

    if (mimeType.includes("word") || mimeType.includes("document")) {
      return "[Word Document - Content extraction not yet implemented]";
    }

    return "[Document content not extractable]";
  } catch (error) {
    const isMissing = error && typeof error === 'object' && 'type' in error && error.type === 'storage_file_not_found';
    
    if (isMissing) {
      console.warn(`[AI Context] Document file ${fileId} not found in storage. It may have been deleted.`);
      return "[Document file missing from storage]";
    }

    console.error(`[AI Context] Failed to extract text for file ${fileId}:`, error);
    return "[Failed to extract document content]";
  }
}

const app = new Hono()
  // Get AI context for a project
  .get(
    "/context",
    sessionMiddleware,
    zValidator("query", getProjectAIContextSchema),
    async (c) => {
      try {
        const user = c.get("user");
        const databases = c.get("databases");
        const storage = c.get("storage");
        const { projectId, workspaceId } = c.req.valid("query");

        // Verify workspace membership
        const member = await getMember({
          databases,
          workspaceId,
          userId: user.$id,
        });

        if (!member) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        // Get project details
        let project;
        if (projectId === "p1") {
          project = {
            $id: "p1",
            name: "Fairlx",
            description: "Building the world's most advanced AI-powered project management platform.",
            workspaceId,
            $createdAt: new Date().toISOString(),
          };
        } else {
          project = await databases.getDocument(
            DATABASE_ID,
            PROJECTS_ID,
            projectId
          );
        }

        // Get project documents (non-archived)
        const docsResponse = await databases.listDocuments<ProjectDocument>(
          DATABASE_ID,
          PROJECT_DOCS_ID,
          [
            Query.equal("projectId", projectId),
            Query.equal("workspaceId", workspaceId),
            Query.equal("isArchived", false),
            Query.limit(50), 
          ]
        );

        // Check for project-critical documents to decide on context fetching strategy
        const highQualityCategories = [
          "BRD", "MRD", "PRD", "FRD", "SRS", "USER STORIES", "USE CASES", "ACCEPTANCE CRITERIA",
          "UX SPEC", "WIREFRAMES", "UI DESIGN", "DESIGN SYSTEM", "HLD", "LLD", "ADR",
          "API DOCUMENTATION", "DATABASE SCHEMA", "ERD", "SEQUENCE DIAGRAMS", "PROJECT PLAN",
          "ROADMAP", "RACI MATRIX", "RISK REGISTER", "TEST PLAN", "TEST CASES", "TEST SCENARIOS",
          "UAT", "RELEASE NOTES", "DEPLOYMENT GUIDE", "RUNBOOK", "SOP", "MONITORING", "SLA",
          "SECURITY REQUIREMENTS", "COMPLIANCE", "LEGAL", "PRIVACY POLICY", "TERMS OF SERVICE",
          "USER MANUAL", "TECHNICAL DOCUMENTATION", "CHANGE LOG", "MAINTENANCE"
        ];

        const hasHighQualityDoc = docsResponse.documents.some(d => {
          const category = (d.category || "").toUpperCase();
          const name = (d.name || "").toUpperCase();
          return highQualityCategories.some(type => category.includes(type) || name.includes(type));
        });


        // Get project work items (replaces tasks)
        // Fetch MORE tasks if no critical docs are found to compensate for lack of context
        const taskLimit = hasHighQualityDoc ? 100 : 250;
        const workItemsResponse = await databases.listDocuments<WorkItem>(
          DATABASE_ID,
          WORK_ITEMS_ID,
          [
            Query.equal("projectId", projectId),
            Query.equal("workspaceId", workspaceId),
            Query.limit(taskLimit), 
          ]
        );

        // Get workspace members
        const membersResponse = await databases.listDocuments<Member>(
          DATABASE_ID,
          MEMBERS_ID,
          [
            Query.equal("workspaceId", workspaceId),
            Query.limit(100),
          ]
        );

        // Create a map of member $id to member details (assigneeIds use member document IDs)
        const memberMap = new Map<string, Member>();
        membersResponse.documents.forEach((m) => {
          memberMap.set(m.$id, m);
        });

        // Count tasks per assignee (using work items)
        const tasksByAssignee: Record<string, number> = {};
        workItemsResponse.documents.forEach((workItem) => {
          if (workItem.assigneeIds && workItem.assigneeIds.length > 0) {
            workItem.assigneeIds.forEach(assigneeId => {
              tasksByAssignee[assigneeId] = (tasksByAssignee[assigneeId] || 0) + 1;
            });
          }
        });

        // Process members with task counts
        const members: MemberContext[] = membersResponse.documents.map((m) => ({
          id: m.$id,
          userId: m.userId,
          name: m.name || m.email || "Unknown Member",
          email: m.email || undefined,
          role: m.role,
          tasksAssigned: tasksByAssignee[m.userId] || 0,
        }));

        // Process documents with extracted text
        const documents: DocumentContext[] = await Promise.all(
          docsResponse.documents.map(async (doc) => {
            const extractedText = await extractDocumentText(
              storage,
              PROJECT_DOCS_BUCKET_ID,
              doc.fileId,
              doc.mimeType
            );

            return {
              id: doc.$id,
              name: doc.title,
              category: doc.category,
              description: doc.description || undefined,
              tags: doc.tags || undefined,
              extractedText,
              createdAt: doc.$createdAt,
            };
          })
        );

        // Process work items as tasks with assignee names
        const tasks: TaskContext[] = workItemsResponse.documents.map((workItem) => {
          // Handle multiple assignees
          const assigneeIds = workItem.assigneeIds || [];
          const assigneeNames = assigneeIds
            .map(id => memberMap.get(id))
            .filter(Boolean)
            .map(m => m!.name || m!.email || "Unknown");

          return {
            id: workItem.$id,
            name: workItem.title,
            status: workItem.status,
            priority: workItem.priority || undefined,
            description: workItem.description || undefined,
            assigneeId: assigneeIds[0] || undefined,
            assigneeName: assigneeNames.length > 0 ? assigneeNames.join(", ") : undefined,
            dueDate: workItem.dueDate || undefined,
            labels: workItem.labels || undefined,
          };
        });

        // Calculate summary stats
        const tasksByStatus: Record<string, number> = {};
        tasks.forEach((task) => {
          tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
        });

        const documentCategories = [...new Set(documents.map((d) => d.category))];

        const context: ProjectAIContext = {
          project: {
            id: project.$id,
            name: project.name,
            description: project.description || undefined,
            workspaceId: project.workspaceId,
            createdAt: project.$createdAt,
          },
          documents,
          tasks,
          members,
          summary: {
            totalDocuments: documents.length,
            totalTasks: tasks.length,
            totalMembers: members.length,
            tasksByStatus,
            tasksByAssignee,
            documentCategories,
          },
        };

        return c.json({ data: context });
      } catch (error) {
        console.error("[AI Context Error]:", error);
        return c.json({ 
          error: "Failed to fetch AI context",
          details: error instanceof Error ? error.message : "Unknown error"
        }, 500);
      }
    }
  )
  // Ask a question about the project using AI
  .post(
    "/ask",
    sessionMiddleware,
    zValidator("json", askProjectQuestionSchema),
    async (c) => {
      try {
        const user = c.get("user");
        const databases = c.get("databases");
        const storage = c.get("storage");
        const { projectId, workspaceId, question } = c.req.valid("json");

        // Verify workspace membership
        const member = await getMember({
          databases,
          workspaceId,
          userId: user.$id,
        });

        if (!member) {
          return c.json({ error: "Unauthorized" }, 401);
        }


        if (!projectDocsAI.isConfigured()) {
          return c.json(
            { error: "AI features require GEMINI_API_KEY to be configured" },
            400
          );
        }

        // Get project details
        const project = await databases.getDocument(
          DATABASE_ID,
          PROJECTS_ID,
          projectId
        );

        // Get project documents (non-archived)
        const docsResponse = await databases.listDocuments<ProjectDocument>(
          DATABASE_ID,
          PROJECT_DOCS_ID,
          [
            Query.equal("projectId", projectId),
            Query.equal("workspaceId", workspaceId),
            Query.equal("isArchived", false),
            Query.limit(30), // Limit for AI context
          ]
        );

        const githubRepoResponse = await databases.listDocuments(
          DATABASE_ID,
          GITHUB_REPOS_ID,
          [Query.equal("projectId", projectId), Query.limit(1)]
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const githubRepo = githubRepoResponse.documents[0] as any;
 
        // Check for Code Documentation context
        const codeDocsResponseList = await databases.listDocuments(
          DATABASE_ID,
          CODE_DOCS_ID,
          [Query.equal("projectId", projectId), Query.limit(1)]
        );
 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const codeDoc = codeDocsResponseList.documents[0] as any;

        // Check for project-critical documents to decide on task fetching limit
        const highQualityCategories = [
          "BRD", "MRD", "PRD", "FRD", "SRS", "USER STORIES", "USE CASES", "ACCEPTANCE CRITERIA",
          "UX SPEC", "WIREFRAMES", "UI DESIGN", "DESIGN SYSTEM", "HLD", "LLD", "ADR",
          "API DOCUMENTATION", "DATABASE SCHEMA", "ERD", "SEQUENCE DIAGRAMS", "PROJECT PLAN",
          "ROADMAP", "RACI MATRIX", "RISK REGISTER", "TEST PLAN", "TEST CASES", "TEST SCENARIOS",
          "UAT", "RELEASE NOTES", "DEPLOYMENT GUIDE", "RUNBOOK", "SOP", "MONITORING", "SLA",
          "SECURITY REQUIREMENTS", "COMPLIANCE", "LEGAL", "PRIVACY POLICY", "TERMS OF SERVICE",
          "USER MANUAL", "TECHNICAL DOCUMENTATION", "CHANGE LOG", "MAINTENANCE"
        ];

        const hasHighQualityDoc = docsResponse.documents.some(d => {
          const category = (d.category || "").toUpperCase();
          const name = (d.name || "").toUpperCase();
          return highQualityCategories.some(type => category.includes(type) || name.includes(type));
        });

        // Get project work items (fetch more if no high quality docs)
        const taskLimit = hasHighQualityDoc ? 50 : 150;
        const workItemsResponse = await databases.listDocuments<WorkItem>(
          DATABASE_ID,
          WORK_ITEMS_ID,
          [
            Query.equal("projectId", projectId),
            Query.equal("workspaceId", workspaceId),
            Query.limit(taskLimit),
          ]
        );

        // Get workspace members
        const membersResponse = await databases.listDocuments<Member>(
          DATABASE_ID,
          MEMBERS_ID,
          [
            Query.equal("workspaceId", workspaceId),
            Query.limit(100),
          ]
        );

        // Create a map of member $id to member details (assigneeIds use member document IDs)
        const memberMap = new Map<string, Member>();
        membersResponse.documents.forEach((m) => {
          memberMap.set(m.$id, m);
        });

        // Process documents with extracted text
        const documentContexts: string[] = await Promise.all(
          docsResponse.documents.map(async (doc) => {
            const extractedText = await extractDocumentText(
              storage,
              PROJECT_DOCS_BUCKET_ID,
              doc.fileId,
              doc.mimeType
            );

            return `
## Document: ${doc.name}
**Category:** ${doc.category}
**Description:** ${doc.description || "No description"}
**Tags:** ${doc.tags?.join(", ") || "None"}
**Content:**
${extractedText.slice(0, 10000)}
`;
          })
        );

        // Format work items context with assignee names
        const taskContexts = workItemsResponse.documents.map((workItem) => {
          // Handle multiple assignees
          const assigneeIds = workItem.assigneeIds || [];
          const assigneeNames = assigneeIds
            .map(id => memberMap.get(id))
            .filter(Boolean)
            .map(m => m!.name || m!.email || "Unknown");
          const assigneeDisplay = assigneeNames.length > 0 ? assigneeNames.join(", ") : "Unassigned";

          // Format due date
          const dueDateDisplay = workItem.dueDate
            ? new Date(workItem.dueDate).toLocaleDateString()
            : "No due date";

          // Strip HTML tags for plain text in AI context
          const plainDesc = workItem.description
            ?.replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200) || "No description";

          return `- **${workItem.title}** [${workItem.status}] ${workItem.priority ? `(${workItem.priority})` : ""} | Assigned to: ${assigneeDisplay} | Due: ${dueDateDisplay} | Labels: ${workItem.labels?.join(", ") || "None"} | Est. Hours: ${workItem.estimatedHours || "Not set"} - ${plainDesc}`;
        }).join("\n");

        // Format members context
        const memberContexts = membersResponse.documents.map((m) => {
          const taskCount = workItemsResponse.documents.filter(w =>
            w.assigneeIds?.includes(m.$id)
          ).length;
          return `- **${m.name || m.email || "Unknown"}** (${m.role}) - ${taskCount} task(s) assigned`;
        }).join("\n");

        // Build the comprehensive prompt
        const prompt = `You are an AI assistant with deep knowledge of this specific project. Answer questions based on the project context provided below. 

IMPORTANT: Always cite the specific Documents, GitHub repositories, or Tasks you are referencing in your answer so the user knows exactly where the information came from.

## Project Information
**Name:** ${project.name}
**Description:** ${project.description || "No project description provided"}
**Created:** ${new Date(project.$createdAt).toLocaleDateString()}

## Project Statistics
- **Total Documents:** ${docsResponse.documents.length}
- **Total Tasks:** ${workItemsResponse.documents.length}
- **Team Members:** ${membersResponse.documents.length}
- **Document Categories:** ${[...new Set(docsResponse.documents.map(d => d.category))].join(", ") || "None"}

## Team Members
${memberContexts || "No team members found."}

## Connected Codebase (GitHub)
${githubRepo ? `- **Repository:** ${githubRepo.owner}/${githubRepo.repositoryName}
- **Branch:** ${githubRepo.branch}
- **URL:** ${githubRepo.githubUrl}` : "No repository connected."}

${codeDoc ? `### Implementation Context & Codebase Overview
${codeDoc.content.slice(0, 6000)}` : ""}

## Project Documents
${documentContexts.join("\n---\n") || (githubRepo ? "No project-specific PRDs/FRDs found. Using codebase context instead." : "No documents uploaded yet.")}

## Project Tasks (Current Roadmap)
${taskContexts || "No tasks created yet."}

---

## User Question
${question}

---

## Instructions
1. Answer the question based on the project context above
2. Reference specific documents, tasks, or details when relevant
3. If the question cannot be answered from the context, say so clearly
4. Be helpful and provide actionable insights when possible
5. Format your response in clear Markdown with headings and bullet points where appropriate

Provide a comprehensive, helpful answer:`;

        // Call Project Docs AI
        const aiResponse = await projectDocsAI.answerProjectQuestion(prompt);

        // Calculate model-aware cost and log with full token data
        const pricing = await getAIModelPricing(databases, aiResponse.model);
        const costUSD = calculateAICallCostUSD(pricing, aiResponse.tokenUsage.promptTokens, aiResponse.tokenUsage.completionTokens, aiResponse.tokenUsage.cachedTokens);

        logAIUsage({
          databases,
          workspaceId,
          projectId,
          model: aiResponse.model,
          promptTokens: aiResponse.tokenUsage.promptTokens,
          completionTokens: aiResponse.tokenUsage.completionTokens,
          cachedTokens: aiResponse.tokenUsage.cachedTokens,
          totalTokens: aiResponse.tokenUsage.totalTokens,
          costUSD,
          units: aiResponse.tokenUsage.totalTokens,
          metadata: {
            operation: "ask_question",
            promptLength: prompt.length,
            documentsUsed: docsResponse.documents.length,
            aiTier: pricing.tier,
            module: UsageModule.DOCS,
          },
          sourceContext: {
            type: "project",
            displayName: projectId,
          },
        });

        const response: ProjectAIAnswer = {
          question,
          answer: aiResponse.text,
          timestamp: new Date().toISOString(),
          contextUsed: {
            documentsCount: docsResponse.documents.length,
            tasksCount: workItemsResponse.documents.length,
            membersCount: membersResponse.documents.length,
            categories: [...new Set(docsResponse.documents.map(d => d.category))],
          },
        };

        return c.json({ data: response });
      } catch (error) {
        return c.json({
          error: error instanceof Error ? error.message : "Failed to process question"
        }, 500);
      }
    }
  )
  // Create a task using AI
  .post(
    "/create-task",
    sessionMiddleware,
    zValidator("json", aiCreateTaskSchema),
    async (c) => {
      try {
        const user = c.get("user");
        const databases = c.get("databases");
        const { projectId, workspaceId, prompt, autoExecute, type } = c.req.valid("json");

        // Verify workspace membership
        const member = await getMember({
          databases,
          workspaceId,
          userId: user.$id,
        });

        if (!member) {
          return c.json({ error: "Unauthorized" }, 401);
        }


        if (!projectDocsAI.isConfigured()) {
          return c.json(
            { error: "AI features require GEMINI_API_KEY to be configured" },
            400
          );
        }

        // Get project details
        const project = await databases.getDocument(
          DATABASE_ID,
          PROJECTS_ID,
          projectId
        );

        // Get workspace members for assignment suggestions
        const membersResponse = await databases.listDocuments<Member>(
          DATABASE_ID,
          MEMBERS_ID,
          [
            Query.equal("workspaceId", workspaceId),
            Query.limit(100),
          ]
        );

        // Get project documents for deeper context
        const docsResponse = await databases.listDocuments<ProjectDocument>(
          DATABASE_ID,
          PROJECT_DOCS_ID,
          [
            Query.equal("projectId", projectId),
            Query.equal("isArchived", false),
            Query.limit(10), // Increased sample
          ]
        );

        // Check for project-critical documents to decide on task fetching limit
        const highQualityCategories = [
          "BRD", "MRD", "PRD", "FRD", "SRS", "USER STORIES", "USE CASES", "ACCEPTANCE CRITERIA",
          "UX SPEC", "WIREFRAMES", "UI DESIGN", "DESIGN SYSTEM", "HLD", "LLD", "ADR",
          "API DOCUMENTATION", "DATABASE SCHEMA", "ERD", "SEQUENCE DIAGRAMS", "PROJECT PLAN",
          "ROADMAP", "RACI MATRIX", "RISK REGISTER", "TEST PLAN", "TEST CASES", "TEST SCENARIOS",
          "UAT", "RELEASE NOTES", "DEPLOYMENT GUIDE", "RUNBOOK", "SOP", "MONITORING", "SLA",
          "SECURITY REQUIREMENTS", "COMPLIANCE", "LEGAL", "PRIVACY POLICY", "TERMS OF SERVICE",
          "USER MANUAL", "TECHNICAL DOCUMENTATION", "CHANGE LOG", "MAINTENANCE"
        ];

        const hasHighQualityDoc = docsResponse.documents.some(d => {
          const category = (d.category || "").toUpperCase();
          const name = (d.name || "").toUpperCase();
          return highQualityCategories.some(type => category.includes(type) || name.includes(type));
        });

        // Get GitHub repository connection if exists
        const githubResponse = await databases.listDocuments(
          DATABASE_ID,
          GITHUB_REPOS_ID,
          [Query.equal("projectId", projectId), Query.limit(1)]
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const githubRepo = githubResponse.documents[0] as any;

        // Get Code Documentation if exists
        const codeDocsResponse = await databases.listDocuments(
          DATABASE_ID,
          CODE_DOCS_ID,
          [Query.equal("projectId", projectId), Query.limit(1)]
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const codeDoc = codeDocsResponse.documents[0] as any;

        // Get existing work items for context
        // Fetch MORE tasks if no high quality docs are found to compensate
        const taskLimit = hasHighQualityDoc ? 20 : 60;
        const workItemsResponse = await databases.listDocuments<WorkItem>(
          DATABASE_ID,
          WORK_ITEMS_ID,
          [
            Query.equal("projectId", projectId),
            Query.equal("workspaceId", workspaceId),
            Query.limit(taskLimit),
          ]
        );

        // Format members for AI context
        const membersList = membersResponse.documents.map(m =>
          `- ${m.name || m.email} (ID: ${m.$id}, Role: ${m.role})`
        ).join("\n");

        // Format existing work items for context (including their labels)
        const existingLabels = new Set<string>();
        const tasksList = workItemsResponse.documents.map(w => {
          if (w.labels) {
            w.labels.forEach(l => existingLabels.add(l));
          }
          return `- ${w.title} [${w.status}] ${w.priority ? `(${w.priority})` : ""} ${w.labels?.length ? `Labels: ${w.labels.join(", ")}` : ""}`;
        }).join("\n");

        const existingLabelsList = Array.from(existingLabels).join(", ");

        // Build prompt for AI
        const aiPrompt = `You are a work item creation assistant for project "${project.name}". Based on the user's request, generate work item details in JSON format.
${type ? `
### MANDATORY: Target Work Item Type
The user has explicitly requested this item be of type: **${type.toUpperCase()}**. 
Ensure the name, description, and priority are appropriate for a ${type.toLowerCase()}.` : ""}

## Available Team Members
${membersList || "No members found"}

## Existing Work Items (for context)
${tasksList || "No existing work items"}

## Existing Labels in Project
${existingLabelsList || "No existing labels"}

## Project Documents (Context)
${docsResponse.documents.map(d => `- ${d.name}: ${d.extractedText?.substring(0, 1500) || "No content available"}...`).join("\n") || (githubRepo ? "No documents found, using codebase context." : "No documents found")}

## Connected Codebase (GitHub)
${githubRepo ? `- Repository: ${githubRepo.owner}/${githubRepo.repositoryName} (${githubRepo.githubUrl})` : "No repository connected"}
${codeDoc ? `### Implementation Context & Codebase Overview
${codeDoc.content.substring(0, 4000)}` : ""}

## User Request
${prompt}

---

Generate a JSON object with the following structure (only include fields that are relevant):
{
  "name": "Work item title (required, be specific and actionable)",
  "description": "Comprehensive HTML-formatted description",
  "status": "TODO",
  "priority": "MEDIUM",
  "dueDate": "YYYY-MM-DD (if mentioned or can be inferred)",
  "endDate": "YYYY-MM-DD (if mentioned)",
  "assigneeIds": ["member-id-1"] (only if specific assignee mentioned by name),
  "labels": ["label1", "label2"] (ALWAYS suggest 1-3 relevant labels based on work item type/category),
  "estimatedHours": 4 (if time estimate is mentioned)
}

IMPORTANT: 
- For the "description" field, ALWAYS use HTML tags for structure. Provide:
  - <h3>Context</h3> explaining why this task is needed.
  - <h3>Description</h3> detailing exactly what needs to be done.
  - <h3>Acceptance Criteria</h3> using a <ul> list with <li> checkbox-like items.
- Return ONLY valid JSON, no markdown code blocks
- Use actual member IDs from the list above for assigneeIds (only if user mentions a specific person)
- Make the work item title clear and actionable
- ALWAYS generate relevant labels based on the work item type (e.g., "bug" for bugs, "feature" for features, "frontend"/"backend" for technical tasks)
- Prefer existing labels from the project when applicable
- If dates are mentioned like "tomorrow" or "next week", calculate the actual date from today (${new Date().toISOString().split("T")[0]})
- Default status to "TODO" if not specified
- Default priority to "MEDIUM" if not specified`;

        const aiCreateResponse = await projectDocsAI.answerProjectQuestion(aiPrompt);

        // Calculate model-aware cost and log with full token data
        const createPricing = await getAIModelPricing(databases, aiCreateResponse.model);
        const createCostUSD = calculateAICallCostUSD(createPricing, aiCreateResponse.tokenUsage.promptTokens, aiCreateResponse.tokenUsage.completionTokens, aiCreateResponse.tokenUsage.cachedTokens);

        logAIUsage({
          databases,
          workspaceId,
          projectId,
          model: aiCreateResponse.model,
          promptTokens: aiCreateResponse.tokenUsage.promptTokens,
          completionTokens: aiCreateResponse.tokenUsage.completionTokens,
          cachedTokens: aiCreateResponse.tokenUsage.cachedTokens,
          totalTokens: aiCreateResponse.tokenUsage.totalTokens,
          costUSD: createCostUSD,
          units: aiCreateResponse.tokenUsage.totalTokens,
          metadata: {
            operation: "create_task",
            promptLength: aiPrompt.length,
            aiTier: createPricing.tier,
            module: UsageModule.DOCS,
          },
          sourceContext: {
            type: "project",
            displayName: projectId,
          },
        });

        // Parse AI response to extract task data
        let taskData: AITaskData;
        try {
          // Clean the response - remove markdown code blocks if present
          let cleanedResponse = aiCreateResponse.text.trim();
          if (cleanedResponse.startsWith("```json")) {
            cleanedResponse = cleanedResponse.slice(7);
          }
          if (cleanedResponse.startsWith("```")) {
            cleanedResponse = cleanedResponse.slice(3);
          }
          if (cleanedResponse.endsWith("```")) {
            cleanedResponse = cleanedResponse.slice(0, -3);
          }
          cleanedResponse = cleanedResponse.trim();

          taskData = JSON.parse(cleanedResponse);

          // Validate required field
          if (!taskData.name) {
            throw new Error("Work item title is required");
          }

          // Set defaults
          taskData.status = taskData.status || WorkItemStatus.TODO;
          taskData.priority = taskData.priority || WorkItemPriority.MEDIUM;
        } catch {
          return c.json({
            success: false,
            action: {
              type: "suggest_create" as const,
              executed: false,
            },
            message: "I couldn't understand the task details. Could you please provide more specific information like task name and description?",
          } satisfies AITaskResponse);
        }

        // If autoExecute is true, create the work item directly
        if (autoExecute) {
          try {
            // Get highest position for the new work item
            const highestPositionWorkItem = await databases.listDocuments(
              DATABASE_ID,
              WORK_ITEMS_ID,
              [
                Query.equal("status", taskData.status || WorkItemStatus.TODO),
                Query.equal("workspaceId", workspaceId),
                Query.orderDesc("position"),
                Query.limit(1),
              ]
            );

            const newPosition =
              highestPositionWorkItem.documents.length > 0
                ? (highestPositionWorkItem.documents[0] as WorkItem).position + 1000
                : 1000;

            const key = await generateWorkItemKey(databases, projectId);

            const workItem = await databases.createDocument(
              DATABASE_ID,
              WORK_ITEMS_ID,
              ID.unique(),
              {
                title: taskData.name,
                description: taskData.description || "",
                type: WorkItemType.TASK,
                status: taskData.status,
                priority: taskData.priority,
                flagged: false,
                key,
                dueDate: taskData.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                endDate: taskData.endDate || undefined,
                assigneeIds: taskData.assigneeIds || [],
                labels: taskData.labels || [],
                estimatedHours: taskData.estimatedHours,
                workspaceId,
                projectId,
                position: newPosition,
              }
            );

            return c.json({
              success: true,
              action: {
                type: "create" as const,
                taskData,
                executed: true,
                result: {
                  success: true,
                  taskId: workItem.$id,
                  message: `Work item "${taskData.name}" created successfully`,
                },
              },
              message: `✅ Work item "${taskData.name}" has been created successfully!`,
              task: {
                id: workItem.$id,
                name: workItem.title as string,
                status: workItem.status as string,
              },
            } satisfies AITaskResponse);
          } catch {
            return c.json({
              success: false,
              action: {
                type: "create" as const,
                taskData,
                executed: false,
                result: {
                  success: false,
                  message: "Failed to create task",
                },
              },
              message: "Failed to create the task. Please try again.",
            } satisfies AITaskResponse);
          }
        }

        // Return suggestion for review
        // Include available members for selection - populate with actual user data
        const { users } = await createAdminClient();
        const availableMembers = (await Promise.all(
          membersResponse.documents.map(async (m) => {
            try {
              const userData = await users.get(m.userId);
              return {
                id: m.$id,
                name: userData.name || userData.email || "Unknown",
                email: userData.email,
                role: m.role,
              };
            } catch {
              return {
                id: m.$id,
                name: m.name || m.email || "Unknown",
                email: m.email,
                role: m.role,
              };
            }
          })
        ));

        // Collect suggested labels (from AI + existing project labels)
        const suggestedLabels = Array.from(new Set([
          ...(taskData.labels || []),
          ...Array.from(existingLabels),
          // Common labels
          "bug", "feature", "enhancement", "frontend", "backend", "documentation"
        ])).slice(0, 15); // Limit to 15 suggestions

        return c.json({
          success: true,
          action: {
            type: "suggest_create" as const,
            taskData,
            executed: false,
          },
          message: `I've prepared a task based on your request. Review the details and click "Create Task" to add it to your project.`,
          availableMembers,
          suggestedLabels,
        } satisfies AITaskResponse);
      } catch (error) {
        return c.json({
          error: error instanceof Error ? error.message : "Failed to process task creation"
        }, 500);
      }
    }
  )
  // Update a task using AI
  .post(
    "/update-task",
    sessionMiddleware,
    zValidator("json", aiUpdateTaskSchema),
    async (c) => {
      try {
        const user = c.get("user");
        const databases = c.get("databases");
        const { projectId, workspaceId, taskId, prompt, autoExecute } = c.req.valid("json");

        // Verify workspace membership
        const member = await getMember({
          databases,
          workspaceId,
          userId: user.$id,
        });

        if (!member) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        // Get the existing work item
        const existingTask = await databases.getDocument<WorkItem>(
          DATABASE_ID,
          WORK_ITEMS_ID,
          taskId
        );

        if (existingTask.workspaceId !== workspaceId || existingTask.projectId !== projectId) {
          return c.json({ error: "Task not found in this project" }, 404);
        }


        if (!projectDocsAI.isConfigured()) {
          return c.json(
            { error: "AI features require GEMINI_API_KEY to be configured" },
            400
          );
        }

        // Get workspace members
        const membersResponse = await databases.listDocuments<Member>(
          DATABASE_ID,
          MEMBERS_ID,
          [
            Query.equal("workspaceId", workspaceId),
            Query.limit(100),
          ]
        );

        const membersList = membersResponse.documents.map(m =>
          `- ${m.name || m.email} (ID: ${m.$id}, Role: ${m.role})`
        ).join("\n");

        // Get GitHub repository connection if exists
        const githubResponse = await databases.listDocuments(
          DATABASE_ID,
          GITHUB_REPOS_ID,
          [Query.equal("projectId", projectId), Query.limit(1)]
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const githubRepo = githubResponse.documents[0] as any;

        // Get Code Documentation if exists
        const codeDocsResponse = await databases.listDocuments(
          DATABASE_ID,
          CODE_DOCS_ID,
          [Query.equal("projectId", projectId), Query.limit(1)]
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const codeDoc = codeDocsResponse.documents[0] as any;

        // Build prompt for AI
        const aiPrompt = `You are a work item update assistant. Based on the user's request, generate the updated work item fields in JSON format.

## Current Work Item Details
- Name: ${existingTask.title}
- Description: ${existingTask.description || "No description"}
- Status: ${existingTask.status}
- Priority: ${existingTask.priority || "Not set"}
- Due Date: ${existingTask.dueDate || "Not set"}
- End Date: ${existingTask.endDate || "Not set"}
- Assignees: ${existingTask.assigneeIds?.join(", ") || "Unassigned"}
- Labels: ${existingTask.labels?.join(", ") || "None"}
- Estimated Hours: ${existingTask.estimatedHours || "Not set"}

## Available Team Members
${membersList || "No members found"}

## Valid Work Item Statuses
- TODO
- IN_PROGRESS
- IN_REVIEW
- DONE
- BLOCKED
- CLOSED

## Valid Priorities
- LOW
- MEDIUM
- HIGH
- URGENT

## User's Update Request
${prompt}

## Connected Codebase (GitHub)
${githubRepo ? `- Repository: ${githubRepo.owner}/${githubRepo.repositoryName} (${githubRepo.githubUrl})` : "No repository connected"}
${codeDoc ? `### Implementation Reference
${codeDoc.content.substring(0, 1500)}` : ""}

---

Generate a JSON object with ONLY the fields that should be updated based on the user's request:
{
  "name": "New task name (only if changing)",
  "description": "New description as structured HTML (only if changing)",
  "status": "NEW_STATUS (only if changing)",
  "priority": "NEW_PRIORITY (only if changing)",
  "dueDate": "YYYY-MM-DD (only if changing)",
  "endDate": "YYYY-MM-DD (only if changing)",
  "assigneeIds": ["member-id"] (only if changing assignee),
  "labels": ["label1"] (only if changing),
  "estimatedHours": 4 (only if changing)
}

IMPORTANT:
- If updating "description", ALWAYS use HTML tags for structure:
  - <h3>Context</h3> explaining why this task is needed.
  - <h3>Description</h3> detailing exactly what needs to be done.
  - <h3>Acceptance Criteria</h3> using a <ul> list with <li> checkbox-like items.
- Return ONLY valid JSON, no markdown code blocks
- Include ONLY fields that are being changed
- Use actual member IDs from the list for assigneeIds
- If dates are mentioned like "tomorrow", calculate from today (${new Date().toISOString().split('T')[0]})`;

        const aiUpdateResponse = await projectDocsAI.answerProjectQuestion(aiPrompt);

        // Calculate model-aware cost and log with full token data
        const updatePricing = await getAIModelPricing(databases, aiUpdateResponse.model);
        const updateCostUSD = calculateAICallCostUSD(updatePricing, aiUpdateResponse.tokenUsage.promptTokens, aiUpdateResponse.tokenUsage.completionTokens, aiUpdateResponse.tokenUsage.cachedTokens);

        logAIUsage({
          databases,
          workspaceId,
          projectId,
          model: aiUpdateResponse.model,
          promptTokens: aiUpdateResponse.tokenUsage.promptTokens,
          completionTokens: aiUpdateResponse.tokenUsage.completionTokens,
          cachedTokens: aiUpdateResponse.tokenUsage.cachedTokens,
          totalTokens: aiUpdateResponse.tokenUsage.totalTokens,
          costUSD: updateCostUSD,
          units: aiUpdateResponse.tokenUsage.totalTokens,
          metadata: {
            operation: "update_task",
            taskId,
            promptLength: aiPrompt.length,
            aiTier: updatePricing.tier,
            module: UsageModule.DOCS,
          },
          sourceContext: {
            type: "project",
            displayName: projectId,
          },
        });

        // Parse AI response
        let updateData: Partial<AITaskData>;
        try {
          let cleanedResponse = aiUpdateResponse.text.trim();
          if (cleanedResponse.startsWith("```json")) {
            cleanedResponse = cleanedResponse.slice(7);
          }
          if (cleanedResponse.startsWith("```")) {
            cleanedResponse = cleanedResponse.slice(3);
          }
          if (cleanedResponse.endsWith("```")) {
            cleanedResponse = cleanedResponse.slice(0, -3);
          }
          cleanedResponse = cleanedResponse.trim();

          updateData = JSON.parse(cleanedResponse);

          if (Object.keys(updateData).length === 0) {
            return c.json({
              success: false,
              action: {
                type: "suggest_update" as const,
                taskId,
                executed: false,
              },
              message: "I couldn't determine what changes you want to make. Please be more specific about what you'd like to update.",
            } satisfies AITaskResponse);
          }
        } catch {
          return c.json({
            success: false,
            action: {
              type: "suggest_update" as const,
              taskId,
              executed: false,
            },
            message: "I couldn't understand the update request. Please be more specific about what you'd like to change.",
          } satisfies AITaskResponse);
        }

        // If autoExecute is true, update the task directly
        if (autoExecute) {
          try {
            const updatePayload: Record<string, unknown> = {};

            if (updateData.name !== undefined) updatePayload.title = updateData.name;
            if (updateData.description !== undefined) updatePayload.description = updateData.description;
            if (updateData.status !== undefined) updatePayload.status = updateData.status;
            if (updateData.priority !== undefined) updatePayload.priority = updateData.priority;
            if (updateData.dueDate !== undefined) updatePayload.dueDate = updateData.dueDate;
            if (updateData.endDate !== undefined) updatePayload.endDate = updateData.endDate;
            if (updateData.labels !== undefined) updatePayload.labels = updateData.labels;
            if (updateData.estimatedHours !== undefined) updatePayload.estimatedHours = updateData.estimatedHours;

            if (updateData.assigneeIds && updateData.assigneeIds.length > 0) {
              updatePayload.assigneeIds = updateData.assigneeIds;
            }

            const updatedWorkItem = await databases.updateDocument(
              DATABASE_ID,
              WORK_ITEMS_ID,
              taskId,
              updatePayload
            );

            const changedFields = Object.keys(updateData).join(", ");

            return c.json({
              success: true,
              action: {
                type: "update" as const,
                taskId,
                taskData: updateData as AITaskData,
                executed: true,
                result: {
                  success: true,
                  taskId: updatedWorkItem.$id,
                  message: `Work item updated: ${changedFields}`,
                },
              },
              message: `✅ Work item "${existingTask.title}" has been updated successfully! Changed: ${changedFields}`,
              task: {
                id: updatedWorkItem.$id,
                name: updatedWorkItem.title as string,
                status: updatedWorkItem.status as string,
              },
            } satisfies AITaskResponse);
          } catch {
            return c.json({
              success: false,
              action: {
                type: "update" as const,
                taskId,
                taskData: updateData as AITaskData,
                executed: false,
                result: {
                  success: false,
                  message: "Failed to update task",
                },
              },
              message: "Failed to update the task. Please try again.",
            } satisfies AITaskResponse);
          }
        }

        // Generate suggestions for review
        const suggestions = Object.entries(updateData).map(([field, value]) => ({
          field,
          currentValue: String((existingTask as Record<string, unknown>)[field] || "Not set"),
          suggestedValue: String(value),
          reason: `Based on your request: "${prompt}"`,
        }));

        // Include available members for selection - populate with actual user data
        const { users } = await createAdminClient();
        const availableMembers = (await Promise.all(
          membersResponse.documents.map(async (m) => {
            try {
              const userData = await users.get(m.userId);
              return {
                id: m.$id,
                name: userData.name || userData.email || "Unknown",
                email: userData.email,
                role: m.role,
              };
            } catch {
              return {
                id: m.$id,
                name: m.name || m.email || "Unknown",
                email: m.email,
                role: m.role,
              };
            }
          })
        ));

        // Get existing labels from project work items for suggestions
        const projectWorkItemsResponse = await databases.listDocuments<WorkItem>(
          DATABASE_ID,
          WORK_ITEMS_ID,
          [
            Query.equal("projectId", projectId),
            Query.limit(100),
          ]
        );

        const existingProjectLabels = new Set<string>();
        projectWorkItemsResponse.documents.forEach(t => {
          if (t.labels) {
            t.labels.forEach(l => existingProjectLabels.add(l));
          }
        });

        const suggestedLabels = Array.from(new Set([
          ...(updateData.labels || []),
          ...(existingTask.labels || []),
          ...Array.from(existingProjectLabels),
          "bug", "feature", "enhancement", "frontend", "backend", "documentation"
        ])).slice(0, 15);

        // Merge existing work item data with the proposed updates
        // This ensures the preview card shows the full work item state
        const mergedTaskData: AITaskData = {
          name: updateData.name || existingTask.title,
          description: updateData.description !== undefined ? updateData.description : (existingTask.description || ""),
          status: updateData.status || existingTask.status,
          priority: updateData.priority || existingTask.priority,
          dueDate: updateData.dueDate || existingTask.dueDate,
          endDate: updateData.endDate || existingTask.endDate,
          assigneeIds: updateData.assigneeIds || existingTask.assigneeIds || [],
          labels: updateData.labels || existingTask.labels || [],
          estimatedHours: updateData.estimatedHours !== undefined ? updateData.estimatedHours : existingTask.estimatedHours,
        };

        return c.json({
          success: true,
          action: {
            type: "suggest_update" as const,
            taskId,
            taskData: mergedTaskData,
            suggestions,
            executed: false,
          },
          message: `I've prepared updates for work item "${existingTask.title}". Review the changes and click "Apply Updates" to save.`,
          availableMembers,
          suggestedLabels,
        } satisfies AITaskResponse);
      } catch (error) {
        return c.json({
          error: error instanceof Error ? error.message : "Failed to process work item update"
        }, 500);
      }
    }
  )
  // Execute a task suggestion (create or update)
  .post(
    "/execute-task",
    sessionMiddleware,
    zValidator("json", executeTaskSuggestionSchema),
    async (c) => {
      try {
        const user = c.get("user");
        const databases = c.get("databases");
        const { projectId, workspaceId, taskData, taskId } = c.req.valid("json");

        // Verify workspace membership
        const member = await getMember({
          databases,
          workspaceId,
          userId: user.$id,
        });

        if (!member) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        // If taskId is provided, this is an update
        if (taskId) {
          const existingWorkItem = await databases.getDocument<WorkItem>(
            DATABASE_ID,
            WORK_ITEMS_ID,
            taskId
          );

          if (existingWorkItem.workspaceId !== workspaceId || existingWorkItem.projectId !== projectId) {
            return c.json({ error: "Work item not found in this project" }, 404);
          }

          const updatePayload: Record<string, unknown> = {};

          if (taskData.name !== undefined) updatePayload.title = taskData.name;
          if (taskData.description !== undefined) updatePayload.description = taskData.description;
          if (taskData.status !== undefined) updatePayload.status = taskData.status;
          if (taskData.priority !== undefined) updatePayload.priority = taskData.priority;
          if (taskData.dueDate !== undefined) updatePayload.dueDate = taskData.dueDate;
          if (taskData.endDate !== undefined) updatePayload.endDate = taskData.endDate;
          if (taskData.labels !== undefined) updatePayload.labels = taskData.labels;
          if (taskData.estimatedHours !== undefined) updatePayload.estimatedHours = taskData.estimatedHours;

          if (taskData.assigneeIds && taskData.assigneeIds.length > 0) {
            updatePayload.assigneeIds = taskData.assigneeIds;
          }

          const updatedWorkItem = await databases.updateDocument(
            DATABASE_ID,
            WORK_ITEMS_ID,
            taskId,
            updatePayload
          );

          return c.json({
            success: true,
            action: {
              type: "update" as const,
              taskId,
              taskData,
              executed: true,
              result: {
                success: true,
                taskId: updatedWorkItem.$id,
                message: `Work item "${updatedWorkItem.title}" updated successfully`,
              },
            },
            message: `✅ Work item "${updatedWorkItem.title}" has been updated!`,
            task: {
              id: updatedWorkItem.$id,
              name: updatedWorkItem.title as string,
              status: updatedWorkItem.status as string,
            },
          } satisfies AITaskResponse);
        }

        // This is a create operation - name is required
        if (!taskData.name) {
          return c.json({ error: "Work item title is required for creating a work item" }, 400);
        }

        const highestPositionWorkItem = await databases.listDocuments(
          DATABASE_ID,
          WORK_ITEMS_ID,
          [
            Query.equal("status", taskData.status || WorkItemStatus.TODO),
            Query.equal("workspaceId", workspaceId),
            Query.orderDesc("position"),
            Query.limit(1),
          ]
        );

        const newPosition =
          highestPositionWorkItem.documents.length > 0
            ? (highestPositionWorkItem.documents[0] as WorkItem).position + 1000
            : 1000;

        const key = await generateWorkItemKey(databases, projectId);

        const workItem = await databases.createDocument(
          DATABASE_ID,
          WORK_ITEMS_ID,
          ID.unique(),
          {
            title: taskData.name,
            description: taskData.description || "",
            type: WorkItemType.TASK,
            status: taskData.status || WorkItemStatus.TODO,
            priority: taskData.priority || WorkItemPriority.MEDIUM,
            flagged: false,
            key,
            dueDate: taskData.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default to 1 week from now
            endDate: taskData.endDate || undefined,
            assigneeIds: taskData.assigneeIds || [],
            labels: taskData.labels || [],
            estimatedHours: taskData.estimatedHours,
            workspaceId,
            projectId,
            position: newPosition,
          }
        );

        return c.json({
          success: true,
          action: {
            type: "create" as const,
            taskData,
            executed: true,
            result: {
              success: true,
              taskId: workItem.$id,
              message: `Work item "${taskData.name}" created successfully`,
            },
          },
          message: `✅ Work item "${taskData.name}" has been created!`,
          task: {
            id: workItem.$id,
            name: workItem.title as string,
            status: workItem.status as string,
          },
        } satisfies AITaskResponse);
      } catch (error) {
        return c.json({
          error: error instanceof Error ? error.message : "Failed to execute work item operation"
        }, 500);
      }
    }
  );

export default app;
