import { afterEach, describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { ErrorBody, SessionEvent } from "@gtd/api";

import {
  FIRST_SEQ,
  gatedModel,
  postChat,
  sequencedModel,
  startChatServer,
  streamResult,
  textChunks,
  waitUntil,
  type ChatServer,
} from "./chat-harness.js";
import { openSse, type SseConnection, type SseFrame } from "./sse-client.js";

const servers: ChatServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function serve(
  model: MockLanguageModelV4,
  options?: { keepAliveMs?: number },
): Promise<ChatServer> {
  const server = await startChatServer(model, options);
  servers.push(server);
  return server;
}

const textModel = (text = "done") =>
  sequencedModel([streamResult(textChunks(text))]);

type ReceivedEvent = SessionEvent & { seq: number };

function eventsOf(frames: readonly SseFrame[]): ReceivedEvent[] {
  return frames.map((frame) => ({
    seq: Number(frame.id),
    ...(JSON.parse(frame.data) as SessionEvent),
  }));
}

const isType =
  (type: SessionEvent["type"]) =>
  (frame: SseFrame): boolean =>
    frame.event === type;

async function errorBody(res: Response): Promise<ErrorBody> {
  return (await res.json()) as ErrorBody;
}

describe("POST /api/chat", () => {
  it("T6.1-AC-06: rejects a code paste before the model and malformed bodies as invalid_request", async () => {
    const model = textModel();
    const { baseUrl } = await serve(model);
    const paste = Array.from(
      { length: 8 },
      (_, i) => `  const value${i} = compute(${i});`,
    ).join("\n");

    const rejected = await postChat(baseUrl, { message: paste });
    expect(rejected.status).toBe(400);
    const body = await errorBody(rejected);
    expect(body.error.code).toBe("input_rejected");
    expect(body.error.requestId).toBe(rejected.headers.get("x-request-id"));

    const malformed = await postChat(baseUrl, "{not json");
    expect(malformed.status).toBe(400);
    expect((await errorBody(malformed)).error).toEqual({
      code: "invalid_request",
      message: "Malformed request body",
      requestId: malformed.headers.get("x-request-id"),
    });

    const notAString = await postChat(baseUrl, { message: 42 });
    expect(notAString.status).toBe(400);
    expect((await errorBody(notAString)).error.code).toBe("invalid_request");

    expect(model.doStreamCalls).toHaveLength(0);
  });

  it("T6.1-AC-01: a turn completes and persists with no stream attached, and a later subscriber gets it replayed", async () => {
    const server = await serve(textModel("Hallo!"));

    const res = await postChat(server.baseUrl, { message: "hi" });
    expect(res.status).toBe(202);
    const { turnId } = (await res.json()) as { turnId: string };
    expect(turnId).toMatch(/^[0-9a-f-]{36}$/);

    const session = await server.waitForEntries(2);
    expect(session.entries.map((e) => e.message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(session.entries.map((e) => e.origin)).toEqual(["user", "user"]);

    const stream = await openSse(server.baseUrl);
    await stream.waitFor(isType("turn-end"));
    expect(eventsOf(stream.frames)).toEqual([
      {
        seq: FIRST_SEQ,
        type: "turn-start",
        turnId,
        kind: "user",
        message: "hi",
      },
      { seq: FIRST_SEQ + 1, type: "text-delta", turnId, text: "Hallo!" },
      { seq: FIRST_SEQ + 2, type: "turn-end", turnId, outcome: "ok" },
    ]);
    stream.abort();
  });

  it("T6.1-AC-04: a second POST during an in-flight turn is 409 and starts no second turn", async () => {
    const { model, open, secondCallStarted } = gatedModel();
    const server = await serve(model);

    const first = await postChat(server.baseUrl, { message: "one" });
    expect(first.status).toBe(202);
    await secondCallStarted;
    const second = await postChat(server.baseUrl, { message: "two" });
    expect(second.status).toBe(409);
    expect((await errorBody(second)).error.code).toBe("turn_in_flight");

    open();
    const session = await server.waitForEntries(4);
    expect(session.entries[0]?.message).toMatchObject({ content: "one" });
    expect(model.doStreamCalls).toHaveLength(2);
    const stream = await openSse(server.baseUrl);
    await stream.waitFor(isType("turn-end"));
    expect(stream.frames.filter(isType("turn-start"))).toHaveLength(1);
    stream.abort();
  });
});

describe("GET /api/chat/stream", () => {
  it("T6.1-AC-02: a subscriber attaching mid-turn gets the buffered events, then live ones, with contiguous seqs", async () => {
    const { model, open, secondCallStarted } = gatedModel();
    const server = await serve(model);
    await postChat(server.baseUrl, { message: "hi" });
    await secondCallStarted;

    const stream = await openSse(server.baseUrl);
    await stream.waitFor(isType("tool-end"));
    expect(stream.frames.map((f) => f.event)).toEqual([
      "turn-start",
      "tool-start",
      "tool-end",
    ]);
    expect(eventsOf(stream.frames)[1]).toMatchObject({
      type: "tool-start",
      toolCallId: "call-1",
      tool: "read_file",
      target: "tasks/inbox.md",
    });

    open();
    await stream.waitFor(isType("turn-end"));
    const events = eventsOf(stream.frames);
    expect(events.map((e) => e.type)).toEqual([
      "turn-start",
      "tool-start",
      "tool-end",
      "text-delta",
      "turn-end",
    ]);
    expect(events.map((e) => e.seq)).toEqual(
      events.map((_, i) => FIRST_SEQ + i),
    );
    stream.abort();
  });

  it("T6.1-AC-03: a cursor replays only later events; an unservable cursor yields exactly one resync", async () => {
    const server = await serve(textModel());
    await postChat(server.baseUrl, { message: "hi" });
    await server.waitForEntries(2);
    const tip = FIRST_SEQ + 2; // turn-start, text-delta, turn-end

    const partial = await openSse(server.baseUrl, FIRST_SEQ);
    await partial.waitFor(isType("turn-end"));
    expect(eventsOf(partial.frames).map((e) => e.seq)).toEqual([
      FIRST_SEQ + 1,
      tip,
    ]);
    partial.abort();

    const upToDate = await openSse(server.baseUrl, tip);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(upToDate.frames).toEqual([]);
    upToDate.abort();

    for (const stale of [FIRST_SEQ - 2, tip + 5]) {
      const stream = await openSse(server.baseUrl, stale);
      await stream.ended;
      expect(stream.frames).toEqual([{ event: "resync", data: "{}" }]);
    }

    const invalid = await fetch(`${server.baseUrl}/api/chat/stream?cursor=abc`);
    expect(invalid.status).toBe(400);
    expect((await errorBody(invalid)).error.code).toBe("invalid_request");
  });

  it("streams with the SSE headers and keeps idle connections alive with comment lines", async () => {
    const server = await serve(textModel(), { keepAliveMs: 20 });
    const stream = await openSse(server.baseUrl);
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(stream.headers.get("cache-control")).toBe("no-cache");
    expect(stream.headers.get("x-accel-buffering")).toBe("no");
    await waitUntil(() => stream.comments.length > 0);
    expect(stream.frames).toEqual([]);
    stream.abort();
  });

  it("T6.1-AC-08: a client disconnect mid-turn does not abort — the turn completes and persists", async () => {
    const { model, open, secondCallStarted } = gatedModel();
    const server = await serve(model);
    await postChat(server.baseUrl, { message: "hi" });
    await secondCallStarted;

    const dropped = await openSse(server.baseUrl);
    await dropped.waitFor(isType("tool-end"));
    dropped.abort();
    await dropped.ended;

    open();
    await server.waitForEntries(4);
    const late = await openSse(server.baseUrl);
    const end = await late.waitFor(isType("turn-end"));
    expect(JSON.parse(end.data)).toMatchObject({ outcome: "ok" });
    late.abort();
  });
});

describe("POST /api/chat/cancel", () => {
  it("T6.1-AC-05: aborts the in-flight turn — turn-end aborted, phase-1 message persisted, no phase-2 append", async () => {
    const { model, open, secondCallStarted } = gatedModel();
    const server = await serve(model);
    await postChat(server.baseUrl, { message: "cut me" });
    await secondCallStarted;
    const stream = await openSse(server.baseUrl);

    const cancel = await fetch(`${server.baseUrl}/api/chat/cancel`, {
      method: "POST",
    });
    expect(cancel.status).toBe(204);
    open();

    const end = await stream.waitFor(isType("turn-end"));
    expect(JSON.parse(end.data)).toMatchObject({ outcome: "aborted" });
    expect(stream.frames.some(isType("error"))).toBe(false);
    const session = await server.readSession();
    expect(session?.entries.map((e) => e.message.role)).toEqual(["user"]);

    // The slot is free again: the next turn starts and completes.
    const next = await postChat(server.baseUrl, { message: "again" });
    expect(next.status).toBe(202);
    await server.waitForEntries(3);
    stream.abort();
  });

  it("is a no-op without an in-flight turn", async () => {
    const server = await serve(textModel());
    const res = await fetch(`${server.baseUrl}/api/chat/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
  });
});

describe("turn failures", () => {
  it("T6.1-AC-07: a provider failure emits error with the originating requestId, then turn-end error/stream; the log entry is metadata-only", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("provider down: sk-live-secret");
      },
    });
    const server = await serve(model);

    const res = await postChat(server.baseUrl, { message: "hi" });
    expect(res.status).toBe(202);
    const requestId = res.headers.get("x-request-id");
    const { turnId } = (await res.json()) as { turnId: string };

    const stream = await openSse(server.baseUrl);
    await stream.waitFor(isType("turn-end"));
    const events = eventsOf(stream.frames);
    expect(events.map((e) => e.type)).toEqual([
      "turn-start",
      "error",
      "turn-end",
    ]);
    expect(events[1]).toMatchObject({
      turnId,
      error: { code: "turn_failed", message: "The turn failed", requestId },
    });
    expect(events[2]).toMatchObject({ outcome: "error", phase: "stream" });
    expect(JSON.stringify(events)).not.toContain("provider down");
    stream.abort();

    const entries = server.logger.byCode("chat.turn_failed");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "error",
      requestId,
      userId: "lutz",
      phase: "stream",
      meta: { turnId },
    });
    expect(
      JSON.stringify({ message: entries[0]?.message, meta: entries[0]?.meta }),
    ).not.toContain("provider down");
    expect(String((entries[0]?.err as Error).message)).toContain(
      "provider down",
    );
  });
});
