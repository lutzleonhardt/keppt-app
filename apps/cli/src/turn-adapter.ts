// Bridges the core turn engine to the CLI: builds `TurnEngineDeps` from the
// REPL's deps and refs, adapts `TurnSink` events to the terminal, and renders
// a `TurnResult`. Shared by the user turn (`turn-loop.ts`) and the
// Auto-Replan opener.

import { statSync } from "node:fs";
import path from "node:path";
import type {
  QuickRepliesResult,
  TurnEngineDeps,
  TurnErrorPhase,
  TurnResult,
  TurnSink,
} from "@gtd/core";
import { appendCliErrorLog } from "./cli-error-log.js";
import { formatCliError } from "./cli-errors.js";
import type { TerminalOutput } from "./terminal-output.js";
import type { TurnDeps, TurnRefs } from "./turn-loop.js";

export function createEngineDeps(
  deps: TurnDeps,
  refs: TurnRefs,
  sink: TurnSink,
): TurnEngineDeps {
  return {
    repo: deps.repo,
    sessionStore: deps.sessionStore,
    logger: deps.cliLogger,
    model: deps.modelProvider.model,
    providerOptions: deps.modelProvider.providerOptions,
    now: () => refs.turnNow,
    fileVersionAt: makeFileVersionAt(deps.vaultPath),
    turnLogger: refs.turnLogger ?? undefined,
    sink,
  };
}

// Bridges `TurnSink` events onto the terminal. Chips are held back: the
// terminal prints `endStream()`'s newline between the streamed text and
// the chips, and the sink has no stream-end signal, so the caller renders
// them once `runTurn` has returned. The options are kept on `refs` for the
// numeric pick of the next REPL line.
export function createTerminalSink(
  terminal: TerminalOutput,
  refs: TurnRefs,
): { sink: TurnSink; pendingChips: () => QuickRepliesResult | null } {
  let chips: QuickRepliesResult | null = null;
  const sink: TurnSink = {
    assistantText: (text) => terminal.assistantText(text),
    toolStart: (_toolCallId, name, input) => terminal.toolStatus(name, input),
    toolEnd: () => {},
    toolError: (_toolCallId, name, error) => terminal.toolError(name, error),
    quickReplies: (payload) => {
      chips = payload;
      refs.lastQuickReplies = payload.options;
    },
    turnEnd: () => {},
  };
  return { sink, pendingChips: () => chips };
}

/** The engine's phases plus the one CLI-only phase: loading the next day's session runs outside a turn. */
export type CliErrorPhase = TurnErrorPhase | "session_load_rollover";

export async function renderTurnResult(
  deps: TurnDeps,
  result: TurnResult,
  chips: QuickRepliesResult | null,
): Promise<void> {
  switch (result.outcome) {
    case "ok":
      endStream(deps.terminal, chips);
      return;
    case "aborted":
      deps.terminal.info("(stream aborted)");
      return;
    case "error":
      // The save after a complete stream fails: the answer was shown, so
      // the turn closes like a successful one before the error line.
      if (result.phase === "session_save_phase2") {
        endStream(deps.terminal, chips);
      }
      await reportError(deps, result.phase, result.err);
  }
}

function endStream(
  terminal: TerminalOutput,
  chips: QuickRepliesResult | null,
): void {
  terminal.endStream();
  // suggest_quick_replies requires a `question`, so chips never reach the
  // terminal without the prose line above them.
  if (chips) terminal.quickReplies(chips);
}

// Routed through the awaitable log helper (not cliLogger.error) so the
// user-facing line includes the literal log path. The Logger interface is
// sync; this single path needs ordering. The terminal line names the
// phase itself — the CLI is a developer surface, the web UI (Task 8) maps
// phases to localized wording on its own.
export async function reportError(
  deps: TurnDeps,
  phase: CliErrorPhase,
  err: unknown,
): Promise<void> {
  const log = await appendCliErrorLog(deps.vaultPath, err, { phase });
  const logSuffix = log.ok
    ? `\nDetails logged to: ${log.path}`
    : `\nCould not write error log (${log.path}): ${log.error}`;
  deps.terminal.errorSummary(
    `\nError (${phase}): ${formatCliError(err)}${logSuffix}`,
  );
}

// fileVersionAt closure: mtime of the file (ms epoch) for drift detection
// inside the K-window. Tool-result pruning consults this; undefined when
// the file is missing or stat fails (drift check then falls back to
// K-only).
function makeFileVersionAt(
  vaultPath: string,
): (filePath: string) => number | undefined {
  return (filePath) => {
    try {
      return statSync(path.join(vaultPath, filePath)).mtimeMs;
    } catch {
      return undefined;
    }
  };
}
