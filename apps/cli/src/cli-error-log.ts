import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { APICallError } from "ai";
import {
  type LogEvent,
  type LogLevel,
  redactSensitiveHeaders,
} from "@gtd/core";

export interface AppendCliErrorLogResult {
  path: string;
  ok: boolean;
  error?: string;
}

export function getCliErrorLogPath(vaultPath: string): string {
  return path.join(vaultPath, ".keppt", "logs", "cli-errors.jsonl");
}

// Generic append for any LogEvent. Used by the CLI Logger adapter for all
// four levels. Verbose APICallError fields are still preserved when the
// event carries one — that's the dev-only diagnostic surface from Task 3.6
// and the whole reason this log exists. Non-error events get the compact
// shape (level + message + code + meta) without the API-error block.
export async function appendCliLogEntry(
  vaultPath: string,
  level: LogLevel,
  event: LogEvent,
): Promise<AppendCliErrorLogResult> {
  const target = getCliErrorLogPath(vaultPath);
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await appendFile(
      target,
      `${JSON.stringify(buildEntry(level, event))}\n`,
      "utf8",
    );
    return { path: target, ok: true };
  } catch (logErr) {
    return {
      path: target,
      ok: false,
      error: logErr instanceof Error ? logErr.message : String(logErr),
    };
  }
}

// Backwards-compatible wrapper for the Task 3.6 stream-error path. The
// caller (apps/cli/src/index.ts) needs the awaited result so it can render
// the JSONL path inside the user-facing error summary; the Logger interface
// is sync, so direct callers route through here instead of cliLogger.error.
export async function appendCliErrorLog(
  vaultPath: string,
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<AppendCliErrorLogResult> {
  return appendCliLogEntry(vaultPath, "error", {
    message: extractMessage(err),
    err,
    meta: context,
  });
}

function buildEntry(level: LogLevel, event: LogEvent): Record<string, unknown> {
  const base: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message: event.message,
  };
  if (event.code !== undefined) base.code = event.code;
  if (event.phase !== undefined) base.phase = event.phase;
  if (event.requestId !== undefined) base.requestId = event.requestId;
  if (event.userId !== undefined) base.userId = event.userId;
  if (event.sessionId !== undefined) base.sessionId = event.sessionId;
  if (event.meta !== undefined) base.meta = event.meta;

  const err = event.err;
  if (APICallError.isInstance(err)) {
    return {
      ...base,
      kind: "api_call_error",
      name: err.name,
      stack: err.stack,
      api: {
        url: err.url,
        statusCode: err.statusCode,
        isRetryable: err.isRetryable,
        requestBodyValues: err.requestBodyValues,
        responseHeaders: redactSensitiveHeaders(err.responseHeaders),
        responseBody: err.responseBody,
        data: err.data,
      },
    };
  }

  if (err instanceof Error) {
    return {
      ...base,
      kind: "error",
      name: err.name,
      stack: err.stack,
    };
  }

  if (err !== undefined) {
    return { ...base, kind: "unknown", value: err };
  }

  return base;
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
