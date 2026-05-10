import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  FileNotFoundError,
  InMemoryFileRepository,
  InvalidPathError,
} from "@gtd/core";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("@gtd/cli — workspace wiring", () => {
  it("imports public surface from @gtd/core and exercises it", async () => {
    const repo = new InMemoryFileRepository();
    expect(await repo.list()).toEqual([]);

    await repo.write("tasks/inbox.md", "hello", "smoke");
    expect(await repo.read("tasks/inbox.md")).toBe("hello");

    await expect(repo.read("missing.md")).rejects.toBeInstanceOf(FileNotFoundError);
    await expect(repo.write("../escape.md", "x", "")).rejects.toBeInstanceOf(
      InvalidPathError,
    );
  });

  it("forces sequential tool execution via providerOptions.anthropic.disableParallelToolUse", async () => {
    // Architecture anchor for Task 3.7: the edit_file retry budget assumes
    // edit_file calls within a single user turn are sequential — a plain
    // Map mutation under that assumption is race-free. The CLI enforces
    // sequentiality at the provider boundary by setting Anthropic's
    // disable_parallel_tool_use flag on streamText. If the flag is ever
    // removed, the budget's counter regresses to the racy
    // read-then-await-then-increment hazard. This static source check
    // makes that invariant unmissable in code review.
    const source = await readFile(path.resolve(here, "../src/index.ts"), "utf8");
    expect(source).toMatch(
      /providerOptions:\s*\{\s*anthropic:\s*\{\s*disableParallelToolUse:\s*true\b/,
    );
  });
});
