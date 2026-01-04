import { CalendarIcon, MoreHorizontalIcon, FlagIcon, MessageCircle, GripVertical } from "lucide-react";
import { Project } from "@/features/projects/types";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";

import { TaskActions } from "./task-actions";
import { LabelBadge } from "./LabelBadge";
import { PriorityBadge } from "./priority-selector";
import { AssigneeAvatarGroup } from "./assignee-avatar-group";

import { PopulatedTask } from "../types";
import { useTaskPreviewModal } from "../hooks/use-task-preview-modal";

interface KanbanCardProps {
    task: PopulatedTask;
    isSelected?: boolean;
    onSelect?: (taskId: string, selected: boolean) => void;
    showSelection?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    project?: Project;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

export const KanbanCard = ({
    task,
    isSelected = false,
    showSelection = false,
    canEdit = false,
    canDelete = false,
    project,
    dragHandleProps
}: KanbanCardProps) => {
    const { open: openPreview } = useTaskPreviewModal();

    const assignees = task.assignees?.length
        ? task.assignees
        : task.assignee
            ? [task.assignee]
            : [];

    const handleCardClick = () => {
        // Prevent opening if the click originated from actions or other interactive elements
        // (Though stopPropagation on those elements usually handles this, it's good to be safe)
        openPreview(task.$id);
    };

    const customPriority = project?.customPriorities?.find(p => p.key === task.priority);
    const customLabels = project?.customLabels || [];

    return (
        <div
            onClick={handleCardClick}
            className={`bg-white mb-2.5 rounded-xl border shadow-sm group hover:shadow-md transition-shadow relative ${isSelected ? 'ring-2 ring-blue-500' : ''
                } ${showSelection ? 'hover:bg-gray-50' : ''}`}
        >
            <div className="flex p-4 flex-col items-start justify-between gap-x-2">

                <div className="flex-1 flex w-full justify-between items-start">

                    <div className="flex gap-2 items-center">
                        {/* Drag Handle - Only visible on hover or when dragging, but taking up space layout-wise if needed, or absolute */}
                        {dragHandleProps && (
                            <div
                                {...dragHandleProps}
                                className="mr-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <GripVertical className="size-4" />
                            </div>
                        )}

                        {task.priority && (
                            <PriorityBadge
                                priority={task.priority}
                                color={customPriority?.color}
                            />
                        )}

                        {task.labels && task.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 ">
                                {task.labels.slice(0, 2).map((label, index) => {
                                    const customLabel = customLabels.find(l => l.name === label);
                                    return (
                                        <LabelBadge
                                            key={index}
                                            label={label}
                                            color={customLabel?.color}
                                        />
                                    );
                                })}

                            </div>
                        )}

                    </div>


                    <div className="flex items-center gap-1">
                        <TaskActions
                            id={task.$id}
                            projectId={task.projectId}
                            flagged={task.flagged}
                            canEdit={canEdit}
                            canDelete={canDelete}
                        >
                            <MoreHorizontalIcon
                                className="size-[18px] stroke-1 shrink-0 text-neutral-700 hover:opacity-75 transition"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </TaskActions>
                    </div>

                </div>

                <div className="flex items-start gap-2 mt-4 cursor-pointer">
                    {task.flagged && (
                        <FlagIcon className="size-4 fill-red-500 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <h1 className="text-sm line-clamp-2 font-semibold flex-1">{task.name}</h1>
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-3">
                    {(() => {
                        const words = task.description?.split(/\s+/) ?? [];
                        const shouldEllipsize = words.length > 5 || words.some((w) => w.length > 20);
                        const preview = words
                            .slice(0, 5)
                            .map((word) => (word.length > 20 ? word.slice(0, 20) + "..." : word))
                            .join(" ");
                        return preview + (shouldEllipsize ? "....." : "");
                    })()}
                </p>


            </div>






            <div className="flex items-center border-t py-3 px-4 border-gray-200 gap-x-1.5 justify-between bg-gray-50/50 rounded-b-xl">
                <div className="flex items-center gap-x-3">
                    <p className="text-xs flex gap-0.5 items-center text-muted-foreground">
                        <CalendarIcon className="size-[14px] inline-block mr-1 text-gray-500" />
                        {task.dueDate
                            ? new Date(task.dueDate)
                                .toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                })
                                .replace(/ /g, "-")
                            : "No Date"}
                    </p>
                    {(task.commentCount ?? 0) > 0 && (
                        <p className="text-xs flex gap-0.5 items-center text-muted-foreground">
                            <MessageCircle className="size-[14px] text-gray-500" />
                            {task.commentCount}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-x-2">
                    {assignees.length > 0 ? (
                        <AssigneeAvatarGroup
                            assignees={assignees}
                            visibleCount={3}
                            avatarClassName="size-6 border-2 border-white"
                            fallbackClassName="text-xs"
                            extraCountClassName="size-6 rounded-full bg-muted text-xs font-medium flex items-center justify-center border-2 border-white"
                            popoverAlign="end"
                            ariaLabel={`View ${assignees.length} assignees`}
                        />
                    ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                </div>
            </div>

        </div>
    );
};
