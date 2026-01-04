"use client";

import { Calendar, Target, TrendingUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

import { SprintOptionsMenu } from "./sprint-options-menu";
import { CreateWorkItemBar } from "./create-work-item-bar";
import { WorkItemCard } from "./work-item-card";
import { useGetWorkItems } from "../api/use-get-work-items";
import { PopulatedSprint, SprintStatus } from "../types";
import { cn } from "@/lib/utils";

interface SprintCardProps {
  sprint: PopulatedSprint;
  workspaceId: string;
  projectId: string;
  hasActiveSprint?: boolean;
}

const statusBadgeStyles = {
  [SprintStatus.PLANNED]: "bg-gray-100 text-gray-600",
  [SprintStatus.ACTIVE]: "bg-blue-50 text-blue-600",
  [SprintStatus.COMPLETED]: "bg-green-50 text-green-600",
  [SprintStatus.CANCELLED]: "bg-red-50 text-red-600",
};

export const SprintCard = ({
  sprint,
  workspaceId,
  projectId,
  hasActiveSprint,
}: SprintCardProps) => {
  const [isExpanded, setIsExpanded] = useState(sprint.status === SprintStatus.ACTIVE);

  const { data: workItemsData } = useGetWorkItems({
    workspaceId,
    projectId,
    sprintId: sprint.$id,
    includeChildren: true,
  });

  const workItems = workItemsData?.documents || [];
  const completionPercentage = sprint.totalPoints
    ? Math.round((sprint.completedPoints! / sprint.totalPoints) * 100)
    : 0;

  return (
    <Card className="border border-gray-200 bg-white hover:shadow-md transition-shadow">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header with expand button, title, and status */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 w-6 p-0 hover:bg-gray-100"
              >
                <ChevronDown
                  className={cn(
                    "size-4 text-gray-600 transition-transform duration-200",
                    isExpanded ? "transform rotate-0" : "transform -rotate-90"
                  )}
                />
              </Button>
              <CardTitle className="text-sm font-semibold text-gray-900 truncate">
                {sprint.name}
              </CardTitle>
              <Badge className={cn("text-xs font-medium whitespace-nowrap", statusBadgeStyles[sprint.status])}>
                {sprint.status}
              </Badge>
            </div>

            {/* Sprint metadata - only show when expanded */}
            {isExpanded && (
              <>
                <div className="flex flex-wrap gap-3 text-xs text-gray-600 ml-8 mt-2">
                  {sprint.startDate && sprint.endDate && (
                    <div className="flex items-center gap-1">
                      <Calendar className="size-3.5 text-gray-400" />
                      <span>
                        {formatDistanceToNow(new Date(sprint.startDate), {
                          addSuffix: false,
                        })} remaining
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Target className="size-3.5 text-gray-400" />
                    <span>{sprint.workItemCount || 0} items</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="size-3.5 text-gray-400" />
                    <span>
                      {sprint.completedPoints || 0} / {sprint.totalPoints || 0} points
                    </span>
                  </div>
                </div>

                {/* Sprint goal - optional */}
                {sprint.goal && (
                  <p className="mt-2 ml-8 text-xs text-gray-500 line-clamp-2">{sprint.goal}</p>
                )}

                {/* Progress Bar - compact */}
                <div className="mt-2 ml-8">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600">Progress</span>
                    <span className="text-gray-500 font-medium">{completionPercentage}%</span>
                  </div>
                  <Progress value={completionPercentage} className="h-1.5" />
                </div>
              </>
            )}
          </div>

          {/* Options menu */}
          <SprintOptionsMenu sprint={sprint} hasActiveSprint={hasActiveSprint} />
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-3 pt-0 pb-4 px-4">
          {/* Create Work Item Bar */}
          <CreateWorkItemBar
            workspaceId={workspaceId}
            projectId={projectId}
            sprintId={sprint.$id}
          />

          {/* Work Items List */}
          {workItems.length > 0 ? (
            <div className="space-y-2">
              {workItems.map((workItem) => (
                <WorkItemCard
                  key={workItem.$id}
                  workItem={workItem}
                  workspaceId={workspaceId}
                  projectId={projectId}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-gray-500">
              No work items yet
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
