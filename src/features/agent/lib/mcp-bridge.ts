import { callTool, jwtToAuthContext, listResources, listToolsForClient, type AuthContext } from "@fairlx/mcp-server";
import type { Databases } from "node-appwrite";

import { createMcpRuntime } from "@/features/mcp/bind-runtime";

import {
  DEFAULT_FAIRLX_MCP_SERVER_NAME,
  PERSONAL_MCP_SERVER_NAME,
  PERSONAL_MCP_URL,
} from "../constants";
import type { AgentHarness, AgentRun, McpConfig, McpServerConfig } from "../types";
import { listPersonalResources, PERSONAL_RESOURCE_KINDS, readPersonalContent } from "./personal";
import { decryptSecret } from "./secrets";

const MCP_TIMEOUT_MS = 20_000;

export function ensurePersonalMcp(config: McpConfig): McpConfig {
  const servers = { ...(config.mcpServers ?? {}) };
  if (!servers[PERSONAL_MCP_SERVER_NAME]) {
    servers[PERSONAL_MCP_SERVER_NAME] = {
      url: PERSONAL_MCP_URL,
      transport: "http",
      disabled: false,
    };
  }
  if (!servers[DEFAULT_FAIRLX_MCP_SERVER_NAME]) {
    servers[DEFAULT_FAIRLX_MCP_SERVER_NAME] = {
      url: "/api/mcp",
      transport: "http",
      disabled: false,
    };
  }
  return { ...config, mcpServers: servers };
}

function isFairlxPlatform(name: string, server: McpServerConfig) {
  if (name === DEFAULT_FAIRLX_MCP_SERVER_NAME) return true;
  const url = String(server.url || "");
  return url === "/api/mcp" || url.endsWith("/api/mcp");
}

function isPersonal(name: string, server: McpServerConfig) {
  return name === PERSONAL_MCP_SERVER_NAME || String(server.url || "") === PERSONAL_MCP_URL;
}

function headersFor(server: McpServerConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  for (const [key, value] of Object.entries(server.headers ?? {})) {
    if (typeof value === "string" && value.trim()) {
      headers[key] = decryptSecret(value);
    }
  }
  return headers;
}

async function jsonRpc(
  url: string,
  headers: Record<string, string>,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);
  console.log(`[MCP JSON-RPC Request] POST ${url} -> Method: ${method} | Params:`, JSON.stringify(params));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    let json: { result?: unknown; error?: { message?: string } } | null = null;
    try {
      json = text ? (JSON.parse(text) as { result?: unknown; error?: { message?: string } }) : null;
    } catch {
      json = { error: { message: text } };
    }
    console.log(`[MCP JSON-RPC Response] POST ${url} (${response.status}) ->`, text);
    if (!response.ok) {
      throw new Error(json?.error?.message || `MCP ${method} failed (${response.status})`);
    }
    if (json?.error?.message) throw new Error(json.error.message);
    return json?.result;
  } finally {
    clearTimeout(timer);
  }
}

export type McpBridgeContext = {
  userId: string;
  mcp: McpConfig;
  harness?: AgentHarness;
  runs?: AgentRun[];
  databases?: Databases;
  auth?: AuthContext;
};

function authFor(ctx: McpBridgeContext): AuthContext {
  return ctx.auth ?? jwtToAuthContext(ctx.userId);
}

export async function listMcpToolsForServer(name: string, ctx: McpBridgeContext): Promise<unknown> {
  const config = ensurePersonalMcp(ctx.mcp);
  const server = config.mcpServers[name];
  if (!server || server.disabled) return { error: `MCP server "${name}" is not available.` };

  if (isPersonal(name, server)) {
    return {
      server: name,
      tools: [
        { name: "personal_read", description: "Read personal harness content" },
        { name: "personal_search", description: "Search personal skills, knowledge, rules, chats, staging" },
      ],
    };
  }

  if (isFairlxPlatform(name, server)) {
    const auth = authFor(ctx);
    return { server: name, tools: listToolsForClient(auth) };
  }

  if (server.transport === "stdio" || server.command) {
    return {
      server: name,
      error: "stdio MCP servers are configured but never spawned on the Fairlx host. Use HTTP/SSE.",
    };
  }
  if (!server.url) return { error: `MCP server "${name}" has no URL.` };

  const result = await jsonRpc(server.url, headersFor(server), "tools/list", {});
  return { server: name, result };
}

export async function listMcpResourcesForServer(name: string, ctx: McpBridgeContext): Promise<unknown> {
  const config = ensurePersonalMcp(ctx.mcp);
  const server = config.mcpServers[name];
  if (!server || server.disabled) return { error: `MCP server "${name}" is not available.` };

  if (isPersonal(name, server)) {
    return { server: name, resources: listPersonalResources() };
  }

  if (isFairlxPlatform(name, server)) {
    const auth = authFor(ctx);
    return { server: name, resources: listResources(auth) };
  }

  if (server.transport === "stdio" || server.command) {
    return { error: "stdio MCP resources are not executed on the Fairlx host." };
  }
  if (!server.url) return { error: `MCP server "${name}" has no URL.` };
  const result = await jsonRpc(server.url, headersFor(server), "resources/list", {});
  return { server: name, result };
}

export async function callMcpServerTool(params: {
  server?: string;
  tool: string;
  args?: Record<string, unknown>;
  ctx: McpBridgeContext;
}): Promise<unknown> {
  const config = ensurePersonalMcp(params.ctx.mcp);
  const serverName = params.server || DEFAULT_FAIRLX_MCP_SERVER_NAME;
  const server = config.mcpServers[serverName];
  if (!server || server.disabled) return { error: `MCP server "${serverName}" is not available.` };

  if (isPersonal(serverName, server)) {
    if (!params.ctx.harness) {
      return { error: `Personal harness is not available for MCP server "${serverName}".` };
    }
    const kind = String(params.args?.kind || params.tool.replace(/^personal_/, "") || "harness");
    const known = PERSONAL_RESOURCE_KINDS.includes(kind as (typeof PERSONAL_RESOURCE_KINDS)[number])
      ? kind
      : "harness";
    return readPersonalContent({
      kind: params.tool === "personal_search" ? String(params.args?.kind || "skills") : known,
      harness: params.ctx.harness,
      runs: params.ctx.runs,
      query: typeof params.args?.query === "string" ? params.args.query : "",
    });
  }

  if (isFairlxPlatform(serverName, server)) {
    const runtime = await createMcpRuntime();
    const auth = authFor(params.ctx);
    const result = await callTool(params.tool, params.args ?? {}, runtime, auth);
    return result;
  }

  if (server.transport === "stdio" || server.command) {
    return {
      error: "stdio MCP servers are never spawned on the Fairlx host. Switch the server to HTTP or SSE.",
    };
  }
  if (!server.url) return { error: `MCP server "${serverName}" has no URL.` };

  return jsonRpc(server.url, headersFor(server), "tools/call", {
    name: params.tool,
    arguments: params.args ?? {},
  });
}
