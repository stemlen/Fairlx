"use client";

import {
  MoreHorizontal,
  Trash2,
  Link2,
  Flag,
  Users,
  Layers,
  GitBranch,
  Hash,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useDeleteWorkItem } from "../api/use-delete-work-item";
import { useUpdateWorkItem } from "../api/use-update-work-item";
import { useConfirm } from "@/hooks/use-confirm";
import { PopulatedWorkItem, WorkItemPriority } from "../types";

interface WorkItemOptionsMenuProps {
  workItem: PopulatedWorkItem;
  onSplit?: () => void;
  onAssignEpic?: () => void;
  onAssignAssignee?: () => void;
  onEditStoryPoints?: () => void;
}

const priorityConfig = {
  [WorkItemPriority.LOW]: { 
    label: "Low",
    dotColor: "bg-slate-400",
  },
  [WorkItemPriority.MEDIUM]: { 
    label: "Medium",
    dotColor: "bg-amber-500",
  },
  [WorkItemPriority.HIGH]: { 
    label: "High",
    dotColor: "bg-orange-500",
  },
  [WorkItemPriority.URGENT]: { 
    label: "Urgent",
    dotColor: "bg-red-500",
  },
};

interface WorkItemOptionsMenuProps {
  workItem: PopulatedWorkItem;
  onSplit?: () => void;
  onAssignEpic?: () => void;
  onAssignAssignee?: () => void;
  onEditStoryPoints?: () => void;
  hideAssignAssignee?: boolean;
}

export const WorkItemOptionsMenu = ({
  workItem,
  onSplit,
  onAssignEpic,
  onAssignAssignee,
  onEditStoryPoints,
  hideAssignAssignee,
}: WorkItemOptionsMenuProps) => {
  const [DeleteDialog, confirmDelete] = useConfirm(
    "Delete Work Item",
    `Are you sure you want to delete "${workItem.key}"? This action cannot be undone.`,
    "destructive"
  );

  const { mutate: deleteWorkItem, isPending: isDeleting } = useDeleteWorkItem();
  const { mutate: updateWorkItem, isPending: isUpdating } = useUpdateWorkItem();

  const handleDelete = async () => {
    const confirmed = await confirmDelete();
    if (!confirmed) return;

    deleteWorkItem({ param: { workItemId: workItem.$id } });
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/workspaces/${workItem.workspaceId}/projects/${workItem.projectId}/work-items/${workItem.$id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(workItem.key);
    toast.success("Key copied to clipboard");
  };

  const handleToggleFlag = () => {
    updateWorkItem({
      param: { workItemId: workItem.$id },
      json: { flagged: !workItem.flagged },
    });
  };

  const handleSetPriority = (priority: WorkItemPriority) => {
    updateWorkItem({
      param: { workItemId: workItem.$id },
      json: { priority },
    });
  };

  return (
    <>
      <DeleteDialog />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-opacity"
          >
            <MoreHorizontal className="size-3.5 text-slate-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={handleCopyLink} className="text-xs py-1.5 cursor-pointer">
            <Link2 className="size-3.5 mr-2 text-slate-500" />
            Copy Link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopyKey} className="text-xs py-1.5 cursor-pointer">
            <Hash className="size-3.5 mr-2 text-slate-500" />
            Copy Key
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem onClick={handleToggleFlag} className="text-xs py-1.5 cursor-pointer">
            <Flag
              className={cn(
                "size-3.5 mr-2",
                workItem.flagged ? "fill-red-500 text-red-500" : "text-slate-500"
              )}
            />
            {workItem.flagged ? "Remove Flag" : "Add Flag"}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          {!hideAssignAssignee && (
            <DropdownMenuItem onClick={onAssignAssignee} className="text-xs py-1.5 cursor-pointer">
              <Users className="size-3.5 mr-2 text-slate-500" />
              Assign Members
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs py-1.5">
              <div className={cn("size-2 rounded-full mr-2", priorityConfig[workItem.priority].dotColor)} />
              Set Priority
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-32">
              {Object.entries(priorityConfig).map(([priority, config]) => (
                <DropdownMenuItem
                  key={priority}
                  onClick={() => handleSetPriority(priority as WorkItemPriority)}
                  disabled={isUpdating}
                  className={cn(
                    "text-xs py-1.5 cursor-pointer",
                    workItem.priority === priority && "bg-slate-50 dark:bg-slate-800"
                  )}
                >
                  <div className={cn("size-2 rounded-full mr-2", config.dotColor)} />
                  {config.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={onAssignEpic} className="text-xs py-1.5 cursor-pointer">
            <Layers className="size-3.5 mr-2 text-purple-500" />
            Link to Epic
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEditStoryPoints} className="text-xs py-1.5 cursor-pointer">
            <Hash className="size-3.5 mr-2 text-slate-500" />
            Edit Points
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem onClick={onSplit} className="text-xs py-1.5 cursor-pointer">
            <GitBranch className="size-3.5 mr-2 text-slate-500" />
            Split Item
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-xs py-1.5 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
          >
            <Trash2 className="size-3.5 mr-2" />
            Delete Item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
