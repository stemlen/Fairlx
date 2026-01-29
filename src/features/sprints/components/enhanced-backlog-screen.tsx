"use client";

import { useState, useMemo } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import {
  ChevronDown,
  ChevronRight,
  Play,
  CheckCircle2,
  Settings,
  Plus,
  Calendar,
  MoreHorizontal,
  Search,
  Filter,
  GripVertical,
  Edit2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

import { useGetSprints } from "../api/use-get-sprints";
import { useGetWorkItems } from "../api/use-get-work-items";
import { useCreateSprint } from "../api/use-create-sprint";
import { PERMISSIONS } from "@/lib/permissions";
import { usePermission } from "@/hooks/use-permission";
import { useUpdateSprint } from "../api/use-update-sprint";
import { useUpdateWorkItem } from "../api/use-update-work-item";
import { useCreateWorkItem } from "../api/use-create-work-item";
import { useDeleteSprint } from "../api/use-delete-sprint";
import { useDeleteWorkItem } from "../api/use-delete-work-item";
import { useGetEpics } from "../api/use-get-epics";
import { useGetMembers } from "@/features/members/api/use-get-members";
import { useBulkMoveWorkItems } from "../api/use-bulk-move-work-items";
import { useBulkDeleteWorkItems } from "../api/use-bulk-delete-work-items";
import { SprintStatus, WorkItemStatus, WorkItemPriority, WorkItemType } from "../types";
import type { PopulatedWorkItem } from "../types";
import { UpdateSprintDatesDialog } from "./update-sprint-dates-dialog";
import { SubtasksList } from "@/features/subtasks/components";
import { SprintSettingsSheet } from "./sprint-settings-sheet";
import { CreateEpicDialog } from "./create-epic-dialog";
import { WorkItemIcon } from "@/features/timeline/components/work-item-icon";
import { useGetProject } from "@/features/projects/api/use-get-project";
import { useGetCustomColumns } from "@/features/custom-columns/api/use-get-custom-columns";
import { useCreateTaskModal } from "@/features/tasks/hooks/use-create-task-modal";
import { SelectSeparator } from "@/components/ui/select";
import { snakeCaseToTitleCase } from "@/lib/utils";
import * as Icons from "react-icons/ai";
import * as BiIcons from "react-icons/bi";
import * as BsIcons from "react-icons/bs";
import * as FaIcons from "react-icons/fa";
import * as FiIcons from "react-icons/fi";
import * as HiIcons from "react-icons/hi";
import * as IoIcons from "react-icons/io5";
import * as MdIcons from "react-icons/md";
import * as RiIcons from "react-icons/ri";
import * as TbIcons from "react-icons/tb";
import { CircleIcon } from "lucide-react";

// Combine all icon sets for custom columns
const allIcons = {
  ...Icons,
  ...BiIcons,
  ...BsIcons,
  ...FaIcons,
  ...FiIcons,
  ...HiIcons,
  ...IoIcons,
  ...MdIcons,
  ...RiIcons,
  ...TbIcons,
};

interface EnhancedBacklogScreenProps {
  workspaceId: string;
  projectId: string;
}

export default function EnhancedBacklogScreen({ workspaceId, projectId }: EnhancedBacklogScreenProps) {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<PopulatedWorkItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [expandedSprints, setExpandedSprints] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatingInSprint, setIsCreatingInSprint] = useState<string | null>(null);
  const [isCreatingInBacklog, setIsCreatingInBacklog] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemType, setNewItemType] = useState<WorkItemType>(WorkItemType.TASK);
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);
  const [editingSprintName, setEditingSprintName] = useState("");
  const [editingWorkItemId, setEditingWorkItemId] = useState<string | null>(null);
  const [editingWorkItemTitle, setEditingWorkItemTitle] = useState("");
  const [dateDialogSprintId, setDateDialogSprintId] = useState<string | null>(null);
  const [sprintSettingsId, setSprintSettingsId] = useState<string | null>(null);
  const [isCreateEpicDialogOpen, setIsCreateEpicDialogOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_isEditMode, setIsEditMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Partial<PopulatedWorkItem>>({});

  const { open: openCreateTaskModal } = useCreateTaskModal();

  const { can } = usePermission();


  // API Hooks
  const { data: sprintsData } = useGetSprints({ workspaceId, projectId });
  const { data: workItemsData } = useGetWorkItems({ workspaceId, projectId });
  const { data: epicsData } = useGetEpics({ workspaceId, projectId });
  const { data: membersData } = useGetMembers({ workspaceId });
  const { data: project } = useGetProject({ projectId }); // Fetch project settings
  const { data: customColumnsData } = useGetCustomColumns({ workspaceId, projectId });
  const customColumns = customColumnsData?.documents || [];

  const { mutate: createSprint, isPending: isCreatingSprint } = useCreateSprint();
  const { mutate: updateSprint } = useUpdateSprint();
  const { mutate: updateWorkItem } = useUpdateWorkItem();
  const { mutate: createWorkItem } = useCreateWorkItem();
  const { mutate: deleteSprint } = useDeleteSprint();
  const { mutate: deleteWorkItem } = useDeleteWorkItem();
  const { mutate: bulkMoveWorkItems } = useBulkMoveWorkItems();
  const { mutate: bulkDeleteWorkItems } = useBulkDeleteWorkItems();

  const customWorkItemTypes = project?.customWorkItemTypes || [];
  const customPriorities = project?.customPriorities || [];

  const defaultWorkItemTypes = [
    { key: WorkItemType.TASK, label: "Task" },
    { key: WorkItemType.STORY, label: "Story" },
    { key: WorkItemType.BUG, label: "Bug" },
  ];
  const allWorkItemTypes = [...defaultWorkItemTypes, ...customWorkItemTypes];

  const defaultPriorities = [
    { key: WorkItemPriority.LOW, label: "Low" },
    { key: WorkItemPriority.MEDIUM, label: "Medium" },
    { key: WorkItemPriority.HIGH, label: "High" },
    { key: WorkItemPriority.URGENT, label: "Urgent" },
  ];
  const allPriorities = [...defaultPriorities, ...customPriorities];
  // For status we might need custom columns, or check if project has them. 
  // Assuming useGetCustomColumns is better, or we can use project settings if they are stored there.
  // But StatusSelector handles it. 
  // For the dropdowns here, let's use the project's custom definitions if available.

  // Organize data
  const sprints = useMemo(() => {
    return sprintsData?.documents || [];
  }, [sprintsData]);

  // Auto-expand active sprint
  useMemo(() => {
    const activeSprint = sprints.find(s => s.status === SprintStatus.ACTIVE);
    if (activeSprint && !expandedSprints.includes(activeSprint.$id)) {
      setExpandedSprints(prev => [...prev, activeSprint.$id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprints]);

  const backlogItems = useMemo(() => {
    // Backlog shows items NOT assigned to any sprint
    const items = workItemsData?.documents?.filter((item) =>
      !item.sprintId && item.type !== WorkItemType.EPIC
    ) || [];
    if (!searchQuery) return items;
    return items.filter((item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [workItemsData, searchQuery]);

  const getSprintWorkItems = (sprintId: string) => {
    const items = workItemsData?.documents?.filter((item) =>
      item.sprintId === sprintId && item.type !== WorkItemType.EPIC
    ) || [];
    if (!searchQuery) return items;
    return items.filter((item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const getStatusCounts = (items: PopulatedWorkItem[]) => {
    return {
      todo: items.filter((item) => item.status === WorkItemStatus.TODO).length,
      inProgress: items.filter((item) => item.status === WorkItemStatus.IN_PROGRESS).length,
      done: items.filter((item) => item.status === WorkItemStatus.DONE).length,
    };
  };

  // Multi-select Handlers
  const toggleSelection = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  /* Unused selection helpers
  const selectAll = (itemIds: string[]) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      itemIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  const deselectAll = (itemIds: string[]) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      itemIds.forEach(id => newSet.delete(id));
      return newSet;
    });
  };
  */

  const clearSelection = () => {
    setSelectedItemIds(new Set());
  };


  // Bulk Actions
  const handleBulkMove = (sprintId: string | null) => {
    if (selectedItemIds.size === 0) return;

    bulkMoveWorkItems({
      workItemIds: Array.from(selectedItemIds),
      sprintId,
    }, {
      onSuccess: () => clearSelection()
    });
  };

  const handleBulkDelete = () => {
    if (selectedItemIds.size === 0) return;

    if (confirm(`Are you sure you want to delete ${selectedItemIds.size} items?`)) {
      bulkDeleteWorkItems({
        workItemIds: Array.from(selectedItemIds),
      }, {
        onSuccess: () => clearSelection()
      });
    }
  };

  // Handlers
  const handleCreateSprint = () => {
    const projectKey = "SCRUM"; // You might want to get this from project data
    const sprintNumber = sprints.length + 1;
    createSprint({
      workspaceId,
      projectId,
      name: `${projectKey} Sprint ${sprintNumber}`,
      status: SprintStatus.PLANNED,
    }, {
      onSuccess: (data) => {
        // Auto-expand the newly created sprint
        setExpandedSprints(prev => [...prev, data.data.$id]);
      }
    });
  };

  const handleStartSprint = (sprintId: string) => {
    if (sprints.find(s => s.status === SprintStatus.ACTIVE)) {
      toast.error("Another sprint is already active. Please complete it first.");
      return;
    }
    updateSprint({
      param: { sprintId },
      json: { status: SprintStatus.ACTIVE },
    });
    toast.success("Sprint started");
  };

  const handleCompleteSprint = (sprintId: string) => {
    updateSprint({
      param: { sprintId },
      json: { status: SprintStatus.COMPLETED },
    });
    toast.success("Sprint completed");
  };

  const handleWorkItemClick = (item: PopulatedWorkItem) => {
    setSelectedItem(item);
    setIsDrawerOpen(true);
    setPendingChanges({});
  };

  const handleStatusChange = (itemId: string, status: string) => {
    updateWorkItem({
      param: { workItemId: itemId },
      json: { status },
    });
  };

  // Helper function to get display name for a status
  const getStatusDisplayName = (status: string): string => {
    // Check if it's a default status
    if (Object.values(WorkItemStatus).includes(status as WorkItemStatus)) {
      return snakeCaseToTitleCase(status);
    }
    // Check if it's a custom column
    const customColumn = customColumns.find(col => col.$id === status);
    if (customColumn) {
      return customColumn.name;
    }
    return status;
  };

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    // Update work item's sprint assignment
    const newSprintId = destination.droppableId === "backlog" ? null : destination.droppableId;

    updateWorkItem({
      param: { workItemId: draggableId },
      json: { sprintId: newSprintId },
    });

    toast.success("Work item moved");
  };

  const handleUpdateWorkItem = (updates: Partial<PopulatedWorkItem>) => {
    if (!selectedItem) return;

    // Extract only the updatable fields and convert types as needed
    const jsonUpdates: Record<string, string | number | boolean | string[] | Date | null | undefined> = {};

    if (updates.title !== undefined) jsonUpdates.title = updates.title;
    if (updates.type !== undefined) jsonUpdates.type = updates.type;
    if (updates.status !== undefined) jsonUpdates.status = updates.status;
    if (updates.priority !== undefined) jsonUpdates.priority = updates.priority;
    if (updates.storyPoints !== undefined) jsonUpdates.storyPoints = updates.storyPoints;
    if (updates.sprintId !== undefined) jsonUpdates.sprintId = updates.sprintId;
    if (updates.epicId !== undefined) jsonUpdates.epicId = updates.epicId;
    if (updates.parentId !== undefined) jsonUpdates.parentId = updates.parentId;
    if (updates.assigneeIds !== undefined) jsonUpdates.assigneeIds = updates.assigneeIds;
    if (updates.description !== undefined) jsonUpdates.description = updates.description;
    if (updates.flagged !== undefined) jsonUpdates.flagged = updates.flagged;
    if (updates.position !== undefined) jsonUpdates.position = updates.position;
    if (updates.dueDate !== undefined) jsonUpdates.dueDate = new Date(updates.dueDate);
    if (updates.estimatedHours !== undefined) jsonUpdates.estimatedHours = updates.estimatedHours;
    if (updates.labels !== undefined) jsonUpdates.labels = updates.labels;

    updateWorkItem({
      param: { workItemId: selectedItem.$id },
      json: jsonUpdates,
    });

    // Update local state immediately for better UX
    setSelectedItem({ ...selectedItem, ...updates });
  };

  const handleCreateWorkItem = (sprintId?: string | null) => {
    if (!newItemTitle.trim()) {
      toast.error("Please enter a title");
      return;
    }

    createWorkItem({
      workspaceId,
      projectId,
      title: newItemTitle,
      type: newItemType,
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      sprintId: sprintId || null,
      assigneeIds: [],
      flagged: false,
    }, {
      onSuccess: () => {
        setNewItemTitle("");
        setNewItemType(WorkItemType.TASK);
        setIsCreatingInSprint(null);
        setIsCreatingInBacklog(false);
      }
    });
  };

  const handleRenameSprint = (sprintId: string, newName: string) => {
    if (!newName.trim()) return;
    updateSprint({
      param: { sprintId },
      json: { name: newName },
    });
    setEditingSprintId(null);
    setEditingSprintName("");
  };

  const handleDeleteSprint = (sprintId: string) => {
    if (confirm("Are you sure you want to delete this sprint? Work items will be moved to backlog.")) {
      deleteSprint({ param: { sprintId } });
    }
  };

  const handleDeleteWorkItem = (workItemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this work item? This action cannot be undone.")) {
      deleteWorkItem({ param: { workItemId } });
      toast.success("Work item deleted");
    }
  };

  const handleStartEditWorkItem = (workItem: PopulatedWorkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWorkItemId(workItem.$id);
    setEditingWorkItemTitle(workItem.title);
  };

  const handleSaveWorkItemTitle = (workItemId: string) => {
    if (!editingWorkItemTitle.trim()) {
      toast.error("Title cannot be empty");
      return;
    }

    updateWorkItem({
      param: { workItemId },
      json: { title: editingWorkItemTitle },
    });

    setEditingWorkItemId(null);
    setEditingWorkItemTitle("");
  };

  const handleCancelEditWorkItem = () => {
    setEditingWorkItemId(null);
    setEditingWorkItemTitle("");
  };

  const handleUpdateEpic = (workItemId: string, epicId: string | null) => {
    updateWorkItem({
      param: { workItemId },
      json: { epicId: epicId === "none" ? null : epicId },
    });
  };

  const handleUpdateStoryPoints = (workItemId: string, storyPoints: number | undefined) => {
    updateWorkItem({
      param: { workItemId },
      json: { storyPoints },
    });
  };

  const handleUpdatePriority = (workItemId: string, priority: WorkItemPriority) => {
    updateWorkItem({
      param: { workItemId },
      json: { priority },
    });
  };

  const handleUpdateAssignee = (workItemId: string, assigneeId: string) => {
    updateWorkItem({
      param: { workItemId },
      json: { assigneeIds: assigneeId === "unassigned" ? [] : [assigneeId] },
    });
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="bg-background">
        {/* Header */}
        <div className="border-b bg-background ">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                {/* Debug Info */}

                {/* Search */}
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search backlog..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-8 pl-8 pr-4"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size={"xs"}>
                      <Filter className="w-2 h-2 " />
                      Filter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>All items</DropdownMenuItem>
                    <DropdownMenuItem>Assigned to me</DropdownMenuItem>
                    <DropdownMenuItem>High priority</DropdownMenuItem>
                    <DropdownMenuItem>Without epic</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {can(PERMISSIONS.WORKITEM_CREATE) && (
                  <Button
                    onClick={() => setIsCreateEpicDialogOpen(true)}
                    variant="outline" size={"xs"}
                  >
                    <Plus className="w-2 h-2" />
                    Add Epic
                  </Button>
                )}
                {can(PERMISSIONS.WORKITEM_CREATE) && (
                  <Button
                    size="xs"
                    // Default/Primary variant
                    onClick={() => setIsCreatingInBacklog(true)}
                  >
                    <Plus className="w-3 h-3 mr-0.5" />
                    Quick create
                  </Button>
                )}
                {can(PERMISSIONS.WORKITEM_CREATE) && (
                  <Button
                    size="xs"
                    // Default/Primary variant
                    onClick={openCreateTaskModal}
                  >
                    <Plus className="w-3 h-3 mr-0.5" />
                    Create Full Workitem
                  </Button>
                )}
                {can(PERMISSIONS.SPRINT_CREATE) && (
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={handleCreateSprint}
                    disabled={isCreatingSprint}
                  >
                    Create sprint
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedItemIds.size > 0 && (
          <div className="sticky top-[73px] z-20 bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-2">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-primary">
                {selectedItemIds.size} selected
              </span>
              <div className="h-4 w-px bg-primary/20" />
              <Button
                variant="ghost"
                size="xs"
                onClick={clearSelection}
                className="text-primary hover:text-primary/80 hover:bg-primary/20"
              >
                Cancel
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {can(PERMISSIONS.WORKITEM_UPDATE) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="bg-background border-border text-primary hover:bg-accent">
                      Move to...
                      <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => handleBulkMove(null)}>
                      Backlog
                    </DropdownMenuItem>
                    {sprints.map((sprint) => (
                      <DropdownMenuItem key={sprint.$id} onClick={() => handleBulkMove(sprint.$id)}>
                        {sprint.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                className="bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30 hover:border-destructive/40 shadow-none"
              >
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="px-4 py-4 overflow-y-scroll">
          <div className="space-y-4">
            {/* Sprint Sections */}
            {sprints.map((sprint) => {
              const sprintItems = getSprintWorkItems(sprint.$id);
              const counts = getStatusCounts(sprintItems);
              const isExpanded = expandedSprints.includes(sprint.$id);

              return (
                <div key={sprint.$id} className="border border-border rounded-lg bg-card overflow-hidden">
                  {/* Sprint Header */}
                  <div className="bg-card px-4 py-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          onClick={() => {
                            setExpandedSprints((prev) =>
                              prev.includes(sprint.$id)
                                ? prev.filter((id) => id !== sprint.$id)
                                : [...prev, sprint.$id]
                            );
                          }}
                          className="p-0 hover:bg-accent rounded transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-5 text-muted-foreground" />
                          )}
                        </button>

                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            {editingSprintId === sprint.$id ? (
                              <Input
                                value={editingSprintName}
                                onChange={(e) => setEditingSprintName(e.target.value)}
                                onBlur={() => handleRenameSprint(sprint.$id, editingSprintName)}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleRenameSprint(sprint.$id, editingSprintName);
                                  }
                                  if (e.key === "Escape") {
                                    setEditingSprintId(null);
                                    setEditingSprintName("");
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="h-7 w-48 text-sm font-semibold"
                                autoFocus
                              />
                            ) : (
                              <h3 className="font-semibold text-sm">{sprint.name}</h3>
                            )}
                            {sprint.startDate && sprint.endDate ? (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(sprint.startDate), "d MMM")} – {format(new Date(sprint.endDate), "d MMM")}
                              </span>
                            ) : (
                              can(PERMISSIONS.SPRINT_UPDATE) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs text-primary hover:text-primary/80 hover:bg-accent px-2"
                                  onClick={() => setDateDialogSprintId(sprint.$id)}
                                >
                                  <Calendar className="w-3 h-3 mr-1.5" />
                                  Add dates
                                </Button>
                              )
                            )}
                            <span className="text-xs text-muted-foreground/70">({sprintItems.length} work {sprintItems.length === 1 ? "item" : "items"})</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Counters */}
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-muted-foreground/50"></div>
                            <span className="text-muted-foreground text-[10px]">{counts.todo}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-primary"></div>
                            <span className="text-muted-foreground text-[10px]">{counts.inProgress}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span className="text-muted-foreground text-[10px]">{counts.done} items</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {sprint.status === SprintStatus.PLANNED && can(PERMISSIONS.SPRINT_UPDATE) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStartSprint(sprint.$id)}
                              disabled={!!sprints.find(s => s.status === SprintStatus.ACTIVE)}
                              title={!!sprints.find(s => s.status === SprintStatus.ACTIVE) ? "Another sprint is already active" : undefined}
                            >
                              <Play className="size-3 mr-1.5" />
                              Start sprint
                            </Button>
                          )}

                          {sprint.status === SprintStatus.ACTIVE && can(PERMISSIONS.SPRINT_COMPLETE) && (
                            <Button
                              size="xs"
                              // Default/Primary variant
                              onClick={() => handleCompleteSprint(sprint.$id)}
                            >
                              <CheckCircle2 className="size-2" />
                              Complete sprint
                            </Button>
                          )}

                          {(can(PERMISSIONS.SPRINT_UPDATE) || can(PERMISSIONS.SPRINT_DELETE)) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {can(PERMISSIONS.SPRINT_UPDATE) && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSprintId(sprint.$id);
                                      setEditingSprintName(sprint.name);
                                    }}
                                  >
                                    <Edit2 className="w-4 h-4 mr-2" />
                                    Rename sprint
                                  </DropdownMenuItem>
                                )}
                                {can(PERMISSIONS.SPRINT_UPDATE) && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSprintSettingsId(sprint.$id);
                                    }}
                                  >
                                    <Settings className="w-4 h-4 mr-2" />
                                    Sprint settings
                                  </DropdownMenuItem>
                                )}
                                {can(PERMISSIONS.SPRINT_DELETE) && (
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() => handleDeleteSprint(sprint.$id)}
                                  >
                                    <Trash2 className="size-3 mr-2" />
                                    Delete sprint
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sprint Content */}
                  {isExpanded && (
                    <Droppable droppableId={sprint.$id} type="WORK_ITEM">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`bg-card ${snapshot.isDraggingOver ? "bg-primary/10" : ""}`}
                        >
                          {sprintItems.length === 0 ? (
                            <div className="m-4">
                              <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
                                <p className="text-sm text-muted-foreground">
                                  Plan a sprint by dragging work items into it.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              {sprintItems.map((item, index) => (
                                <Draggable key={item.$id} draggableId={item.$id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={`px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors group ${snapshot.isDragging ? "shadow-lg rounded-lg border border-border bg-card" : ""
                                        } ${selectedItemIds.has(item.$id) ? "bg-blue-50 hover:bg-blue-50" : ""}`}
                                      onClick={() => handleWorkItemClick(item)}
                                    >
                                      <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-3">
                                          {/* Checkbox - always accessible for bulk selection */}
                                          <div
                                            className="flex items-center justify-center w-5"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Checkbox
                                              checked={selectedItemIds.has(item.$id)}
                                              onCheckedChange={() => toggleSelection(item.$id)}
                                              className="data-[state=unchecked]:border-border"
                                            />
                                          </div>
                                          {/* Drag Handle - separate from checkbox */}
                                          <div
                                            {...provided.dragHandleProps}
                                            className="flex items-center justify-center cursor-grab active:cursor-grabbing"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <GripVertical className="size-4 text-muted-foreground/50 hover:text-muted-foreground" />
                                          </div>

                                          <WorkItemIcon type={item.type} project={project ?? undefined} className="size-4 flex-shrink-0" />

                                          <span className="font-mono text-xs text-muted-foreground w-20 flex-shrink-0">{item.key}</span>
                                        </div>

                                        {editingWorkItemId === item.$id ? (
                                          <Input
                                            value={editingWorkItemTitle}
                                            onChange={(e) => setEditingWorkItemTitle(e.target.value)}
                                            onBlur={() => handleSaveWorkItemTitle(item.$id)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") handleSaveWorkItemTitle(item.$id);
                                              if (e.key === "Escape") handleCancelEditWorkItem();
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex-1 h-7 text-sm"
                                            autoFocus
                                          />
                                        ) : (
                                          <span
                                            className="flex-1 text-sm text-foreground truncate hover:text-primary cursor-text"
                                            onClick={(e) => handleStartEditWorkItem(item, e)}
                                          >
                                            {item.title}
                                          </span>
                                        )}

                                        {/* Epic Dropdown */}
                                        <Select
                                          value={item.epicId || "none"}
                                          onValueChange={(value) => handleUpdateEpic(item.$id, value)}
                                        >
                                          <SelectTrigger
                                            className="w-[100px] h-7 text-xs flex-shrink-0"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <SelectValue placeholder="Epic" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">No Epic</SelectItem>
                                            {epicsData?.documents?.map((epic) => (
                                              <SelectItem key={epic.$id} value={epic.$id}>
                                                {epic.title}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>

                                        {/* Status Dropdown */}
                                        <Select
                                          value={item.status}
                                          onValueChange={(value: string) => handleStatusChange(item.$id, value)}
                                        >
                                          <SelectTrigger
                                            className="w-[120px] h-7 text-xs flex-shrink-0"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <SelectValue>
                                              {getStatusDisplayName(item.status)}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value={WorkItemStatus.TODO}>To Do</SelectItem>
                                            <SelectItem value={WorkItemStatus.ASSIGNED}>Assigned</SelectItem>
                                            <SelectItem value={WorkItemStatus.IN_PROGRESS}>In Progress</SelectItem>
                                            <SelectItem value={WorkItemStatus.IN_REVIEW}>In Review</SelectItem>
                                            <SelectItem value={WorkItemStatus.DONE}>Done</SelectItem>
                                            {customColumns.length > 0 && (
                                              <>
                                                <SelectSeparator />
                                                {customColumns.map((column) => {
                                                  const IconComponent = allIcons[column.icon as keyof typeof allIcons] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
                                                  return (
                                                    <SelectItem key={column.$id} value={column.$id}>
                                                      <div className="flex items-center gap-2">
                                                        {IconComponent ? (
                                                          <IconComponent className="size-4" style={{ color: column.color }} />
                                                        ) : (
                                                          <CircleIcon className="size-4" style={{ color: column.color }} />
                                                        )}
                                                        {column.name}
                                                      </div>
                                                    </SelectItem>
                                                  );
                                                })}
                                              </>
                                            )}
                                          </SelectContent>
                                        </Select>

                                        {/* Priority Dropdown */}
                                        <Select
                                          value={item.priority || WorkItemPriority.MEDIUM}
                                          onValueChange={(value: WorkItemPriority) => handleUpdatePriority(item.$id, value)}
                                        >
                                          <SelectTrigger
                                            className="w-[90px] h-7 text-xs flex-shrink-0"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {allPriorities.map((p) => (
                                              <SelectItem key={p.key} value={p.key}>
                                                {p.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>

                                        {/* Story Points Dropdown */}
                                        <Select
                                          value={item.storyPoints?.toString() || "none"}
                                          onValueChange={(value) => handleUpdateStoryPoints(item.$id, value === "none" ? undefined : parseInt(value))}
                                        >
                                          <SelectTrigger
                                            className="w-[70px] h-7 text-xs flex-shrink-0"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <SelectValue placeholder="SP" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">-</SelectItem>
                                            <SelectItem value="1">1</SelectItem>
                                            <SelectItem value="2">2</SelectItem>
                                            <SelectItem value="3">3</SelectItem>
                                            <SelectItem value="5">5</SelectItem>
                                            <SelectItem value="8">8</SelectItem>
                                            <SelectItem value="13">13</SelectItem>
                                            <SelectItem value="21">21</SelectItem>
                                          </SelectContent>
                                        </Select>

                                        {/* Assignee Dropdown */}
                                        <Select
                                          value={item.assignees?.[0]?.$id || "unassigned"}
                                          onValueChange={(value) => handleUpdateAssignee(item.$id, value)}
                                        >
                                          <SelectTrigger
                                            className="w-[120px] h-7 text-xs flex-shrink-0"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <SelectValue className="overflow-x-hidden" placeholder="Assignee">
                                              {item.assignees?.[0] ? (
                                                <div className="flex items-center w-[80px] overflow-x-hidden gap-1">
                                                  <Avatar className="size-4">
                                                    <AvatarFallback className="text-[10px]">
                                                      {item.assignees[0].name?.charAt(0).toUpperCase()}
                                                    </AvatarFallback>
                                                  </Avatar>
                                                  <span className="truncate overflow-x-hidden">{item.assignees[0].name}</span>
                                                </div>
                                              ) : (
                                                "Unassigned"
                                              )}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="unassigned">Unassigned</SelectItem>
                                            {membersData?.documents?.map((member) => (
                                              <SelectItem key={member.$id} value={member.$id}>
                                                <div className="flex items-center gap-2">
                                                  <Avatar className="size-4">
                                                    <AvatarFallback className="text-[10px]">
                                                      {member.name?.charAt(0).toUpperCase()}
                                                    </AvatarFallback>
                                                  </Avatar>
                                                  {member.name}
                                                </div>
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                            </div>
                          )}

                          {/* Create Work Item Row */}
                          {isCreatingInSprint === sprint.$id ? (
                            <div className="px-4 py-3 border-t border-border">
                              <div className="flex items-center gap-4">
                                {/* Work Item Type Selector */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 px-3 gap-2 flex-shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <WorkItemIcon type={newItemType} project={project ?? undefined} className="size-4" />
                                      <span className="text-xs capitalize">
                                        {newItemType.toLowerCase()}
                                      </span>
                                      <ChevronDown className="size-3 text-muted-foreground" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start">
                                    {allWorkItemTypes.map((type) => (
                                      <DropdownMenuItem
                                        key={type.key}
                                        onClick={() => setNewItemType(type.key as WorkItemType)}
                                        className="gap-2"
                                      >
                                        <WorkItemIcon type={type.key as WorkItemType} project={project ?? undefined} className="size-4" />
                                        <span>{type.label}</span>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>

                                <Input
                                  value={newItemTitle}
                                  onChange={(e) => setNewItemTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleCreateWorkItem(sprint.$id);
                                    if (e.key === "Escape") {
                                      setIsCreatingInSprint(null);
                                      setNewItemTitle("");
                                    }
                                  }}
                                  placeholder="What needs to be done?"
                                  className="flex-1 h-8 text-sm"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleCreateWorkItem(sprint.$id)}
                                  className="h-8"
                                >
                                  Add
                                </Button>
                                {can(PERMISSIONS.SPRINT_UPDATE) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartSprint(sprint.$id);
                                    }}
                                    disabled={!!sprints.find(s => s.status === SprintStatus.ACTIVE)}
                                    title={!!sprints.find(s => s.status === SprintStatus.ACTIVE) ? "Another sprint is already active" : undefined}
                                    className="h-8 text-xs font-medium"
                                  >
                                    <Play className="w-3.5 h-3.5 mr-1.5" />
                                    Start sprint
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setIsCreatingInSprint(null);
                                    setNewItemTitle("");
                                  }}
                                  className="h-8"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            can(PERMISSIONS.WORKITEM_CREATE) && (
                              <button
                                onClick={() => setIsCreatingInSprint(sprint.$id)}
                                className="w-full px-4 py-3 text-left text-sm text-muted-foreground hover:bg-accent transition-colors flex items-center gap-2 border-t border-border"
                              >
                                <Plus className="size-4" />
                                Create work item
                              </button>
                            )
                          )}

                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                </div>
              );
            })}

            {/* Backlog Section */}
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="bg-card px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">
                    Backlog ({backlogItems.length} work {backlogItems.length === 1 ? "item" : "items"})
                  </h3>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                        <span className="text-gray-600">
                          {getStatusCounts(backlogItems).todo}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="text-gray-600">
                          {getStatusCounts(backlogItems).inProgress}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-gray-600">
                          {getStatusCounts(backlogItems).done}
                        </span>
                      </div>
                    </div>

                    {can(PERMISSIONS.SPRINT_CREATE) && (
                      <Button size="sm" onClick={handleCreateSprint}>
                        Create sprint
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Droppable droppableId="backlog" type="WORK_ITEM">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`bg-card min-h-[200px] ${snapshot.isDraggingOver ? "bg-primary/10" : ""}`}
                  >
                    {backlogItems.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="text-sm text-gray-500">No items in backlog.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {backlogItems.map((item, index) => (
                          <Draggable key={item.$id} draggableId={item.$id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`px-4 py-3 hover:bg-accent cursor-pointer transition-colors group ${snapshot.isDragging ? "shadow-lg rounded-lg border border-border bg-card" : ""
                                  } ${selectedItemIds.has(item.$id) ? "bg-primary/10 hover:bg-primary/15" : ""}`}
                                onClick={() => handleWorkItemClick(item)}
                              >
                                <div className="flex items-center gap-4">
                                  <div className="flex items-center gap-3">
                                    {/* Checkbox - always accessible for bulk selection */}
                                    <div
                                      className="flex items-center justify-center w-5"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Checkbox
                                        checked={selectedItemIds.has(item.$id)}
                                        onCheckedChange={() => toggleSelection(item.$id)}
                                        className="data-[state=unchecked]:border-gray-300"
                                      />
                                    </div>
                                    {/* Drag Handle - separate from checkbox */}
                                    <div
                                      {...provided.dragHandleProps}
                                      className="flex items-center justify-center cursor-grab active:cursor-grabbing"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <GripVertical className="size-4 text-gray-400 hover:text-gray-600" />
                                    </div>

                                    <WorkItemIcon type={item.type} project={project ?? undefined} className="size-4 flex-shrink-0" />

                                    <span className="font-mono text-xs text-gray-500 w-20 flex-shrink-0">{item.key}</span>
                                  </div>

                                  {editingWorkItemId === item.$id ? (
                                    <Input
                                      value={editingWorkItemTitle}
                                      onChange={(e) => setEditingWorkItemTitle(e.target.value)}
                                      onBlur={() => handleSaveWorkItemTitle(item.$id)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveWorkItemTitle(item.$id);
                                        if (e.key === "Escape") handleCancelEditWorkItem();
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex-1 h-7 text-sm"
                                      autoFocus
                                    />
                                  ) : (
                                    <span
                                      className="flex-1 text-sm text-foreground truncate hover:text-blue-600 cursor-text"
                                      onClick={(e) => handleStartEditWorkItem(item, e)}
                                    >
                                      {item.title}
                                    </span>
                                  )}

                                  {/* Epic Dropdown */}
                                  <Select
                                    value={item.epicId || "none"}
                                    onValueChange={(value) => handleUpdateEpic(item.$id, value)}
                                  >
                                    <SelectTrigger
                                      className="w-[100px] h-7 text-xs flex-shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <SelectValue placeholder="Epic" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No Epic</SelectItem>
                                      {epicsData?.documents?.map((epic) => (
                                        <SelectItem key={epic.$id} value={epic.$id}>
                                          {epic.title}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* Status Dropdown */}
                                  <Select
                                    value={item.status}
                                    onValueChange={(value: string) => handleStatusChange(item.$id, value)}
                                  >
                                    <SelectTrigger
                                      className="w-[120px] h-7 text-xs flex-shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <SelectValue>
                                        {getStatusDisplayName(item.status)}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={WorkItemStatus.TODO}>To Do</SelectItem>
                                      <SelectItem value={WorkItemStatus.ASSIGNED}>Assigned</SelectItem>
                                      <SelectItem value={WorkItemStatus.IN_PROGRESS}>In Progress</SelectItem>
                                      <SelectItem value={WorkItemStatus.IN_REVIEW}>In Review</SelectItem>
                                      <SelectItem value={WorkItemStatus.DONE}>Done</SelectItem>
                                      {customColumns.length > 0 && (
                                        <>
                                          <SelectSeparator />
                                          {customColumns.map((column) => {
                                            const IconComponent = allIcons[column.icon as keyof typeof allIcons] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
                                            return (
                                              <SelectItem key={column.$id} value={column.$id}>
                                                <div className="flex items-center gap-2">
                                                  {IconComponent ? (
                                                    <IconComponent className="size-4" style={{ color: column.color }} />
                                                  ) : (
                                                    <CircleIcon className="size-4" style={{ color: column.color }} />
                                                  )}
                                                  {column.name}
                                                </div>
                                              </SelectItem>
                                            );
                                          })}
                                        </>
                                      )}
                                    </SelectContent>
                                  </Select>

                                  {/* Priority Dropdown */}
                                  <Select
                                    value={item.priority || WorkItemPriority.MEDIUM}
                                    onValueChange={(value: WorkItemPriority) => handleUpdatePriority(item.$id, value)}
                                  >
                                    <SelectTrigger
                                      className="w-[90px] h-7 text-xs flex-shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {allPriorities.map((p) => (
                                        <SelectItem key={p.key} value={p.key}>
                                          {p.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* Story Points Dropdown */}
                                  <Select
                                    value={item.storyPoints?.toString() || "none"}
                                    onValueChange={(value) => handleUpdateStoryPoints(item.$id, value === "none" ? undefined : parseInt(value))}
                                  >
                                    <SelectTrigger
                                      className="w-[70px] h-7 text-xs flex-shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <SelectValue placeholder="SP" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">-</SelectItem>
                                      <SelectItem value="1">1</SelectItem>
                                      <SelectItem value="2">2</SelectItem>
                                      <SelectItem value="3">3</SelectItem>
                                      <SelectItem value="5">5</SelectItem>
                                      <SelectItem value="8">8</SelectItem>
                                      <SelectItem value="13">13</SelectItem>
                                      <SelectItem value="21">21</SelectItem>
                                    </SelectContent>
                                  </Select>

                                  {/* Assignee Dropdown */}
                                  <Select
                                    value={item.assignees?.[0]?.$id || "unassigned"}
                                    onValueChange={(value) => handleUpdateAssignee(item.$id, value)}
                                  >
                                    <SelectTrigger
                                      className="w-[120px] h-7 text-xs flex-shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <SelectValue placeholder="Assignee">
                                        {item.assignees?.[0] ? (
                                          <div className="flex items-center w-[80px] overflow-hidden gap-1">
                                            <Avatar className="size-4 shrink-0">
                                              <AvatarFallback className="text-[10px]">
                                                {item.assignees[0].name?.charAt(0).toUpperCase()}
                                              </AvatarFallback>
                                            </Avatar>
                                            <span className="truncate">{item.assignees[0].name}</span>
                                          </div>
                                        ) : (
                                          "Unassigned"
                                        )}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">Unassigned</SelectItem>
                                      {membersData?.documents?.map((member) => (
                                        <SelectItem key={member.$id} value={member.$id}>
                                          <div className="flex items-center gap-2">
                                            <Avatar className="size-4">
                                              <AvatarFallback className="text-[10px]">
                                                {member.name?.charAt(0).toUpperCase()}
                                              </AvatarFallback>
                                            </Avatar>
                                            {member.name}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {/* Actions Dropdown */}
                                  {can(PERMISSIONS.WORKITEM_DELETE) && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 flex-shrink-0"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <MoreHorizontal className="size-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={(e) => handleDeleteWorkItem(item.$id, e)}
                                          className="text-red-600"
                                        >
                                          <Trash2 className="size-3 mr-2" />
                                          Delete work item
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                      </div>
                    )}

                    {/* Create Work Item Row in Backlog */}
                    {isCreatingInBacklog ? (
                      <div className="px-4 py-3 border-t border-gray-100">
                        <div className="flex items-center gap-4">
                          {/* Work Item Type Selector */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 gap-2 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <WorkItemIcon type={newItemType} project={project ?? undefined} className="size-4" />
                                <span className="text-xs capitalize">
                                  {newItemType.toLowerCase()}
                                </span>
                                <ChevronDown className="size-3 text-gray-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {allWorkItemTypes.map((type) => (
                                <DropdownMenuItem
                                  key={type.key}
                                  onClick={() => setNewItemType(type.key as WorkItemType)}
                                  className="gap-2"
                                >
                                  <WorkItemIcon type={type.key as WorkItemType} project={project ?? undefined} className="size-4" />
                                  <span>{type.label}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Input
                            value={newItemTitle}
                            onChange={(e) => setNewItemTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCreateWorkItem(null);
                              if (e.key === "Escape") {
                                setIsCreatingInBacklog(false);
                                setNewItemTitle("");
                              }
                            }}
                            placeholder="What needs to be done?"
                            className="flex-1 h-8 text-sm"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => handleCreateWorkItem(null)}
                            className="h-8"
                          >
                            Add
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setIsCreatingInBacklog(false);
                              setNewItemTitle("");
                            }}
                            className="h-8"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      can(PERMISSIONS.WORKITEM_CREATE) && (
                        <button
                          onClick={() => setIsCreatingInBacklog(true)}
                          className="w-full px-4 py-3 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-2 border-t border-gray-100"
                        >
                          <Plus className="size-4" />
                          Create work item
                        </button>
                      )
                    )}

                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>
        </div>

        {/* Work Item Detail Drawer */}
        <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            {selectedItem && (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono">{selectedItem.key}</span>
                  </div>
                  <SheetTitle className="text-xl">{selectedItem.title}</SheetTitle>
                  <SheetDescription>
                    View and edit work item details
                  </SheetDescription>
                </SheetHeader>

                <Tabs defaultValue="details" className="mt-6">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="subtasks">Subtasks</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="space-y-4 mt-8">

                    <div className="space-y-4 ">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input className="text-xs "
                          value={pendingChanges.title ?? selectedItem.title}
                          onChange={(e) => setPendingChanges(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="Work item title"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={pendingChanges.type ?? selectedItem.type}
                          onValueChange={(value: WorkItemType) => setPendingChanges(prev => ({ ...prev, type: value }))}
                        >
                          <SelectTrigger >
                            <SelectValue>
                              <div className="flex items-center gap-2 text-xs">
                                <WorkItemIcon type={pendingChanges.type ?? selectedItem.type} project={project ?? undefined} className="size-3" />
                                <span className="text-xs">{allWorkItemTypes.find(t => t.key === (pendingChanges.type ?? selectedItem.type))?.label || (pendingChanges.type ?? selectedItem.type)}</span>
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {allWorkItemTypes.map((type) => (
                              <SelectItem key={type.key} value={type.key}>
                                <div className="flex items-center gap-2 text-xs">
                                  <WorkItemIcon type={type.key as WorkItemType} project={project ?? undefined} className="size-3" />
                                  <span className="text-xs">{type.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={pendingChanges.status ?? selectedItem.status}
                          onValueChange={(value: WorkItemStatus) => setPendingChanges(prev => ({ ...prev, status: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={WorkItemStatus.TODO}>To Do</SelectItem>
                            <SelectItem value={WorkItemStatus.ASSIGNED}>Assigned</SelectItem>
                            <SelectItem value={WorkItemStatus.IN_PROGRESS}>In Progress</SelectItem>
                            <SelectItem value={WorkItemStatus.IN_REVIEW}>In Review</SelectItem>
                            <SelectItem value={WorkItemStatus.DONE}>Done</SelectItem>
                            {customColumns.length > 0 && (
                              <>
                                <SelectSeparator />
                                {customColumns.map((column) => {
                                  const IconComponent = allIcons[column.icon as keyof typeof allIcons] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
                                  return (
                                    <SelectItem key={column.$id} value={column.$id}>
                                      <div className="flex items-center gap-2">
                                        {IconComponent ? (
                                          <IconComponent className="size-4" style={{ color: column.color }} />
                                        ) : (
                                          <CircleIcon className="size-4" style={{ color: column.color }} />
                                        )}
                                        {column.name}
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={pendingChanges.description ?? selectedItem.description ?? ""}
                          onChange={(e) => setPendingChanges(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Add a description..."
                          className="min-h-[120px] text-xs"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select
                          value={pendingChanges.priority ?? selectedItem.priority ?? WorkItemPriority.MEDIUM}
                          onValueChange={(value: WorkItemPriority) => setPendingChanges(prev => ({ ...prev, priority: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allPriorities.map((p) => (
                              <SelectItem key={p.key} value={p.key}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Epic</Label>
                        <Select
                          value={pendingChanges.epicId !== undefined ? (pendingChanges.epicId || "none") : (selectedItem.epicId || "none")}
                          onValueChange={(value) => setPendingChanges(prev => ({ ...prev, epicId: value === "none" ? null : value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select epic" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Epic</SelectItem>
                            {epicsData?.documents?.map((epic) => (
                              <SelectItem key={epic.$id} value={epic.$id}>
                                {epic.key} - {epic.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Story Points</Label>
                        <Input
                          type="number"
                          value={pendingChanges.storyPoints !== undefined ? (pendingChanges.storyPoints ?? "") : (selectedItem.storyPoints ?? "")}
                          onChange={(e) => setPendingChanges(prev => ({ ...prev, storyPoints: e.target.value ? parseInt(e.target.value) : undefined }))}
                          placeholder="Enter story points"
                          min="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Assignees</Label>
                        <div className="flex gap-2">
                          {selectedItem.assignees?.filter(
                            (a): a is NonNullable<typeof a> => a != null && typeof a.$id === "string"
                          ).map((assignee) => (
                            <Avatar key={assignee.$id} className="size-8">
                              <AvatarImage src="" />
                              <AvatarFallback className="text-xs">
                                {(assignee.name ?? "?").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          <Button variant="outline" size="icon" className="size-8">
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Save and Cancel Buttons */}
                      <div className="flex gap-2 pt-4 border-t">
                        <Button
                          onClick={() => {
                            if (Object.keys(pendingChanges).length > 0) {
                              handleUpdateWorkItem(pendingChanges);
                            }
                            setIsEditMode(false);
                            setPendingChanges({});
                          }}
                          className="flex-1"
                          size="xs"
                        >
                          Save Changes
                        </Button>

                      </div>
                    </div>

                  </TabsContent>

                  <TabsContent value="subtasks" className="mt-4">
                    <SubtasksList
                      workItemId={selectedItem.$id}
                      workspaceId={workspaceId}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Update Sprint Dates Dialog */}
        {dateDialogSprintId && (
          <UpdateSprintDatesDialog
            sprint={sprints.find(s => s.$id === dateDialogSprintId)!}
            open={!!dateDialogSprintId}
            onOpenChange={(open) => !open && setDateDialogSprintId(null)}
          />
        )}
      </div>
      {/* Sprint Settings Sheet */}
      <SprintSettingsSheet
        open={!!sprintSettingsId}
        onOpenChange={(open) => !open && setSprintSettingsId(null)}
        sprint={sprints.find((s) => s.$id === sprintSettingsId) || null}
      />

      {/* Create Epic Dialog */}
      <CreateEpicDialog
        workspaceId={workspaceId}
        projectId={projectId}
        open={isCreateEpicDialogOpen}
        onCloseAction={() => setIsCreateEpicDialogOpen(false)}
      />
    </DragDropContext>
  );
}
