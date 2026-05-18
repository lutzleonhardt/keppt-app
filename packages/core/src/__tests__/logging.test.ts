import { describe, expect, it } from "vitest";

import {
  MemoryLogger,
  NoopLogger,
  redactSensitiveHeaders,
  safeLog,
  type LogEvent,
  type Logger,
} from "../logging.js";

describe("NoopLogger", () => {
  it("accepts all four levels without throwing or producing output", () => {
    const logger = new NoopLogger();
    const sample: LogEvent = { message: "noop" };
    expect(() => logger.debug(sample)).not.toThrow();
    expect(() => logger.info(sample)).not.toThrow();
    expect(() => logger.warn(sample)).not.toThrow();
    expect(() => logger.error(sample)).not.toThrow();
  });
});

describe("MemoryLogger", () => {
  it("records events with level, preserves insertion order, and exposes payload fields", () => {
    const logger = new MemoryLogger();
    logger.debug({ message: "first", code: "a.b", meta: { x: 1 } });
    logger.warn({ message: "second", code: "c.d", err: new Error("boom") });
    logger.info({ message: "third" });
    logger.error({ message: "fourth", code: "e.f", phase: "stream" });

    expect(logger.events).toHaveLength(4);
    expect(logger.events[0]).toMatchObject({
      level: "debug",
      message: "first",
      code: "a.b",
      meta: { x: 1 },
    });
    expect(logger.events[1]).toMatchObject({
      level: "warn",
      message: "second",
      code: "c.d",
    });
    expect(logger.events[1]?.err).toBeInstanceOf(Error);
    expect(logger.events[2]).toMatchObject({ level: "info", message: "third" });
    expect(logger.events[3]).toMatchObject({
      level: "error",
      message: "fourth",
      code: "e.f",
      phase: "stream",
    });
  });

  it("byCode filters by event code; clear() empties the buffer", () => {
    const logger = new MemoryLogger();
    logger.warn({ message: "a", code: "tool.edit_file.failed" });
    logger.warn({ message: "b", code: "tool.read_file.invalid_path" });
    logger.warn({ message: "c", code: "tool.edit_file.failed" });

    const editFailures = logger.byCode("tool.edit_file.failed");
    expect(editFailures).toHaveLength(2);
    expect(editFailures.map((e) => e.message)).toEqual(["a", "c"]);

    logger.clear();
    expect(logger.events).toHaveLength(0);
  });
});

describe("safeLog", () => {
  class ThrowingLogger implements Logger {
    calls: Array<{ level: string; event: LogEvent }> = [];
    debug(event: LogEvent): void {
      this.calls.push({ level: "debug", event });
      throw new Error("boom debug");
    }
    info(event: LogEvent): void {
      this.calls.push({ level: "info", event });
      throw new Error("boom info");
    }
    warn(event: LogEvent): void {
      this.calls.push({ level: "warn", event });
      throw new Error("boom warn");
    }
    error(event: LogEvent): void {
      this.calls.push({ level: "error", event });
      throw new Error("boom error");
    }
  }

  it("swallows synchronous throws on every level and still forwards the call", () => {
    const inner = new ThrowingLogger();
    const wrapped = safeLog(inner);
    const sample: LogEvent = { message: "x" };

    expect(() => wrapped.debug(sample)).not.toThrow();
    expect(() => wrapped.info(sample)).not.toThrow();
    expect(() => wrapped.warn(sample)).not.toThrow();
    expect(() => wrapped.error(sample)).not.toThrow();

    expect(inner.calls.map((c) => c.level)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
  });

  it("forwards the event payload unchanged to the wrapped logger", () => {
    const recorded: LogEvent[] = [];
    const inner: Logger = {
      debug: (e) => recorded.push(e),
      info: (e) => recorded.push(e),
      warn: (e) => recorded.push(e),
      error: (e) => recorded.push(e),
    };
    const wrapped = safeLog(inner);
    const event: LogEvent = { message: "hi", code: "x.y", meta: { a: 1 } };
    wrapped.warn(event);
    expect(recorded).toEqual([event]);
  });
});

describe("redactSensitiveHeaders", () => {
  it("returns undefined for undefined input", () => {
    expect(redactSensitiveHeaders(undefined)).toBeUndefined();
  });

  it("returns an empty object for empty input", () => {
    expect(redactSensitiveHeaders({})).toEqual({});
  });

  it("redacts sensitive header keys case-insensitively", () => {
    const input: Record<string, string> = {
      "Set-Cookie": "session=abc",
      cookie: "tracker=xyz",
      Authorization: "Bearer token",
      "X-API-KEY": "k123",
      "api-key": "k456",
    };
    const out = redactSensitiveHeaders(input);
    expect(out).toEqual({
      "Set-Cookie": "[redacted]",
      cookie: "[redacted]",
      Authorization: "[redacted]",
      "X-API-KEY": "[redacted]",
      "api-key": "[redacted]",
    });
  });

  it("leaves non-sensitive keys untouched and preserves their values verbatim", () => {
    const out = redactSensitiveHeaders({
      "content-type": "application/json",
      "request-id": "req_abc",
      "x-custom": "value",
    });
    expect(out).toEqual({
      "content-type": "application/json",
      "request-id": "req_abc",
      "x-custom": "value",
    });
  });

  it("redacts only the sensitive subset when mixed with non-sensitive keys", () => {
    const out = redactSensitiveHeaders({
      authorization: "secret",
      "content-type": "application/json",
      "X-API-Key": "abc",
      "request-id": "req_42",
    });
    expect(out).toEqual({
      authorization: "[redacted]",
      "content-type": "application/json",
      "X-API-Key": "[redacted]",
      "request-id": "req_42",
    });
  });
});
