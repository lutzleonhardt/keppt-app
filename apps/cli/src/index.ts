#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import {
  ensureGtdTaskFiles,
  formatToday,
  LocalFileRepository,
  MAX_INPUT_CHARS,
} from "@gtd/core";
import { FsSessionStore } from "./fs-session-store.js";
import { FsTurnLogger } from "./fs-turn-logger.js";
import { createCliLogger } from "./cli-logger.js";
import { formatCliError } from "./cli-errors.js";
import {
  createStdTerminalOutput,
  type TerminalOutput,
} from "./terminal-output.js";
import { announceSessionBoundary } from "./session-boundary.js";
import { handleTurn, type TurnDeps, type TurnRefs } from "./turn-loop.js";
import { expandQuickReplyLine } from "./quick-replies.js";

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

  // Shared turn clock. Rebuilt at the start of every turn so a session
  // crossing UTC midnight doesn't end up with a prompt date that disagrees
  // with what canRead / canWrite / repo.search enforce — which would turn
  // normal "today's daily note" reads into out_of_scope failures, drop the
  // turn day's daily from search hits, and hide the file the prompt just
  // told the model to use.
  //
  // The mutable carrier lives in `refs` so that `repo`'s `now` closure and
  // the per-turn `tools` closure built inside `handleTurn` see the same
  // value — `handleTurn` reassigns `refs.turnNow` at the top of every
  // turn.
  const startedAt = new Date();
  const sessionStore = new FsSessionStore(vaultPath);
  const session = await sessionStore.loadOrCreate(formatToday(startedAt));
  announceSessionBoundary(terminal, session, false);

  // Per-turn debug artifacts (Task 4.2). DEBUG=1 produces one JSON file per
  // turn at <vault>/.keppt/logs/sessions/<date>/turn-NNN.json — the
  // post-pruning request snapshot, per-step response breakdown, and total
  // usage. The whole machinery is skipped when DEBUG is off so cold-path
  // record assembly does not cost anything on hot REPL turns.
  const turnLogger = DEBUG
    ? await FsTurnLogger.create(vaultPath, session.date)
    : null;

  const refs: TurnRefs = {
    session,
    turnLogger,
    turnNow: startedAt,
    lastQuickReplies: null,
  };
  const repo = new LocalFileRepository(vaultPath, {
    now: () => refs.turnNow,
    logger: cliLogger,
  });

  // First-run task-file initialization (Task 5). The five canonical
  // `tasks/*.md` files need to exist before the first turn touches them;
  // otherwise the model's first `edit_file` lands on a missing file and
  // has to fall back to `write_file` through the T-C1 protocol — slow and
  // visible. A parallel repo handle with `changedBy: "system"` ensures the
  // per-file history reflects "created by the CLI on first run", not by
  // the LLM. Idempotent: the second startup is a no-op.
  const systemRepo = new LocalFileRepository(vaultPath, {
    now: () => refs.turnNow,
    logger: cliLogger,
    changedBy: "system",
  });
  await ensureGtdTaskFiles(systemRepo);

  const deps: TurnDeps = {
    vaultPath,
    repo,
    sessionStore,
    cliLogger,
    terminal,
  };

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
    const line = expandQuickReplyLine(rawLine.trim(), refs.lastQuickReplies);
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
    try {
      await handleTurn(deps, refs, line, controller);
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
