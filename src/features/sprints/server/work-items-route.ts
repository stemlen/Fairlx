import { ID, Query } from "node-appwrite";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { DATABASE_ID, WORK_ITEMS_ID, PROJECTS_ID, MEMBERS_ID } from "@/config";
import { sessionMiddleware } from "@/lib/session-middleware";
import { createAdminClient } from "@/lib/appwrite";

import { getMember } from "@/features/members/utils";
import { Project } from "@/features/projects/types";
import { logComputeUsage, getComputeUnits } from "@/lib/usage-metering";

import {
  createWorkItemSchema,
  updateWorkItemSchema,
  bulkMoveWorkItemsSchema,
  reorderWorkItemsSchema,
  splitWorkItemSchema,
} from "../schemas";
import {
  WorkItem,
  WorkItemType,
  WorkItemStatus,
  WorkItemPriority,
  PopulatedWorkItem,
} from "../types";

// Generate unique work item key
async function generateWorkItemKey(
  databases: Awaited<ReturnType<typeof createAdminClient>>["databases"],
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
  const workItems = await databases.listDocuments<WorkItem>(
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

  for (const item of workItems.documents) {
    const match = item.key.match(keyPattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > highestNumber) {
        highestNumber = num;
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

const app = new Hono()
  // Get work items with filters
  .get(
    "/",
    sessionMiddleware,
    zValidator(
      "query",
      z.object({
        workspaceId: z.string(),
        projectId: z.string().optional(),
        sprintId: z.string().optional().nullable(),
        type: z.union([z.nativeEnum(WorkItemType), z.string()]).optional(),
        status: z.union([z.nativeEnum(WorkItemStatus), z.string()]).optional(),
        priority: z.union([z.nativeEnum(WorkItemPriority), z.string()]).optional(),
        assigneeId: z.string().optional(),
        epicId: z.string().optional().nullable(),
        parentId: z.string().optional().nullable(),
        flagged: z.string().transform(val => val === "true").optional(),
        search: z.string().optional(),
        includeChildren: z.string().transform(val => val === "true").optional(),
        limit: z.coerce.number().min(1).max(1000).optional(),
      })
    ),
    async (c) => {
      const { users } = await createAdminClient();
      const databases = c.get("databases");
      const user = c.get("user");

      const {
        workspaceId,
        projectId,
        sprintId,
        type,
        status,
        priority,
        assigneeId,
        epicId,
        parentId,
        flagged,
        search,
        includeChildren,
        limit,
      } = c.req.valid("query");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const query = [
        Query.equal("workspaceId", workspaceId),
        Query.orderAsc("position"),
      ];

      if (projectId) {
        query.push(Query.equal("projectId", projectId));
      }

      if (sprintId !== undefined) {
        if (sprintId === null || sprintId === "null") {
          query.push(Query.isNull("sprintId"));
        } else {
          query.push(Query.equal("sprintId", sprintId));
        }
      }

      if (type) {
        query.push(Query.equal("type", type));
      }

      if (status) {
        query.push(Query.equal("status", status));
      }

      if (priority) {
        query.push(Query.equal("priority", priority));
      }

      if (assigneeId) {
        query.push(Query.equal("assigneeIds", assigneeId));
      }

      if (epicId !== undefined) {
        if (epicId === null || epicId === "null") {
          query.push(Query.isNull("epicId"));
        } else {
          query.push(Query.equal("epicId", epicId));
        }
      }

      if (parentId !== undefined) {
        if (parentId === null || parentId === "null") {
          query.push(Query.isNull("parentId"));
        } else {
          query.push(Query.equal("parentId", parentId));
        }
      }

      if (flagged) {
        query.push(Query.equal("flagged", true));
      }

      if (search) {
        query.push(Query.search("title", search));
      }

      if (limit) {
        query.push(Query.limit(limit));
      }

      const workItems = await databases.listDocuments<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        query
      );

      // Populate assignees and related items
      // First, collect all unique assignee IDs from all work items
      const allAssigneeIds = new Set<string>();
      workItems.documents.forEach((workItem) => {
        if (workItem.assigneeIds && Array.isArray(workItem.assigneeIds)) {
          workItem.assigneeIds.forEach(id => {
            if (id && typeof id === 'string') {
              allAssigneeIds.add(id);
            }
          });
        }
      });

      // Fetch all members at once (assigneeIds are member document IDs)
      const membersData = allAssigneeIds.size > 0
        ? await databases.listDocuments(
          DATABASE_ID,
          MEMBERS_ID,
          [Query.equal("$id", Array.from(allAssigneeIds))]
        )
        : { documents: [] };

      // Build a map of member ID -> user data for quick lookup
      const assigneeMap = new Map<string, { $id: string; name: string; email: string; profileImageUrl: string | null }>();

      await Promise.all(
        membersData.documents.map(async (member) => {
          try {
            const user = await users.get(member.userId);
            assigneeMap.set(member.$id, {
              $id: member.$id,
              name: user.name || user.email,
              email: user.email,
              profileImageUrl: user.prefs?.profileImageUrl || null,
            });
          } catch {
            // User not found - skip this member
          }
        })
      );

      const populatedWorkItems = await Promise.all(
        workItems.documents.map(async (workItem) => {
          // Get assignees from the pre-built map
          const assignees = (workItem.assigneeIds || [])
            .map(id => assigneeMap.get(id))
            .filter((a): a is NonNullable<typeof a> => a !== null);

          let epic = null;
          if (workItem.epicId) {
            try {
              const epicDoc = await databases.getDocument<WorkItem>(
                DATABASE_ID,
                WORK_ITEMS_ID,
                workItem.epicId
              );
              epic = {
                $id: epicDoc.$id,
                key: epicDoc.key,
                title: epicDoc.title,
              };
            } catch {
              // Epic might be deleted
            }
          }

          let parent = null;
          if (workItem.parentId) {
            try {
              const parentDoc = await databases.getDocument<WorkItem>(
                DATABASE_ID,
                WORK_ITEMS_ID,
                workItem.parentId
              );
              parent = {
                $id: parentDoc.$id,
                key: parentDoc.key,
                title: parentDoc.title,
              };
            } catch {
              // Parent might be deleted
            }
          }

          // Populate project data
          let project = null;
          if (workItem.projectId) {
            try {
              const projectDoc = await databases.getDocument<Project>(
                DATABASE_ID,
                PROJECTS_ID,
                workItem.projectId
              );
              project = {
                $id: projectDoc.$id,
                name: projectDoc.name,
                imageUrl: projectDoc.imageUrl,
              };
            } catch {
              // Project might be deleted
            }
          }

          const children = await databases.listDocuments(
            DATABASE_ID,
            WORK_ITEMS_ID,
            [Query.equal("parentId", workItem.$id)]
          );

          let childrenData = undefined;
          if (includeChildren && children.total > 0) {
            childrenData = children.documents as PopulatedWorkItem[];
          }

          return {
            ...workItem,
            assignees,
            epic,
            parent,
            project,
            childrenCount: children.total,
            children: childrenData,
          };
        })
      );

      return c.json({
        data: {
          ...workItems,
          documents: populatedWorkItems,
        },
      });
    }
  )
  // Get epics (work items of type EPIC)
  .get(
    "/epics",
    sessionMiddleware,
    zValidator(
      "query",
      z.object({
        workspaceId: z.string(),
        projectId: z.string().optional(),
      })
    ),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");

      const { workspaceId, projectId } = c.req.valid("query");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const query = [
        Query.equal("workspaceId", workspaceId),
        Query.equal("type", WorkItemType.EPIC),
        Query.orderDesc("$createdAt"),
      ];

      if (projectId) {
        query.push(Query.equal("projectId", projectId));
      }

      const epics = await databases.listDocuments<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        query
      );

      return c.json({ data: epics });
    }
  )
  // Get a single work item
  .get(
    "/:workItemId",
    sessionMiddleware,
    async (c) => {
      const { users } = await createAdminClient();
      const databases = c.get("databases");
      const user = c.get("user");
      const { workItemId } = c.req.param();

      const workItem = await databases.getDocument<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        workItemId
      );

      const member = await getMember({
        databases,
        workspaceId: workItem.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Populate assignees - assigneeIds are member document IDs
      const membersData = workItem.assigneeIds && workItem.assigneeIds.length > 0
        ? await databases.listDocuments(
          DATABASE_ID,
          MEMBERS_ID,
          [Query.equal("$id", workItem.assigneeIds)]
        )
        : { documents: [] };

      const assignees = (await Promise.all(
        membersData.documents.map(async (memberDoc) => {
          try {
            const userInfo = await users.get(memberDoc.userId);
            return {
              $id: memberDoc.$id,
              name: userInfo.name || userInfo.email,
              email: userInfo.email,
              profileImageUrl: userInfo.prefs?.profileImageUrl || null,
            };
          } catch {
            return null;
          }
        })
      )).filter((a): a is NonNullable<typeof a> => a !== null);

      let epic = null;
      if (workItem.epicId) {
        try {
          const epicDoc = await databases.getDocument<WorkItem>(
            DATABASE_ID,
            WORK_ITEMS_ID,
            workItem.epicId
          );
          epic = {
            $id: epicDoc.$id,
            key: epicDoc.key,
            title: epicDoc.title,
          };
        } catch {
          // Epic might be deleted
        }
      }

      let parent = null;
      if (workItem.parentId) {
        try {
          const parentDoc = await databases.getDocument<WorkItem>(
            DATABASE_ID,
            WORK_ITEMS_ID,
            workItem.parentId
          );
          parent = {
            $id: parentDoc.$id,
            key: parentDoc.key,
            title: parentDoc.title,
          };
        } catch {
          // Parent might be deleted
        }
      }

      // Get children
      const children = await databases.listDocuments<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        [Query.equal("parentId", workItem.$id), Query.orderAsc("position")]
      );

      return c.json({
        data: {
          ...workItem,
          assignees,
          epic,
          parent,
          childrenCount: children.total,
          children: children.documents,
        },
      });
    }
  )
  // Create a new work item
  .post(
    "/",
    sessionMiddleware,
    zValidator("json", createWorkItemSchema),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");

      const data = c.req.valid("json");

      const member = await getMember({
        databases,
        workspaceId: data.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Determine the target sprint:
      // If sprintId is explicitly provided, use it. Otherwise, leave as null (backlog).
      // We explicitly REMOVED the auto-assignment to active sprint logic here to ensure
      // items created in the Backlog section stay in the Backlog.
      const targetSprintId = data.sprintId || null;

      // Get the highest position
      const queryFilters = [
        Query.equal("projectId", data.projectId),
        Query.orderDesc("position"),
        Query.limit(1),
      ];

      if (targetSprintId) {
        queryFilters.push(Query.equal("sprintId", targetSprintId));
      } else {
        queryFilters.push(Query.isNull("sprintId"));
      }

      const workItems = await databases.listDocuments(
        DATABASE_ID,
        WORK_ITEMS_ID,
        queryFilters
      );

      const highestPosition =
        workItems.documents.length > 0 ? workItems.documents[0].position : 0;

      // Retry logic for work item creation in case of key conflicts
      let workItem: WorkItem | null = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (!workItem && attempts < maxAttempts) {
        attempts++;

        try {
          // Generate unique key
          const key = await generateWorkItemKey(databases, data.projectId);

          workItem = await databases.createDocument<WorkItem>(
            DATABASE_ID,
            WORK_ITEMS_ID,
            ID.unique(),
            {
              ...data,
              key,
              position: highestPosition + 1000,
              dueDate: data.dueDate?.toISOString(),
              sprintId: targetSprintId,
            }
          );
        } catch (error: unknown) {
          // If it's a conflict error (duplicate key) and we haven't exceeded max attempts, retry
          const isConflictError =
            error &&
            typeof error === 'object' &&
            (('code' in error && error.code === 409) ||
              ('type' in error && (error as { type?: string }).type === 'document_already_exists'));

          if (isConflictError && attempts < maxAttempts) {
            // Wait a bit before retrying to reduce collision chance
            await new Promise(resolve => setTimeout(resolve, 100 * attempts));
            continue;
          }
          // If it's a different error or we've exceeded max attempts, throw
          console.error('Failed to create work item:', error);
          throw error;
        }
      }

      if (!workItem) {
        return c.json({ error: "Failed to create work item after multiple attempts" }, 500);
      }

      // Log usage for work item creation
      logComputeUsage({
        databases,
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        units: getComputeUnits('task_create'),
        jobType: 'task_create',
        metadata: { workItemId: workItem.$id, type: data.type },
      });

      return c.json({ data: workItem });
    }
  )
  // Update a work item
  .patch(
    "/:workItemId",
    sessionMiddleware,
    zValidator("json", updateWorkItemSchema),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");
      const { workItemId } = c.req.param();

      const workItem = await databases.getDocument<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        workItemId
      );

      const member = await getMember({
        databases,
        workspaceId: workItem.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const updates = c.req.valid("json");

      const updateData = {
        ...updates,
        dueDate: updates.dueDate?.toISOString(),
      };
      (updateData as Record<string, unknown>).lastModifiedBy = user.$id;

      const updatedWorkItem = await databases.updateDocument<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        workItemId,
        updateData
      );

      // Log usage for work item update
      logComputeUsage({
        databases,
        workspaceId: workItem.workspaceId,
        projectId: workItem.projectId,
        units: getComputeUnits('task_update'),
        jobType: 'task_update',
        metadata: { workItemId, updatedFields: Object.keys(updates) },
      });

      return c.json({ data: updatedWorkItem });
    }
  )
  // Delete a work item
  .delete(
    "/:workItemId",
    sessionMiddleware,
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");
      const { workItemId } = c.req.param();

      const workItem = await databases.getDocument<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        workItemId
      );

      const member = await getMember({
        databases,
        workspaceId: workItem.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Delete all children (subtasks)
      const children = await databases.listDocuments(
        DATABASE_ID,
        WORK_ITEMS_ID,
        [Query.equal("parentId", workItemId)]
      );

      await Promise.all(
        children.documents.map((child) =>
          databases.deleteDocument(DATABASE_ID, WORK_ITEMS_ID, child.$id)
        )
      );

      await databases.deleteDocument(DATABASE_ID, WORK_ITEMS_ID, workItemId);

      // Log usage for work item deletion
      logComputeUsage({
        databases,
        workspaceId: workItem.workspaceId,
        projectId: workItem.projectId,
        units: getComputeUnits('task_delete'),
        jobType: 'task_delete',
        metadata: { workItemId, deletedChildren: children.total },
      });

      return c.json({ data: { $id: workItem.$id } });
    }
  )
  // Bulk delete work items
  .post(
    "/bulk-delete",
    sessionMiddleware,
    zValidator(
      "json",
      z.object({
        workItemIds: z.array(z.string()),
      })
    ),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");

      const { workItemIds } = c.req.valid("json");

      if (workItemIds.length === 0) {
        return c.json({ data: { count: 0 } });
      }

      // Verify user has access to the first work item (assume same workspace)
      const firstWorkItem = await databases.getDocument<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        workItemIds[0]
      );

      const member = await getMember({
        databases,
        workspaceId: firstWorkItem.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Delete items and their children
      // We'll do this in parallel chunks to avoid overwhelming the server if many items
      const deleteItem = async (id: string) => {
        try {
          // Find children first
          const children = await databases.listDocuments(
            DATABASE_ID,
            WORK_ITEMS_ID,
            [Query.equal("parentId", id)]
          );

          // Delete children
          await Promise.all(
            children.documents.map(child =>
              databases.deleteDocument(DATABASE_ID, WORK_ITEMS_ID, child.$id)
            )
          );

          // Delete the item itself
          await databases.deleteDocument(DATABASE_ID, WORK_ITEMS_ID, id);
        } catch (error) {
          console.error(`Failed to delete item ${id}`, error);
          // Continue with other items
        }
      };

      await Promise.all(workItemIds.map(deleteItem));

      return c.json({ data: { count: workItemIds.length } });
    }
  )
  // Bulk move work items to a sprint
  .post(
    "/bulk-move",
    sessionMiddleware,
    zValidator("json", bulkMoveWorkItemsSchema),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");

      const { workItemIds, sprintId } = c.req.valid("json");

      // Verify user has access to the first work item (assume same workspace)
      const firstWorkItem = await databases.getDocument<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        workItemIds[0]
      );

      const member = await getMember({
        databases,
        workspaceId: firstWorkItem.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const updatedItems = await Promise.all(
        workItemIds.map((id) =>
          databases.updateDocument(DATABASE_ID, WORK_ITEMS_ID, id, {
            sprintId,
            lastModifiedBy: user.$id,
          })
        )
      );

      return c.json({ data: updatedItems });
    }
  )
  // Reorder work items
  .post(
    "/reorder",
    sessionMiddleware,
    zValidator("json", reorderWorkItemsSchema),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");

      const { workItemId, newPosition, sprintId } = c.req.valid("json");

      const workItem = await databases.getDocument<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        workItemId
      );

      const member = await getMember({
        databases,
        workspaceId: workItem.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const updateData: Partial<WorkItem> = { position: newPosition };
      if (sprintId !== undefined) {
        updateData.sprintId = sprintId;
      }
      (updateData as Record<string, unknown>).lastModifiedBy = user.$id;

      const updatedWorkItem = await databases.updateDocument<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        workItemId,
        updateData
      );

      return c.json({ data: updatedWorkItem });
    }
  )
  // Split work item
  .post(
    "/split",
    sessionMiddleware,
    zValidator("json", splitWorkItemSchema),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");

      const { originalWorkItemId, newWorkItems } = c.req.valid("json");

      const originalWorkItem = await databases.getDocument<WorkItem>(
        DATABASE_ID,
        WORK_ITEMS_ID,
        originalWorkItemId
      );

      const member = await getMember({
        databases,
        workspaceId: originalWorkItem.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Create new work items
      const createdItems = await Promise.all(
        newWorkItems.map(async (item, index) => {
          const key = await generateWorkItemKey(
            databases,
            originalWorkItem.projectId
          );

          return databases.createDocument<WorkItem>(
            DATABASE_ID,
            WORK_ITEMS_ID,
            ID.unique(),
            {
              title: item.title,
              key,
              type: originalWorkItem.type,
              status: originalWorkItem.status,
              priority: originalWorkItem.priority,
              storyPoints: item.storyPoints,
              workspaceId: originalWorkItem.workspaceId,
              projectId: originalWorkItem.projectId,
              sprintId: originalWorkItem.sprintId,
              epicId: originalWorkItem.epicId,
              assigneeIds: originalWorkItem.assigneeIds,
              flagged: false,
              position: originalWorkItem.position + (index + 1) * 100,
              labels: originalWorkItem.labels,
            }
          );
        })
      );

      return c.json({ data: { original: originalWorkItem, created: createdItems } });
    }
  );

export default app;
