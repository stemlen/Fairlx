import { format } from "date-fns";
import { 
  Activity,
  FileText, 
  FolderKanban, 
  Users, 
  Clock,
  Paperclip,
  LayoutGrid,
  ListTodo,
  Briefcase,
  Zap,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useCurrent } from "@/features/auth/api/use-current";

import { ActivityType } from "../types";

interface ActivityLogItemProps {
  id: string;
  type: ActivityType;
  action: string;
  description: string;
  timestamp: string;
  userName?: string;
  userEmail?: string;
  userId?: string;
  userImageUrl?: string;
  entityName?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  changes?: Record<string, unknown>;
}

type IconComponent = React.ComponentType<{ className?: string }>;

const getActivityIcon = (type: ActivityType): IconComponent => {
  const iconMap: Record<ActivityType, IconComponent> = {
    [ActivityType.TASK]: FileText,
    [ActivityType.PROJECT]: FolderKanban,
    [ActivityType.WORKSPACE]: Briefcase,
    [ActivityType.MEMBER]: Users,
    [ActivityType.SPRINT]: Zap,
    [ActivityType.WORK_ITEM]: ListTodo,
    [ActivityType.TIME_LOG]: Clock,
    [ActivityType.ATTACHMENT]: Paperclip,
    [ActivityType.CUSTOM_COLUMN]: LayoutGrid,
    [ActivityType.BACKLOG_ITEM]: ListTodo,
    [ActivityType.NOTIFICATION]: Activity,
  };

  return iconMap[type] || Activity;
};

const getActivityColor = (action: string) => {
  switch (action) {
    case "created":
      return "bg-green-100 text-green-700 border-green-300";
    case "updated":
      return "bg-blue-100 text-blue-700 border-blue-300";
    case "deleted":
      return "bg-red-100 text-red-700 border-red-300";
    default:
      return "bg-gray-100 text-gray-700 border-gray-300";
  }
};

interface ActivityTableViewProps {
  activities: ActivityLogItemProps[];
}

export const ActivityTableView = ({ activities }: ActivityTableViewProps) => {
  const { data: currentUser } = useCurrent();
  
  if (!activities || activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No activities found</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Date</TableHead>
            <TableHead className="w-[200px]">Updated By</TableHead>
            <TableHead className="w-[120px]">Type</TableHead>
            <TableHead className="w-[100px]">Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead className="w-[150px]">Status</TableHead>
            <TableHead className="w-[120px]">Priority</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.map((activity) => {
            const Icon = getActivityIcon(activity.type);
            const colorClass = getActivityColor(activity.action);
            
            // Check if this activity was done by the current user
            const isCurrentUser = currentUser?.$id === activity.userId;
            const displayName = isCurrentUser ? "You" : (activity.userName || "Unknown User");
            
            const initials = activity.userName
              ? activity.userName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .substring(0, 2)
              : "??";

            return (
              <TableRow key={activity.id} className="hover:bg-muted/50">
                <TableCell className="font-medium text-sm">
                  <div className="flex flex-col">
                    <span>{format(new Date(activity.timestamp), "MMM d, yyyy")}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(activity.timestamp), "h:mm a")}
                    </span>
                  </div>
                </TableCell>
                
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 border-2 border-background shadow-sm">
                      {activity.userImageUrl && (
                        <AvatarImage src={activity.userImageUrl} alt={displayName} />
                      )}
                      <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate">
                        {displayName}
                      </span>
                      {!isCurrentUser && activity.userEmail && (
                        <span className="text-xs text-muted-foreground truncate">
                          {activity.userEmail}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs capitalize">{activity.type}</span>
                  </div>
                </TableCell>
                
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-xs ${colorClass} border font-medium`}
                  >
                    {activity.action}
                  </Badge>
                </TableCell>
                
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">
                      {activity.entityName || "N/A"}
                    </span>
                  </div>
                </TableCell>
                
                <TableCell>
                  {activity.metadata?.status && typeof activity.metadata.status === 'string' ? (
                    <Badge variant="secondary" className="text-xs font-medium">
                      {String(activity.metadata.status)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                
                <TableCell>
                  {activity.metadata?.priority && typeof activity.metadata.priority === 'string' ? (
                    <Badge
                      variant="secondary"
                      className={`text-xs font-medium ${
                        activity.metadata.priority === "HIGH" ||
                        activity.metadata.priority === "URGENT"
                          ? "bg-red-100 text-red-700"
                          : activity.metadata.priority === "MEDIUM"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {String(activity.metadata.priority)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
