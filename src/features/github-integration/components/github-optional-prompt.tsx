"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useGetRepository } from "../api/use-github";
import { ConnectRepository } from "./connect-repository";

const storageKey = (projectId: string) => `fairlx:skip-github:${projectId}`;

function useSkipGithubPrompt(projectId?: string) {
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    setSkipped(window.localStorage.getItem(storageKey(projectId)) === "1");
  }, [projectId]);

  const skip = () => {
    if (!projectId || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey(projectId), "1");
    setSkipped(true);
  };

  return { skipped, skip };
}

export function GitHubAddOneButton({
  projectId,
  workspaceId,
  className,
}: {
  projectId: string;
  workspaceId: string;
  className?: string;
}) {
  const { isProjectAdmin, isLoading } = useProjectPermissions({ projectId, workspaceId });
  const settingsHref = `/workspaces/${workspaceId}/projects/${projectId}/settings?tab=integrations`;

  if (isLoading) return null;

  if (isProjectAdmin) {
    return (
      <ConnectRepository
        projectId={projectId}
        canManage
        trigger={
          <Button type="button" size="sm" className={cn("h-8 px-3 text-xs font-semibold", className)}>
            Add one
          </Button>
        }
      />
    );
  }

  return (
    <Button type="button" size="sm" className={cn("h-8 px-3 text-xs font-semibold", className)} asChild>
      <Link href={settingsHref}>Add one</Link>
    </Button>
  );
}

export function GitHubOptionalPrompt({
  projectId,
  workspaceId,
  compact = false,
}: {
  projectId: string;
  workspaceId: string;
  compact?: boolean;
}) {
  const { data: repository, isLoading } = useGetRepository(projectId);
  const { skipped, skip } = useSkipGithubPrompt(projectId);

  if (!projectId || isLoading || repository || skipped) return null;

  const docsHref = `/workspaces/${workspaceId}/projects/${projectId}/docs`;

  if (compact) {
    return (
      <div className="rounded-lg border border-border bg-sidebar-accent/40 px-3 py-2.5 space-y-2">
        <p className="text-[11px] font-semibold text-foreground">No GitHub repo</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Optional. Skip code analysis if you have not created a repository yet.
        </p>
        <div className="flex items-center gap-2">
          <GitHubAddOneButton projectId={projectId} workspaceId={workspaceId} className="h-7 px-2.5" />
          <button
            type="button"
            onClick={skip}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Github className="h-4 w-4 text-foreground" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">No GitHub repo yet</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Code analysis is optional. If you planned sprints but have not created a repository, skip it — the
              agent will still write PRD, FRD, user stories, and guides from Fairlx. Technical and API docs wait
              until you add a repo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GitHubAddOneButton projectId={projectId} workspaceId={workspaceId} />
            <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={skip}>
              Skip for now
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-xs" asChild>
              <Link href={docsHref}>Project docs</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
