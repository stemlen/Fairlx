export type FairlxListIntent = {
  tool: "fairlx_work_item_list";
  args: Record<string, unknown>;
};

const WRITE_RE =
  /\b(create|update|delete|assign|unassign|remove|move|close|start|complete|rename)\b/;
const LIST_HINT_RE =
  /\b(list|show|tell|what|which|all|find|get|how many|who(?:'s| is)?)\b/;
const WORK_RE =
  /\b(tasks?|bugs?|tickets?|issues?|stories|story|epics?|work items?|backlog|unassigned|assigned)\b/;
const UNASSIGNED_RE =
  /\b(unassigned|no assignee|not assigned|without (an? )?assignee|missing assignee|nobody on)\b/;
const PROJECT_BACKLOG_RE = /\b(the )?backlog\b/;

function askedType(text: string, unassigned: boolean): string | undefined {
  if (unassigned && !/\bunassigned bugs?\b/.test(text) && !/\bbugs? that are unassigned\b/.test(text)) {
    if (/\bbugs?\b/.test(text) && !/\b(tasks?|stories|story|epics?|work items?)\b/.test(text)) {
      return "BUG";
    }
    return undefined;
  }
  if (/\bbugs?\b/.test(text) && !/\b(tasks?|stories|story|work items?)\b/.test(text)) return "BUG";
  if (/\b(stories|story)\b/.test(text) && !/\b(tasks?|bugs?)\b/.test(text)) return "STORY";
  if (/\bepics?\b/.test(text) && !/\b(tasks?|bugs?)\b/.test(text)) return "EPIC";
  return undefined;
}

function askedStatus(text: string): string | undefined {
  if (/\bin review\b/.test(text)) return "IN_REVIEW";
  if (/\bin progress\b/.test(text)) return "IN_PROGRESS";
  if (/\b(to-?do|todo)\b/.test(text)) return "TODO";
  if (/\bdone\b/.test(text) && !/\bnot done\b/.test(text)) return "DONE";
  return undefined;
}

/**
 * Map a user question onto a single fairlx_work_item_list call.
 * Returns null when the turn is not a list/query of work items.
 */
export function compileFairlxListIntent(
  text: string,
  scope: { projectId?: string },
): FairlxListIntent | null {
  const projectId = scope.projectId?.trim();
  if (!projectId) return null;
  const q = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!q) return null;
  if (/\bplan\b/.test(q) && !/\b(list|show|how many)\b/.test(q)) return null;
  if (WRITE_RE.test(q)) return null;
  if (!WORK_RE.test(q)) return null;
  if (!LIST_HINT_RE.test(q) && !UNASSIGNED_RE.test(q) && !PROJECT_BACKLOG_RE.test(q) && !/\bmy tasks\b/.test(q)) {
    return null;
  }

  const unassigned = UNASSIGNED_RE.test(q);
  const backlog = PROJECT_BACKLOG_RE.test(q) && !/\bpersonal backlog\b/.test(q) && !unassigned;
  const args: Record<string, unknown> = { projectId };
  if (unassigned) args.unassigned = true;
  if (backlog) args.backlog = true;
  const type = askedType(q, unassigned);
  if (type) args.type = type;
  const status = askedStatus(q);
  if (status && !unassigned) args.status = status;
  return { tool: "fairlx_work_item_list", args };
}
