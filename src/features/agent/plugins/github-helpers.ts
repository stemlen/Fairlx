import type { AgentCapability } from "../types";

export function githubCapabilityGap(result: unknown): AgentCapability | undefined {
  if (!result || typeof result !== "object") return undefined;
  const rec = result as { error?: string; capability?: AgentCapability; skipped?: boolean };
  if (rec.capability === "code.write" || rec.capability === "code.read" || rec.capability === "security.review") {
    return rec.capability;
  }
  if (rec.skipped) return undefined;
  if (typeof rec.error === "string" && /token|cannot push/i.test(rec.error)) return "code.write";
  return undefined;
}

export function parsePrFiles(value: unknown): Array<{ path: string; content: string; message?: string }> {
  if (!Array.isArray(value)) return [];
  const files: Array<{ path: string; content: string; message?: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const path = typeof rec.path === "string" ? rec.path : "";
    const content = typeof rec.content === "string" ? rec.content : "";
    if (!path || !content) continue;
    files.push({
      path,
      content,
      message: typeof rec.message === "string" ? rec.message : undefined,
    });
  }
  return files;
}
