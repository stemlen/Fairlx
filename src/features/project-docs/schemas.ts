import { z } from "zod";
import { DocumentCategory } from "./types";

// Maximum total file size per project: 10MB
export const MAX_TOTAL_PROJECT_SIZE = 10 * 1024 * 1024; // 10MB

// Maximum individual file size: 5MB
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Allowed document types (primarily office documents and PDFs)
export const ALLOWED_DOCUMENT_TYPES = [
  // PDF
  "application/pdf",
  // Microsoft Office
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text/Markdown
  "text/plain",
  "text/markdown",
  "text/csv",
  // Rich Text
  "application/rtf",
  // Open Document Format
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  // Images (for diagrams/screenshots)
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // JSON/XML (for API docs, configs)
  "application/json",
  "application/xml",
  "text/xml",
];

// File extensions mapping for display
export const FILE_EXTENSION_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "text/plain": "TXT",
  "text/markdown": "MD",
  "text/csv": "CSV",
  "application/rtf": "RTF",
  "application/vnd.oasis.opendocument.text": "ODT",
  "application/vnd.oasis.opendocument.spreadsheet": "ODS",
  "application/vnd.oasis.opendocument.presentation": "ODP",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
  "image/svg+xml": "SVG",
  "application/json": "JSON",
  "application/xml": "XML",
  "text/xml": "XML",
};

// Previewable types (can be displayed inline)
export const PREVIEWABLE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
];

// Create document schema
export const createProjectDocumentSchema = z.object({
  title: z.string().trim().min(1, "Document title is required").max(255, "Title too long"),
  description: z.string().trim().max(1000, "Description too long").optional(),
  projectId: z.string().trim().min(1, "Project ID is required"),
  workspaceId: z.string().trim().min(1, "Workspace ID is required"),
  category: z.nativeEnum(DocumentCategory),
  version: z.string().trim().max(50, "Version too long").default("1.0"),
  tags: z.array(z.string().trim().max(50)).max(10).optional(),
});

// Update document schema
export const updateProjectDocumentSchema = z.object({
  documentId: z.string().trim().min(1, "Document ID is required"),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  category: z.nativeEnum(DocumentCategory).optional(),
  version: z.string().trim().max(50).optional(),
  tags: z.array(z.string().trim().max(50)).max(10).optional(),
  isArchived: z.boolean().optional(),
});

// Delete document schema
export const deleteProjectDocumentSchema = z.object({
  documentId: z.string().trim().min(1, "Document ID is required"),
  workspaceId: z.string().trim().min(1, "Workspace ID is required"),
});

export const downloadProjectDocumentSchema = z.object({
  workspaceId: z.string().trim().min(1, "Workspace ID is required"),
  format: z.enum(["md", "pdf", "docx"]).optional(),
});

// Get documents schema
export const getProjectDocumentsSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required"),
  workspaceId: z.string().trim().min(1, "Workspace ID is required"),
  category: z.nativeEnum(DocumentCategory).optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
});

// Upload document schema (for form validation)
export const uploadProjectDocumentSchema = z.object({
  file: z.any().refine((val) => val instanceof File, "File is required"),
  title: z.string().trim().min(1, "Document title is required").max(255),
  description: z.string().trim().max(1000).optional(),
  projectId: z.string().trim().min(1, "Project ID is required"),
  workspaceId: z.string().trim().min(1, "Workspace ID is required"),
  category: z.nativeEnum(DocumentCategory),
  version: z.string().trim().max(50).default("1.0"),
  tags: z.array(z.string().trim().max(50)).max(10).optional(),
});

// Replace document schema (upload new version)
export const replaceProjectDocumentSchema = z.object({
  documentId: z.string().trim().min(1, "Document ID is required"),
  file: z.any().refine((val) => val instanceof File, "File is required"),
  version: z.string().trim().max(50).optional(),
});

// Helper function to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Helper function to check if file is previewable
export function isPreviewable(mimeType: string): boolean {
  return PREVIEWABLE_TYPES.includes(mimeType);
}

// Helper function to get file extension label
export function getFileExtensionLabel(mimeType: string): string {
  return FILE_EXTENSION_LABELS[mimeType] || "FILE";
}

// Helper function to validate file
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds ${formatFileSize(MAX_FILE_SIZE)} limit` };
  }
  
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return { valid: false, error: "File type not allowed. Please upload documents, PDFs, or images." };
  }
  
  return { valid: true };
}
