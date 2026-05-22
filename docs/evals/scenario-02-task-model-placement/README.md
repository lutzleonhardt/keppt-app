# Scenario 02 - Task-Model Placement Matrix

**Bug class:** prompt-following failures around Inbox drift, missing backing,
Waiting/Someday planning, daily-only context, and history questions.

**Purpose:** This matrix exercises the Task 8 entity model without requiring
the evaluator to read the product spec. Each case is a single-turn manual or
runner replay against a fresh copy of the listed vault snippets.

**System prompt date:** Friday, 22. May 2026.

**Common files unless overridden:**

```markdown
# tasks/inbox.md

# tasks/focus.md

# tasks/next-actions.md

# tasks/waiting.md

# tasks/someday-maybe.md

# daily/2026-05-22.md

## Plan

## Log

## Notes
```

For cases that involve placement, the preferred first task-evidence call is:

```json
{ "candidates": ["<literal user task>", "<close variant>"] }
```

The model should inspect returned raw blocks, read matched files only when the
block is insufficient, and ask rather than guess when the graph is inconsistent.

---

## Case A - Inbox Match Only

**Setup override:**

```markdown
# tasks/inbox.md

- [ ] Steuerunterlagen sortieren
```

**User input:**

> Plan Steuerunterlagen sortieren fuer heute ein.

**Expected behavior:**

- Calls `find_task_occurrences` before any Focus/Daily write.
- Detects an InboxCapture with no canonical bucket.
- Does not add directly to Focus or daily.
- Asks which canonical bucket/process result applies, or proposes moving it to
  Next Actions before scheduling.

**Fail if:** the turn writes the item into `tasks/focus.md` or
`daily/2026-05-22.md` while it remains only in Inbox.

---

## Case B - Inbox Plus Existing Drift

**Setup override:**

```markdown
# tasks/inbox.md

- [ ] Steuerunterlagen sortieren

# tasks/next-actions.md

## Finanzen

- [ ] Steuerunterlagen sortieren

# tasks/focus.md

- [ ] Steuerunterlagen sortieren

# daily/2026-05-22.md

## Plan

- [ ] Steuerunterlagen sortieren
```

**User input:**

> Nimm Steuerunterlagen sortieren in den heutigen Plan auf.

**Expected behavior:**

- Calls `find_task_occurrences`.
- Reports that the item already appears in Inbox plus canonical/Focus/Daily
  surfaces.
- Does not write a new duplicate.
- Asks whether to clean up the Inbox drift or leave state unchanged.

**Fail if:** the assistant silently says it is already planned without
mentioning the Inbox drift, or writes another occurrence.

---

## Case C - Canonical Without Focus Planned Into Daily

**Setup override:**

```markdown
# tasks/next-actions.md

## Haus

- [ ] Kellerregal bestellen
```

**User input:**

> Kellerregal bestellen mache ich heute.

**Expected behavior:**

- Calls `find_task_occurrences`.
- Sees CanonicalTask in Next Actions and no FocusItem.
- Adds the item to `tasks/focus.md` and today's Daily Plan in the same change,
  unless Focus overflow requires a user choice.

**Fail if:** the daily write happens without adding Focus, or the model asks
whether Focus is needed despite no overflow.

---

## Case D - Focus Without Canonical Backing

**Setup override:**

```markdown
# tasks/focus.md

- [ ] Kellerregal bestellen
```

**User input:**

> Plane Kellerregal bestellen fuer heute.

**Expected behavior:**

- Calls `find_task_occurrences`.
- Detects a FocusItem without CanonicalTask backing.
- Reports drift and asks whether to create/process the canonical task before
  scheduling.

**Fail if:** it adds the daily item directly.

---

## Case E - Daily Checkbox Without Backing

**Setup override:**

```markdown
# daily/2026-05-22.md

## Plan

- [ ] Kellerregal bestellen
```

**User input:**

> Kellerregal bestellen soll in Focus.

**Expected behavior:**

- Calls `find_task_occurrences`.
- Treats the existing daily checkbox as possible drift because no Focus or
  canonical backing exists.
- Asks before repairing, unless the user explicitly says it was a one-off
  scratch item outside the task system.

**Fail if:** it silently creates Focus or canonical backing.

---

## Case F - Waiting Item Planned

**Setup override:**

```markdown
# tasks/waiting.md

- [ ] Antwort von Mueller wegen Mietvertrag
```

**User input:**

> Plane Mietvertrag heute ein.

**Expected behavior:**

- Calls `find_task_occurrences`.
- Finds the Waiting item.
- Asks whether the blocker is gone, or proposes creating a follow-up task such
  as "Mueller wegen Mietvertrag nachfassen".

**Fail if:** it treats the blocked item as directly actionable and schedules it.

---

## Case G - Someday Reactivation

**Setup override:**

```markdown
# tasks/someday-maybe.md

- [ ] Balkon bepflanzen
```

**User input:**

> Balkon bepflanzen kommt heute dran.

**Expected behavior:**

- Calls `find_task_occurrences`.
- Treats scheduling as reactivation.
- Moves/promotes the item into Next Actions and Focus before adding the Daily
  Plan item, or asks if the destination category is unclear.

**Fail if:** it only writes the daily item while the canonical task stays in
Someday.

---

## Case H - Daily Non-Checkbox Context

**Setup override:**

```markdown
# daily/2026-05-22.md

## Plan

- 11:45 Hautarzt
- Notiz: Kellerregal Lieferung moeglich
```

**User input:**

> Plane Kellerregal bestellen fuer heute.

**Expected behavior:**

- Calls `find_task_occurrences`.
- Treats the non-checkbox note as DailyOnlyEntry context by default, not task
  drift.
- Still creates/processes canonical and Focus backing before a task-like Daily
  Plan checkbox.

**Fail if:** it blocks scheduling solely because the non-checkbox note matched.

---

## Case I - Explicit History Question

**Setup override:**

```markdown
# daily/2026-05-10.md

## Log

- Kellerregal: bestellt bei Baumarkt

# daily/2026-05-22.md

## Plan

## Log

## Notes
```

**User input:**

> Wann habe ich zuletzt das Kellerregal bestellt?

**Expected behavior:**

- Uses `search_files` and targeted `read_file` over the broader daily surface.
- Does not use `find_task_occurrences` as negative evidence.
- Answers from the found history with the concrete date.

**Fail if:** it says nothing was found because active placement occurrence
search returned no current task hit.

---

## Case J - Plain Completion Writes Daily Log

**Setup override:**

```markdown
# tasks/next-actions.md

## Work

- [ ] LinkedIn-Intro-Industry umstellen

# tasks/focus.md

- [ ] LinkedIn-Intro-Industry umstellen

# daily/2026-05-22.md

## Plan

- [ ] LinkedIn-Intro-Industry umstellen

## Log

## Notes
```

**User input:**

> LinkedIn ist fertig.

**Expected behavior:**

- Checks off the matching task in today's Daily Plan and in the legitimate
  task-graph surfaces.
- Adds a concise line to today's `## Log`, even though the user supplied no
  extra outcome context, e.g. `- LinkedIn-Intro: erledigt`.
- Does not require the user to provide a result/detail before writing the Log.

**Fail if:** the task is checked off in Daily/Focus/Next Actions but
`daily/2026-05-22.md` receives no `## Log` entry for the completion.

---

## Case K - Daily Path Metadata Drift

**Setup override:**

```text
# daily/2026-05-23.md

---
title: 2026-05-22
---

# 2026-05-22

## Plan

- [ ] Rasen sehr kurz schneiden + lueften

## Log

## Notes
```

**User input:**

> Plan morgen Lina zum Tierarzt ein.

**Expected behavior:**

- Reads or otherwise targets `daily/2026-05-23.md` for the tomorrow plan.
- Notices that the frontmatter title and top H1 disagree with the file path.
- Corrects those metadata fields to `2026-05-23` in the same edit that adds the
  new plan entry.

**Fail if:** the plan entry is added while `title: 2026-05-22` or
`# 2026-05-22` remains in `daily/2026-05-23.md`.

---

## Related Scenario

The existing Rasen double-schedule regression lives in
`docs/evals/scenario-01-rasen-double-schedule/README.md`. It covers the tenth
Task 8 placement case: an existing future DailyPlanItem must make the assistant
ask whether to move, duplicate, or repeat before adding a second open Daily Plan
occurrence.
