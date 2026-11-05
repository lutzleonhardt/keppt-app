// Per-turn adapter around the shared engine. Each REPL iteration runs
// `handleTurn(deps, refs, line, controller)`: snapshot the turn clock, swap
// the session at local midnight, run `runTurn` against a terminal-backed
// `TurnSink`, then render the result. Early failures (rollover, Phase-1
// save) print the standard error summary and return so the REPL's
// `rl.resume(); rl.prompt()` finally block stays in `main()`.
//
// `TurnRefs` is the mutable seam: `session`, `turnLogger` and `turnNow`
// are reassigned across turns and the surrounding closures in `main()`
// (`repo.now`, `fileVersionAt`) read them by reference, so the day
// rollover never produces a stale view.

import { statSync } from "node:fs";
import path from "node:path";
import {
  formatToday,
  runTurn,
  type FileRepository,
  type Logger,
  type QuickRepliesResult,
  type Session,
  type SessionStore,
  type TurnErrorPhase,
  type TurnResult,
  type TurnSink,
} from "@gtd/core";
import { model, providerOptions } from "./model-provider.js";
import { FsTurnLogger } from "./fs-turn-logger.js";
import { appendCliErrorLog } from "./cli-error-log.js";
import { formatCliError } from "./cli-errors.js";
import type { TerminalOutput } from "./terminal-output.js";
import { announceSessionBoundary } from "./session-boundary.js";
import { maybeRunAutoReplanOpener } from "./auto-replan-opener.js";

const DEBUG = process.env.DEBUG === "1";

export interface TurnDeps {
  vaultPath: string;
  repo: FileRepository;
  sessionStore: SessionStore;
  cliLogger: Logger;
  terminal: TerminalOutput;
}

export interface TurnRefs {
  /** Reassigned by the day-rollover guard so post-midnight turns append to
   *  the new day's session file, not yesterday's. */
  session: Session;
  /** Re-created by the day-rollover guard so artifacts land under
   *  `.keppt/logs/sessions/<today>/`. `null` when DEBUG is off. */
  turnLogger: FsTurnLogger | null;
  /** Snapshotted at the start of every turn. Read by the `repo` closure
   *  and the per-turn `tools` so date-sensitive logic agrees on "today". */
  turnNow: Date;
  /** Last chip suggestions proposed by suggest_quick_replies. The REPL
   *  expands a numeric pick before calling handleTurn, then handleTurn clears
   *  the value so suggestions survive for exactly one user turn. */
  lastQuickReplies: string[] | null;
}

// Env override for the turn clock: `GTD_NOW_OVERRIDE=<ISO timestamp>` pins
// "now" so the day rollover is reproducible without waiting for midnight.
// Read fresh per turn so unsetting it mid-session returns to the wall clock
// without restarting the CLI; unset or malformed values fall back to the
// wall clock.
export function readTurnClock(): Date {
  const raw = process.env.GTD_NOW_OVERRIDE;
  if (raw === undefined || raw === "") return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

export async function handleTurn(
  deps: TurnDeps,
  refs: TurnRefs,
  line: string,
  controller: AbortController,
): Promise<void> {
  refs.lastQuickReplies = null;
  refs.turnNow = readTurnClock();

  if (!(await dayRolloverGuard(deps, refs))) return;
  // The opener may have proposed chips during the rollover; only this
  // turn's own chips may survive into the next prompt.
  refs.lastQuickReplies = null;

  const { sink, pendingChips } = createTerminalSink(deps.terminal, refs);
  const result = await runTurn(
    {
      repo: deps.repo,
      sessionStore: deps.sessionStore,
      logger: deps.cliLogger,
      model: model(),
      providerOptions: providerOptions(),
      now: () => refs.turnNow,
      fileVersionAt: makeFileVersionAt(deps.vaultPath),
      turnLogger: refs.turnLogger ?? undefined,
      sink,
    },
    { session: refs.session, userText: line, abortSignal: controller.signal },
  );
  await renderTurnResult(deps, result, pendingChips());
}

// Bridges `TurnSink` events onto the terminal. Chips are held back: the
// terminal prints `endStream()`'s newline between the streamed text and
// the chips, and the sink has no stream-end signal, so `handleTurn` renders
// them once `runTurn` has returned. The options are kept on `refs` for the
// numeric pick of the next REPL line.
function createTerminalSink(
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

const ERROR_PREFIX: Record<TurnErrorPhase, string> = {
  session_save_phase1: "Session save failed",
  stream: "Stream error",
  session_save_phase2: "Session save failed after successful stream",
};

async function renderTurnResult(
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
      // Phase 2 fails after a complete stream: the answer was shown, so the
      // turn closes like a successful one before the error line.
      if (result.phase === "session_save_phase2") {
        endStream(deps.terminal, chips);
      }
      await reportError(
        deps,
        result.phase,
        ERROR_PREFIX[result.phase],
        result.err,
      );
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
// sync; this single path needs ordering.
async function reportError(
  deps: TurnDeps,
  phase: string,
  prefix: string,
  err: unknown,
): Promise<void> {
  const log = await appendCliErrorLog(deps.vaultPath, err, { phase });
  const logSuffix = log.ok
    ? `\nDetails logged to: ${log.path}`
    : `\nCould not write error log (${log.path}): ${log.error}`;
  deps.terminal.errorSummary(`\n${prefix}: ${formatCliError(err)}${logSuffix}`);
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

// Day-rollover guard. If the CLI has been running across local midnight,
// the session loaded at startup belongs to yesterday — new turns must
// land in today's `<vault>/.keppt/sessions/<today>.json`, not
// yesterday's. Returns false when the load failed (caller skips the turn).
async function dayRolloverGuard(
  deps: TurnDeps,
  refs: TurnRefs,
): Promise<boolean> {
  const todayKey = formatToday(refs.turnNow);
  if (todayKey === refs.session.date) return true;
  try {
    refs.session = await deps.sessionStore.loadOrCreate(todayKey);
    announceSessionBoundary(deps.terminal, refs.session, true);
    if (DEBUG) {
      // Re-seed the per-day artifact counter against the new day's
      // subdirectory so post-midnight turns land under
      // .keppt/logs/sessions/<today>/turn-001.json, not yesterday's dir.
      refs.turnLogger = await FsTurnLogger.create(
        deps.vaultPath,
        refs.session.date,
      );
    }
    await maybeRunAutoReplanOpener(deps, refs);
    return true;
  } catch (err) {
    await reportError(
      deps,
      "session_load_rollover",
      "Session load failed at day rollover",
      err,
    );
    return false;
  }
}
