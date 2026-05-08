import type {
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { isStepCount, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import type { FileRepository, SearchResult, SearchScope } from "../file-repository.js";
import type { EditResult, SearchReplaceEdit } from "../edit.js";
import { InMemoryFileRepository } from "../in-memory-file-repository.js";
import { buildTools } from "../tools.js";

class TrapRepository implements FileRepository {
  reads: string[] = [];
  writes: string[] = [];
  edits: string[] = [];
  async read(filePath: string): Promise<string> {
    this.reads.push(filePath);
    throw new Error(`TrapRepository.read should not be called (${filePath})`);
  }
  async write(filePath: string, _content: string, _summary: string): Promise<void> {
    this.writes.push(filePath);
    throw new Error(`TrapRepository.write should not be called (${filePath})`);
  }
  async edit(
    filePath: string,
    _edits: readonly SearchReplaceEdit[],
    _summary: string,
  ): Promise<EditResult> {
    this.edits.push(filePath);
    throw new Error(`TrapRepository.edit should not be called (${filePath})`);
  }
  async list(_prefix?: string): Promise<string[]> {
    return [];
  }
  async search(_q: string, _s?: SearchScope): Promise<SearchResult[]> {
    return [];
  }
}

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

describe("buildTools — GTD layout gate", () => {
  async function runSingleToolCall(
    repo: FileRepository,
    toolName: string,
    input: Record<string, unknown>,
    now: () => Date = () => FIXED_NOW,
  ): Promise<unknown> {
    const model = sequencedMockModel([
      streamResult(toolCallChunks(toolName, "call-1", input)),
      streamResult(textChunks("done")),
    ]);
    const result = streamText({
      model,
      tools: buildTools(repo, { now }),
      stopWhen: isStepCount(3),
      messages: [{ role: "user", content: "go" }],
    });
    let output: unknown = undefined;
    for await (const part of result.fullStream) {
      if (part.type === "tool-result") output = part.output;
      else if (part.type === "error") throw part.error;
    }
    return output;
  }

  it("read_file returns out_of_scope and never calls repo.read", async () => {
    const trap = new TrapRepository();
    const output = await runSingleToolCall(trap, "read_file", {
      file_path: ".obsidian/workspace.json",
    });
    expect(output).toMatchObject({
      ok: false,
      error: { reason: "out_of_scope" },
    });
    expect(trap.reads).toEqual([]);
  });

  it("write_file returns out_of_scope and never calls repo.write", async () => {
    const trap = new TrapRepository();
    const output = await runSingleToolCall(trap, "write_file", {
      file_path: "archive/daily/2025-01-01.md",
      content: "x",
      change_summary: "should not happen",
    });
    expect(output).toMatchObject({
      ok: false,
      error: { reason: "out_of_scope" },
    });
    expect(trap.writes).toEqual([]);
  });

  it("edit_file returns out_of_scope and never calls repo.edit", async () => {
    const trap = new TrapRepository();
    const output = await runSingleToolCall(trap, "edit_file", {
      file_path: "notes.md",
      edits: [{ search: "a", replace: "b" }],
      change_summary: "should not happen",
    });
    expect(output).toMatchObject({
      ok: false,
      error: { reason: "out_of_scope" },
    });
    expect(trap.edits).toEqual([]);
  });

  // Regression for the second Codex review round: search_files must not
  // surface snippets from out-of-scope paths even when the underlying
  // repository's in-repo filter is broken or absent. Uses a leaky stub repo
  // that returns hits regardless of scope to prove the tool-layer postfilter
  // is the load-bearing one.
  it("search_files filters hits from paths denied by canRead", async () => {
    class LeakySearchRepository implements FileRepository {
      async read(_p: string): Promise<string> {
        throw new Error("not used");
      }
      async write(_p: string, _c: string, _s: string): Promise<void> {}
      async edit(
        _p: string,
        _e: readonly SearchReplaceEdit[],
        _s: string,
      ): Promise<EditResult> {
        return { ok: true };
      }
      async list(_prefix?: string): Promise<string[]> {
        return [];
      }
      async search(_q: string, _s?: SearchScope): Promise<SearchResult[]> {
        return [
          { filePath: "tasks/inbox.md", snippet: "ok", line: 1 },
          { filePath: "tasks/random.md", snippet: "leaked", line: 1 },
          { filePath: ".obsidian/workspace.json", snippet: "leaked", line: 1 },
          { filePath: "archive/daily/note.md", snippet: "leaked", line: 1 },
          { filePath: "archive/daily/2026-04-30.md", snippet: "ok", line: 1 },
        ];
      }
    }

    const output = (await runSingleToolCall(
      new LeakySearchRepository(),
      "search_files",
      { query: "anything", scope: "all" },
    )) as SearchResult[];

    expect(output.map((h) => h.filePath).sort()).toEqual([
      "archive/daily/2026-04-30.md",
      "tasks/inbox.md",
    ]);
  });

  // Regression for the third Codex review round: even after the gate uses
  // an injected clock, search_files can still drift if the underlying
  // repository computes "today" itself with a *different* clock. This test
  // simulates a session that started before UTC midnight: the tool clock
  // points at 2026-05-08T23:59:00Z (the turn's snapshot), but the
  // repository's internal clock has already advanced past midnight to
  // 2026-05-09T00:01:00Z (e.g. the user paused mid-turn, or the repo's
  // clock was constructed at a slightly different moment). The repo's
  // scope filter would, on its own, drop daily/2026-05-08.md from
  // active-scope hits — producing a silent false negative for the very
  // file the prompt told the model is "today's." With `today` threaded
  // through repo.search, the repo and the tool agree by construction.
  it("search_files does not drop the turn day's daily across a UTC rollover", async () => {
    const turnDate = new Date("2026-05-08T23:59:00Z"); // turn's snapshot
    const repoClock = new Date("2026-05-09T00:01:00Z"); // repo "today" drifts
    const repo = new InMemoryFileRepository({ now: () => repoClock });
    await repo.write("daily/2026-05-08.md", "ate sushi for lunch", "seed");
    await repo.write("daily/2026-05-09.md", "tomorrow's plan: sushi again", "seed");

    const output = (await runSingleToolCall(
      repo,
      "search_files",
      { query: "sushi", scope: "active" },
      () => turnDate,
    )) as SearchResult[];

    // Without the fix, the repo would scope to daily/2026-05-09.md (its own
    // today) and the tool postfilter would also reject 2026-05-09 (because
    // canRead's today is 2026-05-08), producing zero hits — a silent false
    // negative on the very note the prompt is pointing at.
    expect(output.map((h) => h.filePath)).toEqual(["daily/2026-05-08.md"]);
  });

  // Regression for the second Codex review round: prompt date and gate date
  // must come from the same source. The CLI captures `turnNow` per turn and
  // passes `() => turnNow` to buildTools; the test asserts that injection
  // works — when the clock says day N, the gate gates day N regardless of
  // wall time.
  it("buildTools honors the injected clock for the daily-note gate", async () => {
    // Pretend "today" is 2026-05-08 even though the wall clock could be any
    // date. The CLI's turn clock points at exactly this moment.
    const sessionDate = new Date("2026-05-08T23:59:00Z");
    const repo = new InMemoryFileRepository({ now: () => sessionDate });
    await repo.write("daily/2026-05-08.md", "session note", "seed");
    await repo.write("daily/2026-05-09.md", "tomorrow", "seed");

    const model = sequencedMockModel([
      streamResult(
        toolCallChunks("read_file", "call-1", { file_path: "daily/2026-05-08.md" }),
      ),
      streamResult(textChunks("done")),
    ]);
    const result = streamText({
      model,
      tools: buildTools(repo, { now: () => sessionDate }),
      stopWhen: isStepCount(3),
      messages: [{ role: "user", content: "go" }],
    });
    let output: unknown;
    for await (const part of result.fullStream) {
      if (part.type === "tool-result") output = part.output;
      else if (part.type === "error") throw part.error;
    }
    expect(output).toMatchObject({ ok: true, content: "session note" });

    // Same repo, but now the injected clock has rolled over to the next day —
    // the gate should deny yesterday's daily, simulating what happens at the
    // start of a new turn after midnight (the CLI rebuilds the prompt for the
    // new day, so the model would not request the old date in practice).
    const nextDay = new Date("2026-05-09T00:01:00Z");
    const model2 = sequencedMockModel([
      streamResult(
        toolCallChunks("read_file", "call-1", { file_path: "daily/2026-05-08.md" }),
      ),
      streamResult(textChunks("done")),
    ]);
    const result2 = streamText({
      model: model2,
      tools: buildTools(repo, { now: () => nextDay }),
      stopWhen: isStepCount(3),
      messages: [{ role: "user", content: "go" }],
    });
    let output2: unknown;
    for await (const part of result2.fullStream) {
      if (part.type === "tool-result") output2 = part.output;
      else if (part.type === "error") throw part.error;
    }
    expect(output2).toMatchObject({
      ok: false,
      error: { reason: "out_of_scope" },
    });
  });

  // Regression for the Codex review of Task 3.5: list_files must not enumerate
  // paths the LLM cannot read. Seeds a vault containing both allowed and
  // out-of-scope markdown files and asserts the gate filters them out.
  it("list_files returns only paths permitted by canRead", async () => {
    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    await repo.write("tasks/inbox.md", "ok", "seed");
    await repo.write("tasks/random.md", "denied", "seed"); // out of scope
    await repo.write("daily/2026-05-08.md", "ok", "seed"); // matches FIXED_NOW
    await repo.write("daily/2026-05-07.md", "denied", "seed"); // not today
    await repo.write("archive/daily/2026-05-01.md", "ok", "seed");
    await repo.write("archive/daily/note.md", "denied", "seed"); // not date
    await repo.write("notes.md", "denied", "seed");

    const output = await runSingleToolCall(repo, "list_files", {});
    const paths = output as string[];
    expect(paths.sort()).toEqual([
      "archive/daily/2026-05-01.md",
      "daily/2026-05-08.md",
      "tasks/inbox.md",
    ]);

    // even with an out-of-scope prefix, no leak
    const archiveOnly = (await runSingleToolCall(repo, "list_files", {
      prefix: "archive/",
    })) as string[];
    expect(archiveOnly).toEqual(["archive/daily/2026-05-01.md"]);
  });
});
