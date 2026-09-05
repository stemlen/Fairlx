import tools from "./fairlx-mcp-tools.json";

export type FairlxMcpToolSchema = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** Snapshot of Fairlx MCP tool schemas for the browser context meter. */
export function listFairlxMcpToolsForBudget(): FairlxMcpToolSchema[] {
  return tools as FairlxMcpToolSchema[];
}
