"use client";

import { Calendar, Target, TrendingUp, ChevronDown, Zap, Clock, CheckCircle2, XCircle, Timer } from "lucide-react";
import { useState } from "react";
import { format, differenceInDays, isPast } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const statusConfig = {
  [SprintStatus.PLANNED]: {
    label: "Planned",
    icon: Clock,
    bgColor: "bg-muted/30",
    badgeClass: "bg-muted text-muted-foreground border-border",
    accentColor: "bg-slate-400",
  },
  [SprintStatus.ACTIVE]: {
    label: "Active",
    icon: Zap,
    bgColor: "bg-blue-500/5 dark:bg-blue-500/10",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    accentColor: "bg-blue-500",
  },
  [SprintStatus.COMPLETED]: {
    label: "Completed",
    icon: CheckCircle2,
    bgColor: "bg-emerald-500/5 dark:bg-emerald-500/10",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    accentColor: "bg-emerald-500",
  },
  [SprintStatus.CANCELLED]: {
    label: "Cancelled",
    icon: XCircle,
    bgColor: "bg-destructive/5",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    accentColor: "bg-destructive",
  },
};

export const SprintCard = ({
  sprint,
  workspaceId,
  projectId,
  hasActiveSprint,
}: SprintCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

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

  const config = statusConfig[sprint.status];
  const StatusIcon = config.icon;

  // Calculate remaining days
  const getRemainingDays = () => {
    if (!sprint.endDate) return null;
    const endDate = new Date(sprint.endDate);
    if (isPast(endDate)) return { days: 0, overdue: true };
    const days = differenceInDays(endDate, new Date());
    return { days, overdue: false };
  };

  const remaining = getRemainingDays();

  return (
    <Card className={cn(
      "border border-border overflow-hidden transition-all duration-200",
      "hover:border-border/80 hover:shadow-sm",
      config.bgColor
    )}>

      <CardHeader className={`${isExpanded ? "pb-1" : "pb-4"} pt-3 px-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header with expand button, title, and status */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 w-6 p-0 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
              >
                <ChevronDown
                  className={cn(
                    "size-4 text-slate-500 transition-transform duration-200",
                    isExpanded ? "rotate-0" : "-rotate-90"
                  )}
                />
              </Button>
              <CardTitle className="text-sm font-semibold text-foreground truncate">
                {sprint.name}
              </CardTitle>
              <Badge
                variant="outline"
                className={cn(
                  "h-5 px-2 text-[10px] font-medium border flex items-center gap-1",
                  config.badgeClass
                )}
              >
                <StatusIcon className="size-3" />
                {config.label}
              </Badge>
            </div>

            {/* Sprint metadata row - always visible but minimal */}
            <div className="flex items-center gap-4 ml-8 mt-2">
              {/* Date range */}
              {sprint.startDate && sprint.endDate && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3 text-slate-400" />
                  <span className="font-medium">
                    {format(new Date(sprint.startDate), "MMM d")} - {format(new Date(sprint.endDate), "MMM d")}
                  </span>
                </div>
              )}

              {/* Remaining time badge - only for active sprints */}
              {sprint.status === SprintStatus.ACTIVE && remaining && (
                <Badge
                  variant="outline"
                  className={cn(
                    "h-5 px-2 text-[10px] font-medium flex items-center gap-1",
                    remaining.overdue
                      ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700"
                      : remaining.days <= 3
                        ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700"
                        : "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700"
                  )}
                >
                  <Timer className="size-3" />
                  {remaining.overdue ? "Overdue" : `${remaining.days}d left`}
                </Badge>
              )}

              {/* Work items count */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Target className="size-3 text-slate-400" />
                <span>{sprint.workItemCount || 0} items</span>
              </div>

              {/* Points */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="size-3 text-muted-foreground/60" />
                <span className="font-medium text-foreground">{sprint.completedPoints || 0}</span>
                <span>/</span>
                <span>{sprint.totalPoints || 0} pts</span>
              </div>

              {/* Progress - compact inline */}
              {(sprint.totalPoints ?? 0) > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        completionPercentage === 100 ? "bg-green-500" : "bg-blue-500"
                      )}
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold min-w-[32px]",
                    completionPercentage === 100 ? "text-green-600" : "text-slate-500"
                  )}>
                    {completionPercentage}%
                  </span>
                </div>
              )}
            </div>

            {/* Sprint goal - optional, show when expanded */}
            {isExpanded && sprint.goal && (
              <p className="mt-2 ml-8 text-xs text-muted-foreground italic line-clamp-2 bg-muted/30 rounded px-2 py-1.5 border border-border">
                &ldquo;{sprint.goal}&rdquo;
              </p>
            )}
          </div>

          {/* Options menu */}
          <SprintOptionsMenu sprint={sprint} hasActiveSprint={hasActiveSprint} />
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-3 pt-3 pb-4 px-4">
          {/* Divider */}
          <div className="h-px bg-slate-200 dark:bg-slate-700 -mx-4" />

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
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
                <Target className="size-4 text-slate-400" />
              </div>
              <p className="text-xs text-muted-foreground">
                No work items yet. Add items to get started.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
