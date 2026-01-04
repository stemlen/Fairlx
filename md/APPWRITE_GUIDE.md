# Appwrite Guide (Scrumpty)

This document describes the Appwrite setup for Scrumpty: required environment variables, database collections with attributes and constraints, storage buckets, and messaging/SMTP configuration.

> Note: This guide reflects the current codebase. If you change the schema in Appwrite, please update this file.

## Environment Variables (Appwrite)
Set these in `.env.local` and your production environment:
```

NEXT_PUBLIC_APPWRITE_ENDPOINT=
NEXT_PUBLIC_APPWRITE_PROJECT=
NEXT_APPWRITE_KEY=
NEXT_PUBLIC_APPWRITE_DATABASE_ID=
NEXT_PUBLIC_APPWRITE_WORKSPACES_ID=
NEXT_PUBLIC_APPWRITE_MEMBERS_ID=
NEXT_PUBLIC_APPWRITE_PROJECTS_ID=
NEXT_PUBLIC_APPWRITE_TASKS_ID=
NEXT_PUBLIC_APPWRITE_TIME_LOGS_ID=
NEXT_PUBLIC_APPWRITE_SPRINTS_ID=
NEXT_PUBLIC_APPWRITE_WORK_ITEMS_ID=
NEXT_PUBLIC_APPWRITE_PERSONAL_BACKLOG_ID=
NEXT_PUBLIC_APPWRITE_CUSTOM_COLUMNS_ID=
NEXT_PUBLIC_APPWRITE_DEFAULT_COLUMN_SETTINGS_ID=
NEXT_PUBLIC_APPWRITE_NOTIFICATIONS_ID=
NEXT_PUBLIC_APPWRITE_SUBTASKS_ID=
NEXT_PUBLIC_APPWRITE_ATTACHMENTS_ID=
NEXT_PUBLIC_APPWRITE_COMMENTS_ID=
NEXT_PUBLIC_APPWRITE_GITHUB_REPOS_ID=
NEXT_PUBLIC_APPWRITE_CODE_DOCS_ID=
NEXT_PUBLIC_APPWRITE_PROJECT_DOCS_ID=
NEXT_PUBLIC_APPWRITE_TEAMS_ID=
NEXT_PUBLIC_APPWRITE_TEAM_MEMBERS_ID=
NEXT_PUBLIC_APPWRITE_PROGRAMS_ID=
NEXT_PUBLIC_APPWRITE_CUSTOM_ROLES_ID=
NEXT_PUBLIC_APPWRITE_SMTP_PROVIDER_ID=
NEXT_PUBLIC_APPWRITE_EMAIL_TOPIC_ID=
NEXT_PUBLIC_APPWRITE_SPACES_ID=
NEXT_PUBLIC_APPWRITE_SPACE_MEMBERS_ID=
NEXT_PUBLIC_APPWRITE_WORKFLOWS_ID=
NEXT_PUBLIC_APPWRITE_WORKFLOW_STATUSES_ID=
NEXT_PUBLIC_APPWRITE_WORKFLOW_TRANSITIONS_ID=
NEXT_PUBLIC_APPWRITE_IMAGES_BUCKET_ID=
NEXT_PUBLIC_APPWRITE_ATTACHMENTS_BUCKET_ID=
NEXT_PUBLIC_APPWRITE_PROJECT_DOCS_BUCKET_ID=
```

## Storage Buckets
1) **images** (`images`) — avatars/logos; max 5MB; extensions: jpg, jpeg, png, gif, svg, webp.
2) **attachments_bucket** (`attachments_bucket`) — work item attachments; max 50MB; extensions: jpeg, png, svg, gif, html, pdf, mp4, txt, doc, docx, xls, xlsx, ppt, pptx, zip, rar, css, js, json, xml, jpg.
3) **project-docs** (`project-docs`) — project documents; max 5GB; any extension.

## Database Schema (Collections & Key Attributes)
Below are the collections implied by the codebase. Use `string` for text, `integer`/`float` for numbers, `boolean` for flags, `datetime` for ISO strings, and `string[]` for arrays. Required fields are marked **(req)**. Suggested max lengths are provided where appropriate.

### workspaces
- name **(req, string, 100)**
- imageUrl **(string, 500)**
- inviteCode **(string, 64)**
- userId **(req, string, 64)** (owner)
- uiMode **(enum: SIMPLE|ADVANCED, default ADVANCED)** - UI complexity mode
- enabledFeatures **(string, 1000)** - JSON object of enabled features

### members
- workspaceId **(req, string, 64)**
- userId **(req, string, 64)**
- role **(req, enum: ADMIN|MEMBER)**
- name **(string, 120)**
- email **(string, 254)**
- profileImageUrl **(string, 500)**

### spaces
- name **(req, string, 120)**
- key **(req, string, 16)** (unique per workspace)
- description **(string, 2000)**
- workspaceId **(req, string, 64)**
- visibility **(req, enum: PUBLIC|PRIVATE)**
- template **(req, enum: SOFTWARE|KANBAN_ONLY|MARKETING|OPERATIONS|CUSTOM)**
- imageUrl **(string, 500)**
- color **(string, 16)** (hex)
- ownerId **(req, string, 64)**
- defaultWorkflowId **(string, 64)**
- position **(req, integer)**
- archived **(req, boolean, default false)**

### space_members
- spaceId **(req, string, 64)**
- memberId **(req, string, 64)** (workspace member ref)
- userId **(req, string, 64)**
- role **(req, enum: ADMIN|MEMBER|VIEWER)**
- joinedAt **(req, datetime)**

### programs
- name **(req, string, 160)**
- description **(string, 2000)**
- workspaceId **(req, string, 64)**
- programLeadId **(string, 64)**
- imageUrl **(string, 500)**
- startDate **(datetime)**
- endDate **(datetime)**
- status **(req, enum: PLANNING|ACTIVE|ON_HOLD|COMPLETED|CANCELLED)**
- createdBy **(req, string, 64)**
- lastModifiedBy **(string, 64)**

### teams
- name **(req, string, 160)**
- description **(string, 2000)**
- workspaceId **(req, string, 64)**
- programId **(string, 64)**
- teamLeadId **(string, 64)**
- imageUrl **(string, 500)**
- visibility **(req, enum: ALL|PROGRAM_ONLY|TEAM_ONLY)**
- createdBy **(req, string, 64)**
- lastModifiedBy **(string, 64)**

### team_members
- teamId **(req, string, 64)**
- memberId **(req, string, 64)** (workspace member ref)
- role **(req, enum: LEAD|MEMBER|CUSTOM)**
- customRoleId **(string, 64)**
- availability **(req, enum: FULL_TIME|PART_TIME|CONTRACTOR)**
- joinedAt **(req, datetime)**
- leftAt **(datetime)**
- isActive **(req, boolean)**
- lastModifiedBy **(string, 64)**

### custom_roles
- teamId **(req, string, 64)**
- name **(req, string, 120)**
- description **(string, 500)**
- color **(string, 16)**
- permissions **(req, string[])** (values from TeamPermission)
- isDefault **(boolean)**
- createdBy **(req, string, 64)**
- lastModifiedBy **(string, 64)**

### projects
- name **(req, string, 160)**
- description **(string, 2000)**
- imageUrl **(string, 500)**
- workspaceId **(req, string, 64)**
- spaceId **(string, 64)**
- deadline **(datetime)**
- assignedTeamIds **(string[])**
- boardType **(req, enum: SCRUM|KANBAN|HYBRID)**
- key **(string, 16)**
- status **(enum: ACTIVE|ON_HOLD|COMPLETED|ARCHIVED)**
- workflowId **(string, 64)**
- defaultAssigneeId **(string, 64)**
- autoAssignToCreator **(boolean)**
- enableTimeTracking **(boolean)**
- wipLimits **(json)** (map of status->limit)
- defaultSwimlane **(string, 32)**
- defaultSprintDuration **(integer)**
- sprintStartDay **(integer)**
- color **(string, 16)**
- position **(integer)**

### workflows
- name **(req, string, 160)**
- key **(req, string, 50)**
- description **(string, 1000)**
- workspaceId **(req, string, 64)**
- spaceId **(string, 64)**
- projectId **(string, 64)**
- initialStatusId **(string, 64)**
- isDefault **(boolean, default: false)**
- isSystem **(boolean, default: false)**
- isArchived **(boolean, default: false)**

### workflow_statuses
- workflowId **(req, string, 64)**
- name **(req, string, 128)**
- key **(req, string, 50)**
- category **(req, enum: TODO|ASSIGNED|IN_PROGRESS|IN_REVIEW|DONE)**
- color **(string, 7)** (hex color)
- description **(string, 500)**
- position **(req, integer)**
- positionX **(integer, default: 0)** (for visual editor)
- positionY **(integer, default: 0)** (for visual editor)
- isInitial **(boolean, default: false)**
- isFinal **(boolean, default: false)**

### workflow_transitions
- workflowId **(req, string, 64)**
- fromStatusId **(req, string, 64)**
- toStatusId **(req, string, 64)**
- name **(string, 128)**
- description **(string, 500)**
- requiredFields **(string[], size: 100)**
- allowedRoles **(string[], size: 500)**
- autoAssign **(boolean, default: false)**

### custom_columns (custom fields definitions)
- name **(req, string, 160)**
- key **(req, string, 64, unique per scope)**
- description **(string, 500)**
- type **(req, enum: TEXT|TEXTAREA|NUMBER|DATE|DATETIME|SELECT|MULTI_SELECT|USER|USERS|CHECKBOX|URL|EMAIL|CURRENCY|PERCENTAGE|LABELS)**
- scope **(req, enum: WORKSPACE|SPACE|PROJECT)**
- workspaceId **(req, string, 64)**
- spaceId **(string, 64)**
- projectId **(string, 64)**
- isRequired **(req, boolean)**
- defaultValue **(string/json)**
- placeholder **(string, 200)**
- options **(json array)** (for select fields)
- minValue **(float)**
- maxValue **(float)**
- precision **(integer)**
- currencySymbol **(string, 8)**
- currencyCode **(string, 8)**
- appliesToTypes **(string[])** (e.g., TASK, BUG, STORY)
- position **(req, integer)**
- showInList **(boolean)**
- showInCard **(boolean)**
- archived **(req, boolean)**

### default_column_settings
- workspaceId **(req, string, 64)**
- projectId **(string, 64)**
- settings **(json)** (default columns per board)

### work_items (primary work item collection)
- key **(req, string, 32)** (e.g., PROJ-123)
- title **(req, string, 300)**
- type **(req, enum: STORY|BUG|TASK|EPIC|SUBTASK)**
- status **(req, enum: TODO|ASSIGNED|IN_PROGRESS|IN_REVIEW|DONE or workflow status key)**
- statusId **(string, 64)** (custom workflow status)
- priority **(req, enum: LOW|MEDIUM|HIGH|URGENT)**
- storyPoints **(float)**
- workspaceId **(req, string, 64)**
- projectId **(req, string, 64)**
- spaceId **(string, 64)**
- sprintId **(string, 64)**
- epicId **(string, 64)**
- parentId **(string, 64)** (for subtasks)
- assigneeIds **(req, string[])**
- reporterId **(string, 64)**
- description **(string, 10000)**
- flagged **(req, boolean)**
- position **(req, integer)**
- dueDate **(datetime)**
- startDate **(datetime)**
- estimatedHours **(float)**
- remainingHours **(float)**
- labels **(string[])**
- components **(string[])**
- customFields **(json array)** (list of { fieldId, value })

### tasks (legacy/compat collection)
- title **(req, string, 300)**
- name **(string, 300)** (alias)
- key **(string, 32)**
- type **(string, 32)**
- status **(req, string)** (enum or custom column id)
- workspaceId **(req, string, 64)**
- assigneeId **(string, 64)**
- assigneeIds **(req, string[])**
- assignedTeamId **(string, 64)**
- assignedTeamIds **(string[])**
- projectId **(req, string, 64)**
- spaceId **(string, 64)**
- sprintId **(string, 64)**
- position **(req, integer)**
- dueDate **(datetime)**
- startDate **(datetime)**
- endDate **(datetime)**
- description **(string, 10000)**
- estimatedHours **(float)**
- remainingHours **(float)**
- priority **(enum: LOW|MEDIUM|HIGH|URGENT)**
- labels **(string[])**
- flagged **(boolean)**
- commentCount **(integer)**
- storyPoints **(float)**
- reporterId **(string, 64)**

### sprints
- name **(req, string, 160)**
- workspaceId **(req, string, 64)**
- projectId **(req, string, 64)**
- status **(req, enum: PLANNED|ACTIVE|COMPLETED|CANCELLED)**
- startDate **(datetime)**
- endDate **(datetime)**
- goal **(string, 1000)**
- position **(req, integer)**
- completedPoints **(float)**
- totalPoints **(float)**
- velocity **(float)**

### subtasks
- title **(req, string, 300)**
- description **(string, 2000)**
- workItemId **(req, string, 64)**
- workspaceId **(req, string, 64)**
- completed **(boolean)**
- position **(req, integer)**
- createdBy **(req, string, 64)**
- assigneeId **(string, 64)**
- status **(enum: TODO|IN_PROGRESS|DONE)**
- dueDate **(datetime)**
- estimatedHours **(float)**
- priority **(enum: LOW|MEDIUM|HIGH|URGENT)**

### comments
- content **(req, string, 5000)**
- taskId **(req, string, 64)** (or workItemId)
- workspaceId **(req, string, 64)**
- authorId **(req, string, 64)**
- isEdited **(req, boolean)**
- parentId **(string, 64)**

### attachments
- name **(req, string, 300)**
- size **(req, integer)** (bytes)
- mimeType **(req, string, 120)**
- fileId **(req, string, 64)** (Appwrite file id)
- taskId **(req, string, 64)** (or workItemId)
- workspaceId **(req, string, 64)**
- uploadedBy **(req, string, 64)**
- uploadedAt **(req, datetime)**
- url **(string, 2000)**

### notifications
- userId **(req, string, 64)**
- type **(req, enum)** (see `NotificationType` in code)
- title **(req, string, 300)**
- message **(req, string, 1000)**
- read **(req, boolean)**
- taskId **(string, 64)**
- workspaceId **(req, string, 64)**
- triggeredBy **(req, string, 64)**
- metadata **(string/json)**

### time_logs
- taskId **(req, string, 64)** (or workItemId)
- userId **(req, string, 64)**
- workspaceId **(req, string, 64)**
- projectId **(req, string, 64)**
- date **(req, datetime)**
- hours **(req, float)**
- description **(string, 1000)**
- startTime **(datetime)**
- endTime **(datetime)**

### personal_backlog
- title **(req, string, 300)**
- description **(string, 2000)**
- userId **(req, string, 64)**
- workspaceId **(req, string, 64)**
- priority **(req, enum: LOW|MEDIUM|HIGH|URGENT)**
- status **(req, enum: TODO|IN_PROGRESS|DONE)**
- type **(req, enum: TASK|IDEA|BUG|IMPROVEMENT)**
- position **(req, integer)**
- labels **(string[])**
- dueDate **(datetime)**
- estimatedHours **(float)**
- flagged **(req, boolean)**

### github_repos
- projectId **(req, string, 64)**
- githubUrl **(req, string, 500)**
- repositoryName **(req, string, 200)**
- owner **(req, string, 120)**
- branch **(req, string, 120)**
- accessToken **(string, 2000)**
- lastSyncedAt **(datetime)**
- status **(req, enum: connected|syncing|error|disconnected)**
- error **(string, 1000)**

### code_docs
- projectId **(req, string, 64)**
- content **(req, string, 20000)**
- generatedAt **(req, datetime)**
- fileStructure **(string, 20000)**
- mermaidDiagram **(string, 20000)**

### project_docs (metadata for files in bucket `project-docs`)
- name **(req, string, 300)**
- description **(string, 2000)**
- size **(req, integer)**
- mimeType **(req, string, 120)**
- fileId **(req, string, 64)**
- projectId **(req, string, 64)**
- workspaceId **(req, string, 64)**
- category **(req, enum: prd|frd|technical_spec|user_stories|design_doc|meeting_notes|api_doc|architecture|test_plan|release_notes|user_guide|srs|brd|other)**
- version **(string, 40)**
- uploadedBy **(req, string, 64)**
- tags **(string[])**
- isArchived **(req, boolean)**

## Indexes (recommended)
- Unique: `workspaces.inviteCode`
- Unique: `spaces.key` per workspace (composite workspaceId+key)
- Unique: `projects.key` per workspace (workspaceId+key)
- Unique: `custom_columns.key` per scope (workspace/space/project + key)
- Unique: `work_items.key` per workspace
- Common filters: workspaceId on almost all collections; projectId on work_items, tasks, sprints, time_logs, github_repos, code_docs, project_docs; sprintId on work_items; spaceId on projects and work_items; userId on notifications/time_logs/personal_backlog.

## Permissions (baseline suggestions)
- Collections: create/read/update/delete restricted to authenticated users; finer-grain rules per workspace/team are enforced in app logic.
- Buckets: `images` and `attachments_bucket` allow create/read/update/delete for authenticated users; adjust to your org’s policy. `project-docs` similarly authenticated.

## Messaging / Email (optional but recommended)
- Create SMTP provider in Appwrite → set `NEXT_PUBLIC_APPWRITE_SMTP_PROVIDER_ID`.
- Create topic for email notifications → set `NEXT_PUBLIC_APPWRITE_EMAIL_TOPIC_ID`.

## Setup Checklist
- [ ] Create database and all collections above (IDs match env vars).
- [ ] Add required attributes with types, required flags, and sensible defaults.
- [ ] Configure indexes per recommendations.
- [ ] Create buckets: `images`, `attachments_bucket`, `project-docs` with limits above.
- [ ] Configure SMTP provider and email topic.
- [ ] Set all environment variables in `.env.local` and production.
