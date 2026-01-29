"use client";

import { 
  ArrowRight, 
  Calendar as CalendarIcon,
  LayoutList
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

interface ProjectSetupOverlayProps {
  workspaceId: string;
  projectId: string;
  hasWorkItems: boolean;
  hasSprints: boolean;
  hasActiveSprint: boolean;
  onCreateWorkItem?: () => void;
  onCreateSprint?: () => void;
  variant?: "kanban" | "table" | "calendar" | "timeline" | "backlog";
  children?: React.ReactNode;
}

export const ProjectSetupOverlay = ({
  workspaceId,
  projectId,
  hasActiveSprint,
  children,
}: ProjectSetupOverlayProps) => {
  const backlogUrl = `/workspaces/${workspaceId}/projects/${projectId}/backlog`;
  
  // If there's an active sprint, show the view normally
  if (hasActiveSprint) {
    return <>{children}</>;
  }

  // Simple message directing to backlog
  return (
    <div className="relative min-h-[400px]">
      {/* Blurred children in background */}
      <div className="absolute inset-0 blur-sm opacity-30 pointer-events-none overflow-hidden">
        {children}
      </div>
      
      {/* Simple message overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center py-20 px-4">
        <div className="inline-flex items-center justify-center size-14 bg-gray-100 dark:bg-gray-800 rounded-full mb-5">
          <CalendarIcon className="size-7 text-gray-500" />
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No active sprint
        </h3>
        
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
          Go to Backlog to create work items and start a sprint
        </p>
        
        <Link href={backlogUrl}>
          <Button className="gap-2">
            <LayoutList className="size-4" />
            Go to Backlog
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

// Simpler variant for inline empty states
interface EmptyStateProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
}

export const EmptyStateOverlay = ({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="inline-flex items-center justify-center p-4 bg-muted rounded-full mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">{description}</p>
      {action && (
        action.href ? (
          <Link href={action.href}>
            <Button className="gap-2">
              {action.label}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        ) : (
          <Button className="gap-2" onClick={action.onClick}>
            {action.label}
            <ArrowRight className="size-4" />
          </Button>
        )
      )}
    </div>
  );
};
