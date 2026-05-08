#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, streamText, type ModelMessage } from "ai";
import { buildTools, LocalFileRepository } from "@gtd/core";
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

  const repo = new LocalFileRepository(vaultPath);
  const tools = buildTools(repo);
  const system = buildMinimalSystemPrompt(new Date());
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

    try {
      const result = streamText({
        model: anthropic("claude-haiku-4-5"),
        system,
        messages: [...messages, pendingUser],
        tools,
        stopWhen: isStepCount(MAX_STEPS),
        abortSignal: controller.signal,
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
        console.error("\nStream error:", err);
      }
    } finally {
      activeAbort = null;
      rl.resume();
      rl.prompt();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
