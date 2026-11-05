import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryFileRepository } from "../in-memory-file-repository.js";
import { MemoryLogger } from "../logging.js";
import { Session, type SessionStore } from "../sessions.js";
import type { QuickRepliesResult } from "../tools.js";
import { runTurn, type TurnEngineDeps } from "../turn-engine.js";
import { MemoryTurnLogger } from "../turn-log.js";
import type { TurnResult, TurnSink } from "../turn-sink.js";

// `@ai-sdk/provider` is not a direct dependency of core, so the stream
// types come from the mock model's own signature.
type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type StreamPart =
  StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

const TODAY = new Date("2026-05-08T10:00:00Z");
const DATE_KEY = "2026-05-08";

const ZERO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
} as const;

function streamResult(chunks: StreamPart[]): StreamResult {
  return { stream: simulateReadableStream({ chunks }) };
}

function textChunks(text: string): StreamPart[] {
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

function toolCallChunks(
  calls: Array<{ id: string; name: string; input: unknown }>,
): StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    ...calls.map(
      (call): StreamPart => ({
        type: "tool-call",
        toolCallId: call.id,
        toolName: call.name,
        input: JSON.stringify(call.input),
      }),
    ),
    {
      type: "finish",
      usage: ZERO_USAGE,
      finishReason: { unified: "tool-calls", raw: undefined },
    },
  ];
}

function quickReplyChunks(question: string, options: string[]): StreamPart[] {
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

function sequencedModel(
  results: StreamResult[],
  options: { modelId?: string; onCall?: (index: number) => void } = {},
): MockLanguageModelV4 {
  let callIndex = 0;
  return new MockLanguageModelV4({
    modelId: options.modelId,
    doStream: async () => {
      const next = results[callIndex];
      if (!next) throw new Error(`unexpected model call ${callIndex + 1}`);
      options.onCall?.(callIndex);
      callIndex += 1;
      return next;
    },
  });
}

class MemorySessionStore implements SessionStore {
  readonly saved: unknown[] = [];
  readonly failOnSave = new Set<number>();
  private saveCalls = 0;

  async loadOrCreate(date: string): Promise<Session> {
    return Session.createEmpty(date);
  }

  async save(session: Session): Promise<void> {
    this.saveCalls += 1;
    if (this.failOnSave.has(this.saveCalls)) {
      throw new Error(`save ${this.saveCalls} failed`);
    }
    this.saved.push(JSON.parse(JSON.stringify(session)));
  }
}

type SinkEvent =
  | { kind: "assistantText"; text: string }
  | { kind: "toolStart"; toolCallId: string; name: string; input: unknown }
  | { kind: "toolEnd"; toolCallId: string; name: string }
  | { kind: "toolError"; toolCallId: string; name: string; error: unknown }
  | { kind: "quickReplies"; payload: QuickRepliesResult }
  | { kind: "turnEnd"; result: TurnResult };

function recordingSink(): { sink: TurnSink; events: SinkEvent[] } {
  const events: SinkEvent[] = [];
  const sink: TurnSink = {
    assistantText: (text) => events.push({ kind: "assistantText", text }),
    toolStart: (toolCallId, name, input) =>
      events.push({ kind: "toolStart", toolCallId, name, input }),
    toolEnd: (toolCallId, name) =>
      events.push({ kind: "toolEnd", toolCallId, name }),
    toolError: (toolCallId, name, error) =>
      events.push({ kind: "toolError", toolCallId, name, error }),
    quickReplies: (payload) => events.push({ kind: "quickReplies", payload }),
    turnEnd: (result) => events.push({ kind: "turnEnd", result }),
  };
  return { sink, events };
}

async function makeHarness(
  model: MockLanguageModelV4,
  overrides: Partial<TurnEngineDeps> = {},
) {
  const repo = new InMemoryFileRepository({ now: () => TODAY });
  await repo.write("tasks/inbox.md", "- [ ] call mom\n", "seed");
  const store = new MemorySessionStore();
  const logger = new MemoryLogger();
  const { sink, events } = recordingSink();
  const deps: TurnEngineDeps = {
    repo,
    sessionStore: store,
    logger,
    model,
    providerOptions: {},
    now: () => TODAY,
    fileVersionAt: () => undefined,
    sink,
    ...overrides,
  };
  const session = Session.createEmpty(DATE_KEY);
  const run = (userText = "hi", signal = new AbortController().signal) =>
    runTurn(deps, { session, userText, abortSignal: signal });
  return { deps, session, store, logger, events, run };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("runTurn", () => {
  it("T4-AC-02: emits toolStart → toolEnd → assistantText → turnEnd for a tool→text turn", async () => {
    const model = sequencedModel([
      streamResult(
        toolCallChunks([
          {
            id: "call-1",
            name: "read_file",
            input: { file_path: "tasks/inbox.md" },
          },
        ]),
      ),
      streamResult(textChunks("done")),
    ]);
    const { session, store, logger, events, run } = await makeHarness(model);

    const result = await run();

    expect(result).toEqual({ outcome: "ok" });
    expect(events).toEqual([
      {
        kind: "toolStart",
        toolCallId: "call-1",
        name: "read_file",
        input: { file_path: "tasks/inbox.md" },
      },
      { kind: "toolEnd", toolCallId: "call-1", name: "read_file" },
      { kind: "assistantText", text: "done" },
      { kind: "turnEnd", result: { outcome: "ok" } },
    ]);
    expect(session.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    // Phase 1 saved the user message alone, Phase 2 the whole turn.
    expect(store.saved).toHaveLength(2);
    expect(store.saved[0]).toMatchObject({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(
      logger.events.filter((e) => e.code === "prompt.cache_usage"),
    ).toEqual([]);
  });

  it("T4-AC-03: a failing Phase-1 save rolls the session back, reports the phase and starts no stream", async () => {
    const model = sequencedModel([streamResult(textChunks("never"))]);
    const { session, store, events, run } = await makeHarness(model);
    store.failOnSave.add(1);

    const result = await run();

    expect(result).toEqual({
      outcome: "error",
      phase: "session_save_phase1",
      err: expect.any(Error),
    });
    expect(session.messages).toEqual([]);
    expect(model.doStreamCalls).toHaveLength(0);
    expect(events).toEqual([{ kind: "turnEnd", result }]);
  });

  it("T4-AC-04: stamps every response message with turnStartedAt although the stream finished later", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = TODAY.getTime();
    vi.setSystemTime(t0);
    const editTime = t0 + 5_000;
    const model = sequencedModel(
      [
        streamResult(
          toolCallChunks([
            {
              id: "call-1",
              name: "read_file",
              input: { file_path: "tasks/inbox.md" },
            },
          ]),
        ),
        streamResult(
          toolCallChunks([
            {
              id: "call-2",
              name: "edit_file",
              input: {
                file_path: "tasks/inbox.md",
                edits: [{ search: "call mom", replace: "call dad" }],
                change_summary: "rename",
              },
            },
          ]),
        ),
        streamResult(textChunks("edited")),
      ],
      // The edit happens 5 s into the turn; the read result must still be
      // stamped before it so the pruner's drift check can fire next turn.
      { onCall: (index) => vi.setSystemTime(index === 0 ? t0 : editTime) },
    );
    const { deps, session, run } = await makeHarness(model);

    const result = await run();

    expect(result).toEqual({ outcome: "ok" });
    expect(await deps.repo.read("tasks/inbox.md")).toBe("- [ ] call dad\n");
    expect(session.messages).toHaveLength(6);
    for (const msg of session.messages) {
      expect(session.createdAtOf(msg)).toBe(t0);
    }
    expect(Date.now()).toBe(editTime);
  });

  it("T4-AC-05: an abort mid-stream ends with turnEnd(aborted); Phase 1 persists, no Phase-2 append", async () => {
    const controller = new AbortController();
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => {
        if (model.doStreamCalls.length === 1) {
          return streamResult(
            toolCallChunks([
              {
                id: "call-1",
                name: "read_file",
                input: { file_path: "tasks/inbox.md" },
              },
            ]),
          );
        }
        controller.abort();
        if (abortSignal?.aborted) {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }
        return streamResult(textChunks("unreachable"));
      },
    });
    const { session, store, events, run } = await makeHarness(model);

    const result = await run("cut me", controller.signal);

    expect(result).toEqual({ outcome: "aborted" });
    expect(events.at(-1)).toEqual({
      kind: "turnEnd",
      result: { outcome: "aborted" },
    });
    expect(events.some((e) => e.kind === "toolEnd")).toBe(true);
    expect(session.messages).toEqual([{ role: "user", content: "cut me" }]);
    expect(store.saved).toHaveLength(1);
  });

  it("T4-AC-05: an abort before the first step completes ends with turnEnd(aborted) as well", async () => {
    const controller = new AbortController();
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => {
        controller.abort();
        if (abortSignal?.aborted) {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }
        return streamResult(textChunks("unreachable"));
      },
    });
    const { session, store, events, run } = await makeHarness(model);

    const result = await run("cut me", controller.signal);

    expect(result).toEqual({ outcome: "aborted" });
    expect(events).toEqual([
      { kind: "turnEnd", result: { outcome: "aborted" } },
    ]);
    expect(session.messages).toEqual([{ role: "user", content: "cut me" }]);
    expect(store.saved).toHaveLength(1);
  });

  it("T4-AC-06: a valid suggest_quick_replies result arrives once as quickReplies and never as a tool event", async () => {
    const model = sequencedModel([
      streamResult(quickReplyChunks("Was passt?", ["Ja", "Nein"])),
    ]);
    const { events, run } = await makeHarness(model);

    const result = await run();

    expect(result).toEqual({ outcome: "ok" });
    expect(events).toEqual([
      { kind: "assistantText", text: "Was passt?" },
      {
        kind: "quickReplies",
        payload: { question: "Was passt?", options: ["Ja", "Nein"] },
      },
      { kind: "turnEnd", result: { outcome: "ok" } },
    ]);
  });

  it("T4-AC-06: an invalid suggest_quick_replies call followed by its tool-error yields no quickReplies event", async () => {
    const model = sequencedModel([
      streamResult(quickReplyChunks("Was passt?", ["Ja", "x".repeat(201)])),
      streamResult(textChunks("fallback")),
    ]);
    const { logger, events, run } = await makeHarness(model);

    const result = await run();

    expect(result).toEqual({ outcome: "ok" });
    expect(events.some((e) => e.kind === "quickReplies")).toBe(false);
    expect(
      events.some(
        (e) =>
          e.kind === "toolStart" ||
          e.kind === "toolEnd" ||
          e.kind === "toolError",
      ),
    ).toBe(false);
    expect(
      logger.events.filter((e) => e.code === "stream.tool_error"),
    ).toHaveLength(1);
  });

  it("T4-AC-07: toolEnd fires for every non-quick-reply tool with its toolCallId and no payload", async () => {
    const model = sequencedModel([
      streamResult(
        toolCallChunks([
          {
            id: "call-1",
            name: "read_file",
            input: { file_path: "tasks/inbox.md" },
          },
          { id: "call-2", name: "list_files", input: { prefix: "tasks/" } },
        ]),
      ),
      streamResult(textChunks("done")),
    ]);
    const { events, run } = await makeHarness(model);

    await run();

    const ends = events
      .filter((e) => e.kind === "toolEnd")
      .sort((a, b) => a.toolCallId.localeCompare(b.toolCallId));
    expect(ends).toEqual([
      { kind: "toolEnd", toolCallId: "call-1", name: "read_file" },
      { kind: "toolEnd", toolCallId: "call-2", name: "list_files" },
    ]);
  });

  it("reports a failing Phase-2 save after the stream, rolls back, and still emitted the quick replies first", async () => {
    const model = sequencedModel([
      streamResult(quickReplyChunks("Was passt?", ["Ja", "Nein"])),
    ]);
    const { session, store, events, run } = await makeHarness(model);
    store.failOnSave.add(2);

    const result = await run();

    expect(result).toEqual({
      outcome: "error",
      phase: "session_save_phase2",
      err: expect.any(Error),
    });
    expect(session.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(events.map((e) => e.kind)).toEqual([
      "assistantText",
      "quickReplies",
      "turnEnd",
    ]);
  });

  it("reports a provider failure as outcome error/stream and records a stream_error artifact", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("provider down");
      },
    });
    const turnLogger = new MemoryTurnLogger();
    const { session, store, events, run } = await makeHarness(model, {
      turnLogger,
    });

    const result = await run();

    expect(result).toMatchObject({ outcome: "error", phase: "stream" });
    expect(String((result as { err: unknown }).err)).toContain("provider down");
    expect(events).toEqual([{ kind: "turnEnd", result }]);
    expect(session.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(store.saved).toHaveLength(1);
    expect(turnLogger.records).toHaveLength(1);
    expect(turnLogger.records[0]).toMatchObject({
      outcome: "stream_error",
      error: { message: expect.stringContaining("provider down") },
    });
  });

  it("reports a file tool's validation failure as toolError with the matching toolCallId", async () => {
    const model = sequencedModel([
      streamResult(
        toolCallChunks([
          { id: "call-1", name: "read_file", input: { path: "x" } },
        ]),
      ),
      streamResult(textChunks("recovered")),
    ]);
    const { logger, events, run } = await makeHarness(model);

    const result = await run();

    expect(result).toEqual({ outcome: "ok" });
    expect(events).toContainEqual({
      kind: "toolError",
      toolCallId: "call-1",
      name: "read_file",
      error: expect.anything(),
    });
    expect(events.some((e) => e.kind === "toolEnd")).toBe(false);
    expect(
      logger.events.filter((e) => e.code === "stream.tool_error"),
    ).toHaveLength(1);
  });

  it("writes one debug artifact per turn through the injected TurnLogger", async () => {
    const model = sequencedModel([streamResult(textChunks("hello"))], {
      modelId: "mock-model",
    });
    const turnLogger = new MemoryTurnLogger();
    const { logger, run } = await makeHarness(model, { turnLogger });

    await run();

    expect(turnLogger.records).toHaveLength(1);
    expect(turnLogger.records[0]).toMatchObject({
      turnId: "turn-001",
      model: "mock-model",
      outcome: "ok",
      responseMessages: [{ role: "assistant" }],
    });
    expect(turnLogger.records[0]?.initialRequest.messages.at(-1)).toMatchObject(
      {
        role: "user",
      },
    );
    expect(
      logger.events.filter((e) => e.code === "prompt.cache_usage"),
    ).toHaveLength(1);
  });
});
