import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "../system-prompt.js";

describe("buildSystemPrompt", () => {
  // T4-AC-01: every R1..R13 anchor present + the R13 date line in the
  // German-leaning "Today is Friday, 24. April 2026" format the plan pins.
  it("contains all 13 R-rule anchors and the R13 date line", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain("Today is Friday, 24. April 2026.");

    for (let i = 1; i <= 13; i++) {
      const anchor = `[R${i}]`;
      expect(prompt).toContain(anchor);
    }
  });

  // T4-AC-01b: the separate "## Tool conventions" section with five anchors.
  // Reinforces the tool-description-level rules and keeps GTD rules (R1–R13)
  // free of tool-protocol guidance.
  it("contains a '## Tool conventions' section with all T-C anchors", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain("## Tool conventions");
    for (let i = 1; i <= 6; i++) {
      expect(prompt).toContain(`[T-C${i}]`);
    }
  });

  it("renders the date line for different weekdays/months correctly", () => {
    // 2026-01-01 is a Thursday.
    const jan = buildSystemPrompt({ today: new Date("2026-01-01") });
    expect(jan).toContain("Today is Thursday, 1. January 2026.");

    // 2026-12-31 is a Thursday as well.
    const dec = buildSystemPrompt({ today: new Date("2026-12-31") });
    expect(dec).toContain("Today is Thursday, 31. December 2026.");
  });

  it("stays under the 2K-char hard cap (rough token budget guard)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    // ~4 chars/token rule of thumb → 2000 tokens ≈ 8000 chars. The plan
    // pins a ~1K-token target with a hard <2K-token cap, so 8000 chars is
    // the ceiling we assert against here.
    expect(prompt.length).toBeLessThan(8000);
  });
});
