"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderKanban,
  Loader2,
  Pencil,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

import { cn } from "@/lib/utils";

import { useGetAgentContext } from "../api/use-agent-context";
import { useGetAgentHarness } from "../api/use-agent-harness";
import { splitAssistantChoices } from "../lib/assistant-choices";
import { splitMarkdownMemberTable, type AgentMember } from "../lib/member-table";
import {
  extractBoardProject,
  kanbanCtasForBlocks,
  projectKanbanHref,
  withWorkspaceFallback,
} from "../lib/project-launch";
import { displayUserContent } from "../lib/session-context";
import {
  collectMemberLookup,
  collectWorkItemLookup,
  formatThinkingDuration,
  groupConversationTurns,
  isHiddenActivityEvent,
  isRepeatedToolResult,
  summarizeToolResult,
  thinkingDurationMs,
  toolLabel,
  visibleThoughtLines,
  workItemListRows,
  workspaceMemberRows,
  type TranscriptBlock,
  type TranscriptStep,
} from "../lib/transcript";
import { isPersistedTruncatedAssistant, sanitizeAssistantVisible } from "../lib/visible-content";
import { splitMarkdownWorkItemTable, type AgentWorkItem } from "../lib/work-item-table";
import { findPendingConfirmation, isWriteToolCall } from "../lib/write-guard";
import { findPendingPlugin } from "../plugins/catalog";
import type { AgentChatMessage, AgentRun, AgentToolEvent } from "../types";
import { AgentMemberTable } from "./agent-member-table";
import { AgentWorkItemTable } from "./agent-work-item-table";
import { AgentTurnUsageCard } from "./agent-run-hud";
import { PendingConfirmationCard } from "./pending-confirmation-card";
import { PluginConnectCard } from "./plugin-connect-card";
import { GitHubOptionalPrompt } from "@/features/github-integration/components";

function ProjectKanbanCta({
  workspaceId,
  projectId,
  name,
}: {
  workspaceId: string;
  projectId: string;
  name?: string;
}) {
  const href = projectKanbanHref({ workspaceId, projectId, name });
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative inline-flex w-full max-w-sm sm:max-w-md items-center gap-3 overflow-hidden rounded-xl border border-border/80 bg-card/90 p-2.5 pr-3 text-left shadow-2xs transition-all duration-200 hover:border-primary/40 hover:bg-card hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary transition-all duration-200 group-hover:border-primary/40 group-hover:bg-primary/15 group-hover:scale-105">
        <FolderKanban className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-foreground tracking-tight transition-colors group-hover:text-primary">
            Open Kanban board
          </span>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {name ? (
            <>
              <span className="font-medium text-foreground/80">{name}</span>
              <span className="mx-1 opacity-50">·</span>
            </>
          ) : null}
          <span>View board in new tab</span>
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-2xs transition-all duration-200 group-hover:border-primary/30 group-hover:bg-primary group-hover:text-primary-foreground">
        <span>Open</span>
        <ArrowUpRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </a>
  );
}

function UserBubble({
  message,
  canEdit,
  onSendEdit,
  compact,
}: {
  message: AgentChatMessage;
  canEdit?: boolean;
  onSendEdit?: (content: string) => void;
  compact?: boolean;
}) {
  const visible = displayUserContent(message.content);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(visible);

  const startEdit = () => {
    setDraft(visible);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(visible);
    setEditing(false);
  };

  const submitEdit = () => {
    const next = draft.trim();
    if (!next || !onSendEdit) return;
    if (next === visible.trim()) {
      setEditing(false);
      return;
    }
    onSendEdit(next);
    setEditing(false);
  };

  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "bg-muted/70 rounded-2xl rounded-br-md max-w-[min(36rem,85%)] text-foreground relative group",
          compact ? "px-3.5 py-2.5" : "px-4 py-3",
        )}
      >
        {canEdit && !editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="absolute -left-8 top-2 inline-flex items-center justify-center size-6 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-muted transition-opacity"
            title="Edit and send as a new question"
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitEdit();
                }
              }}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              className="w-full resize-none rounded-lg border border-primary/30 bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEdit}
                disabled={!draft.trim()}
                className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                Send as new question
              </button>
            </div>
          </div>
        ) : (
          <p className="leading-relaxed whitespace-pre-wrap text-[13.5px]">{visible}</p>
        )}
      </div>
    </div>
  );
}

function CodeBlock({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const codeString = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (match) {
    return (
      <div className="relative group my-3 rounded-lg overflow-hidden border border-border bg-[#1e1e1e]">
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border text-[11px] text-muted-foreground font-mono">
          <span>{match[1]}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: 0, padding: "12px", fontSize: "12px", background: "transparent" }}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code className={cn("bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground", className)} {...props}>
      {children}
    </code>
  );
}

function MarkdownRich({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          p({ children }) {
            return <p className="mb-2.5 last:mb-0 leading-relaxed text-sm text-foreground">{children}</p>;
          },
          strong({ children }) {
            return <strong className="font-semibold text-foreground">{children}</strong>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-foreground">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-foreground">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-base font-bold my-2 text-foreground">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-sm font-bold my-2 text-foreground">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-semibold my-1.5 text-foreground">{children}</h3>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary/60 pl-3 italic text-muted-foreground my-2">
                {children}
              </blockquote>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-border">
                <table className="min-w-full divide-y divide-border text-xs">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th className="bg-muted/50 px-3 py-2 text-left font-semibold text-foreground">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-2 border-t border-border">{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownContent({
  content,
  workItems,
  members,
  workspaceId,
  projectId,
}: {
  content: string;
  workItems?: Map<string, AgentWorkItem>;
  members?: Map<string, AgentMember>;
  workspaceId?: string;
  projectId?: string;
}) {
  const workParsed = splitMarkdownWorkItemTable(content);
  if (workParsed) {
    return (
      <div>
        {workParsed.before ? (
          <MarkdownContent
            content={workParsed.before}
            workItems={workItems}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
          />
        ) : null}
        <AgentWorkItemTable
          rows={workParsed.rows}
          lookup={workItems}
          workspaceId={workspaceId}
          projectId={projectId}
        />
        {workParsed.after ? (
          <MarkdownContent
            content={workParsed.after}
            workItems={workItems}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
          />
        ) : null}
      </div>
    );
  }

  const memberParsed = splitMarkdownMemberTable(content);
  if (memberParsed) {
    return (
      <div>
        {memberParsed.before ? (
          <MarkdownContent
            content={memberParsed.before}
            workItems={workItems}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
          />
        ) : null}
        <AgentMemberTable
          rows={memberParsed.rows}
          lookup={members}
          workspaceId={workspaceId}
        />
        {memberParsed.after ? (
          <MarkdownContent
            content={memberParsed.after}
            workItems={workItems}
            members={members}
            workspaceId={workspaceId}
            projectId={projectId}
          />
        ) : null}
      </div>
    );
  }

  return <MarkdownRich content={content} />;
}

function TruncationNote({ content }: { content?: string | null }) {
  if (!isPersistedTruncatedAssistant(content)) return null;
  return (
    <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
      This answer was cut off while saving. Ask the agent to continue from here.
    </p>
  );
}

function AgentBubble({
  message,
  workItems,
  members,
  workspaceId,
  projectId,
  choicesEnabled = false,
  onPickChoice,
}: {
  message: AgentChatMessage;
  workItems?: Map<string, AgentWorkItem>;
  members?: Map<string, AgentMember>;
  workspaceId?: string;
  projectId?: string;
  choicesEnabled?: boolean;
  onPickChoice?: (choice: string) => void;
}) {
  const visible = sanitizeAssistantVisible(message.content);
  if (!visible) return null;
  const { text, choices } = splitAssistantChoices(visible);
  return (
    <div className="flex-1 min-w-0 max-w-[46rem]">
      {text ? (
        <MarkdownContent
          content={text}
          workItems={workItems}
          members={members}
          workspaceId={workspaceId}
          projectId={projectId}
        />
      ) : null}
      {choices.length ? (
        <div className="flex flex-wrap gap-2 mt-3">
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={!choicesEnabled}
              onClick={() => onPickChoice?.(choice)}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                choicesEnabled
                  ? "border-border bg-muted/40 text-foreground hover:bg-muted"
                  : "border-border bg-muted/20 text-muted-foreground cursor-default",
              )}
            >
              {choice}
            </button>
          ))}
        </div>
      ) : null}
      <TruncationNote content={message.content} />
    </div>
  );
}

function LiveElapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ms = Math.max(0, now - new Date(since).getTime());
  return <span>{formatThinkingDuration(ms)}</span>;
}

function ThinkingBlock({
  thoughts,
  startedAt,
  endedAt,
  live,
  keepOpen = false,
}: {
  thoughts: AgentToolEvent[];
  startedAt: string;
  endedAt?: string;
  live: boolean;
  keepOpen?: boolean;
}) {
  const [open, setOpen] = useState(live || keepOpen);
  useEffect(() => {
    if (live || keepOpen) setOpen(true);
    else setOpen(false);
  }, [live, keepOpen]);
  const lines = visibleThoughtLines(thoughts);
  const duration = thinkingDurationMs(thoughts, startedAt, endedAt, live);
  const label = live ? "Thinking" : `Thought ${formatThinkingDuration(duration || 1000)}`;
  const canExpand = lines.length > 0 || live;
  if (!thoughts.length && !live) return null;

  return (
    <div className="min-w-0 max-w-[46rem]">
      <button
        type="button"
        onClick={() => {
          if (!canExpand) return;
          setOpen((value) => !value);
        }}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {live ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <Sparkles className="size-3.5 text-muted-foreground" />}
        <span className="font-medium">{label}</span>
        {live ? (
          <span className="tabular-nums text-[12px]">
            <LiveElapsed since={thoughts[0]?.createdAt || startedAt} />
          </span>
        ) : null}
        {canExpand ? open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" /> : null}
      </button>
      {open && canExpand ? (
        <div className="mt-1.5 ml-1 border-l border-border/80 pl-3 space-y-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
          {lines.length ? (
            lines.map((event) => {
              const body =
                event.detail && event.detail !== event.title && !/^Pass \d+$/i.test(event.detail.trim())
                  ? event.detail
                  : event.title;
              return (
                <p key={event.id} className="whitespace-pre-wrap">
                  {body}
                </p>
              );
            })
          ) : (
            <p className="italic">Working through the request…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StepRow({
  step,
  active,
  awaiting,
  workItems,
  members,
  workspaceId,
  projectId,
}: {
  step: TranscriptStep;
  active?: boolean;
  awaiting?: boolean;
  workItems?: Map<string, AgentWorkItem>;
  members?: Map<string, AgentMember>;
  workspaceId?: string;
  projectId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const summary = summarizeToolResult(step.call.name, step.result?.content);
  const listRows = workItemListRows(step.result?.content);
  const memberRows = workspaceMemberRows(step.result?.content);
  const isList = step.call.name === "fairlx_work_item_list" || step.call.name === "list_work_items";
  const isMemberList =
    step.call.name === "fairlx_workspace_members_list" || step.call.name === "list_workspace_members";
  const hasRichTable = (isList && listRows.length > 0) || (isMemberList && memberRows.length > 0);

  let parsedArgs: Record<string, unknown> | null = null;
  if (typeof step.call.arguments === "string" && step.call.arguments.trim()) {
    try {
      parsedArgs = JSON.parse(step.call.arguments);
    } catch {
      // Keep as string
    }
  } else if (step.call.arguments && typeof step.call.arguments === "object") {
    parsedArgs = step.call.arguments as Record<string, unknown>;
  }

  let parsedResult: unknown = null;
  if (step.result?.content) {
    try {
      parsedResult = JSON.parse(step.result.content);
    } catch {
      parsedResult = step.result.content;
    }
  }

  const effectiveArgs =
    parsedArgs ||
    (step.event?.payload && typeof step.event.payload === "object"
      ? (step.event.payload as Record<string, unknown>).args || step.event.payload
      : null);

  const formattedArgsString = effectiveArgs
    ? JSON.stringify(effectiveArgs, null, 2)
    : step.call.arguments || "";

  const formattedResultString = parsedResult
    ? JSON.stringify(parsedResult, null, 2)
    : step.result?.content || (step.event?.payload ? JSON.stringify(step.event.payload, null, 2) : "");

  const hasDetails = Boolean(formattedArgsString.trim() || formattedResultString.trim());

  const workItemMeta = useMemo(() => {
    if (!effectiveArgs || typeof effectiveArgs !== "object") return null;
    const obj = effectiveArgs as Record<string, unknown>;
    const isWorkItem = /work_item_(create|update)/i.test(step.call.name);
    const title = String(obj.title || obj.name || "").trim();
    if (!isWorkItem && !title) return null;
    const type = typeof obj.type === "string" ? obj.type.toUpperCase() : undefined;
    const priority = typeof obj.priority === "string" ? obj.priority.toUpperCase() : undefined;
    const labels = Array.isArray(obj.labels) ? obj.labels.map(String).filter(Boolean) : [];
    return { title, type, priority, labels };
  }, [effectiveArgs, step.call.name]);

  let argHint = "";
  if (effectiveArgs && typeof effectiveArgs === "object") {
    const obj = effectiveArgs as Record<string, unknown>;
    const directQuery =
      obj.title ||
      obj.query ||
      obj.q ||
      obj.search ||
      obj.prompt ||
      obj.task ||
      obj.command ||
      obj.name;
    const isCreateWorkItem = step.call.name === "fairlx_work_item_create";
    const targetId =
      obj.workItemId ||
      obj.key ||
      obj.sprintId ||
      obj.docId ||
      (isCreateWorkItem ? undefined : obj.projectId || obj.workspaceId);
    if (obj.unassigned === true) {
      argHint = "Unassigned";
    } else if (typeof directQuery === "string" && directQuery) {
      argHint = `"${directQuery.slice(0, 45)}${directQuery.length > 45 ? "…" : ""}"`;
    } else if (typeof targetId === "string" && targetId) {
      argHint = `ID: ${targetId}`;
    }
  }

  const handleCopy = (text: string, type: "query" | "result") => {
    navigator.clipboard.writeText(text);
    if (type === "query") {
      setCopiedQuery(true);
      setTimeout(() => setCopiedQuery(false), 1500);
    } else {
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 1500);
    }
  };

  const isWrite = isWriteToolCall(step.call);
  const isFailed = Boolean(step.result && !summary.ok);
  const isAwaiting = awaiting && !step.result && isWrite;
  const isRunning = active && !step.result;

  return (
    <div className={cn("py-1 flex flex-col", (isRunning || isAwaiting) && "bg-primary/5 rounded-md -mx-1 px-1")}>
      <div className="flex items-start gap-2 w-full">
        <div className="mt-0.5 size-4 shrink-0 flex items-center justify-center">
          {isRunning ? (
            <Loader2 className="size-3.5 animate-spin text-primary" />
          ) : isAwaiting ? (
            <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
          ) : isFailed ? (
            <XCircle className="size-3.5 text-destructive" />
          ) : (
            <Check className="size-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[13px]", isRunning ? "text-primary font-medium" : "text-foreground")}>
              {toolLabel(step.call.name)}
            </span>
            {workItemMeta?.type ? (
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border tracking-wide",
                  workItemMeta.type === "BUG"
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                    : workItemMeta.type === "STORY"
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                      : workItemMeta.type === "EPIC"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                        : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                )}
              >
                {workItemMeta.type}
              </span>
            ) : null}
            {workItemMeta?.priority ? (
              <span
                className={cn(
                  "text-[10px] font-medium uppercase px-1.5 py-0.5 rounded border",
                  workItemMeta.priority === "URGENT" || workItemMeta.priority === "HIGH"
                    ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                    : "bg-muted text-muted-foreground border-border"
                )}
              >
                {workItemMeta.priority}
              </span>
            ) : null}
            {argHint ? (
              <span className="text-[11px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded max-w-[260px] truncate">
                {argHint}
              </span>
            ) : null}
            {hasDetails ? (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted transition-colors cursor-pointer"
                title="View parameters and result"
              >
                <span>{expanded ? "Hide details" : "View details"}</span>
                <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} />
              </button>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 break-words">
            {isAwaiting
              ? "Needs your approval"
              : sanitizeAssistantVisible(step.event?.title || summary.detail)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] shrink-0 text-muted-foreground">
          {isRunning ? (
            <span className="text-primary font-medium">Running</span>
          ) : isAwaiting ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium">Pending</span>
          ) : isFailed ? (
            <span className="text-destructive font-medium">Failed</span>
          ) : null}
        </div>
      </div>

      {expanded && hasDetails ? (
        <div className="mt-3 ml-7 flex flex-col gap-2.5 p-3 bg-muted/30 border border-border/70 rounded-lg text-xs">
          {formattedArgsString.trim() ? (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider flex items-center justify-between">
                <span>Parameters</span>
                <button
                  type="button"
                  onClick={() => handleCopy(formattedArgsString, "query")}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/80 transition-colors"
                >
                  <Copy className="size-3" />
                  <span>{copiedQuery ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre className="p-2.5 bg-background/90 border border-border rounded text-[11px] overflow-x-auto text-foreground whitespace-pre-wrap break-all max-h-56 font-mono">
                {formattedArgsString}
              </pre>
            </div>
          ) : null}

          {formattedResultString.trim() ? (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider flex items-center justify-between">
                <span>Result</span>
                <div className="flex items-center gap-1">
                  {hasRichTable ? (
                    <button
                      type="button"
                      onClick={() => setShowRaw((value) => !value)}
                      className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/80 transition-colors"
                    >
                      {showRaw ? "Table" : "Raw"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleCopy(formattedResultString, "result")}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/80 transition-colors"
                  >
                    <Copy className="size-3" />
                    <span>{copiedResult ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>
              {isList && listRows.length > 0 && !showRaw ? (
                <AgentWorkItemTable
                  rows={listRows}
                  lookup={workItems}
                  workspaceId={workspaceId}
                  projectId={projectId}
                />
              ) : isMemberList && memberRows.length > 0 && !showRaw ? (
                <AgentMemberTable
                  rows={memberRows}
                  lookup={members}
                  workspaceId={workspaceId}
                />
              ) : (
                <pre
                  className={cn(
                    "p-2.5 bg-background/90 border border-border rounded text-[11px] overflow-x-auto whitespace-pre-wrap break-all max-h-56 font-mono",
                    summary.ok ? "text-foreground" : "text-destructive border-destructive/30 bg-destructive/5"
                  )}
                >
                  {formattedResultString}
                </pre>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepsCard({
  lead,
  steps,
  running,
  awaiting,
  workItems,
  members,
  workspaceId,
  projectId,
}: {
  lead?: AgentChatMessage;
  steps: TranscriptStep[];
  running: boolean;
  awaiting?: boolean;
  workItems?: Map<string, AgentWorkItem>;
  members?: Map<string, AgentMember>;
  workspaceId?: string;
  projectId?: string;
}) {
  const [open, setOpen] = useState(Boolean(running || awaiting));
  const last = steps[steps.length - 1];
  const inProgress = (running || awaiting) && last && !last.result;
  const leadVisible = sanitizeAssistantVisible(lead?.content ?? "");
  const visibleSteps = steps.filter((step) => !isRepeatedToolResult(step.result?.content));
  const skipped = steps.length - visibleSteps.length;
  const doneCount = visibleSteps.filter((step) => step.result).length;

  useEffect(() => {
    if (running || awaiting) setOpen(true);
  }, [running, awaiting]);

  if (!visibleSteps.length && !leadVisible) return null;

  return (
    <div className="min-w-0 max-w-[46rem] flex flex-col gap-2">
      {leadVisible ? (
        <MarkdownContent
          content={leadVisible}
          workItems={workItems}
          members={members}
          workspaceId={workspaceId}
          projectId={projectId}
        />
      ) : null}
      <TruncationNote content={lead?.content} />
      {visibleSteps.length ? (
        <div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {inProgress ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <CheckCircle2 className="size-3.5 text-muted-foreground" />
            )}
            <span>
              {awaiting
                ? "Waiting for approval"
                : inProgress
                  ? `Using tools · ${doneCount}/${visibleSteps.length}`
                  : `${visibleSteps.length} ${visibleSteps.length === 1 ? "tool" : "tools"}`}
              {skipped ? ` · ${skipped} skipped` : ""}
            </span>
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          {open ? (
            <div className="mt-1 ml-1 pl-3 border-l border-border/80">
              {visibleSteps.map((step, index) => {
                const active = inProgress && index === visibleSteps.length - 1 && !step.result;
                return (
                  <StepRow
                    key={step.call.id || `${step.call.name}-${index}`}
                    step={step}
                    active={active}
                    awaiting={awaiting}
                    workItems={workItems}
                    members={members}
                    workspaceId={workspaceId}
                    projectId={projectId}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActivityLines({ events }: { events: AgentToolEvent[] }) {
  const visible = events.filter((event) => !isHiddenActivityEvent(event));
  if (!visible.length) return null;
  return (
    <div className="min-w-0 max-w-[46rem] space-y-1">
      {visible.map((event) => {
        const failed = event.type === "error" || /fail/i.test(event.title);
        const subagent = event.type.startsWith("subagent_");
        const waiting = event.type === "subagent_progress" || event.type === "subagent_started";
        return (
          <div key={event.id} className="flex items-start gap-2 text-[12.5px]">
            {failed ? (
              <XCircle className="size-3.5 mt-0.5 text-destructive shrink-0" />
            ) : waiting ? (
              <Loader2 className="size-3.5 mt-0.5 animate-spin text-primary shrink-0" />
            ) : subagent ? (
              <Users className="size-3.5 mt-0.5 text-primary shrink-0" />
            ) : (
              <Check className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
            )}
            <p className={cn("leading-relaxed", failed ? "text-destructive" : "text-muted-foreground")}>
              <span className={failed ? "font-medium" : "text-foreground/80"}>{event.title}</span>
              {event.detail ? <span> — {event.detail}</span> : null}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function AgentChatThread({
  run,
  compact,
  sending,
  isAccepting,
  isDenying,
  onSendEdit,
  onPickChoice,
  onConfirm,
  onDeny,
}: {
  run: AgentRun;
  compact?: boolean;
  sending?: boolean;
  isAccepting?: boolean;
  isDenying?: boolean;
  onSendEdit: (content: string) => void;
  onPickChoice: (choice: string) => void;
  onConfirm: () => void;
  onDeny: () => void;
}) {
  const { data: context } = useGetAgentContext();
  const { data: harness } = useGetAgentHarness();
  const messages = useMemo(() => run.messages ?? [], [run.messages]);
  const events = useMemo(() => run.events ?? [], [run.events]);
  const running = run.status === "running";
  const awaiting = run.status === "awaiting_confirmation";
  const awaitingPlugin = run.status === "awaiting_plugin";
  const failedOrStopped = run.status === "failed" || run.status === "stopped";
  const turns = useMemo(() => groupConversationTurns(messages, events), [messages, events]);
  const blocks = useMemo(() => {
    const list: TranscriptBlock[] = [];
    for (const turn of turns) {
      if (turn.user) list.push({ kind: "user" as const, message: turn.user });
      list.push(...turn.blocks);
    }
    return list;
  }, [turns]);
  const workItems = useMemo(() => collectWorkItemLookup(messages), [messages]);
  const members = useMemo(() => collectMemberLookup(messages), [messages]);
  const boardProject = useMemo(
    () => withWorkspaceFallback(extractBoardProject(messages), run.workspaceId),
    [messages, run.workspaceId],
  );
  const kanbanCtas = useMemo(
    () => kanbanCtasForBlocks(blocks, run.workspaceId, boardProject),
    [blocks, run.workspaceId, boardProject],
  );
  const lastAssistantId = [...turns]
    .reverse()
    .flatMap((turn) => turn.blocks)
    .find((block) => block.kind === "assistant");
  const lastAssistantMessageId = lastAssistantId?.kind === "assistant" ? lastAssistantId.message.id : undefined;
  const lastTurn = turns[turns.length - 1];
  const lastTurnLive = Boolean(lastTurn && (running || awaiting || awaitingPlugin));
  const showLiveThinking =
    lastTurnLive &&
    !awaiting &&
    !awaitingPlugin &&
    !lastTurn?.blocks.some((block) => block.kind === "assistant" && sanitizeAssistantVisible(block.message.content));
  const pending =
    findPendingConfirmation(events, messages) ??
    (awaiting
      ? {
          calls: [],
          summary: "The agent is waiting for your approval to proceed with the planned actions.",
        }
      : undefined);
  const pendingPlugin = findPendingPlugin(events);
  const effectiveProjectId = run.projectId || harness?.settings.defaultProjectId;
  const project = context?.projects.find((item) => item.id === effectiveProjectId);
  const linkedRepo = (context?.githubRepos ?? []).find((item) => item.projectId === project?.id);
  const currentAction = [...events].reverse().find(
    (event) => event.type !== "context_meter" && event.type !== "confirmation_resolved",
  );

  let blockIndex = -1;

  return (
    <div className={cn("max-w-3xl mx-auto flex flex-col", compact ? "gap-5" : "gap-7")}>
      {project && !linkedRepo ? (
        <GitHubOptionalPrompt projectId={project.id} workspaceId={project.workspaceId} />
      ) : null}

      {turns.map((turn, turnIndex) => {
        const isLast = turnIndex === turns.length - 1;
        const turnRunning = isLast && lastTurnLive;
        const thinkingLive = isLast && showLiveThinking;
        if (turn.user) blockIndex += 1;
        const userCta = turn.user ? kanbanCtas.get(blockIndex) : undefined;

        return (
          <div key={turn.user?.id ?? `turn-${turnIndex}`} className="flex flex-col gap-3">
            {turn.user ? (
              <UserBubble
                message={turn.user}
                canEdit={!running && !awaiting && !sending}
                onSendEdit={onSendEdit}
                compact={compact}
              />
            ) : null}
            {userCta ? (
              <ProjectKanbanCta
                workspaceId={userCta.workspaceId}
                projectId={userCta.projectId}
                name={userCta.name}
              />
            ) : null}

            {turn.thoughts.length || thinkingLive ? (
              <ThinkingBlock
                thoughts={turn.thoughts}
                startedAt={turn.startedAt}
                endedAt={turn.endedAt}
                live={Boolean(thinkingLive)}
                keepOpen={isLast && failedOrStopped}
              />
            ) : null}

            {turn.blocks.map((block) => {
              blockIndex += 1;
              const kanban = kanbanCtas.get(blockIndex);
              const cta = kanban ? (
                <ProjectKanbanCta
                  workspaceId={kanban.workspaceId}
                  projectId={kanban.projectId}
                  name={kanban.name}
                />
              ) : null;
              if (block.kind === "assistant") {
                return (
                  <div key={block.message.id} className="flex flex-col gap-3">
                    <AgentBubble
                      message={block.message}
                      workItems={workItems}
                      members={members}
                      workspaceId={run.workspaceId}
                      projectId={run.projectId}
                      choicesEnabled={!running && !awaiting && !awaitingPlugin && block.message.id === lastAssistantMessageId}
                      onPickChoice={onPickChoice}
                    />
                    {cta}
                  </div>
                );
              }
              const isCurrentSteps = isLast && block === turn.blocks.filter((item) => item.kind === "steps").at(-1);
              return (
                <div key={block.lead?.id ?? `steps-${turnIndex}-${blockIndex}`} className="flex flex-col gap-3">
                  <StepsCard
                    lead={block.lead}
                    steps={block.steps}
                    running={turnRunning && isCurrentSteps}
                    awaiting={awaiting && isCurrentSteps}
                    workItems={workItems}
                    members={members}
                    workspaceId={run.workspaceId}
                    projectId={run.projectId}
                  />
                  {cta}
                </div>
              );
            })}

            <ActivityLines events={turn.activity} />

            {isLast && turnRunning && currentAction && currentAction.type !== "thought" && currentAction.type !== "llm_usage" ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span>{currentAction.title}</span>
              </div>
            ) : null}

            {turn.usage.some((event) => event.type === "llm_usage" || event.type === "context_meter") ? (
              <AgentTurnUsageCard events={turn.usage} live={Boolean(isLast && turnRunning)} />
            ) : null}
          </div>
        );
      })}

      {awaitingPlugin && pendingPlugin ? (
        <PluginConnectCard pending={pendingPlugin} runId={run.id} />
      ) : null}

      {awaiting && pending ? (
        <PendingConfirmationCard
          pending={pending}
          workspaceId={run.workspaceId}
          projectId={run.projectId}
          onAccept={onConfirm}
          onDeny={onDeny}
          isAccepting={Boolean(isAccepting)}
          isDenying={Boolean(isDenying)}
        />
      ) : null}

      {run.error || (failedOrStopped && !run.error && lastTurn && !lastTurn.blocks.some((block) => block.kind === "assistant")) ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {run.error || (run.status === "stopped" ? "Stopped. Work done so far is kept above." : "This turn ended before a reply.")}
        </div>
      ) : run.status === "stopped" ? (
        <p className="text-[13px] text-muted-foreground">Stopped. Work done so far is kept above.</p>
      ) : null}

      <div aria-hidden className={cn("shrink-0", compact ? "h-2" : "h-56")} />
    </div>
  );
}
