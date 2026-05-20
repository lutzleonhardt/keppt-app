// Per-turn orchestration extracted from `main()`. Each REPL iteration runs
// `handleTurn(deps, refs, line, controller)` which: snapshots the turn
// clock, swaps the session at UTC midnight, persists the user message
// (Phase 1), drives `streamText`, persists the response (Phase 2) and
// writes the per-turn debug artifact. Early failures (rollover, Phase-1
// save) print the standard error summary and return so the REPL's
// `rl.resume(); rl.prompt()` finally block stays in `main()`.
//
// `TurnRefs` is the mutable seam: `session`, `turnLogger` and `turnNow`
// are reassigned across turns and the surrounding closures in `main()`
// (`repo.now`, `fileVersionAt`) read them by reference, so the day
// rollover never produces a stale view.

import { statSync } from "node:fs";
import path from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, streamText, type ModelMessage } from "ai";
import {
  buildRequest,
  buildTools,
  formatToday,
  type LocalFileRepository,
  type Logger,
  type Session,
} from "@gtd/core";
import { FsSessionStore } from "./fs-session-store.js";
import { FsTurnLogger } from "./fs-turn-logger.js";
import {
  writeTurnArtifact,
  type TurnLogContext,
} from "./turn-artifact.js";
import { appendCliErrorLog } from "./cli-error-log.js";
import { formatCliError } from "./cli-errors.js";
import type { TerminalOutput } from "./terminal-output.js";
import { announceSessionBoundary } from "./session-boundary.js";

const MAX_STEPS = 10;
const DEBUG = process.env.DEBUG === "1";

// Single source of truth for the model identifier — used both as the
// `streamText` model wiring and as the `model` field on per-turn debug
// artifacts. Changing this in one place keeps the artifact, the SDK call,
// and any future routing-aware code in sync.
export const MODEL_ID = "claude-sonnet-4-6";

export interface TurnDeps {
  vaultPath: string;
  repo: LocalFileRepository;
  sessionStore: FsSessionStore;
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
}

type StreamHandle = ReturnType<typeof streamText>;

export async function handleTurn(
  deps: TurnDeps,
  refs: TurnRefs,
  line: string,
  controller: AbortController,
): Promise<void> {
  // Snapshot the turn clock so the system prompt and every tool call this
  // turn agree on "today" — see the tools' { now } closure below. Rebuild
  // tools per turn so the edit_file retry budget (held in the buildTools
  // closure) is scoped to the current turn: a failed third attempt in
  // this turn must not block edits in the next turn.
  refs.turnNow = new Date();
  const tools = buildTools(deps.repo, {
    now: () => refs.turnNow,
    logger: deps.cliLogger,
  });

  if (!(await dayRolloverGuard(deps, refs))) return;

  const turnStartedAt = Date.now();
  if (!(await phase1Save(deps, refs, line, turnStartedAt))) return;

  // Per-turn debug artifact context. `turnLogger` non-null implies
  // DEBUG=1 — that's the single runtime gate. The artifact snapshot of
  // `providerOptions` is a separate literal from the one passed into
  // `streamText` so the workspace-wiring static regex (which scans the
  // `streamText` call site) is unaffected. `turnCtx` is built after
  // `buildRequest` returns and then captured by reference across the
  // try-block and its catch.
  let turnCtx: TurnLogContext | null = null;

  try {
    const { system, messages: requestMessages } = buildRequest({
      today: refs.turnNow,
      messages: refs.session.messages,
      fileVersionAt: makeFileVersionAt(deps.vaultPath),
      messageCreatedAt: (msg) =>
        refs.session.createdAtOf(msg) ?? Date.now(),
    });
    // `system` from buildRequest is a SystemModelMessage carrying the
    // Anthropic cache marker on its providerOptions. streamText accepts
    // that object form on its `system` param (see ai@7 streamText typedef
    // line ~801: `system?: string | SystemModelMessage | Array<...>`).
    // The turn-log artifact wants a plain string for readability, so we
    // extract `system.content` for that surface.
    const systemText =
      typeof system.content === "string" ? system.content : "";
    if (refs.turnLogger) {
      turnCtx = {
        turnLogger: refs.turnLogger,
        turnId: refs.turnLogger.nextTurnId(),
        startedAtMs: turnStartedAt,
        model: MODEL_ID,
        system: systemText,
        messages: requestMessages,
        providerOptions: {
          disableParallelToolUse: true,
        },
        cliLogger: deps.cliLogger,
      };
    }

    const result = streamText({
      model: anthropic(MODEL_ID),
      system,
      messages: requestMessages,
      tools,
      stopWhen: isStepCount(MAX_STEPS),
      abortSignal: controller.signal,
      // anthropic.disableParallelToolUse: true — force one tool call per
      // step so the edit_file retry budget's per-turn Map (keyed by
      // filePath) is race-free by construction. Pinned to first-key
      // position by the workspace-wiring static check.
      //
      // Cache markers (cacheControl) are NOT set top-level here. They
      // live on:
      //   1. `system.providerOptions.anthropic.cacheControl` — set by
      //      `buildRequest` on the SystemModelMessage it returns.
      //   2. `requestMessages.at(-1).providerOptions.anthropic.cache
      //      Control` — also set by `buildRequest`.
      // Top-level `providerOptions.anthropic.cacheControl` on streamText
      // is undocumented in the AI SDK and was silently failing — session
      // 2026-05-20 turn 9 onward showed cacheRead=0 despite byte-
      // identical prefixes.
      providerOptions: {
        anthropic: {
          disableParallelToolUse: true,
        },
      },
      // The SDK default logs raw stream errors to stderr. The CLI logs the
      // raw diagnostic record to .keppt/logs and prints a stable summary.
      onError: () => {},
    });

    await consumeStream(result, deps);

    deps.terminal.endStream();
    const response = await result.response;
    await phase2Save(deps, refs, response.messages, turnStartedAt);

    if (DEBUG) {
      // `result.totalUsage` resolves once per stream; share the value
      // between the per-turn artifact and the prompt.cache_usage JSONL
      // index below so we don't await the same PromiseLike twice.
      const usage = await result.totalUsage;
      if (turnCtx) {
        await writeTurnArtifact(turnCtx, {
          outcome: "ok",
          steps: await result.steps,
          totalUsage: usage,
          responseMessages: response.messages,
        });
      }
      deps.cliLogger.debug({
        message: "prompt cache usage",
        code: "prompt.cache_usage",
        meta: {
          cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
          cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
          noCacheTokens: usage.inputTokenDetails?.noCacheTokens,
          outputTokens: usage.outputTokens,
        },
      });
    }
  } catch (err) {
    if (controller.signal.aborted) {
      deps.terminal.info("(stream aborted)");
      if (turnCtx) await writeTurnArtifact(turnCtx, { outcome: "aborted" });
    } else {
      // Routed directly through the awaitable helper (not cliLogger.error)
      // so the user-facing line includes the literal log path. The Logger
      // interface is sync; this single path needs ordering.
      const log = await appendCliErrorLog(deps.vaultPath, err, {
        phase: "stream",
      });
      const logSuffix = log.ok
        ? `\nDetails logged to: ${log.path}`
        : `\nCould not write error log (${log.path}): ${log.error}`;
      deps.terminal.errorSummary(
        `\nStream error: ${formatCliError(err)}${logSuffix}`,
      );
      if (turnCtx)
        await writeTurnArtifact(turnCtx, { outcome: "stream_error", err });
    }
  }
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

// Day-rollover guard. If the CLI has been running across UTC midnight,
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
    return true;
  } catch (err) {
    const log = await appendCliErrorLog(deps.vaultPath, err, {
      phase: "session_load_rollover",
    });
    const logSuffix = log.ok
      ? `\nDetails logged to: ${log.path}`
      : `\nCould not write error log (${log.path}): ${log.error}`;
    deps.terminal.errorSummary(
      `\nSession load failed at day rollover: ${formatCliError(err)}${logSuffix}`,
    );
    return false;
  }
}

// Phase 1 of the two-phase save: persist the user message before the
// stream begins so a mid-stream abort still leaves "you asked X" on disk.
// The structural property `session.messages.at(-1)?.role === "user"` is
// the indicator that an answer is missing — no schema field needed.
// Returns false when the save failed (caller skips the turn).
async function phase1Save(
  deps: TurnDeps,
  refs: TurnRefs,
  line: string,
  turnStartedAt: number,
): Promise<boolean> {
  const pendingUser: ModelMessage = { role: "user", content: line };
  const restore = refs.session.snapshot();
  refs.session.appendTurn([pendingUser], turnStartedAt);
  try {
    await deps.sessionStore.save(refs.session);
    return true;
  } catch (err) {
    // Roll back the in-memory append so the next turn does not build a
    // prompt from a user message that never landed on disk. A failed
    // Phase-1 save means we cannot reliably distinguish "answer lost"
    // from "no question ever made it" on the next CLI start, so we
    // refuse to proceed.
    restore();
    const log = await appendCliErrorLog(deps.vaultPath, err, {
      phase: "session_save_phase1",
    });
    const logSuffix = log.ok
      ? `\nDetails logged to: ${log.path}`
      : `\nCould not write error log (${log.path}): ${log.error}`;
    deps.terminal.errorSummary(
      `\nSession save failed: ${formatCliError(err)}${logSuffix}`,
    );
    return false;
  }
}

async function consumeStream(
  result: StreamHandle,
  deps: TurnDeps,
): Promise<void> {
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        deps.terminal.assistantText(part.text);
        break;
      case "tool-call":
        deps.terminal.toolStatus(part.toolName, part.input);
        break;
      case "tool-error":
        deps.terminal.toolError(part.toolName, part.error);
        deps.cliLogger.warn({
          message: `tool ${part.toolName} returned an error`,
          code: "stream.tool_error",
          err: part.error,
          meta: { toolName: part.toolName },
        });
        break;
      case "error":
        throw part.error;
    }
  }
}

// Phase 2 of the two-phase save: response messages join the session only
// on successful completion. The user message landed on disk in Phase 1
// already, so we append response messages alone here.
//
// **Stamp with `turnStartedAt`, NOT `Date.now()`.** The pruner's drift
// check stubs a tool-result when `fileVersionAt(file_path) >
// messageCreatedAt(msg)`. If we stamped post-stream, a same-turn
// `read_file → edit_file` sequence on the same file would produce a
// read whose timestamp is *after* the edit's mtime — drift returns
// false next turn, the stale read survives, the LLM acts on pre-edit
// state. `turnStartedAt` is captured before `streamText` and is
// therefore guaranteed strictly less than any file mtime produced
// *during* the turn, so the drift check fires correctly.
//
// Granularity note: this stamps every Phase-2 message with the same
// value, which is conservative — a read of file A and an unrelated
// edit of file B in the same turn won't cross-invalidate because the
// pruner's drift check is per-file (joined via `toolCallId` →
// `tool-call.input.file_path`).
async function phase2Save(
  deps: TurnDeps,
  refs: TurnRefs,
  responseMessages: ModelMessage[],
  turnStartedAt: number,
): Promise<void> {
  const restore = refs.session.snapshot();
  refs.session.appendTurn(responseMessages, turnStartedAt);
  try {
    await deps.sessionStore.save(refs.session);
  } catch (err) {
    restore();
    const log = await appendCliErrorLog(deps.vaultPath, err, {
      phase: "session_save_phase2",
    });
    const logSuffix = log.ok
      ? `\nDetails logged to: ${log.path}`
      : `\nCould not write error log (${log.path}): ${log.error}`;
    deps.terminal.errorSummary(
      `\nSession save failed after successful stream: ${formatCliError(err)}${logSuffix}`,
    );
  }
}
