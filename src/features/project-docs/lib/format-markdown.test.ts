import { describe, expect, it } from "vitest";

import { remarkMarkHighlight } from "./format-markdown";

describe("remarkMarkHighlight", () => {
  it("turns ==highlight== text nodes into mark hast nodes", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "Use ==Accept== in staged mode" }],
        },
      ],
    };
    remarkMarkHighlight()(tree);
    const paragraph = tree.children[0]!;
    expect(paragraph.children).toEqual([
      { type: "text", value: "Use " },
      {
        type: "highlight",
        data: { hName: "mark" },
        children: [{ type: "text", value: "Accept" }],
      },
      { type: "text", value: " in staged mode" },
    ]);
  });
});
