"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, LoaderIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";
import { useProjectId } from "@/features/projects/hooks/use-project-id";
import { useGetWorkItems } from "../api/use-get-work-items";
import { useGetSprints } from "../api/use-get-sprints";
import { useCompleteSprint } from "../api/use-complete-sprint";
import { SprintStatus, WorkItemStatus, Sprint } from "../types";

export const CompleteSprintModal = ({
    sprint,
    open,
    onOpenChange,
}: {
    sprint: Sprint;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) => {
    const workspaceId = useWorkspaceId();
    const projectId = useProjectId();

    const [destinationSprintId, setDestinationSprintId] = useState<string>("backlog");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { isPending: isCompleting, mutateAsync: completeSprint } = useCompleteSprint();

    // Fetch all work items in the sprint to check status
    const { data: workItemsData, isLoading: isLoadingItems } = useGetWorkItems({
        workspaceId,
        projectId,
        sprintId: sprint.$id,
        limit: 1000,
        enabled: open,
    });

    // Fetch future planned sprints for destination options
    const { data: sprintsData } = useGetSprints({
        workspaceId,
        projectId,
        enabled: open,
    });

    const workItems = workItemsData?.documents || [];
    const totalItems = workItems.length;
    const completedItems = workItems.filter((item) => item.status === WorkItemStatus.DONE).length;
    const unfinishedItems = totalItems - completedItems;

    const plannedSprints = sprintsData?.documents
        .filter((s) => s.status === SprintStatus.PLANNED && s.$id !== sprint.$id)
        .sort((a, b) => a.position - b.position) || [];

    const handleComplete = async () => {
        try {
            setIsSubmitting(true);
            await completeSprint({
                param: { sprintId: sprint.$id },
                json: {
                    workspaceId,
                    projectId,
                    unfinishedDetails: unfinishedItems > 0 ? {
                        moveTo: destinationSprintId === "backlog" ? "backlog" : { sprintId: destinationSprintId }
                    } : undefined
                }
            });
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to complete sprint", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Complete Sprint: {sprint.name}</DialogTitle>
                    <DialogDescription>
                        {unfinishedItems === 0
                            ? "All work items in this sprint are completed."
                            : `This sprint contains ${unfinishedItems} unfinished work item${unfinishedItems === 1 ? '' : 's'}.`}
                    </DialogDescription>
                </DialogHeader>

                {isLoadingItems ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-2">
                        <LoaderIcon className="size-8 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading sprint details...</p>
                    </div>
                ) : (
                    <div className="py-4">
                        <div className="flex items-center justify-between mb-4 text-sm">
                            <div className="flex items-center text-green-600">
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                <span>{completedItems} Completed</span>
                            </div>
                            <div className="flex items-center text-amber-600">
                                <AlertCircle className="mr-2 h-4 w-4" />
                                <span>{unfinishedItems} Unfinished</span>
                            </div>
                        </div>

                        <Separator className="mb-4" />

                        {unfinishedItems > 0 && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Move unfinished items to</Label>
                                    <Select
                                        value={destinationSprintId}
                                        onValueChange={setDestinationSprintId}
                                        disabled={isSubmitting}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select destination" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="backlog">Backlog</SelectItem>
                                            {plannedSprints.map((s) => (
                                                <SelectItem key={s.$id} value={s.$id}>
                                                    {s.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Unfinished items will be moved to the selected location.
                                    </p>
                                </div>
                            </div>
                        )}

                        {unfinishedItems === 0 && (
                            <p className="text-sm text-gray-500">
                                Great job! All tasks are done. This sprint will be marked as completed.
                            </p>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleComplete} disabled={isLoadingItems || isSubmitting || isCompleting}>
                        {isSubmitting || isCompleting ? "Completing..." : "Complete Sprint"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
