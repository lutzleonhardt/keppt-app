// Per-turn orchestration of the REPL. Each iteration runs
// `handleTurn(deps, refs, line, controller)`: snapshot the turn clock, swap
// the session at local midnight, run the shared engine against a
// terminal-backed `TurnSink`, then render the result. Early failures
// (rollover, Phase-1 save) print the standard error summary and return so
// the REPL's `rl.resume(); rl.prompt()` finally block stays in `main()`.
//
// `TurnRefs` is the mutable seam: `session`, `turnLogger` and `turnNow`
// are reassigned across turns and the surrounding closures in `main()`
// (`repo.now`, `fileVersionAt`) read them by reference, so the day
// rollover never produces a stale view.

import {
  formatToday,
  runTurn,
  type FileRepository,
  type Logger,
  type Session,
  type SessionStore,
} from "@gtd/core";
import { FsTurnLogger } from "./fs-turn-logger.js";
import type { TerminalOutput } from "./terminal-output.js";
import { announceSessionBoundary } from "./session-boundary.js";
import { maybeRunAutoReplanOpener } from "./auto-replan-opener.js";
import {
  createEngineDeps,
  createTerminalSink,
  renderTurnResult,
  reportError,
} from "./turn-adapter.js";

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
  const result = await runTurn(createEngineDeps(deps, refs, sink), {
    kind: "user",
    session: refs.session,
    userText: line,
    abortSignal: controller.signal,
  });
  await renderTurnResult(deps, result, pendingChips());
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
    await reportError(deps, "session_load_rollover", err);
    return false;
  }
}
