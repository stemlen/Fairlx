import { describe, expect, it } from "vitest";

import { formatAgentTurnError, isContextLengthError, isTransientModelFetchError } from "./turn-errors";

describe("formatAgentTurnError", () => {
  it("maps AbortError to a timeout message", () => {
    const error = new Error("This operation was aborted");
    error.name = "AbortError";
    expect(formatAgentTurnError(error, 60_000)).toBe(
      "The model request timed out after 60s. Try again."
    );
  });

  it("maps TimeoutError to a timeout message", () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    expect(formatAgentTurnError(error)).toMatch(/timed out after \d+s/);
  });

  it("uses an 8-minute default so paid long-context calls are not killed at 60s", () => {
    const error = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(formatAgentTurnError(error, 480_000)).toBe(
      "The model request timed out after 480s. Try again.",
    );
  });

  it("passes through other errors", () => {
    expect(formatAgentTurnError(new Error("No AI model is configured."))).toBe(
      "No AI model is configured."
    );
  });

  it("maps fetch failed to a retryable provider drop", () => {
    expect(formatAgentTurnError(new Error("fetch failed"))).toBe(
      "The model provider connection dropped. Retry the same message.",
    );
  });
});

describe("isContextLengthError", () => {
  it("detects provider context-window failures and does not treat them as transient", () => {
    const error = new Error("This model's maximum context length is 72000 tokens");
    expect(isContextLengthError(error)).toBe(true);
    expect(isTransientModelFetchError(error)).toBe(false);
  });
});
