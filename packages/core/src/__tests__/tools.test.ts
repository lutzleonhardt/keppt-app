import type {
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import {
  hasToolCall,
  isStepCount,
  simulateReadableStream,
  streamText,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import type {
  FileRepository,
  SearchResult,
  SearchScope,
} from "../file-repository.js";
import type { EditResult, SearchReplaceEdit } from "../edit.js";
import { InMemoryFileRepository } from "../in-memory-file-repository.js";
import { MemoryLogger, type LogEvent, type Logger } from "../logging.js";
import { buildTools, TASK_FILE_REMINDER } from "../tools.js";

class TrapRepository implements FileRepository {
  reads: string[] = [];
  writes: string[] = [];
  edits: string[] = [];
  async read(filePath: string): Promise<string> {
    this.reads.push(filePath);
    throw new Error(`TrapRepository.read should not be called (${filePath})`);
  }
  async write(
    filePath: string,
    _content: string,
    _summary: string,
  ): Promise<void> {
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
      streamResult(
        toolCallChunks("list_files", "call-1", { prefix: "tasks/" }),
      ),
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
    expect(observedToolCalls[1]?.input).toEqual({
      file_path: "tasks/inbox.md",
    });
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

describe("buildTools — suggest_quick_replies", () => {
  async function runQuickReplyCall(input: unknown): Promise<{
    toolErrors: unknown[];
    toolResults: unknown[];
    modelCalls: number;
  }> {
    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    let modelCalls = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        modelCalls += 1;
        if (modelCalls > 1) {
          throw new Error("suggest_quick_replies should stop the loop");
        }
        return streamResult(
          toolCallChunks("suggest_quick_replies", "call-1", input),
        );
      },
    });
    const result = streamText({
      model,
      tools: buildTools(repo, { now: () => FIXED_NOW }),
      stopWhen: [hasToolCall("suggest_quick_replies"), isStepCount(5)],
      messages: [{ role: "user", content: "go" }],
    });
    const toolErrors: unknown[] = [];
    const toolResults: unknown[] = [];
    for await (const part of result.fullStream) {
      if (part.type === "tool-error") toolErrors.push(part.error);
      else if (part.type === "tool-result") toolResults.push(part.output);
      else if (part.type === "error") throw part.error;
    }
    return { toolErrors, toolResults, modelCalls };
  }

  // T6-AC-01: input schema rejects invalid chip payloads before execute.
  // 2026-05-21: schema gained a required `question` field — chips can no
  // longer reach the terminal without their accompanying question, which
  // replaces the soft "prose-first" prompt nudges that cheap models kept
  // ignoring. The first four rows still pin options-side validation; the
  // missing-question + empty-question rows pin the new requirement.
  it.each([
    ["one option", { question: "Was?", options: ["a"] }],
    [
      "six options",
      { question: "Was?", options: ["a", "b", "c", "d", "e", "f"] },
    ],
    ["empty option", { question: "Was?", options: ["a", ""] }],
    ["61-char option", { question: "Was?", options: ["a", "x".repeat(61)] }],
    ["missing question", { options: ["a", "b"] }],
    ["empty question", { question: "", options: ["a", "b"] }],
    ["201-char question", { question: "x".repeat(201), options: ["a", "b"] }],
  ])("rejects %s as a tool-error (T6-AC-01)", async (_label, input) => {
    const { toolErrors, toolResults, modelCalls } =
      await runQuickReplyCall(input);

    expect(modelCalls).toBe(1);
    expect(toolResults).toEqual([]);
    expect(toolErrors).toHaveLength(1);
    expect(String(toolErrors[0])).toMatch(
      /options|question|Too|small|big|String|Required/,
    );
  });

  it("returns valid question+options and stops the tool loop after the call", async () => {
    const { toolErrors, toolResults, modelCalls } = await runQuickReplyCall({
      question: "Soll ich das so eintragen?",
      options: ["a", "b", "c"],
    });

    expect(modelCalls).toBe(1);
    expect(toolErrors).toEqual([]);
    expect(toolResults).toEqual([
      {
        question: "Soll ich das so eintragen?",
        options: ["a", "b", "c"],
      },
    ]);
  });

  // 2026-05-21: tool description rewritten around the new `question`
  // requirement. The old "MUST call instead of ending with a bare …"
  // wording is gone because the schema enforces context; what the
  // description still pins is the no-listing-substitute carve-out
  // (gpt-5.4-mini regression: chips on "Was steht morgen an?") and
  // the question-shape contract.
  it("describes the required question field and listing carve-out", () => {
    const tools = buildTools(
      new InMemoryFileRepository({ now: () => FIXED_NOW }),
    );
    expect(tools.suggest_quick_replies.description).toContain(
      "`question` field is REQUIRED",
    );
    expect(tools.suggest_quick_replies.description).toContain(
      "complete sentence naming the choice you offer",
    );
    expect(tools.suggest_quick_replies.description).toContain(
      'a listing question like "Was steht morgen an?" gets the list in prose, not chips',
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

    // After Task 5 redesign: archive/daily/* is no longer canReadable, so
    // even a date-formatted archive entry is dropped by the tool postfilter.
    // The leak-blocking guarantee for the other out-of-scope paths still
    // holds.
    expect(output.map((h) => h.filePath).sort()).toEqual(["tasks/inbox.md"]);
  });

  // Regression for the third Codex review round: even after the gate uses
  // an injected clock, search_files must not drift across a UTC midnight
  // rollover. After the Task 5 redesign the gate accepts any date-formatted
  // daily, so both 2026-05-08 and 2026-05-09 now sit in active scope no
  // matter which clock is in the lead. The test purpose mutates from
  // "the gate keeps the turn-day daily visible" to "neither daily is
  // dropped by repo/tool clock disagreement" — i.e. the threaded `today`
  // still prevents silent false negatives from a repo that picks a
  // different reference date than the tool layer.
  it("search_files does not drop date-formatted dailies across a UTC rollover", async () => {
    const turnDate = new Date("2026-05-08T23:59:00Z"); // turn's snapshot
    const repoClock = new Date("2026-05-09T00:01:00Z"); // repo "today" drifts
    const repo = new InMemoryFileRepository({ now: () => repoClock });
    await repo.write("daily/2026-05-08.md", "ate sushi for lunch", "seed");
    await repo.write(
      "daily/2026-05-09.md",
      "tomorrow's plan: sushi again",
      "seed",
    );

    const output = (await runSingleToolCall(
      repo,
      "search_files",
      { query: "sushi", scope: "active" },
      () => turnDate,
    )) as SearchResult[];

    expect(output.map((h) => h.filePath).sort()).toEqual([
      "daily/2026-05-08.md",
      "daily/2026-05-09.md",
    ]);
  });

  // Regression for the second Codex review round, redirected after the
  // Task 5 redesign: the daily-note gate no longer filters by date — past,
  // today, and future dailies are all readable through canRead. The
  // clock-injection contract now manifests via `isCanonicalTaskFile` (the
  // reminder gate, still today-only): the same write lands on disk for any
  // valid daily date, but only the one matching the injected clock receives
  // the canonical-task-file reminder. This pins that the injected clock
  // still flows through buildTools to the today-sensitive surface.
  it("buildTools honors the injected clock for the today-reminder gate", async () => {
    const sessionDate = new Date("2026-05-08T23:59:00Z");
    const repo = new InMemoryFileRepository({ now: () => sessionDate });

    // Today's daily — gets the reminder.
    const todayWrite = streamText({
      model: sequencedMockModel([
        streamResult(
          toolCallChunks("write_file", "call-1", {
            file_path: "daily/2026-05-08.md",
            content: "Plan",
            change_summary: "draft plan",
          }),
        ),
        streamResult(textChunks("done")),
      ]),
      tools: buildTools(repo, { now: () => sessionDate }),
      stopWhen: isStepCount(3),
      messages: [{ role: "user", content: "go" }],
    });
    let todayOutput: unknown;
    for await (const part of todayWrite.fullStream) {
      if (part.type === "tool-result") todayOutput = part.output;
      else if (part.type === "error") throw part.error;
    }
    expect(todayOutput).toMatchObject({ ok: true });
    expect((todayOutput as { reminder?: string }).reminder).toBeDefined();

    // Past daily — write_file is hard-blocked by the R6 carve-out, so the
    // clock-flow assertion runs through edit_file instead (which remains
    // open for narrow corrections). The reminder still does NOT fire because
    // isCanonicalTaskFile remains today-only.
    await repo.write("daily/2026-05-07.md", "before\n", "seed");
    const pastEdit = streamText({
      model: sequencedMockModel([
        streamResult(
          toolCallChunks("edit_file", "call-2", {
            file_path: "daily/2026-05-07.md",
            edits: [{ search: "before\n", replace: "after\n" }],
            change_summary: "correct yesterday",
          }),
        ),
        streamResult(textChunks("done")),
      ]),
      tools: buildTools(repo, { now: () => sessionDate }),
      stopWhen: isStepCount(3),
      messages: [{ role: "user", content: "go" }],
    });
    let pastOutput: unknown;
    for await (const part of pastEdit.fullStream) {
      if (part.type === "tool-result") pastOutput = part.output;
      else if (part.type === "error") throw part.error;
    }
    expect(pastOutput).toMatchObject({ ok: true });
    expect(pastOutput as object).not.toHaveProperty("reminder");
  });

  // Regression for the Codex review of Task 3.5, updated for Task 5: list_files
  // must not enumerate paths the LLM cannot read. After the redesign, past
  // and future dailies join the active surface, and archive/daily/* leaves
  // it. Seeds a vault containing both allowed and out-of-scope markdown
  // files and asserts the gate filters them out. (T5-AC-04)
  it("list_files returns past, today, and future dailies; denies archive + non-allowlisted", async () => {
    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    await repo.write("tasks/inbox.md", "ok", "seed");
    await repo.write("tasks/random.md", "denied", "seed"); // out of scope
    await repo.write("daily/2026-05-08.md", "ok", "seed"); // today (FIXED_NOW)
    await repo.write("daily/2026-05-07.md", "ok", "seed"); // past — now allowed
    await repo.write("daily/2026-06-01.md", "ok", "seed"); // future — now allowed
    await repo.write("daily/notes.md", "denied", "seed"); // non-date
    await repo.write("archive/daily/2026-05-01.md", "denied", "seed"); // archive dead surface
    await repo.write("archive/daily/note.md", "denied", "seed"); // not date
    await repo.write("notes.md", "denied", "seed");

    const output = await runSingleToolCall(repo, "list_files", {});
    const paths = output as string[];
    expect(paths.sort()).toEqual([
      "daily/2026-05-07.md",
      "daily/2026-05-08.md",
      "daily/2026-06-01.md",
      "tasks/inbox.md",
    ]);

    // even with an out-of-scope prefix, no leak — archive/ is fully filtered
    const archiveOnly = (await runSingleToolCall(repo, "list_files", {
      prefix: "archive/",
    })) as string[];
    expect(archiveOnly).toEqual([]);
  });
});

// Three named observability seams in the tool layer flow through the
// injected Logger. Codes are stable contract surface — see
// docs/plans/phase-1-cli.md Task 3.9.
describe("buildTools — Logger seams", () => {
  it("emits tool.edit_file.failed (info) on a structured edit match failure", async () => {
    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    await repo.write(
      "tasks/inbox.md",
      "- [ ] buy milk\n- [ ] buy milk\n",
      "seed",
    );
    const logger = new MemoryLogger();

    const model = sequencedMockModel([
      streamResult(
        toolCallChunks("edit_file", "call-1", {
          file_path: "tasks/inbox.md",
          edits: [{ search: "- [ ] buy milk\n", replace: "- [x] buy milk\n" }],
          change_summary: "ambiguous",
        }),
      ),
      streamResult(textChunks("done")),
    ]);
    const result = streamText({
      model,
      tools: buildTools(repo, { now: () => FIXED_NOW, logger }),
      stopWhen: isStepCount(3),
      messages: [{ role: "user", content: "go" }],
    });
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error;
    }

    const failed = logger.byCode("tool.edit_file.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      level: "info",
      code: "tool.edit_file.failed",
      meta: {
        filePath: "tasks/inbox.md",
        matchCount: 2,
        failedSearchLength: "- [ ] buy milk\n".length,
        currentContentLength: "- [ ] buy milk\n- [ ] buy milk\n".length,
      },
    });
    // DSGVO / log-bloat guard: failure diagnostics must not embed file
    // contents or the model's verbatim search string. The CLI logger
    // serializes meta verbatim into .keppt/logs/cli-errors.jsonl, which
    // can persist for the lifetime of the vault.
    expect(failed[0]?.meta).not.toHaveProperty("error");
    expect(failed[0]?.meta).not.toHaveProperty("currentContent");
    expect(failed[0]?.meta).not.toHaveProperty("failedSearch");
    expect(JSON.stringify(failed[0])).not.toContain("buy milk");
  });

  it("safeLog wrapping: a throwing logger does not change tool semantics", async () => {
    // Tool layer applies safeLog at the buildTools seam. An adapter
    // that throws on every call must not turn structured ok:false
    // results (invalid_path, edit-match failure, retry budget) into
    // stream errors that abort the turn.
    class ThrowingLogger implements Logger {
      calls = 0;
      private boom(): never {
        this.calls += 1;
        throw new Error("logger boom");
      }
      debug(_e: LogEvent): void {
        this.boom();
      }
      info(_e: LogEvent): void {
        this.boom();
      }
      warn(_e: LogEvent): void {
        this.boom();
      }
      error(_e: LogEvent): void {
        this.boom();
      }
    }

    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    await repo.write(
      "tasks/inbox.md",
      "- [ ] buy milk\n- [ ] buy milk\n",
      "seed",
    );
    const logger = new ThrowingLogger();

    const model = sequencedMockModel([
      // invalid_path path — logger.warn would normally fire here.
      streamResult(
        toolCallChunks("read_file", "call-1", {
          file_path: "tasks/../secrets.md",
        }),
      ),
      // edit_file match failure path — logger.info would normally fire here.
      streamResult(
        toolCallChunks("edit_file", "call-2", {
          file_path: "tasks/inbox.md",
          edits: [{ search: "- [ ] buy milk\n", replace: "- [x] buy milk\n" }],
          change_summary: "ambiguous",
        }),
      ),
      streamResult(textChunks("done")),
    ]);
    const result = streamText({
      model,
      tools: buildTools(repo, { now: () => FIXED_NOW, logger }),
      stopWhen: isStepCount(5),
      messages: [{ role: "user", content: "go" }],
    });
    const toolResults: Array<{ name: string; output: unknown }> = [];
    for await (const part of result.fullStream) {
      if (part.type === "tool-result") {
        toolResults.push({ name: part.toolName, output: part.output });
      } else if (part.type === "error") {
        throw part.error;
      }
    }

    expect(toolResults).toHaveLength(2);
    expect(toolResults[0]?.output).toMatchObject({
      ok: false,
      error: { reason: "invalid_path" },
    });
    expect(toolResults[1]?.output).toMatchObject({
      ok: false,
      error: { reason: "match", matchCount: 2 },
    });
    // Both seams attempted to log and were swallowed by safeLog.
    expect(logger.calls).toBeGreaterThanOrEqual(2);
  });

  it("emits tool.edit_file.retry_budget_exhausted (warn) on the third failed edit_file call against the same file", async () => {
    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    await repo.write(
      "tasks/inbox.md",
      "- [ ] buy milk\n- [ ] buy milk\n",
      "seed",
    );
    const logger = new MemoryLogger();

    const ambiguousEdit = {
      file_path: "tasks/inbox.md",
      edits: [{ search: "- [ ] buy milk\n", replace: "- [x] buy milk\n" }],
      change_summary: "ambiguous",
    };
    const model = sequencedMockModel([
      streamResult(toolCallChunks("edit_file", "call-1", ambiguousEdit)),
      streamResult(toolCallChunks("edit_file", "call-2", ambiguousEdit)),
      streamResult(toolCallChunks("edit_file", "call-3", ambiguousEdit)),
      streamResult(textChunks("done")),
    ]);
    const result = streamText({
      model,
      tools: buildTools(repo, { now: () => FIXED_NOW, logger }),
      stopWhen: isStepCount(5),
      messages: [{ role: "user", content: "go" }],
    });
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error;
    }

    const exhausted = logger.byCode("tool.edit_file.retry_budget_exhausted");
    expect(exhausted).toHaveLength(1);
    expect(exhausted[0]).toMatchObject({
      level: "warn",
      code: "tool.edit_file.retry_budget_exhausted",
      meta: { filePath: "tasks/inbox.md", attempts: 2 },
    });
    // Plus exactly two preceding match-failure info events (calls 1 and 2);
    // the third call short-circuits before repo.edit runs.
    expect(logger.byCode("tool.edit_file.failed")).toHaveLength(2);
  });

  it("emits tool.<name>.invalid_path (warn) when a tool catches InvalidPathError", async () => {
    // `..` traversal is rejected synchronously by validateFilePath inside
    // canRead, which the read_file tool catches and converts to a structured
    // invalid_path result. Same pattern fires for write_file and edit_file.
    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    const logger = new MemoryLogger();

    const model = sequencedMockModel([
      streamResult(
        toolCallChunks("read_file", "call-1", {
          file_path: "tasks/../secrets.md",
        }),
      ),
      streamResult(textChunks("done")),
    ]);
    const result = streamText({
      model,
      tools: buildTools(repo, { now: () => FIXED_NOW, logger }),
      stopWhen: isStepCount(3),
      messages: [{ role: "user", content: "go" }],
    });
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error;
    }

    const invalid = logger.byCode("tool.read_file.invalid_path");
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({
      level: "warn",
      code: "tool.read_file.invalid_path",
      meta: { filePath: "tasks/../secrets.md" },
    });
    expect(typeof invalid[0]?.meta?.reason).toBe("string");
  });
});

// Task 4.3: the `reminder` field on the success-path return of write_file
// and edit_file. Salience hint for the R5 crosscheck; attached only when
// the write lands on a canonical task file (the five tasks/*.md plus
// today's daily note). Absent on every error path and on non-canonical
// success paths.
describe("buildTools — Task 4.3 reminder field", () => {
  const TODAY_STR = "2026-05-08"; // matches FIXED_NOW's UTC date
  const CANONICAL_PATHS = [
    "tasks/inbox.md",
    "tasks/focus.md",
    "tasks/next-actions.md",
    "tasks/waiting.md",
    "tasks/someday-maybe.md",
    `daily/${TODAY_STR}.md`,
  ] as const;

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

  // T4.3-AC-01 + T4.3-AC-02
  it("write_file attaches the byte-stable reminder on every canonical path", async () => {
    for (const filePath of CANONICAL_PATHS) {
      const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
      const output = await runSingleToolCall(repo, "write_file", {
        file_path: filePath,
        content: "x",
        change_summary: "seed",
      });
      expect(output).toEqual({ ok: true, reminder: TASK_FILE_REMINDER });
    }
  });

  // T4.3-AC-03
  it("edit_file attaches the byte-stable reminder on every canonical path", async () => {
    for (const filePath of CANONICAL_PATHS) {
      const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
      await repo.write(filePath, "before\n", "seed");
      const output = await runSingleToolCall(repo, "edit_file", {
        file_path: filePath,
        edits: [{ search: "before\n", replace: "after\n" }],
        change_summary: "swap",
      });
      expect(output).toEqual({ ok: true, reminder: TASK_FILE_REMINDER });
    }
  });

  // T4.3-AC-04: archive writes never land — out_of_scope carries no reminder
  // because the field is success-path-only and the write didn't happen.
  it("write_file against an archive path returns out_of_scope with no reminder", async () => {
    const trap = new TrapRepository();
    const output = await runSingleToolCall(trap, "write_file", {
      file_path: "archive/daily/2026-05-01.md",
      content: "x",
      change_summary: "blocked",
    });
    expect(output).toMatchObject({
      ok: false,
      error: { reason: "out_of_scope" },
    });
    expect(output as object).not.toHaveProperty("reminder");
    expect(trap.writes).toEqual([]);
  });

  // R6 hard guard: write_file (full rewrite) on a past daily returns
  // out_of_scope without touching the repo, while edit_file remains open
  // for narrow corrections per R6's carve-out.
  it("write_file against a past daily is blocked, edit_file still works", async () => {
    const trap = new TrapRepository();
    const blocked = await runSingleToolCall(trap, "write_file", {
      file_path: "daily/2026-05-07.md", // FIXED_NOW - 1 day
      content: "rewritten",
      change_summary: "blocked",
    });
    expect(blocked).toMatchObject({
      ok: false,
      error: { reason: "out_of_scope" },
    });
    expect(blocked as object).not.toHaveProperty("reminder");
    expect(trap.writes).toEqual([]);

    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    await repo.write("daily/2026-05-07.md", "before\n", "seed");
    const corrected = await runSingleToolCall(repo, "edit_file", {
      file_path: "daily/2026-05-07.md",
      edits: [{ search: "before\n", replace: "after\n" }],
      change_summary: "narrow correction",
    });
    expect(corrected).toMatchObject({ ok: true });
    expect(corrected as object).not.toHaveProperty("reminder");
  });

  // T4.3-AC-05 (revised under Task 5 redesign): future daily notes are now
  // writable through canWrite, but the reminder is still today-only because
  // isCanonicalTaskFile remains today-bound. The write lands, the reminder
  // does not fire. The helper-level pin lives in gtd-layout.test.ts.
  it("write_file against a future daily note succeeds without a reminder", async () => {
    const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
    const output = await runSingleToolCall(repo, "write_file", {
      file_path: "daily/2026-05-09.md", // FIXED_NOW + 1 day
      content: "x",
      change_summary: "draft future plan",
    });
    expect(output).toMatchObject({ ok: true });
    expect(output as object).not.toHaveProperty("reminder");
  });

  // T4.3-AC-06: every documented error variant carries no reminder.
  it("error variants never carry a reminder field", async () => {
    // out_of_scope on write_file
    {
      const trap = new TrapRepository();
      const out = await runSingleToolCall(trap, "write_file", {
        file_path: "notes.md",
        content: "x",
        change_summary: "blocked",
      });
      expect(out as object).not.toHaveProperty("reminder");
    }
    // invalid_path on write_file
    {
      const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
      const out = await runSingleToolCall(repo, "write_file", {
        file_path: "tasks/../secrets.md",
        content: "x",
        change_summary: "blocked",
      });
      expect(out).toMatchObject({
        ok: false,
        error: { reason: "invalid_path" },
      });
      expect(out as object).not.toHaveProperty("reminder");
    }
    // out_of_scope on edit_file
    {
      const trap = new TrapRepository();
      const out = await runSingleToolCall(trap, "edit_file", {
        file_path: "notes.md",
        edits: [{ search: "a", replace: "b" }],
        change_summary: "blocked",
      });
      expect(out as object).not.toHaveProperty("reminder");
    }
    // invalid_path on edit_file
    {
      const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
      const out = await runSingleToolCall(repo, "edit_file", {
        file_path: "tasks/../secrets.md",
        edits: [{ search: "a", replace: "b" }],
        change_summary: "blocked",
      });
      expect(out).toMatchObject({
        ok: false,
        error: { reason: "invalid_path" },
      });
      expect(out as object).not.toHaveProperty("reminder");
    }
    // match failure on edit_file (canonical path, but write didn't land)
    {
      const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
      await repo.write(
        "tasks/inbox.md",
        "- [ ] buy milk\n- [ ] buy milk\n",
        "seed",
      );
      const out = await runSingleToolCall(repo, "edit_file", {
        file_path: "tasks/inbox.md",
        edits: [{ search: "- [ ] buy milk\n", replace: "- [x] buy milk\n" }],
        change_summary: "ambiguous",
      });
      expect(out).toMatchObject({ ok: false, error: { reason: "match" } });
      expect(out as object).not.toHaveProperty("reminder");
    }
    // retry_budget_exhausted on edit_file — needs three calls within one
    // buildTools instance, so build a dedicated stream rather than going
    // through runSingleToolCall.
    {
      const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
      await repo.write(
        "tasks/inbox.md",
        "- [ ] buy milk\n- [ ] buy milk\n",
        "seed",
      );
      const ambiguousEdit = {
        file_path: "tasks/inbox.md",
        edits: [{ search: "- [ ] buy milk\n", replace: "- [x] buy milk\n" }],
        change_summary: "ambiguous",
      };
      const model = sequencedMockModel([
        streamResult(toolCallChunks("edit_file", "call-1", ambiguousEdit)),
        streamResult(toolCallChunks("edit_file", "call-2", ambiguousEdit)),
        streamResult(toolCallChunks("edit_file", "call-3", ambiguousEdit)),
        streamResult(textChunks("done")),
      ]);
      const result = streamText({
        model,
        tools: buildTools(repo, { now: () => FIXED_NOW }),
        stopWhen: isStepCount(5),
        messages: [{ role: "user", content: "go" }],
      });
      const toolResults: unknown[] = [];
      for await (const part of result.fullStream) {
        if (part.type === "tool-result") toolResults.push(part.output);
        else if (part.type === "error") throw part.error;
      }
      expect(toolResults).toHaveLength(3);
      const third = toolResults[2];
      expect(third).toMatchObject({
        ok: false,
        error: { reason: "retry_budget_exhausted" },
      });
      expect(third as object).not.toHaveProperty("reminder");
    }
  });

  // The constant in tools.ts pins the canonical reminder wording.
  // Byte-stability across refactors is the contract — when the wording
  // legitimately needs to change (e.g. the once-per-turn clause added
  // 2026-05-21 to stop re-reads between sequential edits on
  // gpt-5.4-mini @ reasoningEffort=high, or the Done-checks-off-not-
  // removes clause added 2026-05-21 to align R3/R5/R21 with R8 Weekly
  // Review semantics), update both sides at once.
  it("TASK_FILE_REMINDER carries the once-per-turn crosscheck clause", () => {
    expect(TASK_FILE_REMINDER).toBe(
      "Task-relevant file modified. R5 crosscheck runs ONCE per turn, before your FINAL response — not between sequential edits.\n" +
        "- Re-read tasks/focus.md, tasks/next-actions.md, tasks/waiting.md, and today's daily/ ONLY for files you have not already read this turn. Files you just edited need no extra read of the OTHER three if they were already read this turn.\n" +
        "- Mirror Focus↔Next-Actions on every status toggle.\n" +
        "- Done = check off `[x]` in place across Focus + Next Actions + Waiting; do NOT remove (R8 Weekly Review tidies `[x]` later).\n" +
        "- Waiting removes from Focus + Next Actions.\n" +
        "- Report any drift.\n" +
        "If you already completed this crosscheck after a previous edit in this same turn, skip — do not redo it.",
    );
  });
});
