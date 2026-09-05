"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  MessageSquare,
  Search,
  FolderKanban,
  GitMerge,
  Wrench,
  Cpu,
  Server,
  Zap,
  Layers,
  BookOpen,
  Settings,
  Plus,
  ChevronRight,
  ChevronDown,
  Menu,
  Pin,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ModeToggle } from "@/components/mode-toggle";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { UserButton } from "@/features/auth/components/user-button";
import { NotificationBell } from "@/features/notifications";
import { BugReportPopover } from "@/features/bug-reports/components/bug-report-popover";
import { useConfirm } from "@/hooks/use-confirm";

import { useGetAgentContext } from "../api/use-agent-context";
import { useGetAgentHarness, useUpdateAgentHarness } from "../api/use-agent-harness";
import { useGetAgentRuns, useDeleteAgentRun } from "../api/use-agent-runs";
import { relativeTime } from "../lib/agent-ui";
import { useAgentUi } from "./agent-ui-context";
import { WalletBalanceChip, WalletBillingBanner } from "@/features/billing/components/wallet-billing-alerts";

export function AgentPageFrame({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">{children}</div>;
}

function navActive(pathname: string, href: string, hash: string) {
  if (href.includes("#")) {
    const [path, fragment] = href.split("#");
    return pathname === path && hash === `#${fragment}`;
  }
  if (href === "/agent/dashboard") return pathname === href;
  if (href === "/agent/settings") return pathname === href && !hash;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
}

interface NavSection {
  title: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Agent Core",
    items: [
      { href: "/agent/dashboard", label: "Agent Home", icon: Bot, shortcut: "⌘H" },
      { href: "/agent/chats", label: "Chats", icon: MessageSquare },
    ],
  },
  {
    title: "Project & Codes",
    collapsible: true,
    defaultExpanded: true,
    items: [
      { href: "/agent/projects", label: "Projects", icon: FolderKanban },
      { href: "/agent/git", label: "Git & Staging", icon: GitMerge },
    ],
  },
  {
    title: "Agent Tools",
    collapsible: true,
    defaultExpanded: false,
    items: [
      { href: "/agent/skills", label: "Skills", icon: Wrench },
      { href: "/agent/tools", label: "Tools", icon: Cpu },
      { href: "/agent/mcp", label: "MCP Servers", icon: Server },
      { href: "/agent/automations", label: "Automations", icon: Zap },
      { href: "/agent/integrations", label: "Integrations", icon: Layers },
      { href: "/agent/knowledge", label: "Knowledge Base", icon: BookOpen },
      { href: "/agent/settings", label: "Settings", icon: Settings },
    ],
  },
];

function RecentRunItem({
  run,
  active,
  pinned,
  onNavigate,
  onPinToggle,
  onDelete,
}: {
  run: { id: string; title: string; status: string; updatedAt: string };
  active: boolean;
  pinned: boolean;
  onNavigate?: () => void;
  onPinToggle: (runId: string, isPinned: boolean) => void;
  onDelete: (runId: string) => void;
}) {
  const running = run.status === "running";
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        "group relative flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12px] transition",
        running || active
          ? "bg-sidebar-accent text-sidebar-foreground font-medium"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Link
        href={`/agent/workflow?runId=${run.id}`}
        onClick={onNavigate}
        className="flex items-center gap-2 min-w-0 flex-1 truncate mr-1"
      >
        <span
          className={cn(
            "size-1.5 rounded-full shrink-0",
            running ? "bg-blue-500 animate-pulse" : "bg-muted-foreground/40"
          )}
        />
        {pinned ? <Pin className="size-3 text-primary shrink-0 fill-primary" /> : null}
        <span className="truncate">{run.title}</span>
      </Link>

      <div className="flex items-center shrink-0">
        <span
          className={cn(
            "text-[10px] text-muted-foreground shrink-0 pl-1",
            menuOpen ? "hidden" : "group-hover:hidden"
          )}
        >
          {relativeTime(run.updatedAt)}
        </span>

        <div className={cn("items-center shrink-0", menuOpen ? "flex" : "hidden group-hover:flex")}>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="size-5 flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent-foreground/10 rounded transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <MoreHorizontal className="size-3.5" />
                <span className="sr-only">Options</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32 p-1">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onPinToggle(run.id, pinned);
                }}
                className="cursor-pointer flex items-center gap-2 text-xs py-1.5"
              >
                <Pin className={cn("size-3.5", pinned && "fill-primary text-primary")} />
                <span>{pinned ? "Unpin" : "Pin"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(run.id);
                }}
                className="cursor-pointer flex items-center gap-2 text-xs py-1.5 text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="size-3.5" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function AgentSidebarNav({
  pathname,
  hash,
  runs,
  activeRunId,
  openSearch,
  openRecentWork,
  onNavigate,
}: {
  pathname: string;
  hash: string;
  runs: Array<{ id: string; title: string; status: string; updatedAt: string }> | undefined;
  activeRunId: string;
  openSearch: () => void;
  openRecentWork: () => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { data: harness } = useGetAgentHarness();
  const updateHarness = useUpdateAgentHarness();
  const deleteRun = useDeleteAgentRun();
  const [DeleteDialog, confirmDelete] = useConfirm(
    "Delete Run",
    "Are you sure you want to delete this chat run? This action cannot be undone.",
    "destructive"
  );

  const handlePinToggle = (runId: string, isPinned: boolean) => {
    const current = harness?.chatMeta?.pinnedRunIds ?? [];
    updateHarness.mutate({
      json: {
        chatMeta: {
          pinnedRunIds: isPinned
            ? current.filter((id) => id !== runId)
            : [...current.filter((id) => id !== runId), runId],
          archivedRunIds: harness?.chatMeta?.archivedRunIds ?? [],
        },
      },
    });
  };

  const handleDeleteRun = async (runId: string) => {
    const ok = await confirmDelete();
    if (!ok) return;
    deleteRun.mutate(
      { runId },
      {
        onSuccess: () => {
          toast.success("Chat deleted");
          if (activeRunId === runId) {
            router.push("/agent/dashboard");
          }
        },
      }
    );
  };
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_SECTIONS.forEach((section) => {
      if (section.collapsible) {
        initial[section.title] = section.defaultExpanded ?? true;
      }
    });
    return initial;
  });

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  useEffect(() => {
    NAV_SECTIONS.forEach((section) => {
      if (section.collapsible && section.items.some((item) => navActive(pathname, item.href, hash))) {
        setExpandedSections((prev) => ({ ...prev, [section.title]: true }));
      }
    });
  }, [pathname, hash]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Top Logo Header */}
      <div className="flex items-center w-full h-[73px] px-6 border-b border-sidebar-border flex-shrink-0">
        <Link href="/agent/dashboard" onClick={onNavigate} className="flex items-center">
          <Image src="/Logo.png" className="object-contain" alt="Fairlx Logo" width={80} height={90} priority />
        </Link>
      </div>

      {/* Scrollable Navigation Body */}
      <div className="flex flex-col flex-1 overflow-hidden overflow-y-auto px-3 py-3 gap-4 custom-scrollbar">
        {/* Quick Actions: New Agent & Search */}
        <div className="flex flex-col gap-1.5 px-0.5">
          <Link
            href="/agent/dashboard"
            onClick={onNavigate}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-md py-2 px-3 flex items-center justify-between transition-colors shadow-sm font-medium text-xs"
          >
            <div className="flex items-center gap-2">
              <Plus className="size-3.5" />
              <span>New Agent</span>
            </div>
            <div className="flex items-center gap-0.5 opacity-75 text-[10px]">
              <span>⌘</span>
              <span>H</span>
            </div>
          </Link>
          <button
            type="button"
            onClick={openSearch}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-md border border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-xs"
          >
            <div className="flex items-center gap-2">
              <Search className="size-3.5" />
              <span>Search</span>
            </div>
            <span className="text-[10px] opacity-75">⌘K</span>
          </button>
        </div>

        {/* Categorized Navigation */}
        {NAV_SECTIONS.map((section) => {
          const isCollapsible = section.collapsible;
          const isExpanded = isCollapsible ? !!expandedSections[section.title] : true;

          return (
            <div key={section.title} className="flex flex-col gap-0.5">
              {isCollapsible ? (
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleSection(section.title)}
                  className="flex items-center justify-between w-full pl-2.5 pr-2 py-1 mb-1 rounded text-left text-[11px] font-semibold tracking-wider uppercase text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors group cursor-pointer"
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform duration-200 text-sidebar-foreground/50 group-hover:text-sidebar-foreground",
                      !isExpanded && "-rotate-90"
                    )}
                  />
                </button>
              ) : (
                <p className="text-[11px] font-semibold tracking-wider uppercase text-sidebar-foreground/50 pl-2.5 mb-1.5">
                  {section.title}
                </p>
              )}

              {isExpanded && (
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const isActive = navActive(pathname, item.href, hash);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2.5 px-2.5 py-2 rounded-md font-medium text-[12px] tracking-tight transition",
                          isActive
                            ? "bg-sidebar-accent shadow-sm text-sidebar-foreground font-semibold"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}
                      >
                        <Icon className={cn("size-[17px]", isActive && "text-primary")} />
                        <span className="flex-1 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Recent Runs Section */}
        <div className="flex flex-col gap-1 pt-1">
          <div className="flex items-center justify-between px-2.5 mb-1">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-sidebar-foreground/50">
              Recent Runs
            </p>
            <button
              type="button"
              onClick={openRecentWork}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              All
            </button>
          </div>
          {(runs ?? []).slice(0, 4).map((run) => {
            const pinned = (harness?.chatMeta?.pinnedRunIds ?? []).includes(run.id);
            return (
              <RecentRunItem
                key={run.id}
                run={run}
                active={activeRunId === run.id}
                pinned={pinned}
                onNavigate={onNavigate}
                onPinToggle={handlePinToggle}
                onDelete={handleDeleteRun}
              />
            );
          })}
          {(runs ?? []).length === 0 ? (
            <p className="px-2.5 text-xs text-muted-foreground">No runs yet.</p>
          ) : null}
        </div>
      </div>

      {/* Bottom Left: Workspace Switcher */}
      <div className="flex-shrink-0 border-t border-sidebar-border">
        <WorkspaceSwitcher />
      </div>
      <DeleteDialog />
    </div>
  );
}

export function AgentAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openRecentWork, openSearch } = useAgentUi();
  const { data: runs } = useGetAgentRuns();
  const { data: harness } = useGetAgentHarness();
  const { data: context } = useGetAgentContext();
  const [hash, setHash] = useState("");
  const [activeRunId, setActiveRunId] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const runId = searchParams.get("runId");
  const activeRun = (runs ?? []).find((r) => r.id === (runId || activeRunId));

  const activeWorkspace = useMemo(() => {
    if (activeRun?.workspaceId) {
      return (context?.workspaces ?? []).find((w) => w.id === activeRun.workspaceId);
    }
    if (harness?.settings.defaultWorkspaceId) {
      return (context?.workspaces ?? []).find((w) => w.id === harness.settings.defaultWorkspaceId);
    }
    return context?.workspaces?.[0];
  }, [activeRun, context, harness]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const sync = () => {
      setHash(window.location.hash);
      setActiveRunId(new URLSearchParams(window.location.search).get("runId") ?? "");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "h") {
        event.preventDefault();
        router.push("/agent/dashboard");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
      if (!typing && event.key.toLowerCase() === "k" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch, router]);

  // Determine breadcrumb page title
  const pageTitle = useMemo(() => {
    if (pathname === "/agent/dashboard") return "Dashboard";
    if (pathname.startsWith("/agent/workflow")) return activeRun?.title || "Workflow";
    if (pathname === "/agent/chats") return "Chats";
    if (pathname === "/agent/search") return "Search";
    if (pathname === "/agent/projects") return "Projects";
    if (pathname === "/agent/workspaces") return "Workspaces";
    if (pathname === "/agent/git") return "Git & Staging";
    if (pathname === "/agent/skills") return "Skills";
    if (pathname === "/agent/tools") return "Tools";
    if (pathname === "/agent/mcp") return "MCP Servers";
    if (pathname === "/agent/automations") return "Automations";
    if (pathname === "/agent/integrations") return "Integrations";
    if (pathname === "/agent/knowledge") return "Knowledge Base";
    if (pathname === "/agent/settings") return "Settings";
    return "Agent";
  }, [pathname, activeRun]);

  return (
    <div className="relative flex h-full min-h-0 w-full bg-background text-foreground text-sm overflow-hidden">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex w-[264px] bg-sidebar border-r border-sidebar-border flex-col flex-shrink-0 h-full">
        <AgentSidebarNav
          pathname={pathname}
          hash={hash}
          runs={runs}
          activeRunId={activeRunId}
          openSearch={openSearch}
          openRecentWork={openRecentWork}
        />
      </aside>

      {/* Mobile / Tablet Left Sidebar Drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="p-0 w-[280px] sm:w-[320px] bg-sidebar border-sidebar-border flex flex-col h-full text-foreground">
          <SheetTitle className="sr-only">Agent Navigation</SheetTitle>
          <AgentSidebarNav
            pathname={pathname}
            hash={hash}
            runs={runs}
            activeRunId={activeRunId}
            openSearch={() => {
              setMobileNavOpen(false);
              openSearch();
            }}
            openRecentWork={() => {
              setMobileNavOpen(false);
              openRecentWork();
            }}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-background">
        {/* Top Navbar Header */}
        <header className="h-[73px] px-3 sm:px-6 flex items-center border-b border-border sticky top-0 z-10 bg-background justify-between w-full shrink-0 gap-2 sm:gap-4">
          {/* Breadcrumbs on Left + Mobile Hamburger Button */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden size-9 text-muted-foreground hover:text-foreground shrink-0 -ml-1"
              aria-label="Open Navigation Menu"
            >
              <Menu className="size-5" />
            </Button>
            <span className="font-semibold text-foreground truncate max-w-[100px] sm:max-w-[180px] text-xs sm:text-sm">
              {activeWorkspace?.name || "Fairlx Workspace"}
            </span>
            <ChevronRight className="size-3.5 sm:size-4 text-muted-foreground shrink-0" />
            <Link href="/agent/dashboard" className="text-muted-foreground hover:text-foreground font-medium text-xs sm:text-sm">
              Agent
            </Link>
            {pageTitle !== "Dashboard" ? (
              <>
                <ChevronRight className="size-3.5 sm:size-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground truncate max-w-[100px] sm:max-w-[240px] text-xs sm:text-sm">
                  {pageTitle}
                </span>
              </>
            ) : null}
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <WalletBalanceChip />
            {/* Switch back to Fairlx Main App */}
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex text-primary border-primary hover:bg-primary/10 h-8 text-xs font-medium"
              >
                Back to App
              </Button>
            </Link>

            {/* Theme Toggle */}
            <ModeToggle />

            {/* Bug Report Popover */}
            <BugReportPopover />

            {/* Notifications */}
            <NotificationBell />

            {/* Account Profile at Top Right */}
            <UserButton />
          </div>
        </header>
        <WalletBillingBanner />

        {/* Content Outlet */}
        <main className="relative flex-1 min-h-0 overflow-hidden bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
