import { describe, expect, it } from "vitest";

import { compileFairlxListIntent } from "./intent-compiler";

describe("compileFairlxListIntent", () => {
  it("maps unassigned questions to one project list with unassigned=true", () => {
    expect(
      compileFairlxListIntent("Tell me all unassigned task", { projectId: "p1" }),
    ).toEqual({
      tool: "fairlx_work_item_list",
      args: { projectId: "p1", unassigned: true },
    });
  });

  it("does not fan out unassigned queries by type=TASK", () => {
    const intent = compileFairlxListIntent("show every unassigned work item", { projectId: "p1" });
    expect(intent?.args.type).toBeUndefined();
    expect(intent?.args.unassigned).toBe(true);
  });

  it("filters bugs only when the user asked for unassigned bugs", () => {
    expect(compileFairlxListIntent("list unassigned bugs", { projectId: "p1" })?.args).toEqual({
      projectId: "p1",
      unassigned: true,
      type: "BUG",
    });
  });

  it("does not auto-list when the user asked to plan work items", () => {
    expect(
      compileFairlxListIntent("Plan all sprints, work items, and epics", { projectId: "p1" }),
    ).toBeNull();
  });

  it("lists the project Backlog when asked to show it", () => {
    expect(compileFairlxListIntent("list all work items in the backlog", { projectId: "p1" })).toEqual({
      tool: "fairlx_work_item_list",
      args: { projectId: "p1", backlog: true },
    });
  });

  it("does not auto-list when assigning or unassigning", () => {
    expect(
      compileFairlxListIntent(
        "remove all assignees for all work items in all sprints and assign all workitems in sprint 1 to Fogef only",
        { projectId: "p1" },
      ),
    ).toBeNull();
    expect(compileFairlxListIntent("delete all work items in the backlog", { projectId: "p1" })).toBeNull();
  });
});
