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
  LocalFileRepository,
  MemoryLogger,
  Session,
} from "@gtd/core";
import { FsSessionStore } from "../src/fs-session-store.js";
import { expandQuickReplyLine } from "../src/quick-replies.js";
import {
  formatQuickReplies,
  type TerminalOutput,
} from "../src/terminal-output.js";

const modelState = vi.hoisted((): { model: unknown } => ({ model: undefined }));

vi.mock("../src/model-provider.js", () => ({
  MODEL_ID: "mock-model",
  model: () => modelState.model,
  providerOptions: () => ({}),
}));

const { handleTurn } = await import("../src/turn-loop.js");
type TurnDeps = import("../src/turn-loop.js").TurnDeps;
type TurnRefs = import("../src/turn-loop.js").TurnRefs;

const ZERO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
} as const;

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

function streamResult(
  chunks: LanguageModelV4StreamPart[],
): LanguageModelV4StreamResult {
  return { stream: simulateReadableStream({ chunks }) };
}

function textChunks(text: string): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    {
      type: "finish",
      usage: ZERO_USAGE,
      finishReason: { unified: "stop", raw: undefined },
    },
  ];
}

function quickReplyChunks(
  question: string,
  options: string[],
): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: "Was passt?" },
    { type: "text-end", id: "t1" },
    {
      type: "tool-call",
      toolCallId: "call-quick",
      toolName: "suggest_quick_replies",
      input: JSON.stringify({ question, options }),
    },
    {
      type: "finish",
      usage: ZERO_USAGE,
      finishReason: { unified: "tool-calls", raw: undefined },
    },
  ];
}

function sequencedMockModel(
  results: LanguageModelV4StreamResult[],
): MockLanguageModelV4 {
  let callIndex = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const next = results[callIndex];
      if (!next) {
        throw new Error(`unexpected model call ${callIndex + 1}`);
      }
      callIndex += 1;
      return next;
    },
  });
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

async function makeHarness(): Promise<{
  deps: TurnDeps;
  refs: TurnRefs;
  terminal: CapturedTerminal;
  store: FsSessionStore;
}> {
  const vaultPath = await mkdtemp(path.join(tmpdir(), "keppt-quick-replies-"));
  tempDirs.push(vaultPath);
  process.env.GTD_NOW_OVERRIDE = "2026-05-08T10:00:00Z";

  const store = new FsSessionStore(vaultPath);
  const session = Session.createEmpty(
    formatToday(new Date(process.env.GTD_NOW_OVERRIDE)),
  );
  const turnNow = new Date(process.env.GTD_NOW_OVERRIDE);
  const terminal = captureTerminal();
  const cliLogger = new MemoryLogger();
  const refs: TurnRefs = {
    session,
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

describe("quick replies", () => {
  it("captures streamed suggestions and renders question + numbered options (T6-AC-02)", async () => {
    const { deps, refs, terminal } = await makeHarness();
    const question = "Soll ich das so eintragen?";
    modelState.model = sequencedMockModel([
      streamResult(quickReplyChunks(question, ["a", "b", "c"])),
    ]);

    await handleTurn(deps, refs, "weiter", new AbortController());

    expect(refs.lastQuickReplies).toEqual(["a", "b", "c"]);
    expect(terminal.events).toContainEqual({
      kind: "quickReplies",
      payload: { question, options: ["a", "b", "c"] },
    });
    const formatted = formatQuickReplies({
      question,
      options: ["a", "b", "c"],
    });
    expect(formatted.startsWith(question)).toBe(true);
    expect(formatted).toContain("[1] a");
    expect(formatted).toContain("[2] b");
    expect(formatted).toContain("[3] c");
    expect(terminal.events).not.toContainEqual({
      kind: "toolStatus",
      payload: {
        name: "suggest_quick_replies",
        input: { question, options: ["a", "b", "c"] },
      },
    });
  });

  it("expands a numeric pick before handleTurn records the user message (T6-AC-03)", async () => {
    const { deps, refs, store } = await makeHarness();
    refs.lastQuickReplies = [
      "Tag planen",
      "Warten auf zeigen",
      "Erstmal nur erfassen",
    ];
    modelState.model = sequencedMockModel([streamResult(textChunks("ok"))]);

    const line = expandQuickReplyLine("2", refs.lastQuickReplies);
    await handleTurn(deps, refs, line, new AbortController());

    const saved = await store.loadOrCreate("2026-05-08");
    expect(saved.messages[0]).toEqual({
      role: "user",
      content: "Warten auf zeigen",
    });
  });

  it.each([
    ["verbatim free text", "warten auf zeigen", "warten auf zeigen"],
    ["out-of-range digit", "4", "4"],
    ["partial digit-plus-text", "2 maybe", "2 maybe"],
  ])("passes through %s unchanged (T6-AC-04..06)", (_label, line, expected) => {
    expect(
      expandQuickReplyLine(line, [
        "Tag planen",
        "Warten auf zeigen",
        "Erstmal nur erfassen",
      ]),
    ).toBe(expected);
  });

  // The earlier "Model sent no prose" runtime fallback was removed
  // 2026-05-21 along with the proseEmitted tracker — the new chip
  // schema requires a `question` field, so chips can no longer reach
  // the terminal without prose context. This test pins that contract:
  // a chip call with an empty/missing question is dropped by the
  // payload parser and no chips are rendered.
  it("drops the chip call when the model emits an empty question", async () => {
    const { deps, refs, terminal } = await makeHarness();
    modelState.model = sequencedMockModel([
      streamResult(quickReplyChunks("", ["Ja", "Nein"])),
    ]);

    await handleTurn(deps, refs, "weiter", new AbortController());

    expect(refs.lastQuickReplies).toBeNull();
    expect(
      terminal.events.some((e) => e.kind === "quickReplies"),
    ).toBe(false);
  });

  it("clears stale suggestions when the next model turn does not call the tool (T6-AC-07)", async () => {
    const { deps, refs } = await makeHarness();
    modelState.model = sequencedMockModel([
      streamResult(quickReplyChunks("Was als nächstes?", ["Tag planen", "Warten auf zeigen"])),
      streamResult(textChunks("ok")),
    ]);

    await handleTurn(deps, refs, "weiter", new AbortController());
    expect(refs.lastQuickReplies).toEqual(["Tag planen", "Warten auf zeigen"]);

    const expanded = expandQuickReplyLine("2", refs.lastQuickReplies);
    expect(expanded).toBe("Warten auf zeigen");
    await handleTurn(deps, refs, expanded, new AbortController());

    expect(refs.lastQuickReplies).toBeNull();
    expect(expandQuickReplyLine("2", refs.lastQuickReplies)).toBe("2");
  });
});
