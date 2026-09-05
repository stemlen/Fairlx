import { Models } from "node-appwrite";

// Document categories for PRD, FRD, and other project documentation
// Must match Appwrite enum values
export enum DocumentCategory {
  PRD = "prd",
  FRD = "frd",
  TECHNICAL_SPEC = "technical_spec",
  USER_STORIES = "user_stories",
  DESIGN_DOC = "design_doc",
  MEETING_NOTES = "meeting_notes",
  API_DOC = "api_doc",
  ARCHITECTURE = "architecture",
  TEST_PLAN = "test_plan",
  RELEASE_NOTES = "release_notes",
  USER_GUIDE = "user_guide",
  SRS = "srs",
  BRD = "brd",
  OTHER = "other",
}

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  [DocumentCategory.PRD]: "Product Requirements (PRD)",
  [DocumentCategory.FRD]: "Functional Requirements (FRD)",
  [DocumentCategory.TECHNICAL_SPEC]: "Technical Specifications",
  [DocumentCategory.USER_STORIES]: "User Stories",
  [DocumentCategory.DESIGN_DOC]: "Design Document",
  [DocumentCategory.MEETING_NOTES]: "Meeting Notes",
  [DocumentCategory.API_DOC]: "API Documentation",
  [DocumentCategory.ARCHITECTURE]: "Architecture",
  [DocumentCategory.TEST_PLAN]: "Test Plan",
  [DocumentCategory.RELEASE_NOTES]: "Release Notes",
  [DocumentCategory.USER_GUIDE]: "User Guide",
  [DocumentCategory.SRS]: "Software Requirements (SRS)",
  [DocumentCategory.BRD]: "Business Requirements (BRD)",
  [DocumentCategory.OTHER]: "Other",
};

export const DOCUMENT_CATEGORY_COLORS: Record<DocumentCategory, string> = {
  [DocumentCategory.PRD]: "bg-blue-500/10 text-blue-600 border-blue-200",
  [DocumentCategory.FRD]: "bg-purple-500/10 text-purple-600 border-purple-200",
  [DocumentCategory.TECHNICAL_SPEC]: "bg-orange-500/10 text-orange-600 border-orange-200",
  [DocumentCategory.USER_STORIES]: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
  [DocumentCategory.DESIGN_DOC]: "bg-pink-500/10 text-pink-600 border-pink-200",
  [DocumentCategory.MEETING_NOTES]: "bg-slate-500/10 text-slate-600 border-slate-200",
  [DocumentCategory.API_DOC]: "bg-green-500/10 text-green-600 border-green-200",
  [DocumentCategory.ARCHITECTURE]: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
  [DocumentCategory.TEST_PLAN]: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  [DocumentCategory.RELEASE_NOTES]: "bg-teal-500/10 text-teal-600 border-teal-200",
  [DocumentCategory.USER_GUIDE]: "bg-amber-500/10 text-amber-600 border-amber-200",
  [DocumentCategory.SRS]: "bg-rose-500/10 text-rose-600 border-rose-200",
  [DocumentCategory.BRD]: "bg-violet-500/10 text-violet-600 border-violet-200",
  [DocumentCategory.OTHER]: "bg-gray-500/10 text-gray-600 border-gray-200",
};

export type ProjectDocument = Models.Document & {
  title: string;
  name: string; // Compatibility with older schemas
  description?: string;
  size: number;
  mimeType: string;
  fileId: string;
  projectId: string;
  workspaceId: string;
  category: DocumentCategory;
  version: string;
  uploadedBy: string;
  tags?: string[];
  isArchived: boolean;
  aiSummary?: string;
};

export type PopulatedProjectDocument = ProjectDocument & {
  uploader?: { $id: string; name: string; email?: string };
  url?: string;
};

export type ProjectDocumentUploadData = {
  title: string;
  description?: string;
  size: number;
  mimeType: string;
  file: File;
  projectId: string;
  workspaceId: string;
  category: DocumentCategory;
  version?: string;
  tags?: string[];
};

export type ProjectDocumentUpdateData = {
  documentId: string;
  title?: string;
  description?: string;
  category?: DocumentCategory;
  version?: string;
  tags?: string[];
  isArchived?: boolean;
};

export type DocumentPreview = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url?: string;
  isPreviewable: boolean;
  category: DocumentCategory;
};

export type DocumentStats = {
  totalDocuments: number;
  totalSize: number;
  byCategory: Record<DocumentCategory, number>;
  recentUploads: number;
};
