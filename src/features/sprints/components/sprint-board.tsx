"use client";

import { useState } from "react";
import { Plus, Zap, Clock, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { useGetSprints } from "../api/use-get-sprints";
import { SprintCard } from "./sprint-card";
import { CreateSprintDialog } from "./create-sprint-dialog";
import { SprintStatus } from "../types";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface SprintBoardProps {
  workspaceId: string;
  projectId: string;
}

export const SprintBoard = ({ workspaceId, projectId }: SprintBoardProps) => {
  const [createSprintOpen, setCreateSprintOpen] = useState(false);
  const { can } = usePermission();

  const { data: sprintsData, isLoading: sprintsLoading } = useGetSprints({
    workspaceId,
    projectId,
  });

  const sprints = sprintsData?.documents || [];

  const activeSprints = sprints.filter((s) => s.status === SprintStatus.ACTIVE);
  const plannedSprints = sprints.filter((s) => s.status === SprintStatus.PLANNED);
  const completedSprints = sprints.filter(
    (s) => s.status === SprintStatus.COMPLETED
  );

  if (sprintsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground">Loading sprints...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sprint Board</h1>
            <p className="text-sm mt-1 text-muted-foreground">
              Plan, track, and manage your agile sprints
            </p>
          </div>
        </div>
        {can(PERMISSIONS.SPRINT_CREATE) && (
          <Button
            size="sm"
            onClick={() => setCreateSprintOpen(true)}
            className="h-8 px-3 text-xs font-medium"
          >
            <Plus className="size-3.5 mr-1.5" />
            New Sprint
          </Button>
        )}
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="active" className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 ">
          <TabsList className="bg-transparent p-0 h-auto gap-0">
            <TabsTrigger
              value="active"
              className={cn(
                "relative px-4 py-2.5 text-xs font-medium rounded-none bg-transparent",
                "text-muted-foreground hover:text-foreground",
                "data-[state=active]:text-primary data-[state=active]:bg-transparent",
                "data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary"
              )}
            >
              <Zap className="size-3.5 mr-1.5" />
              Active
              {activeSprints.length > 0 && (
                <Badge className="ml-1.5 h-4 px-1.5 text-[10px] font-medium bg-primary/10 text-primary border-0">
                  {activeSprints.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="planned"
              className={cn(
                "relative px-4 py-2.5 text-xs font-medium rounded-none bg-transparent",
                "text-muted-foreground hover:text-foreground",
                "data-[state=active]:text-primary data-[state=active]:bg-transparent",
                "data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary"
              )}
            >
              <Clock className="size-3.5 mr-1.5" />
              Planned
              {plannedSprints.length > 0 && (
                <Badge className="ml-1.5 h-4 px-1.5 text-[10px] font-medium bg-muted text-muted-foreground border-0">
                  {plannedSprints.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className={cn(
                "relative px-4 py-2.5 text-xs font-medium rounded-none bg-transparent",
                "text-muted-foreground hover:text-foreground",
                "data-[state=active]:text-primary data-[state=active]:bg-transparent",
                "data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary"
              )}
            >
              <CheckCircle2 className="size-3.5 mr-1.5" />
              Completed
              {completedSprints.length > 0 && (
                <Badge className="ml-1.5 h-4 px-1.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                  {completedSprints.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Active Sprints */}
        <TabsContent value="active" className="space-y-3 mt-4">
          {activeSprints.length > 0 ? (
            <div className="space-y-3">
              {activeSprints.map((sprint) => (
                <SprintCard
                  key={sprint.$id}
                  sprint={sprint}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  hasActiveSprint={activeSprints.length > 0}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/20">
              <div className="p-3 rounded-full bg-blue-50 dark:bg-blue-950/30 mb-3">
                <Zap className="size-6 text-blue-500" />
              </div>
              <h3 className="text-sm font-medium text-foreground mb-1">No Active Sprints</h3>
              <p className="text-xs text-muted-foreground mb-4 text-center max-w-xs">
                Start a sprint to begin tracking work items and team velocity
              </p>
              {can(PERMISSIONS.SPRINT_CREATE) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateSprintOpen(true)}
                  className="h-8 text-xs"
                >
                  <Plus className="size-3.5 mr-1.5" />
                  Create Sprint
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* Planned Sprints */}
        <TabsContent value="planned" className="space-y-3 mt-4">
          {plannedSprints.length > 0 ? (
            <div className="space-y-3">
              {plannedSprints.map((sprint) => (
                <SprintCard
                  key={sprint.$id}
                  sprint={sprint}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  hasActiveSprint={activeSprints.length > 0}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/20">
              <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
                <Clock className="size-6 text-slate-400" />
              </div>
              <h3 className="text-sm font-medium text-foreground mb-1">No Planned Sprints</h3>
              <p className="text-xs text-muted-foreground mb-4 text-center max-w-xs">
                Plan your upcoming sprints to keep your team aligned
              </p>
              {can(PERMISSIONS.SPRINT_CREATE) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateSprintOpen(true)}
                  className="h-8 text-xs"
                >
                  <Plus className="size-3.5 mr-1.5" />
                  Plan Sprint
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* Completed Sprints */}
        <TabsContent value="completed" className="space-y-3 mt-4">
          {completedSprints.length > 0 ? (
            <div className="space-y-3">
              {completedSprints.map((sprint) => (
                <SprintCard
                  key={sprint.$id}
                  sprint={sprint}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  hasActiveSprint={activeSprints.length > 0}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/20">
              <div className="p-3 rounded-full bg-green-50 dark:bg-green-950/30 mb-3">
                <CheckCircle2 className="size-6 text-green-500" />
              </div>
              <h3 className="text-sm font-medium text-foreground mb-1">No Completed Sprints</h3>
              <p className="text-xs text-muted-foreground text-center max-w-xs">
                Completed sprints will appear here for review and retrospectives
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Sprint Dialog */}
      <CreateSprintDialog
        isOpen={createSprintOpen}
        onClose={() => setCreateSprintOpen(false)}
        workspaceId={workspaceId}
        projectId={projectId}
      />
    </div>
  );
};
