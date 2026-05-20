import { describe, expect, it } from "vitest";

import {
  FileNotFoundError,
  InMemoryFileRepository,
  InvalidPathError,
} from "@gtd/core";

import { PROVIDER, providerOptions } from "../src/model-provider.js";

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

  it("pins the sequential-tool-use contract for the active provider", () => {
    // Architecture anchor for Task 3.7: the edit_file retry budget assumes
    // edit_file calls within a single user turn are sequential — a plain
    // Map mutation under that assumption is race-free.
    //
    // Anthropic: enforced at the provider boundary by
    //   providerOptions.anthropic.disableParallelToolUse = true. Removing
    //   that flag regresses the budget to a racy
    //   read-then-await-then-increment hazard.
    //
    // DeepSeek: the AI SDK provider exposes no equivalent flag (only
    //   `thinking` and `reasoningEffort`), so the invariant is best-effort
    //   at the provider layer. Worst case is one extra retry attempt
    //   burned under exactly concurrent same-file edits — documented in
    //   model-provider.ts and packages/core/src/tools.ts. The assertion
    //   here pins the *shape* per provider so a silent regression (e.g.
    //   accidentally dropping the anthropic flag, or adding a stray key
    //   on the deepseek branch that the SDK ignores) is caught.
    if (PROVIDER === "anthropic") {
      expect(providerOptions()).toEqual({
        anthropic: { disableParallelToolUse: true },
      });
    } else {
      expect(providerOptions()).toEqual({ deepseek: {} });
    }
  });
});
