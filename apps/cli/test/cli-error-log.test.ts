import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { APICallError } from "ai";
import { describe, expect, it } from "vitest";

import {
  appendCliErrorLog,
  getCliErrorLogPath,
} from "../src/cli-error-log.js";

describe("appendCliErrorLog", () => {
  it("writes API call diagnostics to a vault-local JSONL file", async () => {
    const vaultPath = await mkdtemp(path.join(tmpdir(), "keppt-cli-log-"));
    const err = new APICallError({
      message: "low balance",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: { model: "claude-haiku-4-5" },
      statusCode: 400,
      responseHeaders: {
        "request-id": "req_123",
        "set-cookie": "secret",
      },
      responseBody: '{"error":"low balance"}',
      isRetryable: false,
      data: { error: { message: "low balance" } },
    });

    const result = await appendCliErrorLog(vaultPath, err, { phase: "stream" });

    expect(result).toEqual({ path: getCliErrorLogPath(vaultPath), ok: true });
    const lines = (await readFile(result.path, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      kind: "api_call_error",
      message: "low balance",
      context: { phase: "stream" },
      api: {
        statusCode: 400,
        requestBodyValues: { model: "claude-haiku-4-5" },
        responseHeaders: {
          "request-id": "req_123",
          "set-cookie": "[redacted]",
        },
      },
    });
  });
});
