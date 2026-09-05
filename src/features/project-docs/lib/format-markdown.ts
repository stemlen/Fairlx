export {
  hasNotionDocStructure,
  normalizeMarkdownSpacing,
  parseCalloutKind,
  PROJECT_DOC_MARKDOWN_GUIDE,
  stripInlineMarkdown,
  type DocCalloutKind,
} from "@fairlx/mcp-server/markdown";

type MdNode = {
  type?: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string };
};

function highlightTextValue(value: string): MdNode[] {
  const chunks = value.split(/(==[^=]+==)/g);
  if (chunks.length === 1) return [{ type: "text", value }];
  const next: MdNode[] = [];
  for (const chunk of chunks) {
    const marked = /^==([^=]+)==$/.exec(chunk);
    if (marked) {
      next.push({
        type: "highlight",
        data: { hName: "mark" },
        children: [{ type: "text", value: marked[1] }],
      });
      continue;
    }
    if (chunk) next.push({ type: "text", value: chunk });
  }
  return next;
}

function visitHighlight(node: MdNode) {
  const children = node.children;
  if (!children) return;
  const next: MdNode[] = [];
  for (const child of children) {
    if (child.type === "text" && typeof child.value === "string" && child.value.includes("==")) {
      next.push(...highlightTextValue(child.value));
      continue;
    }
    visitHighlight(child);
    next.push(child);
  }
  node.children = next;
}

/** remark plugin: turn ==highlighted phrase== into a <mark> node. */
export function remarkMarkHighlight() {
  return (tree: MdNode) => {
    visitHighlight(tree);
  };
}
