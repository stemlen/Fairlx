"use client";

import { useState } from "react";
import { Plus, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useGetSprints } from "../api/use-get-sprints";
import { SprintCard } from "./sprint-card";
import { CreateSprintDialog } from "./create-sprint-dialog";
import { SprintStatus } from "../types";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";

interface SprintBoardProps {
  workspaceId: string;
  projectId: string;
}

export const SprintBoard = ({ workspaceId, projectId }: SprintBoardProps) => {
  const router = useRouter();
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
        <div className="text-muted-foreground">Loading sprints...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="h-8 w-8 p-0 hover:bg-gray-100"
          >
            <ArrowLeft className="size-4 text-gray-600" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Sprint Board</h1>
            <p className="text-muted-foreground mt-1">
              Manage your sprints and work items
            </p>
          </div>
        </div>
        {can(PERMISSIONS.SPRINT_CREATE) && (
          <Button
            onClick={() => setCreateSprintOpen(true)}
            className=" text-white border bg-blue-600 border-gray-300 hover:bg-blue-700"
          >
            <Plus className="size-4 mr-2" />
            New Sprint
          </Button>
        )}
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="bg-gray-100 p-1">
          <TabsTrigger value="active" className="text-xs">
            Active ({activeSprints.length})
          </TabsTrigger>
          <TabsTrigger value="planned" className="text-xs">
            Planned ({plannedSprints.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs">
            Completed ({completedSprints.length})
          </TabsTrigger>
        </TabsList>

        {/* Active Sprints */}
        <TabsContent value="active" className="space-y-3">
          {activeSprints.length > 0 ? (
            activeSprints.map((sprint) => (
              <SprintCard
                key={sprint.$id}
                sprint={sprint}
                workspaceId={workspaceId}
                projectId={projectId}
                hasActiveSprint={activeSprints.length > 0}
              />
            ))
          ) : (
            <div className="text-center py-12 border border-gray-200 rounded-lg bg-white">
              <p className="text-gray-500 text-sm">
                No active sprints. Create one to get started.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Planned Sprints */}
        <TabsContent value="planned" className="space-y-3">
          {plannedSprints.length > 0 ? (
            plannedSprints.map((sprint) => (
              <SprintCard
                key={sprint.$id}
                sprint={sprint}
                workspaceId={workspaceId}
                projectId={projectId}
                hasActiveSprint={activeSprints.length > 0}
              />
            ))
          ) : (
            <div className="text-center py-12 border border-gray-200 rounded-lg bg-white">
              <p className="text-gray-500 text-sm">
                No planned sprints. Create one to start planning.
              </p>
            </div>
          )}
        </TabsContent>

        {/* Completed Sprints */}
        <TabsContent value="completed" className="space-y-3">
          {completedSprints.length > 0 ? (
            completedSprints.map((sprint) => (
              <SprintCard
                key={sprint.$id}
                sprint={sprint}
                workspaceId={workspaceId}
                projectId={projectId}
                hasActiveSprint={activeSprints.length > 0}
              />
            ))
          ) : (
            <div className="text-center py-12 border border-gray-200 rounded-lg bg-white">
              <p className="text-gray-500 text-sm">
                No completed sprints yet.
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
