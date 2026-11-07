import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  FsSessionStore,
  InMemoryFileRepository,
  MemoryLogger,
  Session,
  type SessionStore,
} from "@gtd/core";
import { createApp } from "../app.js";
import { TurnRegistry } from "../chat/turn-registry.js";
import { listen } from "./sse-client.js";

// The stream fixtures mirror core's engine test; the part types come from
// the mock's own signature because `@ai-sdk/provider` is not a dependency.
type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type StreamPart =
  StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

const ZERO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
} as const;

export function streamResult(chunks: StreamPart[]): StreamResult {
  return { stream: simulateReadableStream({ chunks }) };
}

export function textChunks(text: string): StreamPart[] {
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

export function toolCallChunks(
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

export function sequencedModel(results: StreamResult[]): MockLanguageModelV4 {
  let callIndex = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const next = results[callIndex];
      if (!next) throw new Error(`unexpected model call ${callIndex + 1}`);
      callIndex += 1;
      return next;
    },
  });
}

export class MemorySessionStore implements SessionStore {
  async loadOrCreate(date: string): Promise<Session> {
    return Session.createEmpty(date);
  }

  async save(): Promise<void> {}
}

/** A registry no test talks to, for `createApp` calls outside the chat routes. */
export function stubTurnRegistry(): TurnRegistry {
  return new TurnRegistry({
    repo: new InMemoryFileRepository(),
    sessionStore: new MemorySessionStore(),
    logger: new MemoryLogger(),
    model: new MockLanguageModelV4(),
    providerOptions: {},
    fileVersionAt: () => undefined,
  });
}

export const NOW = new Date("2026-05-08T10:00:00Z");
export const DATE_KEY = "2026-05-08";
export const FIRST_SEQ = 1000;

export interface SessionFile {
  date: string;
  entries: Array<{ message: { role: string }; origin: string }>;
}

export interface ChatServer {
  baseUrl: string;
  logger: MemoryLogger;
  readSession(): Promise<SessionFile | null>;
  /** Polls the session file until it holds at least `count` entries. */
  waitForEntries(count: number): Promise<SessionFile>;
  close(): Promise<void>;
}

export async function startChatServer(
  model: MockLanguageModelV4,
  options: { keepAliveMs?: number } = {},
): Promise<ChatServer> {
  const vault = await mkdtemp(path.join(tmpdir(), "keppt-server-chat-"));
  const repo = new InMemoryFileRepository({ now: () => NOW });
  await repo.write("tasks/inbox.md", "- [ ] call mom\n", "seed");
  const logger = new MemoryLogger();
  const turnRegistry = new TurnRegistry({
    repo,
    sessionStore: new FsSessionStore(vault),
    logger,
    model,
    providerOptions: {},
    fileVersionAt: () => undefined,
    now: () => NOW,
    seqSeed: () => FIRST_SEQ,
  });
  const app = createApp({
    logger,
    devUserId: "lutz",
    fileRepository: repo,
    turnRegistry,
    sseKeepAliveMs: options.keepAliveMs,
  });
  const { baseUrl, close } = await listen(app);
  const sessionFile = path.join(
    vault,
    ".keppt",
    "sessions",
    `${DATE_KEY}.json`,
  );

  const readSession = async (): Promise<SessionFile | null> => {
    try {
      return JSON.parse(await readFile(sessionFile, "utf8")) as SessionFile;
    } catch {
      return null;
    }
  };
  return {
    baseUrl,
    logger,
    readSession,
    waitForEntries: async (count) => {
      let session: SessionFile | null = null;
      await waitUntil(async () => {
        session = await readSession();
        return session !== null && session.entries.length >= count;
      });
      return session as unknown as SessionFile;
    },
    close: async () => {
      await close();
      await rm(vault, { recursive: true, force: true });
    },
  };
}

export async function postChat(
  baseUrl: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export async function waitUntil(
  condition: () => Promise<boolean> | boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("waitUntil: timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A model whose second step blocks until `open()`; `secondCallStarted` resolves when it is reached. */
export function gatedModel(): {
  model: MockLanguageModelV4;
  open: () => void;
  secondCallStarted: Promise<void>;
} {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  let started!: () => void;
  const secondCallStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
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
      started();
      await opened;
      if (abortSignal?.aborted) {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      return streamResult(textChunks("done"));
    },
  });
  return { model, open, secondCallStarted };
}
