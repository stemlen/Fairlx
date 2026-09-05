import { describe, expect, it } from "vitest";
import { jwtToAuthContext } from "../auth/context";
import type { McpRuntime } from "../runtime/types";
import { callTool } from "./index";

function orgRuntime(options?: {
  orgAccess?: { isOwner: boolean; role: string | null; permissions: string[]; hasDepartmentAccess: boolean };
}) {
  const members = [
    {
      $id: "mem_actor",
      workspaceId: "ws_1",
      userId: "admin_1",
      role: "ADMIN",
      status: "ACTIVE",
    },
  ];
  const orgMembers = [
    {
      $id: "org_ada",
      organizationId: "org_1",
      userId: "admin_1",
      role: "ADMIN",
      status: "ACTIVE",
      displayName: "Ada Admin",
      displayEmail: "ada@fairlx.dev",
    },
  ];
  const organizations = [{ $id: "org_1", name: "Stemlen" }];
  const workspaces = [{ $id: "ws_1", name: "School Stacker WS", organizationId: "org_1" }];

  const runtime = {
    collections: {
      members: "members",
      workspaces: "workspaces",
      organizationMembers: "organization_members",
      organizations: "organizations",
    },
    store: {
      list: async (collection: string, queries: Array<{ type: string; field?: string; value?: unknown }>) => {
        let filtered: Record<string, unknown>[] =
          collection === "organization_members"
            ? orgMembers
            : collection === "organizations"
              ? organizations
              : collection === "workspaces"
                ? workspaces
                : members;
        for (const query of queries) {
          if (query.type === "equal" && query.field) {
            filtered = filtered.filter((doc) => doc[query.field as string] === query.value);
          }
        }
        return { documents: filtered, total: filtered.length };
      },
      get: async (collection: string, id: string) => {
        const pool =
          collection === "organizations" ? organizations : collection === "workspaces" ? workspaces : members;
        const doc = pool.find((item) => item.$id === id);
        if (!doc) throw new Error("missing");
        return doc;
      },
      update: async (collection: string, id: string, data: Record<string, unknown>) => {
        const pool = collection === "organizations" ? organizations : members;
        const doc = pool.find((item) => item.$id === id);
        if (!doc) throw new Error("missing");
        Object.assign(doc, data);
        return doc;
      },
      create: async () => {
        throw new Error("unused");
      },
      delete: async () => {
        throw new Error("unused");
      },
    },
    lookupUsers: async (userIds: string[]) =>
      userIds.map((id) => ({
        id,
        name: id === "admin_1" ? "Ada Admin" : id,
        email: `${id}@fairlx.dev`,
      })),
    resolveUserOrgAccess: async () =>
      options?.orgAccess ?? {
        isOwner: false,
        role: "ADMIN",
        permissions: ["org.settings.manage", "org.members.manage"],
        hasDepartmentAccess: true,
      },
  } as unknown as McpRuntime;

  return { runtime, organizations };
}

const adminAuth = jwtToAuthContext("admin_1", {
  workspaceId: "ws_1",
  organizationId: "org_1",
  scopes: ["project:read", "members:read", "admin:manage"],
});

describe("fairlx_organization_get", () => {
  it("returns the organization name for a workspace admin", async () => {
    const { runtime } = orgRuntime();
    const result = await callTool(
      "fairlx_organization_get",
      { workspaceId: "ws_1" },
      runtime,
      adminAuth,
    );
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      organization: { name: "Stemlen" },
      you: { canManageSettings: true },
    });
  });
});

describe("fairlx_organization_list", () => {
  it("lists organizations the actor belongs to", async () => {
    const { runtime } = orgRuntime();
    const result = await callTool("fairlx_organization_list", {}, runtime, adminAuth);
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      organizations: [{ name: "Stemlen", role: "ADMIN" }],
    });
  });
});

describe("fairlx_organization_update", () => {
  it("renames the organization when the actor has settings permission", async () => {
    const { runtime, organizations } = orgRuntime();
    const result = await callTool(
      "fairlx_organization_update",
      { workspaceId: "ws_1", name: "Stemlen Labs" },
      runtime,
      adminAuth,
    );
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      updated: true,
      organization: { name: "Stemlen Labs" },
    });
    expect(organizations[0]?.name).toBe("Stemlen Labs");
  });

  it("refuses when the actor lacks org settings permission", async () => {
    const { runtime } = orgRuntime({
      orgAccess: {
        isOwner: false,
        role: "MEMBER",
        permissions: [],
        hasDepartmentAccess: false,
      },
    });
    await expect(
      callTool(
        "fairlx_organization_update",
        { workspaceId: "ws_1", name: "Hacked" },
        runtime,
        adminAuth,
      ),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });
});

describe("fairlx_department_create", () => {
  it("creates departments with org permission keys", async () => {
    const departments: Record<string, unknown>[] = [];
    const departmentPermissions: Record<string, unknown>[] = [];
    const { runtime } = orgRuntime({
      orgAccess: {
        isOwner: true,
        role: "OWNER",
        permissions: [],
        hasDepartmentAccess: true,
      },
    });
    runtime.collections.departments = "departments";
    runtime.collections.departmentPermissions = "department_permissions";
    const store = runtime.store as unknown as {
      list: McpRuntime["store"]["list"];
      create: McpRuntime["store"]["create"];
      update: McpRuntime["store"]["update"];
    };
    const originalList = store.list.bind(store);
    const originalCreate = store.create.bind(store);
    store.list = async (collection, queries) => {
      const apply = (rows: Record<string, unknown>[]) => {
        let filtered = rows;
        for (const query of queries) {
          if (query.type === "equal" && query.field) {
            filtered = filtered.filter((doc) => doc[query.field as string] === query.value);
          }
        }
        return { documents: filtered, total: filtered.length };
      };
      if (collection === "departments") return apply(departments);
      if (collection === "department_permissions") return apply(departmentPermissions);
      return originalList(collection, queries);
    };
    store.create = async (collection, data, id) => {
      if (collection === "departments") {
        const doc = { $id: id || `dept_${departments.length + 1}`, ...data };
        departments.push(doc);
        return doc;
      }
      if (collection === "department_permissions") {
        const doc = { $id: id || `perm_${departmentPermissions.length + 1}`, ...data };
        departmentPermissions.push(doc);
        return doc;
      }
      return originalCreate(collection, data, id);
    };

    const result = await callTool(
      "fairlx_department_create",
      {
        workspaceId: "ws_1",
        departments: [
          { name: "Engineering", permissions: ["org.workspace.create", "org.members.view"] },
          { name: "Finance", permissions: ["org.billing.view", "org.billing.manage"] },
        ],
      },
      runtime,
      adminAuth,
    );
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      departments: Array<{ name: string; permissions: string[] }>;
    };
    expect(payload.departments.map((item) => item.name)).toEqual(["Engineering", "Finance"]);
    expect(payload.departments[0]?.permissions).toEqual(["org.workspace.create", "org.members.view"]);
    expect(departments).toHaveLength(2);
    expect(departmentPermissions).toHaveLength(2);
  });

  it("refuses when the actor cannot manage departments", async () => {
    const { runtime } = orgRuntime({
      orgAccess: {
        isOwner: false,
        role: "MEMBER",
        permissions: ["org.members.view"],
        hasDepartmentAccess: true,
      },
    });
    runtime.collections.departments = "departments";
    await expect(
      callTool(
        "fairlx_department_create",
        { workspaceId: "ws_1", name: "Engineering" },
        runtime,
        adminAuth,
      ),
    ).rejects.toMatchObject({ httpStatus: 403 });
  });
});
