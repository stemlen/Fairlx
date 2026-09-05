import { methodNotFound } from "../protocol/errors";
import type { McpToolResult } from "../protocol/types";
import type { AuthContext } from "../auth/context";
import type { McpRuntime } from "../runtime/types";
import { getToolDefinition } from "./catalog";
import { handleReadTool } from "./read";
import { handleWriteTool } from "./write";
import { handleDestructiveTool } from "./destructive";

export { TOOL_CATALOG, getToolDefinition, listToolsForClient } from "./catalog";
export { wouldCreateCycle } from "./helpers";

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  runtime: McpRuntime,
  auth: AuthContext
): Promise<McpToolResult> {
  const def = getToolDefinition(name);
  if (!def) throw methodNotFound(name);
  if (def.rateClass === "read") return handleReadTool(def.name, args, runtime, auth);
  if (def.rateClass === "destructive") return handleDestructiveTool(def.name, args, runtime, auth);
  return handleWriteTool(def.name, args, runtime, auth);
}
