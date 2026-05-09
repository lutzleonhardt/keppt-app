import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { APICallError } from "ai";

export interface AppendCliErrorLogResult {
  path: string;
  ok: boolean;
  error?: string;
}

export async function appendCliErrorLog(
  vaultPath: string,
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<AppendCliErrorLogResult> {
  const logPath = getCliErrorLogPath(vaultPath);
  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(
      logPath,
      `${JSON.stringify(buildCliErrorLogEntry(err, context))}\n`,
      "utf8",
    );
    return { path: logPath, ok: true };
  } catch (logErr) {
    return {
      path: logPath,
      ok: false,
      error: logErr instanceof Error ? logErr.message : String(logErr),
    };
  }
}

export function getCliErrorLogPath(vaultPath: string): string {
  return path.join(vaultPath, ".keppt", "logs", "cli-errors.jsonl");
}

function buildCliErrorLogEntry(
  err: unknown,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const base = {
    timestamp: new Date().toISOString(),
    context,
  };

  if (APICallError.isInstance(err)) {
    return {
      ...base,
      kind: "api_call_error",
      name: err.name,
      message: err.message,
      stack: err.stack,
      api: {
        url: err.url,
        statusCode: err.statusCode,
        isRetryable: err.isRetryable,
        requestBodyValues: err.requestBodyValues,
        responseHeaders: redactHeaders(err.responseHeaders),
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
      message: err.message,
      stack: err.stack,
    };
  }

  return {
    ...base,
    kind: "unknown",
    value: err,
  };
}

function redactHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/^(set-cookie|cookie|authorization|x-api-key|api-key)$/i.test(key)) {
      redacted[key] = "[redacted]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
