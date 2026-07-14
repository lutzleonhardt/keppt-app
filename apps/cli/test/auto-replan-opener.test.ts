import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalFileRepository, MemoryLogger, Session } from "@gtd/core";
import { FsSessionStore } from "../src/fs-session-store.js";
import type { TerminalOutput } from "../src/terminal-output.js";

const modelState = vi.hoisted((): { model: unknown } => ({ model: undefined }));

vi.mock("../src/model-provider.js", () => ({
  MODEL_ID: "mock-model",
  model: () => modelState.model,
  providerOptions: () => ({}),
}));

const { maybeRunAutoReplanOpener, runAutoReplanOpener } =
  await import("../src/auto-replan-opener.js");
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
    autoReplanBanner: (message) =>
      events.push({ kind: "autoReplanBanner", payload: message }),
    replayLine: (line) => events.push({ kind: "replayLine", payload: line }),
    quickReplies: (payload) => events.push({ kind: "quickReplies", payload }),
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
    {
      type: "text-delta",
      id: "t1",
      delta: "Guten Morgen. Da ist noch etwas offen.",
    },
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

function failingMockModel(message = "auto replan failed"): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw new Error(message);
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

async function makeHarness(date = "2026-05-20"): Promise<{
  deps: TurnDeps;
  refs: TurnRefs;
  terminal: CapturedTerminal;
  store: FsSessionStore;
  repo: LocalFileRepository;
  vaultPath: string;
  cliLogger: MemoryLogger;
}> {
  const vaultPath = await mkdtemp(path.join(tmpdir(), "keppt-auto-replan-"));
  tempDirs.push(vaultPath);
  const store = new FsSessionStore(vaultPath);
  const session = Session.createEmpty(date);
  const turnNow = new Date(`${date}T09:00:00Z`);
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
    repo,
    vaultPath,
    cliLogger,
  };
}

describe("Auto-Replan opener", () => {
  it("T9-AC-04/T9-AC-10: successful opener persists the synthetic user message, response messages, and marker", async () => {
    const { deps, refs, terminal, store, repo } = await makeHarness();
    await repo.write(
      "tasks/next-actions.md",
      "- [ ] Steuer vorbereiten",
      "seed",
    );
    modelState.model = sequencedMockModel([
      streamResult(
        quickReplyChunks("Was möchtest du mit den offenen Punkten tun?", [
          "Tag planen",
          "Warten anzeigen",
        ]),
      ),
    ]);

    await runAutoReplanOpener(deps, refs);

    expect(refs.session.autoReplanRanFor).toBe("2026-05-20");
    expect(refs.session.messages[0]).toMatchObject({ role: "user" });
    expect(typeof refs.session.messages[0]?.content).toBe("string");
    expect(refs.session.messages[0]?.content).toContain(
      "Day rollover for 2026-05-20",
    );
    expect(refs.session.messages[0]?.content).toContain(
      "## daily/2026-05-20.md",
    );
    expect(refs.session.messages[0]?.content).toContain(
      "Use daily/2026-05-20.md as today's current plan context",
    );
    expect(refs.session.messages[0]?.content).toContain(
      'Later chip examples: "später/verschieben/ignorieren" -> source Plan box [-]',
    );
    expect(refs.session.messages[0]?.content).toContain(
      '"erledigt" -> source [x]',
    );
    expect(refs.session.messages.length).toBeGreaterThan(1);
    expect(refs.lastQuickReplies).toEqual(["Tag planen", "Warten anzeigen"]);
    expect(terminal.events).toContainEqual({
      kind: "autoReplanBanner",
      payload:
        "[Auto-Replan] Tagesstart-Check über letzte 5 Dailies + Next-Actions/Waiting…",
    });
    expect(terminal.events).toContainEqual({
      kind: "quickReplies",
      payload: {
        question: "Was möchtest du mit den offenen Punkten tun?",
        options: ["Tag planen", "Warten anzeigen"],
      },
    });

    const saved = await store.loadOrCreate("2026-05-20");
    expect(saved.autoReplanRanFor).toBe("2026-05-20");
    expect(saved.messages[0]).toEqual(refs.session.messages[0]);
  });

  it("drops and only logs an invalid quick-reply call from the opener", async () => {
    const { deps, refs, terminal, repo, cliLogger } = await makeHarness();
    await repo.write(
      "tasks/next-actions.md",
      "- [ ] Steuer vorbereiten",
      "seed",
    );
    refs.lastQuickReplies = ["alte Auswahl"];
    modelState.model = sequencedMockModel([
      streamResult(
        quickReplyChunks("Was möchtest du tun?", ["Planen", "x".repeat(201)]),
      ),
    ]);

    await runAutoReplanOpener(deps, refs);

    expect(refs.lastQuickReplies).toBeNull();
    expect(terminal.events.some((event) => event.kind === "quickReplies")).toBe(
      false,
    );
    expect(terminal.events.some((event) => event.kind === "toolError")).toBe(
      false,
    );
    expect(cliLogger.byCode("stream.tool_error")).toHaveLength(1);
    expect(cliLogger.byCode("stream.tool_error")[0]?.meta).toMatchObject({
      toolName: "suggest_quick_replies",
      autoReplan: true,
    });
  });

  it("T9-AC-05: empty context skips banner, stream, messages, and marker", async () => {
    const { deps, refs, terminal } = await makeHarness();
    modelState.model = failingMockModel("should not be called");

    await runAutoReplanOpener(deps, refs);

    expect(refs.session.messages).toHaveLength(0);
    expect(refs.session.autoReplanRanFor).toBeUndefined();
    expect(terminal.events).toEqual([]);
  });

  it("T9-AC-06: maybeRunAutoReplanOpener is a no-op when today's marker is already set", async () => {
    const { deps, refs, terminal, repo } = await makeHarness();
    await repo.write("tasks/waiting.md", "- [ ] Antwort von Max", "seed");
    refs.session.setAutoReplanRanFor("2026-05-20");
    modelState.model = failingMockModel("should not be called");

    await maybeRunAutoReplanOpener(deps, refs);

    expect(refs.session.messages).toHaveLength(0);
    expect(terminal.events).toEqual([]);
  });

  it("T9-AC-07: fresh-start trigger helper fires before any REPL turn is handled", async () => {
    const { deps, refs, terminal, repo } = await makeHarness();
    await repo.write("tasks/waiting.md", "- [ ] Antwort von Max", "seed");
    modelState.model = sequencedMockModel([
      streamResult(textChunks("Morgen.")),
    ]);

    await maybeRunAutoReplanOpener(deps, refs);

    expect(terminal.events[0]).toMatchObject({ kind: "autoReplanBanner" });
    expect(refs.session.messages[0]).toMatchObject({ role: "user" });
    expect(refs.session.autoReplanRanFor).toBe("2026-05-20");
  });

  it("T9-AC-08: dayRolloverGuard announces the boundary, runs opener, then handles the submitted turn", async () => {
    const { deps, refs, terminal, repo, store } =
      await makeHarness("2026-05-20");
    process.env.GTD_NOW_OVERRIDE = "2026-05-21T09:00:00Z";
    await repo.write("daily/2026-05-20.md", "- [ ] Anna anrufen", "seed");
    modelState.model = sequencedMockModel([
      streamResult(
        quickReplyChunks("Wie möchtest du Anna behandeln?", [
          "Heute planen",
          "Später",
        ]),
      ),
      streamResult(textChunks("Ich mache weiter.")),
    ]);

    await handleTurn(
      deps,
      refs,
      "nach Mitternacht weiter",
      new AbortController(),
    );

    const bannerIndex = terminal.events.findIndex(
      (event) =>
        event.kind === "sessionBanner" &&
        String(event.payload).includes("day rollover"),
    );
    const openerIndex = terminal.events.findIndex(
      (event) => event.kind === "autoReplanBanner",
    );
    expect(bannerIndex).toBeGreaterThanOrEqual(0);
    expect(openerIndex).toBeGreaterThan(bannerIndex);
    expect(refs.session.date).toBe("2026-05-21");
    expect(refs.session.autoReplanRanFor).toBe("2026-05-21");
    expect(refs.session.messages.some((msg) => msg.role === "user")).toBe(true);
    expect(refs.lastQuickReplies).toBeNull();

    const saved = await store.loadOrCreate("2026-05-21");
    expect(saved.autoReplanRanFor).toBe("2026-05-21");
    expect(
      saved.messages.some(
        (msg) =>
          msg.role === "user" &&
          typeof msg.content === "string" &&
          msg.content.includes("nach Mitternacht weiter"),
      ),
    ).toBe(true);
  });

  it("T9-AC-09: stream failure leaves marker unset, logs the error, and resolves", async () => {
    const { deps, refs, terminal, repo, vaultPath } = await makeHarness();
    await repo.write("tasks/waiting.md", "- [ ] Antwort von Max", "seed");
    modelState.model = failingMockModel();

    await runAutoReplanOpener(deps, refs);

    expect(refs.session.autoReplanRanFor).toBeUndefined();
    expect(refs.session.messages).toHaveLength(0);
    expect(terminal.events.some((event) => event.kind === "errorSummary")).toBe(
      true,
    );
    const log = await readFile(
      path.join(vaultPath, ".keppt", "logs", "cli-errors.jsonl"),
      "utf8",
    );
    expect(log).toContain("auto_replan_stream");
  });
});
