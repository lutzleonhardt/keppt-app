import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { isStepCount, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AssistantModelMessage,
  ModelMessage,
  ToolCallPart,
  ToolModelMessage,
  ToolResultPart,
} from "ai";

import {
  buildRequest,
  Session,
  type SessionStore,
} from "@gtd/core";
import { FsSessionStore } from "../src/fs-session-store.js";

// Mirrors the two-phase save contract the CLI implements in
// apps/cli/src/index.ts:
//
//   Phase 1 — before stream: snapshot + appendTurn([user]) + store.save
//             (restore on failure → skip turn)
//   Phase 2 — after `await result.response` succeeds: snapshot +
//             appendTurn(response.messages) + store.save
//             (restore on failure → log but do not replay)
//
// Plus the per-turn day-rollover guard and the on-success/on-abort
// invariants documented in the Task 4.1 plan.

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

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tempDirs.map((d) => rm(d, { recursive: true, force: true })),
  );
  tempDirs.length = 0;
});

async function makeVault(): Promise<string> {
  const d = await mkdtemp(path.join(tmpdir(), "gtd-cli-twophase-"));
  tempDirs.push(d);
  return d;
}

describe("two-phase save", () => {
  it("T4.1-AC-12: happy path — successful turn ends with user + response messages on disk, parallel createdAt arrays", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const session = await store.loadOrCreate("2026-05-19");

    // Phase 1
    const restoreP1 = session.snapshot();
    session.appendTurn([{ role: "user", content: "hello" }], 1_000);
    await store.save(session);
    void restoreP1;

    const model = new MockLanguageModelV4({
      doStream: async () => streamResult(textChunks("hi there")),
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

    // Phase 2
    const restoreP2 = session.snapshot();
    session.appendTurn(response.messages, 2_000);
    await store.save(session);
    void restoreP2;

    const reloaded = await store.loadOrCreate("2026-05-19");
    expect(reloaded.messages).toHaveLength(1 + response.messages.length);
    expect(reloaded.messages[0]).toEqual({ role: "user", content: "hello" });
    expect(reloaded.messages.at(-1)?.role).toBe("assistant");
    expect(reloaded.createdAtOf(reloaded.messages[0]!)).toBe(1_000);
    for (let i = 1; i < reloaded.messages.length; i++) {
      expect(reloaded.createdAtOf(reloaded.messages[i]!)).toBe(2_000);
    }
  });

  it("T4.1-AC-11: stream-abort safety — aborted turn ends with user message on disk and no assistant/tool messages from that turn", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const session = await store.loadOrCreate("2026-05-19");

    // Phase 1
    session.appendTurn(
      [{ role: "user", content: "this will be cut" }],
      1_000,
    );
    await store.save(session);

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

    let observedAbort = false;
    try {
      const result = streamText({
        model,
        messages: [...session.messages],
        stopWhen: isStepCount(1),
        abortSignal: controller.signal,
        onError: () => {},
      });
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error;
      }
      // Phase 2 — should never run on abort.
      const response = await result.response;
      session.appendTurn(response.messages, 2_000);
      await store.save(session);
    } catch {
      observedAbort = controller.signal.aborted;
    }

    expect(observedAbort).toBe(true);
    const reloaded = await store.loadOrCreate("2026-05-19");
    expect(reloaded.messages).toEqual([
      { role: "user", content: "this will be cut" },
    ]);
    // Structural indicator: last message is the unanswered user turn.
    expect(reloaded.messages.at(-1)?.role).toBe("user");
  });

  it("T4.1-AC-13: Phase-2 save failure — restore() rolls in-memory session back to its pre-Phase-2 state", async () => {
    // Models the CLI's `restorePhase2()` path: stream succeeded, but
    // `store.save` rejects. The in-memory append must be reverted so the
    // next turn does not build a prompt from response messages that never
    // reached disk.
    const vault = await makeVault();
    const realStore = new FsSessionStore(vault);
    const session = await realStore.loadOrCreate("2026-05-19");

    // Pre-existing on-disk state from prior turns.
    session.appendTurn([{ role: "user", content: "earlier user" }], 500);
    session.appendTurn(
      [{ role: "assistant", content: "earlier assistant" }],
      600,
    );
    await realStore.save(session);

    // Phase 1 of the new turn (succeeds).
    session.appendTurn([{ role: "user", content: "new question" }], 1_000);
    await realStore.save(session);
    expect(session.messages).toHaveLength(3);

    // Phase 2 with a failing store. The CLI wraps appendTurn + save in
    // snapshot/restore — emulate that here.
    const failingStore: SessionStore = {
      loadOrCreate: realStore.loadOrCreate.bind(realStore),
      save: async () => {
        throw new Error("simulated Phase-2 save failure");
      },
    };

    const restoreP2 = session.snapshot();
    session.appendTurn(
      [{ role: "assistant", content: "response that won't persist" }],
      2_000,
    );
    expect(session.messages).toHaveLength(4);

    await expect(failingStore.save(session)).rejects.toThrow(/Phase-2/);
    restoreP2();

    // In-memory: rolled back to pre-Phase-2 state.
    expect(session.messages).toHaveLength(3);
    expect(session.messages.at(-1)).toEqual({
      role: "user",
      content: "new question",
    });
    expect(session.createdAtOf(session.messages.at(-1)!)).toBe(1_000);
    // The orphaned assistant message is gone from createdAt lookups too.
    expect(
      session.createdAtOf({
        role: "assistant",
        content: "response that won't persist",
      } as never),
    ).toBeUndefined();

    // On-disk: the durable conversation log matches in-memory state — three
    // messages, no orphan assistant turn from the failed Phase 2.
    const reloaded = await realStore.loadOrCreate("2026-05-19");
    expect(reloaded.messages).toHaveLength(3);
    expect(reloaded.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });

  it("T4.1-AC-16: same-turn read-then-edit — next turn's pruner stubs the stale read because Phase 2 stamps with turnStartedAt", async () => {
    // Codex finding (high) folded into Task 4.1: stamping Phase-2 response
    // messages with `Date.now()` instead of `turnStartedAt` would make the
    // drift check silently fail for the most common flow (read a file,
    // then edit it). With the fix, the read's createdAt is strictly less
    // than any file mtime produced during the turn, so the next-turn
    // pruner correctly classifies the read as stale and stubs it.
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const session = await store.loadOrCreate("2026-05-19");

    // Create a real file on disk so its mtime is observable. Initial mtime
    // is forced into the past via `utimes` so we can pick a `turnStartedAt`
    // that bisects "before the turn" vs. "during the turn".
    const vaultFile = path.join(vault, "tasks", "inbox.md");
    await mkdir(path.dirname(vaultFile), { recursive: true });
    await writeFile(vaultFile, "initial content", "utf8");
    const baseMs = 1_700_000_000_000; // 2023-11-14 → safely in the past
    await utimes(vaultFile, new Date(baseMs), new Date(baseMs));

    const turnStartedAt = baseMs + 1_000; // 1s after initial mtime
    const fileMtimeDuringStream = turnStartedAt + 500; // edit happens mid-stream

    // Phase 1: user message stamped with turnStartedAt.
    session.appendTurn(
      [{ role: "user", content: "rename task X to Y" }],
      turnStartedAt,
    );

    // Phase 2: simulated response messages — assistant did a read_file then
    // an edit_file on the same file. Stamped with `turnStartedAt` (the
    // fix), NOT `Date.now()`.
    const readCallId = "call-read";
    const editCallId = "call-edit";
    const assistantWithReadCall: AssistantModelMessage = {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: readCallId,
          toolName: "read_file",
          input: { file_path: "tasks/inbox.md" },
        } satisfies ToolCallPart,
      ],
    };
    const toolReadResult: ToolModelMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: readCallId,
          toolName: "read_file",
          output: { type: "text", value: "initial content" },
        } satisfies ToolResultPart,
      ],
    };
    const assistantWithEditCall: AssistantModelMessage = {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: editCallId,
          toolName: "edit_file",
          input: { file_path: "tasks/inbox.md" },
        } satisfies ToolCallPart,
      ],
    };
    const toolEditResult: ToolModelMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: editCallId,
          toolName: "edit_file",
          output: { type: "text", value: "ok" },
        } satisfies ToolResultPart,
      ],
    };
    const responseMessages: ModelMessage[] = [
      assistantWithReadCall,
      toolReadResult,
      assistantWithEditCall,
      toolEditResult,
    ];
    session.appendTurn(responseMessages, turnStartedAt);

    // Simulate that the `edit_file` tool actually ran during the stream
    // and bumped the file's mtime.
    await utimes(
      vaultFile,
      new Date(fileMtimeDuringStream),
      new Date(fileMtimeDuringStream),
    );

    // Next-turn buildRequest with the CLI's closures. The mtime sentinel
    // is the one the production CLI uses (statSync mtimeMs); we read it
    // here to confirm the bisection holds.
    const { statSync } = await import("node:fs");
    const fileVersionAt = (p: string): number | undefined => {
      try {
        return statSync(path.join(vault, p)).mtimeMs;
      } catch {
        return undefined;
      }
    };
    expect(fileVersionAt("tasks/inbox.md")!).toBeGreaterThan(turnStartedAt);

    const messageCreatedAt = (msg: ModelMessage): number =>
      session.createdAtOf(msg) ?? Date.now();

    const { messages: prunedMessages } = buildRequest({
      today: new Date("2026-05-19T10:00:00Z"),
      messages: session.messages,
      fileVersionAt,
      messageCreatedAt,
    });

    // The read_file tool-result was within the K-window but its source
    // file's mtime is now newer than the stamp → drift fires → stubbed.
    const readToolMsg = prunedMessages.find(
      (m): m is ToolModelMessage =>
        m.role === "tool" &&
        Array.isArray(m.content) &&
        m.content[0]?.type === "tool-result" &&
        m.content[0].toolCallId === readCallId,
    );
    expect(readToolMsg).toBeDefined();
    const readPart = readToolMsg!.content[0] as ToolResultPart;
    expect(readPart.output).toEqual({
      type: "text",
      value:
        "[Previous read_file result for tasks/inbox.md — file has changed since. Call read_file before answering about its current state; do not paraphrase your own earlier summaries of this file in this conversation.]",
    });

    // Regression pin: had Phase 2 stamped with `Date.now()` (post-stream),
    // the read's createdAt would have been greater than the mtime and this
    // assertion would fail because the read result would still be verbatim.
    const editToolMsg = prunedMessages.find(
      (m): m is ToolModelMessage =>
        m.role === "tool" &&
        Array.isArray(m.content) &&
        m.content[0]?.type === "tool-result" &&
        m.content[0].toolCallId === editCallId,
    );
    expect(editToolMsg).toBeDefined();
    const editPart = editToolMsg!.content[0] as ToolResultPart;
    // The edit_file result also stamps with turnStartedAt < mtime, so it
    // gets stubbed too. That's the conservative-bound trade-off documented
    // in the code comment — same-turn results all share one timestamp.
    expect(editPart.output).toEqual({
      type: "text",
      value:
        "[Previous edit_file result for tasks/inbox.md — file has changed since. Call read_file before answering about its current state; do not paraphrase your own earlier summaries of this file in this conversation.]",
    });
  });

  it("T4.1-AC-14: day-rollover — two turns across UTC midnight land in separate per-day session files", async () => {
    // Models the CLI's `if (todayKey !== session.date) session = await
    // store.loadOrCreate(todayKey)` guard.
    const vault = await makeVault();
    const store = new FsSessionStore(vault);

    // Turn 1: late on 2026-05-19.
    let session = await store.loadOrCreate("2026-05-19");
    session.appendTurn([{ role: "user", content: "before midnight" }], 1_000);
    await store.save(session);

    // Turn 2: just after midnight UTC — day key changes; the CLI loads the
    // new day's session and appends there.
    const todayKey = "2026-05-20";
    if (todayKey !== session.date) {
      session = await store.loadOrCreate(todayKey);
    }
    session.appendTurn([{ role: "user", content: "after midnight" }], 2_000);
    await store.save(session);

    // Day 1 file retains only day-1 messages — no contamination.
    const day1 = JSON.parse(
      await readFile(store.sessionFilePath("2026-05-19"), "utf8"),
    );
    expect(day1.messages).toEqual([
      { role: "user", content: "before midnight" },
    ]);

    // Day 2 file exists and holds the post-midnight turn.
    const day2 = JSON.parse(
      await readFile(store.sessionFilePath("2026-05-20"), "utf8"),
    );
    expect(day2.messages).toEqual([
      { role: "user", content: "after midnight" },
    ]);
  });
});
