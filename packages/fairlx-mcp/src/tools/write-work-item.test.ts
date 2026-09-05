import { describe, expect, it, vi } from "vitest";
import { jwtToAuthContext } from "../auth/context";
import { PERMISSIONS, type McpRuntime } from "../runtime/types";
import { callTool } from "./index";

function workItemRuntime(options?: {
  workItems?: Record<string, unknown>[];
  members?: Record<string, unknown>[];
  sprints?: Record<string, unknown>[];
}) {
  const workItems = (options?.workItems ?? []).map((doc) => ({ ...doc }));
  const members = (options?.members ?? []).map((doc) => ({ ...doc }));
  const sprints = (options?.sprints ?? []).map((doc) => ({ ...doc }));
  const profiles = new Map(
    members.map((doc) => [
      String(doc.userId),
      {
        id: String(doc.userId),
        name: String(doc.displayName ?? doc.userId),
        email: String(doc.displayEmail ?? `${doc.userId}@fairlx.dev`),
      },
    ]),
  );

  const table = (collection: string) => {
    if (collection === "members") return members;
    if (collection === "sprints") return sprints;
    return workItems;
  };

  const runtime = {
    collections: {
      workItems: "work_items",
      projects: "projects",
      members: "members",
      sprints: "sprints",
    },
    store: {
      list: async (collection: string, queries: Array<{ type: string; field?: string; value?: unknown }>) => {
        let filtered = table(collection);
        for (const query of queries) {
          if (query.type === "equal" && query.field) {
            const wanted = Array.isArray(query.value)
              ? query.value.map(String)
              : [String(query.value)];
            filtered = filtered.filter((doc) => wanted.includes(String(doc[query.field as string] ?? "")));
          }
        }
        return { documents: filtered, total: filtered.length };
      },
      get: async (collection: string, id: string) => {
        if (collection === "projects" && id === "proj_1") {
          return { $id: "proj_1", workspaceId: "ws_1", name: "School Stacker" };
        }
        const doc = table(collection).find((item) => item.$id === id);
        if (!doc) throw new Error("missing");
        return doc;
      },
      create: async (collection: string, data: Record<string, unknown>) => {
        const doc = { $id: `${collection}_${workItems.length + 1}`, ...data };
        if (collection === "work_items") workItems.push(doc);
        return doc;
      },
      update: async (collection: string, id: string, data: Record<string, unknown>) => {
        const doc = table(collection).find((item) => item.$id === id);
        if (!doc) throw new Error("missing");
        Object.assign(doc, data);
        return doc;
      },
    },
    lookupUsers: async (userIds: string[]) =>
      userIds.map((id) => profiles.get(id) ?? { id, name: "", email: "" }),
    generateWorkItemKey: async () => `SCHO-${workItems.length + 1}`,
    resolveUserProjectAccess: async () => ({
      hasAccess: true,
      isOwner: true,
      isAdmin: true,
      permissions: [PERMISSIONS.EDIT_TASKS],
      role: "ADMIN",
    }),
    hasProjectPermission: () => true,
    validateStatusTransition: vi.fn(),
  } as unknown as McpRuntime;

  return { runtime, workItems };
}

const auth = jwtToAuthContext("admin_1", {
  workspaceId: "ws_1",
  projectId: "proj_1",
  scopes: ["tasks:write", "tasks:read"],
});

describe("fairlx_work_item_update", () => {
  it("assigns by work item key and person name", async () => {
    const { runtime, workItems } = workItemRuntime({
      workItems: [
        {
          $id: "wi_1",
          key: "SCHO-1",
          title: "Set up project tech stack & repo",
          projectId: "proj_1",
          workspaceId: "ws_1",
          status: "TODO",
          assigneeIds: [],
        },
      ],
      members: [
        {
          $id: "mem_fogef",
          workspaceId: "ws_1",
          userId: "user_fogef",
          role: "MEMBER",
          displayName: "fogef",
          displayEmail: "fogefe9321@94an.com",
        },
      ],
    });

    const result = await callTool(
      "fairlx_work_item_update",
      { workItemId: "SCHO-1", assigneeIds: ["fogef"] },
      runtime,
      auth,
    );

    expect(result.isError).toBeUndefined();
    expect(workItems[0]?.assigneeIds).toEqual(["mem_fogef"]);
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      assigned: true,
      workItem: {
        key: "SCHO-1",
        unassigned: false,
        assignees: [{ name: "fogef" }],
      },
    });
  });

  it("stores workspace membership ids when creating with a name or email string", async () => {
    const { runtime, workItems } = workItemRuntime({
      members: [
        {
          $id: "mem_fogef",
          workspaceId: "ws_1",
          userId: "user_fogef",
          role: "MEMBER",
          displayName: "fogef",
          displayEmail: "fogefe9321@94an.com",
        },
      ],
    });

    const result = await callTool(
      "fairlx_work_item_create",
      {
        projectId: "proj_1",
        title: "Create gradebook data model",
        assigneeIds: "fogefe9321@94an.com",
      },
      runtime,
      auth,
    );

    expect(result.isError).toBeUndefined();
    expect(workItems[0]?.assigneeIds).toEqual(["mem_fogef"]);
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      assigned: true,
      workItem: { unassigned: false, assignees: [{ name: "fogef" }] },
    });
  });

  it("stores story points and due dates on create", async () => {
    const { runtime, workItems } = workItemRuntime({
      members: [
        {
          $id: "mem_fogef",
          workspaceId: "ws_1",
          userId: "user_fogef",
          role: "MEMBER",
          displayName: "fogef",
          displayEmail: "fogefe9321@94an.com",
        },
      ],
    });

    const result = await callTool(
      "fairlx_work_item_create",
      {
        projectId: "proj_1",
        title: "Conversation interface",
        type: "STORY",
        storyPoints: 5,
        dueDate: "2026-09-19",
      },
      runtime,
      auth,
    );

    expect(result.isError).toBeUndefined();
    expect(workItems[0]?.storyPoints).toBe(5);
    expect(workItems[0]?.dueDate).toBe("2026-09-19");
    expect(JSON.parse(result.content[0]?.text ?? "{}").workItem).toMatchObject({
      storyPoints: 5,
      dueDate: "2026-09-19",
    });
  });

  it("rejects a project id used as workItemId", async () => {
    const { runtime } = workItemRuntime({
      workItems: [
        {
          $id: "wi_1",
          key: "SCHO-1",
          title: "Setup",
          projectId: "proj_1",
          workspaceId: "ws_1",
        },
      ],
    });

    await expect(
      callTool(
        "fairlx_work_item_update",
        { workItemId: "proj_1", assigneeIds: ["ws_1"] },
        runtime,
        auth,
      ),
    ).rejects.toThrow(/project's id/i);
  });

  it("rejects a workspace id used as an assignee", async () => {
    const { runtime } = workItemRuntime({
      workItems: [
        {
          $id: "wi_1",
          key: "SCHO-1",
          title: "Setup",
          projectId: "proj_1",
          workspaceId: "ws_1",
          assigneeIds: [],
        },
      ],
      members: [
        {
          $id: "mem_fogef",
          workspaceId: "ws_1",
          userId: "user_fogef",
          displayName: "fogef",
          displayEmail: "fogefe9321@94an.com",
        },
      ],
    });

    await expect(
      callTool(
        "fairlx_work_item_update",
        { workItemId: "SCHO-1", assigneeIds: ["ws_1"] },
        runtime,
        auth,
      ),
    ).rejects.toThrow(/not the workspace id/i);
  });

  it("assignPercent fills unassigned keys until the person has that share of the board", async () => {
    const { runtime, workItems } = workItemRuntime({
      workItems: Array.from({ length: 5 }, (_, i) => ({
        $id: `wi_${i + 1}`,
        key: `SCHO-${i + 1}`,
        title: `Item ${i + 1}`,
        projectId: "proj_1",
        workspaceId: "ws_1",
        status: "TODO",
        assigneeIds: [],
      })),
      members: [
        {
          $id: "mem_fogef",
          workspaceId: "ws_1",
          userId: "user_fogef",
          role: "MEMBER",
          displayName: "fogef",
          displayEmail: "fogefe9321@94an.com",
        },
      ],
    });

    const result = await callTool(
      "fairlx_work_item_bulk_update",
      { assignPercent: 60, assigneeIds: ["fogef"] },
      runtime,
      auth,
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      target: number;
      assignedKeys: string[];
      alreadyAssigned: string[];
    };
    expect(payload.target).toBe(3);
    expect(payload.alreadyAssigned).toEqual([]);
    expect(payload.assignedKeys).toEqual(["SCHO-1", "SCHO-2", "SCHO-3"]);
    expect(workItems.map((item) => item.assigneeIds)).toEqual([
      ["mem_fogef"],
      ["mem_fogef"],
      ["mem_fogef"],
      [],
      [],
    ]);
  });

  it("parents a story under an epic by epic key", async () => {
    const { runtime, workItems } = workItemRuntime({
      workItems: [
        {
          $id: "epic_1",
          key: "SCHO-1",
          title: "Conversation interface",
          type: "EPIC",
          projectId: "proj_1",
          workspaceId: "ws_1",
        },
        {
          $id: "wi_2",
          key: "SCHO-2",
          title: "Chat composer",
          type: "STORY",
          projectId: "proj_1",
          workspaceId: "ws_1",
          epicId: null,
        },
      ],
    });

    const result = await callTool(
      "fairlx_work_item_update",
      { workItemId: "SCHO-2", epicId: "SCHO-1" },
      runtime,
      auth,
    );

    expect(result.isError).toBeUndefined();
    expect(workItems[1]?.epicId).toBe("epic_1");
    expect(JSON.parse(result.content[0]?.text ?? "{}").workItem).toMatchObject({
      key: "SCHO-2",
      hasEpic: true,
      epicKey: "SCHO-1",
      epicTitle: "Conversation interface",
    });
  });

  it("assignEpics parents every child without an epic", async () => {
    const { runtime, workItems } = workItemRuntime({
      workItems: [
        {
          $id: "epic_chat",
          key: "SCHO-1",
          title: "Conversation interface",
          type: "EPIC",
          projectId: "proj_1",
          workspaceId: "ws_1",
        },
        {
          $id: "epic_grade",
          key: "SCHO-2",
          title: "Gradebook",
          type: "EPIC",
          projectId: "proj_1",
          workspaceId: "ws_1",
        },
        {
          $id: "wi_3",
          key: "SCHO-3",
          title: "Conversation composer and history",
          type: "STORY",
          projectId: "proj_1",
          workspaceId: "ws_1",
          epicId: null,
        },
        {
          $id: "wi_4",
          key: "SCHO-4",
          title: "Gradebook report cards",
          type: "TASK",
          projectId: "proj_1",
          workspaceId: "ws_1",
          epicId: null,
        },
      ],
    });

    const result = await callTool(
      "fairlx_work_item_bulk_update",
      { assignEpics: true, projectId: "proj_1" },
      runtime,
      auth,
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      count: number;
      mapping: Array<{ key: string; epicKey: string }>;
    };
    expect(payload.count).toBe(2);
    expect(workItems.find((item) => item.key === "SCHO-3")?.epicId).toBe("epic_chat");
    expect(workItems.find((item) => item.key === "SCHO-4")?.epicId).toBe("epic_grade");
    expect(payload.mapping.map((row) => row.epicKey).sort()).toEqual(["SCHO-1", "SCHO-2"]);
  });

  const fogefMember = {
    $id: "mem_fogef",
    workspaceId: "ws_1",
    userId: "user_fogef",
    role: "MEMBER",
    displayName: "fogef",
    displayEmail: "fogefe9321@94an.com",
  };

  it("clearAssignees unassigns every sprint item and leaves the backlog", async () => {
    const { runtime, workItems } = workItemRuntime({
      workItems: [
        {
          $id: "wi_1",
          key: "SCHO-1",
          title: "Sprint 1 item",
          projectId: "proj_1",
          workspaceId: "ws_1",
          sprintId: "sp_1",
          assigneeIds: ["mem_fogef"],
        },
        {
          $id: "wi_2",
          key: "SCHO-2",
          title: "Sprint 2 item",
          projectId: "proj_1",
          workspaceId: "ws_1",
          sprintId: "sp_2",
          assigneeIds: ["mem_fogef"],
        },
        {
          $id: "wi_3",
          key: "SCHO-3",
          title: "Backlog item",
          projectId: "proj_1",
          workspaceId: "ws_1",
          sprintId: null,
          assigneeIds: ["mem_fogef"],
        },
      ],
      members: [fogefMember],
      sprints: [
        { $id: "sp_1", projectId: "proj_1", name: "Sprint 1 — Foundation" },
        { $id: "sp_2", projectId: "proj_1", name: "Sprint 2 — Adaptive Core" },
      ],
    });

    const result = await callTool(
      "fairlx_work_item_bulk_update",
      { clearAssignees: true, projectId: "proj_1" },
      runtime,
      auth,
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as { count: number; cleared: boolean };
    expect(payload.cleared).toBe(true);
    expect(payload.count).toBe(2);
    expect(workItems.find((item) => item.key === "SCHO-1")?.assigneeIds).toEqual([]);
    expect(workItems.find((item) => item.key === "SCHO-2")?.assigneeIds).toEqual([]);
    expect(workItems.find((item) => item.key === "SCHO-3")?.assigneeIds).toEqual(["mem_fogef"]);
  });

  it("treats assignPercent 0 as clearAssignees instead of rejecting it", async () => {
    const { runtime, workItems } = workItemRuntime({
      workItems: [
        {
          $id: "wi_1",
          key: "SCHO-1",
          title: "Sprint 1 item",
          projectId: "proj_1",
          workspaceId: "ws_1",
          sprintId: "sp_1",
          assigneeIds: ["mem_other"],
        },
      ],
      members: [fogefMember],
      sprints: [{ $id: "sp_1", projectId: "proj_1", name: "Sprint 1 — Foundation" }],
    });

    const result = await callTool(
      "fairlx_work_item_bulk_update",
      { assignPercent: 0, assigneeIds: ["fogef"], projectId: "proj_1" },
      runtime,
      auth,
    );

    expect(result.isError).toBeUndefined();
    expect(workItems[0]?.assigneeIds).toEqual([]);
  });

  it("assigns every work item in Sprint 1 by name and replaces existing assignees", async () => {
    const { runtime, workItems } = workItemRuntime({
      workItems: [
        {
          $id: "wi_1",
          key: "SCHO-1",
          title: "Already assigned",
          projectId: "proj_1",
          workspaceId: "ws_1",
          sprintId: "sp_1",
          assigneeIds: ["mem_other"],
        },
        {
          $id: "wi_2",
          key: "SCHO-2",
          title: "Unassigned in sprint 1",
          projectId: "proj_1",
          workspaceId: "ws_1",
          sprintId: "sp_1",
          assigneeIds: [],
        },
        {
          $id: "wi_3",
          key: "SCHO-3",
          title: "Sprint 2 stays",
          projectId: "proj_1",
          workspaceId: "ws_1",
          sprintId: "sp_2",
          assigneeIds: ["mem_other"],
        },
      ],
      members: [fogefMember],
      sprints: [
        { $id: "sp_1", projectId: "proj_1", name: "Sprint 1 — Foundation" },
        { $id: "sp_2", projectId: "proj_1", name: "Sprint 2 — Adaptive Core" },
      ],
    });

    const result = await callTool(
      "fairlx_work_item_bulk_update",
      { sprintId: "Sprint 1", assigneeIds: ["Fogef"], projectId: "proj_1" },
      runtime,
      auth,
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as { assignedKeys: string[] };
    expect(payload.assignedKeys.sort()).toEqual(["SCHO-1", "SCHO-2"]);
    expect(workItems.find((item) => item.key === "SCHO-1")?.assigneeIds).toEqual(["mem_fogef"]);
    expect(workItems.find((item) => item.key === "SCHO-2")?.assigneeIds).toEqual(["mem_fogef"]);
    expect(workItems.find((item) => item.key === "SCHO-3")?.assigneeIds).toEqual(["mem_other"]);
  });

  it("ignores status ALL when listing sprints", async () => {
    const { runtime } = workItemRuntime({
      sprints: [
        { $id: "sp_1", projectId: "proj_1", name: "Sprint 1 — Foundation", status: "ACTIVE" },
        { $id: "sp_2", projectId: "proj_1", name: "Sprint 2 — Adaptive Core", status: "PLANNED" },
      ],
    });

    const result = await callTool(
      "fairlx_sprint_list",
      { projectId: "proj_1", status: "ALL" },
      runtime,
      jwtToAuthContext("admin_1", {
        workspaceId: "ws_1",
        projectId: "proj_1",
        scopes: ["sprints:read"],
      }),
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as { sprints: { name: string }[]; total: number };
    expect(payload.total).toBe(2);
    expect(payload.sprints.map((sprint) => sprint.name)).toEqual([
      "Sprint 1 — Foundation",
      "Sprint 2 — Adaptive Core",
    ]);
  });
});
