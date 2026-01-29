"use client";

import { Clock, ExternalLink, CheckSquare, Zap, FileText, Timer, Paperclip, Users, Pin } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberAvatar } from "@/features/members/components/member-avatar";

import { useGetRecentProjectActivityLogs } from "../hooks/use-get-project-activity-logs";
import { ActivityType } from "../types";

interface ProjectActivityLogWidgetProps {
  workspaceId: string;
  projectId: string;
  limit?: number;
}

const getActivityIcon = (type: ActivityType) => {
  switch (type) {
    case ActivityType.TASK:
      return <CheckSquare className="size-4" />;
    case ActivityType.SPRINT:
      return <Zap className="size-4" />;
    case ActivityType.WORK_ITEM:
      return <FileText className="size-4" />;
    case ActivityType.TIME_LOG:
      return <Timer className="size-4" />;
    case ActivityType.ATTACHMENT:
      return <Paperclip className="size-4" />;
    case ActivityType.MEMBER:
      return <Users className="size-4" />;
    default:
      return <Pin className="size-4" />;
  }
};

const getActionColor = (action: string) => {
  switch (action) {
    case "created":
      return "text-green-600";
    case "updated":
      return "text-blue-600";
    case "deleted":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
};

export const ProjectActivityLogWidget = ({
  workspaceId,
  projectId,
  limit = 5,
}: ProjectActivityLogWidgetProps) => {
  const { data, isLoading, error } = useGetRecentProjectActivityLogs({
    workspaceId,
    projectId,
    limit,
  });

  if (isLoading) {
    return (
      <Card className="p-5 bg-card border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium tracking-tight text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Activity
          </h3>
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-5 bg-card border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium tracking-tight text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Activity
          </h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">
          Failed to load activity logs
        </p>
      </Card>
    );
  }

  const activities = data.data || [];

  return (
    <Card className="p-5 bg-card border border-border shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium tracking-tight text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Recent Activity
        </h3>
        <Link
          href={`/workspaces/${workspaceId}/projects/${projectId}/audit-logs`}
        >
          <Button variant="ghost" size="sm" className="h-7 w-7 hover:bg-accent p-0">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </Link>
      </div>
      {activities.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No activity yet
        </p>
      ) : (
        <div className="space-y-2  max-h-[230px] overflow-y-auto pr-1">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-2 rounded-lg bg-muted hover:bg-accent transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5 text-primary">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {activity.userName && (
                      <MemberAvatar
                        name={activity.userName}
                        imageUrl={activity.userImageUrl}
                        className="h-6 w-6"
                        tooltipText={activity.userName}
                      />
                    )}
                    <p className="text-sm font-medium truncate text-foreground">
                      {activity.userName || "Someone"}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(activity.timestamp), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className={getActionColor(activity.action)}>
                    {activity.action}
                  </span>{" "}
                  {activity.description || activity.entityName || "an item"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
