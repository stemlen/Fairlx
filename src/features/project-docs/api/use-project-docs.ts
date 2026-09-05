import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { client } from "@/lib/rpc";
import { useTourActive, DUMMY_DOCUMENTS } from "@/lib/tour-dummy-data";
import { DocumentCategory, PopulatedProjectDocument } from "../types";
import type { DownloadDocumentFormat } from "../lib/document-file";

// Query keys
export const PROJECT_DOCS_QUERY_KEYS = {
  all: ["project-docs"] as const,
  documents: (projectId: string) => [...PROJECT_DOCS_QUERY_KEYS.all, "documents", projectId] as const,
  document: (documentId: string) => [...PROJECT_DOCS_QUERY_KEYS.all, "document", documentId] as const,
};

// Response types
interface DocumentsResponse {
  data: PopulatedProjectDocument[];
  stats: {
    totalDocuments: number;
    totalSize: number;
    remainingSize: number;
    byCategory: Record<string, number>;
  };
}

interface DocumentResponse {
  data: PopulatedProjectDocument;
}

// Get all documents for a project
export const useGetProjectDocuments = (
  projectId: string,
  workspaceId: string,
  options?: {
    category?: DocumentCategory;
    includeArchived?: boolean;
  }
) => {
  const isTourActive = useTourActive();

  return useQuery<DocumentsResponse>({
    queryKey: [...PROJECT_DOCS_QUERY_KEYS.documents(projectId), options, isTourActive],
    queryFn: async () => {
      // DUMMY DATA FOR TOUR
      if (isTourActive) {
        console.log("[Tour] Returning dummy project documents");
        return {
          data: DUMMY_DOCUMENTS.documents as unknown as PopulatedProjectDocument[],
          stats: {
            totalDocuments: DUMMY_DOCUMENTS.total,
            totalSize: 1024 * 1024 * 2.5, // 2.5 MB
            remainingSize: 1024 * 1024 * 100, // 100 MB
            byCategory: { "PRD": 1, "UI DESIGN": 1 }
          }
        };
      }

      const response = await client.api["project-docs"].$get({
        query: {
          projectId,
          workspaceId,
          category: options?.category,
          includeArchived: options?.includeArchived?.toString(),
        },
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to fetch documents");
      }

      return await response.json() as DocumentsResponse;
    },
    enabled: !!projectId && !!workspaceId,
  });
};

// Get a single document
export const useGetProjectDocument = (documentId: string, workspaceId: string) => {
  return useQuery<DocumentResponse>({
    queryKey: PROJECT_DOCS_QUERY_KEYS.document(documentId),
    queryFn: async () => {
      const response = await client.api["project-docs"][":documentId"].$get({
        param: { documentId },
        query: { workspaceId },
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to fetch document");
      }

      return await response.json() as DocumentResponse;
    },
    enabled: !!documentId && !!workspaceId,
  });
};

// Upload a document
interface UploadDocumentParams {
  file: File;
  title: string;
  description?: string;
  projectId: string;
  workspaceId: string;
  category: DocumentCategory;
  version?: string;
  tags?: string[];
}

export const useUploadProjectDocument = () => {
  const queryClient = useQueryClient();

  return useMutation<DocumentResponse, Error, UploadDocumentParams>({
    mutationFn: async (params) => {
      const formData = new FormData();
      formData.append("file", params.file);
      formData.append("name", params.title);
      formData.append("projectId", params.projectId);
      formData.append("workspaceId", params.workspaceId);
      formData.append("category", params.category);
      
      if (params.description) {
        formData.append("description", params.description);
      }
      if (params.version) {
        formData.append("version", params.version);
      }
      if (params.tags && params.tags.length > 0) {
        formData.append("tags", JSON.stringify(params.tags));
      }

      const response = await fetch("/api/project-docs/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to upload document");
      }

      return await response.json() as DocumentResponse;
    },
    onSuccess: (data, variables) => {
      toast.success("Document uploaded successfully");
      queryClient.invalidateQueries({
        queryKey: PROJECT_DOCS_QUERY_KEYS.documents(variables.projectId),
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload document");
    },
  });
};

// Update document metadata
interface UpdateDocumentParams {
  documentId: string;
  projectId: string;
  title?: string;
  description?: string;
  category?: DocumentCategory;
  version?: string;
  tags?: string[];
  isArchived?: boolean;
}

export const useUpdateProjectDocument = () => {
  const queryClient = useQueryClient();

  return useMutation<DocumentResponse, Error, UpdateDocumentParams>({
    mutationFn: async ({ documentId, projectId: _, ...updates }) => {
      void _; // projectId is used in onSuccess, not in the API call
      const response = await client.api["project-docs"][":documentId"].$patch({
        param: { documentId },
        json: updates,
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to update document");
      }

      return await response.json() as DocumentResponse;
    },
    onSuccess: (_, variables) => {
      toast.success("Document updated successfully");
      queryClient.invalidateQueries({
        queryKey: PROJECT_DOCS_QUERY_KEYS.documents(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: PROJECT_DOCS_QUERY_KEYS.document(variables.documentId),
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update document");
    },
  });
};

// Replace document file
interface ReplaceDocumentParams {
  documentId: string;
  projectId: string;
  workspaceId: string;
  file: File;
  version?: string;
}

export const useReplaceProjectDocument = () => {
  const queryClient = useQueryClient();

  return useMutation<DocumentResponse, Error, ReplaceDocumentParams>({
    mutationFn: async ({ documentId, projectId, workspaceId, file, version }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      formData.append("workspaceId", workspaceId);
      if (version) {
        formData.append("version", version);
      }

      const response = await fetch(`/api/project-docs/${documentId}/replace`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to replace document");
      }

      return await response.json() as DocumentResponse;
    },
    onSuccess: (_, variables) => {
      toast.success("Document replaced successfully");
      queryClient.invalidateQueries({
        queryKey: PROJECT_DOCS_QUERY_KEYS.documents(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: PROJECT_DOCS_QUERY_KEYS.document(variables.documentId),
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to replace document");
    },
  });
};

// Delete document
interface DeleteDocumentParams {
  documentId: string;
  projectId: string;
  workspaceId: string;
}

export const useDeleteProjectDocument = () => {
  const queryClient = useQueryClient();

  return useMutation<{ data: { success: boolean } }, Error, DeleteDocumentParams>({
    mutationFn: async ({ documentId, workspaceId }) => {
      const response = await client.api["project-docs"][":documentId"].$delete({
        param: { documentId },
        query: { workspaceId },
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
        throw new Error(errorData.error || "Failed to delete document");
      }

      return await response.json() as { data: { success: boolean } };
    },
    onSuccess: (_, variables) => {
      toast.success("Document deleted successfully");
      queryClient.invalidateQueries({
        queryKey: PROJECT_DOCS_QUERY_KEYS.documents(variables.projectId),
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete document");
    },
  });
};

// Download document helper
export const useDownloadDocument = () => {
  return useMutation<
    void,
    Error,
    { documentId: string; workspaceId: string; fileName: string; format?: DownloadDocumentFormat; silent?: boolean }
  >({
    mutationFn: async ({ documentId, workspaceId, fileName, format }) => {
      const params = new URLSearchParams({ workspaceId });
      if (format) params.set("format", format);
      const response = await fetch(
        `/api/project-docs/${documentId}/download?${params.toString()}`,
        { credentials: "include" },
      );

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        if (contentType.includes("application/json")) {
          const errorData = (await response.json()) as { error?: string };
          throw new Error(errorData.error || "Failed to download document");
        }
        throw new Error("Failed to download document");
      }

      const blob = await response.blob();
      if (contentType.includes("application/json")) {
        try {
          const parsed = JSON.parse(await blob.text()) as { error?: string };
          throw new Error(parsed.error || "Failed to download document");
        } catch (error) {
          throw error instanceof Error ? error : new Error("Failed to download document");
        }
      }

      const objectUrl = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = objectUrl;
      const disposition = response.headers.get("content-disposition") || "";
      const named = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/.exec(disposition);
      link.download = decodeURIComponent(named?.[1] || named?.[2] || fileName);
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
    },
    onSuccess: (_, variables) => {
      if (!variables.silent) toast.success("Document downloaded");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to download document");
    },
  });
};
