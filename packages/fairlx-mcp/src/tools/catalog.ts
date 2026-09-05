import type { AuthContext } from "../auth/context";
import { isToolAllowedForAuth } from "../auth/scopes";
import { PROJECT_DOC_MARKDOWN_GUIDE } from "../lib/project-doc-markdown";
import type { McpToolDefinition } from "../protocol/types";
import { PERMISSIONS } from "../runtime/types";

const id = { type: "string" };
const confirm = { type: "boolean", description: "Must be true for high-risk or destructive tools" };
const challengeToken = {
  type: "string",
  description: "One-time confirmation token issued by a previous call",
};
const idempotencyKey = { type: "string", description: "Client-supplied idempotency key" };

export const TOOL_CATALOG: McpToolDefinition[] = [
  {
    name: "fairlx_workspace_list",
    description: "List workspaces the authenticated actor can access, including each workspace's organization name",
    inputSchema: { type: "object", properties: { limit: { type: "number" }, cursorAfter: { type: "string" } } },
    riskTier: 1,
    rateClass: "read",
    scopes: ["project:read"],
  },
  {
    name: "fairlx_project_list",
    description: "List projects in a workspace",
    inputSchema: {
      type: "object",
      properties: { workspaceId: id, limit: { type: "number" }, cursorAfter: { type: "string" } },
      required: ["workspaceId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["project:read"],
    permission: PERMISSIONS.VIEW_PROJECT,
  },
  {
    name: "fairlx_project_get",
    description: "Get a project by id",
    inputSchema: { type: "object", properties: { projectId: id }, required: ["projectId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["project:read"],
    permission: PERMISSIONS.VIEW_PROJECT,
  },
  {
    name: "fairlx_project_members_list",
    description:
      "List project members with display name, email, and role. Complete in one call — do not fetch each member separately.",
    inputSchema: { type: "object", properties: { projectId: id }, required: ["projectId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["project:read"],
    permission: PERMISSIONS.VIEW_MEMBERS,
  },
  {
    name: "fairlx_project_member_add",
    description:
      "Add a workspace member to this project so they appear on Teams & Members. Use this when asked to add someone to the project from the workspace. Team is optional. They must already be in the workspace. Wait for the user to Accept. Do not send them to Settings.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        name: { type: "string", description: "Person's display name" },
        email: { type: "string", description: "Email if the name is ambiguous" },
        teamId: id,
        teamName: { type: "string", description: "Optional team name if they should also join a team" },
        teamRole: { type: "string", description: "Optional. Use Lead for team lead; otherwise member." },
      },
      required: ["projectId"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.MANAGE_TEAMS,
  },
  {
    name: "fairlx_work_item_list",
    description:
      "List work items in a project. location is backlog (no sprint) or sprint — that is the Backlog board, not Unassigned. Pass backlog=true for the project Backlog; pass sprintId for one sprint; omit both for the whole project. Unassigned means no person (unassigned=true). Never use fairlx_personal_backlog_list for the project Backlog. One call auto-completes small projects. Paginate only when hasMore is true.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        sprintId: id,
        backlog: {
          type: "boolean",
          description:
            "Only items with no sprint — the project Backlog board. Not Unassigned and not the personal backlog tool.",
        },
        status: { type: "string" },
        type: { type: "string" },
        unassigned: {
          type: "boolean",
          description: "Only items with no current project member, matching the Kanban Unassigned label",
        },
        assigneeId: {
          type: "string",
          description: "Filter by assignee name, email, or id. Do not use this to assign work.",
        },
        withoutEpic: {
          type: "boolean",
          description: "Only stories/tasks/bugs that have no parent epic.",
        },
        limit: { type: "number" },
        cursorAfter: { type: "string" },
      },
      required: ["projectId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },
  {
    name: "fairlx_work_item_get",
    description: "Get a work item by document id or key (SCHO-1). Never pass a project or workspace id.",
    inputSchema: { type: "object", properties: { workItemId: id }, required: ["workItemId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },
  {
    name: "fairlx_sprint_list",
    description:
      "List sprints in a project. Call once and omit status — do not fan out ACTIVE, PLANNED, and ALL. status ALL is ignored. For assign/unassign, skip this and call fairlx_work_item_bulk_update.",
    inputSchema: {
      type: "object",
      properties: { projectId: id, status: { type: "string" }, limit: { type: "number" }, cursorAfter: { type: "string" } },
      required: ["projectId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["sprints:read"],
    permission: PERMISSIONS.VIEW_SPRINTS,
  },
  {
    name: "fairlx_sprint_get",
    description: "Get a sprint by id",
    inputSchema: { type: "object", properties: { sprintId: id }, required: ["sprintId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["sprints:read"],
    permission: PERMISSIONS.VIEW_SPRINTS,
  },
  {
    name: "fairlx_link_list",
    description: "List work-item links for a work item or project",
    inputSchema: {
      type: "object",
      properties: { workItemId: id, projectId: id, limit: { type: "number" } },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },
  {
    name: "fairlx_comment_list",
    description: "List comments on a work item",
    inputSchema: { type: "object", properties: { workItemId: id, limit: { type: "number" } }, required: ["workItemId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },
  {
    name: "fairlx_time_log_list",
    description: "List time logs for a work item or project",
    inputSchema: {
      type: "object",
      properties: { workItemId: id, projectId: id, limit: { type: "number" } },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },
  {
    name: "fairlx_doc_list",
    description: "List project documents (metadata)",
    inputSchema: { type: "object", properties: { projectId: id, limit: { type: "number" } }, required: ["projectId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["docs:read"],
    permission: PERMISSIONS.VIEW_DOCS,
  },
  {
    name: "fairlx_doc_get",
    description: "Get a project document by id",
    inputSchema: { type: "object", properties: { docId: id, projectId: id }, required: ["docId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["docs:read"],
    permission: PERMISSIONS.VIEW_DOCS,
  },
  {
    name: "fairlx_workflow_get",
    description: "Get the workflow, statuses, and transitions for a project",
    inputSchema: { type: "object", properties: { projectId: id }, required: ["projectId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["workflows:read"],
    permission: PERMISSIONS.VIEW_PROJECT,
  },
  {
    name: "fairlx_agent_context_get",
    description: "Get a packed agent context for a work item (item, comments, links, sprint, project)",
    inputSchema: { type: "object", properties: { workItemId: id }, required: ["workItemId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },
  {
    name: "fairlx_agent_briefing",
    description:
      "Role-aware daily briefing for the authenticated user (priorities, blockers, unassigned work). Used by Cursor/VS Code Personal Agent queries.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        personaRole: { type: "string", enum: ["tech_lead", "frontend", "qa", "pm"] },
      },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },
  {
    name: "fairlx_agent_next_assignment",
    description: "Return the next open work item the Personal Agent would assign to this user.",
    inputSchema: { type: "object", properties: { projectId: id } },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },
  {
    name: "fairlx_project_create",
    description: "Create a project in a workspace",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: id,
        name: { type: "string" },
        description: { type: "string" },
        boardType: { type: "string", enum: ["SCRUM", "KANBAN", "HYBRID"] },
        confirm,
        idempotencyKey,
      },
      required: ["workspaceId", "name"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.EDIT_SETTINGS,
  },
  {
    name: "fairlx_project_update",
    description: "Update a project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        name: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] },
        confirm,
      },
      required: ["projectId"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.EDIT_SETTINGS,
  },
  {
    name: "fairlx_work_item_create",
    description:
      "Create a work item in this project. type defaults to TASK, priority to MEDIUM, status to TODO. Omit sprintId to put it on the project Backlog. Pass sprintId only when the user named a sprint — never assume the active sprint. Pass assigneeIds as the person's name or email so they appear on the Kanban/backlog — never a project or workspace id. Set storyPoints and dueDate (ISO) when planning. Pass epicId as the parent epic's key or title so the item is not an orphan story.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        title: { type: "string" },
        type: { type: "string", enum: ["TASK", "STORY", "BUG", "EPIC", "SUBTASK", "ISSUE"] },
        priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
        description: { type: "string" },
        sprintId: id,
        assigneeIds: {
          type: "array",
          items: { type: "string" },
          description: "Names or emails of workspace members so the item is not Unassigned on the board.",
        },
        storyPoints: { type: "number" },
        dueDate: { type: "string", description: "ISO date or datetime for the work item deadline" },
        epicId: {
          type: "string",
          description: "Parent epic key (SCHO-1), title, or document id. Required for stories/tasks so they show under an epic.",
        },
        labels: { type: "array", items: { type: "string" }, description: "Labels or tags for the work item" },
        idempotencyKey,
      },
      required: ["projectId", "title"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.CREATE_TASKS,
  },
  {
    name: "fairlx_work_item_update",
    description:
      "Update a work item. workItemId may be the document id or the item key (SCHO-1). Never pass a project or workspace id. assigneeIds may be names or emails; they are stored as workspace membership ids so Kanban and backlog show the person, not Unassigned. Status changes are validated against the project workflow. Pass epicId (epic key or title) to parent the item under an epic.",
    inputSchema: {
      type: "object",
      properties: {
        workItemId: {
          type: "string",
          description: "Work item document id or key such as SCHO-1. Never the project or workspace id.",
        },
        title: { type: "string" },
        status: { type: "string" },
        priority: { type: "string" },
        description: { type: "string" },
        sprintId: id,
        assigneeIds: {
          type: "array",
          items: { type: "string" },
          description: "Names or emails of workspace members. Never a workspace or project id.",
        },
        storyPoints: { type: "number" },
        dueDate: { type: "string", description: "ISO date or datetime for the work item deadline" },
        epicId: {
          type: "string",
          description: "Parent epic key (SCHO-1) or title. Pass none to clear.",
        },
        labels: { type: "array", items: { type: "string" }, description: "Labels or tags for the work item" },
      },
      required: ["workItemId"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },
  {
    name: "fairlx_work_item_bulk_update",
    description:
      "Assign or update many work items in one call. Do not list items first. To unassign every work item in every sprint, pass clearAssignees: true and projectId (assignPercent 0 is the same). To assign every item in a sprint to one person, pass sprintId as the sprint name or number (Sprint 1) and assigneeIds: [\"Name\"] — that replaces assignees and does not need workItemIds. For a share of the project (60%, half), pass assignPercent 1-100 and assigneeIds. To parent every story/task under an epic, pass assignEpics: true and projectId. Otherwise pass workItemIds as keys (SCHO-1).",
    inputSchema: {
      type: "object",
      properties: {
        workItemIds: {
          type: "array",
          items: { type: "string" },
          description: "Work item keys such as SCHO-1, or document ids. Omit when using assignPercent.",
        },
        projectId: id,
        assignPercent: {
          type: "number",
          description:
            "0 clears assignees in the scope. 1-100 is a target share of the project for this person (60 means 13 of 22). Uses board Unassigned items first. Do not invent extra keys.",
        },
        clearAssignees: {
          type: "boolean",
          description:
            "Remove every assignee. With only projectId, clears items in every sprint (not the backlog). With sprintId, clears that sprint. Does not need workItemIds.",
        },
        status: { type: "string" },
        sprintId: {
          type: "string",
          description:
            "Sprint id, name, or number (Sprint 1). Without workItemIds this is the set of items to update, not a field to write.",
        },
        assigneeIds: {
          type: "array",
          items: { type: "string" },
          description: "Names or emails of workspace members so the item is not Unassigned on the board.",
        },
        epicId: {
          type: "string",
          description:
            "Parent epic key or title. With workItemIds, sets that epic on those items. With only projectId, sets it on every child that has no epic.",
        },
        assignEpics: {
          type: "boolean",
          description:
            "Parent every non-epic work item that has no epic. Matches item title to epic title. Does not need workItemIds.",
        },
        priority: { type: "string" },
        confirm,
      },
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },
  {
    name: "fairlx_work_item_split",
    description: "Split a work item into new items and create SPLIT_FROM / SPLIT_TO links",
    inputSchema: {
      type: "object",
      properties: {
        workItemId: id,
        titles: { type: "array", items: { type: "string" } },
        idempotencyKey,
      },
      required: ["workItemId", "titles"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.CREATE_TASKS,
  },
  {
    name: "fairlx_sprint_create",
    description:
      "Create a sprint. The first sprint on a project starts automatically as ACTIVE — do not call fairlx_sprint_start after creating that first sprint.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        name: { type: "string" },
        goal: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        idempotencyKey,
      },
      required: ["projectId", "name"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["sprints:manage"],
    permission: PERMISSIONS.CREATE_SPRINTS,
  },
  {
    name: "fairlx_sprint_start",
    description: "Start a planned sprint. High-risk; requires confirm: true. Not safely retryable.",
    inputSchema: {
      type: "object",
      properties: { sprintId: id, confirm },
      required: ["sprintId"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["sprints:manage"],
    permission: PERMISSIONS.START_SPRINT,
  },
  {
    name: "fairlx_sprint_complete",
    description: "Complete an active sprint. High-risk; requires confirm: true. Not safely retryable.",
    inputSchema: {
      type: "object",
      properties: { sprintId: id, confirm },
      required: ["sprintId"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["sprints:manage"],
    permission: PERMISSIONS.COMPLETE_SPRINT,
  },
  {
    name: "fairlx_link_create",
    description: "Create a work-item link. BLOCKS links are cycle-checked using targetItemId.",
    inputSchema: {
      type: "object",
      properties: {
        sourceItemId: id,
        targetItemId: id,
        linkType: {
          type: "string",
          enum: [
            "BLOCKS",
            "IS_BLOCKED_BY",
            "RELATES_TO",
            "DUPLICATES",
            "IS_DUPLICATED_BY",
            "SPLIT_FROM",
            "SPLIT_TO",
            "CLONED_FROM",
            "CLONED_TO",
            "IS_CHILD_OF",
            "IS_PARENT_OF",
            "CAUSES",
            "IS_CAUSED_BY",
          ],
        },
        description: { type: "string" },
        createInverse: { type: "boolean" },
        idempotencyKey,
      },
      required: ["sourceItemId", "targetItemId", "linkType"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },
  {
    name: "fairlx_comment_add",
    description: "Add a comment to a work item",
    inputSchema: {
      type: "object",
      properties: {
        workItemId: id,
        content: { type: "string" },
        parentId: id,
        idempotencyKey,
      },
      required: ["workItemId", "content"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["comments:write"],
    permission: PERMISSIONS.CREATE_COMMENTS,
  },
  {
    name: "fairlx_comment_update",
    description: "Update a comment",
    inputSchema: {
      type: "object",
      properties: { commentId: id, content: { type: "string" } },
      required: ["commentId", "content"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["comments:write"],
    permission: PERMISSIONS.CREATE_COMMENTS,
  },
  {
    name: "fairlx_time_log_add",
    description: "Add a time log to a work item",
    inputSchema: {
      type: "object",
      properties: {
        workItemId: id,
        loggedHours: { type: "number" },
        logDate: { type: "string" },
        description: { type: "string" },
        isBillable: { type: "boolean" },
        idempotencyKey,
      },
      required: ["workItemId", "loggedHours"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["time:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },
  {
    name: "fairlx_doc_create",
    description:
      "Create one substantial Notion-quality researched markdown study after web_search and web_fetch. At most 2 docs per turn. Each body must be about 1800+ words with 8+ sections, Sources that cite at least 3 public http URLs, Steps, and Risks. Creates without prior web research return research_required — do not save a stub. Creating the same category updates the existing AI doc. In staged mode this waits for Accept.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        title: { type: "string" },
        content: {
          type: "string",
          description: `Full markdown body. Required. ${PROJECT_DOC_MARKDOWN_GUIDE}`,
        },
        category: {
          type: "string",
          enum: [
            "prd",
            "frd",
            "technical_spec",
            "user_stories",
            "design_doc",
            "architecture",
            "api_doc",
            "test_plan",
            "user_guide",
            "srs",
            "brd",
            "release_notes",
            "other",
          ],
        },
        sources: { type: "array", items: { type: "string" }, description: "Paths, work-item keys, URLs, or doc titles used." },
        tags: { type: "array", items: { type: "string" } },
        idempotencyKey,
      },
      required: ["projectId", "title", "content"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["docs:write"],
    permission: PERMISSIONS.CREATE_DOCS,
  },
  {
    name: "fairlx_doc_update",
    description:
      "Update a project document. If content is sent, it must be the full Notion-quality markdown body (title, italic tagline, sections, lists, callouts, Sources/Steps/Risks).",
    inputSchema: {
      type: "object",
      properties: {
        docId: id,
        title: { type: "string" },
        content: { type: "string" },
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        isArchived: { type: "boolean" },
      },
      required: ["docId"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["docs:write"],
    permission: PERMISSIONS.EDIT_DOCS,
  },
  {
    name: "fairlx_custom_field_set",
    description: "Set a custom field value on a work item",
    inputSchema: {
      type: "object",
      properties: { workItemId: id, fieldId: id, value: {} },
      required: ["workItemId", "fieldId"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },
  {
    name: "fairlx_webhook_create",
    description: "Create a project webhook. High-risk; requires confirm: true.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        name: { type: "string" },
        url: { type: "string" },
        events: { type: "array", items: { type: "string" } },
        secret: { type: "string" },
        confirm,
        idempotencyKey,
      },
      required: ["projectId", "name", "url", "events"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.EDIT_SETTINGS,
  },
  {
    name: "fairlx_github_sync",
    description: "Mark connected GitHub repositories as syncing. High-risk; requires confirm: true. Not safely retryable.",
    inputSchema: {
      type: "object",
      properties: { projectId: id, confirm },
      required: ["projectId"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.EDIT_SETTINGS,
  },
  {
    name: "fairlx_project_delete",
    description: "Delete a project. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { projectId: id, confirm, challengeToken },
      required: ["projectId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.DELETE_PROJECT,
  },
  {
    name: "fairlx_work_item_delete",
    description: "Delete a work item. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { workItemId: id, confirm, challengeToken },
      required: ["workItemId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["tasks:delete"],
    permission: PERMISSIONS.DELETE_TASKS,
  },
  {
    name: "fairlx_sprint_delete",
    description: "Delete a sprint. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { sprintId: id, confirm, challengeToken },
      required: ["sprintId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["sprints:manage"],
    permission: PERMISSIONS.DELETE_SPRINTS,
  },
  {
    name: "fairlx_link_delete",
    description: "Delete a work-item link. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { linkId: id, confirm, challengeToken },
      required: ["linkId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },
  {
    name: "fairlx_comment_delete",
    description: "Delete a comment. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { commentId: id, confirm, challengeToken },
      required: ["commentId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["comments:write"],
    permission: PERMISSIONS.DELETE_COMMENTS,
  },
  {
    name: "fairlx_time_log_delete",
    description: "Delete a time log. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { timeLogId: id, confirm, challengeToken },
      required: ["timeLogId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["time:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },
  {
    name: "fairlx_doc_delete",
    description: "Delete a project document. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { docId: id, confirm, challengeToken },
      required: ["docId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["docs:write"],
    permission: PERMISSIONS.DELETE_DOCS,
  },
  // ═══════════════════════════════════════════════════════════════════
  // NEW TOOLS — Full MCP Coverage
  // ═══════════════════════════════════════════════════════════════════

  // ── Workspace Members ──
  {
    name: "fairlx_workspace_members_list",
    description:
      "List workspace members with display name, email, role, and status (same data as the Members page). Complete in one call — do not follow up with fairlx_workspace_member_get for each member. To change a role, call fairlx_workspace_member_update.",
    inputSchema: {
      type: "object",
      properties: { workspaceId: id, limit: { type: "number" }, cursorAfter: { type: "string" } },
      required: ["workspaceId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["members:read"],
    permission: PERMISSIONS.VIEW_MEMBERS,
  },
  {
    name: "fairlx_workspace_member_get",
    description:
      "Get one workspace member by membership document ID. Prefer fairlx_workspace_members_list when you need everyone — that list already includes name and email.",
    inputSchema: { type: "object", properties: { memberId: id }, required: ["memberId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["members:read"],
    permission: PERMISSIONS.VIEW_MEMBERS,
  },
  {
    name: "fairlx_workspace_member_update",
    description:
      "Change a workspace member's role (ADMIN, MEMBER, or OWNER). Find them by name or email — the same people as the Members page. Use this instead of sending the user to the Members UI.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: id,
        name: { type: "string", description: "Display name as shown on the Members page" },
        email: { type: "string", description: "Email if the name is ambiguous" },
        role: { type: "string", description: "ADMIN, MEMBER, or OWNER" },
      },
      required: ["role"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
  },
  {
    name: "fairlx_workspace_member_add",
    description:
      "Add a person to this workspace by name or email. Organization and workspace are different — pass workspaceId, never an organization id. If they are already in the organization, add them to this workspace. If they are not, a workspace admin invites them to the organization AND this workspace in one call. Do not wait for the organization owner. Role defaults to MEMBER. Use ADMIN for a lead developer. Then add them to the project team if asked. Wait for the user to Accept. Do not send them to Settings.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: id,
        name: { type: "string", description: "Display name as shown in the organization" },
        email: { type: "string", description: "Email if the name is ambiguous" },
        role: { type: "string", description: "ADMIN, MEMBER, or OWNER. Defaults to MEMBER." },
      },
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
  },
  {
    name: "fairlx_workspace_member_remove",
    description:
      "Remove a workspace member by name or email. Cannot remove the owner or the last member. Wait for the user to Accept.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: id,
        name: { type: "string" },
        email: { type: "string" },
      },
    },
    riskTier: 3,
    rateClass: "destructive",
    scopes: ["admin:manage"],
  },
  {
    name: "fairlx_organization_members_list",
    description:
      "List organization members for the organization that owns this workspace. Pass workspaceId or organizationId. Do not treat the workspace as the organization. Prefer fairlx_workspace_member_add with an email when inviting someone new.",
    inputSchema: {
      type: "object",
      properties: { workspaceId: id, organizationId: id },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["members:read"],
  },
  {
    name: "fairlx_organization_get",
    description:
      "Get the organization (company) that owns this workspace: name, member count, and the actor's org permissions. Organization and workspace are different. Anyone in the org or in an org workspace can read this. Answer “what is the organization name?” from this or from context — do not say it is not surfaced.",
    inputSchema: {
      type: "object",
      properties: { workspaceId: id, organizationId: id },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["project:read"],
  },
  {
    name: "fairlx_organization_list",
    description: "List organizations the authenticated user belongs to, with name and org role.",
    inputSchema: { type: "object", properties: {} },
    riskTier: 1,
    rateClass: "read",
    scopes: ["project:read"],
  },
  {
    name: "fairlx_organization_workspaces_list",
    description:
      "List workspaces in the organization. Members see workspaces they belong to. Org owners and workspace-assign can see all org workspaces.",
    inputSchema: {
      type: "object",
      properties: { workspaceId: id, organizationId: id },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["project:read"],
  },
  {
    name: "fairlx_organization_update",
    description:
      "Rename the organization. Requires organization settings permission (org RBAC), not only workspace admin. Wait for the user to Accept.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "New organization name" },
        workspaceId: id,
        organizationId: id,
      },
      required: ["name"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
  },
  {
    name: "fairlx_department_list",
    description:
      "List organization departments and the org permissions each department owns. Departments are how Fairlx grants org-level access (billing, members, settings). Pass workspaceId or organizationId.",
    inputSchema: {
      type: "object",
      properties: { workspaceId: id, organizationId: id },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["admin:manage"],
  },
  {
    name: "fairlx_department_create",
    description:
      "Create one or more organization departments and optionally attach org permission keys (org.members.view, org.billing.manage, …). Requires org.departments.manage. Wait for the user to Accept. Pass departments=[{name, permissions}] to create several at once.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: id,
        organizationId: id,
        name: { type: "string", description: "Department name when creating one" },
        description: { type: "string" },
        color: { type: "string", description: "Hex color like #4F46E5" },
        permissions: {
          type: "array",
          items: { type: "string" },
          description: "Org permission keys to grant this department",
        },
        departments: {
          type: "array",
          description: "Create several departments in one call",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              color: { type: "string" },
              permissions: { type: "array", items: { type: "string" } },
            },
            required: ["name"],
          },
        },
      },
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
  },
  {
    name: "fairlx_department_permission_add",
    description:
      "Add org permission keys to an existing department (by name or id). Requires org.departments.manage. Wait for the user to Accept.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: id,
        organizationId: id,
        departmentId: id,
        departmentName: { type: "string" },
        permissionKey: { type: "string" },
        permissions: { type: "array", items: { type: "string" } },
      },
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
  },

  // ── Workspace Details ──
  {
    name: "fairlx_workspace_get",
    description: "Get a workspace by ID, including the organization name when this workspace belongs to an organization",
    inputSchema: { type: "object", properties: { workspaceId: id }, required: ["workspaceId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["project:read"],
  },
  {
    name: "fairlx_workspace_invite_get",
    description:
      "Get the workspace invite / join link (the same URL as Members → Quick Invite). Use this when the user wants to invite someone. Return inviteUrl to the user. Organization workspaces disable invite links — add the person with fairlx_workspace_member_add instead of sending the user to Settings.",
    inputSchema: { type: "object", properties: { workspaceId: id }, required: ["workspaceId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["members:read"],
    permission: PERMISSIONS.VIEW_MEMBERS,
  },

  // ── Subtasks ──
  {
    name: "fairlx_subtask_list",
    description: "List subtasks (checklist items) of a work item",
    inputSchema: {
      type: "object",
      properties: { workItemId: id, limit: { type: "number" } },
      required: ["workItemId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },
  {
    name: "fairlx_subtask_create",
    description: "Create a subtask on a work item",
    inputSchema: {
      type: "object",
      properties: {
        workItemId: id,
        title: { type: "string" },
        idempotencyKey,
      },
      required: ["workItemId", "title"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },
  {
    name: "fairlx_subtask_update",
    description: "Update a subtask (toggle completion, rename)",
    inputSchema: {
      type: "object",
      properties: {
        subtaskId: id,
        title: { type: "string" },
        isCompleted: { type: "boolean" },
      },
      required: ["subtaskId"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },
  {
    name: "fairlx_subtask_delete",
    description: "Delete a subtask. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { subtaskId: id, confirm, challengeToken },
      required: ["subtaskId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["tasks:write"],
    permission: PERMISSIONS.EDIT_TASKS,
  },

  // ── Notifications ──
  {
    name: "fairlx_notification_list",
    description: "List notifications for the authenticated user",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: id,
        isRead: { type: "boolean" },
        limit: { type: "number" },
        cursorAfter: { type: "string" },
      },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["notifications:read"],
  },
  {
    name: "fairlx_notification_mark_read",
    description: "Mark one or all notifications as read",
    inputSchema: {
      type: "object",
      properties: {
        notificationId: id,
        markAll: { type: "boolean", description: "If true, marks all unread notifications as read" },
        workspaceId: id,
      },
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["notifications:write"],
  },

  // ── Saved Views ──
  {
    name: "fairlx_saved_view_list",
    description: "List saved views / filters in a project",
    inputSchema: {
      type: "object",
      properties: { projectId: id, limit: { type: "number" } },
      required: ["projectId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["views:read"],
    permission: PERMISSIONS.VIEW_VIEWS,
  },
  {
    name: "fairlx_saved_view_get",
    description: "Get a saved view by ID",
    inputSchema: { type: "object", properties: { viewId: id }, required: ["viewId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["views:read"],
    permission: PERMISSIONS.VIEW_VIEWS,
  },
  {
    name: "fairlx_saved_view_create",
    description: "Create a saved view / filter for a project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        name: { type: "string" },
        filters: { type: "string", description: "JSON-encoded filter configuration" },
        isShared: { type: "boolean" },
        idempotencyKey,
      },
      required: ["projectId", "name"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["views:write"],
    permission: PERMISSIONS.CREATE_VIEWS,
  },
  {
    name: "fairlx_saved_view_delete",
    description: "Delete a saved view. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { viewId: id, confirm, challengeToken },
      required: ["viewId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["views:write"],
    permission: PERMISSIONS.DELETE_VIEWS,
  },

  // ── Custom Fields (listing) ──
  {
    name: "fairlx_custom_field_list",
    description: "List custom field definitions for a project",
    inputSchema: {
      type: "object",
      properties: { projectId: id, limit: { type: "number" } },
      required: ["projectId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
    permission: PERMISSIONS.VIEW_TASKS,
  },

  // ── Project Teams ──
  {
    name: "fairlx_project_team_list",
    description:
      "List teams in a project. To create a team, call fairlx_project_team_create instead of sending the user to Settings.",
    inputSchema: {
      type: "object",
      properties: { projectId: id, limit: { type: "number" } },
      required: ["projectId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["members:read"],
    permission: PERMISSIONS.VIEW_MEMBERS,
  },
  {
    name: "fairlx_project_team_members_list",
    description: "List members of a specific project team",
    inputSchema: {
      type: "object",
      properties: { teamId: id, projectId: id, limit: { type: "number" } },
      required: ["teamId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["members:read"],
    permission: PERMISSIONS.VIEW_MEMBERS,
  },
  {
    name: "fairlx_project_team_create",
    description:
      "Create a team in this project (for example Developers). Wait for the user to Accept. Do not send them to Settings → Teams.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: id,
        name: { type: "string", description: "Team name, e.g. Developers" },
        description: { type: "string" },
        color: { type: "string", description: "Hex color like #4F46E5" },
      },
      required: ["projectId", "name"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.MANAGE_TEAMS,
  },
  {
    name: "fairlx_project_team_update",
    description: "Rename a project team or change its description or color. Wait for the user to Accept.",
    inputSchema: {
      type: "object",
      properties: {
        teamId: id,
        name: { type: "string" },
        description: { type: "string" },
        color: { type: "string", description: "Hex color like #4F46E5" },
      },
      required: ["teamId"],
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.MANAGE_TEAMS,
  },
  {
    name: "fairlx_project_team_delete",
    description: "Delete a project team and its memberships. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { teamId: id, confirm, challengeToken },
      required: ["teamId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.MANAGE_TEAMS,
  },
  {
    name: "fairlx_project_team_member_add",
    description:
      "Add a workspace member to a project team by name or email, and also add them as a project member so they appear on Teams & Members. Use teamId from a create/list result, or projectId plus teamName. They must already be in the workspace. Wait for the user to Accept. Do not send them to Settings.",
    inputSchema: {
      type: "object",
      properties: {
        teamId: id,
        projectId: id,
        teamName: { type: "string", description: "Team name if teamId is not known" },
        name: { type: "string", description: "Person's display name" },
        email: { type: "string", description: "Email if the name is ambiguous" },
        teamRole: { type: "string", description: "Optional. Use Lead for team lead; otherwise member." },
      },
    },
    riskTier: 3,
    rateClass: "write",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.MANAGE_TEAMS,
  },
  {
    name: "fairlx_project_team_member_remove",
    description: "Remove a person from a project team by name or email. Wait for the user to Accept.",
    inputSchema: {
      type: "object",
      properties: {
        teamId: id,
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["teamId"],
    },
    riskTier: 3,
    rateClass: "destructive",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.MANAGE_TEAMS,
  },

  // ── Spaces ──
  {
    name: "fairlx_space_list",
    description: "List spaces in a workspace",
    inputSchema: {
      type: "object",
      properties: { workspaceId: id, limit: { type: "number" }, cursorAfter: { type: "string" } },
      required: ["workspaceId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["spaces:read"],
  },
  {
    name: "fairlx_space_get",
    description: "Get a space by ID",
    inputSchema: { type: "object", properties: { spaceId: id }, required: ["spaceId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["spaces:read"],
  },

  // ── Programs & Milestones ──
  {
    name: "fairlx_program_list",
    description: "List programs in a workspace",
    inputSchema: {
      type: "object",
      properties: { workspaceId: id, limit: { type: "number" }, cursorAfter: { type: "string" } },
      required: ["workspaceId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["programs:read"],
  },
  {
    name: "fairlx_program_get",
    description: "Get a program by ID",
    inputSchema: { type: "object", properties: { programId: id }, required: ["programId"] },
    riskTier: 1,
    rateClass: "read",
    scopes: ["programs:read"],
  },
  {
    name: "fairlx_program_milestone_list",
    description: "List milestones for a program",
    inputSchema: {
      type: "object",
      properties: { programId: id, limit: { type: "number" } },
      required: ["programId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["programs:read"],
  },

  // ── Personal Backlog ──
  {
    name: "fairlx_personal_backlog_list",
    description:
      "List the authenticated user's personal notes backlog. This is NOT the project Backlog board. For project backlog work items use fairlx_work_item_list with backlog=true.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" }, cursorAfter: { type: "string" } },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["tasks:read"],
  },

  // ── Audit Logs ──
  {
    name: "fairlx_audit_log_list",
    description: "List organization / workspace audit logs",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: id,
        actionType: { type: "string" },
        limit: { type: "number" },
        cursorAfter: { type: "string" },
      },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["audit:read"],
  },

  // ── Attachments ──
  {
    name: "fairlx_attachment_list",
    description: "List attachments on a work item",
    inputSchema: {
      type: "object",
      properties: { workItemId: id, limit: { type: "number" } },
      required: ["workItemId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["attachments:read"],
    permission: PERMISSIONS.VIEW_ATTACHMENTS,
  },

  // ── Webhook Management (complete CRUD) ──
  {
    name: "fairlx_webhook_list",
    description: "List webhooks for a project",
    inputSchema: {
      type: "object",
      properties: { projectId: id, limit: { type: "number" } },
      required: ["projectId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.EDIT_SETTINGS,
  },
  {
    name: "fairlx_webhook_delete",
    description: "Delete a webhook. Destructive; requires confirm: true and challengeToken.",
    inputSchema: {
      type: "object",
      properties: { webhookId: id, confirm, challengeToken },
      required: ["webhookId"],
    },
    riskTier: 4,
    rateClass: "destructive",
    scopes: ["admin:manage"],
    permission: PERMISSIONS.EDIT_SETTINGS,
  },

  // ── GitHub Repos ──
  {
    name: "fairlx_github_repo_list",
    description: "List connected GitHub repositories for a project",
    inputSchema: {
      type: "object",
      properties: { projectId: id, limit: { type: "number" } },
      required: ["projectId"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["project:read"],
    permission: PERMISSIONS.VIEW_PROJECT,
  },

  // ── Sprint Update ──
  {
    name: "fairlx_sprint_update",
    description: "Update a sprint (name, goal, dates)",
    inputSchema: {
      type: "object",
      properties: {
        sprintId: id,
        name: { type: "string" },
        goal: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
      },
      required: ["sprintId"],
    },
    riskTier: 2,
    rateClass: "write",
    scopes: ["sprints:manage"],
    permission: PERMISSIONS.EDIT_SPRINTS,
  },

  // ── Personal Agent harness (global MCP for the authenticated user) ──
  {
    name: "fairlx_personal_harness_get",
    description: "Get this user's Fairlx Agent harness summary (skills, rules, automations, staging)",
    inputSchema: { type: "object", properties: {} },
    riskTier: 1,
    rateClass: "read",
    scopes: [],
  },
  {
    name: "fairlx_personal_search",
    description: "Search the user's personal skills, knowledge, rules, automations, and chats",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        kind: {
          type: "string",
          enum: ["skills", "knowledge", "rules", "automations", "chats", "staging", "all"],
        },
      },
      required: ["query"],
    },
    riskTier: 1,
    rateClass: "read",
    scopes: [],
  },
  {
    name: "fairlx_personal_skill_list",
    description: "List Agent harness skills for the authenticated user",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
    riskTier: 1,
    rateClass: "read",
    scopes: [],
  },
  {
    name: "fairlx_personal_knowledge_list",
    description: "List personal knowledge-base notes for the authenticated user",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
    riskTier: 1,
    rateClass: "read",
    scopes: [],
  },
  {
    name: "fairlx_personal_chat_list",
    description: "List Fairlx Agent chats (runs) for the authenticated user",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    riskTier: 1,
    rateClass: "read",
    scopes: [],
  },
  {
    name: "fairlx_usage_summary",
    description:
      "Get billed usage, wallet balance, and AI spend for this workspace or the organization. Returns totals, cost by purpose (agent chat, docs, GitHub, traffic, storage), and cost by model (Grok 4.6, GPT-5.6 Luna, DeepSeek). Use for billing, usage, spend, invoices, wallet, org bill, or “how much did Grok/Luna cost”. Pass organizationId (or scope=organization) for the org bill; omit ids to use the current workspace. period is YYYY-MM. Do not search the harness for billing.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: id,
        organizationId: id,
        scope: { type: "string", description: "workspace or organization" },
        period: { type: "string", description: "Billing month YYYY-MM. Defaults to the current month." },
      },
    },
    riskTier: 1,
    rateClass: "read",
    scopes: ["billing:read"],
  },
];

const TOOL_NAME_ALIASES: Record<string, string> = {
  create_department: "fairlx_department_create",
  org_department_create: "fairlx_department_create",
  department_create: "fairlx_department_create",
  list_departments: "fairlx_department_list",
  department_list: "fairlx_department_list",
  add_permission: "fairlx_department_permission_add",
  create_permission: "fairlx_department_permission_add",
  assign_permission: "fairlx_department_permission_add",
  permission_grant: "fairlx_department_permission_add",
  department_permission_add: "fairlx_department_permission_add",
  usage_summary: "fairlx_usage_summary",
  billing_usage: "fairlx_usage_summary",
  org_bill: "fairlx_usage_summary",
  wallet_get: "fairlx_usage_summary",
};

export function getToolDefinition(name: string): McpToolDefinition | undefined {
  const canonical = TOOL_NAME_ALIASES[name] || TOOL_NAME_ALIASES[name.replace(/^fairlx_/, "")] || name;
  return TOOL_CATALOG.find((tool) => tool.name === name || tool.name === canonical);
}

export function listToolsForClient(auth?: Pick<AuthContext, "scopes" | "projectPermissions">) {
  const tools = auth
    ? TOOL_CATALOG.filter((tool) => isToolAllowedForAuth(tool, auth))
    : TOOL_CATALOG;
  return tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}
