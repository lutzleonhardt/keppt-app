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
  it("returns a system prompt that carries the R-anchors plus the optional profile", () => {
    const result = buildRequest({
      today: TODAY,
      profile: "Prefers brevity. Works in Berlin time.",
      messages: [{ role: "user", content: "Hello" }],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });

    expect(result.system).toContain("[R1]");
    expect(result.system).toContain("[R13]");
    expect(result.system).toContain("## User profile");
    expect(result.system).toContain("Prefers brevity.");
  });

  it("omits the user-profile section when no profile is supplied", () => {
    const result = buildRequest({
      today: TODAY,
      messages: [{ role: "user", content: "Hi" }],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });
    expect(result.system).not.toContain("## User profile");
  });

  it("omits the user-profile section when the profile is whitespace-only", () => {
    const result = buildRequest({
      today: TODAY,
      profile: "   \n  ",
      messages: [{ role: "user", content: "Hi" }],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });
    expect(result.system).not.toContain("## User profile");
  });

  it("does not append anything: messages flow through (after pruning) untouched in length", () => {
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
    expect(result.messages[2]).toEqual({ role: "user", content: "second" });
  });

  it("does not inject any vault content into `system` or `messages` (no active-state pre-load)", () => {
    const result = buildRequest({
      today: TODAY,
      messages: [{ role: "user", content: "ping" }],
      fileVersionAt: NO_DRIFT,
      messageCreatedAt: ALWAYS_NOW,
    });
    expect(result.messages.every((m) => m.role !== "system")).toBe(true);
  });

  it("invokes pruneToolResults with k=5: 6 tool messages → the oldest one is stubbed, the newest 5 stay verbatim", () => {
    // Structural pin on the seam wiring: if K were changed or pruning were
    // bypassed, this assertion catches it. The drift channel is silenced
    // (fileVersionAt → undefined) so only the K-rule fires.
    const messages: ModelMessage[] = [];
    for (let i = 0; i < 6; i++) {
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
    expect(toolMessages).toHaveLength(6);
    // Oldest is stubbed.
    expect(
      (toolMessages[0]!.content[0] as ToolResultPart).output,
    ).toEqual({
      type: "text",
      value:
        "[Previous read_file result — superseded by current state; re-read if needed]",
    });
    // Newest 5 are verbatim.
    for (let i = 1; i < 6; i++) {
      expect((toolMessages[i]!.content[0] as ToolResultPart).output).toEqual({
        type: "text",
        value: `content-${i}`,
      });
    }
  });
});
