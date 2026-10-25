import { describe, expect, it } from "vitest";

import {
  createBackendLogger,
  isSensitiveMetaKey,
  REDACTED,
  redactMeta,
  toErrorRecord,
} from "../backend-logger.js";

interface Collected {
  lines: Array<Record<string, unknown>>;
  write(line: string): void;
}

function collector(): Collected {
  const lines: Array<Record<string, unknown>> = [];
  return {
    lines,
    write(line: string) {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  };
}

describe("createBackendLogger", () => {
  it("emits one JSON line per event with level label, message and correlation fields", () => {
    const out = collector();
    const logger = createBackendLogger({ level: "debug", destination: out });

    logger.debug({ message: "d", code: "a.b" });
    logger.info({ message: "i", requestId: "r1", userId: "u1" });
    logger.warn({ message: "w", phase: "boot", sessionId: "s1" });
    logger.error({ message: "e" });

    expect(out.lines.map((l) => l.level)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
    expect(out.lines[0]).toMatchObject({ msg: "d", code: "a.b" });
    expect(out.lines[1]).toMatchObject({
      msg: "i",
      requestId: "r1",
      userId: "u1",
    });
    expect(out.lines[2]).toMatchObject({ phase: "boot", sessionId: "s1" });
    expect(out.lines[0]).not.toHaveProperty("pid");
    expect(out.lines[0]).not.toHaveProperty("hostname");
  });

  it("drops events below the configured level", () => {
    const out = collector();
    const logger = createBackendLogger({ level: "warn", destination: out });
    logger.debug({ message: "d" });
    logger.info({ message: "i" });
    logger.warn({ message: "w" });
    expect(out.lines.map((l) => l.msg)).toEqual(["w"]);
  });

  it("redacts content-carrying meta keys and keeps counts, lengths, paths", () => {
    const out = collector();
    const logger = createBackendLogger({ destination: out });
    logger.info({
      message: "x",
      meta: {
        prompt: "the whole system prompt",
        content: "# inbox\n- secret note",
        headers: { authorization: "Bearer abc" },
        requestBodyValues: { messages: [] },
        provider: { responseBody: "{...}", name: "anthropic" },
        currentContentLength: 1234,
        promptTokens: 42,
        filePath: "tasks/next-actions.md",
        durationMs: 12,
      },
    });

    const meta = out.lines[0]?.meta as Record<string, unknown>;
    expect(meta).toEqual({
      prompt: REDACTED,
      content: REDACTED,
      headers: REDACTED,
      requestBodyValues: REDACTED,
      provider: { responseBody: REDACTED, name: "anthropic" },
      currentContentLength: 1234,
      promptTokens: 42,
      filePath: "tasks/next-actions.md",
      durationMs: 12,
    });
    expect(JSON.stringify(out.lines[0])).not.toContain("secret note");
    expect(JSON.stringify(out.lines[0])).not.toContain("Bearer");
  });

  it("reduces err to metadata: no provider bodies, no enumerable extras", () => {
    const out = collector();
    const logger = createBackendLogger({ destination: out });
    const err = Object.assign(new Error("upstream 529"), {
      statusCode: 529,
      isRetryable: true,
      responseBody: '{"error":"overloaded"}',
      requestBodyValues: { messages: ["the prompt"] },
      responseHeaders: { "request-id": "abc" },
    });
    logger.error({ message: "provider failed", err });

    const emitted = out.lines[0]?.err as Record<string, unknown>;
    expect(emitted).toMatchObject({
      name: "Error",
      message: "upstream 529",
      statusCode: 529,
      isRetryable: true,
    });
    expect(typeof emitted.stack).toBe("string");
    expect(emitted).not.toHaveProperty("responseBody");
    expect(emitted).not.toHaveProperty("requestBodyValues");
    expect(emitted).not.toHaveProperty("responseHeaders");
    expect(JSON.stringify(out.lines[0])).not.toContain("the prompt");
  });

  it("never throws, even when the destination does", () => {
    const logger = createBackendLogger({
      destination: {
        write() {
          throw new Error("sink broken");
        },
      },
    });
    expect(() => logger.error({ message: "x" })).not.toThrow();
    expect(() => logger.info({ message: "x", meta: { a: 1 } })).not.toThrow();
  });
});

describe("isSensitiveMetaKey", () => {
  it.each([
    "prompt",
    "systemPrompt",
    "messages",
    "content",
    "fileContent",
    "body",
    "responseBody",
    "requestBodyValues",
    "headers",
    "response_headers",
    "x-api-key",
    "apiKey",
    "accessToken",
    "authorization",
    "cookie",
    "toolInput",
    "toolOutput",
    "payload",
    "args",
    "data",
  ])("redacts %s", (key) => {
    expect(isSensitiveMetaKey(key)).toBe(true);
  });

  it.each([
    "currentContentLength",
    "failedSearchLength",
    "promptTokens",
    "inputTokens",
    "outputTokens",
    "messageCount",
    "messageId",
    "headerNames",
    "contentType",
    "filePath",
    "toolName",
    "modelId",
    "provider",
    "statusCode",
    "isRetryable",
    "durationMs",
    "matchCount",
    "port",
    "created",
  ])("keeps %s", (key) => {
    expect(isSensitiveMetaKey(key)).toBe(false);
  });
});

describe("redactMeta", () => {
  it("recurses into nested plain objects and arrays, leaves other values alone", () => {
    expect(
      redactMeta({
        list: [{ content: "x", n: 1 }, "plain", 3],
        when: new Date(0),
        nested: { deeper: { apiKey: "k", ok: true } },
      }),
    ).toEqual({
      list: [{ content: REDACTED, n: 1 }, "plain", 3],
      when: new Date(0),
      nested: { deeper: { apiKey: REDACTED, ok: true } },
    });
  });
});

describe("toErrorRecord", () => {
  it("keeps a string err as the message and describes other non-errors by type", () => {
    expect(toErrorRecord("boom")).toEqual({
      name: "NonError",
      message: "boom",
    });
    expect(toErrorRecord({ responseBody: "x" })).toEqual({
      name: "NonError",
      message: "object",
    });
  });

  it("copies a string code (Node fs errors)", () => {
    const err = Object.assign(new Error("missing"), { code: "ENOENT" });
    expect(toErrorRecord(err)).toMatchObject({ code: "ENOENT" });
  });
});
