"use client";

import { Download, FileText, FileType } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { DownloadDocumentFormat } from "../lib/document-file";

interface DocumentDownloadMenuProps {
  disabled?: boolean;
  onSelect: (format: DownloadDocumentFormat) => void;
  triggerClassName?: string;
  iconOnly?: boolean;
}

export function DocumentDownloadMenu({
  disabled,
  onSelect,
  triggerClassName,
  iconOnly = true,
}: DocumentDownloadMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={iconOnly ? "icon" : "sm"}
          className={triggerClassName}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
        >
          <Download className={iconOnly ? "h-3.5 w-3.5" : "h-3.5 w-3.5 mr-1"} />
          {iconOnly ? null : "Download"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem className="text-xs" onClick={() => onSelect("md")}>
          <FileText className="h-3.5 w-3.5 mr-2" />
          Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" onClick={() => onSelect("pdf")}>
          <FileType className="h-3.5 w-3.5 mr-2" />
          PDF (.pdf)
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs" onClick={() => onSelect("docx")}>
          <FileType className="h-3.5 w-3.5 mr-2" />
          Word document (.docx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
