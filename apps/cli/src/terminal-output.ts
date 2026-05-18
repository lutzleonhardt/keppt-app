// User-facing terminal output sink. Owns every write to stdout/stderr that
// is part of the REPL UX: streamed assistant text, tool-call status lines,
// tool-error summaries, abort messages, validation hints, and the final
// human-readable error summary line. Operational diagnostics (provider
// errors, tool-layer events, retry-budget exhaustion) flow through the
// CLI's Logger sink and land in .keppt/logs/cli-errors.jsonl — never here.

import { stdout, stderr } from "node:process";
import { formatCliError } from "./cli-errors.js";

export interface TerminalOutput {
  // Streamed assistant text written verbatim, no framing or newlines added.
  assistantText(text: string): void;
  // Tool-call status line: `\n[<name>…]\n`.
  toolStatus(name: string): void;
  // Tool-error stream part: `\nTool error (<name>): <message>\n` to stderr.
  // Uses formatCliError so unknown SDK error shapes don't dump util.inspect
  // output into the terminal (Task 3.6 reasoning).
  toolError(name: string, err: unknown): void;
  // Informational REPL line, e.g. "(stream aborted)" or
  // "(Press Ctrl+C again to exit.)". Framed with a leading and trailing \n.
  info(message: string): void;
  // One-line user-facing error summary written to stderr. Caller composes
  // the full message (prefix + formatCliError + log suffix); the sink only
  // appends a trailing newline.
  errorSummary(message: string): void;
  // Final newline after a streaming response so the prompt re-prints on a
  // fresh line.
  endStream(): void;
}

export function createStdTerminalOutput(): TerminalOutput {
  return {
    assistantText: (text) => {
      stdout.write(text);
    },
    toolStatus: (name) => {
      stdout.write(`\n[${name}…]\n`);
    },
    toolError: (name, err) => {
      stderr.write(`\nTool error (${name}): ${formatCliError(err)}\n`);
    },
    info: (message) => {
      stdout.write(`\n${message}\n`);
    },
    errorSummary: (message) => {
      stderr.write(`${message}\n`);
    },
    endStream: () => {
      stdout.write("\n");
    },
  };
}
