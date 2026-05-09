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

  it("keeps unknown errors concise", () => {
    expect(formatCliError(new Error("boom"))).toBe("boom");
  });
});
