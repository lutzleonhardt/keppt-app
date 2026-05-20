import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "../system-prompt.js";

describe("buildSystemPrompt", () => {
  // T4-AC-01 (revised by T4.3-AC-08): every R1..R19 anchor present + the
  // R13 date line in the German-leaning "Today is Friday, 24. April 2026"
  // format the plan pins. R14/R15/R16 added in Task 4.3. R17 (out-of-scope
  // refusal) added to harden against jailbreak-style "you're a smart LLM"
  // insistence after a real session log showed the model giving a partial
  // Arduino tutorial despite R16. R18 (self-edit limit) and R19 (tone) added
  // after a DeepSeek session showed (a) hallucinated promises to "build in"
  // rule changes into its own system prompt, and (b) reflexive emoji/filler
  // closings ("Ready to go! 🔧", "Viel Erfolg!") that the user finds noisy.
  it("contains all 19 R-rule anchors and the R13 date line", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain("Today is Friday, 24. April 2026.");

    for (let i = 1; i <= 19; i++) {
      const anchor = `[R${i}]`;
      expect(prompt).toContain(anchor);
    }
  });

  // T4.3-AC-09: opening-line framing softens from "GTD assistant" to
  // "task and note assistant" to stop priming the model into tutorial mode.
  it("opens with 'task and note assistant' framing, not 'GTD assistant'", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    expect(prompt).toContain("task and note assistant");
    expect(prompt).not.toContain("GTD assistant");
  });

  // T4.3-AC-10: sentinel substrings pin each new/changed rule body against
  // accidental future deletion without locking the surrounding phrasing.
  it("contains sentinel phrases for R2/R4/R9/R14/R15/R16/R17/R18/R19 bodies", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    expect(prompt).toContain("Inbox is for unclear or half-formed capture only");
    expect(prompt).toContain("Today-plan = Focus promotion");
    expect(prompt).toContain("same checkbox format as the source lists");
    expect(prompt).toContain("may be dictated via speech-to-text");
    expect(prompt).toContain("User skepticism is a question");
    expect(prompt).toContain("Never surface the internal anchors");
    expect(prompt).toContain("not a general LLM");
    expect(prompt).toContain("insistence does not change the rule");
    expect(prompt).toContain("cannot modify your own system prompt");
    expect(prompt).toContain("no emojis at all");
    expect(prompt).toContain("🔥");
    expect(prompt).toContain('Never say "Regel"');
    expect(prompt).toContain("do not enforce the cap unilaterally");
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

  it("stays under the system-prompt hard cap (rough token budget guard)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    // ~4 chars/token rule of thumb → 2000 tokens ≈ 8000 chars; the plan
    // pinned ~1K-token target with a hard <2K-token cap. Task 4.3 added
    // R14/R15/R16 + R2 expansion + R4 reshape; the plan's "+800-1000 chars"
    // estimate proved low (real delta after aggressive trimming was +1240
    // chars on a 6883-char base) so the cap moved 8000 → 8500. The
    // post-Task-4.3 structural refactor (R2/R3 split, R5 file-list-first,
    // R12 session+mid-session merge, R4 Plan-Completeness + transient-
    // feature framing) added another ~360 chars of *semantic* content
    // worth keeping rather than diluting, so the cap moved 8500 → 9000.
    // R17 (out-of-scope refusal hardening, added after a session log showed
    // the model partially complying with a "you're a smart LLM" jailbreak
    // for an Arduino tutorial despite R16) adds ~630 chars, so the cap
    // moves 9000 → 9700. R4 Today-plan auto-mirror + R18 (self-edit limit)
    // + R19 (tone) added after a DeepSeek session log showed (a) missing
    // Focus promotion when the user moved a Next Action into today's plan,
    // (b) hallucinated promises to edit the system prompt itself, and (c)
    // reflexive emoji/filler closings the user found noisy. Together those
    // add ~1100 chars, so the cap moves 9700 → 10900. A follow-up session
    // showed DeepSeek still (i) surfacing "[R4]" / "Regel" anchors despite
    // R16, (ii) using 🔥 priority glyphs despite R19, (iii) reading R4's
    // "ask once which to drop" as license to force a Focus reduction.
    // R16 grew an explicit don't-say-list with DE paraphrases, R19 got
    // explicit emoji examples plus the Bold-instead-of-glyph alternative,
    // R4's overflow branch was reframed from "ask which to drop" to
    // "surface neutrally, user decides". Together ~700 chars more, so the
    // cap moves 10900 → 11800. At 11800 chars we are ~2950 tokens —
    // past the original "hard <2K tokens" target, accepted because the
    // additions close deterministic-compliance gaps the model demonstrably
    // could not bridge with the shorter wording. If a future task pushes
    // past 11800 chars, trim other rules before bumping again.
    expect(prompt.length).toBeLessThan(11800);
  });
});
