import { describe, expect, it } from "vitest";
import type {
  AssistantModelMessage,
  ModelMessage,
  ToolCallPart,
  ToolModelMessage,
  ToolResultPart,
} from "ai";

import { pruneToolResults } from "../tool-result-pruning.js";

const STUB_PREFIX = "[Previous ";
const STUB_SUFFIX = " result — superseded by current state; re-read if needed]";

function readFileCall(toolCallId: string, filePath: string): AssistantModelMessage {
  const part: ToolCallPart = {
    type: "tool-call",
    toolCallId,
    toolName: "read_file",
    input: { file_path: filePath },
  };
  return { role: "assistant", content: [part] };
}

function listFilesCall(toolCallId: string, scope: string): AssistantModelMessage {
  const part: ToolCallPart = {
    type: "tool-call",
    toolCallId,
    toolName: "list_files",
    input: { scope },
  };
  return { role: "assistant", content: [part] };
}

function toolResult(
  toolCallId: string,
  toolName: string,
  text: string,
): ToolModelMessage {
  const part: ToolResultPart = {
    type: "tool-result",
    toolCallId,
    toolName,
    output: { type: "text", value: text },
  };
  return { role: "tool", content: [part] };
}

function toolErrorResult(
  toolCallId: string,
  toolName: string,
  errorText: string,
): ToolModelMessage {
  const part: ToolResultPart = {
    type: "tool-result",
    toolCallId,
    toolName,
    output: { type: "error-text", value: errorText },
  };
  return { role: "tool", content: [part] };
}

function isStubbed(msg: ModelMessage): boolean {
  if (msg.role !== "tool") return false;
  return msg.content.some(
    (p) =>
      p.type === "tool-result" &&
      p.output.type === "text" &&
      p.output.value.startsWith(STUB_PREFIX) &&
      p.output.value.endsWith(STUB_SUFFIX),
  );
}

describe("pruneToolResults", () => {
  it("T4.1-AC-01: stubs the oldest 5 of 10 tool messages when no drift, leaves the newest 5 verbatim", () => {
    const messages: ModelMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(readFileCall(`call-${i}`, `inbox-${i}.md`));
      messages.push(toolResult(`call-${i}`, "read_file", `content of inbox-${i}`));
    }

    const result = pruneToolResults(messages, {
      k: 5,
      fileVersionAt: () => 100, // stable version, never drifts
      messageCreatedAt: () => 500, // newer than fileVersion → no drift
    });

    const toolMessages = result.filter((m) => m.role === "tool");
    expect(toolMessages).toHaveLength(10);
    // Oldest 5 stubbed.
    for (let i = 0; i < 5; i++) {
      expect(isStubbed(toolMessages[i]!)).toBe(true);
    }
    // Newest 5 verbatim.
    for (let i = 5; i < 10; i++) {
      const msg = toolMessages[i] as ToolModelMessage;
      const part = msg.content[0] as ToolResultPart;
      expect(part.output).toEqual({
        type: "text",
        value: `content of inbox-${i}`,
      });
    }
  });

  it("T4.1-AC-02: leaves user and assistant-with-tool-call messages untouched", () => {
    const userMsg: ModelMessage = { role: "user", content: "what's in inbox?" };
    const assistantCall = readFileCall("call-1", "inbox.md");
    const tr = toolResult("call-1", "read_file", "task A\ntask B");
    const messages: ModelMessage[] = [userMsg, assistantCall, tr];

    const result = pruneToolResults(messages, {
      k: 5,
      fileVersionAt: () => undefined,
      messageCreatedAt: () => 500,
    });

    expect(result[0]).toBe(userMsg);
    expect(result[1]).toBe(assistantCall);
    // tool-result unchanged when within K and no drift.
    expect(result[2]).toBe(tr);
  });

  it("T4.1-AC-03: leaves an assistant message with mixed text + tool-call parts unchanged", () => {
    const assistantMixed: AssistantModelMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check the inbox." },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "read_file",
          input: { file_path: "inbox.md" },
        },
      ],
    };
    const messages: ModelMessage[] = [assistantMixed];

    const result = pruneToolResults(messages, {
      k: 5,
      fileVersionAt: () => 9999,
      messageCreatedAt: () => 1,
    });

    expect(result[0]).toBe(assistantMixed);
  });

  it("T4.1-AC-04: preserves tool-error parts (output.type === 'error-text')", () => {
    const messages: ModelMessage[] = [
      readFileCall("call-1", "missing.md"),
      toolErrorResult("call-1", "read_file", "FileNotFoundError: missing.md"),
    ];

    const result = pruneToolResults(messages, {
      k: 1,
      fileVersionAt: () => 9999, // would drift if we considered it
      messageCreatedAt: () => 1,
    });

    const tr = result[1] as ToolModelMessage;
    const part = tr.content[0] as ToolResultPart;
    expect(part.output).toEqual({
      type: "error-text",
      value: "FileNotFoundError: missing.md",
    });
  });

  it("T4.1-AC-05: stubs a within-K tool-result when fileVersionAt > messageCreatedAt (drift overrides K-keep)", () => {
    const messages: ModelMessage[] = [
      readFileCall("call-1", "focus.md"),
      toolResult("call-1", "read_file", "focus content (stale)"),
    ];

    const result = pruneToolResults(messages, {
      k: 5,
      fileVersionAt: (p) => (p === "focus.md" ? 1000 : undefined),
      messageCreatedAt: () => 500, // older than fileVersion → drift
    });

    expect(isStubbed(result[1]!)).toBe(true);
  });

  it("T4.1-AC-06: per-file granularity — drift on focus.md stubs that result; inbox.md result stays", () => {
    const messages: ModelMessage[] = [
      readFileCall("call-inbox", "inbox.md"),
      toolResult("call-inbox", "read_file", "inbox content"),
      readFileCall("call-focus", "focus.md"),
      toolResult("call-focus", "read_file", "focus content"),
    ];

    const result = pruneToolResults(messages, {
      k: 5,
      fileVersionAt: (p) => (p === "focus.md" ? 1000 : 100),
      messageCreatedAt: () => 500, // < focus version (drift), > inbox version (no drift)
    });

    const inboxResult = result[1] as ToolModelMessage;
    const focusResult = result[3] as ToolModelMessage;

    expect((inboxResult.content[0] as ToolResultPart).output).toEqual({
      type: "text",
      value: "inbox content",
    });
    expect(isStubbed(focusResult)).toBe(true);
  });

  it("T4.1-AC-07: list_files / search_files results stay verbatim within K (no file_path to look up); stubbed only when outside K", () => {
    const messages: ModelMessage[] = [];
    // 6 list_files calls; with K=5, the oldest one should be stubbed by age,
    // the newest 5 should stay verbatim despite the empty fileVersionAt
    // lookup.
    for (let i = 0; i < 6; i++) {
      messages.push(listFilesCall(`call-${i}`, "active"));
      messages.push(toolResult(`call-${i}`, "list_files", `listing-${i}`));
    }

    const result = pruneToolResults(messages, {
      k: 5,
      fileVersionAt: () => 9999, // would be drift if we had a file_path
      messageCreatedAt: () => 1,
    });

    const toolMessages = result.filter((m) => m.role === "tool");
    expect(isStubbed(toolMessages[0]!)).toBe(true); // oldest aged out
    for (let i = 1; i < 6; i++) {
      const msg = toolMessages[i] as ToolModelMessage;
      const part = msg.content[0] as ToolResultPart;
      expect(part.output).toEqual({
        type: "text",
        value: `listing-${i}`,
      });
    }
  });

  it("returns the same array reference shape (does not mutate inputs)", () => {
    const tr = toolResult("call-1", "read_file", "original");
    const messages: ModelMessage[] = [readFileCall("call-1", "inbox.md"), tr];
    pruneToolResults(messages, {
      k: 0, // forces age-out
      fileVersionAt: () => undefined,
      messageCreatedAt: () => 0,
    });
    expect((tr.content[0] as ToolResultPart).output).toEqual({
      type: "text",
      value: "original",
    });
  });
});
