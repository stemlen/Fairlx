"use client";

import { useState } from "react";
import {
  FileText,
  Search,
  FolderOpen,
  Loader2,
  Upload,
  Download,
  Trash2,
  CheckSquare,
  Square,
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

import { DocumentCard } from "./document-card";
import { DocumentUploadModal } from "./document-upload-modal";
import { DocumentEditModal } from "./document-edit-modal";
import { DocumentReplaceModal } from "./document-replace-modal";

import { useGetProjectDocuments, useDeleteProjectDocument, useDownloadDocument } from "../api/use-project-docs";
import {
  PopulatedProjectDocument,
  DocumentCategory,
  DOCUMENT_CATEGORY_LABELS,
} from "../types";
import { formatFileSize, MAX_TOTAL_PROJECT_SIZE } from "../schemas";
import { useConfirm } from "@/hooks/use-confirm";

interface DocumentListProps {
  projectId: string;
  workspaceId: string;
}

type SortOption = "newest" | "oldest" | "name" | "size";

export const DocumentList = ({ projectId, workspaceId }: DocumentListProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal states
  const [editDocument, setEditDocument] = useState<PopulatedProjectDocument | null>(null);
  const [replaceDocument, setReplaceDocument] = useState<PopulatedProjectDocument | null>(null);

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
        doc.name.toLowerCase().includes(query) ||
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
          return a.name.localeCompare(b.name);
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

  const handleBulkDownload = () => {
    if (selectedIds.size === 0) return;

    const docsToDownload = filteredDocuments.filter(doc => selectedIds.has(doc.$id));
    docsToDownload.forEach(doc => {
      downloadDocument({
        documentId: doc.$id,
        workspaceId,
        fileName: doc.name,
      });
    });

    toast.success(`Downloading ${docsToDownload.length} document(s)...`);
  };

  const isAllSelected = filteredDocuments.length > 0 && selectedIds.size === filteredDocuments.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < filteredDocuments.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-[#1269d6]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <FileText className="h-8 w-8 text-gray-300 mb-3" />
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Failed to load documents</h3>
        <p className="text-xs font-light text-gray-500">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search & Filters Bar - Inspired by screenshot */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
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
            className="h-3.5 w-3.5 border-gray-300 data-[state=checked]:bg-[#1269d6] data-[state=checked]:border-[#1269d6]"
          />
          <Label htmlFor="includeArchived" className="text-xs font-light text-gray-500 cursor-pointer">
            Archived
          </Label>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] border p-2.5 rounded-md font-light text-muted-foreground">
            {formatFileSize(stats?.totalSize || 0)} / {formatFileSize(MAX_TOTAL_PROJECT_SIZE)}
          </span>
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
        </div>
      </div>

      {/* Documents Section Header */}
      <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
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
          <h2 className="text-sm font-medium text-gray-900 dark:text-white">
            All documents
            <span className="ml-2 text-xs font-light text-gray-400">({stats?.totalDocuments || 0})</span>
          </h2>
        </div>

        {/* Bulk Actions - Show when items are selected */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-light text-gray-500">
              {selectedIds.size} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-gray-600 hover:text-[#1269d6] hover:bg-[#1269d6]/10"
              onClick={handleBulkDownload}
              disabled={isDownloading}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-gray-600 hover:text-red-500 hover:bg-red-50"
              onClick={handleBulkDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <DeleteConfirmDialog />

      {/* Document List - Table-like view inspired by screenshot */}
      {filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-10 w-10 text-gray-200 mb-3" />
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">No documents found</h3>
          <p className="text-xs font-light text-gray-500 mt-1 mb-4">
            {searchQuery
              ? "Try adjusting your search query"
              : "Upload your first document to get started"}
          </p>
          {!searchQuery && (
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
              onEdit={setEditDocument}
              onReplace={setReplaceDocument}
              isSelected={selectedIds.has(doc.$id)}
              onSelect={() => handleSelectOne(doc.$id)}
              isLast={index === filteredDocuments.length - 1}
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
    </div>
  );
};
