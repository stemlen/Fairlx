import { describe, expect, it } from "vitest";

import { fromResponsesResponse, isResponsesResponse, modelSupportsSamplingParams, toResponsesRequest } from "./openai-responses";

describe("OpenAI Responses API conversion", () => {
  it("maps chat completions bodies onto Responses requests", () => {
    const payload = toResponsesRequest({
      model: "DeepSeek-V4-Flash",
      temperature: 0.2,
      max_tokens: 128,
      messages: [
        { role: "system", content: "You are the Fairlx Agent." },
        { role: "user", content: "Call ping with hello." },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "ping",
            description: "Ping a value",
            parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
          },
        },
      ],
      tool_choice: "auto",
    });

    expect(payload).toEqual({
      model: "DeepSeek-V4-Flash",
      instructions: "You are the Fairlx Agent.",
      input: [{ role: "user", content: "Call ping with hello." }],
      store: false,
      temperature: 0.2,
      max_output_tokens: 128,
      tools: [
        {
          type: "function",
          name: "ping",
          description: "Ping a value",
          parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
        },
      ],
      tool_choice: "auto",
    });
  });

  it("forwards parallel_tool_calls so the model can emit several function calls at once", () => {
    const payload = toResponsesRequest({
      model: "grok-4.6",
      messages: [{ role: "user", content: "Split the work." }],
      tools: [
        {
          type: "function",
          function: {
            name: "delegate_agent",
            description: "Delegate",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      tool_choice: "auto",
      parallel_tool_calls: true,
    });
    expect(payload.parallel_tool_calls).toBe(true);
  });

  it("omits temperature for GPT-5.6 Luna", () => {
    expect(modelSupportsSamplingParams("gpt-5.6-luna")).toBe(false);
    expect(modelSupportsSamplingParams("grok-4.6")).toBe(true);

    const payload = toResponsesRequest({
      model: "gpt-5.6-luna",
      temperature: 0.2,
      max_tokens: 32,
      messages: [{ role: "user", content: "Say hi" }],
    });
    expect(payload).toEqual({
      model: "gpt-5.6-luna",
      input: [{ role: "user", content: "Say hi" }],
      store: false,
      max_output_tokens: 32,
    });
    expect(payload).not.toHaveProperty("temperature");
  });

  it("maps tool results back into function_call_output items", () => {
    const payload = toResponsesRequest({
      model: "DeepSeek-V4-Flash",
      messages: [
        { role: "user", content: "Ping" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "ping", arguments: '{"value":"hi"}' } },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: '{"ok":true}' },
      ],
    });

    expect(payload.input).toEqual([
      { role: "user", content: "Ping" },
      { role: "assistant", content: 'Called ping with {"value":"hi"}' },
      { role: "user", content: 'Tool result (tool):\n{"ok":true}' },
    ]);
  });

  it("flattens Fairlx-local tool calls instead of inventing Azure function_call ids", () => {
    const payload = toResponsesRequest({
      model: "gpt-5.6-luna",
      messages: [
        { role: "user", content: "List work items" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "4506da09-6d56-4aa9-9c24-f890e54ad7f5",
              type: "function",
              function: { name: "work_item_list", arguments: '{"projectId":"p1"}' },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "4506da09-6d56-4aa9-9c24-f890e54ad7f5",
          name: "work_item_list",
          content: '{"ok":true}',
        },
      ],
    });

    expect(payload.input).toEqual([
      { role: "user", content: "List work items" },
      { role: "assistant", content: 'Called work_item_list with {"projectId":"p1"}' },
      { role: "user", content: 'Tool result (work_item_list):\n{"ok":true}' },
    ]);
    expect(JSON.stringify(payload.input)).not.toContain("function_call");
    expect(JSON.stringify(payload.input)).not.toContain("4506da09");
  });

  it("replays Azure function_call item ids that already begin with fc", () => {
    const payload = toResponsesRequest({
      model: "gpt-5.6-luna",
      messages: [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_9",
              item_id: "fc_abc123",
              type: "function",
              function: { name: "ping", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_9", content: "ok" },
      ],
    });

    expect(payload.input).toEqual([
      {
        type: "function_call",
        id: "fc_abc123",
        call_id: "call_9",
        name: "ping",
        arguments: "{}",
      },
      { type: "function_call_output", call_id: "call_9", output: "ok" },
    ]);
  });

  it("normalizes Responses output and usage into chat.completions shape", () => {
    expect(
      isResponsesResponse({
        object: "response",
        output: [],
      }),
    ).toBe(true);

    const normalized = fromResponsesResponse({
      object: "response",
      status: "completed",
      output: [
        { type: "reasoning", summary: [{ type: "summary_text", text: "Need to ping." }] },
        {
          type: "function_call",
          id: "fc_item_1",
          call_id: "call_9",
          name: "ping",
          arguments: '{"value":"hello"}',
        },
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Pinging now." }],
        },
      ],
      usage: {
        input_tokens: 40,
        output_tokens: 12,
        total_tokens: 52,
        input_tokens_details: { cached_tokens: 8 },
      },
    });

    expect(normalized.choices[0]?.message).toEqual({
      role: "assistant",
      content: "Pinging now.",
      reasoning_content: "Need to ping.",
      tool_calls: [
        {
          id: "call_9",
          item_id: "fc_item_1",
          type: "function",
          function: { name: "ping", arguments: '{"value":"hello"}' },
        },
      ],
    });
    expect(normalized.usage).toMatchObject({
      prompt_tokens: 40,
      completion_tokens: 12,
      total_tokens: 52,
      prompt_tokens_details: { cached_tokens: 8 },
    });
  });

  it("maps a Foundry function_call output with an empty assistant message", () => {
    const normalized = fromResponsesResponse({
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "\n\n" }],
        },
        {
          type: "function_call",
          call_id: "call_658675d511094c558d1b1e9a",
          name: "ping",
          arguments: '{"value": "hello"}',
        },
      ],
      usage: { input_tokens: 291, output_tokens: 43, total_tokens: 334 },
    });

    expect(normalized.choices[0]?.message.content).toBeNull();
    expect(normalized.choices[0]?.message.tool_calls).toEqual([
      {
        id: "call_658675d511094c558d1b1e9a",
        type: "function",
        function: { name: "ping", arguments: '{"value": "hello"}' },
      },
    ]);
  });
});
