// Pino adapter for the core Logger contract. Emits one JSON line per event
// to stdout. This is the payload-redaction seam the core logging conventions
// defer to: `meta` keys that carry content are blanked and `err` is reduced
// to metadata before anything reaches Pino, so a careless call site cannot
// leak prompts, vault content, headers, or provider bodies into the log.

import { pino, type DestinationStream } from "pino";
import { safeLog, type LogEvent, type Logger, type LogLevel } from "@gtd/core";

export interface BackendLoggerOptions {
  level?: LogLevel;
  /** Tests inject a collector; production writes to stdout. */
  destination?: DestinationStream;
}

export function createBackendLogger(
  options: BackendLoggerOptions = {},
): Logger {
  const pinoOptions = {
    level: options.level ?? "info",
    base: null,
    formatters: { level: (label: string) => ({ level: label }) },
  };
  const sink = options.destination
    ? pino(pinoOptions, options.destination)
    : pino(pinoOptions);

  const emit = (level: LogLevel, event: LogEvent): void => {
    const { message, err, meta, ...correlation } = event;
    const record: Record<string, unknown> = { ...correlation };
    if (err !== undefined) record.err = toErrorRecord(err);
    if (meta !== undefined) record.meta = redactMeta(meta);
    sink[level](record, message);
  };

  return safeLog({
    debug: (event) => emit("debug", event),
    info: (event) => emit("info", event),
    warn: (event) => emit("warn", event),
    error: (event) => emit("error", event),
  });
}

export const REDACTED = "[redacted]";

// A key is redacted when one of its name segments names content and the key
// does not end in a size/identity qualifier. `currentContentLength`,
// `promptTokens`, `messageId` stay; `systemPrompt`, `responseHeaders`,
// `requestBodyValues`, `apiKey` go.
const CONTENT_SEGMENTS = new Set([
  "prompt",
  "prompts",
  "message",
  "messages",
  "content",
  "contents",
  "body",
  "bodies",
  "header",
  "headers",
  "token",
  "secret",
  "secrets",
  "password",
  "passwords",
  "key",
  "authorization",
  "cookie",
  "cookies",
  "text",
  "input",
  "inputs",
  "output",
  "outputs",
  "payload",
  "payloads",
  "arg",
  "args",
  "argument",
  "arguments",
  "data",
]);
const QUALIFIER_SEGMENTS = new Set([
  "length",
  "len",
  "count",
  "size",
  "bytes",
  "chars",
  "tokens",
  "id",
  "ids",
  "name",
  "names",
  "type",
  "kind",
  "hash",
]);

export function isSensitiveMetaKey(key: string): boolean {
  const segments = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s_.-]+/)
    .filter((s) => s.length > 0);
  const last = segments[segments.length - 1];
  if (last !== undefined && QUALIFIER_SEGMENTS.has(last)) return false;
  return segments.some((s) => CONTENT_SEGMENTS.has(s));
}

export function redactMeta(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = isSensitiveMetaKey(key) ? REDACTED : redactValue(value);
  }
  return out;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (isPlainObject(value)) return redactMeta(value);
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export interface ErrorRecord {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
  isRetryable?: boolean;
}

// Allowlist, not Pino's default serializer: that one copies every enumerable
// own property, which for an `APICallError` includes the provider request
// and response bodies. `message` and `stack` stay verbatim on purpose: they
// are the diagnostic payload, and a provider's error text ("prompt is too
// long …") is not the prompt. Review finding declined in Task 1.
export function toErrorRecord(err: unknown): ErrorRecord {
  if (!(err instanceof Error)) {
    return {
      name: "NonError",
      message: typeof err === "string" ? err : typeof err,
    };
  }
  const record: ErrorRecord = { name: err.name, message: err.message };
  if (err.stack !== undefined) record.stack = err.stack;
  const extra = err as unknown as Record<string, unknown>;
  if (typeof extra.code === "string") record.code = extra.code;
  if (typeof extra.statusCode === "number")
    record.statusCode = extra.statusCode;
  if (typeof extra.isRetryable === "boolean") {
    record.isRetryable = extra.isRetryable;
  }
  return record;
}
