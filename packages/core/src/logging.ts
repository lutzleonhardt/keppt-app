// Runtime-neutral logging contract for the shared core. Pino, Sentry,
// OpenTelemetry, browser console, and Capacitor adapters all sit *outside*
// this module. The CLI, the future Express backend, and the future Angular
// app each provide their own Logger implementation.
//
// ---------------------------------------------------------------------------
// Conventions for emitting events (read before adding a new `logger.*` call)
// ---------------------------------------------------------------------------
//
// `code` naming. Stable string IDs in the shape `<surface>.<verb_or_noun>`,
// snake_case segments, dots between segments. Examples:
//   `repo.search.path_skipped`
//   `tool.edit_file.retry_budget_exhausted`
//   `tool.edit_file.failed`
//   `tool.<name>.invalid_path`          (one per offending tool)
//   `stream.tool_error`                 (CLI-level)
// Codes are **contract surface** — a future Pino/Sentry sink and backend
// alerts will key off them. Renaming a code is a breaking change: update
// the emitter, every test that asserts the code, and any downstream consumer
// in the same commit. Codes are pinned via `MemoryLogger.byCode(...)` in
// `tools.test.ts` and `local-file-repository.test.ts` so a drift is caught
// at PR review, not in production.
//
// Level guidance.
//   `debug` — high-volume internal correlation (search-skip, cache-hit, etc.).
//             Backend operators tail this; the CLI persists it but stays
//             silent on the terminal. Acceptable to emit per-iteration.
//   `info`  — expected, recoverable events worth correlating in aggregate.
//             The LLM-visible `tool.edit_file.failed` is the canonical
//             example: nothing is wrong, but operators want to see retry
//             patterns across sessions.
//   `warn`  — adversarial input or budget-exhaustion signals. Something the
//             operator should know about even though tool semantics handle
//             it gracefully (`tool.<name>.invalid_path`,
//             `tool.edit_file.retry_budget_exhausted`,
//             `stream.tool_error`).
//   `error` — something broke that the *user* needs to see. The CLI
//             additionally renders a terminal summary at this level. Reserve
//             for fatal/unhandled conditions, not for routine tool failures.
//
// `meta` payload conventions.
//   - **Bounded.** Never put raw vault content, full model output, request
//     bodies, or any unbounded string into `meta`. Log lengths/counts/IDs
//     instead. See `tools.ts:editFileTool` for the canonical pattern:
//     `failedSearchLength`, `currentContentLength`, `matchCount` — not the
//     strings themselves. Vault notes are personal data; the JSONL log would
//     otherwise grow with file size and leak content outside the audited
//     mutation-history path.
//   - **No secrets.** Header maps must be passed through
//     `redactSensitiveHeaders` before logging. Provider request/response
//     diagnostics live in the CLI's vault-local JSONL only — they MUST NOT
//     be reused for cloud sinks in Phase 2a without further redaction.
//   - **Stable shapes per code.** Once a code emits `meta: { filePath,
//     reason }`, downstream consumers parse on those keys. Add fields freely;
//     do not rename or remove without the same breaking-change discipline
//     as the code itself.
//   - **Top-level fields** (`requestId`, `userId`, `sessionId`, `phase`,
//     `err`) are for cross-cutting correlation. Anything tied to a specific
//     code goes in `meta`. `err` is the place for `Error` / `APICallError`
//     objects — the CLI's `appendCliLogEntry` knows how to expand them.
//
// Where redaction lives. `redactSensitiveHeaders` is the single source of
// truth for header redaction across CLI and future backend. Payload-level
// redaction (prompts, file contents, provider bodies) belongs to the cloud
// adapter that ships in Phase 2a.0 — do not add it here. CLI sinks may
// stay verbose because the JSONL is developer-owned.
//
// Currently emitted codes (registry — keep in sync when adding a seam):
//   debug — `repo.search.path_skipped`
//   info  — `tool.edit_file.failed`
//   warn  — `tool.read_file.invalid_path`
//   warn  — `tool.write_file.invalid_path`
//   warn  — `tool.edit_file.invalid_path`
//   warn  — `tool.edit_file.retry_budget_exhausted`
//   warn  — `stream.tool_error`                     (CLI only)

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  message: string;
  code?: string;
  phase?: string;
  // Our own per-request correlation ID (e.g. a UUID minted by the future
  // Express middleware and propagated through all downstream logs). NOT
  // Anthropic's `request-id` response header — that one identifies a single
  // provider call and belongs in `meta.providerRequestId` so multiple
  // provider calls inside one backend request don't fight for this slot.
  requestId?: string;
  userId?: string;
  sessionId?: string;
  err?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * Runtime-neutral logging contract.
 *
 * Implementations MUST NOT throw synchronously. Diagnostics are a side
 * channel — a logger failure must not change caller semantics (e.g.
 * a tool returning a structured `ok: false` result must not turn into a
 * thrown stream error just because the log sink is broken). Adapters
 * that may fail (file I/O, network) must swallow or queue the error
 * inside the implementation. `safeLog` wraps any Logger to enforce
 * this defensively at module boundaries.
 */
export interface Logger {
  debug(event: LogEvent): void;
  info(event: LogEvent): void;
  warn(event: LogEvent): void;
  error(event: LogEvent): void;
}

// Defensive wrapper — guarantees the four level methods never throw,
// regardless of the underlying adapter. Used at the buildTools seam so
// a misbehaving logger cannot abort a turn or change tool semantics.
//
// Idempotent in behavior: `safeLog(safeLog(x))` is functionally identical
// to `safeLog(x)` (the inner try/catch absorbs everything, the outer one
// never fires). One extra function-frame per call is the only cost. We
// deliberately do not enforce idempotence at the type or runtime level
// because (a) the cost is unmeasurable and (b) the failure mode that
// actually bites — *forgetting* to wrap at a new seam — is unaffected by
// guards against double-wrap. Audit new seams against the existing ones
// (see [[feedback-audit-all-seams]]).
export function safeLog(logger: Logger): Logger {
  const guard =
    (fn: (event: LogEvent) => void) =>
    (event: LogEvent): void => {
      try {
        fn(event);
      } catch {
        // Diagnostics are not allowed to change caller behavior.
      }
    };
  return {
    debug: guard(logger.debug.bind(logger)),
    info: guard(logger.info.bind(logger)),
    warn: guard(logger.warn.bind(logger)),
    error: guard(logger.error.bind(logger)),
  };
}

export class NoopLogger implements Logger {
  debug(_event: LogEvent): void {}
  info(_event: LogEvent): void {}
  warn(_event: LogEvent): void {}
  error(_event: LogEvent): void {}
}

export interface MemoryLogEntry extends LogEvent {
  level: LogLevel;
}

export class MemoryLogger implements Logger {
  readonly events: MemoryLogEntry[] = [];

  debug(event: LogEvent): void {
    this.events.push({ level: "debug", ...event });
  }
  info(event: LogEvent): void {
    this.events.push({ level: "info", ...event });
  }
  warn(event: LogEvent): void {
    this.events.push({ level: "warn", ...event });
  }
  error(event: LogEvent): void {
    this.events.push({ level: "error", ...event });
  }

  byCode(code: string): MemoryLogEntry[] {
    return this.events.filter((e) => e.code === code);
  }

  clear(): void {
    this.events.length = 0;
  }
}

// Header keys redacted in operational diagnostics. Case-insensitive match;
// non-matched keys pass through untouched. Returning the same shape callers
// pass in (or undefined for undefined input) keeps this drop-in for the
// CLI's existing entry shape.
const SENSITIVE_HEADER_PATTERN =
  /^(set-cookie|cookie|authorization|x-api-key|api-key)$/i;

export function redactSensitiveHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = SENSITIVE_HEADER_PATTERN.test(key) ? "[redacted]" : value;
  }
  return redacted;
}
