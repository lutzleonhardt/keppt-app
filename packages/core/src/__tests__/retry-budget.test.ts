import { describe, expect, it } from "vitest";

import type { EditResult, SearchReplaceEdit } from "../edit.js";
import type { FileRepository, SearchResult, SearchScope } from "../file-repository.js";
import { InMemoryFileRepository } from "../in-memory-file-repository.js";
import { buildTools, type EditFileResult } from "../tools.js";

const FIXED_NOW = new Date("2026-05-08T10:00:00Z");

class SpyRepository implements FileRepository {
  editCalls: Array<{ filePath: string; edits: readonly SearchReplaceEdit[] }> = [];
  constructor(private readonly inner: InMemoryFileRepository) {}
  read(filePath: string): Promise<string> {
    return this.inner.read(filePath);
  }
  write(filePath: string, content: string, changeSummary: string): Promise<void> {
    return this.inner.write(filePath, content, changeSummary);
  }
  edit(
    filePath: string,
    edits: readonly SearchReplaceEdit[],
    changeSummary: string,
  ): Promise<EditResult> {
    this.editCalls.push({ filePath, edits });
    return this.inner.edit(filePath, edits, changeSummary);
  }
  list(prefix?: string): Promise<string[]> {
    return this.inner.list(prefix);
  }
  search(query: string, scope?: SearchScope, today?: string): Promise<SearchResult[]> {
    return this.inner.search(query, scope, today);
  }
}

interface EditFileInput {
  file_path: string;
  edits: ReadonlyArray<{ search: string; replace: string }>;
  change_summary: string;
}

async function runEdit(
  // The tool execute signature is { (input, options): result }; we only need
  // to satisfy the type at call sites where tests don't exercise toolCallId,
  // messages, or context.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: any,
  input: EditFileInput,
): Promise<EditFileResult> {
  return (await tool.execute(input, {
    toolCallId: "test-call",
    messages: [],
    context: undefined,
  })) as EditFileResult;
}

async function setupVault(): Promise<{
  repo: SpyRepository;
  inner: InMemoryFileRepository;
}> {
  const inner = new InMemoryFileRepository({ now: () => FIXED_NOW });
  await inner.write("tasks/inbox.md", "- [ ] buy milk\n", "seed");
  await inner.write("tasks/focus.md", "- [ ] ship task 3\n", "seed");
  return { repo: new SpyRepository(inner), inner };
}

const failingEdit = (filePath: string): EditFileInput => ({
  file_path: filePath,
  edits: [{ search: "this string does not exist in the file", replace: "x" }],
  change_summary: "intentionally failing edit",
});

describe("edit_file retry budget — AC suite", () => {
  it("T3.7-AC-01: single-file exhaustion stops repo.edit on the third attempt", async () => {
    const { repo, inner } = await setupVault();
    const tools = buildTools(repo, { now: () => FIXED_NOW });
    const before = await inner.read("tasks/inbox.md");

    const r1 = await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    const r2 = await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    const r3 = await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));

    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
    if (r1.ok || r2.ok || r3.ok) throw new Error("unreachable");
    expect(r1.error.reason).toBe("match");
    expect(r2.error.reason).toBe("match");
    expect(r3.error.reason).toBe("retry_budget_exhausted");
    if (r3.error.reason !== "retry_budget_exhausted") throw new Error("unreachable");
    expect(r3.error.currentContent).toBe(before);

    expect(await inner.read("tasks/inbox.md")).toBe(before);
    expect(repo.editCalls.length).toBe(2);
  });

  it("T3.7-AC-02: per-file scope — exhausted file does not block sibling file in the same turn", async () => {
    const { repo } = await setupVault();
    const tools = buildTools(repo, { now: () => FIXED_NOW });

    await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));

    const onFocus = await runEdit(tools.edit_file, failingEdit("tasks/focus.md"));
    expect(onFocus.ok).toBe(false);
    if (onFocus.ok) throw new Error("unreachable");
    expect(onFocus.error.reason).toBe("match");
  });

  it("T3.7-AC-03: per-turn reset — a new buildTools call resets the counter for the same file", async () => {
    // Per-turn scoping comes from the CLI rebuilding buildTools per user
    // turn — the failure counter lives in the buildTools closure, so a
    // fresh call gets a fresh counter. No turnId field is needed for this
    // contract; the closure boundary is the turn boundary.
    const { repo } = await setupVault();

    const toolsTurn1 = buildTools(repo, { now: () => FIXED_NOW });
    await runEdit(toolsTurn1.edit_file, failingEdit("tasks/inbox.md"));
    await runEdit(toolsTurn1.edit_file, failingEdit("tasks/inbox.md"));
    const exhausted = await runEdit(toolsTurn1.edit_file, failingEdit("tasks/inbox.md"));
    if (exhausted.ok) throw new Error("unreachable");
    expect(exhausted.error.reason).toBe("retry_budget_exhausted");

    const toolsTurn2 = buildTools(repo, { now: () => FIXED_NOW });
    const fresh = await runEdit(toolsTurn2.edit_file, failingEdit("tasks/inbox.md"));
    if (fresh.ok) throw new Error("unreachable");
    expect(fresh.error.reason).toBe("match");
  });

  it("T3.7-AC-04: success on file B does not reset failures on file A", async () => {
    const { repo } = await setupVault();
    const tools = buildTools(repo, { now: () => FIXED_NOW });

    // 1 inbox failure
    await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));

    // successful focus edit — should not touch the inbox counter
    const focusOk = await runEdit(tools.edit_file, {
      file_path: "tasks/focus.md",
      edits: [{ search: "- [ ] ship task 3\n", replace: "- [x] ship task 3\n" }],
      change_summary: "check off ship task",
    });
    expect(focusOk.ok).toBe(true);

    // 2nd inbox failure — counter is now 2, but this attempt itself still
    // runs (count goes from 1 → 2 during this call), so the result is "match"
    const second = await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    if (second.ok) throw new Error("unreachable");
    expect(second.error.reason).toBe("match");

    // 3rd inbox failure — now the counter check (>= 2) fires before repo.edit
    const third = await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    if (third.ok) throw new Error("unreachable");
    expect(third.error.reason).toBe("retry_budget_exhausted");
  });

  it("T3.7-AC-05: short-circuit does not call repo.edit (asserted via spy)", async () => {
    const { repo } = await setupVault();
    const tools = buildTools(repo, { now: () => FIXED_NOW });

    await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    const before = repo.editCalls.length;
    expect(before).toBe(2);

    const exhausted = await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    if (exhausted.ok) throw new Error("unreachable");
    expect(exhausted.error.reason).toBe("retry_budget_exhausted");
    expect(repo.editCalls.length).toBe(2); // still 2 — the third attempt never reached repo.edit
  });

  // Concurrency note: edit_file is treated as sequential within a turn.
  // The CLI sets providerOptions.anthropic.disableParallelToolUse=true so
  // Anthropic emits at most one tool call per step. Tests for racing
  // parallel dispatch into edit_file are intentionally absent — that
  // shape isn't reachable on the supported provider, and the simpler
  // counter avoids the cancellation/false-block hazards a per-file lock
  // would introduce.

  it("T3.7-AC-08: exhausted retry on a missing writable file returns retry_budget_exhausted with empty currentContent", async () => {
    // repo.edit returns a structured failure with currentContent:"" for
    // missing-but-writable files. The exhausted path used to read the file
    // unconditionally, so the third attempt on a missing file would throw
    // FileNotFoundError instead of returning the structured shape — leaving
    // the model without the promised recovery contract. Mirror the edit
    // contract here.
    const { repo } = await setupVault();
    const tools = buildTools(repo, { now: () => FIXED_NOW });

    // daily/2026-05-08.md is writable under canWrite (today's daily note) but
    // was not seeded by setupVault, so the file is missing.
    const dailyPath = "daily/2026-05-08.md";

    const r1 = await runEdit(tools.edit_file, failingEdit(dailyPath));
    const r2 = await runEdit(tools.edit_file, failingEdit(dailyPath));
    const r3 = await runEdit(tools.edit_file, failingEdit(dailyPath));

    if (r1.ok || r2.ok || r3.ok) throw new Error("unreachable");
    expect(r1.error.reason).toBe("match");
    expect(r2.error.reason).toBe("match");
    expect(r3.error.reason).toBe("retry_budget_exhausted");
    if (r3.error.reason !== "retry_budget_exhausted") throw new Error("unreachable");
    expect(r3.error.currentContent).toBe("");

    // The third attempt did not reach repo.edit.
    expect(repo.editCalls.length).toBe(2);
  });

  it("T3.7-AC-10: invalid paths return a structured invalid_path result and never call repo.edit", async () => {
    // canWrite throws InvalidPathError (via validateFilePath) for traversal,
    // .keppt/, absolute, backslash, null-byte, etc. The tool layer must
    // catch that and surface it as a structured EditFileResult so the SDK
    // sees a tool *result*, not a tool *error* that interrupts the turn.
    // Regression guard: an earlier refactor pulled canWrite out of the
    // try/catch block and let InvalidPathError escape.
    const { repo } = await setupVault();
    const tools = buildTools(repo, { now: () => FIXED_NOW });

    const traversal = await runEdit(tools.edit_file, failingEdit("../etc/passwd"));
    if (traversal.ok) throw new Error("unreachable");
    expect(traversal.error.reason).toBe("invalid_path");

    const reserved = await runEdit(tools.edit_file, failingEdit(".keppt/logs/x.md"));
    if (reserved.ok) throw new Error("unreachable");
    expect(reserved.error.reason).toBe("invalid_path");

    const backslash = await runEdit(tools.edit_file, failingEdit("tasks\\inbox.md"));
    if (backslash.ok) throw new Error("unreachable");
    expect(backslash.error.reason).toBe("invalid_path");

    // None of the invalid paths reached repo.edit.
    expect(repo.editCalls.length).toBe(0);

    // Invalid paths must not consume budget either: a subsequent legitimate
    // match-failure on inbox is still attempt 1.
    const inbox = await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    if (inbox.ok) throw new Error("unreachable");
    expect(inbox.error.reason).toBe("match");
  });

  it("T3.7-AC-06: out_of_scope failures do not consume budget", async () => {
    const { repo } = await setupVault();
    const tools = buildTools(repo, { now: () => FIXED_NOW });

    // Two out-of-scope attempts — these are GTD-gate rejections, not match
    // failures. They must not consume budget on a different (legitimate) path.
    const oos1 = await runEdit(tools.edit_file, failingEdit("random/foo.md"));
    const oos2 = await runEdit(tools.edit_file, failingEdit("random/foo.md"));
    if (oos1.ok || oos2.ok) throw new Error("unreachable");
    expect(oos1.error.reason).toBe("out_of_scope");
    expect(oos2.error.reason).toBe("out_of_scope");

    // First real match-failure on inbox should be attempt 1, not exhausted.
    const inbox = await runEdit(tools.edit_file, failingEdit("tasks/inbox.md"));
    if (inbox.ok) throw new Error("unreachable");
    expect(inbox.error.reason).toBe("match");
  });
});
