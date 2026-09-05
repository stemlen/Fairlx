"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Pin,
  Trash2,
  RotateCcw,
  Pencil,
  Server,
  GitBranch,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { RiAddCircleFill } from "react-icons/ri";

import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectAvatar } from "@/features/projects/components/project-avatar";
import { useCreateProjectModal } from "@/features/projects/hooks/use-create-project-modal";

import { useGetAgentAiConfig } from "../api/use-agent-ai-config";
import { useGetAgentContext } from "../api/use-agent-context";
import { useGetAgentHarness, useUpdateAgentHarness } from "../api/use-agent-harness";
import { useGetAgentMcpConfig } from "../api/use-agent-mcp-config";
import { AGENT_CONTEXT_QUERY_KEY, isInternalMcpServer } from "../constants";
import {
  useConfirmAgentRun,
  useContinueAgentRun,
  useDenyAgentRun,
  useDeleteAgentRun,
  useGetAgentRun,
  usePatchAgentRun,
  useSendAgentMessage,
  useStopAgentRun,
} from "../api/use-agent-runs";
import { selectedModelLabel } from "../lib/client-defaults";
import { clockTime, relativeTime } from "../lib/agent-ui";
import { extractBoardProject, withWorkspaceFallback } from "../lib/project-launch";
import { aggregateLlmUsage, formatCompactUsageLine, looksLikeLlmUsageEvent } from "../lib/run-usage";
import type { AgentRun, AgentToolEvent } from "../types";
import { AgentChatThread } from "./agent-chat-thread";
import { AgentRunHud } from "./agent-run-hud";
import { AgentCommandInput } from "./agent-command-input";
import { useAgentUi } from "./agent-ui-context";
import { ModelPicker } from "./model-picker";
import { GitHubOptionalPrompt } from "@/features/github-integration/components";


function FloatingComposer({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
      <div className="bg-gradient-to-t from-background via-background to-transparent pt-12">
        <div className="pointer-events-auto mx-auto w-full max-w-[760px] px-4 pb-5 bg-background">
          {children}
        </div>
      </div>
    </div>
  );
}


function ProjectSelectorRow({
  run,
  projects,
  selectedProject,
}: {
  run: AgentRun;
  projects: Array<{ id: string; name: string; workspaceId: string; imageUrl?: string; key?: string; status?: string }>;
  selectedProject?: { id: string; name: string; workspaceId: string; imageUrl?: string };
  workspaceId?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const patchRun = usePatchAgentRun();
  const updateHarness = useUpdateAgentHarness();
  const { open: openCreateProject } = useCreateProjectModal();

  const handleSelect = (projId: string | null) => {
    const nextProject = projects.find((p) => p.id === projId);
    patchRun.mutate({
      param: { runId: run.id },
      json: {
        projectId: projId || "",
        ...(nextProject ? { workspaceId: nextProject.workspaceId } : {}),
      },
    });
    updateHarness.mutate({
      json: {
        settings: {
          defaultProjectId: projId || undefined,
          ...(nextProject ? { defaultWorkspaceId: nextProject.workspaceId } : {}),
        },
      },
    });
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-[11px] tracking-wider uppercase font-semibold text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          Projects
        </button>
        <RiAddCircleFill
          onClick={() => openCreateProject()}
          className="size-5 text-sidebar-foreground/70 cursor-pointer hover:opacity-75 transition"
        />
      </div>

      <div
        className={`transition-all duration-300 overflow-hidden ${
          isExpanded ? "max-h-96" : "max-h-0"
        }`}
      >
        <Select
          onValueChange={(val) => handleSelect(val === "none" ? null : val)}
          value={selectedProject?.id || "none"}
        >
          <SelectTrigger className="w-full p-2 font-medium text-xs bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground/90 h-9">
            <SelectValue placeholder="No project selected." />
          </SelectTrigger>

          <SelectContent className="bg-popover border-border max-h-72">
            <SelectItem value="none">
              <div className="flex items-center gap-3 font-medium">
                <div className="size-6 rounded-md bg-muted flex items-center justify-center text-muted-foreground text-xs font-semibold">
                  —
                </div>
                <span className="truncate text-xs text-muted-foreground">No project selected.</span>
              </div>
            </SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                <div className="flex items-center gap-3 font-medium">
                  <ProjectAvatar
                    name={project.name}
                    image={project.imageUrl}
                    className="size-6 text-[10px]"
                  />
                  <span className="truncate text-xs">{project.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function WorkflowSidebar({
  run,
  events,
  tab,
  onTab,
}: {
  run: AgentRun;
  events: AgentToolEvent[];
  tab: "context" | "changes" | "terminal" | "preview";
  onTab: (tab: "context" | "changes" | "terminal" | "preview") => void;
}) {
  const { openMcp } = useAgentUi();
  const { data: context } = useGetAgentContext();
  const { data: harness } = useGetAgentHarness();
  const { data: mcp } = useGetAgentMcpConfig();
  const { data: ai } = useGetAgentAiConfig();
  const workspace = context?.workspaces.find((item) => item.id === run.workspaceId) ?? context?.workspaces[0];
  const workspaceId = run.workspaceId || harness?.settings.defaultWorkspaceId || workspace?.id;
  const workspaceProjects = useMemo(
    () => (context?.projects ?? []).filter((item) => !workspaceId || item.workspaceId === workspaceId),
    [context?.projects, workspaceId]
  );
  const launch = useMemo(
    () => withWorkspaceFallback(extractBoardProject(run.messages), run.workspaceId || workspaceId),
    [run.messages, run.workspaceId, workspaceId],
  );
  const effectiveProjectId = run.projectId || launch?.projectId || harness?.settings.defaultProjectId;
  const project = useMemo(() => {
    const fromContext = context?.projects.find((item) => item.id === effectiveProjectId);
    if (fromContext) return fromContext;
    if (launch && launch.projectId === effectiveProjectId) {
      return { id: launch.projectId, name: launch.name || "Project", workspaceId: launch.workspaceId };
    }
    return undefined;
  }, [context?.projects, effectiveProjectId, launch]);
  const projectsForSelect = useMemo(() => {
    const list = [...workspaceProjects];
    if (project && !list.some((item) => item.id === project.id)) {
      list.unshift(project);
    }
    return list;
  }, [workspaceProjects, project]);
  const connected = Object.entries(mcp?.mcpServers ?? {}).filter(
    ([name, server]) => !isInternalMcpServer(name, server) && !server.disabled
  ).length;
  const staging = harness?.gitStaging?.items ?? [];
  const live = events
    .filter((event) => event.type !== "context_meter" && !looksLikeLlmUsageEvent(event))
    .slice(-40);
  const usage = aggregateLlmUsage(events);
  const repo = (context?.githubRepos ?? []).find((item) => item.projectId === project?.id);
  const terminals = events.filter((event) => event.type === "terminal");
  const githubUrl = repo?.githubUrl || (repo?.owner && repo.repositoryName ? `https://github.com/${repo.owner}/${repo.repositoryName}` : "");
  const prLinks = events
    .filter((event) => event.type === "github_open_pr" || event.type === "github_write_file")
    .map((event) => {
      const payload = event.payload && typeof event.payload === "object" ? (event.payload as { html_url?: string; title?: string; path?: string }) : {};
      return {
        id: event.id,
        url: typeof payload.html_url === "string" ? payload.html_url : "",
        label: payload.title || payload.path || event.title,
      };
    })
    .filter((item) => item.url);

  return (
    <aside className="hidden lg:flex w-80 bg-sidebar border-l border-sidebar-border flex-col flex-shrink-0 h-full">
      {/* Tabs Header at top of Right Sidebar */}
      <div className="flex border-b border-sidebar-border bg-sidebar shrink-0">
        {(
          [
            ["context", "Context"],
            ["changes", "Changes"],
            ["terminal", "Terminal"],
            ["preview", "Preview"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={cn(
              "flex-1 py-3 text-xs font-semibold transition-colors border-b-2",
              tab === id
                ? "text-primary border-primary bg-sidebar-accent/50"
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-sidebar-accent/30"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tabs Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-5">
        {tab === "context" ? (
          <>
            <div className="flex flex-col gap-3">
              <ProjectSelectorRow
                run={run}
                projects={projectsForSelect}
                selectedProject={project}
                workspaceId={workspace?.id}
              />
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">Agent</div>
                <ModelPicker variant="sidebar" runModelId={run.modelId} />
              </div>
              <button
                type="button"
                onClick={openMcp}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-sidebar-accent cursor-pointer border border-transparent hover:border-sidebar-border group transition-colors w-full text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Server className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-foreground text-xs font-medium group-hover:text-primary transition-colors">MCP Servers</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className={cn("font-medium text-[11px]", connected > 0 ? "text-green-500" : "text-muted-foreground")}>
                    {connected} connected
                  </span>
                  <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </button>
              {project && !repo && project.workspaceId ? (
                <GitHubOptionalPrompt projectId={project.id} workspaceId={project.workspaceId} compact />
              ) : null}
            </div>

            <hr className="border-sidebar-border" />

            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Live Activity</h3>
                {run.status === "running" ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full font-medium">
                    <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
                    Live
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground capitalize font-medium">{run.status}</span>
                )}
              </div>
              {live.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">No activity yet.</p>
              ) : (
                <div className="relative pl-3 border-l-2 border-sidebar-border flex flex-col gap-3 ml-2">
                  {live.map((event, index) => {
                    const latest = index === live.length - 1 && (run.status === "running" || run.status === "awaiting_confirmation" || run.status === "awaiting_plugin");
                    const failed = event.type === "error" || /fail/i.test(event.title);
                    const thinking = event.type === "thought" || event.type === "subagent_progress";
                    return (
                      <div key={event.id} className="relative">
                        <div
                          className={cn(
                            "absolute -left-[18px] top-1.5 size-2 rounded-full",
                            latest
                              ? "bg-primary shadow-[0_0_6px_rgba(59,130,246,0.8)]"
                              : failed
                                ? "bg-destructive"
                                : thinking
                                  ? "bg-violet-400/80"
                                  : "bg-muted-foreground/50"
                          )}
                        />
                        <div className="flex items-start text-xs">
                          <span className={cn("w-14 shrink-0 text-[11px]", latest ? "text-primary font-medium" : "text-muted-foreground")}>
                            {clockTime(event.createdAt, true)}
                          </span>
                          <div className="flex-1 ml-1.5 min-w-0">
                            <span
                              className={cn(
                                "block",
                                latest ? "text-primary font-medium" : failed ? "text-destructive font-medium" : "text-foreground"
                              )}
                            >
                              {event.title}
                            </span>
                            {event.detail ? (
                              <span className="block text-[11px] text-muted-foreground mt-0.5 line-clamp-3 whitespace-pre-wrap">
                                {event.detail}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <hr className="border-sidebar-border" />

            <div>
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3 px-1">Run Settings</h3>
              <div className="flex flex-col gap-2.5 text-xs bg-sidebar-accent/40 border border-sidebar-border rounded-lg p-3">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Model</span>
                  <span className="text-foreground font-medium truncate">{selectedModelLabel(ai)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="text-foreground font-medium capitalize">{run.mode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Steps</span>
                  <span className="text-foreground font-medium">{events.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started</span>
                  <span className="text-foreground font-medium">{relativeTime(run.createdAt)}</span>
                </div>
                {usage ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Usage</span>
                    <span className="text-foreground font-medium text-right leading-snug">
                      {formatCompactUsageLine(usage)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {tab === "changes" ? (
          <div className="space-y-3">
            {prLinks.length ? (
              <div className="space-y-2">
                {prLinks.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 hover:bg-sidebar-accent transition-colors"
                  >
                    <p className="text-xs font-medium text-primary truncate">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.url}</p>
                  </a>
                ))}
              </div>
            ) : null}
            {staging.length === 0 && !prLinks.length ? (
              <p className="text-xs text-muted-foreground px-1">
                {repo
                  ? "No pull requests yet. Accept a GitHub write to open a real PR."
                  : "Link a GitHub repo or connect a PAT to edit code."}
              </p>
            ) : (
              staging.map((item) => (
                <Link
                  key={item.id}
                  href="/agent/git"
                  className="block rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 hover:bg-sidebar-accent transition-colors"
                >
                  <p className="text-xs font-medium text-foreground truncate">{item.path}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.status}
                    {item.branch ? ` · ${item.branch}` : ""}
                  </p>
                  {item.summary ? <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{item.summary}</p> : null}
                </Link>
              ))
            )}
            {repo ? (
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium px-1"
              >
                <GitBranch className="size-3.5" /> Open {repo.owner}/{repo.repositoryName} on GitHub
              </a>
            ) : null}
          </div>
        ) : null}

        {tab === "terminal" ? (
          <div className="space-y-2">
            {terminals.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">
                No recorded commands. The agent logs planned terminal commands here.
              </p>
            ) : (
              terminals.map((event) => (
                <div key={event.id} className="rounded-lg border border-sidebar-border bg-card p-3 font-mono text-[11px] text-foreground">
                  <div className="text-muted-foreground text-[10px] mb-1">{clockTime(event.createdAt, true)}</div>
                  <div className="font-semibold">{event.title}</div>
                  {event.detail ? <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{event.detail}</div> : null}
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "preview" ? (
          <div className="space-y-3">
            {githubUrl ? (
              <>
                <p className="text-xs text-muted-foreground px-1">
                  Preview code directly via GitHub repository links.
                </p>
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs font-medium text-primary hover:bg-sidebar-accent transition-colors"
                >
                  <span>Open Repository</span>
                  <ExternalLink className="size-3.5" />
                </a>
                {repo?.owner && repo.repositoryName ? (
                  <a
                    href={`https://github.dev/${repo.owner}/${repo.repositoryName}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-xs font-medium text-foreground hover:bg-sidebar-accent transition-colors"
                  >
                    <span>Open in GitHub.dev</span>
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </>
            ) : project ? (
              <Link
                href={`/workspaces/${project.workspaceId}/projects/${project.id}/github`}
                className="block rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-300 font-medium"
              >
                Connect GitHub to preview this project&apos;s code.
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground px-1">Select a project to preview linked code.</p>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function WorkflowViewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId") ?? undefined;
  const { data: run, isLoading, error } = useGetAgentRun(runId);
  const { data: context } = useGetAgentContext();
  const sendMessage = useSendAgentMessage();
  const stopRun = useStopAgentRun();
  const continueRun = useContinueAgentRun();
  const confirmRun = useConfirmAgentRun();
  const denyRun = useDenyAgentRun();
  const deleteRun = useDeleteAgentRun();
  const patchRun = usePatchAgentRun();
  const { data: harness } = useGetAgentHarness();
  const updateHarness = useUpdateAgentHarness();
  const queryClient = useQueryClient();
  const stickToBottomRef = useRef(true);
  const continuedRef = useRef<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [tab, setTab] = useState<"context" | "changes" | "terminal" | "preview">("context");
  const [DeleteDialog, confirmDelete] = useConfirm(
    "Delete Run",
    "Are you sure you want to delete this chat run? This action cannot be undone.",
    "destructive"
  );

  useEffect(() => {
    if (run?.title) setTitle(run.title);
  }, [run?.title]);

  useEffect(() => {
    if (!run) return;
    if (continuedRef.current === run.id) return;
    continuedRef.current = run.id;
    // Recover a refresh mid-turn. Accept/Deny starts its own turn — do not
    // continue when this chat loaded already waiting for approval.
    if (run.status === "running") continueRun.mutate({ runId: run.id });
  }, [run, continueRun]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [run?.messages.length, run?.events.length, run?.status]);

  const boardProject = useMemo(
    () => withWorkspaceFallback(extractBoardProject(run?.messages ?? []), run?.workspaceId),
    [run?.messages, run?.workspaceId],
  );
  const syncedScopeRef = useRef<{ bound?: string; context?: string }>({});

  useEffect(() => {
    if (!run?.id || !boardProject) return;
    const scopeKey = `${run.id}:${boardProject.projectId}:${boardProject.workspaceId}`;
    const known = (context?.projects ?? []).some((item) => item.id === boardProject.projectId);
    if (!known && syncedScopeRef.current.context !== scopeKey) {
      syncedScopeRef.current.context = scopeKey;
      queryClient.invalidateQueries({ queryKey: AGENT_CONTEXT_QUERY_KEY });
    }
    const alreadyBound =
      run.projectId === boardProject.projectId && run.workspaceId === boardProject.workspaceId;
    if (alreadyBound) {
      syncedScopeRef.current.bound = scopeKey;
      return;
    }
    if (syncedScopeRef.current.bound === scopeKey) return;
    syncedScopeRef.current.bound = scopeKey;
    patchRun.mutate({
      param: { runId: run.id },
      json: {
        projectId: boardProject.projectId,
        workspaceId: boardProject.workspaceId,
      },
    });
    updateHarness.mutate({
      json: {
        settings: {
          defaultProjectId: boardProject.projectId,
          defaultWorkspaceId: boardProject.workspaceId,
        },
      },
    });
  }, [
    boardProject,
    context?.projects,
    patchRun,
    queryClient,
    run?.id,
    run?.projectId,
    run?.workspaceId,
    updateHarness,
  ]);

  if (!runId) {
    return (
      <div className="relative h-full min-h-0 overflow-hidden bg-background">
        <div className="absolute inset-0 overflow-y-auto custom-scrollbar px-8 pt-12 pb-56">
          <div className="max-w-3xl mx-auto space-y-3">
            <h1 className="text-3xl font-bold text-foreground">Start an Agent Run</h1>
            <p className="text-sm text-muted-foreground">
              Ask the Agent to inspect Fairlx work, search repositories, plan sprints, or ship code changes.
            </p>
          </div>
        </div>
        <FloatingComposer>
          <AgentCommandInput showQuickActions placeholder="Plan, Build, / for skills, @ for context" />
        </FloatingComposer>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="relative h-full min-h-0 bg-background flex flex-col items-center justify-center text-sm text-muted-foreground pb-32">
        <Loader2 className="size-6 animate-spin text-primary mb-2" />
        <span>Loading workflow…</span>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="relative h-full min-h-0 bg-background flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground pb-32">
        <p>{error?.message || "Run not found."}</p>
        <Link href="/agent/dashboard">
          <Button variant="outline" size="sm">Back to Agent Home</Button>
        </Link>
      </div>
    );
  }

  const running = run.status === "running";
  const awaiting = run.status === "awaiting_confirmation";
  const awaitingPlugin = run.status === "awaiting_plugin";
  const pinned = (harness?.chatMeta?.pinnedRunIds ?? []).includes(run.id);

  const saveTitle = () => {
    if (title.trim() && title.trim() !== run.title) {
      patchRun.mutate({ param: { runId: run.id }, json: { title: title.trim() } });
    }
    setRenaming(false);
  };

  return (
    <div className="h-full min-h-0 flex overflow-hidden bg-background">
      <DeleteDialog />
      {/* Center Chat & Stream View */}
      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
        {/* Top Run Toolbar */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-card/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            {renaming ? (
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={saveTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="text-base font-semibold text-foreground bg-transparent outline-none border-b border-primary px-1"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate max-w-[320px]">{run.title}</h2>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  onClick={() => setRenaming(true)}
                  title="Rename"
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>
            )}
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[11px]",
                  running || awaiting || awaitingPlugin
                    ? "bg-blue-500/10 text-blue-500"
                    : run.status === "completed"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-destructive/10 text-destructive"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    running || awaiting || awaitingPlugin ? "bg-blue-500 animate-pulse" : run.status === "completed" ? "bg-green-500" : "bg-destructive"
                  )}
                />
                <span className="capitalize">{running ? "Running" : awaiting ? "Needs approval" : awaitingPlugin ? "Needs plugin" : run.status}</span>
              </span>
              <span className="text-muted-foreground">• Started {relativeTime(run.createdAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {run.status === "failed" || run.status === "stopped" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={continueRun.isPending}
                onClick={() => continueRun.mutate({ runId: run.id })}
                className="h-8 text-xs font-medium gap-1.5"
              >
                <RotateCcw className="size-3.5" /> Retry
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => {
                const current = harness?.chatMeta?.pinnedRunIds ?? [];
                updateHarness.mutate({
                  json: {
                    chatMeta: {
                      pinnedRunIds: pinned ? current.filter((id) => id !== run.id) : [...current, run.id],
                      archivedRunIds: harness?.chatMeta?.archivedRunIds ?? [],
                    },
                  },
                });
              }}
              title={pinned ? "Unpin" : "Pin"}
            >
              <Pin className={cn("size-4", pinned && "fill-primary text-primary")} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-destructive"
              disabled={deleteRun.isPending}
              onClick={async () => {
                const ok = await confirmDelete();
                if (!ok) return;
                deleteRun.mutate(
                  { runId: run.id },
                  {
                    onSuccess: () => {
                      router.push("/agent/chats");
                    },
                  }
                );
              }}
              title="Delete run"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Messages Stream Scroll Area */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollerRef}
            className="absolute inset-0 overflow-y-auto custom-scrollbar px-6 py-6 pb-8"
            onScroll={(event) => {
              const target = event.currentTarget;
              const gap = target.scrollHeight - target.scrollTop - target.clientHeight;
              stickToBottomRef.current = gap < 80;
            }}
          >
            <AgentChatThread
              run={run}
              sending={sendMessage.isPending}
              isAccepting={confirmRun.isPending}
              isDenying={denyRun.isPending}
              onSendEdit={(content) => {
                stickToBottomRef.current = true;
                sendMessage.mutate({ param: { runId: run.id }, json: { content } });
              }}
              onPickChoice={(choice) => {
                stickToBottomRef.current = true;
                sendMessage.mutate({ param: { runId: run.id }, json: { content: choice } });
              }}
              onConfirm={() => confirmRun.mutate({ runId: run.id })}
              onDeny={() => denyRun.mutate({ runId: run.id })}
            />
          </div>

          <FloatingComposer>
            <AgentRunHud run={run} />
            <AgentCommandInput
              run={run}
              variant="followup"
              showQuickActions={!awaiting && !awaitingPlugin && !running}
              submitting={sendMessage.isPending || awaiting || awaitingPlugin || running}
              placeholder={
                awaiting
                  ? "Accept or deny the pending action first"
                  : awaitingPlugin
                    ? "Connect a plugin to continue"
                  : run.kind === "training"
                    ? "Type your own answer, or tap a choice above"
                    : "Plan, Build, / for skills, @ for context"
              }
              onFollowUp={(content) => {
                stickToBottomRef.current = true;
                sendMessage.mutate({ param: { runId: run.id }, json: { content } });
              }}
              onStop={() => stopRun.mutate({ runId: run.id })}
              isStopping={stopRun.isPending}
            />
          </FloatingComposer>
        </div>
      </div>

      {/* Right Sidebar: Context, Changes, Terminal, Preview (Positioned below navbar on the right side) */}
      <WorkflowSidebar run={run} events={run.events ?? []} tab={tab} onTab={setTab} />
    </div>
  );
}

export function WorkflowView() {
  return (
    <div className="h-full min-h-0">
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading workflow…</div>
        }
      >
        <WorkflowViewInner />
      </Suspense>
    </div>
  );
}
