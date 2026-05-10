#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, streamText, type ModelMessage } from "ai";
import { buildTools, LocalFileRepository } from "@gtd/core";
import { appendCliErrorLog } from "./cli-error-log.js";
import { formatCliError } from "./cli-errors.js";
import { buildMinimalSystemPrompt } from "./minimal-prompt.js";

const MAX_INPUT_CHARS = 2000;
const MAX_STEPS = 10;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    console.error(`Error: ${name} is not set.`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const vaultPath = requireEnv("VAULT_PATH");
  requireEnv("ANTHROPIC_API_KEY");

  // Shared clock between the system prompt, the tool gate, and the
  // repository's own scope/history calculations. Rebuilt at the start of
  // each turn so a session that crosses UTC midnight doesn't end up with a
  // prompt date that disagrees with what canRead / canWrite / repo.search
  // enforce — which would turn normal "today's daily note" reads into
  // out_of_scope failures, drop the turn day's daily from search hits, and
  // hide the file the prompt just told the model to use.
  let turnNow = new Date();
  const repo = new LocalFileRepository(vaultPath, { now: () => turnNow });
  const messages: ModelMessage[] = [];

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
    stdout.write("\n(Press Ctrl+C again to exit.)\n");
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
    if (line.length > MAX_INPUT_CHARS) {
      console.error(
        `Input is ${line.length} characters; max ${MAX_INPUT_CHARS}. Break it up or summarize.`,
      );
      rl.prompt();
      continue;
    }

    rl.pause();
    const controller = new AbortController();
    activeAbort = controller;
    const pendingUser: ModelMessage = { role: "user", content: line };

    // Snapshot the turn clock so the system prompt and every tool call this
    // turn agree on "today" — see the tools' { now } closure below. Rebuild
    // tools per turn so the edit_file retry budget (held in the buildTools
    // closure) is scoped to the current turn: a failed third attempt in
    // this turn must not block edits in the next turn.
    turnNow = new Date();
    const tools = buildTools(repo, { now: () => turnNow });
    const system = buildMinimalSystemPrompt(turnNow);

    try {
      const result = streamText({
        model: anthropic("claude-haiku-4-5"),
        system,
        messages: [...messages, pendingUser],
        tools,
        stopWhen: isStepCount(MAX_STEPS),
        abortSignal: controller.signal,
        // Force the model to emit at most one tool call per step. The
        // edit_file retry budget is a plain per-turn Map keyed by
        // filePath, and the simplest correct counter assumes calls
        // within a turn are sequential. With parallel tool use disabled
        // the counter race goes away by construction (no in-flight
        // queue, no abort-after-queue cancellation hazard, no
        // false-block on concurrent successes). Multi-edit batches use
        // edit_file's own edits[] array — atomic, single-call.
        providerOptions: { anthropic: { disableParallelToolUse: true } },
        // The SDK default logs raw stream errors to stderr. The CLI logs the
        // raw diagnostic record to .keppt/logs and prints a stable summary.
        onError: () => {},
      });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta":
            stdout.write(part.text);
            break;
          case "tool-call":
            stdout.write(`\n[${part.toolName}…]\n`);
            break;
          case "tool-error":
            console.error(`\nTool error (${part.toolName}):`, part.error);
            break;
          case "error":
            throw part.error;
        }
      }

      stdout.write("\n");
      const response = await result.response;
      messages.push(pendingUser, ...response.messages);
    } catch (err) {
      if (controller.signal.aborted) {
        stdout.write("\n(stream aborted)\n");
      } else {
        const log = await appendCliErrorLog(vaultPath, err, {
          phase: "stream",
        });
        const logSuffix = log.ok
          ? `\nDetails logged to: ${log.path}`
          : `\nCould not write error log (${log.path}): ${log.error}`;
        console.error(`\nStream error: ${formatCliError(err)}${logSuffix}`);
      }
    } finally {
      activeAbort = null;
      rl.resume();
      rl.prompt();
    }
  }
}

main().catch((err) => {
  console.error(formatCliError(err));
  process.exit(1);
});
