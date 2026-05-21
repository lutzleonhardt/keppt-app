import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getCliErrorLogPath } from "../src/cli-error-log.js";
import { createCliLogger } from "../src/cli-logger.js";
import type { TerminalOutput } from "../src/terminal-output.js";

interface CapturedTerminal extends TerminalOutput {
  events: Array<{ kind: string; payload: unknown }>;
}

function captureTerminal(): CapturedTerminal {
  const events: Array<{ kind: string; payload: unknown }> = [];
  return {
    events,
    assistantText: (text) =>
      events.push({ kind: "assistantText", payload: text }),
    toolStatus: (name, input) =>
      events.push({ kind: "toolStatus", payload: { name, input } }),
    toolError: (name, err) =>
      events.push({ kind: "toolError", payload: { name, err } }),
    info: (message) => events.push({ kind: "info", payload: message }),
    sessionBanner: (message) =>
      events.push({ kind: "sessionBanner", payload: message }),
    replayLine: (line) => events.push({ kind: "replayLine", payload: line }),
    quickReplies: (payload) =>
      events.push({ kind: "quickReplies", payload }),
    errorSummary: (message) =>
      events.push({ kind: "errorSummary", payload: message }),
    endStream: () => events.push({ kind: "endStream", payload: undefined }),
  };
}

async function makeVault(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "keppt-cli-logger-"));
}

async function readEntries(
  vaultPath: string,
): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(getCliErrorLogPath(vaultPath), "utf8");
  return text
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

// Wait for fire-and-forget JSONL writes to land on disk. The CLI Logger
// methods return void so writes happen on the microtask queue plus actual
// fs I/O — polling for the expected line count is more reliable than
// counting microtask ticks.
async function waitForEntries(
  vaultPath: string,
  expected: number,
  timeoutMs = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entries = await readEntries(vaultPath).catch(() => []);
    if (entries.length >= expected) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `waitForEntries: expected ${expected} entries within ${timeoutMs}ms, got ${entries.length}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function drainTerminal(
  terminal: CapturedTerminal,
  expectedKind: string,
  timeoutMs = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (
    !terminal.events.some((e) => e.kind === expectedKind) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(() => {
  // Temp dirs go to OS tmp, no cleanup needed for this test.
});

describe("createCliLogger — JSONL persistence", () => {
  it("writes entries for every level with the correct level field", async () => {
    const vaultPath = await makeVault();
    const terminal = captureTerminal();
    const logger = createCliLogger({ vaultPath, terminal });

    logger.debug({ message: "d", code: "x.debug", meta: { k: 1 } });
    logger.info({ message: "i", code: "x.info" });
    logger.warn({ message: "w", code: "x.warn" });
    logger.error({ message: "e", code: "x.error", err: new Error("boom") });

    await waitForEntries(vaultPath, 4);
    const entries = await readEntries(vaultPath);
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.level)).toEqual([
      "debug",
      "info",
      "warn",
      "error",
    ]);
    expect(entries[0]).toMatchObject({
      level: "debug",
      code: "x.debug",
      message: "d",
      meta: { k: 1 },
    });
    expect(entries[3]).toMatchObject({
      level: "error",
      code: "x.error",
      message: "e",
      kind: "error",
      name: "Error",
    });
  });

  it("error level renders a concise summary on the terminal sink with the JSONL path", async () => {
    const vaultPath = await makeVault();
    const terminal = captureTerminal();
    const logger = createCliLogger({ vaultPath, terminal });

    logger.error({ message: "stream failed", err: new Error("boom") });
    await drainTerminal(terminal, "errorSummary");

    const summaries = terminal.events.filter((e) => e.kind === "errorSummary");
    expect(summaries).toHaveLength(1);
    const message = summaries[0]?.payload as string;
    expect(message).toContain("boom");
    expect(message).toContain(getCliErrorLogPath(vaultPath));
  });

  it("does not write to the terminal sink for non-error levels", async () => {
    const vaultPath = await makeVault();
    const terminal = captureTerminal();
    const logger = createCliLogger({ vaultPath, terminal });

    logger.debug({ message: "d" });
    logger.info({ message: "i" });
    logger.warn({ message: "w" });
    await waitForEntries(vaultPath, 3);

    expect(terminal.events).toEqual([]);
  });
});
