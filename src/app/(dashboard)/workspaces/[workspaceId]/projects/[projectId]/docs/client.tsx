"use client";

import {
  BookOpen,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/page-loader";
import { PageError } from "@/components/page-error";

import { useProjectId } from "@/features/projects/hooks/use-project-id";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";
import { useGetProject } from "@/features/projects/api/use-get-project";
import { DocumentList } from "@/features/project-docs/components";
import { GitHubOptionalPrompt } from "@/features/github-integration/components";

export const ProjectDocsClient = () => {
  const projectId = useProjectId();
  const workspaceId = useWorkspaceId();

  const { data: project, isLoading: isLoadingProject } = useGetProject({ projectId });

  if (isLoadingProject) {
    return <PageLoader />;
  }

  if (!project) {
    return <PageError message="Project not found." />;
  }

  return (
    <div className="flex flex-col gap-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="mb-3">
          <div className="flex items-center gap-2 ">
            <h1 className="text-2xl font-semibold tracking-tight">Project Documents</h1>
            <Badge variant="secondary" className="text-xs">
              {project.name}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage PRD, FRD, and other project documentation
          </p>
        </div>
      </div>

      <GitHubOptionalPrompt projectId={projectId} workspaceId={workspaceId} />

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
        <Card className="border-border bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-500" />
              Product Requirements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Upload PRD documents to define product features, user stories, and acceptance criteria.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-purple-500" />
              Functional Specs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Store FRD and technical specifications for development reference.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              AI Integration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Documents are automatically analyzed by AI for context-aware assistance.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Document List */}
      <DocumentList projectId={projectId} workspaceId={workspaceId} />
    </div>
  );
};
