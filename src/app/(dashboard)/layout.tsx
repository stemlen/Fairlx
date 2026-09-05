'use client';
import { usePathname } from "next/navigation";
import { Suspense, Component, type ReactNode, type ErrorInfo } from "react";
import dynamic from "next/dynamic";

// Error boundary to catch chunk loading failures gracefully
class ModalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.warn("Modal chunk loading error (safe to ignore):", error.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// Dynamically import all modals to keep the main bundle light
// Safe dynamic imports with .catch() to handle intermittent chunk loading failures
const CreateProjectModal = dynamic(() => import("@/features/projects/components/create-project-modal").then(mod => mod.CreateProjectModal).catch(() => (() => null) as React.FC), { ssr: false });
const CreateWorkspaceModal = dynamic(() => import("@/features/workspaces/components/create-workspace-modal").then(mod => mod.CreateWorkspaceModal).catch(() => (() => null) as React.FC), { ssr: false });
const CreateWorkItemModal = dynamic(() => import("@/features/sprints/components/create-work-item-modal").then(mod => mod.CreateWorkItemModal).catch(() => (() => null) as React.FC), { ssr: false });
const CreateCustomColumnModalWrapper = dynamic(() => import("@/features/custom-columns/components/create-custom-column-modal-wrapper").then(mod => mod.CreateCustomColumnModalWrapper).catch(() => (() => null) as React.FC), { ssr: false });
const ManageColumnsModalWrapper = dynamic(() => import("@/features/custom-columns/components/manage-columns-modal-wrapper").then(mod => mod.ManageColumnsModalWrapper).catch(() => (() => null) as React.FC), { ssr: false });
const CreateProgramModal = dynamic(() => import("@/features/programs/components/create-program-modal").then(mod => mod.CreateProgramModal).catch(() => (() => null) as React.FC), { ssr: false });
const EditProgramModal = dynamic(() => import("@/features/programs/components/edit-program-modal").then(mod => mod.EditProgramModal).catch(() => (() => null) as React.FC), { ssr: false });
const AgentFloatingChat = dynamic(() => import("@/features/agent/components/agent-floating-chat").then(mod => mod.AgentFloatingChat).catch(() => (() => null) as React.FC), { ssr: false });
const CreateSpaceModal = dynamic(() => import("@/features/spaces/components").then(mod => mod.CreateSpaceModal).catch(() => (() => null) as React.FC), { ssr: false });
const CreateWorkflowModal = dynamic(() => import("@/features/workflows/components/create-workflow-modal").then(mod => mod.CreateWorkflowModal).catch(() => ((_props: { workspaceId?: string }) => null) as React.FC<{ workspaceId?: string }>), { ssr: false });
const CreateLinkModal = dynamic(() => import("@/features/work-item-links/components/create-link-modal").then(mod => mod.CreateLinkModal).catch(() => ((_props: { workspaceId: string }) => null) as React.FC<{ workspaceId: string }>), { ssr: false });
const CreateTaskModal = dynamic(() => import("@/features/tasks/components/create-task-modal").then(mod => mod.CreateTaskModal).catch(() => (() => null) as React.FC), { ssr: false });
const EditTaskModal = dynamic(() => import("@/features/tasks/components/edit-task-modal").then(mod => mod.EditTaskModal).catch(() => (() => null) as React.FC), { ssr: false });
const TaskDetailsModalWrapper = dynamic(() => import("@/features/tasks/components/task-details-modal-wrapper").then(mod => mod.TaskDetailsModalWrapper).catch(() => (() => null) as React.FC), { ssr: false });
const TaskPreviewModalWrapper = dynamic(() => import("@/features/tasks/components/task-preview-modal").then(mod => mod.TaskPreviewModalWrapper).catch(() => (() => null) as React.FC), { ssr: false });
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";

import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { ProfileSidebar } from "@/components/ProfileSidebar";
import { WalletBillingBanner } from "@/features/billing/components/wallet-billing-alerts";

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
const isWorkflowPage = /^\/workspaces\/[^\/]+\/spaces\/[^\/]+\/workflows\/[^\/]+$/.test(pathname || "");
    const isMainDashboard = /^\/workspaces\/[^\/]+$/.test(pathname || "");

  return (
    <div className={`min-h-screen ${isMainDashboard ? 'bg-background' : ''}`}>
      <ModalErrorBoundary>
        <Suspense fallback={null}>
          <CreateWorkspaceModal />
          <CreateProjectModal />
          <CreateWorkItemModal />
          <CreateTaskModal />
          <EditTaskModal />
          <TaskDetailsModalWrapper />
          <TaskPreviewModalWrapper />
          <CreateCustomColumnModalWrapper />
          <ManageColumnsModalWrapper />
          <CreateProgramModal />
          <EditProgramModal />
          {workspaceId && (
            <>
              <CreateSpaceModal />
              <CreateWorkflowModal workspaceId={workspaceId} />
              <CreateLinkModal workspaceId={workspaceId} />
            </>
          )}
        </Suspense>
      </ModalErrorBoundary>

      <div className="flex w-full h-screen">
        <div className="fixed left-0 top-0 hidden lg:block lg:w-[264px] h-full overflow-y-auto">
          {isProfilePage ? <ProfileSidebar /> : <Sidebar />}
        </div>
        <div className="lg:pl-[264px] w-full flex flex-col min-h-screen">
          <Navbar />
          <WalletBillingBanner />
          <div className="flex-1 overflow-y-auto bg-background">
            <main className={cn(
              "flex flex-col",
              isTaskDetailPage || isWorkflowPage ? "py-0 px-0" : "py-4 px-3 sm:py-8 sm:px-6"
            )}>
              {children}
            </main>
          </div>
        </div>
      </div>

      {/* fairlx Agent — floating chat */}
      <Suspense fallback={null}>
        <AgentFloatingChat />
      </Suspense>
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
    <LifecycleGuard>
      <DashboardContent>{children}</DashboardContent>
    </LifecycleGuard>
  );
};

export default DashboardLayout;