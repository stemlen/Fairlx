import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ID, Query, Storage as StorageType, Databases } from "node-appwrite";

import { sessionMiddleware } from "@/lib/session-middleware";
import { createAdminClient } from "@/lib/appwrite";
import { trackUsage, estimateTokens, createIdempotencyKey } from "@/lib/track-usage";
import { ResourceType, UsageSource, UsageModule } from "@/features/usage/types";
import {
  DATABASE_ID,
  PROJECT_DOCS_ID,
  PROJECT_DOCS_BUCKET_ID,
  PROJECTS_ID,
  WORK_ITEMS_ID,
  MEMBERS_ID,
} from "@/config";
import { getMember } from "@/features/members/utils";
import { Member } from "@/features/members/types";
import { ProjectDocsAI } from "../lib/project-docs-ai";
import { ProjectDocument } from "../types";
import { WorkItem, WorkItemStatus, WorkItemPriority, WorkItemType } from "@/features/sprints/types";
import { Project } from "@/features/projects/types";
import {
  ProjectAIContext,
  DocumentContext,
  TaskContext,
  MemberContext,
  ProjectAIAnswer,
  AITaskData,
  AITaskResponse,
} from "../types/ai-context";

// Generate unique work item key
async function generateWorkItemKey(
  databases: Databases,
  projectId: string
): Promise<string> {
  const project = await databases.getDocument(
    DATABASE_ID,
    PROJECTS_ID,
    projectId
  ) as Project;

  // Get project prefix (first 3-4 letters of project name in uppercase)
  const prefix = project.name
    .replace(/[^a-zA-Z]/g, "")
    .substring(0, 4)
    .toUpperCase() || "PROJ";

  // Get all work items for this project to find the highest key number
  const workItems = await databases.listDocuments(
    DATABASE_ID,
    WORK_ITEMS_ID,
    [
      Query.equal("projectId", projectId),
      Query.orderDesc("$createdAt"),
      Query.limit(100), // Get more items to find the highest number
    ]
  );

  // Extract key numbers and find the highest one
  let highestNumber = 0;
  const keyPattern = new RegExp(`^${prefix}-(\\d+)$`);

  for (const item of workItems.documents as unknown as WorkItem[]) {
    if (item.key) {
      const match = item.key.match(keyPattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highestNumber) {
          highestNumber = num;
        }
      }
    }
  }

  // If no items found, also check the total count as a fallback
  if (highestNumber === 0) {
    highestNumber = workItems.total;
  }

  const nextNumber = highestNumber + 1;
  return `${prefix}-${nextNumber}`;
}

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

// Schema for AI task creation
const aiCreateTaskSchema = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
  prompt: z.string().min(5).max(2000),
  autoExecute: z.boolean().optional().default(false),
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
  storage: StorageType,
  bucketId: string,
  fileId: string,
  mimeType: string
): Promise<string> {
  try {
    // For now, we'll fetch the raw file content
    // In production, you'd want to use a PDF parsing library like pdf-parse
    const fileBuffer = await storage.getFileDownload(bucketId, fileId);

    // If it's a text-based file, convert to string
    if (
      mimeType.includes("text/") ||
      mimeType.includes("application/json") ||
      mimeType.includes("application/xml")
    ) {
      const decoder = new TextDecoder("utf-8");
      return decoder.decode(fileBuffer);
    }

    // For PDFs and other binary formats, we'd need specialized parsing
    // For now, return a placeholder indicating the document exists
    if (mimeType.includes("pdf")) {
      return "[PDF Document - Content available for AI analysis]";
    }

    if (mimeType.includes("word") || mimeType.includes("document")) {
      return "[Word Document - Content available for AI analysis]";
    }

    return "[Document content not extractable]";
  } catch (error) {
    console.error("Error extracting document text:", error);
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
            Query.limit(50), // Limit for performance
          ]
        );

        // Get project work items (replaces tasks)
        const workItemsResponse = await databases.listDocuments<WorkItem>(
          DATABASE_ID,
          WORK_ITEMS_ID,
          [
            Query.equal("projectId", projectId),
            Query.equal("workspaceId", workspaceId),
            Query.limit(100), // Limit for performance
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
              name: doc.name,
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
        console.error("Error fetching AI context:", error);
        return c.json({ error: "Failed to fetch AI context" }, 500);
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

        // Initialize Project Docs AI
        const projectDocsAI = new ProjectDocsAI();

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

        // Get project work items
        const workItemsResponse = await databases.listDocuments<WorkItem>(
          DATABASE_ID,
          WORK_ITEMS_ID,
          [
            Query.equal("projectId", projectId),
            Query.equal("workspaceId", workspaceId),
            Query.limit(50), // Limit for AI context
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
${extractedText.slice(0, 5000)}
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

          return `- **${workItem.title}** [${workItem.status}] ${workItem.priority ? `(${workItem.priority})` : ""} | Assigned to: ${assigneeDisplay} | Due: ${dueDateDisplay} | Labels: ${workItem.labels?.join(", ") || "None"} | Est. Hours: ${workItem.estimatedHours || "Not set"} - ${workItem.description?.slice(0, 200) || "No description"}`;
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

## Project Documents
${documentContexts.join("\n---\n") || "No documents uploaded yet."}

## Project Tasks
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
        const answer = await projectDocsAI.answerProjectQuestion(prompt);

        // Track usage for DOCS AI question (non-blocking)
        trackUsage({
          workspaceId,
          projectId,
          module: UsageModule.DOCS,
          resourceType: ResourceType.COMPUTE,
          units: 1,
          source: UsageSource.AI,
          metadata: {
            operation: "ask_question",
            promptLength: prompt.length,
            answerLength: answer.length,
            tokensEstimate: estimateTokens(prompt + answer),
            documentsUsed: docsResponse.documents.length,
          },
          idempotencyKey: createIdempotencyKey(UsageModule.DOCS, "ask", projectId),
        });

        const response: ProjectAIAnswer = {
          question,
          answer,
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
        console.error("Error answering question:", error);
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
        const { projectId, workspaceId, prompt, autoExecute } = c.req.valid("json");

        // Verify workspace membership
        const member = await getMember({
          databases,
          workspaceId,
          userId: user.$id,
        });

        if (!member) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        // Initialize Project Docs AI
        const projectDocsAI = new ProjectDocsAI();

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

        // Get existing work items for context
        const workItemsResponse = await databases.listDocuments<WorkItem>(
          DATABASE_ID,
          WORK_ITEMS_ID,
          [
            Query.equal("projectId", projectId),
            Query.equal("workspaceId", workspaceId),
            Query.limit(20),
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

## Available Team Members
${membersList || "No members found"}

## Existing Work Items (for context)
${tasksList || "No existing work items"}

## Existing Labels in Project
${existingLabelsList || "No existing labels"}

## Valid Work Item Statuses
- TODO
- IN_PROGRESS
- IN_REVIEW
- DONE
- BLOCKED

## Valid Priorities
- LOW
- MEDIUM
- HIGH
- URGENT

## Common Label Categories (use these as inspiration)
- Type: bug, feature, enhancement, documentation, refactor, testing
- Area: frontend, backend, api, database, ui, ux, security, performance
- Effort: quick-win, complex, needs-research
- Other: urgent, blocked, review-needed

## User Request
${prompt}

---

Generate a JSON object with the following structure (only include fields that are relevant):
{
  "name": "Work item title (required, be specific and actionable)",
  "description": "Detailed work item description",
  "status": "TODO",
  "priority": "MEDIUM",
  "dueDate": "YYYY-MM-DD (if mentioned or can be inferred)",
  "endDate": "YYYY-MM-DD (if mentioned)",
  "assigneeIds": ["member-id-1"] (only if specific assignee mentioned by name),
  "labels": ["label1", "label2"] (ALWAYS suggest 1-3 relevant labels based on work item type/category),
  "estimatedHours": 4 (if time estimate is mentioned)
}

IMPORTANT: 
- Return ONLY valid JSON, no markdown code blocks
- Use actual member IDs from the list above for assigneeIds (only if user mentions a specific person)
- Make the work item title clear and actionable
- ALWAYS generate relevant labels based on the work item type (e.g., "bug" for bugs, "feature" for features, "frontend"/"backend" for technical tasks)
- Prefer existing labels from the project when applicable
- If dates are mentioned like "tomorrow" or "next week", calculate the actual date from today (${new Date().toISOString().split('T')[0]})
- Default status to "TODO" if not specified
- Default priority to "MEDIUM" if not specified`;

        const aiResponse = await projectDocsAI.answerProjectQuestion(aiPrompt);

        // Track usage for DOCS AI task creation (non-blocking)
        trackUsage({
          workspaceId,
          projectId,
          module: UsageModule.DOCS,
          resourceType: ResourceType.COMPUTE,
          units: 1,
          source: UsageSource.AI,
          metadata: {
            operation: "create_task",
            promptLength: aiPrompt.length,
            responseLength: aiResponse.length,
            tokensEstimate: estimateTokens(aiPrompt + aiResponse),
          },
          idempotencyKey: createIdempotencyKey(UsageModule.DOCS, "create_task", projectId),
        });

        // Parse AI response to extract task data
        let taskData: AITaskData;
        try {
          // Clean the response - remove markdown code blocks if present
          let cleanedResponse = aiResponse.trim();
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
        } catch (parseError) {
          console.error("Failed to parse AI response:", parseError, aiResponse);
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
          } catch (createError) {
            console.error("Failed to create task:", createError);
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
        console.error("Error creating task via AI:", error);
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

        // Initialize Project Docs AI
        const projectDocsAI = new ProjectDocsAI();

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

---

Generate a JSON object with ONLY the fields that should be updated based on the user's request:
{
  "name": "New task name (only if changing)",
  "description": "New description (only if changing)",
  "status": "NEW_STATUS (only if changing)",
  "priority": "NEW_PRIORITY (only if changing)",
  "dueDate": "YYYY-MM-DD (only if changing)",
  "endDate": "YYYY-MM-DD (only if changing)",
  "assigneeIds": ["member-id"] (only if changing assignee),
  "labels": ["label1"] (only if changing),
  "estimatedHours": 4 (only if changing)
}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- Include ONLY fields that are being changed
- Use actual member IDs from the list for assigneeIds
- If dates are mentioned like "tomorrow", calculate from today (${new Date().toISOString().split('T')[0]})`;

        const aiResponse = await projectDocsAI.answerProjectQuestion(aiPrompt);

        // Track usage for DOCS AI task update (non-blocking)
        trackUsage({
          workspaceId,
          projectId,
          module: UsageModule.DOCS,
          resourceType: ResourceType.COMPUTE,
          units: 1,
          source: UsageSource.AI,
          metadata: {
            operation: "update_task",
            taskId,
            promptLength: aiPrompt.length,
            responseLength: aiResponse.length,
            tokensEstimate: estimateTokens(aiPrompt + aiResponse),
          },
          idempotencyKey: createIdempotencyKey(UsageModule.DOCS, `update_task_${taskId}`, projectId),
        });

        // Parse AI response
        let updateData: Partial<AITaskData>;
        try {
          let cleanedResponse = aiResponse.trim();
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
        } catch (parseError) {
          console.error("Failed to parse AI response:", parseError, aiResponse);
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
          } catch (updateError) {
            console.error("Failed to update work item:", updateError);
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
        console.error("Error updating work item via AI:", error);
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
        console.error("Error executing work item operation:", error);
        return c.json({
          error: error instanceof Error ? error.message : "Failed to execute work item operation"
        }, 500);
      }
    }
  );

export default app;
