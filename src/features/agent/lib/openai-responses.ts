export type AgentLlmApi = "chat_completions" | "responses";

type ChatMessage = {
  role?: string;
  content?: unknown;
  tool_calls?: Array<{
    id?: string;
    item_id?: string;
    type?: string;
    function?: { name?: string; arguments?: unknown };
  }>;
  tool_call_id?: string;
  name?: string;
};

type ChatTool = {
  type?: string;
  function?: { name?: string; description?: string; parameters?: unknown };
  name?: string;
  description?: string;
  parameters?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => textFromUnknown(part)).filter(Boolean).join("\n");
  }
  const record = asRecord(value);
  if (!record) return "";
  if (typeof record.text === "string") return record.text;
  if (typeof record.output_text === "string") return record.output_text;
  if (record.content != null) return textFromUnknown(record.content);
  return "";
}

function stringifyArguments(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

/** Azure/OpenAI Responses function_call item ids must begin with `fc`. */
export function responsesItemId(raw: string | undefined): string | undefined {
  const id = (raw || "").trim();
  return id.startsWith("fc") ? id : undefined;
}

/**
 * Correlate function_call / function_call_output without sending Fairlx UUIDs
 * as Responses item ids.
 */
export function responsesCallId(raw: string | undefined): string {
  const id = (raw || "").trim();
  if (id.startsWith("call_") || id.startsWith("fc_")) return id;
  const compact = id.replace(/[^a-zA-Z0-9]/g, "");
  return compact ? `call_${compact}` : "call_tool";
}

/** GPT-5.6 Luna and related reasoning models reject temperature / top_p. */
export function modelSupportsSamplingParams(model: string | undefined): boolean {
  const id = String(model || "").toLowerCase();
  if (!id) return true;
  if (id.includes("gpt-5.6") || id.includes("gpt-5.5") || id.includes("gpt-5.4")) return false;
  if (/(^|[^a-z])o[1-4](mini|preview)?([^a-z0-9]|$)/.test(id)) return false;
  return true;
}

export function stripUnsupportedSamplingParams(
  model: string | undefined,
  body: Record<string, unknown>,
): Record<string, unknown> {
  if (modelSupportsSamplingParams(model)) return body;
  const {
    temperature: _temperature,
    top_p: _topP,
    top_k: _topK,
    presence_penalty: _presence,
    frequency_penalty: _frequency,
    ...rest
  } = body;
  return rest;
}

function mapToolChoice(choice: unknown): unknown {
  if (choice == null || choice === "auto" || choice === "none" || choice === "required") return choice;
  const record = asRecord(choice);
  if (!record) return "auto";
  const fn = asRecord(record.function);
  const name = String(fn?.name || record.name || "");
  if (name) return { type: "function", name };
  return "auto";
}

function mapTools(tools: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((tool) => {
    const item = (tool || {}) as ChatTool;
    if (item.type === "function" && item.name && !item.function) {
      return {
        type: "function",
        name: item.name,
        description: item.description,
        parameters: item.parameters,
      };
    }
    return {
      type: "function",
      name: item.function?.name || item.name || "",
      description: item.function?.description || item.description,
      parameters: item.function?.parameters || item.parameters,
    };
  });
}

export function toResponsesRequest(body: Record<string, unknown>): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
  const rest = [...messages];
  let instructions: string | undefined;
  if (rest[0]?.role === "system") {
    instructions = textFromUnknown(rest[0].content);
    rest.shift();
  }

  const input: Record<string, unknown>[] = [];
  const callIds = new Map<string, string>();
  const callIdFor = (raw: string) => {
    const key = raw || "";
    const existing = callIds.get(key);
    if (existing) return existing;
    const next = responsesCallId(key);
    callIds.set(key, next);
    return next;
  };
  const toolOutputs = new Set(
    rest.filter((message) => message.role === "tool").map((message) => String(message.tool_call_id || "")),
  );
  const nativeRawIds = new Set<string>();

  const flushNotes = (notes: string[]) => {
    const text = notes.join("\n").trim();
    if (text) input.push({ role: "assistant", content: text });
    notes.length = 0;
  };

  for (const message of rest) {
    if (message.role === "user") {
      input.push({ role: "user", content: textFromUnknown(message.content) });
      continue;
    }
    if (message.role === "assistant") {
      const notes: string[] = [];
      const content = textFromUnknown(message.content);
      if (content) notes.push(content);
      for (const call of message.tool_calls ?? []) {
        const rawId = String(call.id || "");
        const itemId = responsesItemId(call.item_id) || responsesItemId(rawId);
        const name = String(call.function?.name || "tool");
        const args = stringifyArguments(call.function?.arguments);
        const hasOutput = toolOutputs.has(rawId);
        if (itemId && hasOutput) {
          flushNotes(notes);
          nativeRawIds.add(rawId);
          nativeRawIds.add(callIdFor(rawId));
          input.push({
            type: "function_call",
            id: itemId,
            call_id: callIdFor(rawId),
            name,
            arguments: args,
          });
          continue;
        }
        notes.push(`Called ${name} with ${args}`);
      }
      flushNotes(notes);
      continue;
    }
    if (message.role === "tool") {
      const rawId = String(message.tool_call_id || "");
      const mapped = callIdFor(rawId);
      if (nativeRawIds.has(rawId) || nativeRawIds.has(mapped)) {
        input.push({
          type: "function_call_output",
          call_id: mapped,
          output: textFromUnknown(message.content),
        });
        continue;
      }
      const name = String(message.name || "tool");
      input.push({
        role: "user",
        content: `Tool result (${name}):\n${textFromUnknown(message.content)}`,
      });
    }
  }

  const maxOutput =
    body.max_output_tokens ??
    body.max_tokens ??
    body.max_completion_tokens;

  const payload: Record<string, unknown> = {
    model: body.model,
    input,
    store: false,
  };
  if (instructions) payload.instructions = instructions;
  if (typeof body.temperature === "number" && modelSupportsSamplingParams(String(body.model || ""))) {
    payload.temperature = body.temperature;
  }
  if (maxOutput != null) payload.max_output_tokens = maxOutput;
  const tools = mapTools(body.tools);
  if (tools) {
    payload.tools = tools;
    payload.tool_choice = mapToolChoice(body.tool_choice ?? "auto");
    if (typeof body.parallel_tool_calls === "boolean") {
      payload.parallel_tool_calls = body.parallel_tool_calls;
    }
  }
  return payload;
}

export function isResponsesResponse(json: unknown): boolean {
  const record = asRecord(json);
  if (!record) return false;
  return record.object === "response" || Array.isArray(record.output);
}

function usageFromResponses(record: Record<string, unknown>): Record<string, unknown> {
  const usage = asRecord(record.usage) ?? {};
  const prompt = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  const completion = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
  const details = asRecord(usage.input_tokens_details) ?? asRecord(usage.prompt_tokens_details) ?? {};
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: Number(usage.total_tokens ?? prompt + completion) || prompt + completion,
    prompt_tokens_details: {
      cached_tokens: Number(details.cached_tokens ?? usage.cached_tokens ?? 0) || 0,
    },
    input_tokens: prompt,
    output_tokens: completion,
  };
}

export function fromResponsesResponse(json: unknown): {
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      reasoning_content?: string;
      tool_calls?: Array<{
        id: string;
        item_id?: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage: Record<string, unknown>;
  error?: { message?: string };
} {
  const record = asRecord(json) ?? {};
  const errorRecord = asRecord(record.error);
  const status = String(record.status || "");
  const errorMessage =
    (typeof errorRecord?.message === "string" && errorRecord.message) ||
    (status === "failed" ? "Responses API request failed." : "");

  const output = Array.isArray(record.output) ? record.output : [];
  const texts: string[] = [];
  const reasonings: string[] = [];
  const toolCalls: Array<{
    id: string;
    item_id?: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];

  for (const raw of output) {
    const item = asRecord(raw);
    if (!item) continue;
    const type = String(item.type || "");
    if (type === "reasoning") {
      const summary = Array.isArray(item.summary) ? textFromUnknown(item.summary) : textFromUnknown(item);
      if (summary.trim()) reasonings.push(summary.trim());
      continue;
    }
    if (type === "function_call") {
      const callId = String(item.call_id || "");
      const itemId = responsesItemId(String(item.id || ""));
      const name = String(item.name || "");
      if (!name) continue;
      toolCalls.push({
        id: callId || itemId || `call_${toolCalls.length + 1}`,
        ...(itemId ? { item_id: itemId } : {}),
        type: "function",
        function: {
          name,
          arguments: stringifyArguments(item.arguments),
        },
      });
      continue;
    }
    if (type === "message" || type === "output_text") {
      const text = textFromUnknown(item) || (typeof item.text === "string" ? item.text : "");
      if (text.trim()) texts.push(text);
    }
  }

  if (!texts.length && typeof record.output_text === "string" && record.output_text.trim()) {
    texts.push(record.output_text.trim());
  }

  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: texts.join("\n") || null,
          ...(reasonings.length ? { reasoning_content: reasonings.join("\n") } : {}),
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
      },
    ],
    usage: usageFromResponses(record),
    ...(errorMessage ? { error: { message: errorMessage } } : {}),
  };
}
