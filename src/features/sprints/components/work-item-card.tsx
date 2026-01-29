"use client";

import { useState } from "react";
import {
  Flag,
  Users,
  Layers,
  Bookmark,
  Bug,
  CheckSquare,
  ListTodo,
  CircleIcon,
} from "lucide-react";
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

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useUpdateWorkItem } from "../api/use-update-work-item";
import { WorkItemOptionsMenu } from "./work-item-options-menu";
import { AssignAssigneeDialog } from "./assign-assignee-dialog";
import { AssignEpicDialog } from "./assign-epic-dialog";
import { SplitWorkItemDialog } from "./split-work-item-dialog";
import {
  PopulatedWorkItem,
  WorkItemStatus,
  WorkItemPriority,
  WorkItemType,
} from "../types";
import { useGetCustomColumns } from "@/features/custom-columns/api/use-get-custom-columns";
import { useGetProject } from "@/features/projects/api/use-get-project";

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

interface WorkItemCardProps {
  workItem: PopulatedWorkItem;
  workspaceId: string;
  projectId?: string;
  onViewDetails?: () => void;
}

const typeConfig = {
  [WorkItemType.STORY]: { icon: Bookmark, color: "text-blue-600", bg: "bg-blue-500", light: "bg-blue-50 dark:bg-blue-900/20" },
  [WorkItemType.BUG]: { icon: Bug, color: "text-red-600", bg: "bg-red-500", light: "bg-red-50 dark:bg-red-900/20" },
  [WorkItemType.TASK]: { icon: CheckSquare, color: "text-green-600", bg: "bg-green-500", light: "bg-green-50 dark:bg-green-900/20" },
  [WorkItemType.EPIC]: { icon: Layers, color: "text-purple-600", bg: "bg-purple-500", light: "bg-purple-50 dark:bg-purple-900/20" },
  [WorkItemType.SUBTASK]: { icon: ListTodo, color: "text-muted-foreground", bg: "bg-muted-foreground", light: "bg-muted" },
};

const priorityConfig = {
  [WorkItemPriority.LOW]: { label: "Low", color: "text-muted-foreground", bg: "bg-muted", border: "border-border" },
  [WorkItemPriority.MEDIUM]: { label: "Medium", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-700" },
  [WorkItemPriority.HIGH]: { label: "High", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20", border: "border-orange-200 dark:border-orange-700" },
  [WorkItemPriority.URGENT]: { label: "Urgent", color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-700" },
};

const statusConfig = {
  [WorkItemStatus.TODO]: { label: "To Do", dot: "bg-muted-foreground/50", bg: "bg-muted", text: "text-muted-foreground" },
  [WorkItemStatus.ASSIGNED]: { label: "Assigned", dot: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600" },
  [WorkItemStatus.IN_PROGRESS]: { label: "In Progress", dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600" },
  [WorkItemStatus.IN_REVIEW]: { label: "In Review", dot: "bg-purple-500", bg: "bg-purple-50 dark:bg-purple-900/30", text: "text-purple-600" },
  [WorkItemStatus.DONE]: { label: "Done", dot: "bg-green-500", bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-600" },
};

export const WorkItemCard = ({ workItem, workspaceId, projectId, onViewDetails }: WorkItemCardProps) => {
  const [editingPoints, setEditingPoints] = useState(false);
  const [assignAssigneeOpen, setAssignAssigneeOpen] = useState(false);
  const [assignEpicOpen, setAssignEpicOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);

  const { mutate: updateWorkItem } = useUpdateWorkItem();

  const { data } = useGetCustomColumns({
    workspaceId,
    projectId: projectId || workItem.projectId,
  });

  const { data: projectData } = useGetProject({
    projectId: projectId || workItem.projectId,
  });

  const customColumns = data?.documents || [];

  // Get available work item types (custom + defaults)
  const defaultWorkItemTypes = [
    { key: WorkItemType.TASK, label: "Task", icon: CheckSquare, color: "text-green-600", bg: "bg-green-500", light: "bg-green-50 dark:bg-green-900/20" },
    { key: WorkItemType.BUG, label: "Bug", icon: Bug, color: "text-red-600", bg: "bg-red-500", light: "bg-red-50 dark:bg-red-900/20" },
    { key: WorkItemType.STORY, label: "Story", icon: Bookmark, color: "text-blue-600", bg: "bg-blue-500", light: "bg-blue-50 dark:bg-blue-900/20" },
    { key: WorkItemType.EPIC, label: "Epic", icon: Layers, color: "text-purple-600", bg: "bg-purple-500", light: "bg-purple-50 dark:bg-purple-900/20" },
    { key: WorkItemType.SUBTASK, label: "Subtask", icon: ListTodo, color: "text-muted-foreground", bg: "bg-muted-foreground", light: "bg-muted" },
  ];

  const TypeIcon = typeConfig[workItem.type]?.icon || CheckSquare;
  const priority = priorityConfig[workItem.priority];
  // Status may be a custom column ID not in statusConfig, so provide a fallback
  const status = statusConfig[workItem.status as WorkItemStatus] ?? {
    label: workItem.status,
    dot: "bg-gray-400",
    bg: "bg-gray-100 dark:bg-gray-700",
    text: "text-gray-600",
  };

  const handleStatusChange = (status: string) => {
    updateWorkItem({
      param: { workItemId: workItem.$id },
      json: { status },
    });
  };

  const handleTypeChange = (type: string) => {
    updateWorkItem({
      param: { workItemId: workItem.$id },
      json: { type: type as WorkItemType },
    });
  };

  const handlePointsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const points = Number(new FormData(e.currentTarget).get("points")) || 0;
    updateWorkItem({
      param: { workItemId: workItem.$id },
      json: { storyPoints: points },
    });
    setEditingPoints(false);
  };

  return (
    <div className="border rounded-lg bg-card border-border">
      <div className="flex">
        <div className={cn("w-1 rounded-l-lg", typeConfig[workItem.type].bg)} />
        <div className="flex-1 p-3 space-y-2">

          {/* Header */}
          <div className="flex items-start gap-2">
            <div className={cn("p-1.5 rounded", typeConfig[workItem.type].light)}>
              <TypeIcon className={cn("size-3.5", typeConfig[workItem.type].color)} />
            </div>

            <button onClick={onViewDetails} className="flex-1 text-left truncate">
              <span className="text-xs font-semibold text-blue-600">{workItem.key}</span>{" "}
              <span className="text-xs">{workItem.title}</span>
            </button>

            {workItem.flagged && <Flag className="size-4 text-red-500 fill-red-500" />}

            <WorkItemOptionsMenu
              workItem={workItem}
              onAssignAssignee={() => setAssignAssigneeOpen(true)}
              onAssignEpic={() => setAssignEpicOpen(true)}
              onSplit={() => setSplitOpen(true)}
              onEditStoryPoints={() => setEditingPoints(true)}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Type Selector */}
            <Select value={workItem.type} onValueChange={handleTypeChange}>
              <SelectTrigger className={cn("h-6 px-2 text-[10px]", typeConfig[workItem.type]?.light || "bg-gray-50", typeConfig[workItem.type]?.color || "text-gray-600")}>
                <div className="flex items-center gap-1">
                  <TypeIcon className="size-3" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {defaultWorkItemTypes.map((type) => {
                  const TypeItemIcon = type.icon;
                  return (
                    <SelectItem key={type.key} value={type.key}>
                      <div className="flex items-center gap-2">
                        <TypeItemIcon className={cn("size-3.5", type.color)} />
                        {type.label}
                      </div>
                    </SelectItem>
                  );
                })}
                {projectData?.customWorkItemTypes && projectData.customWorkItemTypes.length > 0 && (
                  <>
                    <SelectSeparator />
                    {projectData.customWorkItemTypes.map((customType: { key: string; label: string; color: string }) => (
                      <SelectItem key={customType.key} value={customType.key}>
                        <div className="flex items-center gap-2">
                          <CheckSquare className="size-3.5" style={{ color: customType.color }} />
                          {customType.label}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={workItem.status} onValueChange={handleStatusChange}>
              <SelectTrigger className={cn("h-6 px-2 text-[10px]", status.bg, status.text)}>
                <div className="flex items-center gap-1">
                  <span className={cn("size-1.5 rounded-full", status.dot)} />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, s]) => (
                  <SelectItem key={key} value={key}>
                    {s.label}
                  </SelectItem>
                ))}
                {customColumns.length > 0 && (
                  <>
                    <SelectSeparator />
                    {customColumns.map((c) => {
                      const Icon = allIcons[c.icon as keyof typeof allIcons];
                      return (
                        <SelectItem key={c.$id} value={c.$id}>
                          <div className="flex items-center gap-2">
                            {Icon ? <Icon style={{ color: c.color }} /> : <CircleIcon />}
                            {c.name}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </>
                )}
              </SelectContent>
            </Select>

            {/* Priority */}
            <Badge className={cn("text-[10px]", priority.bg, priority.color, priority.border)}>
              {priority.label}
            </Badge>

            {/* Story Points */}
            {editingPoints ? (
              <form onSubmit={handlePointsSubmit}>
                <Input
                  name="points"
                  defaultValue={workItem.storyPoints || 0}
                  className="h-6 w-12 text-[10px]"
                  autoFocus
                  onBlur={() => setEditingPoints(false)}
                />
              </form>
            ) : (
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setEditingPoints(true)}>
                {workItem.storyPoints || 0} pts
              </Button>
            )}

            {/* Assignees - filter null entries before iterating */}
            {(() => {
              const validAssignees = workItem.assignees?.filter(
                (a): a is NonNullable<typeof a> => a != null && typeof a.$id === "string"
              ) ?? [];
              return validAssignees.length > 0 ? (
                validAssignees.slice(0, 3).map((a) => (
                  <Avatar key={a.$id} className="size-5">
                    <AvatarImage src={a.profileImageUrl || undefined} />
                    <AvatarFallback>{a.name?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                ))
              ) : (
                <Button size="icon" variant="ghost" onClick={() => setAssignAssigneeOpen(true)}>
                  <Users className="size-4" />
                </Button>
              );
            })()}
          </div>
        </div>
      </div>

      <AssignAssigneeDialog
        isOpen={assignAssigneeOpen}
        onClose={() => setAssignAssigneeOpen(false)}
        workItem={workItem}
        workspaceId={workspaceId}
      />

      {projectId && (
        <AssignEpicDialog
          open={assignEpicOpen}
          onClose={() => setAssignEpicOpen(false)}
          workItem={workItem}
          workspaceId={workspaceId}
          projectId={projectId}
        />
      )}

      <SplitWorkItemDialog
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        workItem={workItem}
      />
    </div>
  );
};
