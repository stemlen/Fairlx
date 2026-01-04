"use client";

import { RiAddCircleFill } from "react-icons/ri";
import { LogOut, Plus, Building2, RefreshCcw } from "lucide-react";

import { useGetWorkspaces } from "@/features/workspaces/api/use-get-workspaces";
import { WorkspaceAvatar } from "@/features/workspaces/components/workspace-avatar";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";
import { useCreateWorkspaceModal } from "@/features/workspaces/hooks/use-create-workspace-modal";
import { useCurrentMember } from "@/features/members/hooks/use-current-member";
import { useDeleteMember } from "@/features/members/api/use-delete-member";
import { useGetOrganizations } from "@/features/organizations/api/use-get-organizations";
import { useConfirm } from "@/hooks/use-confirm";
import { useAppRefresh } from "@/hooks/use-app-refresh";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";

import { useAccountLifecycle } from "@/components/account-lifecycle-provider";

export const WorkspaceSwitcher = () => {
  const router = useRouter();
  const { data: workspaces } = useGetWorkspaces();
  const { open } = useCreateWorkspaceModal();
  const { refresh, isRefreshing } = useAppRefresh();

  const { lifecycleState: state } = useAccountLifecycle();
  const {
    hasOrg,
    activeOrgId,
    activeWorkspaceId,
    user
  } = state;

  const urlWorkspaceId = useWorkspaceId();
  // Use URL workspaceId if available, otherwise fallback to global active workspaceId
  const selectedWorkspaceId = urlWorkspaceId || activeWorkspaceId || "";

  const { member } = useCurrentMember({ workspaceId: selectedWorkspaceId });
  const { mutate: deleteMember } = useDeleteMember();

  const { data: organizations } = useGetOrganizations();

  // Get current organization for ORG accounts
  const currentOrg = hasOrg && activeOrgId
    ? organizations?.documents?.find((o: { $id: string }) => o.$id === activeOrgId)
    : null;

  // PERSONAL accounts can only have one workspace
  const accountType = user?.prefs?.accountType || "PERSONAL";
  const canCreateWorkspace = accountType === "ORG" || (workspaces?.documents?.length ?? 0) === 0;

  const [ConfirmDialog, confirm] = useConfirm(
    "Leave Workspace",
    "Are you sure you want to leave this workspace? You will need an invite to rejoin.",
    "destructive"
  );

  const onSelect = (id: string) => {
    router.push(`/workspaces/${id}`);
  };

  const handleWorkspaceClick = (id: string) => {
    router.push(`/workspaces/${id}`);
  };

  const handleLeaveWorkspace = async () => {
    if (!member) return;

    const ok = await confirm();
    if (!ok) return;

    deleteMember(
      { param: { memberId: member.$id } },
      {
        onSuccess: () => {
          window.location.href = "/";
        },
      }
    );
  };

  const handleCreateWorkspace = () => {
    if (canCreateWorkspace) {
      open();
    }
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col px-3 pt-5 pb-8 border-t-[1.5px] border-neutral-200">
        <ConfirmDialog />

        {/* Organization indicator for ORG accounts with refresh */}
        {hasOrg && currentOrg && (
          <div className="flex items-center justify-between px-2 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate font-medium">{(currentOrg as { name: string }).name}</span>
            </div>
            {/* Refresh button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={refresh}
                  disabled={isRefreshing}
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh data</TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className="flex items-center justify-between pb-4">
          <p className="text-[13px] tracking-normal font-medium  pl-2 text-primary">Workspaces</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-5 p-0 hover:bg-transparent">
                <RiAddCircleFill className="size-5 text-neutral-500 cursor-pointer hover:opacity-75 transition" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Create Workspace - disabled for PERSONAL with existing workspace */}
              {canCreateWorkspace ? (
                <DropdownMenuItem onClick={handleCreateWorkspace} className="cursor-pointer">
                  <Plus className="size-4 mr-2" />
                  Create Workspace
                </DropdownMenuItem>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      className="cursor-not-allowed opacity-50"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Plus className="size-4 mr-2" />
                      Create Workspace
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[200px]">
                    Upgrade to Organization to create more workspaces
                  </TooltipContent>
                </Tooltip>
              )}
              {member && workspaces && workspaces.documents.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLeaveWorkspace}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="size-4 mr-2" />
                    Leave Workspace
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Select onValueChange={onSelect} value={selectedWorkspaceId}>

          <SelectTrigger className="w-full  font-medium text-sm ">
            <SelectValue placeholder="No workspace selected." />
          </SelectTrigger>

          <SelectContent>
            {workspaces?.documents.map((workspace) => (
              <SelectItem
                key={workspace.$id}
                value={workspace.$id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleWorkspaceClick(workspace.$id);
                }}
              >
                <div className="flex justify-start items-center gap-3 font-medium">
                  <WorkspaceAvatar
                    name={workspace.name}
                    image={workspace.imageUrl}
                  />
                  <span className="truncate">{workspace.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </TooltipProvider>
  );
};

