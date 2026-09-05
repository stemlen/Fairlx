"use client";

import { useState } from "react";
import {
  FileText,
  Search,
  FolderOpen,
  Loader2,
  Upload,
  Trash2,
  CheckSquare,
  Square,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { DocumentCard } from "./document-card";
import { DocumentUploadModal } from "./document-upload-modal";
import { DocumentEditModal } from "./document-edit-modal";
import { DocumentReplaceModal } from "./document-replace-modal";
import { DocumentPreviewModal } from "./document-preview-modal";
import { DocumentDownloadMenu } from "./document-download-menu";

import { useGetProjectDocuments, useDeleteProjectDocument, useDownloadDocument } from "../api/use-project-docs";
import {
  PopulatedProjectDocument,
  DocumentCategory,
  DOCUMENT_CATEGORY_LABELS,
} from "../types";
import { formatFileSize, MAX_TOTAL_PROJECT_SIZE } from "../schemas";
import { useConfirm } from "@/hooks/use-confirm";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useCurrentMember } from "@/features/members/hooks/use-current-member";
import type { DownloadDocumentFormat } from "../lib/document-file";

interface DocumentListProps {
  projectId: string;
  workspaceId: string;
  readOnly?: boolean;
}

type SortOption = "newest" | "oldest" | "name" | "size";

export const DocumentList = ({ projectId, workspaceId, readOnly = false }: DocumentListProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal states
  const [editDocument, setEditDocument] = useState<PopulatedProjectDocument | null>(null);
  const [replaceDocument, setReplaceDocument] = useState<PopulatedProjectDocument | null>(null);
  const [previewDocument, setPreviewDocument] = useState<PopulatedProjectDocument | null>(null);

  // Permission hooks
  const {
    canViewProjectDocs,
    canCreateDocs,
    canEditDocs,
    canDeleteDocs,
    isProjectAdmin,
    isLoading: isLoadingPermissions,
  } = useProjectPermissions({ projectId, workspaceId });

  // Check if user is workspace admin (organization creator/admin)
  const { isAdmin } = useCurrentMember({ workspaceId });
  const isWorkspaceAdmin = isAdmin;

  // Effective permissions (admin OR project-level), overridden by readOnly
  const canView = readOnly || isWorkspaceAdmin || isProjectAdmin || canViewProjectDocs;
  const canCreate = readOnly ? false : (isWorkspaceAdmin || isProjectAdmin || canCreateDocs);
  const canEdit = readOnly ? false : (isWorkspaceAdmin || isProjectAdmin || canEditDocs);
  const canDelete = readOnly ? false : (isWorkspaceAdmin || isProjectAdmin || canDeleteDocs);

  // Bulk delete confirmation
  const [DeleteConfirmDialog, confirmBulkDelete] = useConfirm(
    "Delete Selected Documents",
    `Are you sure you want to delete ${selectedIds.size} document(s)? This action cannot be undone.`,
    "destructive"
  );

  const { mutate: deleteDocument, isPending: isDeleting } = useDeleteProjectDocument();
  const { mutate: downloadDocument, isPending: isDownloading } = useDownloadDocument();

  const { data, isLoading, error } = useGetProjectDocuments(
    projectId,
    workspaceId,
    {
      category: selectedCategory === "all" ? undefined : selectedCategory,
      includeArchived,
    }
  );

  const documents = data?.data || [];
  const stats = data?.stats;

  // Filter and sort documents
  const filteredDocuments = documents
    .filter((doc) => {
      // Hide archived documents unless "Show Archived" is checked
      if (!includeArchived && doc.isArchived) return false;

      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        doc.title.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime();
        case "oldest":
          return new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime();
        case "name":
          return a.title.localeCompare(b.title);
        case "size":
          return b.size - a.size;
        default:
          return 0;
      }
    });

  // Usage percentage calculation is available in stats if needed

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredDocuments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocuments.map(doc => doc.$id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    // Permission check
    if (!canDelete) {
      toast.error("You don't have permission to delete documents");
      return;
    }

    const ok = await confirmBulkDelete();
    if (!ok) return;

    const idsToDelete = Array.from(selectedIds);


    for (const docId of idsToDelete) {
      deleteDocument(
        { documentId: docId, projectId, workspaceId }
      );
    }

    setSelectedIds(new Set());
    toast.success(`Deleting ${idsToDelete.length} document(s)...`);
  };

  const handleBulkDownload = (format: DownloadDocumentFormat) => {
    if (selectedIds.size === 0) return;

    const docsToDownload = filteredDocuments.filter(doc => selectedIds.has(doc.$id));
    docsToDownload.forEach(doc => {
      downloadDocument({
        documentId: doc.$id,
        workspaceId,
        fileName: doc.title,
        format,
        silent: true,
      });
    });

    toast.success(`Downloading ${docsToDownload.length} document(s)...`);
  };

  const isAllSelected = filteredDocuments.length > 0 && selectedIds.size === filteredDocuments.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < filteredDocuments.length;

  if (isLoading || isLoadingPermissions) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/50 mb-3" />
        <h3 className="text-sm font-medium text-foreground">Failed to load documents</h3>
        <p className="text-xs font-light text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  // Permission denied view
  if (!canView) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You don&apos;t have permission to view project documents.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search & Filters Bar - Inspired by screenshot */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search documents"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs font-light bg-background border-border rounded-lg text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as DocumentCategory | "all")}>
          <SelectTrigger className="w-[180px] h-9 text-xs font-light bg-background border-border rounded-lg">
            <SelectValue placeholder="All categories" className="truncate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All categories</SelectItem>
            {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[130px] h-9 text-xs font-light bg-background border-border rounded-lg">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest" className="text-xs">Newest First</SelectItem>
            <SelectItem value="oldest" className="text-xs">Oldest First</SelectItem>
            <SelectItem value="name" className="text-xs">Name</SelectItem>
            <SelectItem value="size" className="text-xs">Size</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Checkbox
            id="includeArchived"
            checked={includeArchived}
            onCheckedChange={(checked) => setIncludeArchived(!!checked)}
            className="h-3.5 w-3.5 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <Label htmlFor="includeArchived" className="text-xs font-light text-muted-foreground cursor-pointer">
            Archived
          </Label>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] border p-2.5 rounded-md font-light text-muted-foreground">
            {formatFileSize(stats?.totalSize || 0)} / {formatFileSize(MAX_TOTAL_PROJECT_SIZE)}
          </span>
          {canCreate && (
            <DocumentUploadModal
              projectId={projectId}
              workspaceId={workspaceId}
              currentTotalSize={stats?.totalSize || 0}
              trigger={
                <Button className="h-9 px-4 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  Upload
                </Button>
              }
            />
          )}
        </div>
      </div>

      {/* Documents Section Header */}
      <div className="flex items-center justify-between py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSelectAll}
            className="flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
          >
            {isAllSelected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : isSomeSelected ? (
              <CheckSquare className="h-4 w-4 text-primary/50" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
          <h2 className="text-sm font-medium text-foreground">
            All documents
            <span className="ml-2 text-xs font-light text-muted-foreground">({stats?.totalDocuments || 0})</span>
          </h2>
        </div>

        {/* Bulk Actions - Show when items are selected */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-light text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <DocumentDownloadMenu
              disabled={isDownloading}
              onSelect={handleBulkDownload}
              iconOnly={false}
              triggerClassName="h-7 px-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10"
            />
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={handleBulkDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      <DeleteConfirmDialog />

      {/* Document List - Table-like view inspired by screenshot */}
      {filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <h3 className="text-sm font-medium text-foreground">No documents found</h3>
          <p className="text-xs font-light text-muted-foreground mt-1 mb-4">
            {searchQuery
              ? "Try adjusting your search query"
              : canCreate ? "Upload your first document to get started" : "No documents have been uploaded yet"}
          </p>
          {!searchQuery && canCreate && (
            <DocumentUploadModal
              projectId={projectId}
              workspaceId={workspaceId}
              currentTotalSize={stats?.totalSize || 0}
              trigger={
                <Button className="h-8 px-4 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload Document
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          {filteredDocuments.map((doc, index) => (
            <DocumentCard
              key={doc.$id}
              document={doc}
              workspaceId={workspaceId}
              projectId={projectId}
              onEdit={canEdit ? setEditDocument : undefined}
              onReplace={canEdit ? setReplaceDocument : undefined}
              onPreview={setPreviewDocument}
              isSelected={selectedIds.has(doc.$id)}
              onSelect={() => handleSelectOne(doc.$id)}
              isLast={index === filteredDocuments.length - 1}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {editDocument && (
        <DocumentEditModal
          document={editDocument}
          projectId={projectId}
          open={!!editDocument}
          onOpenChange={(open) => !open && setEditDocument(null)}
        />
      )}

      {replaceDocument && (
        <DocumentReplaceModal
          document={replaceDocument}
          projectId={projectId}
          workspaceId={workspaceId}
          open={!!replaceDocument}
          onOpenChange={(open) => !open && setReplaceDocument(null)}
        />
      )}
      {previewDocument && (
        <DocumentPreviewModal
          document={previewDocument}
          workspaceId={workspaceId}
          open={!!previewDocument}
          onOpenChange={(open) => !open && setPreviewDocument(null)}
        />
      )}
    </div>
  );
};
