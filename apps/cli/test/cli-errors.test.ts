import { APICallError } from "ai";
import { describe, expect, it } from "vitest";

import { formatCliError } from "../src/cli-errors.js";

describe("formatCliError", () => {
  it("formats Anthropic low-balance API errors without stack or request body", () => {
    const err = new APICallError({
      message:
        "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: { model: "claude-haiku-4-5", messages: [{ role: "user" }] },
      statusCode: 400,
      responseHeaders: { "request-id": "req_123" },
      isRetryable: false,
      data: {
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
        },
      },
    });

    expect(formatCliError(err)).toBe(
      "HTTP 400: Anthropic credit balance is too low. Add credits in Anthropic Plans & Billing, then retry. Request ID: req_123.",
    );
    expect(formatCliError(err)).not.toContain("claude-haiku-4-5");
  });

  it("formats OpenAI errors using x-request-id and provider-neutral wording", () => {
    const err = new APICallError({
      message: "You exceeded your current quota, please check your plan and billing details.",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: { model: "gpt-4o", messages: [] },
      statusCode: 429,
      responseHeaders: { "x-request-id": "req_openai_456" },
      isRetryable: true,
      data: { error: { message: "...", type: "insufficient_quota", code: "insufficient_quota" } },
    });

    expect(formatCliError(err)).toBe(
      "HTTP 429: Rate limit reached. Wait a bit, then retry. Request ID: req_openai_456.",
    );
  });

  it("keeps unknown errors concise", () => {
    expect(formatCliError(new Error("boom"))).toBe("boom");
  });
});
