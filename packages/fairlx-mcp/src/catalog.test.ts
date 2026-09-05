import { describe, expect, it } from "vitest";
import { scopesFromPermissions } from "./auth/scopes";
import { PROMPT_CATALOG } from "./prompts/catalog";
import { RESOURCE_TEMPLATES } from "./resources/catalog";
import { PERMISSIONS } from "./runtime/types";
import { SKILLS } from "./skills/registry";
import { listToolsForClient, TOOL_CATALOG } from "./tools/catalog";

const MEMBER_PERMISSIONS = [
  PERMISSIONS.VIEW_PROJECT,
  PERMISSIONS.VIEW_TASKS,
  PERMISSIONS.VIEW_SPRINTS,
  PERMISSIONS.VIEW_DOCS,
  PERMISSIONS.VIEW_MEMBERS,
  PERMISSIONS.CREATE_TASKS,
  PERMISSIONS.EDIT_TASKS,
];

const VIEWER_PERMISSIONS = [
  PERMISSIONS.VIEW_PROJECT,
  PERMISSIONS.VIEW_TASKS,
  PERMISSIONS.VIEW_SPRINTS,
  PERMISSIONS.VIEW_DOCS,
  PERMISSIONS.VIEW_MEMBERS,
];

const ADMIN_PERMISSIONS = [
  PERMISSIONS.VIEW_PROJECT,
  PERMISSIONS.VIEW_TASKS,
  PERMISSIONS.VIEW_SPRINTS,
  PERMISSIONS.VIEW_DOCS,
  PERMISSIONS.CREATE_TASKS,
  PERMISSIONS.EDIT_TASKS,
  PERMISSIONS.DELETE_TASKS,
  PERMISSIONS.CREATE_SPRINTS,
  PERMISSIONS.EDIT_SPRINTS,
  PERMISSIONS.START_SPRINT,
  PERMISSIONS.COMPLETE_SPRINT,
  PERMISSIONS.DELETE_SPRINTS,
  PERMISSIONS.CREATE_COMMENTS,
  PERMISSIONS.DELETE_COMMENTS,
  PERMISSIONS.CREATE_DOCS,
  PERMISSIONS.EDIT_DOCS,
  PERMISSIONS.DELETE_DOCS,
  PERMISSIONS.EDIT_SETTINGS,
  PERMISSIONS.MANAGE_TEAMS,
];

function toolNames(permissions: string[], isOwner = false) {
  return listToolsForClient({
    scopes: scopesFromPermissions(permissions, { isOwner }),
    projectPermissions: isOwner ? undefined : permissions,
  }).map((tool) => tool.name);
}

describe("MCP surface counts", () => {
  it("exposes 94 tools, 10 resource templates, 7 prompts, 7 skills", () => {
    expect(TOOL_CATALOG).toHaveLength(94);
    expect(RESOURCE_TEMPLATES).toHaveLength(10);
    expect(PROMPT_CATALOG).toHaveLength(7);
    expect(SKILLS).toHaveLength(7);
  });
});

describe("listToolsForClient role filter", () => {
  it("hides write and delete tools from viewers", () => {
    const names = toolNames(VIEWER_PERMISSIONS);
    expect(names).toContain("fairlx_work_item_get");
    expect(names).not.toContain("fairlx_work_item_update");
    expect(names).not.toContain("fairlx_work_item_delete");
  });

  it("gives members write but not delete", () => {
    const names = toolNames(MEMBER_PERMISSIONS);
    expect(names).toContain("fairlx_work_item_update");
    expect(names).toContain("fairlx_organization_get");
    expect(names).toContain("fairlx_organization_list");
    expect(names).not.toContain("fairlx_work_item_delete");
    expect(names).not.toContain("fairlx_project_delete");
    expect(names).not.toContain("fairlx_organization_update");
    expect(names).not.toContain("fairlx_usage_summary");
  });

  it("gives admins delete tools except project delete", () => {
    const names = toolNames(ADMIN_PERMISSIONS);
    expect(names).toContain("fairlx_work_item_update");
    expect(names).toContain("fairlx_work_item_delete");
    expect(names).toContain("fairlx_organization_update");
    expect(names).not.toContain("fairlx_project_delete");
  });

  it("gives admins usage summary but not regular members", () => {
    expect(toolNames(ADMIN_PERMISSIONS)).toContain("fairlx_usage_summary");
    expect(toolNames(MEMBER_PERMISSIONS)).not.toContain("fairlx_usage_summary");
  });

  it("gives owners the full catalog including project delete and member role updates", () => {
    const names = toolNames([], true);
    expect(names).toHaveLength(94);
    expect(names).toContain("fairlx_usage_summary");
    expect(names).toContain("fairlx_project_delete");
    expect(names).toContain("fairlx_project_team_create");
    expect(names).toContain("fairlx_project_member_add");
    expect(names).toContain("fairlx_project_team_member_add");
    expect(names).toContain("fairlx_workspace_member_update");
    expect(names).toContain("fairlx_workspace_member_add");
    expect(names).toContain("fairlx_workspace_member_remove");
    expect(names).toContain("fairlx_workspace_invite_get");
    expect(names).toContain("fairlx_agent_briefing");
    expect(names).toContain("fairlx_agent_next_assignment");
    expect(names).toContain("fairlx_organization_members_list");
    expect(names).toContain("fairlx_organization_get");
    expect(names).toContain("fairlx_organization_list");
    expect(names).toContain("fairlx_organization_workspaces_list");
    expect(names).toContain("fairlx_organization_update");
    expect(names).toContain("fairlx_department_list");
    expect(names).toContain("fairlx_department_create");
    expect(names).toContain("fairlx_department_permission_add");
  });

  it("gives admins member role updates but not regular members", () => {
    expect(toolNames(ADMIN_PERMISSIONS)).toContain("fairlx_workspace_member_update");
    expect(toolNames(ADMIN_PERMISSIONS)).toContain("fairlx_workspace_member_add");
    expect(toolNames(ADMIN_PERMISSIONS)).toContain("fairlx_workspace_member_remove");
    expect(toolNames(MEMBER_PERMISSIONS)).not.toContain("fairlx_workspace_member_update");
    expect(toolNames(MEMBER_PERMISSIONS)).not.toContain("fairlx_workspace_member_add");
    expect(toolNames(MEMBER_PERMISSIONS)).not.toContain("fairlx_workspace_member_remove");
  });

  it("gives admins project team writes but not regular members", () => {
    expect(toolNames(ADMIN_PERMISSIONS)).toContain("fairlx_project_team_create");
    expect(toolNames(ADMIN_PERMISSIONS)).toContain("fairlx_project_member_add");
    expect(toolNames(ADMIN_PERMISSIONS)).toContain("fairlx_project_team_member_add");
    expect(toolNames(ADMIN_PERMISSIONS)).toContain("fairlx_project_team_delete");
    expect(toolNames(MEMBER_PERMISSIONS)).not.toContain("fairlx_project_team_create");
    expect(toolNames(MEMBER_PERMISSIONS)).not.toContain("fairlx_project_member_add");
    expect(toolNames(MEMBER_PERMISSIONS)).not.toContain("fairlx_project_team_member_add");
  });

  it("describes document writes as Notion-quality markdown", () => {
    const create = TOOL_CATALOG.find((tool) => tool.name === "fairlx_doc_create");
    expect(create?.description).toMatch(/Notion-quality/i);
    expect(create?.description).toMatch(/research_required/);
    const schema = create?.inputSchema as { properties?: { content?: { description?: string } } };
    expect(schema.properties?.content?.description).toMatch(/italic tagline/);
  });
});
