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
  // Tool-call status line: `\n[<name> <arg>]\n` (or `\n[<name>]\n` when the
  // tool has no displayable argument). `input` is the raw tool input object
  // emitted by the AI SDK on the `tool-call` stream part; see
  // `formatToolStatusLabel` for the per-tool arg mapping.
  toolStatus(name: string, input?: unknown): void;
  // Tool-error stream part: `\nTool error (<name>): <message>\n` to stderr.
  // Uses formatCliError so unknown SDK error shapes don't dump util.inspect
  // output into the terminal (Task 3.6 reasoning).
  toolError(name: string, err: unknown): void;
  // Informational REPL line, e.g. "(stream aborted)" or
  // "(Press Ctrl+C again to exit.)". Framed with a leading and trailing \n.
  info(message: string): void;
  // Session boundary banner — printed once at CLI start and again whenever a
  // UTC-midnight rollover moves new turns into a fresh session file. Without
  // this, a CLI left open across midnight silently loses its conversational
  // context (next turn starts an empty session for the new date) and the
  // user only notices via odd "I don't remember that" replies. The banner
  // makes the boundary visible.
  sessionBanner(message: string): void;
  // One line of replayed prior conversation, written right after a
  // `resumed session` banner so the user immediately sees what context the
  // CLI just loaded — instead of staring at a blank prompt and guessing
  // whether the last `read_file` he asked for actually survived the restart.
  replayLine(line: string): void;
  // Numbered quick-reply options proposed by the model through
  // suggest_quick_replies. The required `question` field is rendered as
  // a single prose line above the chips so the user always sees what the
  // choice is answering — schema-enforced replacement for the "model just
  // dumped chips with no context" failure mode observed on cheap models
  // (see formatQuickReplies + 2026-05-21 design note).
  quickReplies(payload: {
    question: string;
    options: readonly string[];
  }): void;
  // One-line user-facing error summary written to stderr. Caller composes
  // the full message (prefix + formatCliError + log suffix); the sink only
  // appends a trailing newline.
  errorSummary(message: string): void;
  // Final newline after a streaming response so the prompt re-prints on a
  // fresh line.
  endStream(): void;
}

// Per-tool mapping from the SDK-supplied input object to a single short
// argument shown next to the tool name. Kept narrow on purpose: file paths
// for the file tools, the query for search, and the optional prefix for
// list_files. Unknown tools or missing/empty fields fall back to just the
// name. Exported so the replay path in session-boundary can render the
// same label shape that the live REPL prints.
export function formatToolStatusLabel(name: string, input?: unknown): string {
  const arg = pickStatusArg(name, input);
  return arg !== undefined ? `${name} ${arg}` : name;
}

function pickStatusArg(name: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  const field =
    name === "read_file" || name === "edit_file" || name === "write_file"
      ? "file_path"
      : name === "search_files"
        ? "query"
        : name === "list_files"
          ? "prefix"
          : undefined;
  if (field === undefined) return undefined;
  const value = obj[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function createStdTerminalOutput(): TerminalOutput {
  return {
    assistantText: (text) => {
      stdout.write(text);
    },
    toolStatus: (name, input) => {
      stdout.write(`\n[${formatToolStatusLabel(name, input)}]\n`);
    },
    toolError: (name, err) => {
      stderr.write(`\nTool error (${name}): ${formatCliError(err)}\n`);
    },
    info: (message) => {
      stdout.write(`\n${message}\n`);
    },
    sessionBanner: (message) => {
      stdout.write(`\n─── ${message} ───\n`);
    },
    replayLine: (line) => {
      stdout.write(`${line}\n`);
    },
    quickReplies: (payload) => {
      stdout.write(`${formatQuickReplies(payload)}\n`);
    },
    errorSummary: (message) => {
      stderr.write(`${message}\n`);
    },
    endStream: () => {
      stdout.write("\n");
    },
  };
}

export function formatQuickReplies(payload: {
  question: string;
  options: readonly string[];
}): string {
  const chips = payload.options
    .map((option, index) => `[${index + 1}] ${option}`)
    .join("   ");
  return `${payload.question}\n${chips}`;
}
