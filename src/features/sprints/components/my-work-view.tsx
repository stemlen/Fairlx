"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useQueryState } from "nuqs";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  Search,
  LayoutGrid,
  List,
  CheckCircle2,
  CircleDotDashedIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  AlertCircle,
  Flag,
  Layers,
  Calendar,
} from "lucide-react";

import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";
import { useCurrentMember } from "@/features/members/hooks/use-current-member";
import { useGetProjects } from "@/features/projects/api/use-get-projects";

import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useGetWorkItems } from "../api/use-get-work-items";
import { useUpdateWorkItem } from "../api/use-update-work-item";
import { WorkItemOptionsMenu } from "./work-item-options-menu";
import {
  WorkItemStatus,
  WorkItemPriority,
  PopulatedWorkItem
} from "../types";
import { useGetCustomColumns } from "@/features/custom-columns/api/use-get-custom-columns";
import { cn } from "@/lib/utils";
import { isBefore, format } from "date-fns";

// Status icon map matching kanban board
const statusIconMap: Record<WorkItemStatus, React.ReactNode> = {
  [WorkItemStatus.TODO]: <CircleIcon className="size-4 text-gray-400" />,
  [WorkItemStatus.ASSIGNED]: <CircleIcon className="size-4 text-red-400" />,
  [WorkItemStatus.IN_PROGRESS]: <CircleDotDashedIcon className="size-4 text-yellow-500" />,
  [WorkItemStatus.IN_REVIEW]: <CircleDotIcon className="size-4 text-blue-400" />,
  [WorkItemStatus.DONE]: <CircleCheckIcon className="size-4 text-emerald-400" />,
};

// Status display names
const statusLabels: Record<WorkItemStatus, string> = {
  [WorkItemStatus.TODO]: "To Do",
  [WorkItemStatus.ASSIGNED]: "Assigned",
  [WorkItemStatus.IN_PROGRESS]: "In Progress",
  [WorkItemStatus.IN_REVIEW]: "In Review",
  [WorkItemStatus.DONE]: "Done",
};

// Board order for kanban view (default columns)
const defaultBoardOrder: WorkItemStatus[] = [
  WorkItemStatus.TODO,
  WorkItemStatus.ASSIGNED,
  WorkItemStatus.IN_PROGRESS,
  WorkItemStatus.IN_REVIEW,
  WorkItemStatus.DONE,
];

// Type for grouped items state - now supports dynamic keys
type ItemsState = Record<string, PopulatedWorkItem[]>;

// Column info for rendering
interface ColumnInfo {
  id: string;
  name: string;
  icon: React.ReactNode;
  isCustom: boolean;
}

export const MyWorkView = () => {
  const workspaceId = useWorkspaceId();
  const { member: currentMember } = useCurrentMember({ workspaceId });
  const [view, setView] = useQueryState("view", { defaultValue: "board" });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const { data: projects } = useGetProjects({ workspaceId });
  const { mutate: updateWorkItem } = useUpdateWorkItem();

  // Fetch custom columns for all projects in the workspace
  const { data: customColumnsData } = useGetCustomColumns({ workspaceId, fetchAll: true });
  const customColumns = useMemo(
    () => (customColumnsData?.documents || []).map(doc => ({
      $id: doc.$id,
      name: doc.name,
      color: doc.color
    })),
    [customColumnsData]
  );

  // Fetch work items assigned to current user
  const { data: workItems, isLoading } = useGetWorkItems({
    workspaceId,
    assigneeId: currentMember?.$id,
  });

  // State for kanban board items - dynamic keys
  const [itemsByStatus, setItemsByStatus] = useState<ItemsState>({});

  // Filter and organize work items
  const filteredWorkItems = useMemo(() => {
    if (!workItems?.documents) return [];

    let items = workItems.documents as PopulatedWorkItem[];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.key.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      items = items.filter((item) => item.status === statusFilter);
    }

    // Apply priority filter
    if (priorityFilter !== "all") {
      items = items.filter((item) => item.priority === priorityFilter);
    }

    // Apply project filter
    if (projectFilter !== "all") {
      items = items.filter((item) => item.projectId === projectFilter);
    }

    return items;
  }, [workItems, searchQuery, statusFilter, priorityFilter, projectFilter]);

  // Update itemsByStatus when filteredWorkItems changes
  useEffect(() => {
    const grouped: ItemsState = {};
    const seenIds = new Set<string>(); // Track seen IDs to prevent duplicates

    // Group items by their actual status (including custom column IDs)
    // Deduplicate items to prevent React key warnings
    filteredWorkItems.forEach((item) => {
      // Skip if we've already seen this item ID (prevents duplicate key errors)
      if (seenIds.has(item.$id)) {
        return;
      }
      seenIds.add(item.$id);

      const status = item.status;
      if (!grouped[status]) {
        grouped[status] = [];
      }
      grouped[status].push(item);
    });

    setItemsByStatus(grouped);
  }, [filteredWorkItems]);

  // Compute visible board columns
  const visibleColumns = useMemo((): ColumnInfo[] => {
    const columns: ColumnInfo[] = [];
    const addedStatuses = new Set<string>(defaultBoardOrder);

    // Get all statuses that have items
    const statusesWithItems = Object.keys(itemsByStatus).filter(
      status => itemsByStatus[status] && itemsByStatus[status].length > 0
    );

    // Build columns: default columns always visible; insert custom columns after IN_PROGRESS
    defaultBoardOrder.forEach((status) => {
      // Push the default column
      columns.push({
        id: status,
        name: statusLabels[status],
        icon: statusIconMap[status],
        isCustom: false,
      });
      addedStatuses.add(status);

      // After IN_PROGRESS, insert any custom columns that have items
      if (status === WorkItemStatus.IN_PROGRESS) {
        statusesWithItems.forEach((s) => {
          if (!addedStatuses.has(s)) {
            const customColumn = customColumns.find((col) => col.$id === s);
            if (customColumn) {
              columns.push({
                id: customColumn.$id,
                name: customColumn.name,
                icon: <CircleIcon className="size-4" style={{ color: customColumn.color || '#6b7280' }} />,
                isCustom: true,
              });
            } else {
              columns.push({
                id: s,
                name: s,
                icon: <CircleIcon className="size-4 text-gray-500" />,
                isCustom: true,
              });
            }
            addedStatuses.add(s);
          }
        });
      }
    });

    return columns;
  }, [itemsByStatus, customColumns]);

  // Calculate statistics
  const stats = useMemo(() => {
    const items = workItems?.documents || [];
    const today = new Date();

    return {
      total: items.length,
      inProgress: items.filter((i) => i.status === WorkItemStatus.IN_PROGRESS).length,
      done: items.filter((i) => i.status === WorkItemStatus.DONE).length,
      flagged: items.filter((i) => i.flagged).length,
      overdue: items.filter((i) => {
        if (!i.dueDate || i.status === WorkItemStatus.DONE) return false;
        return isBefore(new Date(i.dueDate), today);
      }).length,
    };
  }, [workItems]);

  // Handle drag and drop
  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;

      const { source, destination } = result;
      const sourceStatus = source.droppableId;
      const destStatus = destination.droppableId;

      setItemsByStatus((prev) => {
        const newItems = { ...prev };

        // Remove from source
        const sourceColumn = [...(newItems[sourceStatus] || [])];
        const [movedItem] = sourceColumn.splice(source.index, 1);

        if (!movedItem) return prev;

        // Update the item's status
        const updatedItem = { ...movedItem, status: destStatus as WorkItemStatus };

        // Add to destination
        const destColumn = [...(newItems[destStatus] || [])];
        destColumn.splice(destination.index, 0, updatedItem);

        newItems[sourceStatus] = sourceColumn;
        newItems[destStatus] = destColumn;

        // Clean up empty columns
        if (newItems[sourceStatus].length === 0) {
          delete newItems[sourceStatus];
        }

        return newItems;
      });

      // If status changed, update in the database
      if (sourceStatus !== destStatus) {
        const movedItem = itemsByStatus[sourceStatus]?.[source.index];
        if (movedItem) {
          updateWorkItem({
            param: { workItemId: movedItem.$id },
            json: { status: destStatus },
          });
        }
      }
    },
    [itemsByStatus, updateWorkItem]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4  pb-4 bg-background">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1 ">My Work</h1>
            <p className="text-sm text-muted-foreground">
              Work items assigned to you across all projects
            </p>
          </div>
        </div>

        {/* Stats Cards - Beautiful card design */}
        <div className="grid grid-cols-5 gap-3 mb-8">
          <div className="relative overflow-hidden rounded-lg border bg-muted/30 dark:bg-muted/10 p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Total Items</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{stats.total}</p>
              </div>
              <div className="flex items-center justify-center size-10 rounded-full bg-primary/10">
                <Layers className="size-5 text-primary" />
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border bg-yellow-500/10 dark:bg-yellow-500/5 p-3 shadow-sm border-yellow-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-yellow-600 dark:text-yellow-400">In Progress</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-0.5">{stats.inProgress}</p>
              </div>
              <div className="flex items-center justify-center size-10 rounded-full bg-yellow-500/10">
                <CircleDotDashedIcon className="size-5 text-yellow-500" />
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border bg-emerald-500/10 dark:bg-emerald-500/5 p-3 shadow-sm border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium text-emerald-600 dark:text-emerald-400">Completed</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.done}</p>
              </div>
              <div className="flex items-center justify-center size-10 rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-5 text-emerald-500" />
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border bg-orange-500/10 dark:bg-orange-500/5 p-3 shadow-sm border-orange-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide font-medium text-orange-600 dark:text-orange-400">Flagged</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-0.5">{stats.flagged}</p>
              </div>
              <div className="flex items-center justify-center size-10 rounded-full bg-orange-500/10">
                <Flag className="size-5 text-orange-500" />
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border bg-destructive/10 dark:bg-destructive/5 p-3 shadow-sm border-destructive/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide font-medium text-destructive">Overdue</p>
                <p className="text-2xl font-bold text-destructive mt-0.5">{stats.overdue}</p>
              </div>
              <div className="flex items-center justify-center size-10 rounded-full bg-destructive/10">
                <AlertCircle className="size-5 text-destructive" />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* Filters - placed above the table/board */}
        <div className="flex flex-wrap gap-2 items-center px-4 py-3 border-b bg-background">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 w-48 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Status</SelectItem>
              <SelectItem value={WorkItemStatus.TODO} className="text-xs">To Do</SelectItem>
              <SelectItem value={WorkItemStatus.IN_PROGRESS} className="text-xs">In Progress</SelectItem>
              <SelectItem value={WorkItemStatus.IN_REVIEW} className="text-xs">In Review</SelectItem>
              <SelectItem value={WorkItemStatus.DONE} className="text-xs">Done</SelectItem>
              <SelectItem value={WorkItemStatus.ASSIGNED} className="text-xs">Assigned</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Priority</SelectItem>
              <SelectItem value={WorkItemPriority.URGENT} className="text-xs">Urgent</SelectItem>
              <SelectItem value={WorkItemPriority.HIGH} className="text-xs">High</SelectItem>
              <SelectItem value={WorkItemPriority.MEDIUM} className="text-xs">Medium</SelectItem>
              <SelectItem value={WorkItemPriority.LOW} className="text-xs">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Projects</SelectItem>
              {projects?.documents.map((project) => (
                <SelectItem key={project.$id} value={project.$id} className="text-xs">
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto">
            <Tabs value={view} onValueChange={setView}>
              <TabsList className="h-8">
                <TabsTrigger value="board" className="gap-1.5 text-xs h-7 px-2.5">
                  <LayoutGrid className="size-3.5" />
                  Board
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1.5 text-xs h-7 px-2.5">
                  <List className="size-3.5" />
                  List
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        {filteredWorkItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="flex items-center justify-center size-12 rounded-full bg-muted mb-3">
              <Layers className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">No work items found</h3>
            <p className="text-xs text-muted-foreground max-w-[240px]">
              {searchQuery || statusFilter !== "all" || priorityFilter !== "all"
                ? "Try adjusting your filters"
                : "You don't have any work items assigned yet"}
            </p>
          </div>
        ) : view === "board" ? (
          /* Board View - Kanban Style with drag and drop */
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex overflow-x-auto gap-4 p-4 h-full pb-4">
              {visibleColumns.map((column) => {
                const items = itemsByStatus[column.id] || [];
                return (
                  <div
                    key={column.id}
                    className="flex-shrink-0 w-[280px] bg-muted/30 rounded-xl flex flex-col h-[500px]"
                  >
                    {/* Column Header */}
                    <div className="px-3 py-2.5 flex items-center justify-between rounded-t-xl">
                      <div className="flex items-center gap-2">
                        {column.icon}
                        <span className="text-xs font-medium text-foreground">
                          {column.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-5 px-1.5 font-medium bg-background"
                        >
                          {items.length}
                        </Badge>
                      </div>
                    </div>
                    {/* Column Content with Droppable */}
                    <Droppable droppableId={column.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "flex-1 overflow-y-auto px-3 pb-3 min-h-[200px]",
                            snapshot.isDraggingOver && "bg-primary/5 rounded-b-xl"
                          )}
                        >
                          {items.length === 0 ? (
                            <div className="flex items-center justify-center h-24 text-center">
                              <p className="text-xs text-muted-foreground">No items</p>
                            </div>
                          ) : (
                            items.map((item, index) => (
                              <Draggable
                                key={item.$id}
                                draggableId={item.$id}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className="mb-2"
                                  >
                                    <MyWorkKanbanCard
                                      workItem={item}
                                      workspaceId={workspaceId}
                                      isDragging={snapshot.isDragging}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        ) : (
          /* List View - Enhanced table-like design */
          <div className="p-4 overflow-y-auto h-full">
            <div className="bg-background rounded-lg border overflow-hidden">
              {/* List Header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
                <div className="col-span-5">Work Item</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Priority</div>
                <div className="col-span-2">Due Date</div>
                <div className="col-span-1">Points</div>
              </div>
              {/* List Items */}
              <div className="divide-y">
                {filteredWorkItems.map((item) => (
                  <MyWorkListItem
                    key={item.$id}
                    workItem={item}
                    workspaceId={workspaceId}
                    customColumns={customColumns}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Kanban Card Component for Board View
interface MyWorkKanbanCardProps {
  workItem: PopulatedWorkItem;
  workspaceId: string;
  isDragging?: boolean;
}

const typeColors: Record<string, string> = {
  STORY: "bg-blue-500",
  BUG: "bg-red-500",
  TASK: "bg-green-500",
  EPIC: "bg-purple-500",
  SUBTASK: "bg-gray-500",
};

const priorityColors: Record<string, string> = {
  LOW: "text-muted-foreground bg-muted",
  MEDIUM: "text-yellow-600 bg-yellow-500/10 dark:text-yellow-400",
  HIGH: "text-orange-600 bg-orange-500/10 dark:text-orange-400",
  URGENT: "text-destructive bg-destructive/10",
};

const MyWorkKanbanCard = ({ workItem, isDragging }: MyWorkKanbanCardProps) => {
  return (
    <div className={cn(
      "bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow cursor-grab",
      isDragging && "shadow-lg ring-2 ring-primary/20 rotate-2"
    )}>
      <div className="p-3">
        {/* Header with type indicator, key, and menu */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn("size-1.5 rounded-full", typeColors[workItem.type] || "bg-gray-400")} />
            <span className="text-[10px] font-medium text-muted-foreground">{workItem.key}</span>
            {workItem.flagged && (
              <Flag className="size-3 fill-red-500 text-red-500" />
            )}
          </div>
          <WorkItemOptionsMenu workItem={workItem} hideAssignAssignee />
        </div>

        {/* Title */}
        <h3 className="text-xs font-medium text-foreground line-clamp-2 mb-2">
          {workItem.title}
        </h3>

        {/* Priority Badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium",
            priorityColors[workItem.priority] || "text-gray-500 bg-gray-100"
          )}>
            {workItem.priority}
          </span>
          {workItem.storyPoints && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
              {workItem.storyPoints} pts
            </span>
          )}
        </div>

        {/* Footer with due date and project */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="size-3" />
            {workItem.dueDate
              ? format(new Date(workItem.dueDate), "MMM d")
              : "No date"}
          </div>
          {workItem.project && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
              {workItem.project.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// List Item Component for List View
interface MyWorkListItemProps {
  workItem: PopulatedWorkItem;
  workspaceId: string;
  customColumns: Array<{ $id: string; name: string; color: string }>;
}

const MyWorkListItem = ({ workItem, customColumns }: MyWorkListItemProps) => {
  const today = new Date();
  const isOverdue = workItem.dueDate &&
    workItem.status !== WorkItemStatus.DONE &&
    isBefore(new Date(workItem.dueDate), today);

  // Get status display info - check if it's a custom column
  const getStatusDisplay = () => {
    const standardStatus = workItem.status as WorkItemStatus;
    if (statusLabels[standardStatus]) {
      return {
        icon: statusIconMap[standardStatus],
        label: statusLabels[standardStatus],
      };
    }
    // Check custom columns
    const customColumn = customColumns.find((c) => c.$id === workItem.status);
    if (customColumn) {
      return {
        icon: <CircleIcon className="size-4" style={{ color: customColumn.color || '#6b7280' }} />,
        label: customColumn.name,
      };
    }
    // Fallback
    return {
      icon: <CircleIcon className="size-4 text-gray-400" />,
      label: workItem.status,
    };
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="grid grid-cols-12 gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer items-center group">
      {/* Work Item Info */}
      <div className="col-span-5 flex items-center gap-2 min-w-0">
        <div className={cn("size-1.5 rounded-full flex-shrink-0", typeColors[workItem.type] || "bg-gray-400")} />
        <span className="text-[10px] font-medium text-muted-foreground flex-shrink-0">{workItem.key}</span>
        {workItem.flagged && (
          <Flag className="size-3 fill-red-500 text-red-500 flex-shrink-0" />
        )}
        <span className="text-xs text-foreground truncate">{workItem.title}</span>
      </div>

      {/* Status */}
      <div className="col-span-2 flex items-center gap-1.5">
        {statusDisplay.icon}
        <span className="text-xs text-muted-foreground">
          {statusDisplay.label}
        </span>
      </div>

      {/* Priority */}
      <div className="col-span-2">
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-medium",
          priorityColors[workItem.priority] || "text-gray-500 bg-gray-100"
        )}>
          {workItem.priority}
        </span>
      </div>

      {/* Due Date */}
      <div className="col-span-2 flex items-center justify-between">
        <span className={cn(
          "text-xs",
          isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
        )}>
          {workItem.dueDate
            ? format(new Date(workItem.dueDate), "MMM d, yyyy")
            : "—"}
        </span>
      </div>

      {/* Story Points and Menu */}
      <div className="col-span-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {workItem.storyPoints || "—"}
        </span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <WorkItemOptionsMenu workItem={workItem} hideAssignAssignee />
        </div>
      </div>
    </div>
  );
};
