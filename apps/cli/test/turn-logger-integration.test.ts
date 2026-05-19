import * as nodeFs from "node:fs/promises";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { isStepCount, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import type { ModelMessage, ToolModelMessage, ToolResultPart } from "ai";

import {
  buildRequest,
  MemoryLogger,
  MemoryTurnLogger,
  type TurnLogger,
} from "@gtd/core";
import { FsSessionStore } from "../src/fs-session-store.js";
import {
  FsTurnLogger,
  type FsTurnLoggerOps,
} from "../src/fs-turn-logger.js";
import {
  writeTurnArtifact,
  type TurnLogContext,
} from "../src/turn-artifact.js";

// Drives the production `writeTurnArtifact` helper across the same exit
// paths the CLI uses (ok / aborted / stream_error). Stream-side scaffolding
// is shared with `two-phase-save.test.ts`.

const MODEL_ID = "claude-haiku-4-5";

const ZERO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
} as const;

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

function readFileStreamChunks(opts: {
  callId: string;
  filePath: string;
}): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-input-start",
      id: opts.callId,
      toolName: "read_file",
      providerExecuted: false,
    },
    {
      type: "tool-input-delta",
      id: opts.callId,
      delta: JSON.stringify({ file_path: opts.filePath }),
    },
    { type: "tool-input-end", id: opts.callId },
    {
      type: "tool-call",
      toolCallId: opts.callId,
      toolName: "read_file",
      input: JSON.stringify({ file_path: opts.filePath }),
      providerExecuted: false,
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
});

async function makeVault(): Promise<string> {
  const d = await mkdtemp(path.join(tmpdir(), "gtd-cli-turn-log-"));
  tempDirs.push(d);
  return d;
}

function sessionDir(vault: string, date: string): string {
  return path.join(vault, ".keppt", "logs", "sessions", date);
}

interface MakeCtxArgs {
  turnLogger: TurnLogger;
  turnId: string;
  startedAtMs: number;
  system?: string;
  messages?: readonly ModelMessage[];
  cliLogger?: MemoryLogger;
}

function makeCtx(args: MakeCtxArgs): {
  ctx: TurnLogContext;
  logger: MemoryLogger;
} {
  const logger = args.cliLogger ?? new MemoryLogger();
  return {
    logger,
    ctx: {
      turnLogger: args.turnLogger,
      turnId: args.turnId,
      startedAtMs: args.startedAtMs,
      model: MODEL_ID,
      system: args.system ?? "sys",
      messages: args.messages ?? [{ role: "user", content: "hi" }],
      providerOptions: {
        disableParallelToolUse: true,
        cacheControl: { type: "ephemeral" as const },
      },
      cliLogger: logger,
    },
  };
}

describe("turn logger integration", () => {
  it("T4.2-AC-01: DEBUG=1 → one ok turn produces turn-001.json with the post-pruning request snapshot and response messages", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const session = await store.loadOrCreate("2026-05-19");
    const turnLogger = await FsTurnLogger.create(vault, "2026-05-19");

    const turnStartedAt = 1_000;
    session.appendTurn(
      [{ role: "user", content: "what's in inbox?" }],
      turnStartedAt,
    );
    await store.save(session);

    const turnId = turnLogger.nextTurnId();
    const { system, messages: requestMessages } = buildRequest({
      today: new Date("2026-05-19T10:00:00Z"),
      messages: session.messages,
      fileVersionAt: () => undefined,
      messageCreatedAt: (m) => session.createdAtOf(m) ?? Date.now(),
    });

    const model = new MockLanguageModelV4({
      doStream: async () => streamResult(textChunks("here you go")),
    });
    const result = streamText({
      model,
      system,
      messages: requestMessages,
      stopWhen: isStepCount(1),
    });
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error;
    }
    const response = await result.response;
    session.appendTurn(response.messages, turnStartedAt);
    await store.save(session);

    const { ctx, logger } = makeCtx({
      turnLogger,
      turnId,
      startedAtMs: turnStartedAt,
      system,
      messages: requestMessages,
    });
    await writeTurnArtifact(ctx, {
      outcome: "ok",
      steps: await result.steps,
      totalUsage: await result.totalUsage,
      responseMessages: response.messages,
    });

    const raw = JSON.parse(
      await readFile(
        path.join(sessionDir(vault, "2026-05-19"), "turn-001.json"),
        "utf8",
      ),
    );
    expect(raw.turnId).toBe("turn-001");
    expect(raw.outcome).toBe("ok");
    expect(raw.model).toBe(MODEL_ID);
    expect(raw.initialRequest.system).toBeTruthy();
    expect(raw.initialRequest.messages.at(-1)).toEqual({
      role: "user",
      content: "what's in inbox?",
    });
    expect(raw.responseMessages).toEqual(response.messages);
    expect(logger.events).toHaveLength(0);
  });

  it("T4.2-AC-02: no turnLogger (DEBUG off) → nothing under .keppt/logs/sessions/", async () => {
    // Models the production gating: when DEBUG !== "1" the CLI never builds
    // a `TurnLogContext`, so `writeTurnArtifact` is never invoked and no
    // directory materializes.
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const session = await store.loadOrCreate("2026-05-19");

    session.appendTurn([{ role: "user", content: "hello" }], 1_000);
    await store.save(session);

    const model = new MockLanguageModelV4({
      doStream: async () => streamResult(textChunks("hi")),
    });
    const result = streamText({
      model,
      messages: [...session.messages],
      stopWhen: isStepCount(1),
    });
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error;
    }
    const response = await result.response;
    session.appendTurn(response.messages, 1_000);
    await store.save(session);

    await expect(
      stat(sessionDir(vault, "2026-05-19")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("T4.2-AC-05: day-rollover → day-2 artifacts land under day-2 dir, counter restarts at 001", async () => {
    const vault = await makeVault();

    const day1 = await FsTurnLogger.create(vault, "2026-05-19");
    const id1 = day1.nextTurnId();
    expect(id1).toBe("turn-001");
    const { ctx: ctx1 } = makeCtx({
      turnLogger: day1,
      turnId: id1,
      startedAtMs: Date.parse("2026-05-19T23:59:30Z"),
      messages: [{ role: "user", content: "before midnight" }],
    });
    await writeTurnArtifact(ctx1, { outcome: "aborted" });

    const day2 = await FsTurnLogger.create(vault, "2026-05-20");
    const id2 = day2.nextTurnId();
    expect(id2).toBe("turn-001");
    const { ctx: ctx2 } = makeCtx({
      turnLogger: day2,
      turnId: id2,
      startedAtMs: Date.parse("2026-05-20T00:00:30Z"),
      messages: [{ role: "user", content: "after midnight" }],
    });
    await writeTurnArtifact(ctx2, { outcome: "aborted" });

    const raw1 = JSON.parse(
      await readFile(
        path.join(sessionDir(vault, "2026-05-19"), "turn-001.json"),
        "utf8",
      ),
    );
    const raw2 = JSON.parse(
      await readFile(
        path.join(sessionDir(vault, "2026-05-20"), "turn-001.json"),
        "utf8",
      ),
    );
    expect(raw1.initialRequest.messages[0].content).toBe("before midnight");
    expect(raw2.initialRequest.messages[0].content).toBe("after midnight");
    // Day-1 directory holds only the day-1 artifact — no contamination.
    expect(await readdir(sessionDir(vault, "2026-05-19"))).toEqual([
      "turn-001.json",
    ]);
  });

  it("T4.2-AC-06: stream_error path writes outcome:'stream_error' with populated error fields", async () => {
    const vault = await makeVault();
    const turnLogger = await FsTurnLogger.create(vault, "2026-05-19");
    const { ctx } = makeCtx({
      turnLogger,
      turnId: turnLogger.nextTurnId(),
      startedAtMs: 1_000,
      messages: [{ role: "user", content: "trigger error" }],
    });

    const err = Object.assign(new Error("upstream 500"), {
      name: "APICallError",
    });
    await writeTurnArtifact(ctx, { outcome: "stream_error", err });

    const raw = JSON.parse(
      await readFile(
        path.join(sessionDir(vault, "2026-05-19"), "turn-001.json"),
        "utf8",
      ),
    );
    expect(raw.outcome).toBe("stream_error");
    expect(raw.error).toEqual({ name: "APICallError", message: "upstream 500" });
    // Happy-path fields must not appear on the error artifact.
    expect(raw.steps).toBeUndefined();
    expect(raw.totalUsage).toBeUndefined();
    expect(raw.responseMessages).toBeUndefined();
  });

  it("T4.2-AC-07: abort path writes outcome:'aborted' and no steps/totalUsage/responseMessages/error", async () => {
    const vault = await makeVault();
    const turnLogger = await FsTurnLogger.create(vault, "2026-05-19");
    const { ctx } = makeCtx({
      turnLogger,
      turnId: turnLogger.nextTurnId(),
      startedAtMs: 1_000,
      messages: [{ role: "user", content: "Ctrl+C mid-stream" }],
    });

    await writeTurnArtifact(ctx, { outcome: "aborted" });

    const raw = JSON.parse(
      await readFile(
        path.join(sessionDir(vault, "2026-05-19"), "turn-001.json"),
        "utf8",
      ),
    );
    expect(raw.outcome).toBe("aborted");
    expect(raw.error).toBeUndefined();
    expect(raw.steps).toBeUndefined();
    expect(raw.totalUsage).toBeUndefined();
    expect(raw.responseMessages).toBeUndefined();
  });

  it("T4.2-AC-09: pruning visibility — after 6 same-file read_file turns, turn-006.json's initialRequest.messages contains the pruner stub", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const session = await store.loadOrCreate("2026-05-19");
    const turnLogger = await FsTurnLogger.create(vault, "2026-05-19");

    // K = 5 in the request-builder. We rely on the age cap (not drift) to
    // do the pruning, so `fileVersionAt` returns 0 (older than every stamp).
    const messageStamps = new Map<ModelMessage, number>();
    const fileVersionAt = (): number => 0;
    const messageCreatedAt = (m: ModelMessage): number =>
      messageStamps.get(m) ?? Date.now();

    for (let i = 1; i <= 6; i++) {
      const userMsg: ModelMessage = {
        role: "user",
        content: `turn ${i}: re-read inbox`,
      };
      const turnStartedAt = 1_000_000 + i * 1_000;
      messageStamps.set(userMsg, turnStartedAt);
      session.appendTurn([userMsg], turnStartedAt);
      await store.save(session);

      const turnId = turnLogger.nextTurnId();
      const { system, messages: requestMessages } = buildRequest({
        today: new Date("2026-05-19T10:00:00Z"),
        messages: session.messages,
        fileVersionAt,
        messageCreatedAt,
      });

      const callId = `call-${i}`;
      const model = new MockLanguageModelV4({
        doStream: async () =>
          streamResult(
            readFileStreamChunks({ callId, filePath: "tasks/inbox.md" }),
          ),
      });
      const result = streamText({
        model,
        system,
        messages: requestMessages,
        stopWhen: isStepCount(1),
      });
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error;
      }
      const response = await result.response;

      // The mock emits only the tool-call. Synthesize a tool-result so the
      // next turn's pruner has something to act on.
      const synthesizedToolResult: ToolModelMessage = {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: callId,
            toolName: "read_file",
            output: { type: "text", value: `contents v${i}` },
          } satisfies ToolResultPart,
        ],
      };
      const phase2Messages: ModelMessage[] = [
        ...response.messages,
        synthesizedToolResult,
      ];
      for (const m of phase2Messages) messageStamps.set(m, turnStartedAt);
      session.appendTurn(phase2Messages, turnStartedAt);
      await store.save(session);

      const { ctx } = makeCtx({
        turnLogger,
        turnId,
        startedAtMs: turnStartedAt,
        system,
        messages: requestMessages,
      });
      await writeTurnArtifact(ctx, {
        outcome: "ok",
        steps: await result.steps,
        totalUsage: await result.totalUsage,
        responseMessages: response.messages,
      });
    }

    const raw = JSON.parse(
      await readFile(
        path.join(sessionDir(vault, "2026-05-19"), "turn-006.json"),
        "utf8",
      ),
    );
    const stubRegex = /^\[Previous .* result — superseded/;
    const found = (raw.initialRequest.messages as ModelMessage[]).some((m) => {
      if (m.role !== "tool") return false;
      const parts = m.content as ToolResultPart[];
      return parts.some(
        (p) =>
          p.type === "tool-result" &&
          typeof p.output === "object" &&
          p.output !== null &&
          "value" in p.output &&
          typeof (p.output as { value: unknown }).value === "string" &&
          stubRegex.test((p.output as { value: string }).value),
      );
    });
    expect(found).toBe(true);
  });

  it("T4.2-AC-10: mocked usage.inputTokenDetails.cacheReadTokens is reachable in the on-disk artifact", async () => {
    const vault = await makeVault();
    const turnLogger = await FsTurnLogger.create(vault, "2026-05-19");
    const { ctx } = makeCtx({
      turnLogger,
      turnId: turnLogger.nextTurnId(),
      startedAtMs: 1_000,
    });

    const fakeUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      inputTokenDetails: {
        cacheReadTokens: 80,
        cacheWriteTokens: 20,
        noCacheTokens: 0,
      },
    };
    await writeTurnArtifact(ctx, {
      outcome: "ok",
      steps: [],
      totalUsage: fakeUsage,
      responseMessages: [],
    });

    const raw = JSON.parse(
      await readFile(
        path.join(sessionDir(vault, "2026-05-19"), "turn-001.json"),
        "utf8",
      ),
    );
    expect(raw.totalUsage.inputTokenDetails.cacheReadTokens).toBe(80);
  });

  it("T4.2-AC-11: rename rejecting with EACCES → cliLogger.warn captures turn_log.write_failed and the helper does not throw", async () => {
    const vault = await makeVault();
    const failingFs: FsTurnLoggerOps = {
      mkdir: nodeFs.mkdir,
      readdir: nodeFs.readdir,
      writeFile: nodeFs.writeFile,
      rename: async () => {
        throw Object.assign(new Error("permission denied"), {
          code: "EACCES",
        });
      },
    };
    const turnLogger = await FsTurnLogger.create(
      vault,
      "2026-05-19",
      failingFs,
    );
    const turnId = turnLogger.nextTurnId();
    const { ctx, logger } = makeCtx({
      turnLogger,
      turnId,
      startedAtMs: 1_000,
    });

    await expect(
      writeTurnArtifact(ctx, { outcome: "aborted" }),
    ).resolves.toBeUndefined();

    expect(logger.events).toHaveLength(1);
    expect(logger.events[0]?.level).toBe("warn");
    expect(logger.events[0]?.code).toBe("turn_log.write_failed");
    expect(logger.events[0]?.meta).toMatchObject({ turnId });
  });

  it("T4.2-AC-12: MemoryTurnLogger substitution exposes records in call order, each matching the TurnLogRecord shape", async () => {
    const memTurnLogger = new MemoryTurnLogger();
    for (let i = 1; i <= 3; i++) {
      const turnId = `turn-${String(i).padStart(3, "0")}`;
      const { ctx } = makeCtx({
        turnLogger: memTurnLogger,
        turnId,
        startedAtMs: 1_000 * i,
        messages: [{ role: "user", content: `turn ${i}` }],
      });
      await writeTurnArtifact(ctx, { outcome: "aborted" });
    }

    expect(memTurnLogger.records.map((r) => r.turnId)).toEqual([
      "turn-001",
      "turn-002",
      "turn-003",
    ]);
    for (const r of memTurnLogger.records) {
      expect(typeof r.turnId).toBe("string");
      expect(r.model).toBe(MODEL_ID);
      expect(["ok", "stream_error", "aborted"]).toContain(r.outcome);
      expect(typeof r.initialRequest.system).toBe("string");
      expect(Array.isArray(r.initialRequest.messages)).toBe(true);
    }
  });
});
