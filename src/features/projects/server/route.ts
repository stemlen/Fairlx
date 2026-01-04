import { zValidator } from "@hono/zod-validator";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { Hono } from "hono";
import { ID, Query, Models } from "node-appwrite";
import { z } from "zod";

import { getMember } from "@/features/members/utils";
import { TaskStatus } from "@/features/tasks/types";

import { DATABASE_ID, IMAGES_BUCKET_ID, PROJECTS_ID, TASKS_ID, TIME_LOGS_ID, TEAM_MEMBERS_ID } from "@/config";
import { sessionMiddleware } from "@/lib/session-middleware";

import { createProjectSchema, updateProjectSchema } from "../schemas";
import { Project } from "../types";
import { MemberRole } from "@/features/members/types";
import { TeamMember } from "@/features/teams/types";

// Parse Appwrite JSON
const transformProject = (project: Models.Document): Project => {
  const raw = project as unknown as Record<string, unknown>;

  return {
    ...(project as unknown as Project),
    customWorkItemTypes: typeof raw.customWorkItemTypes === 'string'
      ? JSON.parse(raw.customWorkItemTypes)
      : (raw.customWorkItemTypes as Project["customWorkItemTypes"]) || [],
    customPriorities: typeof raw.customPriorities === 'string'
      ? JSON.parse(raw.customPriorities)
      : (raw.customPriorities as Project["customPriorities"]) || [],
    customLabels: typeof raw.customLabels === 'string'
      ? JSON.parse(raw.customLabels)
      : (raw.customLabels as Project["customLabels"]) || [],
  };
};

const app = new Hono()
  .post(
    "/",
    sessionMiddleware,
    zValidator("form", createProjectSchema),
    async (c) => {
      const databases = c.get("databases");
      const storage = c.get("storage");
      const user = c.get("user");

      const { name, description, deadline, image, workspaceId, spaceId } = c.req.valid("form");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
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
      }

      const project = await databases.createDocument(
        DATABASE_ID,
        PROJECTS_ID,
        ID.unique(),
        {
          name,
          description: description || undefined,
          deadline: deadline || undefined,
          imageUrl: uploadedImageUrl,
          workspaceId,
          // Normalize spaceId
          spaceId: (spaceId === null || spaceId === "" || spaceId === "null") ? null : spaceId,
        }
      );

      return c.json({ data: transformProject(project) });
    }
  )
  .get(
    "/",
    sessionMiddleware,
    zValidator("query", z.object({ workspaceId: z.string() })),
    async (c) => {
      const user = c.get("user");
      const databases = c.get("databases");

      const { workspaceId } = c.req.valid("query");

      if (!workspaceId) {
        return c.json({ error: "Missing workspaceId" }, 400);
      }

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const allProjects = await databases.listDocuments<Project>(
        DATABASE_ID,
        PROJECTS_ID,
        [Query.equal("workspaceId", workspaceId), Query.orderDesc("$createdAt")]
      );

      // If user is admin, return all projects
      if (member.role === MemberRole.ADMIN) {
        return c.json({
          data: {
            ...allProjects,
            documents: allProjects.documents.map(transformProject)
          }
        });
      }

      // Filter projects by team
      const userTeamMemberships = await databases.listDocuments<TeamMember>(
        DATABASE_ID,
        TEAM_MEMBERS_ID,
        [Query.equal("memberId", member.$id), Query.equal("isActive", true)]
      );

      const userTeamIds = userTeamMemberships.documents.map(
        (membership) => membership.teamId
      );
      const filteredProjects = allProjects.documents.filter((project) => {
        // If no teams assigned, project is visible to all
        if (!project.assignedTeamIds || project.assignedTeamIds.length === 0) {
          return true;
        }
        // Check if user is in any of the assigned teams
        return project.assignedTeamIds.some((teamId) =>
          userTeamIds.includes(teamId)
        );
      });

      return c.json({
        data: {
          documents: filteredProjects.map(transformProject),
          total: filteredProjects.length,
        },
      });
    }
  )
  .get("/:projectId", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const databases = c.get("databases");
    const { projectId } = c.req.param();

    const project = await databases.getDocument<Project>(
      DATABASE_ID,
      PROJECTS_ID,
      projectId
    );

    const member = await getMember({
      databases,
      workspaceId: project.workspaceId,
      userId: user.$id,
    });

    if (!member) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json({ data: transformProject(project) });
  })
  .patch(
    "/:projectId",
    sessionMiddleware,
    zValidator("form", updateProjectSchema),
    async (c) => {
      const databases = c.get("databases");
      const storage = c.get("storage");
      const user = c.get("user");

      const { projectId } = c.req.param();
      const {
        name,
        description,
        deadline,
        image,
        spaceId,
        workflowId,
        customWorkItemTypes,
        customPriorities,
        customLabels
      } = c.req.valid("form");

      const existingProject = await databases.getDocument<Project>(
        DATABASE_ID,
        PROJECTS_ID,
        projectId
      );

      const member = await getMember({
        databases,
        workspaceId: existingProject.workspaceId,
        userId: user.$id,
      });

      if (!member) {
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

      const updateData: Record<string, unknown> = {
        name,
        imageUrl: uploadedImageUrl,
        lastModifiedBy: user.$id,
      };

      // Update fields if provided
      if (description !== undefined) {
        updateData.description = description || null;
      }

      // Only update deadline if it was provided (null to clear it)
      if (deadline !== undefined) {
        updateData.deadline = deadline || null;
      }

      // Normalise space/workflow IDs
      if (spaceId !== undefined) {
        updateData.spaceId = (spaceId === null || spaceId === "" || spaceId === "null") ? null : spaceId;
      }

      if (workflowId !== undefined) {
        updateData.workflowId = (workflowId === null || workflowId === "" || workflowId === "null") ? null : workflowId;
      }

      // Update custom definitions
      if (customWorkItemTypes !== undefined) {
        updateData.customWorkItemTypes = JSON.stringify(customWorkItemTypes);
      }
      if (customPriorities !== undefined) {
        updateData.customPriorities = JSON.stringify(customPriorities);
      }
      if (customLabels !== undefined) {
        updateData.customLabels = JSON.stringify(customLabels);
      }

      const project = await databases.updateDocument(
        DATABASE_ID,
        PROJECTS_ID,
        projectId,
        updateData
      );

      return c.json({ data: transformProject(project) });
    }
  )
  .delete("/:projectId", sessionMiddleware, async (c) => {
    const databases = c.get("databases");
    const user = c.get("user");

    const { projectId } = c.req.param();

    const existingProject = await databases.getDocument<Project>(
      DATABASE_ID,
      PROJECTS_ID,
      projectId
    );

    const member = await getMember({
      databases,
      workspaceId: existingProject.workspaceId,
      userId: user.$id,
    });

    if (!member) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Cascade delete related data
    try {
      // Get all tasks for this project
      const tasks = await databases.listDocuments(
        DATABASE_ID,
        TASKS_ID,
        [Query.equal("projectId", projectId)]
      );

      // Get all time logs for this project
      const timeLogs = await databases.listDocuments(
        DATABASE_ID,
        TIME_LOGS_ID,
        [Query.equal("projectId", projectId)]
      );

      // Delete all time logs for this project
      for (const timeLog of timeLogs.documents) {
        await databases.deleteDocument(DATABASE_ID, TIME_LOGS_ID, timeLog.$id);
      }

      // Delete all tasks for this project
      for (const task of tasks.documents) {
        await databases.deleteDocument(DATABASE_ID, TASKS_ID, task.$id);
      }

      // Finally delete the project
      await databases.deleteDocument(DATABASE_ID, PROJECTS_ID, projectId);

      return c.json({ data: { $id: existingProject.$id } });
    } catch (error) {
      console.error("Error during project deletion:", error);
      return c.json({ error: "Failed to delete project and related data" }, 500);
    }
  })
  .get("/:projectId/analytics", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const databases = c.get("databases");
    const { projectId } = c.req.param();

    const project = await databases.getDocument<Project>(
      DATABASE_ID,
      PROJECTS_ID,
      projectId
    );

    const member = await getMember({
      databases,
      workspaceId: project.workspaceId,
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
        Query.equal("projectId", projectId),
        Query.greaterThanEqual("$createdAt", thisMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", thisMonthEnd.toISOString()),
      ]
    );

    const lastMonthTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("projectId", projectId),
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
        Query.equal("projectId", projectId),
        Query.contains("assigneeIds", member.$id),
        Query.greaterThanEqual("$createdAt", thisMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", thisMonthEnd.toISOString()),
      ]
    );

    const lastMonthAssignedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("projectId", projectId),
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
        Query.equal("projectId", projectId),
        Query.notEqual("status", TaskStatus.DONE),
        Query.greaterThanEqual("$createdAt", thisMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", thisMonthEnd.toISOString()),
      ]
    );

    const lastMonthIncompleteTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("projectId", projectId),
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
        Query.equal("projectId", projectId),
        Query.equal("status", TaskStatus.DONE),
        Query.greaterThanEqual("$createdAt", thisMonthStart.toISOString()),
        Query.lessThanEqual("$createdAt", thisMonthEnd.toISOString()),
      ]
    );

    const lastMonthCompletedTasks = await databases.listDocuments(
      DATABASE_ID,
      TASKS_ID,
      [
        Query.equal("projectId", projectId),
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
        Query.equal("projectId", projectId),
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
        Query.equal("projectId", projectId),
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
  })
  .post(
    "/:projectId/teams/:teamId",
    sessionMiddleware,
    async (c) => {
      const user = c.get("user");
      const databases = c.get("databases");
      const { projectId, teamId } = c.req.param();

      // Get project
      const project = await databases.getDocument<Project>(
        DATABASE_ID,
        PROJECTS_ID,
        projectId
      );

      if (!project) {
        return c.json({ error: "Project not found" }, 404);
      }

      // Verify admin access
      const member = await getMember({
        databases,
        workspaceId: project.workspaceId,
        userId: user.$id,
      });

      if (!member || member.role !== MemberRole.ADMIN) {
        return c.json({ error: "Only workspace admins can assign projects to teams" }, 403);
      }

      // Assign team
      const currentTeamIds = project.assignedTeamIds || [];
      if (!currentTeamIds.includes(teamId)) {
        currentTeamIds.push(teamId);
      }

      const updatedProject = await databases.updateDocument(
        DATABASE_ID,
        PROJECTS_ID,
        projectId,
        {
          assignedTeamIds: currentTeamIds,
        }
      );

      return c.json({ data: transformProject(updatedProject) });
    }
  )
  .delete(
    "/:projectId/teams/:teamId",
    sessionMiddleware,
    async (c) => {
      const user = c.get("user");
      const databases = c.get("databases");
      const { projectId, teamId } = c.req.param();

      // Get the project
      const project = await databases.getDocument<Project>(
        DATABASE_ID,
        PROJECTS_ID,
        projectId
      );

      if (!project) {
        return c.json({ error: "Project not found" }, 404);
      }

      // Check if user is workspace admin
      const member = await getMember({
        databases,
        workspaceId: project.workspaceId,
        userId: user.$id,
      });

      if (!member || member.role !== MemberRole.ADMIN) {
        return c.json({ error: "Only workspace admins can unassign projects from teams" }, 403);
      }

      // Unassign team
      const currentTeamIds = project.assignedTeamIds || [];
      const updatedTeamIds = currentTeamIds.filter((id) => id !== teamId);

      const updatedProject = await databases.updateDocument(
        DATABASE_ID,
        PROJECTS_ID,
        projectId,
        {
          assignedTeamIds: updatedTeamIds,
        }
      );

      return c.json({ data: transformProject(updatedProject) });
    }
  )
  .post(
    "/:projectId/copy-settings",
    sessionMiddleware,
    zValidator("json", z.object({ sourceProjectId: z.string() })),
    async (c) => {
      const user = c.get("user");
      const databases = c.get("databases");
      const { projectId } = c.req.param();
      const { sourceProjectId } = c.req.valid("json");

      const targetProject = await databases.getDocument<Project>(
        DATABASE_ID,
        PROJECTS_ID,
        projectId
      );

      const member = await getMember({
        databases,
        workspaceId: targetProject.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      if (member.role !== MemberRole.ADMIN) {
        return c.json({ error: "Only admins can update project settings" }, 403);
      }

      const sourceProject = await databases.getDocument<Project>(
        DATABASE_ID,
        PROJECTS_ID,
        sourceProjectId
      );

      if (!sourceProject) {
        return c.json({ error: "Source project not found" }, 404);
      }

      // Verify workspace match
      if (sourceProject.workspaceId !== targetProject.workspaceId) {
        return c.json({ error: "Cannot copy from project in different workspace" }, 400);
      }

      // Copy settings
      const updateData: Record<string, unknown> = {};
      const transformedSourceProject = transformProject(sourceProject);

      if (transformedSourceProject.customWorkItemTypes) {
        updateData.customWorkItemTypes = JSON.stringify(transformedSourceProject.customWorkItemTypes);
      }
      if (transformedSourceProject.customPriorities) {
        updateData.customPriorities = JSON.stringify(transformedSourceProject.customPriorities);
      }
      if (transformedSourceProject.customLabels) {
        updateData.customLabels = JSON.stringify(transformedSourceProject.customLabels);
      }

      const updatedProject = await databases.updateDocument(
        DATABASE_ID,
        PROJECTS_ID,
        projectId,
        updateData
      );

      return c.json({ data: transformProject(updatedProject) });
    }
  );

export default app;
