"use client";

import { 
  FileText, 
  MoreVertical, 
  Download, 
  Trash2, 
  Pencil, 
  Archive,
  RefreshCw,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { PopulatedProjectDocument, DOCUMENT_CATEGORY_LABELS, DocumentCategory } from "../types";
import { formatFileSize, getFileExtensionLabel } from "../schemas";
import { useDeleteProjectDocument, useDownloadDocument, useUpdateProjectDocument } from "../api/use-project-docs";
import { useConfirm } from "@/hooks/use-confirm";

interface DocumentCardProps {
  document: PopulatedProjectDocument;
  workspaceId: string;
  projectId: string;
  onEdit?: (document: PopulatedProjectDocument) => void;
  onReplace?: (document: PopulatedProjectDocument) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  isLast?: boolean;
}

export const DocumentCard = ({
  document,
  workspaceId,
  projectId,
  onEdit,
  onReplace,
  isSelected = false,
  onSelect,
  isLast = false,
}: DocumentCardProps) => {
  const [ConfirmDialog, confirmDelete] = useConfirm(
    "Delete Document",
    `Are you sure you want to delete "${document.name}"? This action cannot be undone.`,
    "destructive"
  );

  const { mutate: deleteDocument, isPending: isDeleting } = useDeleteProjectDocument();
  const { mutate: downloadDocument, isPending: isDownloading } = useDownloadDocument();
  const { mutate: updateDocument, isPending: isUpdating } = useUpdateProjectDocument();

  const handleDelete = async () => {
    const ok = await confirmDelete();
    if (!ok) return;

    deleteDocument({
      documentId: document.$id,
      projectId,
      workspaceId,
    });
  };

  const handleDownload = () => {
    downloadDocument({
      documentId: document.$id,
      workspaceId,
      fileName: document.name,
    });
  };

  const handleArchive = () => {
    updateDocument({
      documentId: document.$id,
      projectId,
      isArchived: !document.isArchived,
    });
  };

  const handleOpenInNewTab = () => {
    if (document.url) {
      window.open(document.url, "_blank", "noopener,noreferrer");
    }
  };

  const getFileIcon = () => {
    const ext = getFileExtensionLabel(document.mimeType);
    const iconColors: Record<string, string> = {
      PDF: "bg-[#1269d6]/10 text-[#1269d6]",
      DOC: "bg-[#1269d6]/10 text-[#1269d6]",
      DOCX: "bg-[#1269d6]/10 text-[#1269d6]",
      XLS: "bg-emerald-50 text-emerald-600",
      XLSX: "bg-emerald-50 text-emerald-600",
      PPT: "bg-amber-50 text-amber-600",
      PPTX: "bg-amber-50 text-amber-600",
      PNG: "bg-violet-50 text-violet-600",
      JPG: "bg-violet-50 text-violet-600",
      MD: "bg-gray-100 text-gray-600",
      TXT: "bg-gray-100 text-gray-500",
    };
    return iconColors[ext] || "bg-gray-100 text-gray-400";
  };

  const getFileTypeBadge = () => {
    const ext = getFileExtensionLabel(document.mimeType);
    const typeColors: Record<string, string> = {
      PDF: "bg-[#1269d6]",
      DOC: "bg-[#1269d6]",
      DOCX: "bg-[#1269d6]",
      XLS: "bg-emerald-500",
      XLSX: "bg-emerald-500",
      PPT: "bg-amber-500",
      PPTX: "bg-amber-500",
      PNG: "bg-violet-500",
      JPG: "bg-violet-500",
      MD: "bg-gray-500",
      TXT: "bg-gray-500",
    };
    return typeColors[ext] || "bg-gray-500";
  };

  const getUserInitials = () => {
    if (!document.uploader?.name) return "U";
    return document.uploader.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <>
      <ConfirmDialog />
      {/* Table-row style layout inspired by screenshot */}
      <div 
        className={`group flex items-center gap-4 py-3.5 px-4 transition-colors cursor-pointer ${
          isSelected 
            ? "bg-[#1269d6]/5" 
            : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
        } ${!isLast ? "border-b border-gray-100 dark:border-gray-800" : ""}`}
        onClick={handleOpenInNewTab}
      >
        {/* Checkbox for selection */}
        <div className="w-5 flex-shrink-0">
          <input 
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-gray-300 text-[#1269d6] focus:ring-[#1269d6]/20 cursor-pointer"
          />
        </div>

        {/* File Icon/Thumbnail */}
        <div className={`w-10 h-12 rounded-md flex items-center justify-center flex-shrink-0 ${getFileIcon()}`}>
          <FileText className="h-5 w-5" />
        </div>

        {/* File Name */}
        <div className="flex-1 min-w-[150px]">
          <p className="text-xs font-medium text-gray-900 dark:text-white truncate" title={document.name}>
            {document.name}
          </p>
        </div>

        {/* File Type Badge */}
        <div className="w-14 flex-shrink-0">
          <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium text-white rounded ${getFileTypeBadge()}`}>
            {getFileExtensionLabel(document.mimeType)}
          </span>
        </div>

        {/* File Size */}
        <div className="w-16 flex-shrink-0">
          <span className="text-xs font-light text-gray-500">{formatFileSize(document.size)}</span>
        </div>

        {/* Uploader */}
        <div className="flex items-center gap-2 w-40 flex-shrink-0">
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarFallback className="text-[10px] font-medium bg-[#1269d6]/10 text-[#1269d6]">
              {getUserInitials()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
              {document.uploader?.name || "Unknown"}
            </p>
            <p className="text-[10px] font-light text-gray-400 truncate">
              {formatDistanceToNow(new Date(document.$createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>

        {/* Category Tag */}
        <div className="w-32 flex-shrink-0">
          <Badge 
            variant="outline" 
            className="text-[10px] font-light text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 gap-1 py-0.5"
          >
            {DOCUMENT_CATEGORY_LABELS[document.category as DocumentCategory] || "Other"}
            {document.isArchived && (
              <span className="text-amber-500">• Archived</span>
            )}
            <button 
              className="ml-0.5 hover:text-gray-900 dark:hover:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-[#1269d6] hover:bg-[#1269d6]/10"
                  onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                  disabled={isDownloading}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Download</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50"
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Delete</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-400 hover:text-gray-600"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(document); }} className="text-xs">
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onReplace?.(document); }} className="text-xs">
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Replace File
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleArchive(); }} disabled={isUpdating} className="text-xs">
                <Archive className="h-3.5 w-3.5 mr-2" />
                {document.isArchived ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
};
