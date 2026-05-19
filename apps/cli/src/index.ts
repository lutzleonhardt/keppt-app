#!/usr/bin/env node
import { statSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, streamText, type ModelMessage } from "ai";
import {
  buildRequest,
  buildTools,
  formatToday,
  LocalFileRepository,
  MAX_INPUT_CHARS,
} from "@gtd/core";
import { FsSessionStore } from "./fs-session-store.js";
import { appendCliErrorLog } from "./cli-error-log.js";
import { createCliLogger } from "./cli-logger.js";
import { formatCliError } from "./cli-errors.js";
import {
  createStdTerminalOutput,
  type TerminalOutput,
} from "./terminal-output.js";

const MAX_STEPS = 10;
const DEBUG = process.env.DEBUG === "1";

function requireEnv(name: string, terminal: TerminalOutput): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    terminal.errorSummary(`Error: ${name} is not set.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const terminal = createStdTerminalOutput();
  const vaultPath = requireEnv("VAULT_PATH", terminal);
  requireEnv("ANTHROPIC_API_KEY", terminal);

  const cliLogger = createCliLogger({ vaultPath, terminal });

  // Shared clock between the system prompt, the tool gate, and the
  // repository's own scope/history calculations. Rebuilt at the start of
  // each turn so a session that crosses UTC midnight doesn't end up with a
  // prompt date that disagrees with what canRead / canWrite / repo.search
  // enforce — which would turn normal "today's daily note" reads into
  // out_of_scope failures, drop the turn day's daily from search hits, and
  // hide the file the prompt just told the model to use.
  let turnNow = new Date();
  const repo = new LocalFileRepository(vaultPath, {
    now: () => turnNow,
    logger: cliLogger,
  });
  // Session-backed history. The user message of each turn is persisted before
  // the stream begins (Phase 1) so a mid-stream crash/abort/disconnect leaves
  // the question visible on disk; the assistant/tool response is appended
  // only on successful stream completion (Phase 2). See Task 4.1 plan.
  const sessionStore = new FsSessionStore(vaultPath);
  // `let` (not `const`) — the day-rollover guard reassigns this when the CLI
  // crosses UTC midnight, so new turns land in today's session file rather
  // than appending to yesterday's.
  let session = await sessionStore.loadOrCreate(formatToday(turnNow));

  // fileVersionAt: mtime of the file (ms epoch) for drift detection inside
  // the K-window. Tool-result pruning consults this; undefined when the file
  // is missing or stat fails (drift check then falls back to K-only).
  const fileVersionAt = (filePath: string): number | undefined => {
    try {
      return statSync(path.join(vaultPath, filePath)).mtimeMs;
    } catch {
      return undefined;
    }
  };
  // messageCreatedAt: parallel-array lookup encapsulated in the Session
  // class. O(n) per call but n ≤ K + the active conversation window, which
  // stays small in Phase 1.
  const messageCreatedAt = (msg: ModelMessage): number =>
    session.createdAtOf(msg) ?? Date.now();

  const rl = createInterface({ input: stdin, output: stdout, prompt: "> " });

  let activeAbort: AbortController | null = null;
  let sigintArmed = false;

  process.on("SIGINT", () => {
    if (activeAbort) {
      activeAbort.abort();
      return;
    }
    if (sigintArmed) {
      stdout.write("\n");
      process.exit(0);
    }
    sigintArmed = true;
    terminal.info("(Press Ctrl+C again to exit.)");
    rl.prompt();
  });

  rl.prompt();
  for await (const rawLine of rl) {
    sigintArmed = false;
    const line = rawLine.trim();
    if (line.length === 0) {
      rl.prompt();
      continue;
    }

    // This CLI is a single-user internal testballoon — the "untrusted user
    // repurposes the LLM" threat model does not apply here, so the full
    // pre-LLM gate (validateUserInput) is intentionally NOT wired in. It
    // also could not work correctly from readline anyway: a real multi-line
    // paste arrives as separate line events, so the code-paste heuristic
    // can never see the whole paste. That gate belongs at the WebUI / HTTP
    // boundary where a submit delivers the complete payload at once.
    //
    // The hard length cap is kept as a cheap accidental-paste guard
    // (token cost, cache-marker stability). It is not load-bearing — feel
    // free to drop if it ever gets in the way.
    if (line.length > MAX_INPUT_CHARS) {
      terminal.errorSummary(
        `Input is ${line.length} characters; max ${MAX_INPUT_CHARS}. Break it up or summarize.`,
      );
      rl.prompt();
      continue;
    }

    rl.pause();
    const controller = new AbortController();
    activeAbort = controller;

    // Snapshot the turn clock so the system prompt and every tool call this
    // turn agree on "today" — see the tools' { now } closure below. Rebuild
    // tools per turn so the edit_file retry budget (held in the buildTools
    // closure) is scoped to the current turn: a failed third attempt in
    // this turn must not block edits in the next turn.
    turnNow = new Date();
    const tools = buildTools(repo, { now: () => turnNow, logger: cliLogger });

    // Day-rollover guard. If the CLI has been running across UTC midnight,
    // the session loaded at startup belongs to yesterday — new turns must
    // land in today's `<vault>/.keppt/sessions/<today>.json`, not yesterday's.
    const todayKey = formatToday(turnNow);
    if (todayKey !== session.date) {
      try {
        session = await sessionStore.loadOrCreate(todayKey);
      } catch (err) {
        const log = await appendCliErrorLog(vaultPath, err, {
          phase: "session_load_rollover",
        });
        const logSuffix = log.ok
          ? `\nDetails logged to: ${log.path}`
          : `\nCould not write error log (${log.path}): ${log.error}`;
        terminal.errorSummary(
          `\nSession load failed at day rollover: ${formatCliError(err)}${logSuffix}`,
        );
        activeAbort = null;
        rl.resume();
        rl.prompt();
        continue;
      }
    }

    // Phase 1 of the two-phase save: persist the user message before the
    // stream begins so a mid-stream abort still leaves "you asked X" on disk.
    // The structural property `session.messages.at(-1)?.role === "user"` is
    // the indicator that an answer is missing — no schema field needed.
    const pendingUser: ModelMessage = { role: "user", content: line };
    const turnStartedAt = Date.now();
    const restorePhase1 = session.snapshot();
    session.appendTurn([pendingUser], turnStartedAt);
    try {
      await sessionStore.save(session);
    } catch (err) {
      // Roll back the in-memory append so the next turn does not build a
      // prompt from a user message that never landed on disk. A failed
      // Phase-1 save means we cannot reliably distinguish "answer lost"
      // from "no question ever made it" on the next CLI start, so we
      // refuse to proceed.
      restorePhase1();
      const log = await appendCliErrorLog(vaultPath, err, {
        phase: "session_save_phase1",
      });
      const logSuffix = log.ok
        ? `\nDetails logged to: ${log.path}`
        : `\nCould not write error log (${log.path}): ${log.error}`;
      terminal.errorSummary(
        `\nSession save failed: ${formatCliError(err)}${logSuffix}`,
      );
      activeAbort = null;
      rl.resume();
      rl.prompt();
      continue;
    }

    try {
      const { system, messages: requestMessages } = buildRequest({
        today: turnNow,
        messages: session.messages,
        fileVersionAt,
        messageCreatedAt,
      });

      const result = streamText({
        model: anthropic("claude-haiku-4-5"),
        system,
        messages: requestMessages,
        tools,
        stopWhen: isStepCount(MAX_STEPS),
        abortSignal: controller.signal,
        // anthropic.disableParallelToolUse: true — force one tool call per
        // step so the edit_file retry budget's per-turn Map (keyed by
        // filePath) is race-free by construction. Pinned to first-key
        // position by the workspace-wiring static check.
        // anthropic.cacheControl: { type: "ephemeral" } — single marker
        // covers the system prompt + tool definitions (the stable head of
        // the request). Vault content arrives only via tool-results inside
        // `messages` (architecture amendment 2026-05-19 — no active-state
        // pre-load), so day-to-day edits don't invalidate the cached head.
        providerOptions: {
          anthropic: {
            disableParallelToolUse: true,
            cacheControl: { type: "ephemeral" },
          },
        },
        // The SDK default logs raw stream errors to stderr. The CLI logs the
        // raw diagnostic record to .keppt/logs and prints a stable summary.
        onError: () => {},
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta":
            terminal.assistantText(part.text);
            break;
          case "tool-call":
            terminal.toolStatus(part.toolName);
            break;
          case "tool-error":
            terminal.toolError(part.toolName, part.error);
            cliLogger.warn({
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

      terminal.endStream();
      const response = await result.response;
      // Phase 2 of the two-phase save: response messages join the session
      // only on successful completion. The user message landed on disk in
      // Phase 1 already, so we append response messages alone here.
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
      const restorePhase2 = session.snapshot();
      session.appendTurn(response.messages, turnStartedAt);
      try {
        await sessionStore.save(session);
      } catch (err) {
        restorePhase2();
        const log = await appendCliErrorLog(vaultPath, err, {
          phase: "session_save_phase2",
        });
        const logSuffix = log.ok
          ? `\nDetails logged to: ${log.path}`
          : `\nCould not write error log (${log.path}): ${log.error}`;
        terminal.errorSummary(
          `\nSession save failed after successful stream: ${formatCliError(err)}${logSuffix}`,
        );
      }

      if (DEBUG) {
        const usage = await result.totalUsage;
        cliLogger.debug({
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
        terminal.info("(stream aborted)");
      } else {
        // Routed directly through the awaitable helper (not cliLogger.error)
        // so the user-facing line includes the literal log path. The Logger
        // interface is sync; this single path needs ordering.
        const log = await appendCliErrorLog(vaultPath, err, {
          phase: "stream",
        });
        const logSuffix = log.ok
          ? `\nDetails logged to: ${log.path}`
          : `\nCould not write error log (${log.path}): ${log.error}`;
        terminal.errorSummary(
          `\nStream error: ${formatCliError(err)}${logSuffix}`,
        );
      }
    } finally {
      activeAbort = null;
      rl.resume();
      rl.prompt();
    }
  }
}

main().catch((err) => {
  // Pre-vault failures and post-vault startup throws both land here. We do
  // not have guaranteed access to a vault-local JSONL at this point, so the
  // single user-facing line on stderr is the contract — same shape as before
  // 3.9, just routed through the terminal sink.
  createStdTerminalOutput().errorSummary(formatCliError(err));
  process.exit(1);
});
