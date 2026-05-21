import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "../system-prompt.js";

describe("buildSystemPrompt", () => {
  // T4-AC-01 (revised by T4.3-AC-08 and Task 5): every R1..R21 anchor present
  // + the R13 date line in the German-leaning "Today is Friday, 24. April
  // 2026" format the plan pins. R14/R15/R16 added in Task 4.3. R17–R19 added
  // mid-redesign (out-of-scope refusal, self-edit limit, tone). R20 (Log-
  // section capture) + R21 (Cross-day disposition) added by Task 5 to cover
  // the narrative side of completions and cross-day task closeouts.
  it("contains all 21 R-rule anchors and the R13 date line", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain("Today is Friday, 24. April 2026.");

    for (let i = 1; i <= 21; i++) {
      const anchor = `[R${i}]`;
      expect(prompt).toContain(anchor);
    }
  });

  // T4.3-AC-09: opening-line framing softens from "GTD assistant" to
  // "task and note assistant" to stop priming the model into tutorial mode.
  it("opens with 'task and note assistant' framing, not 'GTD assistant'", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    expect(prompt).toContain("task and note assistant");
    expect(prompt).toContain(
      "UI tool suggest_quick_replies surfaces numbered answer chips",
    );
    expect(prompt).not.toContain("GTD assistant");
  });

  // T4.3-AC-10: sentinel substrings pin each new/changed rule body against
  // accidental future deletion without locking the surrounding phrasing.
  it("contains sentinel phrases for R2/R4/R9/R14/R15/R16/R17/R18/R19 bodies", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    expect(prompt).toContain(
      "Inbox is for unclear or half-formed capture only",
    );
    // R4 promotion semantics widened from today-only to current ISO
    // week 2026-05-21 after observing the asymmetry with R4
    // Plan-Completeness (already week-scoped). The new heading + the
    // canonical justification sentence are both pinned so neither side
    // drifts back to today-only by accident.
    expect(prompt).toContain("Week-plan = Focus promotion");
    expect(prompt).not.toContain("Today-plan = Focus promotion");
    // 2026-05-21 (late): R4 Plan-Completeness pulled out of the stale
    // "today-only" semantics into week-scope (matching R4 Promotion),
    // and R11 gained the "Was steht diese Woche an?" → Focus mapping
    // that was the missing lookup half. Both pinned so a future drift
    // surfaces here, not in another live frustration session.
    expect(prompt).toContain(
      "offer open Focus items not yet scheduled into ANY daily plan in the current ISO week",
    );
    // 2026-05-21 (Placement-check pass): anti-double-scheduling moved
    // out of R4 into R2 as a procedural Placement check that covers
    // both proactive offers and user-initiated adds. Sentinel pins
    // the new R2 clause; R4 now delegates duplicate detection via
    // "Duplicate detection runs through R2's Placement check".
    expect(prompt).toContain("Placement check");
    expect(prompt).toContain("do not silently double-place");
    expect(prompt).toContain(
      "Duplicate detection runs through R2's Placement check",
    );
    expect(prompt).not.toContain('Scheduled* currently = "in today\'s plan"');
    expect(prompt).toContain('"What\'s on this week?"');
    expect(prompt).toContain("Focus = the week");
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

  // T5-AC-09: R6 carries the past-default-read-only + future-writable + first-
  // write Plan/Log/Notes scaffolding wording. R11 names the chip tool.
  it("contains sentinel phrases for the Task-5 R6 rewrite and chip-tool hint (T5-AC-09)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    expect(prompt).toContain("Past daily notes default read-only");
    expect(prompt).toContain("Future daily notes are writable for planning");
    expect(prompt).toContain("three sections (Plan / Log / Notes)");
    expect(prompt).toContain("suggest_quick_replies");
    expect(prompt).not.toContain("server-side"); // archive-move claim removed
  });

  // T6-AC-08: Task 6 ships the tool, so the R11 wording switches from
  // Task-5's forward-looking "when available" hint to active terminal-tool
  // instructions.
  //
  // 2026-05-21 (afternoon): chips moved to a schema-enforced
  // { question, options } shape — the model can no longer reach the
  // terminal with chips-only because `question` is required. The prompt
  // therefore drops the "HARD RULE: prose first" soft constraint and
  // instead pins (a) the required-question contract and (b) the
  // informational-listing carve-out that cheap models kept missing.
  it("describes suggest_quick_replies as an active terminal tool (T6-AC-08)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    expect(prompt).toContain("yes/no, accept/decline/defer");
    expect(prompt).not.toContain("When this tool is available");
    expect(prompt).toContain(
      "`question` field is required and becomes the prose line",
    );
    expect(prompt).toContain("complete sentence naming the choice you offer");
    expect(prompt).toContain(
      'listing questions like "Was steht morgen an?"',
    );
  });

  // T5-AC-11: R20 (Log-section capture) — completion + user-supplied context
  // = one Log line; carve-outs for the three NOT-log cases.
  it("contains sentinel phrases for R20 Log-section capture (T5-AC-11)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    expect(prompt).toContain("[R20]");
    expect(prompt).toContain("Log-section capture");
    expect(prompt).toContain("Condense the user's wording");
    expect(prompt).toContain(
      "pure structural moves between lists with no outcome",
    );
    expect(prompt).toContain("check-offs without any user-supplied context");
    expect(prompt).toContain("status updates without completion");
  });

  // T5-AC-12: R21 (Cross-day disposition) — three-step disposition, semantic
  // note on Daily-Plan [x] vs tasks/* [x], R6 exception for "doch gestern".
  it("contains sentinel phrases for R21 Cross-day disposition (T5-AC-12)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });
    expect(prompt).toContain("[R21]");
    expect(prompt).toContain("Cross-day disposition");
    expect(prompt).toContain("closed out of this day's plan");
    expect(prompt).toContain("R6 exception");
    expect(prompt).toContain("(Plan von");
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
    // cap moves 10900 → 11800. Task 5 (2026-05-20) rewrites R6 to drop
    // the archive-move claim (-180 chars), adds the chip-tool line to R11
    // (+340 chars), and adds R20 (Log capture, +590 chars) + R21 (Cross-
    // day disposition, +870 chars). Net ~+1620 chars, so the cap moves
    // 11800 → 14400. Empirical delta on the post-edit prompt: 14250 chars
    // against the prior 11697 baseline (+2553 chars; R6 net trim landed
    // smaller than estimated because the new wording added more content
    // than the dropped archive sentence removed, R20+R21 both ran longer
    // than the rough estimate). At ~3563 tokens we are well past the
    // original "hard <2K tokens" target — accepted because the additions
    // close narrative-side compliance gaps (Log section, cross-day
    // closeouts) that the model cannot bridge from shorter wording, and
    // the cap-raise pattern is the documented norm for prompt-sharpening
    // tasks (see Task 4.3 Open Issue #1). Plan amendment recommended:
    // T5-AC-13 says "target ~1K, hard cap <2K" — both literals stale.
    // 2026-05-21: R11 strengthened with "HARD RULE: prose first, chips
    // second" + the WHY/HOW/WHETHER carve-out to stop empty-prose chip
    // calls observed on gpt-5.4-mini @ reasoningEffort=high (+261 chars).
    // Cap moves 14400 → 14800 with headroom for one more incremental
    // sharpening before the next consolidation pass.
    // 2026-05-21 (later same day): R4 promotion widened from today-only
    // to current ISO week (+233 chars), closing the asymmetry with R4
    // Plan-Completeness which was already week-scoped. Cap moves
    // 14800 → 15100. Next sharpening pass should consider an R-rule
    // consolidation rather than another cap bump.
    // 2026-05-21 (evening): R11 chip section simplified (–~120 chars
    // after the schema-enforced { question, options } shape made the
    // soft "prose first" prose obsolete), R3/R5/R21 reworded so Done =
    // check off `[x]` in place rather than remove (+~260 chars; closes
    // the long-standing asymmetry where R3/R5 said "remove on done"
    // but R8 said "tidy `[x]` at Weekly Review"). Net +~140 chars.
    // Cap moves 15100 → 15400.
    // 2026-05-21 (late evening): R4 Plan-Completeness pulled into
    // week-scope (+~360 chars: full re-statement of the scheduled-in-
    // any-in-week-daily lookup and the no-double-scheduling carve-out),
    // R11 examples extended with "Was steht diese Woche an?" →
    // Focus-canonical mapping (+~110 chars). Net +~470 chars. Cap
    // moves 15400 → 16000. The R-rule consolidation pass is now
    // overdue — the prompt has gained ~5000 chars over two weeks of
    // pain-driven sharpening.
    // 2026-05-21 (consolidation pass): R16 anchor range bug fixed
    // ([R19] → [R21] now that R20/R21 exist), Done-clause centralized
    // to R3 (R5 + R21 step 2 reference it via "(per R3)"), R4
    // editorializing trimmed (substring-match implementation note,
    // week-commitment gloss, full DE overflow example), R19 glyph
    // list reduced to only 🔥 (still pinned). Net -~629 chars (real:
    // 16000 → 15371). Cap moves 16000 → 15500 with ~129-char
    // headroom.
    // 2026-05-21 (Placement-check pass): R2 extended with a
    // procedural Placement-check counterpart to the single-location
    // invariant — before any add/move/rename of a task, the model
    // must substring-search all task lists AND all in-week dailies
    // and surface duplicates before writing. Triggered by a real
    // session where the model double-scheduled "Rasen" because R4's
    // anti-double-scheduling clause only bound the proactive-offer
    // flow, leaving user-initiated adds uncovered. R4's substring-
    // match how-to and "do NOT offer ... double-scheduling" sentence
    // removed (subsumed by R2 Placement check). Net +~286 chars
    // (real: 15403 → 15689). Cap moves 15500 → 15800.
    expect(prompt.length).toBeLessThan(15800);
  });
});
