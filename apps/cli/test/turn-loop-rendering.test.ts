import * as nodeFs from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatToday,
  FsSessionStore,
  LocalFileRepository,
  MemoryLogger,
  Session,
  type FsSessionStoreOps,
} from "@gtd/core";
import type { TerminalOutput } from "../src/terminal-output.js";

const modelState = vi.hoisted((): { model: unknown } => ({ model: undefined }));

vi.mock("../src/model-provider.js", () => ({
  MODEL_ID: "mock-model",
  model: () => modelState.model,
  providerOptions: () => ({}),
}));

const { handleTurn } = await import("../src/turn-loop.js");
type TurnDeps = import("../src/turn-loop.js").TurnDeps;
type TurnRefs = import("../src/turn-loop.js").TurnRefs;

// How handleTurn renders each TurnResult on the terminal: the error prefixes,
// the log-path suffix, and the order endStream → chips → error line.

const ZERO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
} as const;

type Event = { kind: string; payload: unknown };

function captureTerminal(): TerminalOutput & { events: Event[] } {
  const events: Event[] = [];
  const push = (kind: string) => (payload?: unknown) => {
    events.push({ kind, payload });
  };
  return {
    events,
    assistantText: push("assistantText"),
    toolStatus: (name, input) =>
      events.push({ kind: "toolStatus", payload: { name, input } }),
    toolError: (name, err) =>
      events.push({ kind: "toolError", payload: { name, err } }),
    info: push("info"),
    sessionBanner: push("sessionBanner"),
    autoReplanBanner: push("autoReplanBanner"),
    replayLine: push("replayLine"),
    quickReplies: push("quickReplies"),
    errorSummary: push("errorSummary"),
    endStream: push("endStream"),
  };
}

function streamResult(
  chunks: LanguageModelV4StreamPart[],
): LanguageModelV4StreamResult {
  return { stream: simulateReadableStream({ chunks }) };
}

function quickReplyChunks(): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: "Was passt?" },
    { type: "text-end", id: "t1" },
    {
      type: "tool-call",
      toolCallId: "call-quick",
      toolName: "suggest_quick_replies",
      input: JSON.stringify({
        question: "Was passt?",
        options: ["Ja", "Nein"],
      }),
    },
    {
      type: "finish",
      usage: ZERO_USAGE,
      finishReason: { unified: "tool-calls", raw: undefined },
    },
  ];
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map((d) => rm(d, { recursive: true, force: true })),
  );
  tempDirs.length = 0;
  delete process.env.GTD_NOW_OVERRIDE;
  modelState.model = undefined;
});

// `failRenameOn` makes the n-th session save fail: 1 = Phase 1, 2 = Phase 2.
async function makeHarness(failRenameOn?: number): Promise<{
  deps: TurnDeps;
  refs: TurnRefs;
  terminal: ReturnType<typeof captureTerminal>;
  store: FsSessionStore;
}> {
  const vaultPath = await mkdtemp(path.join(tmpdir(), "keppt-turn-render-"));
  tempDirs.push(vaultPath);
  process.env.GTD_NOW_OVERRIDE = "2026-05-08T10:00:00Z";
  const turnNow = new Date(process.env.GTD_NOW_OVERRIDE);

  let renames = 0;
  const ops: FsSessionStoreOps = {
    mkdir: nodeFs.mkdir,
    readFile: nodeFs.readFile,
    writeFile: nodeFs.writeFile,
    rename: async (from, to) => {
      renames += 1;
      if (renames === failRenameOn) throw new Error("disk full");
      return nodeFs.rename(from, to);
    },
  };
  const store = new FsSessionStore(vaultPath, ops);
  const terminal = captureTerminal();
  const cliLogger = new MemoryLogger();
  const refs: TurnRefs = {
    session: Session.createEmpty(formatToday(turnNow)),
    turnLogger: null,
    turnNow,
    lastQuickReplies: null,
  };
  const repo = new LocalFileRepository(vaultPath, {
    now: () => refs.turnNow,
    logger: cliLogger,
  });
  return {
    deps: { vaultPath, repo, sessionStore: store, cliLogger, terminal },
    refs,
    terminal,
    store,
  };
}

function summaries(terminal: { events: Event[] }): string[] {
  return terminal.events
    .filter((e) => e.kind === "errorSummary")
    .map((e) => String(e.payload));
}

describe("handleTurn rendering", () => {
  it("renders a stream error as Error (stream) with the log path, without endStream", async () => {
    const { deps, refs, terminal } = await makeHarness();
    modelState.model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("provider down");
      },
    });

    await handleTurn(deps, refs, "hallo", new AbortController());

    expect(terminal.events.map((e) => e.kind)).toEqual(["errorSummary"]);
    const [summary] = summaries(terminal);
    expect(summary).toMatch(/^\nError \(stream\): /);
    expect(summary).toContain("provider down");
    expect(summary).toContain(
      `\nDetails logged to: ${path.join(deps.vaultPath, ".keppt", "logs", "cli-errors.jsonl")}`,
    );
  });

  it("renders an abort as the (stream aborted) info line and leaves only the user message on disk", async () => {
    const { deps, refs, terminal, store } = await makeHarness();
    const controller = new AbortController();
    modelState.model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => {
        controller.abort();
        if (abortSignal?.aborted) {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }
        return streamResult(quickReplyChunks());
      },
    });

    await handleTurn(deps, refs, "hallo", controller);

    expect(terminal.events).toEqual([
      { kind: "info", payload: "(stream aborted)" },
    ]);
    const reloaded = await store.loadOrCreate(refs.session.date);
    expect(reloaded.messages).toEqual([{ role: "user", content: "hallo" }]);
  });

  it("renders a Phase-2 save failure after endStream and the chips", async () => {
    const { deps, refs, terminal } = await makeHarness(2);
    modelState.model = new MockLanguageModelV4({
      doStream: async () => streamResult(quickReplyChunks()),
    });

    await handleTurn(deps, refs, "hallo", new AbortController());

    expect(terminal.events.map((e) => e.kind)).toEqual([
      "assistantText",
      "endStream",
      "quickReplies",
      "errorSummary",
    ]);
    expect(summaries(terminal)[0]).toMatch(
      /^\nError \(session_save_phase2\): /,
    );
    expect(refs.lastQuickReplies).toEqual(["Ja", "Nein"]);
  });

  it("renders a Phase-1 save failure as Error (session_save_phase1) and never calls the model", async () => {
    const { deps, refs, terminal } = await makeHarness(1);
    const model = new MockLanguageModelV4({
      doStream: async () => streamResult(quickReplyChunks()),
    });
    modelState.model = model;

    await handleTurn(deps, refs, "hallo", new AbortController());

    expect(terminal.events.map((e) => e.kind)).toEqual(["errorSummary"]);
    expect(summaries(terminal)[0]).toMatch(
      /^\nError \(session_save_phase1\): /,
    );
    expect(model.doStreamCalls).toHaveLength(0);
    expect(refs.session.messages).toEqual([]);
  });
});
