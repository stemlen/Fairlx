"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
  Reply,
  AtSign,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/utils";

import { PopulatedComment } from "../types";
import { useUpdateComment } from "../hooks/use-update-comment";
import { useDeleteComment } from "../hooks/use-delete-comment";
import { CommentInput } from "./comment-input";
import { CommentContent } from "./comment-content";

interface CommentItemProps {
  comment: PopulatedComment;
  taskId: string;
  workspaceId: string;
  currentUserId: string;
  isAdmin?: boolean;
  isReply?: boolean;
}

export const CommentItem = ({
  comment,
  taskId,
  workspaceId,
  currentUserId,
  isAdmin = false,
  isReply = false,
}: CommentItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isReplying, setIsReplying] = useState(false);

  const { mutate: updateComment, isPending: isUpdating } = useUpdateComment({
    taskId,
    workspaceId,
  });
  const { mutate: deleteComment, isPending: isDeleting } = useDeleteComment({
    taskId,
    workspaceId,
  });

  const [DeleteDialog, confirmDelete] = useConfirm(
    "Delete Comment",
    "Are you sure you want to delete this comment? This action cannot be undone.",
    "destructive"
  );

  const isAuthor = comment.authorId === currentUserId;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isAdmin;

  const authorInitials = comment.author?.name
    ? comment.author.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const handleEdit = () => {
    if (!editContent.trim()) return;

    updateComment(
      {
        param: { commentId: comment.$id },
        json: { content: editContent.trim(), workspaceId },
      },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      }
    );
  };

  const handleDelete = async () => {
    const ok = await confirmDelete();
    if (!ok) return;

    deleteComment({
      param: { commentId: comment.$id },
      json: { workspaceId },
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(comment.content);
  };

  return (
    <>
      <DeleteDialog />
      <div className={cn("group", isReply && "ml-10 mt-3")}>
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage
              src={comment.author?.profileImageUrl || undefined}
              alt={comment.author?.name || "User"}
            />
            <AvatarFallback className="text-xs bg-emerald-500 text-white">
              {authorInitials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="bg-gray-100 rounded-lg px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900">
                    {comment.author?.name || "Unknown User"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(comment.$createdAt), {
                      addSuffix: true,
                    })}
                    {comment.isEdited && (
                      <span className="ml-1 text-gray-400">(edited)</span>
                    )}
                  </span>
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isReply && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-gray-600"
                        onClick={() => setIsReplying(!isReplying)}
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-gray-600"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-gray-600"
                    >
                      <AtSign className="h-3.5 w-3.5" />
                    </Button>
                    {(canEdit || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-gray-600"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit && (
                            <DropdownMenuItem onClick={() => setIsEditing(true)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem
                              onClick={handleDelete}
                              disabled={isDeleting}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[80px] resize-none"
                    disabled={isUpdating}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleEdit}
                      disabled={isUpdating || !editContent.trim()}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <CommentContent
                  content={comment.content}
                  workspaceId={workspaceId}
                />
              )}
            </div>

            {/* Replies */}
            {comment.replies && comment.replies.length > 0 && (
              <div className="mt-2 space-y-3">
                {comment.replies.map((reply) => (
                  <CommentItem
                    key={reply.$id}
                    comment={reply}
                    taskId={taskId}
                    workspaceId={workspaceId}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    isReply
                  />
                ))}
              </div>
            )}

            {/* Reply Input */}
            {isReplying && (
              <div className="mt-3 ml-10">
                <CommentInput
                  taskId={taskId}
                  workspaceId={workspaceId}
                  parentId={comment.$id}
                  placeholder="Write a reply..."
                  onSuccess={() => setIsReplying(false)}
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
