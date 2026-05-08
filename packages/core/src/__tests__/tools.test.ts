import type {
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { isStepCount, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { InMemoryFileRepository } from "../in-memory-file-repository.js";
import { buildTools } from "../tools.js";

const FIXED_NOW = new Date("2026-05-08T10:00:00Z");

const ZERO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
} as const;

function streamResult(
  chunks: LanguageModelV4StreamPart[],
): LanguageModelV4StreamResult {
  return { stream: simulateReadableStream({ chunks }) };
}

function toolCallChunks(
  toolName: string,
  toolCallId: string,
  input: unknown,
): LanguageModelV4StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-call",
      toolCallId,
      toolName,
      input: JSON.stringify(input),
    },
    {
      type: "finish",
      usage: ZERO_USAGE,
      finishReason: { unified: "tool-calls", raw: undefined },
    },
  ];
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

function sequencedMockModel(
  results: LanguageModelV4StreamResult[],
): MockLanguageModelV4 {
  let callIndex = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const next = results[callIndex];
      if (!next) {
        throw new Error(
          `MockLanguageModelV4: doStream called ${callIndex + 1} times but only ${
            results.length
          } scripted result(s) provided`,
        );
      }
      callIndex += 1;
      return next;
    },
  });
}

describe("buildTools — integration with MockLanguageModelV4", () => {
  it("drives a list_files → read_file → text chain in the right order", async () => {
    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    await repo.write("tasks/inbox.md", "- [ ] buy milk\n", "seed");
    await repo.write("tasks/focus.md", "- [ ] ship task 3\n", "seed");

    const model = sequencedMockModel([
      streamResult(toolCallChunks("list_files", "call-1", { prefix: "tasks/" })),
      streamResult(
        toolCallChunks("read_file", "call-2", { file_path: "tasks/inbox.md" }),
      ),
      streamResult(textChunks("Your inbox has 1 task: buy milk.")),
    ]);

    const result = streamText({
      model,
      tools: buildTools(repo),
      stopWhen: isStepCount(5),
      messages: [{ role: "user", content: "List my tasks" }],
    });

    const observedToolCalls: Array<{ name: string; input: unknown }> = [];
    let finalText = "";
    for await (const part of result.fullStream) {
      if (part.type === "tool-call") {
        observedToolCalls.push({ name: part.toolName, input: part.input });
      } else if (part.type === "text-delta") {
        finalText += part.text;
      } else if (part.type === "error") {
        throw part.error;
      }
    }

    expect(observedToolCalls.map((c) => c.name)).toEqual([
      "list_files",
      "read_file",
    ]);
    expect(observedToolCalls[0]?.input).toEqual({ prefix: "tasks/" });
    expect(observedToolCalls[1]?.input).toEqual({ file_path: "tasks/inbox.md" });
    expect(finalText).toBe("Your inbox has 1 task: buy milk.");
  });

  it("retries edit_file with extended search after an ambiguity error", async () => {
    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    await repo.write(
      "tasks/inbox.md",
      "- [ ] buy milk\n- [ ] buy milk\n",
      "seed",
    );

    const ambiguousEdit = {
      file_path: "tasks/inbox.md",
      edits: [{ search: "- [ ] buy milk\n", replace: "- [x] buy milk\n" }],
      change_summary: "check off first buy milk",
    };
    const fixedEdit = {
      file_path: "tasks/inbox.md",
      edits: [
        {
          search: "- [ ] buy milk\n- [ ] buy milk\n",
          replace: "- [x] buy milk\n- [ ] buy milk\n",
        },
      ],
      change_summary: "check off first buy milk (extended context)",
    };

    const model = sequencedMockModel([
      streamResult(toolCallChunks("edit_file", "call-1", ambiguousEdit)),
      streamResult(toolCallChunks("edit_file", "call-2", fixedEdit)),
      streamResult(textChunks("Done — first 'buy milk' is checked off.")),
    ]);

    const result = streamText({
      model,
      tools: buildTools(repo),
      stopWhen: isStepCount(5),
      messages: [{ role: "user", content: "Check off the first buy milk" }],
    });

    const editCalls: Array<unknown> = [];
    const toolResults: Array<{ name: string; output: unknown }> = [];
    let finalText = "";
    for await (const part of result.fullStream) {
      if (part.type === "tool-call" && part.toolName === "edit_file") {
        editCalls.push(part.input);
      } else if (part.type === "tool-result") {
        toolResults.push({ name: part.toolName, output: part.output });
      } else if (part.type === "text-delta") {
        finalText += part.text;
      } else if (part.type === "error") {
        throw part.error;
      }
    }

    expect(editCalls).toHaveLength(2);
    expect(toolResults).toHaveLength(2);
    const firstResult = toolResults[0]?.output as {
      ok: boolean;
      error?: { matchCount: number };
    };
    expect(firstResult.ok).toBe(false);
    expect(firstResult.error?.matchCount).toBe(2);
    const secondResult = toolResults[1]?.output as { ok: boolean };
    expect(secondResult.ok).toBe(true);
    expect(finalText).toBe("Done — first 'buy milk' is checked off.");
    expect(await repo.read("tasks/inbox.md")).toBe(
      "- [x] buy milk\n- [ ] buy milk\n",
    );
  });
});
