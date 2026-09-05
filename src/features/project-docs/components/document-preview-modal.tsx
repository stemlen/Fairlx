"use client";

import { useMemo, useState } from "react";
import {
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useDownloadDocument, useGetProjectDocument } from "../api/use-project-docs";
import { PopulatedProjectDocument, DOCUMENT_CATEGORY_LABELS, DocumentCategory } from "../types";
import { formatFileSize, getFileExtensionLabel, isPreviewable } from "../schemas";
import { documentBody, isMarkdownDocument } from "../lib/document-file";
import { DocumentDownloadMenu } from "./document-download-menu";
import { DocumentMarkdown } from "./document-markdown";

interface DocumentPreviewModalProps {
  document: PopulatedProjectDocument;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DocumentPreviewModal = ({
  document,
  workspaceId,
  open,
  onOpenChange,
}: DocumentPreviewModalProps) => {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { mutate: downloadDocument, isPending: isDownloading } = useDownloadDocument();
  const { data, isLoading } = useGetProjectDocument(open ? document.$id : "", workspaceId);
  const fullDocument = data?.data ?? document;

  const markdown = useMemo(() => documentBody(fullDocument), [fullDocument]);
  const canRenderMarkdown = isMarkdownDocument(fullDocument) && Boolean(markdown);
  const canPreviewMedia = isPreviewable(fullDocument.mimeType) && Boolean(fullDocument.url);
  const isImage = fullDocument.mimeType.startsWith("image/");
  const isPDF = fullDocument.mimeType === "application/pdf";

  const handleDownload = (format: "md" | "pdf" | "docx") => {
    downloadDocument({
      documentId: document.$id,
      workspaceId,
      fileName: document.title,
      format,
    });
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const renderPreview = () => {
    if (isLoading && !markdown && !fullDocument.url) {
      return (
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (canRenderMarkdown) {
      return (
        <div className="h-full overflow-auto bg-[#f7f6f3] dark:bg-zinc-950">
          <DocumentMarkdown markdown={markdown} />
        </div>
      );
    }

    if (isImage && fullDocument.url) {
      return (
        <div className="flex h-full items-center justify-center overflow-auto p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullDocument.url}
            alt={document.title}
            style={{
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transition: "transform 0.2s ease",
              maxWidth: zoom === 100 ? "100%" : "none",
              maxHeight: zoom === 100 ? "100%" : "none",
            }}
            className="object-contain"
          />
        </div>
      );
    }

    if (isPDF && fullDocument.url) {
      return (
        <iframe
          src={`${fullDocument.url}#toolbar=0`}
          className="h-full w-full border-0"
          title={document.title}
        />
      );
    }

    if (canPreviewMedia && fullDocument.url) {
      return (
        <iframe
          src={fullDocument.url}
          className="h-full w-full border-0 bg-background"
          title={document.title}
        />
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center py-12">
        <FileText className="mb-4 h-16 w-16 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">Preview not available</h3>
        <p className="mb-4 text-sm text-muted-foreground">Download this file to view it.</p>
        <DocumentDownloadMenu
          disabled={isDownloading}
          onSelect={handleDownload}
          iconOnly={false}
          triggerClassName="h-9 px-3 text-xs"
        />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`
          ${isFullscreen ? "max-w-full w-full h-full m-0 rounded-none" : "max-w-5xl sm:max-w-5xl h-[88vh]"}
          flex flex-col p-0
        `}
      >
        <DialogHeader className="flex-shrink-0 border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <DialogTitle className="truncate text-base">{document.title}</DialogTitle>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {DOCUMENT_CATEGORY_LABELS[document.category as DocumentCategory]}
                  </Badge>
                  <span>v{document.version}</span>
                  <span>•</span>
                  <span>{getFileExtensionLabel(document.mimeType)}</span>
                  <span>•</span>
                  <span>{formatFileSize(document.size)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {isImage && (
                <>
                  <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom Out">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="w-12 text-center text-xs text-muted-foreground">{zoom}%</span>
                  <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom In">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleRotate} title="Rotate">
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <div className="mx-1 h-6 w-px bg-border" />
                </>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>

              {fullDocument.url && (
                <Button variant="ghost" size="icon" asChild title="Open in New Tab">
                  <a href={fullDocument.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}

              <DocumentDownloadMenu
                disabled={isDownloading}
                onSelect={handleDownload}
                triggerClassName="h-8 w-8 text-muted-foreground hover:text-foreground"
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-[#f7f6f3] dark:bg-zinc-950">{renderPreview()}</div>
      </DialogContent>
    </Dialog>
  );
};
