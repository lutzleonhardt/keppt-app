import { describe, expect, it, vi } from "vitest";

import {
  FileNotFoundError,
  InMemoryFileRepository,
  InvalidPathError,
} from "@gtd/core";

import {
  PROVIDER,
  apiKeyEnvName,
  providerOptions,
} from "../src/model-provider.js";

describe("@gtd/cli — workspace wiring", () => {
  it("imports public surface from @gtd/core and exercises it", async () => {
    const repo = new InMemoryFileRepository();
    expect(await repo.list()).toEqual([]);

    await repo.write("tasks/inbox.md", "hello", "smoke");
    expect(await repo.read("tasks/inbox.md")).toBe("hello");

    await expect(repo.read("missing.md")).rejects.toBeInstanceOf(
      FileNotFoundError,
    );
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
    // OpenAI: enforced with providerOptions.openai.parallelToolCalls=false.
    //
    // DeepSeek: no equivalent flag is wired, so the invariant is best-effort
    //   at the provider layer. Worst case is one extra retry attempt burned
    //   under exactly concurrent same-file edits — documented in
    //   model-provider.ts and packages/core/src/tools.ts. The assertion here
    //   pins the *shape* per provider so a silent regression (e.g.
    //   accidentally dropping a sequencing flag, or adding a stray key on an
    //   empty-options branch that the SDK ignores) is caught.
    if (PROVIDER === "anthropic") {
      expect(providerOptions()).toEqual({
        anthropic: { disableParallelToolUse: true },
      });
    } else if (PROVIDER === "openai") {
      expect(providerOptions()).toEqual({
        openai: { parallelToolCalls: false, reasoningEffort: "high" },
      });
    } else {
      expect(providerOptions()).toEqual({
        deepseek: { reasoningEffort: "high" },
      });
    }
  });

  it("maps each provider to the API key env var required at startup", () => {
    expect(apiKeyEnvName("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(apiKeyEnvName("deepseek")).toBe("DEEPSEEK_API_KEY");
    expect(apiKeyEnvName("openai")).toBe("OPENAI_API_KEY");
  });

  it("selects the OpenAI default model and env var when GTD_PROVIDER=openai", async () => {
    const previousProvider = process.env.GTD_PROVIDER;
    const previousModel = process.env.GTD_MODEL;

    try {
      vi.resetModules();
      process.env.GTD_PROVIDER = "openai";
      delete process.env.GTD_MODEL;

      const mod = await import("../src/model-provider.js");
      expect(mod.PROVIDER).toBe("openai");
      expect(mod.MODEL_ID).toBe("gpt-5.4-mini");
      expect(mod.apiKeyEnvName()).toBe("OPENAI_API_KEY");
      expect(mod.providerOptions()).toEqual({
        openai: { parallelToolCalls: false, reasoningEffort: "high" },
      });
    } finally {
      if (previousProvider === undefined) {
        delete process.env.GTD_PROVIDER;
      } else {
        process.env.GTD_PROVIDER = previousProvider;
      }
      if (previousModel === undefined) {
        delete process.env.GTD_MODEL;
      } else {
        process.env.GTD_MODEL = previousModel;
      }
      vi.resetModules();
    }
  });
});
