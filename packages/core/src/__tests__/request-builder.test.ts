import { describe, expect, it } from "vitest";
import type {
  AssistantModelMessage,
  ModelMessage,
  ToolCallPart,
  ToolModelMessage,
  ToolResultPart,
} from "ai";

import { buildRequest } from "../request-builder.js";

const TODAY = new Date("2026-04-24");
const NO_DRIFT = () => 0; // every file is "ancient" → no drift inside K-window.
const ALWAYS_NOW = () => Date.now();

describe("buildRequest", () => {
  // `result.system` is now a SystemModelMessage (not a raw string) — its
  // `content` field carries the prompt text. The cache marker on its
  // providerOptions is what triggers Anthropic prompt caching.
  it("returns a system prompt that carries the R-anchors plus the optional profile", () => {
    const result = buildRequest({
      today: TODAY,
      profile: "Prefers brevity. Works in Berlin time.",
      messages: [{ role: "user", content: "Hello" }],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });

    expect(result.system.role).toBe("system");
    const text = result.system.content as string;
    expect(text).toContain("[R1]");
    expect(text).toContain("[R13]");
    expect(text).toContain("## User profile");
    expect(text).toContain("Prefers brevity.");
  });

  it("omits the user-profile section when no profile is supplied", () => {
    const result = buildRequest({
      today: TODAY,
      messages: [{ role: "user", content: "Hi" }],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });
    expect(result.system.content as string).not.toContain("## User profile");
  });

  it("omits the user-profile section when the profile is whitespace-only", () => {
    const result = buildRequest({
      today: TODAY,
      profile: "   \n  ",
      messages: [{ role: "user", content: "Hi" }],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });
    expect(result.system.content as string).not.toContain("## User profile");
  });

  it("preserves the message history verbatim and never injects a role:system into messages", () => {
    // The AI SDK rejects role:"system" entries inside `messages`
    // ("System messages are not allowed in the prompt or messages
    // fields. Use the system option instead."). The system block goes on
    // the separate `system` field of BuildRequestResult.
    const messages: ModelMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "second" },
    ];
    const result = buildRequest({
      today: TODAY,
      messages,
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toEqual({ role: "user", content: "first" });
    expect(result.messages[1]).toEqual({ role: "assistant", content: "ok" });
    // Trailing user message keeps its content; cache marker is added on
    // providerOptions only.
    const last = result.messages[2]!;
    expect(last.role).toBe("user");
    expect((last as { content: string }).content).toBe("second");
    // And there must never be a role:"system" entry inside `messages`.
    expect(result.messages.every((m) => m.role !== "system")).toBe(true);
  });

  it("does not inject any vault content into `messages` (no active-state pre-load)", () => {
    const result = buildRequest({
      today: TODAY,
      messages: [{ role: "user", content: "ping" }],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });
    // No tool-result messages — no vault content was pre-loaded.
    expect(result.messages.some((m) => m.role === "tool")).toBe(false);
    // No role:"system" inside `messages` (would be rejected by streamText).
    expect(result.messages.some((m) => m.role === "system")).toBe(false);
  });

  it("Fix B: system message (returned via the `system` field) carries an Anthropic cache marker", () => {
    const result = buildRequest({
      today: TODAY,
      messages: [{ role: "user", content: "ping" }],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });
    expect(result.system.role).toBe("system");
    expect(result.system.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
    expect(typeof result.system.content).toBe("string");
  });

  it("Fix B: trailing user message carries an Anthropic cache marker", () => {
    const result = buildRequest({
      today: TODAY,
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "second" },
      ],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });
    const last = result.messages.at(-1)!;
    expect(last.role).toBe("user");
    expect(last.providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
    // Earlier user message (not trailing) must NOT carry the marker — only
    // the request anchor does, by design.
    const firstUser = result.messages[0]!;
    expect(firstUser.role).toBe("user");
    expect(firstUser.providerOptions).toBeUndefined();
  });

  it("invokes pruneToolResults with k=10: 11 tool messages → the oldest one is stubbed, the newest 10 stay verbatim", () => {
    // Structural pin on the seam wiring: if K were changed or pruning were
    // bypassed, this assertion catches it. The drift channel is silenced
    // (fileVersionAt → undefined) so only the K-rule fires. K was raised
    // from 5 to 10 after the 2026-05-20 cache diagnosis (see request-
    // builder.ts PRUNE_K comment) — keeping the test "1 oldest stub, rest
    // verbatim" preserves the original intent against the new K.
    const messages: ModelMessage[] = [];
    for (let i = 0; i < 11; i++) {
      const callId = `call-${i}`;
      const callPart: ToolCallPart = {
        type: "tool-call",
        toolCallId: callId,
        toolName: "read_file",
        input: { file_path: `f-${i}.md` },
      };
      const assistant: AssistantModelMessage = {
        role: "assistant",
        content: [callPart],
      };
      const resultPart: ToolResultPart = {
        type: "tool-result",
        toolCallId: callId,
        toolName: "read_file",
        output: { type: "text", value: `content-${i}` },
      };
      const tool: ToolModelMessage = {
        role: "tool",
        content: [resultPart],
      };
      messages.push(assistant, tool);
    }
    messages.push({ role: "user", content: "ping" });

    const result = buildRequest({
      today: TODAY,
      messages,
      fileVersionAt: () => undefined,
      messageCreatedAt: () => Date.now(),
    });

    const toolMessages = result.messages.filter(
      (m): m is ToolModelMessage => m.role === "tool",
    );
    expect(toolMessages).toHaveLength(11);
    // Oldest is age-stubbed.
    expect(
      (toolMessages[0]!.content[0] as ToolResultPart).output,
    ).toEqual({
      type: "text",
      value:
        "[Previous read_file result — superseded by current state; re-call if needed]",
    });
    // Newest 10 are verbatim.
    for (let i = 1; i < 11; i++) {
      expect((toolMessages[i]!.content[0] as ToolResultPart).output).toEqual({
        type: "text",
        value: `content-${i}`,
      });
    }
  });

  it("T4.2-AC-09: appends a <context-note> to the trailing user message when pruner reports stale files", () => {
    // focus.md was read at t=100; mtime says it changed at t=500 → drift in K.
    // The builder must surface this as a context-note glued onto the user's
    // current question so the LLM sees the reminder in its recency window.
    const callPart: ToolCallPart = {
      type: "tool-call",
      toolCallId: "c1",
      toolName: "read_file",
      input: { file_path: "tasks/focus.md" },
    };
    const assistant: AssistantModelMessage = {
      role: "assistant",
      content: [callPart],
    };
    const resultPart: ToolResultPart = {
      type: "tool-result",
      toolCallId: "c1",
      toolName: "read_file",
      output: { type: "text", value: "focus (stale)" },
    };
    const tool: ToolModelMessage = { role: "tool", content: [resultPart] };
    const userMsg: ModelMessage = {
      role: "user",
      content: "Was steht im Fokus?",
    };

    const result = buildRequest({
      today: TODAY,
      messages: [assistant, tool, userMsg],
      fileVersionAt: (p) => (p === "tasks/focus.md" ? 500 : undefined),
      messageCreatedAt: () => 100, // older than fileVersion → drift
    });

    const last = result.messages.at(-1)!;
    expect(last.role).toBe("user");
    expect(typeof last.content).toBe("string");
    const content = last.content as string;
    expect(content).toContain("Was steht im Fokus?");
    expect(content).toContain("<context-note>");
    expect(content).toContain("- tasks/focus.md");
    expect(content).toContain("Do not paraphrase your own earlier summaries");
    expect(content).toContain("</context-note>");
  });

  it("T4.2-AC-10: does NOT attach a <context-note> when no drift in the K-window", () => {
    // Same shape as AC-09 but no drift — file mtime older than read.
    const callPart: ToolCallPart = {
      type: "tool-call",
      toolCallId: "c1",
      toolName: "read_file",
      input: { file_path: "tasks/focus.md" },
    };
    const assistant: AssistantModelMessage = {
      role: "assistant",
      content: [callPart],
    };
    const resultPart: ToolResultPart = {
      type: "tool-result",
      toolCallId: "c1",
      toolName: "read_file",
      output: { type: "text", value: "focus" },
    };
    const tool: ToolModelMessage = { role: "tool", content: [resultPart] };
    const userMsg: ModelMessage = {
      role: "user",
      content: "Was steht im Fokus?",
    };

    const result = buildRequest({
      today: TODAY,
      messages: [assistant, tool, userMsg],
      fileVersionAt: () => 50, // older than read → no drift
      messageCreatedAt: () => 100,
    });

    const last = result.messages.at(-1)!;
    const content = last.content as string;
    expect(content).toBe("Was steht im Fokus?");
    expect(content).not.toContain("<context-note>");
  });

  it("T4.2-AC-11: age-stubbed tool-results do NOT trigger a <context-note>", () => {
    // 6 reads with K=5 → oldest is age-stubbed; fileVersionAt = undefined so
    // no drift can be detected. Age stubs are not surfaced as notes.
    const messages: ModelMessage[] = [];
    for (let i = 0; i < 6; i++) {
      const callId = `call-${i}`;
      messages.push(
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: callId,
              toolName: "read_file",
              input: { file_path: `f-${i}.md` },
            },
          ],
        } satisfies AssistantModelMessage,
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: callId,
              toolName: "read_file",
              output: { type: "text", value: `content-${i}` },
            },
          ],
        } satisfies ToolModelMessage,
      );
    }
    messages.push({ role: "user", content: "what now?" });

    const result = buildRequest({
      today: TODAY,
      messages,
      fileVersionAt: () => undefined,
      messageCreatedAt: () => Date.now(),
    });

    const last = result.messages.at(-1)!;
    expect((last.content as string)).toBe("what now?");
  });

  it("T4.2-AC-12: does not mutate the caller's messages array when injecting a note", () => {
    const callPart: ToolCallPart = {
      type: "tool-call",
      toolCallId: "c1",
      toolName: "read_file",
      input: { file_path: "tasks/focus.md" },
    };
    const userMsg: ModelMessage = {
      role: "user",
      content: "Was steht im Fokus?",
    };
    const messages: ModelMessage[] = [
      { role: "assistant", content: [callPart] },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "read_file",
            output: { type: "text", value: "focus (stale)" },
          },
        ],
      },
      userMsg,
    ];

    buildRequest({
      today: TODAY,
      messages,
      fileVersionAt: () => 500,
      messageCreatedAt: () => 100,
    });

    // The session-owned user message is unchanged.
    expect(userMsg.content).toBe("Was steht im Fokus?");
  });
});
