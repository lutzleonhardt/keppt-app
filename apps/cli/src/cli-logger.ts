// CLI Logger adapter. Implements the runtime-neutral Logger contract from
// @gtd/core and persists every emitted event to the vault-local JSONL log
// at .keppt/logs/cli-errors.jsonl. The error level additionally renders a
// concise terminal summary so the user sees something happened without the
// REPL going silent.
//
// Why a per-logger write chain:
//   The Logger interface is sync (void returns). Without serialization,
//   four logger.* calls in quick succession race their fs.appendFile
//   syscalls — the kernel's O_APPEND atomicity guarantees no interleaving
//   *within* a write, but the order *between* writes is whichever syscall
//   the scheduler picks up first. For diagnostic logs the call-order *is*
//   the contract, so each call appends to a chain that the next call
//   awaits. The chain is per-logger-instance and never throws (errors are
//   swallowed) so a single failed write does not poison subsequent ones.
//
// Why fire-and-forget on the caller side:
//   Core seams (LocalFileRepository, buildTools) cannot reasonably await
//   a logger call inside their own contracts. The CLI's stream-error path
//   that *does* need ordering between the JSONL write and the user-facing
//   summary calls appendCliErrorLog directly (see apps/cli/src/index.ts)
//   instead of routing through cliLogger.error — preserves the Task 3.6
//   UX where the terminal line includes the actual log path.

import type { Logger, LogEvent, LogLevel } from "@gtd/core";

import {
  appendCliLogEntry,
  getCliErrorLogPath,
  type AppendCliErrorLogResult,
} from "./cli-error-log.js";
import { formatCliError } from "./cli-errors.js";
import type { TerminalOutput } from "./terminal-output.js";

export interface CreateCliLoggerOptions {
  vaultPath: string;
  terminal: TerminalOutput;
}

export function createCliLogger({
  vaultPath,
  terminal,
}: CreateCliLoggerOptions): Logger {
  let chain: Promise<unknown> = Promise.resolve();

  const enqueue = (
    level: LogLevel,
    event: LogEvent,
  ): Promise<AppendCliErrorLogResult> => {
    const next = chain.then(() => appendCliLogEntry(vaultPath, level, event));
    chain = next.catch(() => undefined);
    return next;
  };

  return {
    debug: (event) => {
      void enqueue("debug", event).catch(() => undefined);
    },
    info: (event) => {
      void enqueue("info", event).catch(() => undefined);
    },
    warn: (event) => {
      void enqueue("warn", event).catch(() => undefined);
    },
    error: (event) => {
      void writeAndSummarize(enqueue, terminal, event, vaultPath);
    },
  };
}

async function writeAndSummarize(
  enqueue: (level: LogLevel, event: LogEvent) => Promise<AppendCliErrorLogResult>,
  terminal: TerminalOutput,
  event: LogEvent,
  vaultPath: string,
): Promise<void> {
  let log: AppendCliErrorLogResult;
  try {
    log = await enqueue("error", event);
  } catch (writeErr) {
    log = {
      path: getCliErrorLogPath(vaultPath),
      ok: false,
      error: writeErr instanceof Error ? writeErr.message : String(writeErr),
    };
  }
  const suffix = log.ok
    ? `\nDetails logged to: ${log.path}`
    : `\nCould not write error log (${log.path}): ${log.error}`;
  terminal.errorSummary(`${formatCliError(event.err)}${suffix}`);
}
