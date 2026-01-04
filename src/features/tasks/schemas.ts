import { z } from "zod";

import { TaskStatus, TaskPriority } from "./types";

const baseTaskSchema = z.object({
  name: z.string().trim().min(1, "Required"),
  type: z.string().optional(), // work item type key
  status: z.union([z.nativeEnum(TaskStatus), z.string()]).refine(
    (value) => Object.values(TaskStatus).includes(value as TaskStatus) || typeof value === "string",
    { message: "Invalid status" }
  ),
  workspaceId: z.string().trim().min(1, "Required"),
  projectId: z.string().trim().min(1, "Required"),
  dueDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  assigneeIds: z.array(z.string().trim().min(1)).optional(),
  assignedTeamId: z.string().trim().optional(),
  assignedTeamIds: z.array(z.string().trim().min(1)).optional(),
  description: z.string().nullable().optional(),
  estimatedHours: z
    .union([z.number().min(0), z.string(), z.undefined(), z.null()])
    .transform((val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      const num = typeof val === "string" ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    })
    .optional(),
  storyPoints: z.number().min(0).optional(),
  priority: z.union([z.nativeEnum(TaskPriority), z.string()]).optional(),
  labels: z.array(z.string()).optional(),
  flagged: z.boolean().optional(),
});

export const createTaskSchema = baseTaskSchema.refine(
  (data) => {
    if (data.endDate && data.dueDate) {
      return data.endDate >= data.dueDate;
    }
    return true;
  },
  {
    message: "End date must be after or equal to start date",
    path: ["endDate"],
  }
);

export const createTaskFormSchema = baseTaskSchema.omit({ workspaceId: true }).extend({
  assigneeIds: z.array(z.string().trim().min(1)).optional(),
  assignedTeamId: z.string().trim().optional(),
  assignedTeamIds: z.array(z.string().trim().min(1)).optional(),
}).refine(
  (data) => {
    if (data.endDate && data.dueDate) {
      return data.endDate >= data.dueDate;
    }
    return true;
  },
  {
    message: "End date must be after or equal to start date",
    path: ["endDate"],
  }
);

export const updateTaskSchema = baseTaskSchema.omit({ workspaceId: true }).partial().refine(
  (data) => {
    if (data.endDate && data.dueDate) {
      return data.endDate >= data.dueDate;
    }
    return true;
  },
  {
    message: "End date must be after or equal to start date",
    path: ["endDate"],
  }
);
