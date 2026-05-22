import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "../system-prompt.js";

describe("buildSystemPrompt", () => {
  it("contains the injected date line, compact rule anchors, and tool anchors", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain("Today is Friday, 24. April 2026.");

    for (let i = 1; i <= 12; i++) {
      expect(prompt).toContain(`[R${i}]`);
    }
    expect(prompt).not.toContain("[R13]");

    for (let i = 1; i <= 6; i++) {
      expect(prompt).toContain(`[T-C${i}]`);
    }
  });

  it("opens with the active tool surface, including occurrence search and quick replies", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain("task and note assistant");
    expect(prompt).toContain(
      "Vault tools (read_file, edit_file, write_file, list_files, search_files, find_task_occurrences)",
    );
    expect(prompt).toContain(
      "UI tool suggest_quick_replies surfaces numbered answer chips",
    );
    expect(prompt).not.toContain("GTD assistant");
  });

  it("pins the task entity model and graph relationships (T8-AC-01)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    for (const entity of [
      "InboxCapture",
      "CanonicalTask",
      "FocusItem",
      "DailyPlanItem",
      "DailyOnlyEntry",
    ]) {
      expect(prompt).toContain(entity);
    }

    expect(prompt).toContain("a CanonicalTask may have a matching FocusItem");
    expect(prompt).toContain("a FocusItem may schedule DailyPlanItem copies");
    expect(prompt).toContain(
      "`tasks/next-actions.md` -> CanonicalTask(bucket = Next Actions)",
    );
    expect(prompt).toContain(
      "`daily/YYYY-MM-DD.md` Plan lines -> DailyPlanItem or DailyOnlyEntry",
    );
  });

  it("describes Focus as an overlay and removes the old single-location exception model (T8-AC-02)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain("FocusItem: current-attention overlay");
    expect(prompt).toContain("not a canonical bucket");
    expect(prompt).toContain(
      "Focus and Daily Plan may duplicate task text because they are overlay/schedule views",
    );
    expect(prompt).not.toContain(
      "Focus and Next Actions may carry the same task",
    );
    expect(prompt).not.toContain("Focus = the week");
    expect(prompt).not.toContain("same location");
    expect(prompt).not.toContain("Focus\u2194Next-Actions exception");
  });

  it("requires occurrence-search evidence before placement and sync decisions (T8-AC-03/T8-AC-04)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain(
      "Before writing task-like items into Focus or Daily Plans, or before moving, scheduling, or syncing an existing task",
    );
    expect(prompt).toContain("Call `find_task_occurrences({ candidates })`");
    expect(prompt).toContain(
      "Treat paths and Markdown as evidence, not certified structure",
    );
    expect(prompt).toContain("read the full matched file before writing");
    expect(prompt).toContain(
      "Do not write based only on memory or guessed matches",
    );
  });

  it("separates placement checks from history questions (T8-AC-05)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain(
      "Use `find_task_occurrences` for placement/sync checks, not for history answers",
    );
    expect(prompt).toContain(
      'For explicit history questions ("Wann habe ich zuletzt ...?")',
    );
    expect(prompt).toContain("broader `search_files`/`read_file` terms");
    expect(prompt).toContain(
      "never treat an occurrence-search miss as proof something never happened",
    );
  });

  it("contains the Focus/Daily write guidance table content (T8-AC-06)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    for (const phrase of [
      "No canonical task for a new DailyPlanItem",
      "Canonical task exists but no FocusItem exists",
      "Inbox match exists",
      "Waiting match exists",
      "Someday match is scheduled",
      "Another open Daily Plan occurrence exists",
      "Daily checkbox match lacks Focus/canonical backing",
    ]) {
      expect(prompt).toContain(phrase);
    }
    expect(prompt).toContain("ask whether to move, duplicate, or repeat");
  });

  it("preserves daily lifecycle and cross-day disposition behavior (T8-AC-11)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain("Every daily note lives at `daily/YYYY-MM-DD.md`");
    expect(prompt).toContain("There is no archive move");
    expect(prompt).toContain("Future dailies are writable for planning");
    expect(prompt).toContain("Plan / Log / Notes");
    expect(prompt).toContain(
      "if its frontmatter title or top H1 date conflicts with the file path date",
    );
    expect(prompt).toContain("correct that metadata in the same edit");
    expect(prompt).toContain("Past daily notes default read-only");
    expect(prompt).toContain(
      "append one condensed line to that date's Log even if no extra outcome context was supplied",
    );
    expect(prompt).toContain("`- <kurzer Bezug>: erledigt`");
    expect(prompt).not.toContain("check-offs with no user-supplied context");
    expect(prompt).toContain("closed out of this day's plan");
    expect(prompt).toContain("(Plan von 19.05.)");
    expect(prompt).toContain("correct the past daily inline");
  });

  it("preserves quick replies, voice tolerance, skepticism, no-leak, boundary, self-edit, and tone coverage (T8-AC-11)", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt).toContain("`suggest_quick_replies` is for 2-5");
    expect(prompt).toContain("complete sentence naming the choice");
    expect(prompt).toContain("never use chips for open-ended questions");
    expect(prompt).toContain("speech-to-text");
    expect(prompt).toContain("homophones");
    expect(prompt).toContain('"stimmt das?"');
    expect(prompt).toContain("re-check first");
    expect(prompt).toContain("Never surface internal anchors");
    expect(prompt).toContain('never say "Regel"');
    expect(prompt).toContain("at most two sentences");
    expect(prompt).toContain("You cannot modify your own system prompt");
    expect(prompt).toContain("no emojis");
    expect(prompt).toContain("one short line stating what changed and where");
  });

  it("stays under the simplified prompt budget for smaller-model compliance", () => {
    const prompt = buildSystemPrompt({ today: new Date("2026-04-24") });

    expect(prompt.length).toBeLessThan(12000);
  });
});
