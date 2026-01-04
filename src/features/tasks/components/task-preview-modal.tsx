"use client";

import { InferRequestType } from "hono";
import { client } from "@/lib/rpc";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ExternalLink,
  Link,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import IconHelp from "@/components/icon-help";
// import { cn } from "@/lib/utils"; // Removed unused
import { Attachment } from "@/features/attachments/types";
import { TaskAttachments } from "@/features/attachments/components/task-attachments";


import { useGetTask } from "../api/use-get-task";
import { useTaskPreviewModal } from "../hooks/use-task-preview-modal";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";
import { PopulatedTask } from "../types";
// import { MemberAvatar } from "@/features/members/components/member-avatar"; // Removed unused

import { useUpdateTask } from "../api/use-update-task";
import { useGetMembers } from "@/features/members/api/use-get-members";
import { useGetProject } from "@/features/projects/api/use-get-project";
import { useCurrent } from "@/features/auth/api/use-current";
import { CommentList } from "@/features/comments/components/comment-list";
import { CommentInput } from "@/features/comments/components/comment-input";

import { StatusSelector } from "@/features/custom-columns/components/status-selector";
import { PrioritySelector } from "./priority-selector";
import { AssigneeMultiSelect } from "./assignee-multi-select";
import { DatePicker } from "@/components/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";




type UpdateTaskPayload = InferRequestType<typeof client.api.tasks[":taskId"]["$patch"]>["json"];

interface TaskPreviewContentProps {
  task: PopulatedTask;
  workspaceId: string;
  onEdit: () => void;
  onClose: () => void;
  onAttachmentPreview?: (attachment: Attachment) => void;
}

const TaskPreviewContent = ({ task, workspaceId, onEdit, onClose, onAttachmentPreview }: TaskPreviewContentProps) => {
  const { mutate: updateTask } = useUpdateTask();
  const { data: members } = useGetMembers({ workspaceId });
  const { data: project } = useGetProject({ projectId: task.projectId });
  const { data: user } = useCurrent();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  // Sync state with task updates
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || "");
  }, [task]);

  const memberOptions = members?.documents.map((member) => ({
    id: member.$id,
    name: member.name,
    imageUrl: member.profileImageUrl,
  })) || [];

  const handleUpdate = (updates: UpdateTaskPayload) => {
    updateTask({
      param: { taskId: task.$id },
      json: updates,
    });
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (title !== task.title) {
      handleUpdate({ name: title });
    }
  };

  const handleDescriptionBlur = () => {
    setIsEditingDescription(false);
    if (description !== (task.description || "")) {
      handleUpdate({ description });
    }
  };

  const handleCopyUrl = async () => {
    try {
      const url = typeof window !== "undefined"
        ? `${window.location.origin}/workspaces/${workspaceId}/tasks/${task.$id}`
        : `/workspaces/${workspaceId}/tasks/${task.$id}`;
      await navigator.clipboard.writeText(url);
      toast.success("Task URL copied to clipboard.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy task URL.");
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(task.$id);
      toast.success("Task ID copied to clipboard.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy task ID.");
    }
  };

  // Get recent comments (last 3) -> now handled by CommentList


  return (
    <div className="flex w-full  flex-col h-full max-h-[90vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <StatusSelector
            value={task.status}
            onChange={(value) => handleUpdate({ status: value })}
            projectId={task.projectId}
            placeholder="Status"
          />
          {task.key && (
            <span className="text-xs text-gray-500 font-mono">{task.key}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <IconHelp content="Copy task URL" side="bottom">
            <button
              className="hover:bg-gray-100 p-1.5 rounded-md transition-colors"
              onClick={handleCopyUrl}
            >
              <Link size={16} strokeWidth={1.5} className="text-gray-500" />
            </button>
          </IconHelp>

          <IconHelp content="Copy task ID" side="bottom">
            <button
              className="hover:bg-gray-100 p-1.5 rounded-md transition-colors"
              onClick={handleCopyId}
            >
              <Copy size={16} strokeWidth={1.5} className="text-gray-500" />
            </button>
          </IconHelp>

          <IconHelp content="Edit task" side="bottom">
            <button
              className="hover:bg-gray-100 p-1.5 rounded-md transition-colors"
              onClick={onEdit}
            >
              <ExternalLink size={16} strokeWidth={1.5} className="text-gray-500" />
            </button>
          </IconHelp>

          <button
            className="hover:bg-gray-100 p-1.5 rounded-md transition-colors ml-1"
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.5} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5">
            {/* Task Title */}
            <div className="mb-4">
              {isEditingTitle ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTitleBlur();
                  }}
                  autoFocus
                  className="text-xl font-semibold h-auto py-2 px-2"
                />
              ) : (
                <h1
                  className="text-xl font-semibold text-gray-900 border border-transparent hover:border-gray-200 rounded p-2 -ml-2 cursor-text transition-colors"
                  onClick={() => setIsEditingTitle(true)}
                >
                  {task.title}
                </h1>
              )}
            </div>

            {/* Description */}
            <div className="mb-6">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Description
              </h3>
              <div className="min-h-[100px]">
                {isEditingDescription ? (
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    autoFocus
                    className="min-h-[150px] resize-none"
                    placeholder="Add a description..."
                  />
                ) : (
                  <div
                    onClick={() => setIsEditingDescription(true)}
                    className="p-2 -ml-2 rounded border border-transparent hover:border-gray-200 cursor-text transition-colors min-h-[60px]"
                  >
                    {task.description ? (
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {task.description}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Click to add description</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Comments Section */}
            <div className="border-t pt-5">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">
                Activity & Comments
              </h3>

              <div className="mb-4">
                <CommentInput
                  taskId={task.$id}
                  workspaceId={workspaceId}
                  placeholder="Write a comment..."
                />
              </div>

              <CommentList
                taskId={task.$id}
                workspaceId={workspaceId}
                currentUserId={user?.$id || ""}
              />
            </div>
          </div>
        </div>

        {/* Right Panel - Properties */}
        <div className="w-[320px] border-l bg-gray-50 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">
              Properties
            </h3>

            <div className="space-y-4">
              {/* Status */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Status</label>
                <StatusSelector
                  value={task.status}
                  onChange={(value) => handleUpdate({ status: value })}
                  projectId={task.projectId}
                />
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Priority</label>
                <PrioritySelector
                  value={task.priority}
                  onValueChange={(value) => handleUpdate({ priority: value })}
                  customPriorities={project?.customPriorities}
                />
              </div>

              {/* Assignee */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Assignees</label>
                <AssigneeMultiSelect
                  memberOptions={memberOptions}
                  selectedAssigneeIds={task.assigneeIds || []}
                  onAssigneesChange={(ids) => handleUpdate({ assigneeIds: ids })}
                  placeholder="Select assignees"
                />
              </div>

              {/* Dates */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Start Date</label>
                <DatePicker
                  value={task.dueDate ? new Date(task.dueDate) : undefined}
                  onChange={(date) => handleUpdate({ dueDate: date })}
                  placeholder="Set start date"
                  className="w-full bg-white border-gray-200"
                />
              </div>

              {/* Due Date (Using endDate field if that's what we want, or do we have separate due date?)
                  Schema has dueDate and endDate.
                  Original view showed 'Due' mapping to task.dueDate?
                  Wait, 'Start' mapped to task.startDate, 'Due' to task.dueDate in original view.
                  Schema: dueDate: z.coerce.date().optional(), endDate: z.coerce.date().optional()
                  Wait, CreateTask uses 'dueDate' as Start Date label? 
                  Step 538: <FormLabel>Start Date</FormLabel> <DatePicker {...field} name="dueDate" />
                  So dueDate = Start Date. 
                  And endDate = End Date.
              */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">End Date</label>
                <DatePicker
                  value={task.endDate ? new Date(task.endDate) : undefined}
                  onChange={(date) => handleUpdate({ endDate: date })}
                  placeholder="Set end date"
                  className="w-full bg-white border-gray-200"
                />
              </div>

              {/* Labels */}
              {/* If we want to support labels, we need LabelSelector. Skipping for now to keep it simpler unless requested, as it requires complex project label fetching */}

              {/* Time Estimate */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Time Estimate (hours)</label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="None"
                  defaultValue={task.estimatedHours}
                  onBlur={(e) => {
                    const val = e.target.value ? parseFloat(e.target.value) : null;
                    if (val !== task.estimatedHours) {
                      handleUpdate({ estimatedHours: val || undefined });
                    }
                  }}
                  className="h-9 bg-white border-gray-200"
                />
              </div>

              {/* Story Points */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Story Points</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="None"
                  defaultValue={task.storyPoints}
                  onBlur={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    if (val !== task.storyPoints) {
                      handleUpdate({ storyPoints: val || undefined });
                    }
                  }}
                  className="h-9 bg-white border-gray-200"
                />
              </div>

              {/* Flagged */}
              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  checked={task.flagged}
                  onCheckedChange={(checked) => handleUpdate({ flagged: checked as boolean })}
                  id="flagged"
                />
                <label htmlFor="flagged" className="text-sm font-medium text-gray-700 cursor-pointer">Flagged</label>
              </div>
            </div>
          </div>
          {/* Attachments */}
          <div className="pt-2 border-t px-4">
            <TaskAttachments taskId={task.$id} workspaceId={workspaceId} onPreview={onAttachmentPreview} />
          </div>

          {/* Edit Button */}
          <div className="px-4 py-4 border-t sticky bottom-0">
            <Button
              onClick={onEdit}
              className="w-full"
              size="sm"
            >
              <ExternalLink size={14} className="mr-2" />
              Open Full View
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TaskPreviewModalWrapper = () => {
  const router = useRouter();
  const { taskId, close } = useTaskPreviewModal();
  const workspaceId = useWorkspaceId();
  const { data, isLoading } = useGetTask({ taskId: taskId || "" });
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const isOpen = !!taskId;



  const handleEdit = () => {
    if (!workspaceId || !data?.$id) return;   // <-- Ensures ID exists

    const target = `/workspaces/${workspaceId}/tasks/${data.$id}`;


    try {

      router.push(target);
      console.log("Navigating to:", target);
    } catch (error) {
      console.error("Failed to navigate to task edit page:", error);
    }
  };


  const handleClose = useCallback(() => {
    close();
  }, [close]);

  const handleAttachmentPreview = (attachment: Attachment) => {
    setPreviewAttachment(attachment);
  };

  const closeAttachmentPreview = () => setPreviewAttachment(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60  z-50 animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex  items-center justify-center p-4 pointer-events-none">
        <div
          className="relative bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden pointer-events-auto animate-in zoom-in-95 fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <div className="flex flex-col h-[500px]">
              {/* Header skeleton */}
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </div>
              {/* Content skeleton */}
              <div className="flex flex-1">
                <div className="flex-1 p-5">
                  <Skeleton className="h-7 w-3/4 mb-4" />
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-20 w-full" />
                </div>
                <div className="w-[260px] border-l bg-gray-50 p-4">
                  <Skeleton className="h-4 w-20 mb-4" />
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              </div>
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center h-[300px]">
              <p className="text-gray-500">Task not found</p>
            </div>
          ) : (
            <>
              <TaskPreviewContent
                task={data}
                workspaceId={workspaceId}
                onEdit={handleEdit}
                onClose={handleClose}
                onAttachmentPreview={handleAttachmentPreview}
              />

              {/* Attachment preview overlay */}
              {previewAttachment && (
                <div className="fixed inset-0 z-60 flex flex-col bg-white">
                  <div className="flex items-center justify-between px-4 py-2 border-b">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{previewAttachment.name}</span>
                      <span className="text-xs text-gray-400">{previewAttachment.mimeType}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="p-1.5 rounded hover:bg-gray-100" onClick={closeAttachmentPreview}>
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                    {previewAttachment.mimeType.startsWith("image/") ? (
                      // Image preview
                      // Use the preview endpoint
                      // eslint-disable-next-line @next/next/no-img-element -- Dynamic preview URL not compatible with Next.js Image
                      <img
                        src={`/api/attachments/${previewAttachment.$id}/preview?workspaceId=${workspaceId}`}
                        alt={previewAttachment.name}
                        className="max-h-[80vh] max-w-full object-contain"
                      />
                    ) : (
                      // Fallback to iframe for PDFs and other previewable types
                      <iframe
                        src={`/api/attachments/${previewAttachment.$id}/preview?workspaceId=${workspaceId}`}
                        title={previewAttachment.name}
                        className="w-full h-[80vh] border-0"
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};
