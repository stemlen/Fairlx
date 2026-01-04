import { zValidator } from "@hono/zod-validator";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { Hono } from "hono";
import { ID, Query } from "node-appwrite";
import { z } from "zod";

import {
  DATABASE_ID,
  IMAGES_BUCKET_ID,
  MEMBERS_ID,
  PROJECTS_ID,
  TASKS_ID,
  TIME_LOGS_ID,
  WORKSPACES_ID,
  CUSTOM_COLUMNS_ID,
  DEFAULT_COLUMN_SETTINGS_ID,
} from "@/config";
import { sessionMiddleware } from "@/lib/session-middleware";
import { generateInviteCode } from "@/lib/utils";

import { MemberRole } from "@/features/members/types";
import { getMember } from "@/features/members/utils";
import { TaskStatus } from "@/features/tasks/types";

import { createWorkspaceSchema, updateWorkspaceSchema } from "../schemas";
import { Workspace } from "../types";

const app = new Hono()
  .get("/", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const databases = c.get("databases");

    const members = await databases.listDocuments(DATABASE_ID, MEMBERS_ID, [
      Query.equal("userId", user.$id),
    ]);

    if (members.total === 0) {
      return c.json({ data: { documents: [], total: 0 } });
    }

    const workspaceIds = members.documents.map((member) => member.workspaceId);

    const workspaces = await databases.listDocuments(
      DATABASE_ID,
      WORKSPACES_ID,
      [Query.orderDesc("$createdAt"), Query.contains("$id", workspaceIds)]
    );

    return c.json({ data: workspaces });
  })
  .get("/:workspaceId", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const databases = c.get("databases");
    const { workspaceId } = c.req.param();

    const member = await getMember({
      databases,
      workspaceId,
      userId: user.$id,
    });

    if (!member) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const workspace = await databases.getDocument<Workspace>(
      DATABASE_ID,
      WORKSPACES_ID,
      workspaceId
    );

    return c.json({ data: workspace });
  })
  .get("/:workspaceId/info", sessionMiddleware, async (c) => {
    const databases = c.get("databases");
    const { workspaceId } = c.req.param();

    const workspace = await databases.getDocument<Workspace>(
      DATABASE_ID,
      WORKSPACES_ID,
      workspaceId
    );

    return c.json({
      data: {
        $id: workspace.$id,
        name: workspace.name,
        imageUrl: workspace.imageUrl,
      },
    });
  })
  .post(
    "/",
    zValidator("form", createWorkspaceSchema),
    sessionMiddleware,
    async (c) => {
      const databases = c.get("databases");
      const storage = c.get("storage");
      const user = c.get("user");

      const { name, image } = c.req.valid("form");

      // Validate workspace limit
      const { validateWorkspaceCreation } = await import("@/features/members/utils");
      const accountType = (user.prefs?.accountType as "PERSONAL" | "ORG") || "PERSONAL";

      const validation = await validateWorkspaceCreation({
        databases,
        userId: user.$id,
        accountType,
      });

      if (!validation.allowed) {
        return c.json({ error: validation.reason || "Cannot create workspace" }, 403);
      }

      let uploadedImageUrl: string | undefined;

      if (image instanceof File) {
        const file = await storage.createFile(
          IMAGES_BUCKET_ID,
          ID.unique(),
          image
        );

        const arrayBuffer = await storage.getFilePreview(
          IMAGES_BUCKET_ID,
          file.$id
        );

        uploadedImageUrl = `data:image/png;base64,${Buffer.from(
          arrayBuffer
        ).toString("base64")}`;
      }

      // Get ORG ID
      const prefs = user.prefs || {};
      const primaryOrganizationId = prefs.primaryOrganizationId as string | undefined;

      // Check if first workspace
      const existingMembers = await databases.listDocuments(DATABASE_ID, MEMBERS_ID, [
        Query.equal("userId", user.$id),
      ]);
      const isFirstWorkspace = existingMembers.total === 0;

      const workspace = await databases.createDocument(
        DATABASE_ID,
        WORKSPACES_ID,
        ID.unique(),
        {
          name,
          userId: user.$id,
          imageUrl: uploadedImageUrl,
          inviteCode: generateInviteCode(6),
          // Link organization
          organizationId: accountType === "ORG" ? primaryOrganizationId : null,
          isDefault: isFirstWorkspace,
          billingScope: accountType === "ORG" ? "organization" : "user",
        }
      );

      // Grant initial role
      await databases.createDocument(DATABASE_ID, MEMBERS_ID, ID.unique(), {
        userId: user.$id,
        workspaceId: workspace.$id,
        role: isFirstWorkspace ? MemberRole.OWNER : MemberRole.ADMIN,
      });

      return c.json({ data: workspace });
    }
  )
  .patch(
    "/:workspaceId",
    sessionMiddleware,
    zValidator("form", updateWorkspaceSchema),
    async (c) => {
      const databases = c.get("databases");
      const storage = c.get("storage");
      const user = c.get("user");

      const { workspaceId } = c.req.param();
      const { name, image } = c.req.valid("form");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      // Verify update permissions
      if (!member || (member.role !== MemberRole.ADMIN && member.role !== MemberRole.OWNER)) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      let uploadedImageUrl: string | undefined;

      if (image instanceof File) {
        const file = await storage.createFile(
          IMAGES_BUCKET_ID,
          ID.unique(),
          image
        );

        const arrayBuffer = await storage.getFilePreview(
          IMAGES_BUCKET_ID,
          file.$id
        );

        uploadedImageUrl = `data:image/png;base64,${Buffer.from(
          arrayBuffer
        ).toString("base64")}`;
      } else {
        uploadedImageUrl = image;
      }

      const updateData = { name, imageUrl: uploadedImageUrl };
      (updateData as Record<string, unknown>).lastModifiedBy = user.$id;

      const workspace = await databases.updateDocument(
        DATABASE_ID,
        WORKSPACES_ID,
        workspaceId,
        updateData
      );

      return c.json({ data: workspace });
    }
  )
  .delete("/:workspaceId", sessionMiddleware, async (c) => {
    const databases = c.get("databases");
    const user = c.get("user");

    const { workspaceId } = c.req.param();

    const member = await getMember({
      databases,
      workspaceId,
      userId: user.$id,
    });

    // Verify delete permissions
    if (!member || member.role !== MemberRole.OWNER) {
      return c.json({ error: "Only workspace owner can delete" }, 401);
    }

    // Delete all related data when workspace is deleted
    try {
      // Get all projects in this workspace
      const projects = await databases.listDocuments(
        DATABASE_ID,
        PROJECTS_ID,
        [Query.equal("workspaceId", workspaceId)]
      );

      // Get all spaces in this workspace (Issue 3 - cascade deletion)
      const { SPACES_ID, SPACE_MEMBERS_ID } = await import("@/config");
      const spaces = await databases.listDocuments(
        DATABASE_ID,
        SPACES_ID,
        [Query.equal("workspaceId", workspaceId)]
      );

      // Get all tasks in this workspace
      const tasks = await databases.listDocuments(
        DATABASE_ID,
        TASKS_ID,
        [Query.equal("workspaceId", workspaceId)]
      );

      // Get all time logs in this workspace
      const timeLogs = await databases.listDocuments(
        DATABASE_ID,
        TIME_LOGS_ID,
        [Query.equal("workspaceId", workspaceId)]
      );

      // Get all members in this workspace
      const members = await databases.listDocuments(
        DATABASE_ID,
        MEMBERS_ID,
        [Query.equal("workspaceId", workspaceId)]
      );

      // Get all custom columns in this workspace
      const customColumns = await databases.listDocuments(
        DATABASE_ID,
        CUSTOM_COLUMNS_ID,
        [Query.equal("workspaceId", workspaceId)]
      );

      // Get all default column settings in this workspace
      const defaultColumnSettings = await databases.listDocuments(
        DATABASE_ID,
        DEFAULT_COLUMN_SETTINGS_ID,
        [Query.equal("workspaceId", workspaceId)]
      );

      // Delete time logs
      for (const timeLog of timeLogs.documents) {
        await databases.deleteDocument(DATABASE_ID, TIME_LOGS_ID, timeLog.$id);
      }

      // Delete all tasks
      for (const task of tasks.documents) {
        await databases.deleteDocument(DATABASE_ID, TASKS_ID, task.$id);
      }

      // Delete all projects
      for (const project of projects.documents) {
        await databases.deleteDocument(DATABASE_ID, PROJECTS_ID, project.$id);
      }

      // Delete spaces and members
      for (const space of spaces.documents) {
        // Get and delete all members of this space
        const spaceMembers = await databases.listDocuments(
          DATABASE_ID,
          SPACE_MEMBERS_ID,
          [Query.equal("spaceId", space.$id)]
        );
        for (const sm of spaceMembers.documents) {
          await databases.deleteDocument(DATABASE_ID, SPACE_MEMBERS_ID, sm.$id);
        }
        // Delete the space
        await databases.deleteDocument(DATABASE_ID, SPACES_ID, space.$id);
      }

      // Delete all members
      for (const member of members.documents) {
        await databases.deleteDocument(DATABASE_ID, MEMBERS_ID, member.$id);
      }

      // Delete all custom columns
      for (const customColumn of customColumns.documents) {
        await databases.deleteDocument(DATABASE_ID, CUSTOM_COLUMNS_ID, customColumn.$id);
      }

      // Delete all default column settings
      for (const setting of defaultColumnSettings.documents) {
        await databases.deleteDocument(DATABASE_ID, DEFAULT_COLUMN_SETTINGS_ID, setting.$id);
      }

      // Finally delete the workspace
      await databases.deleteDocument(DATABASE_ID, WORKSPACES_ID, workspaceId);

      return c.json({ data: { $id: workspaceId } });
    } catch (error) {
      console.error("Error during workspace deletion:", error);
      return c.json({ error: "Failed to delete workspace and related data" }, 500);
    }
  })
  .post("/:workspaceId/reset-invite-code", sessionMiddleware, async (c) => {
    const databases = c.get("databases");
    const user = c.get("user");

    const { workspaceId } = c.req.param();

    const member = await getMember({
      databases,
      workspaceId,
      userId: user.$id,
    });

    // Verify reset permissions
    if (!member || (member.role !== MemberRole.ADMIN && member.role !== MemberRole.OWNER)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const workspace = await databases.updateDocument(
      DATABASE_ID,
      WORKSPACES_ID,
      workspaceId,
      {
        inviteCode: generateInviteCode(6),
        lastModifiedBy: user.$id,
      }
    );

    return c.json({ data: workspace });
  })
  .post(
    "/:workspaceId/join",
    sessionMiddleware,
    zValidator("json", z.object({ code: z.string() })),
    async (c) => {
      const { workspaceId } = c.req.param();
      const { code } = c.req.valid("json");

      const databases = c.get("databases");
      const user = c.get("user");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (member) {
        return c.json({ error: "Already a member" }, 400);
      }

      const workspace = await databases.getDocument<Workspace>(
        DATABASE_ID,
        WORKSPACES_ID,
        workspaceId
      );

      if (workspace.inviteCode !== code) {
        return c.json({ error: "Invalid invite code" }, 400);
      }

      await databases.createDocument(DATABASE_ID, MEMBERS_ID, ID.unique(), {
        workspaceId,
        userId: user.$id,
        role: MemberRole.MEMBER,
      });

      return c.json({ data: workspace });
    }
  )
  .get("/:workspaceId/analytics", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const databases = c.get("databases");
    const { workspaceId } = c.req.param();

    const member = await getMember({
      databases,
      workspaceId,
      userId: user.$id,
    });

    if (!member) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const thisMonthTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.greaterThanEqual("$createdAt", thisMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", thisMonthEnd.toISOString()),
      ]
    );

    const lastMonthTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.greaterThanEqual("$createdAt", lastMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", lastMonthEnd.toISOString()),
      ]
    );

    const taskCount = thisMonthTasks.total;
    const taskDifference = taskCount - lastMonthTasks.total;

    const thisMonthAssignedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.contains("assigneeIds", member.$id),
        Query.greaterThanEqual("$createdAt", thisMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", thisMonthEnd.toISOString()),
      ]
    );

    const lastMonthAssignedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.contains("assigneeIds", member.$id),
        Query.greaterThanEqual("$createdAt", lastMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", lastMonthEnd.toISOString()),
      ]
    );

    const assignedTaskCount = thisMonthAssignedTasks.total;
    const assignedTaskDifference =
      assignedTaskCount - lastMonthAssignedTasks.total;

    const thisMonthIncompleteTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.notEqual("status", TaskStatus.DONE),
        Query.greaterThanEqual("$createdAt", thisMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", thisMonthEnd.toISOString()),
      ]
    );

    const lastMonthIncompleteTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.notEqual("status", TaskStatus.DONE),
        Query.greaterThanEqual("$createdAt", lastMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", lastMonthEnd.toISOString()),
      ]
    );

    const incompleteTaskCount = thisMonthIncompleteTasks.total;
    const incompleteTaskDifference =
      incompleteTaskCount - lastMonthIncompleteTasks.total;

    const thisMonthCompletedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.equal("status", TaskStatus.DONE),
        Query.greaterThanEqual("$createdAt", thisMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", thisMonthEnd.toISOString()),
      ]
    );

    const lastMonthCompletedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.equal("status", TaskStatus.DONE),
        Query.greaterThanEqual("$createdAt", lastMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", lastMonthEnd.toISOString()),
      ]
    );

    const completedTaskCount = thisMonthCompletedTasks.total;
    const completedTaskDifference =
      completedTaskCount - lastMonthCompletedTasks.total;

    const thisMonthOverdueTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.notEqual("status", TaskStatus.DONE),
        Query.lessThan("dueDate", now.toISOString()),
        Query.greaterThanEqual("$createdAt", thisMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", thisMonthEnd.toISOString()),
      ]
    );

    const lastMonthOverdueTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("workspaceId", workspaceId),
        Query.notEqual("status", TaskStatus.DONE),
        Query.lessThan("dueDate", now.toISOString()),
        Query.greaterThanEqual("$createdAt", lastMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", lastMonthEnd.toISOString()),
      ]
    );

    const overdueTaskCount = thisMonthOverdueTasks.total;
    const overdueTaskDifference =
      overdueTaskCount - lastMonthOverdueTasks.total;

    return c.json({
      data: {
        taskCount,
        taskDifference,
        assignedTaskCount,
        assignedTaskDifference,
        completedTaskCount,
        completedTaskDifference,
        incompleteTaskCount,
        incompleteTaskDifference,
        overdueTaskCount,
        overdueTaskDifference,
      },
    });
  });

export default app;
