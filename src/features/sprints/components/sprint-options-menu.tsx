"use client";

import {
  MoreHorizontal,
  Trash,
  Circle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

import { useDeleteSprint } from "../api/use-delete-sprint";
import { useUpdateSprint } from "../api/use-update-sprint";
import { useConfirm } from "@/hooks/use-confirm";
import { PopulatedSprint, SprintStatus } from "../types";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";

interface SprintOptionsMenuProps {
  sprint: PopulatedSprint;
  hasActiveSprint?: boolean;
}

const statusConfig = {
  [SprintStatus.PLANNED]: {
    label: "Planned",
    color: "text-gray-600",
  },
  [SprintStatus.ACTIVE]: {
    label: "Active",
    color: "text-blue-600",
  },
  [SprintStatus.COMPLETED]: {
    label: "Completed",
    color: "text-green-600",
  },
  [SprintStatus.CANCELLED]: {
    label: "Cancelled",
    color: "text-red-600",
  },
};

export const SprintOptionsMenu = ({
  sprint,
  hasActiveSprint,
}: SprintOptionsMenuProps) => {
  const [DeleteDialog, confirmDelete] = useConfirm(
    "Delete Sprint",
    `Are you sure you want to delete "${sprint.name}"? Work items will be moved to backlog.`,
    "destructive"
  );

  const { mutate: deleteSprint, isPending: isDeleting } = useDeleteSprint();
  const { mutate: updateSprint, isPending: isUpdating } = useUpdateSprint();

  const { can } = usePermission();

  const handleDelete = async () => {
    const confirmed = await confirmDelete();
    if (!confirmed) return;

    deleteSprint({ param: { sprintId: sprint.$id } });
  };

  const handleStatusChange = (newStatus: SprintStatus) => {
    if (newStatus === sprint.status) return;
    updateSprint({
      param: { sprintId: sprint.$id },
      json: { status: newStatus },
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
            className="h-6 w-6 p-0 hover:bg-gray-100"
          >
            <MoreHorizontal className="size-4 text-gray-600" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs font-semibold text-gray-700">
            Update Status
          </DropdownMenuLabel>

          {Object.values(SprintStatus).map((status) => {
            // Permission Checks
            if (status === SprintStatus.ACTIVE && !can(PERMISSIONS.SPRINT_START)) return null;
            if (status === SprintStatus.COMPLETED && !can(PERMISSIONS.SPRINT_COMPLETE)) return null;
            // For other statuses, we generally assume update permission or specific ones?
            // Assuming PROJECT_UPDATE or SPRINT_CREATE allows basic updates.
            // But let's stick to specific ones if they exist.

            return (
              <DropdownMenuItem
                key={status}
                onClick={() => handleStatusChange(status)}
                disabled={isUpdating || (status === SprintStatus.ACTIVE && hasActiveSprint && sprint.status !== SprintStatus.ACTIVE)}
                className="text-xs cursor-pointer"
                title={status === SprintStatus.ACTIVE && hasActiveSprint && sprint.status !== SprintStatus.ACTIVE ? "Another sprint is already active" : undefined}
              >
                <Circle className={cn("size-2.5 mr-2", statusConfig[status].color)} />
                <span>{statusConfig[status].label}</span>
                {sprint.status === status && (
                  <span className="ml-auto text-gray-400">✓</span>
                )}
              </DropdownMenuItem>
            )
          })}

          <DropdownMenuSeparator />

          {can(PERMISSIONS.SPRINT_DELETE) && (
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive focus:text-destructive text-xs cursor-pointer"
            >
              <Trash className="size-4 mr-2" />
              Delete Sprint
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
