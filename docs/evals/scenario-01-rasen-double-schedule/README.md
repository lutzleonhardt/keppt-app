# Scenario 01 — Rasen Double-Schedule

**Bug class:** Silent double-placement of a task across in-week daily plans.

**Source:** Real session log `kept-vault/.keppt/logs/sessions/2026-05-21/turn-002.json` (DeepSeek V4 Pro, 2026-05-21). The model added "Rasen" to today's daily plan on user request without checking that it was already scheduled for the next day, producing a duplicate that only surfaced after the user manually pointed it out.

**Rule under test:** Task-entity placement evidence loop. Before adding a
task-like item to a Daily Plan, call
`find_task_occurrences({ candidates })`, inspect the raw Markdown evidence, and
ask before adding a second open DailyPlanItem when a future Daily Plan hit
already exists.

This is deliberately **not** a broad "read all task files and all dailies"
rule. Focus and Daily Plan lines may duplicate canonical task text because they
are overlay/schedule views. The bug under test is narrower: silently creating a
second open Daily Plan occurrence instead of asking whether to move, duplicate,
or repeat the existing plan item.

**Pre-fix baseline:** model silently double-schedules (FAIL).
**Post-fix expectation:** model calls `find_task_occurrences` before writing,
surfaces the existing 22.05. scheduling, and asks the user whether to move,
duplicate, or repeat before writing.

---

## Setup

- **System prompt date:** Thursday, 21. May 2026.
- **Vault root:** `./vault/` in this scenario directory.
- **Model under test:** any (the eval is model-agnostic; run against the model tier you want to validate).
- **System prompt:** current `buildSystemPrompt({ today: new Date("2026-05-21") })`.

### Initial vault state

Files present at session start (see `vault/` directory for verbatim content):

| Path                     | Relevant content                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `tasks/focus.md`         | Contains `Rasen sehr kurz schneiden + lüften` under "Haus & Garten" + 3 other open items + 1 in-progress weekly-review header.  |
| `tasks/next-actions.md`  | Contains the same Rasen canonical task text under its "Haus & Garten" section; Focus is an overlay, so this duplicate is valid. |
| `tasks/waiting.md`       | Unrelated to Rasen. Present because the pre-Task-8 failure trace loaded it during legacy post-edit checking.                    |
| `tasks/inbox.md`         | Empty (header + frontmatter only).                                                                                              |
| `tasks/someday-maybe.md` | Empty (header + frontmatter only).                                                                                              |
| `daily/2026-05-21.md`    | Today's plan: 4 items, none containing "Rasen".                                                                                 |
| `daily/2026-05-22.md`    | Tomorrow's plan: 1 item — `Rasen sehr kurz schneiden + lüften (Vertikutieren mit Eisenfeder-Lüfter)`.                           |

No other future daily drafts exist in this scenario.

---

## User input

Single-turn eval. Send exactly this message:

> Ok, dann müssen wir das mit dem Rasen noch einplanen, oder?

**Matching asymmetry under test:** the user says only `Rasen`, while the existing
planned line is the longer `Rasen sehr kurz schneiden + lüften (Vertikutieren
mit Eisenfeder-Lüfter)`. A deterministic planner should connect these via
conservative bidirectional substring matching before writing; exact-line-only
matching would miss the bug this scenario exists to catch.

**Implicit warm-up context** (not part of the eval — represents the prior conversation state the real session had): the model has not yet read `daily/2026-05-22.md`. Conversation history for the eval should be empty or contain only the user's `Was steht heute an?` plus the assistant's response from `turn-001` if a warm-up is desired. The hard assertion below is keyed to _this turn's_ tool calls, so warm-up choice does not change the pass/fail signal as long as the warm-up did not itself read `daily/2026-05-22.md` or call occurrence search for Rasen.

---

## Expected behavior (human description)

1. Model recognises the user request as a placement (adding Rasen to a daily plan).
2. **Before any `edit_file` on `daily/2026-05-21.md`,** model calls
   `find_task_occurrences({ candidates: [...] })` for the Rasen task.
3. Model inspects the raw block and finds the existing open Rasen line in
   `daily/2026-05-22.md`.
4. Model surfaces the conflict in plain language to the user, e.g. "Rasen ist
   schon für morgen eingeplant. Soll ich den Termin auf heute verschieben, heute
   zusätzlich eintragen, oder als wiederholten zweiten Einsatz behandeln?"
5. Model does NOT write to `daily/2026-05-21.md` in this turn. (Pending user
   disposition.)

---

## Programmatic asserts

Implementations should record the tool-call sequence for the turn (ordered list of `(toolName, inputJson, resultJson)`). Then:

### Hard fail (MUST not happen)

```text
FAIL if:
  any call C in tool_calls where
    C.toolName == "edit_file"
    AND C.input.file_path == "daily/2026-05-21.md"
    AND C.input.edits[*].replace contains substring "Rasen"
    AND NOT exists a prior call P in tool_calls where
      P.toolName == "find_task_occurrences"
      AND P.input.candidates[*] contains substring "Rasen"
```

That is: **no `edit_file` adding "Rasen" to today's daily before
occurrence-searching for "Rasen".** A direct `read_file` of tomorrow's daily is
not sufficient for this task-model eval because the prompt contract now routes
placement checks through `find_task_occurrences`.

### Soft signal (preferred behavior — record but do not auto-fail)

```text
PASS-with-quality if all of:
  (a) Hard fail does not trigger.
  (b) At least one find_task_occurrences call with a "Rasen" candidate occurred before any edit_file in this turn.
  (c) The final assistant text block contains a substring matching /(22|morgen|tomorrow)/i AND a substring matching /(Rasen|rasen)/ AND a move/duplicate/repeat choice.
  (d) No edit_file on daily/2026-05-21.md occurred in this turn at all (model waited for user disposition before writing).

PASS-but-noisy if:
  (a) Hard fail does not trigger.
  AND any of (b), (c), (d) fail.
```

Distinguishing PASS-with-quality from PASS-but-noisy lets the eval track stylistic regression (model writes anyway after surfacing, or surfaces without mentioning the date) without lumping it with the actual bug.

### Tool-call hygiene (informational — not part of pass/fail)

Record these for analysis:

- Total `find_task_occurrences` and `read_file` calls in turn.
- Did occurrence search cover `daily/2026-05-22.md` in `searchedFiles`?
- Did the model read `daily/2026-05-22.md` after the occurrence block because
  the raw context was insufficient?
- Did the model also read `tasks/focus.md` and `tasks/next-actions.md`, or rely
  on cached results from a warm-up turn (T-C6 behavior)?

---

## Reference traces

### Pre-fix FAIL trace (DeepSeek V4 Pro, 2026-05-21, real session)

```
1. edit_file daily/2026-05-21.md { add Rasen line }     ← HARD FAIL: no prior occurrence search
2. read_file tasks/next-actions.md                       (legacy post-edit routine read — does not catch it)
3. read_file tasks/waiting.md                            (legacy post-edit routine read — does not catch it)
4. assistant: "Crosscheck ist sauber, keine Dopplungen." ← false statement
```

### Hypothetical PASS-with-quality trace (post-fix)

```
1. find_task_occurrences { candidates: ["Rasen", ...] }  (placement evidence)
2. assistant: "Rasen steht schon für morgen (22.05.) im Plan. Soll ich den Termin auf heute verschieben, heute zusätzlich eintragen, oder als wiederholten zweiten Einsatz behandeln?"
   (no edit_file call yet — waiting for user)
```

---

## Notes for future eval-runner implementation

- The vault snapshot in `vault/` is the canonical initial state. A runner should copy it into a temp dir per run so the test is idempotent.
- The system-prompt date must be pinned to 2026-05-21 in the runner's
  `buildSystemPrompt` call; the occurrence-search daily horizon is
  date-dependent.
- T-C6 (tool-result reuse) means a warm-up turn that already read
  `daily/2026-05-22.md` or searched matching task occurrences would invalidate
  the test (the model legitimately answers from cache). Either: skip warm-up,
  or guarantee warm-up does not touch tomorrow's daily / occurrence evidence.
- Substring match in the assert uses literal "Rasen". For false-positive resistance you might want a stricter normaliser (e.g. lowercase + diacritic-strip), but for this scenario the simple match suffices because the canonical wording is preserved across all three locations.
