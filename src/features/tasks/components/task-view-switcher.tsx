"use client";

import { LoaderIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";

import { useProjectId } from "@/features/projects/hooks/use-project-id";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";
import { useCurrentMember } from "@/features/members/hooks/use-current-member";
import { useGetMembers } from "@/features/members/api/use-get-members";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { createColumns } from "./columns";
import { DataCalendar } from "./data-calendar";
import { DataFilters } from "./data-filters";
import { DataTable } from "./data-table";
// Use full EnhancedDataKanban so custom columns show up
import { EnhancedDataKanban } from "@/features/custom-columns/components/enhanced-data-kanban";
import { DataDashboard } from "./data-dashboard";
import { TimelineView } from "@/features/timeline/components/timeline-view";
import { MyBacklogView } from "@/features/personal-backlog/components/my-backlog-view";
import EnhancedBacklogScreen from "@/features/sprints/components/enhanced-backlog-screen";
import { ProjectSetupOverlay } from "@/features/sprints/components/project-setup-overlay";
import { useGetWorkItems, useGetSprints, SprintStatus, WorkItemStatus, WorkItemPriority, PopulatedWorkItem, useBulkUpdateWorkItems } from "@/features/sprints";
import { CompleteSprintModal } from "@/features/sprints/components/complete-sprint-modal";


import { useTaskFilters } from "../hooks/use-task-filters";
import { TaskStatus, TaskPriority, PopulatedTask } from "../types";

// Map WorkItemStatus to TaskStatus for compatibility with existing components
const workItemStatusToTaskStatus = (status: WorkItemStatus | string): TaskStatus => {
  const statusMap: Record<WorkItemStatus, TaskStatus> = {
    [WorkItemStatus.TODO]: TaskStatus.TODO,
    [WorkItemStatus.ASSIGNED]: TaskStatus.ASSIGNED,
    [WorkItemStatus.IN_PROGRESS]: TaskStatus.IN_PROGRESS,
    [WorkItemStatus.IN_REVIEW]: TaskStatus.IN_REVIEW,
    [WorkItemStatus.DONE]: TaskStatus.DONE,
  };
  return statusMap[status as WorkItemStatus] || TaskStatus.TODO;
};

// Map TaskStatus to WorkItemStatus for saving
const taskStatusToWorkItemStatus = (status: TaskStatus | string): WorkItemStatus => {
  const statusMap: Record<TaskStatus, WorkItemStatus> = {
    [TaskStatus.TODO]: WorkItemStatus.TODO,
    [TaskStatus.ASSIGNED]: WorkItemStatus.ASSIGNED,
    [TaskStatus.IN_PROGRESS]: WorkItemStatus.IN_PROGRESS,
    [TaskStatus.IN_REVIEW]: WorkItemStatus.IN_REVIEW,
    [TaskStatus.DONE]: WorkItemStatus.DONE,
  };
  return statusMap[status as TaskStatus] || WorkItemStatus.TODO;
};

// Convert WorkItem to Task format for existing components
const workItemToTask = (workItem: PopulatedWorkItem): PopulatedTask => {
  return {
    $id: workItem.$id,
    $collectionId: workItem.$collectionId,
    $databaseId: workItem.$databaseId,
    $createdAt: workItem.$createdAt,
    $updatedAt: workItem.$updatedAt,
    $permissions: workItem.$permissions,
    title: workItem.title,
    name: workItem.title,
    status: workItemStatusToTaskStatus(workItem.status),
    workspaceId: workItem.workspaceId,
    assigneeId: workItem.assigneeIds?.[0] || "",
    assigneeIds: workItem.assigneeIds,
    projectId: workItem.projectId,
    sprintId: workItem.sprintId,
    position: workItem.position,
    dueDate: workItem.dueDate || new Date().toISOString(),
    endDate: workItem.dueDate,
    description: workItem.description,
    estimatedHours: workItem.estimatedHours,
    priority: workItem.priority as unknown as TaskPriority,
    labels: workItem.labels,
    flagged: workItem.flagged,
    // Populate assignees if available
    assignees: workItem.assignees?.map(a => ({
      $id: a.$id,
      name: a.name,
      email: a.email,
      profileImageUrl: a.profileImageUrl,
    })),
    // Populate project if available
    project: workItem.project ? {
      $id: workItem.project.$id,
      name: workItem.project.name,
      imageUrl: workItem.project.imageUrl || "",
    } : undefined,
  };
};

interface TaskViewSwitcherProps {
  hideProjectFilter?: boolean;
  showMyTasksOnly?: boolean; // New prop to filter by current user
}

export const TaskViewSwitcher = ({
  hideProjectFilter,
  showMyTasksOnly = false,
}: TaskViewSwitcherProps) => {


  const [{ status, assigneeId, projectId, search, priority }] =
    useTaskFilters();
  const [view, setView] = useQueryState("task-view", { defaultValue: "dashboard" });
  const [completeSprintOpen, setCompleteSprintOpen] = useState(false);
  const { mutate: bulkUpdate } = useBulkUpdateWorkItems();

  const workspaceId = useWorkspaceId();
  const paramProjectId = useProjectId();

  // Get current user data
  const { member: currentMember, isAdmin } = useCurrentMember({ workspaceId });
  const { data: members } = useGetMembers({ workspaceId });

  // Determine the effective assigneeId - if showMyTasksOnly is true, use current member's ID
  const effectiveAssigneeId = showMyTasksOnly && currentMember ? currentMember.$id : assigneeId;

  // Get effective project ID
  const effectiveProjectId = paramProjectId || projectId;

  // Use Work Items instead of Tasks - map status filter from TaskStatus to WorkItemStatus
  const mappedStatus = status ? taskStatusToWorkItemStatus(status as TaskStatus) : undefined;

  const { data: workItemsData, isLoading: isLoadingWorkItems } = useGetWorkItems({
    workspaceId,
    projectId: effectiveProjectId || undefined,
    assigneeId: effectiveAssigneeId || undefined,
    status: mappedStatus,
    priority: priority && priority !== "null" ? priority as unknown as WorkItemPriority : undefined,
    search: undefined, // Don't filter on server side, use client-side search
  });

  // Get sprints for setup overlay check (only when viewing a project)
  const { data: sprintsData } = useGetSprints({
    workspaceId,
    projectId: effectiveProjectId || undefined
  });

  // Convert work items to tasks format
  const tasks = useMemo(() => {
    if (!workItemsData?.documents) return undefined;
    return {
      documents: workItemsData.documents.map(workItemToTask),
      total: workItemsData.total || workItemsData.documents.length,
    };
  }, [workItemsData]);

  // Calculate setup state for Jira-like overlay
  const setupState = useMemo(() => {
    const workItems = workItemsData?.documents || [];
    const sprints = sprintsData?.documents || [];
    const activeSprint = sprints.find(s => s.status === SprintStatus.ACTIVE);

    return {
      hasWorkItems: workItems.length > 0,
      hasSprints: sprints.length > 0,
      hasActiveSprint: !!activeSprint,
      activeSprint,
      needsSetup: workItems.length === 0 || sprints.length === 0 || !activeSprint,
    };
  }, [workItemsData, sprintsData]);

  // Client-side filtering for search
  const filteredTasks = useMemo(() => {
    if (!tasks?.documents) return undefined;

    let filtered = tasks.documents;

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(task =>
        (task.title || task.name || "").toLowerCase().includes(searchLower) ||
        (task.description && task.description.toLowerCase().includes(searchLower))
      );
    }

    return {
      ...tasks,
      documents: filtered,
      total: filtered.length
    };
  }, [tasks, search]);

  // Filter tasks for Kanban view to only show the active sprint
  const kanbanTasks = useMemo(() => {
    if (!filteredTasks?.documents) return [];

    const activeSprint = sprintsData?.documents?.find(s => s.status === SprintStatus.ACTIVE);

    // If we are in project view and have sprints, only show items from the active sprint
    // If not in project view or no active sprint, maybe show nothing or keep as is? 
    // The user said "in kanban only show active sprint workitems".
    if (effectiveProjectId) {
      if (!activeSprint) return []; // No active sprint = no items in Kanban
      return filteredTasks.documents.filter(task => task.sprintId === activeSprint.$id);
    }

    return filteredTasks.documents;
  }, [filteredTasks, sprintsData, effectiveProjectId]);



  const onKanbanChange = useCallback(
    (tasks: { $id: string; status: TaskStatus | string; position: number }[]) => {
      // Convert TaskStatus back to WorkItemStatus for saving
      const workItemUpdates = tasks.map(task => ({
        $id: task.$id,
        status: taskStatusToWorkItemStatus(task.status as TaskStatus),
        position: task.position,
      }));
      bulkUpdate({ json: { workItems: workItemUpdates } });
    },
    [bulkUpdate]
  );



  const isLoadingTasks = isLoadingWorkItems;


  return (
    <Tabs
      defaultValue={view}
      onValueChange={setView}
      className="flex-1 w-full border rounded-lg"
    >
      <div className="h-full flex flex-col overflow-auto ">
        <div className="flex flex-col gap-y-2  px-4 py-6 lg:flex-row justify-between items-center">
          <TabsList className="w-full lg:w-auto">
            <TabsTrigger className="h-8 w-full text-xs lg:w-auto" value="dashboard">
              {showMyTasksOnly ? "My Space" : "Dashboard"}
            </TabsTrigger>
            <TabsTrigger className="h-8 w-full text-xs lg:w-auto" value="table">
              Table
            </TabsTrigger>
            <TabsTrigger className="h-8 w-full text-xs  lg:w-auto" value="kanban">
              Kanban
            </TabsTrigger>
            <TabsTrigger className="h-8 w-full text-xs lg:w-auto" value="calendar">
              Calendar
            </TabsTrigger>
            <TabsTrigger className="h-8 w-full text-xs lg:w-auto" value="timeline">
              Timeline
            </TabsTrigger>
            {paramProjectId && (
              <TabsTrigger className="h-8 w-full text-xs lg:w-auto" value="backlog">
                Backlog
              </TabsTrigger>
            )}
            {showMyTasksOnly && (
              <TabsTrigger className="h-8 w-full text-xs lg:w-auto" value="my-backlog">
                My Backlog
              </TabsTrigger>
            )}
          </TabsList>

          {isAdmin && view === "kanban" && setupState.activeSprint && (
            <Button
              onClick={() => setCompleteSprintOpen(true)}
              size="xs"
              variant="outline"
              className="w-full font-medium px-3 py-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 lg:w-auto"
            >
              Complete Sprint {setupState.activeSprint.name}
            </Button>
          )}
        </div>


      </div>


      {view !== "dashboard" && view !== "timeline" && view !== "backlog" && (
        <DataFilters
          hideProjectFilter={hideProjectFilter}
          showMyTasksOnly={showMyTasksOnly}
          disableManageColumns={effectiveProjectId ? setupState.needsSetup : false}
        />
      )}


      {isLoadingTasks ? (
        <div className="w-full border rounded-lg h-[200px] flex flex-col items-center justify-center">
          <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <TabsContent value="dashboard" className="mt-0 p-4">
            <DataDashboard tasks={filteredTasks?.documents} isLoading={isLoadingTasks} />
          </TabsContent>
          <TabsContent value="table" className="mt-0 p-4">
            {effectiveProjectId && setupState.needsSetup ? (
              <ProjectSetupOverlay
                workspaceId={workspaceId}
                projectId={effectiveProjectId}
                hasWorkItems={setupState.hasWorkItems}
                hasSprints={setupState.hasSprints}
                hasActiveSprint={setupState.hasActiveSprint}
                variant="table"
              >
                <DataTable
                  columns={createColumns(isAdmin, isAdmin)}
                  data={filteredTasks?.documents ?? []}
                />
              </ProjectSetupOverlay>
            ) : (
              <DataTable
                columns={createColumns(isAdmin, isAdmin)}
                data={filteredTasks?.documents ?? []}
              />
            )}
          </TabsContent>
          <TabsContent value="kanban" className="mt-0 p-4">
            {effectiveProjectId && setupState.needsSetup ? (
              <ProjectSetupOverlay
                workspaceId={workspaceId}
                projectId={effectiveProjectId}
                hasWorkItems={setupState.hasWorkItems}
                hasSprints={setupState.hasSprints}
                hasActiveSprint={setupState.hasActiveSprint}
                variant="kanban"
              >
                <EnhancedDataKanban
                  data={kanbanTasks}
                  onChange={onKanbanChange}
                  canCreateTasks={isAdmin}
                  canEditTasks={isAdmin}
                  canDeleteTasks={isAdmin}
                  members={members?.documents ?? []}
                  projectId={paramProjectId || projectId || undefined}
                />
              </ProjectSetupOverlay>
            ) : (
              <EnhancedDataKanban
                data={kanbanTasks}
                onChange={onKanbanChange}
                canCreateTasks={isAdmin}
                canEditTasks={isAdmin}
                canDeleteTasks={isAdmin}
                members={members?.documents ?? []}
                projectId={paramProjectId || projectId || undefined}
              />
            )}
          </TabsContent>
          <TabsContent value="calendar" className="mt-0 h-full p-4 pb-4">
            {effectiveProjectId && setupState.needsSetup ? (
              <ProjectSetupOverlay
                workspaceId={workspaceId}
                projectId={effectiveProjectId}
                hasWorkItems={setupState.hasWorkItems}
                hasSprints={setupState.hasSprints}
                hasActiveSprint={setupState.hasActiveSprint}
                variant="calendar"
              >
                <DataCalendar data={filteredTasks?.documents ?? []} />
              </ProjectSetupOverlay>
            ) : (
              <DataCalendar data={filteredTasks?.documents ?? []} />
            )}
          </TabsContent>
          <TabsContent value="timeline" className="mt-0 h-full">
            {effectiveProjectId && setupState.needsSetup ? (
              <ProjectSetupOverlay
                workspaceId={workspaceId}
                projectId={effectiveProjectId}
                hasWorkItems={setupState.hasWorkItems}
                hasSprints={setupState.hasSprints}
                hasActiveSprint={setupState.hasActiveSprint}
                variant="timeline"
              >
                <TimelineView
                  workspaceId={workspaceId}
                  projectId={paramProjectId || projectId || undefined}
                />
              </ProjectSetupOverlay>
            ) : (
              <TimelineView
                workspaceId={workspaceId}
                projectId={paramProjectId || projectId || undefined}
              />
            )}
          </TabsContent>
          {paramProjectId && (
            <TabsContent value="backlog" className="mt-0 h-full">
              <EnhancedBacklogScreen workspaceId={workspaceId} projectId={paramProjectId} />
            </TabsContent>
          )}
          {showMyTasksOnly && (
            <TabsContent value="my-backlog" className="mt-0 h-full">
              <MyBacklogView workspaceId={workspaceId} />
            </TabsContent>
          )}
        </>
      )}



      {
        setupState.activeSprint && (
          <CompleteSprintModal
            sprint={setupState.activeSprint}
            open={completeSprintOpen}
            onOpenChange={setCompleteSprintOpen}
          />
        )
      }
    </Tabs >
  );
};
