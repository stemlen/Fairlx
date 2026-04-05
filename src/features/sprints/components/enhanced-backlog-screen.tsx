"use client";

import { useState, useMemo, useRef, useCallback, memo, useEffect } from "react";
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
  Share2,
  Flag,
  Clock,
  Tag,
  Users,
  ArrowRight,
  Layers,
  ExternalLink,
  X,
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/editor/rich-text-editor";

import { useGetSprints } from "../api/use-get-sprints";
import { useGetWorkItems } from "../api/use-get-work-items";
import { useCreateSprint } from "../api/use-create-sprint";
import { PERMISSIONS } from "@/lib/permissions";
import { usePermission } from "@/hooks/use-permission";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useCurrentMember } from "@/features/members/hooks/use-current-member";
import { useUpdateSprint } from "../api/use-update-sprint";
import { useUpdateWorkItem } from "../api/use-update-work-item";
import { useCreateWorkItem } from "../api/use-create-work-item";
import { useDeleteSprint } from "../api/use-delete-sprint";
import { useDeleteWorkItem } from "../api/use-delete-work-item";
import { useGetEpics } from "../api/use-get-epics";
import { useGetMembers } from "@/features/members/api/use-get-members";
import { useGetProjectMembers } from "@/features/project-members/api/use-get-project-members";
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
import { resolveIconSync } from "@/lib/resolve-icon";
import { DatePicker } from "@/components/date-picker";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { TaskAttachments } from "@/features/attachments/components/task-attachments";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Memoized assignee popover component for instant checkbox feedback
interface AssigneePopoverProps {
  workItemId: string;
  initialAssigneeIds: string[];
  projectMembers: Array<{ $id: string; name?: string; profileImageUrl?: string | null }>;
  onUpdate: (workItemId: string, newAssigneeIds: string[]) => void;
}

const AssigneePopover = memo(function AssigneePopover({
  workItemId,
  initialAssigneeIds,
  projectMembers,
  onUpdate,
}: AssigneePopoverProps) {
  // Local state for INSTANT UI feedback (checkbox AND display)
  const [localIds, setLocalIds] = useState<string[]>(initialAssigneeIds);
  // Track the committed server state to compare against debounced result
  const committedIdsRef = useRef<string[]>(initialAssigneeIds);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced DB update: only fires if final state differs from last committed state
  const scheduleUpdate = useCallback((newIds: string[]) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const committed = [...committedIdsRef.current].sort().join(",");
      const next = [...newIds].sort().join(",");
      if (committed !== next) {
        committedIdsRef.current = newIds;
        onUpdate(workItemId, newIds);
      }
    }, 1000);
  }, [workItemId, onUpdate]);

  const handleToggle = (memberId: string) => {
    const newIds = localIds.includes(memberId)
      ? localIds.filter(id => id !== memberId)
      : [...localIds, memberId];
    
    // 1. Update local state INSTANTLY
    setLocalIds(newIds);
    // 2. Schedule DB update — cancelled if user reverts within 600ms
    scheduleUpdate(newIds);
  };

  const handleClearAll = () => {
    setLocalIds([]);
    scheduleUpdate([]);
  };

  // Derive display assignees from LOCAL state + projectMembers for INSTANT updates
  const displayAssignees = useMemo(() => 
    localIds
      .map(id => projectMembers.find(m => m.$id === id))
      .filter((m): m is NonNullable<typeof m> => m != null),
    [localIds, projectMembers]
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="flex items-center gap-1 cursor-pointer hover:bg-accent rounded px-1 w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {displayAssignees.length > 0 ? (
            <>
              <div className="flex -space-x-1">
                {displayAssignees.slice(0, 3).map((assignee) => (
                  <Avatar key={assignee.$id} className="size-5 border-2 border-background">
                    <AvatarImage src={assignee.profileImageUrl || undefined} />
                    <AvatarFallback className="text-[10px]">
                      {assignee.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {displayAssignees.length > 2
                  ? `${displayAssignees.length} assigned`
                  : displayAssignees.map(a => a?.name?.split(" ")[0]).join(", ")}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="p-2 border-b">
          <p className="text-xs font-medium text-muted-foreground">Assign members</p>
        </div>
        <div className="max-h-[200px] overflow-y-auto p-1">
          {projectMembers.map((member) => {
            const isSelected = localIds.includes(member.$id);
            return (
              <div
                key={member.$id}
                role="button"
                tabIndex={0}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${isSelected ? "bg-muted" : "hover:bg-accent"}`}
                onClick={() => handleToggle(member.$id)}
                onKeyDown={(e) => e.key === 'Enter' && handleToggle(member.$id)}
              >
                <Checkbox checked={isSelected} className="pointer-events-none" />
                <Avatar className="size-5">
                  <AvatarImage src={member.profileImageUrl || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {member.name?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs truncate">{member.name}</span>
              </div>
            );
          })}
        </div>
        {localIds.length > 0 && (
          <div className="p-1 border-t">
            <button
              className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
              onClick={handleClearAll}
            >
              Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});

// Memoized Select All Checkbox for instant feedback
interface SelectAllCheckboxProps {
  itemIds: string[];
  selectedItemIds: Set<string>;
  onToggle: (itemIds: string[]) => void;
  label: string;
  itemCount: number;
}

const SelectAllCheckbox = memo(function SelectAllCheckbox({
  itemIds,
  selectedItemIds,
  onToggle,
  label,
  itemCount,
}: SelectAllCheckboxProps) {
  // Calculate selection state
  const selectionState = useMemo(() => {
    if (itemIds.length === 0) return 'none';
    let selectedCount = 0;
    for (const id of itemIds) {
      if (selectedItemIds.has(id)) selectedCount++;
    }
    if (selectedCount === 0) return 'none';
    if (selectedCount === itemIds.length) return 'all';
    return 'some';
  }, [itemIds, selectedItemIds]);

  const handleClick = useCallback(() => {
    onToggle(itemIds);
  }, [itemIds, onToggle]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-5 flex items-center justify-center">
            <Checkbox
              checked={
                selectionState === 'all'
                  ? true
                  : selectionState === 'some'
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={handleClick}
              className="data-[state=unchecked]:border-border"
              aria-label={label}
              disabled={itemIds.length === 0}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">
            {selectionState === 'all' 
              ? 'Deselect all' 
              : `Select all ${itemCount} items`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

interface EnhancedBacklogScreenProps {
  workspaceId: string;
  projectId: string;
}

// Default label color map for built-in label suggestions
const LABEL_COLORS: Record<string, string> = {
  "Bug": "#ef4444",
  "Feature": "#a855f7",
  "Improvement": "#3b82f6",
  "Documentation": "#22c55e",
  "Design": "#ec4899",
  "Research": "#f59e0b",
  "Frontend": "#6366f1",
  "Backend": "#6b7280",
};

function getLabelColor(label: string): string {
  if (LABEL_COLORS[label]) return LABEL_COLORS[label];
  // Generate a deterministic color from the label string
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 60%, 55%)`;
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
  const [drawerWidth, setDrawerWidth] = useState(540);
  const [isExpanded, setIsExpanded] = useState(false);
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = drawerWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(Math.max(startWidth + delta, 400), window.innerWidth * 0.85);
      setDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [drawerWidth]);

  const { open: openCreateTaskModal } = useCreateTaskModal();

  const { can } = usePermission();

  // Get workspace admin status
  const { isAdmin: isWorkspaceAdmin } = useCurrentMember({ workspaceId });

  // Get project-level sprint permissions
  const {
    canCreateSprintsProject,
    canEditSprintsProject,
    canDeleteSprintsProject,
    canStartSprintProject,
    canCompleteSprintProject,
    canCreateTasksProject,
    canEditTasksProject,
    canDeleteTasksProject,
  } = useProjectPermissions({ projectId, workspaceId });

  // Effective permissions: Admin OR project-level permission
  const canCreateSprints = isWorkspaceAdmin || canCreateSprintsProject || can(PERMISSIONS.SPRINT_CREATE);
  const canEditSprints = isWorkspaceAdmin || canEditSprintsProject || can(PERMISSIONS.SPRINT_UPDATE);
  const canDeleteSprints = isWorkspaceAdmin || canDeleteSprintsProject || can(PERMISSIONS.SPRINT_DELETE);
  const canStartSprint = isWorkspaceAdmin || canStartSprintProject || can(PERMISSIONS.SPRINT_START);
  const canCompleteSprint = isWorkspaceAdmin || canCompleteSprintProject || can(PERMISSIONS.SPRINT_COMPLETE);
  const canCreateWorkItems = isWorkspaceAdmin || canCreateTasksProject || can(PERMISSIONS.WORKITEM_CREATE);
  const canEditWorkItems = isWorkspaceAdmin || canEditTasksProject || can(PERMISSIONS.WORKITEM_UPDATE);
  const canDeleteWorkItems = isWorkspaceAdmin || canDeleteTasksProject || can(PERMISSIONS.WORKITEM_DELETE);


  // API Hooks
  const { data: sprintsData } = useGetSprints({ workspaceId, projectId });
  const { data: workItemsData } = useGetWorkItems({ workspaceId, projectId });
  const { data: epicsData } = useGetEpics({ workspaceId, projectId });
  const { data: membersData } = useGetMembers({ workspaceId });
  const { data: projectMembersData } = useGetProjectMembers({ projectId });
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

  // Filter workspace members by project membership, fallback to all workspace members
  const projectMembers = useMemo(() => {
    if (!membersData?.documents) return [];

    // If no project members configured, show all workspace members
    if (!projectMembersData?.documents || projectMembersData.documents.length === 0) {
      return membersData.documents;
    }

    // Create a set of user IDs who are in this project
    const projectUserIds = new Set(projectMembersData.documents.map(m => m.userId));

    // Filter workspace members to only include those in the project
    const filtered = membersData.documents.filter(m => projectUserIds.has(m.userId));

    // If filtering results in empty (e.g. userId mismatch), fallback to all workspace members
    return filtered.length > 0 ? filtered : membersData.documents;
  }, [membersData, projectMembersData]);

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

  // Define getSprintWorkItems BEFORE it's used in allVisibleWorkItemIds
  const getSprintWorkItems = useCallback((sprintId: string) => {
    const items = workItemsData?.documents?.filter((item) =>
      item.sprintId === sprintId && item.type !== WorkItemType.EPIC
    ) || [];
    if (!searchQuery) return items;
    return items.filter((item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [workItemsData, searchQuery]);

  // All visible work items (backlog + sprints)
  const allVisibleWorkItemIds = useMemo(() => {
    const sprintItemIds = sprints.flatMap(sprint => 
      getSprintWorkItems(sprint.$id).map(item => item.$id)
    );
    const backlogItemIds = backlogItems.map(item => item.$id);
    return [...backlogItemIds, ...sprintItemIds];
  }, [backlogItems, sprints, getSprintWorkItems]);

  // Keyboard shortcuts for bulk selection
  const getStatusCounts = (items: PopulatedWorkItem[]) => {
    return {
      todo: items.filter((item) => item.status === WorkItemStatus.TODO).length,
      inProgress: items.filter((item) => item.status === WorkItemStatus.IN_PROGRESS).length,
      done: items.filter((item) => item.status === WorkItemStatus.DONE).length,
    };
  };

  // Multi-select Handlers
  const toggleSelection = useCallback((itemId: string) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  // Select all items from a given list
  const selectAll = useCallback((itemIds: string[]) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      itemIds.forEach(id => newSet.add(id));
      return newSet;
    });
  }, []);

  // Deselect all items from a given list
  const _deselectAll = useCallback((itemIds: string[]) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      itemIds.forEach(id => newSet.delete(id));
      return newSet;
    });
  }, []);

  // Toggle all items in a list (select all if not all selected, deselect all if all are selected)
  const toggleSelectAll = useCallback((itemIds: string[]) => {
    setSelectedItemIds(prev => {
      const allSelected = itemIds.length > 0 && itemIds.every(id => prev.has(id));
      if (allSelected) {
        // Deselect all
        const newSet = new Set(prev);
        itemIds.forEach(id => newSet.delete(id));
        return newSet;
      } else {
        // Select all
        const newSet = new Set(prev);
        itemIds.forEach(id => newSet.add(id));
        return newSet;
      }
    });
  }, []);

  // Check if all items in a list are selected
  const _areAllSelected = useCallback((itemIds: string[]): boolean => {
    return itemIds.length > 0 && itemIds.every(id => selectedItemIds.has(id));
  }, [selectedItemIds]);

  // Check if some (but not all) items in a list are selected  
  const _areSomeSelected = useCallback((itemIds: string[]): boolean => {
    if (itemIds.length === 0) return false;
    const selectedCount = itemIds.filter(id => selectedItemIds.has(id)).length;
    return selectedCount > 0 && selectedCount < itemIds.length;
  }, [selectedItemIds]);

  const clearSelection = useCallback(() => {
    setSelectedItemIds(new Set());
  }, []);

  // Keyboard shortcuts for selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ctrl/Cmd + A: Select all visible items
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        if (selectedItemIds.size === allVisibleWorkItemIds.length && allVisibleWorkItemIds.length > 0) {
          // All already selected, deselect all
          clearSelection();
        } else {
          // Select all visible items
          selectAll(allVisibleWorkItemIds);
        }
      }

      // Escape: Clear selection
      if (e.key === 'Escape' && selectedItemIds.size > 0) {
        e.preventDefault();
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemIds, allVisibleWorkItemIds, clearSelection, selectAll]);

  // Memoize backlog item IDs to avoid recalculating on every render
  const backlogItemIds = useMemo(() => backlogItems.map(i => i.$id), [backlogItems]);


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
      optimistic: true,
      silent: true,
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
      optimistic: true,
      silent: true,
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
    if (updates.startDate !== undefined) jsonUpdates.startDate = updates.startDate ? new Date(updates.startDate) : null;
    if (updates.dueDate !== undefined) jsonUpdates.dueDate = new Date(updates.dueDate);
    if (updates.estimatedHours !== undefined) jsonUpdates.estimatedHours = updates.estimatedHours;
    if (updates.labels !== undefined) jsonUpdates.labels = updates.labels;

    updateWorkItem({
      param: { workItemId: selectedItem.$id },
      json: jsonUpdates,
      optimistic: true,
      silent: false, // Show toast for explicit save actions in drawer
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
      optimistic: true,
      silent: true,
    });

    setEditingWorkItemId(null);
    setEditingWorkItemTitle("");
  };

  const handleCancelEditWorkItem = () => {
    setEditingWorkItemId(null);
    setEditingWorkItemTitle("");
  };

  console.log("Selected Item:", selectedItem);

  const handleUpdateEpic = (workItemId: string, epicId: string | null) => {
    updateWorkItem({
      param: { workItemId },
      json: { epicId: epicId === "none" ? null : epicId },
      optimistic: true,
      silent: true,
    });
  };

  const handleUpdateStoryPoints = (workItemId: string, storyPoints: number | undefined) => {
    updateWorkItem({
      param: { workItemId },
      json: { storyPoints },
      optimistic: true,
      silent: true,
    });
  };

  const handleUpdatePriority = (workItemId: string, priority: WorkItemPriority) => {
    updateWorkItem({
      param: { workItemId },
      json: { priority },
      optimistic: true,
      silent: true,
    });
  };

  // Called by AssigneePopover with the new assignee IDs array
  const handleAssigneeUpdate = useCallback((workItemId: string, newAssigneeIds: string[]) => {
    updateWorkItem({
      param: { workItemId },
      json: { assigneeIds: newAssigneeIds },
      optimistic: true,
      silent: true,
    });
  }, [updateWorkItem]);

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
                {canCreateWorkItems && (
                  <Button
                    onClick={() => setIsCreateEpicDialogOpen(true)}
                    variant="outline" size={"xs"}
                  >
                    <Plus className="w-2 h-2" />
                    Add Epic
                  </Button>
                )}
                {canCreateWorkItems && (
                  <Button
                    size="xs"
                    // Default/Primary variant
                    onClick={() => setIsCreatingInBacklog(true)}
                  >
                    <Plus className="w-3 h-3 mr-0.5" />
                    Quick create
                  </Button>
                )}
                {canCreateWorkItems && (
                  <Button
                    size="xs"
                    // Default/Primary variant
                    onClick={() => openCreateTaskModal()}
                  >
                    <Plus className="w-3 h-3 mr-0.5" />
                    Create Full Workitem
                  </Button>
                )}
                {canCreateSprints && (
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
              {canEditWorkItems && (
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
              {canDeleteWorkItems && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30 hover:border-destructive/40 shadow-none"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="px-4 py-4 overflow-y-scroll">
          <div className="space-y-4">
            {/* Sprint Sections */}
            {sprints.map((sprint) => {
              const sprintItems = getSprintWorkItems(sprint.$id);
              const sprintItemIds = sprintItems.map(i => i.$id); // Calculate once per sprint
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
                              canEditSprints && (
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
                          {sprint.status === SprintStatus.PLANNED && canStartSprint && (
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

                          {sprint.status === SprintStatus.ACTIVE && canCompleteSprint && (
                            <Button
                              size="xs"
                              // Default/Primary variant
                              onClick={() => handleCompleteSprint(sprint.$id)}
                            >
                              <CheckCircle2 className="size-2" />
                              Complete sprint
                            </Button>
                          )}

                          {(canEditSprints || canDeleteSprints) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canEditSprints && (
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
                                {canEditSprints && (
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
                                {canDeleteSprints && (
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
                              {/* Column Header Row with Select All */}
                              <div className="px-4 py-2 bg-muted/50 border-b border-border">
                                <div className="flex items-center gap-4">
                                  <div className="flex items-center gap-3">
                                    {/* Select All Checkbox for Sprint - Memoized */}
                                    <SelectAllCheckbox
                                      itemIds={sprintItemIds}
                                      selectedItemIds={selectedItemIds}
                                      onToggle={toggleSelectAll}
                                      label={`Select all items in ${sprint.name}`}
                                      itemCount={sprintItemIds.length}
                                    />
                                    <div className="w-4" />
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-12 text-center">Type</span>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">Key</span>
                                  </div>
                                  <span className="flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">Status</span>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[90px]">Priority</span>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[70px]">SP</span>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">Assignee</span>
                                  </div>
                                </div>
                              </div>
                              {sprintItems.map((item, index) => (
                                <Draggable key={item.$id} draggableId={item.$id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={`px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors group ${snapshot.isDragging ? "shadow-lg rounded-lg border border-border bg-card" : ""
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
                                              className="data-[state=unchecked]:border-border"
                                            />
                                          </div>
                                          {/* Drag Handle - separate from checkbox */}
                                          <div
                                            {...provided.dragHandleProps}
                                            className="flex items-center justify-center cursor-grab active:cursor-grabbing w-4"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <GripVertical className="size-4 text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0" />
                                          </div>

                                          <div className="w-12 flex justify-center flex-shrink-0">
                                            <WorkItemIcon type={item.type} project={project ?? undefined} className="size-4" />
                                          </div>

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
                                                  const IconComponent = resolveIconSync(column.icon);
                                                  return (
                                                    <SelectItem key={column.$id} value={column.$id}>
                                                      <div className="flex items-center gap-2">
                                                        <IconComponent className="size-4" style={{ color: column.color }} />
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

                                        {/* Assignee Multi-Select - Memoized for instant checkbox feedback */}
                                        <div className="w-[140px] h-7 text-xs flex-shrink-0 flex items-center border rounded-md hover:bg-accent/50 transition-colors">
                                          <AssigneePopover
                                            workItemId={item.$id}
                                            initialAssigneeIds={item.assigneeIds || []}
                                            projectMembers={projectMembers}
                                            onUpdate={handleAssigneeUpdate}
                                          />
                                        </div>
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
                                {canStartSprint && (
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
                            canCreateWorkItems && (
                              <div className="flex items-center gap-0 border-t border-border">
                                <button
                                  onClick={() => setIsCreatingInSprint(sprint.$id)}
                                  className="w-1/2 px-4 py-3 text-left text-sm text-muted-foreground hover:bg-accent transition-colors flex items-center gap-2 border-r border-border"
                                >
                                  <Plus className="size-4" />
                                  Create work item
                                </button>
                                <button
                                  onClick={() => openCreateTaskModal()}
                                  className="w-1/2 px-4 py-3 text-left text-sm text-muted-foreground hover:bg-accent transition-colors flex items-center gap-2"
                                >
                                  <Plus className="size-4" />
                                  Create full work item
                                </button>
                              </div>
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
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/50"></div>
                        <span className="text-muted-foreground">
                          {getStatusCounts(backlogItems).todo}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="text-muted-foreground">
                          {getStatusCounts(backlogItems).inProgress}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-muted-foreground">
                          {getStatusCounts(backlogItems).done}
                        </span>
                      </div>
                    </div>

                    {canCreateSprints && (
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
                        <p className="text-sm text-muted-foreground">No items in backlog.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {/* Column Header Row */}
                        <div className="px-4 py-2 bg-muted/50 border-b border-border">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3">
                              {/* Select All Checkbox - Memoized */}
                              <SelectAllCheckbox
                                itemIds={backlogItemIds}
                                selectedItemIds={selectedItemIds}
                                onToggle={toggleSelectAll}
                                label="Select all backlog items"
                                itemCount={backlogItemIds.length}
                              />
                              <div className="w-4" />
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-12 text-center">Type</span>
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">Key</span>
                            </div>
                            <span className="flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">Status</span>
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[90px]">Priority</span>
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[70px]">SP</span>
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">Assignee</span>
                            </div>
                          </div>
                        </div>
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
                                      className="flex items-center justify-center cursor-grab active:cursor-grabbing w-4"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <GripVertical className="size-4 text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0" />
                                    </div>

                                    <div className="w-12 flex justify-center flex-shrink-0">
                                      <WorkItemIcon type={item.type} project={project ?? undefined} className="size-4" />
                                    </div>

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
                                            const IconComponent = resolveIconSync(column.icon);
                                            return (
                                              <SelectItem key={column.$id} value={column.$id}>
                                                <div className="flex items-center gap-2">
                                                  <IconComponent className="size-4" style={{ color: column.color }} />
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

                                  {/* Assignee Multi-Select - Memoized for instant checkbox feedback */}
                                  <div className="w-[140px] h-7 text-xs flex-shrink-0 flex items-center border rounded-md hover:bg-accent/50 transition-colors">
                                    <AssigneePopover
                                      workItemId={item.$id}
                                      initialAssigneeIds={item.assigneeIds || []}
                                      projectMembers={projectMembers}
                                      onUpdate={handleAssigneeUpdate}
                                    />
                                  </div>

                                  {/* Actions Dropdown */}
                                  {canDeleteWorkItems && (
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
                                <ChevronDown className="size-3 text-muted-foreground/50" />
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
                      canCreateWorkItems && (
                        <div className="flex items-center gap-0 border-t border-border">
                          <button
                            onClick={() => setIsCreatingInBacklog(true)}
                            className="w-1/2 px-4 py-3 text-left text-sm text-muted-foreground hover:bg-muted transition-colors flex items-center gap-2 border-r border-border"
                          >
                            <Plus className="size-4" />
                            Create work item
                          </button>
                          <button
                            onClick={() => openCreateTaskModal()}
                            className="w-1/2 px-4 py-3 text-left text-sm text-muted-foreground hover:bg-muted transition-colors flex items-center gap-2"
                          >
                            <Plus className="size-4" />
                            Create full work item
                          </button>
                        </div>
                      )
                    )}

                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>
        </div>

        {/* Work Item Detail Drawer - ClickUp-style */}
        <Sheet open={isDrawerOpen} onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) {
            setIsExpanded(false);
            setDrawerWidth(540);
          }
        }}>
          <SheetContent 
            className="p-0 overflow-hidden flex flex-col gap-0"
            style={{ width: isExpanded ? "90vw" : `${drawerWidth}px`, maxWidth: isExpanded ? "90vw" : `${drawerWidth}px` }}
          >
            {/* Drag handle for resizing */}
            {!isExpanded && (
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-50"
                onMouseDown={handleMouseDown}
              />
            )}
            {selectedItem && (
              <>
                {/* Hidden accessible title */}
                <SheetHeader className="sr-only">
                  <SheetTitle>{selectedItem.title}</SheetTitle>
                  <SheetDescription>Work item details</SheetDescription>
                </SheetHeader>

                {/* Top Navigation Bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <WorkItemIcon type={selectedItem.type} project={project ?? undefined} className="size-4" />
                      <span className="text-xs text-muted-foreground">/</span>
                      <span className="text-xs font-medium text-muted-foreground">{project?.name || "Project"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">|</span>
                    <button
                      className="hover:bg-accent p-1 rounded transition-colors"
                      onClick={() => {
                        const url = typeof window !== "undefined"
                          ? `${window.location.origin}/workspaces/${workspaceId}/tasks/${selectedItem.$id}`
                          : "#";
                        window.open(url, "_blank");
                      }}
                    >
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Expand/Collapse toggle */}
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="hover:bg-accent p-1.5 rounded-md transition-colors"
                            onClick={() => setIsExpanded(!isExpanded)}
                          >
                            {isExpanded ? (
                              <ChevronRight className="size-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="size-3.5 text-muted-foreground rotate-[-90deg]" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs">{isExpanded ? "Collapse panel" : "Expand panel"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {canDeleteWorkItems && (
                      <button
                        className="hover:bg-destructive/10 p-1.5 rounded-md transition-colors group"
                        title="Delete work item"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this work item? This action cannot be undone.")) {
                            deleteWorkItem({ param: { workItemId: selectedItem.$id } });
                            toast.success("Work item deleted");
                            setIsDrawerOpen(false);
                            setPendingChanges({});
                          }
                        }}
                      >
                        <Trash2 className="size-3.5 text-muted-foreground group-hover:text-destructive" />
                      </button>
                    )}
                    <button
                      className="hover:bg-accent p-1.5 mr-6 rounded-md transition-colors"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            typeof window !== "undefined"
                              ? `${window.location.origin}/workspaces/${workspaceId}/projects/}`
                              : ""
                          );
                          toast.success("Link copied");
                        } catch { toast.error("Failed to copy"); }
                      }}
                    >
                      <Share2 className="size-3.5 text-muted-foreground" />
                    </button>


                  </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto">
                  {/* Type Badge + Task ID */}
                  <div className="px-5 pt-5 pb-2">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md text-xs font-medium">
                        <WorkItemIcon type={selectedItem.type} project={project ?? undefined} className="size-3.5" />
                        <span>{allWorkItemTypes.find(t => t.key === selectedItem.type)?.label || selectedItem.type}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{selectedItem.key}</span>
                    </div>

                    {/* Editable Title */}
                    <Input
                      value={pendingChanges.title ?? selectedItem.title}
                      onChange={(e) => setPendingChanges(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Task title"
                      className="text-xl font-semibold border-none shadow-none px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
                    />
                  </div>

                  {/* Properties Section */}
                  <div className="px-5 py-3">
                    {/* Status Row */}
                    <div className="flex items-center py-0.5 group">
                      <div className="flex items-center gap-2.5  w-[140px] shrink-0">
                        <CheckCircle2 className="size-3.5 text-muted-foreground" />
                        <span className="text-xs  font-medium">Status</span>
                      </div>
                      <div className="flex-1">
                        <Select
                          value={pendingChanges.status ?? selectedItem.status}
                          onValueChange={(value) => {
                            setPendingChanges(prev => ({ ...prev, status: value as WorkItemStatus }));
                          }}
                        >
                          <SelectTrigger className="h-8 border-none shadow-none bg-transparent hover:bg-accent/50 text-xs px-2 w-auto min-w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={WorkItemStatus.TODO}>
                              <div className="flex items-center gap-2">
                                <div className="size-2 rounded-full bg-gray-400" />
                                To Do
                              </div>
                            </SelectItem>
                            <SelectItem value={WorkItemStatus.ASSIGNED}>
                              <div className="flex items-center gap-2">
                                <div className="size-2 rounded-full bg-blue-400" />
                                Assigned
                              </div>
                            </SelectItem>
                            <SelectItem value={WorkItemStatus.IN_PROGRESS}>
                              <div className="flex items-center gap-2">
                                <div className="size-2 rounded-full bg-yellow-400" />
                                In Progress
                              </div>
                            </SelectItem>
                            <SelectItem value={WorkItemStatus.IN_REVIEW}>
                              <div className="flex items-center gap-2">
                                <div className="size-2 rounded-full bg-purple-400" />
                                In Review
                              </div>
                            </SelectItem>
                            <SelectItem value={WorkItemStatus.DONE}>
                              <div className="flex items-center gap-2">
                                <div className="size-2 rounded-full bg-green-400" />
                                Done
                              </div>
                            </SelectItem>
                            {customColumns.length > 0 && (
                              <>
                                <SelectSeparator />
                                {customColumns.map((column) => {
                                  const IconComponent = resolveIconSync(column.icon);
                                  return (
                                    <SelectItem key={column.$id} value={column.$id}>
                                      <div className="flex items-center gap-2">
                                        <IconComponent className="size-4" style={{ color: column.color }} />
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
                    </div>

                    {/* Assignees Row */}
                    <div className="flex items-center py-0.5 group">
                      <div className="flex items-center gap-2.5 w-[140px] shrink-0">
                        <Users className="size-3.5 text-muted-foreground" />
                        <span className="text-xs  font-medium">Assignees</span>
                      </div>
                      <div className="flex-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="h-8 flex items-center gap-2 px-2 rounded-md hover:bg-accent/50 transition-colors min-w-[120px]">
                              {(() => {
                                const currentIds = pendingChanges.assigneeIds ?? selectedItem.assigneeIds ?? [];
                                const currentAssignees = selectedItem.assignees?.filter(a => a != null) || [];
                                if (currentIds.length > 0 && currentAssignees.length > 0) {
                                  return (
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex -space-x-1.5">
                                        {currentAssignees.slice(0, 3).map((assignee) => (
                                          <Avatar key={assignee.$id} className="size-5 border border-background">
                                            <AvatarImage src={assignee.profileImageUrl || ""} />
                                            <AvatarFallback className="text-[10px]">
                                              {(assignee.name ?? "?").charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                        ))}
                                      </div>
                                      <span className="text-xs">
                                        {currentAssignees.length > 2
                                          ? `${currentAssignees.length} assigned`
                                          : currentAssignees.map(a => a?.name?.split(" ")[0]).join(", ")}
                                      </span>
                                    </div>
                                  );
                                }
                                return <span className="text-xs text-muted-foreground">Empty</span>;
                              })()}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-0" align="start">
                            <div className="p-2 border-b">
                              <p className="text-xs font-medium text-muted-foreground">Assign members</p>
                            </div>
                            <div className="max-h-[200px] overflow-y-auto p-1">
                              {projectMembers.map((member) => {
                                const currentIds = pendingChanges.assigneeIds ?? selectedItem.assigneeIds ?? [];
                                const isSelected = currentIds.includes(member.$id);
                                return (
                                  <div
                                    key={member.$id}
                                    role="button"
                                    tabIndex={0}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${isSelected ? "bg-muted" : "hover:bg-accent"}`}
                                    onClick={() => {
                                      if (isSelected) {
                                        setPendingChanges(prev => ({ ...prev, assigneeIds: currentIds.filter(id => id !== member.$id) }));
                                      } else {
                                        setPendingChanges(prev => ({ ...prev, assigneeIds: [...currentIds, member.$id] }));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        if (isSelected) {
                                          setPendingChanges(prev => ({ ...prev, assigneeIds: currentIds.filter(id => id !== member.$id) }));
                                        } else {
                                          setPendingChanges(prev => ({ ...prev, assigneeIds: [...currentIds, member.$id] }));
                                        }
                                      }
                                    }}
                                  >
                                    <Checkbox checked={isSelected} className="pointer-events-none" />
                                    <Avatar className="size-5">
                                      <AvatarImage src={member.profileImageUrl || ""} />
                                      <AvatarFallback className="text-[10px]">
                                        {(member.name ?? "?").charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs">{member.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                            {(pendingChanges.assigneeIds ?? selectedItem.assigneeIds ?? []).length > 0 && (
                              <div className="p-1 border-t">
                                <button
                                  className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
                                  onClick={() => setPendingChanges(prev => ({ ...prev, assigneeIds: [] }))}
                                >
                                  Clear all
                                </button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>


                    {/* Type Row */}
                    <div className="flex items-center py-0.5 group">
                      <div className="flex items-center gap-2.5 w-[140px] shrink-0">
                        <Layers className="size-3.5 text-muted-foreground" />
                        <span className="text-xs  font-medium">Type</span>
                      </div>
                      <div className="flex-1">
                        <Select
                          value={pendingChanges.type ?? selectedItem.type}
                          onValueChange={(value: WorkItemType) => {
                            setPendingChanges(prev => ({ ...prev, type: value }));
                          }}
                        >
                          <SelectTrigger className="h-8 border-none shadow-none bg-transparent hover:bg-accent/50 text-sm px-2 w-auto min-w-[120px]">
                            <SelectValue>
                              <div className="flex items-center gap-2 text-xs">
                                <WorkItemIcon type={pendingChanges.type ?? selectedItem.type} project={project ?? undefined} className="size-3.5" />
                                <span>{allWorkItemTypes.find(t => t.key === (pendingChanges.type ?? selectedItem.type))?.label || (pendingChanges.type ?? selectedItem.type)}</span>
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {allWorkItemTypes.map((type) => (
                              <SelectItem key={type.key} value={type.key}>
                                <div className="flex items-center gap-2 text-xs">
                                  <WorkItemIcon type={type.key as WorkItemType} project={project ?? undefined} className="size-3.5" />
                                  <span>{type.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Priority Row */}
                    <div className="flex items-center py-0.5 group">
                      <div className="flex items-center gap-2.5 w-[140px] shrink-0">
                        <Flag className="size-3.5 text-muted-foreground" />
                        <span className="text-xs  font-medium">Priority</span>
                      </div>
                      <div className="flex-1">
                        <Select
                          value={pendingChanges.priority ?? selectedItem.priority ?? WorkItemPriority.MEDIUM}
                          onValueChange={(value: WorkItemPriority) => {
                            setPendingChanges(prev => ({ ...prev, priority: value }));
                          }}
                        >
                          <SelectTrigger className="h-8 border-none shadow-none bg-transparent hover:bg-accent/50 text-xs px-2 w-auto min-w-[120px]">
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
                    </div>


                    {/* Dates Row - Start Date */}
                    <div className="flex items-center py-0.5 group">
                      <div className="flex items-center gap-2.5 w-[140px] shrink-0">
                        <Calendar className="size-3.5 text-muted-foreground" />
                        <span className="text-xs  font-medium">Start Date</span>
                      </div>
                      <div className="flex-1">
                        <DatePicker
                          value={pendingChanges.startDate !== undefined ? (pendingChanges.startDate ? new Date(pendingChanges.startDate) : undefined) : (selectedItem.startDate ? new Date(selectedItem.startDate) : undefined)}
                          onChange={(date) => {
                            setPendingChanges(prev => ({ ...prev, startDate: date?.toISOString() ?? null }));
                          }}
                          placeholder="Start"
                          variant="ghost"
                          className="h-8 border-none shadow-none bg-transparent hover:bg-accent/50 text-xs px-2 w-auto min-w-[120px] justify-start"
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Dates Row - Due/End Date */}
                    <div className="flex items-center py-0.5 group">
                      <div className="flex items-center gap-2.5 w-[140px] shrink-0">
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                        <span className="text-xs  font-medium">Due Date</span>
                      </div>
                      <div className="flex-1">
                        <DatePicker
                          value={pendingChanges.dueDate !== undefined ? (pendingChanges.dueDate ? new Date(pendingChanges.dueDate) : undefined) : (selectedItem.dueDate ? new Date(selectedItem.dueDate) : undefined)}
                          onChange={(date) => {
                            setPendingChanges(prev => ({ ...prev, dueDate: date?.toISOString() }));
                          }}
                          placeholder="Due"
                          variant="ghost"
                          className="h-8 border-none shadow-none bg-transparent hover:bg-accent/50 text-xs px-2 w-auto min-w-[120px] justify-start"
                          size="sm"
                        />
                      </div>
                    </div>


                    {/* Labels Row */}
                    <div className="flex items-start py-0.5 group">
                      <div className="flex items-center gap-2.5 w-[140px] shrink-0 pt-2">
                        <Tag className="size-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Labels</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap gap-1.5 items-center min-h-[32px] px-2 py-1">
                          {(pendingChanges.labels ?? selectedItem.labels ?? []).map((label, index) => {
                            const customLabel = project?.customLabels?.find(l => l.name === label);
                            const labelColor = customLabel?.color || getLabelColor(label);
                            return (
                              <Badge
                                key={index}
                                variant="outline"
                                className="text-xs px-2 py-0.5 gap-1.5 font-normal cursor-default"
                              >
                                <span
                                  className="size-2 rounded-full shrink-0"
                                  style={{ backgroundColor: labelColor }}
                                />
                                {label}
                                <button
                                  className="ml-0.5 hover:text-destructive transition-colors"
                                  onClick={() => {
                                    const currentLabels = pendingChanges.labels ?? selectedItem.labels ?? [];
                                    setPendingChanges(prev => ({
                                      ...prev,
                                      labels: currentLabels.filter((_, i) => i !== index),
                                    }));
                                  }}
                                >
                                  <X className="size-3" />
                                </button>
                              </Badge>
                            );
                          })}
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="size-6 rounded-md border border-dashed border-border flex items-center justify-center hover:bg-accent transition-colors">
                                <Plus className="size-3.5 text-muted-foreground" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-0" align="start">
                              <div className="p-2 border-b border-border">
                                <Input
                                  placeholder="Add labels..."
                                  className="h-8 text-sm"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                                      const newLabel = (e.target as HTMLInputElement).value.trim();
                                      const currentLabels = pendingChanges.labels ?? selectedItem.labels ?? [];
                                      if (!currentLabels.includes(newLabel)) {
                                        setPendingChanges(prev => ({
                                          ...prev,
                                          labels: [...currentLabels, newLabel],
                                        }));
                                      }
                                      (e.target as HTMLInputElement).value = "";
                                    }
                                  }}
                                />
                              </div>
                              <div className="p-2">
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">Suggestions</p>
                                <div className="space-y-0.5">
                                  {[
                                    ...(project?.customLabels?.map(l => l.name) || []),
                                    "Bug", "Feature", "Improvement", "Documentation", "Design",
                                    "Research", "Frontend", "Backend",
                                  ]
                                    .filter((v, i, a) => a.indexOf(v) === i)
                                    .filter(label => !(pendingChanges.labels ?? selectedItem.labels ?? []).includes(label))
                                    .map((label) => {
                                      const customLabel = project?.customLabels?.find(l => l.name === label);
                                      const labelColor = customLabel?.color || getLabelColor(label);
                                      return (
                                        <button
                                          key={label}
                                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-accent transition-colors text-left"
                                          onClick={() => {
                                            const currentLabels = pendingChanges.labels ?? selectedItem.labels ?? [];
                                            if (!currentLabels.includes(label)) {
                                              setPendingChanges(prev => ({
                                                ...prev,
                                                labels: [...currentLabels, label],
                                              }));
                                            }
                                          }}
                                        >
                                          <span
                                            className="size-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: labelColor }}
                                          />
                                          <span>{label}</span>
                                        </button>
                                      );
                                    })}
                                </div>
                              </div>
                              {(pendingChanges.labels ?? selectedItem.labels ?? []).length > 0 && (
                                <div className="p-2 border-t border-border">
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">Labels</p>
                                  <div className="space-y-0.5">
                                    {(pendingChanges.labels ?? selectedItem.labels ?? []).map((label, index) => {
                                      const customLabel = project?.customLabels?.find(l => l.name === label);
                                      const labelColor = customLabel?.color || getLabelColor(label);
                                      return (
                                        <div key={index} className="flex items-center justify-between px-2 py-1.5 rounded-md text-sm">
                                          <div className="flex items-center gap-2">
                                            <span
                                              className="size-2.5 rounded-full shrink-0"
                                              style={{ backgroundColor: labelColor }}
                                            />
                                            <span>{label}</span>
                                          </div>
                                          <button
                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                            onClick={() => {
                                              const currentLabels = pendingChanges.labels ?? selectedItem.labels ?? [];
                                              setPendingChanges(prev => ({
                                                ...prev,
                                                labels: currentLabels.filter((_, i) => i !== index),
                                              }));
                                            }}
                                          >
                                            <X className="size-3.5" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </div>

                    {/* Time Estimate Row */}
                    <div className="flex items-center py-0.5 group">
                      <div className="flex items-center gap-2.5 w-[140px] shrink-0">
                        <Clock className="size-3.5 text-muted-foreground" />
                        <span className="text-xs  font-medium">Time Estimate</span>
                      </div>
                      <div className="flex-1">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder="Empty"
                          value={pendingChanges.estimatedHours !== undefined ? (pendingChanges.estimatedHours ?? "") : (selectedItem.estimatedHours ?? "")}
                          onChange={(e) => {
                            const val = e.target.value ? parseFloat(e.target.value) : undefined;
                            setPendingChanges(prev => ({ ...prev, estimatedHours: val }));
                          }}
                          className="h-6 border-none shadow-none outline-none bg-transparent hover:bg-accent/50 text-xs px-2"
                        />
                      </div>
                    </div>

                    {/* Story Points Row */}
                    <div className="flex items-center py-0.5 group">
                      <div className="flex items-center gap-2.5 w-[140px] shrink-0">
                        <Layers className="size-3.5 text-muted-foreground" />
                        <span className="text-xs  font-medium">Story Points</span>
                      </div>
                      <div className="flex-1">
                        <Input
                          type="number"
                          min="0"
                          placeholder="Empty"
                          value={pendingChanges.storyPoints !== undefined ? (pendingChanges.storyPoints ?? "") : (selectedItem.storyPoints ?? "")}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : undefined;
                            setPendingChanges(prev => ({ ...prev, storyPoints: val }));
                          }}
                          className="h-8 border-none shadow-none bg-transparent hover:bg-accent/50 text-xs outline-none px-2"
                        />
                      </div>
                    </div>

                    {/* Flagged Row */}
                    <div className="flex items-center py-0.5 group">
                      <div className="flex items-center gap-2.5 w-[140px] shrink-0">
                        <Flag className="size-3.5 text-muted-foreground" />
                        <span className="text-xs  font-medium">Flagged</span>
                      </div>
                      <div className="flex-1 px-2">
                        <Switch

                          checked={pendingChanges.flagged ?? selectedItem.flagged}
                          onCheckedChange={(checked) => {
                            setPendingChanges(prev => ({ ...prev, flagged: checked }));
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Description Section - Inline TipTap Editor */}
                  <div className="px-5 py-4">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm font-semibold flex items-center gap-2 mb-3 cursor-default">
                            Description
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start">
                          <p className="text-xs">Click below to edit description. Supports rich text formatting.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="border rounded-lg overflow-hidden">
                      <RichTextEditor
                        content={pendingChanges.description ?? selectedItem.description ?? ""}
                        onChange={(content) => {
                          setPendingChanges(prev => ({ ...prev, description: content }));
                        }}
                        workspaceId={workspaceId}
                        projectId={projectId}
                        placeholder="Add a description..."
                        minHeight="120px"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Subtasks Section */}
                  <div className="px-5 py-4">
                    <h3 className="text-sm font-semibold mb-3">Add subtask</h3>
                    <SubtasksList
                      parentTaskId={selectedItem.$id}
                      workspaceId={workspaceId}
                    />
                  </div>

                  <Separator />

                  {/* Attachments Section */}
                  <div className="px-5 py-4 pb-24">
                    <h3 className="text-sm font-semibold mb-3">Attachments</h3>
                    <TaskAttachments
                      taskId={selectedItem.$id}
                      workspaceId={workspaceId}
                    />
                  </div>

                </div>

                {/* Floating Save Button */}
                {Object.keys(pendingChanges).length > 0 && (
                  <div className="absolute bottom-6 right-6 z-50 flex items-center gap-2 animate-in slide-in-from-bottom-4 fade-in duration-200">
                    <Button
                      variant="outline"
                      size="sm"
                      className="shadow-lg bg-card"
                      onClick={() => {
                        setPendingChanges({});
                      }}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      className="shadow-lg px-6"
                      onClick={() => {
                        if (Object.keys(pendingChanges).length > 0) {
                          handleUpdateWorkItem(pendingChanges);
                        }
                        setPendingChanges({});
                      }}
                    >
                      Save Changes
                    </Button>
                  </div>
                )}
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
        projectId={projectId}
        workspaceId={workspaceId}
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
