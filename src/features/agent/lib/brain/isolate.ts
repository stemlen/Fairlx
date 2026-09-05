import type { AgentSpecialistId } from "../../types";
import type { SelectableTool } from "./select";
import { specialistToolAllowlist } from "./definitions";

export function filterToolsForSpecialist<T extends SelectableTool>(
  tools: T[],
  specialist: AgentSpecialistId,
): T[] {
  if (specialist === "orchestrator") return tools;
  const { names, prefixes } = specialistToolAllowlist(specialist);
  const filtered = tools.filter((tool) => {
    const name = tool.function.name;
    if (name === "delegate_agent" || name === "request_capability") return false;
    if (
      specialist === "researcher" &&
      name.startsWith("fairlx_") &&
      /_(create|update|delete|add|set|start|complete|remove)$/.test(name)
    ) {
      return false;
    }
    if (names.has(name)) return true;
    return prefixes.some((prefix) => name.startsWith(prefix));
  });
  return filtered.length ? filtered : tools.filter((tool) => tool.function.name !== "delegate_agent").slice(0, 8);
}
