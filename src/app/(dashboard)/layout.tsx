'use client';
import { usePathname } from "next/navigation";
import { CreateProjectModal } from "@/features/projects/components/create-project-modal";
import { CreateWorkspaceModal } from "@/features/workspaces/components/create-workspace-modal";
import { CreateWorkItemModal } from "@/features/sprints/components/create-work-item-modal";
import { CreateCustomColumnModalWrapper } from "@/features/custom-columns/components/create-custom-column-modal-wrapper";
import { ManageColumnsModalWrapper } from "@/features/custom-columns/components/manage-columns-modal-wrapper";
import { CreateTeamModal } from "@/features/teams/components/create-team-modal";
import { EditTeamModal } from "@/features/teams/components/edit-team-modal";
import { CreateProgramModal } from "@/features/programs/components/create-program-modal";
import { EditProgramModal } from "@/features/programs/components/edit-program-modal";
import { ProjectAIChatWrapper } from "@/features/project-docs/components";
import { CreateSpaceModal } from "@/features/spaces/components/create-space-modal";
import { CreateWorkflowModal } from "@/features/workflows/components/create-workflow-modal";
import { CreateLinkModal } from "@/features/work-item-links/components/create-link-modal";
import { CreateTaskModal } from "@/features/tasks/components/create-task-modal";
import { EditTaskModal } from "@/features/tasks/components/edit-task-modal";
import { TaskDetailsModalWrapper } from "@/features/tasks/components/task-details-modal-wrapper";
import { TaskPreviewModalWrapper } from "@/features/tasks/components/task-preview-modal";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";

import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { ProfileSidebar } from "@/components/ProfileSidebar";
import { AccountLifecycleProvider, useAccountLifecycle } from "@/components/account-lifecycle-provider";
import { LifecycleGuard } from "@/components/lifecycle-guard";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Inner layout component that renders the actual dashboard content.
 * Guarded by LifecycleGuard - this only renders when lifecycle state is valid.
 */
const DashboardContent = ({ children }: DashboardLayoutProps) => {
  const pathname = usePathname();
  const isProfilePage = pathname === "/profile" || pathname.startsWith("/profile/");
  const workspaceId = useWorkspaceId();
  const isTaskDetailPage = /^\/workspaces\/[^\/]+\/tasks\/[^\/]+$/.test(pathname || "");
  const isMainDashboard = /^\/workspaces\/[^\/]+$/.test(pathname || "");
  const { isLoaded } = useAccountLifecycle();

  // Don't render until lifecycle is loaded
  if (!isLoaded) return null;

  return (
    <div className={`min-h-screen ${isMainDashboard ? 'bg-[#ffffff]' : ''}`}>
      <CreateWorkspaceModal />
      <CreateProjectModal />
      <CreateWorkItemModal />
      <CreateTaskModal />
      <EditTaskModal />
      <TaskDetailsModalWrapper />
      <TaskPreviewModalWrapper />
      <CreateCustomColumnModalWrapper />
      <ManageColumnsModalWrapper />
      <CreateTeamModal />
      <EditTeamModal />
      <CreateProgramModal />
      <EditProgramModal />
      {workspaceId && (
        <>
          <CreateSpaceModal />
          <CreateWorkflowModal workspaceId={workspaceId} />
          <CreateLinkModal workspaceId={workspaceId} />
        </>
      )}

      <div className="flex w-full h-screen">
        <div className="fixed left-0 top-0 hidden lg:block lg:w-[264px] h-full overflow-y-auto">
          {isProfilePage ? <ProfileSidebar /> : <Sidebar />}
        </div>
        <div className="lg:pl-[264px] w-full flex flex-col min-h-screen">
          <Navbar />
          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
            <div className="mx-auto max-w-screen-2xl">
              <main className={cn(
                "flex flex-col",
                isTaskDetailPage ? "py-0 px-0" : "py-8 px-6"
              )}>
                {children}
              </main>
            </div>
          </div>
        </div>
      </div>

      {/* Project AI Chat - floating button, only shows on project pages */}
      <ProjectAIChatWrapper />
    </div>
  );
};

/**
 * Dashboard Layout with Centralized Lifecycle Management
 * 
 * Architecture:
 * 1. AccountLifecycleProvider - Single source of truth for lifecycle state
 * 2. LifecycleGuard - Enforces routing rules BEFORE rendering
 * 3. DashboardContent - Actual dashboard UI (only renders when valid)
 * 
 * This ensures:
 * - No invalid screen is ever rendered
 * - Routing decisions are made at the layout level
 * - Zero-flash experience during redirects
 */
const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  return (
    <AccountLifecycleProvider>
      <LifecycleGuard>
        <DashboardContent>{children}</DashboardContent>
      </LifecycleGuard>
    </AccountLifecycleProvider>
  );
};

export default DashboardLayout;
