# Scenario 01 — Rasen Double-Schedule

**Bug class:** Silent double-placement of a task across in-week daily plans.

**Source:** Real session log `kept-vault/.keppt/logs/sessions/2026-05-21/turn-002.json` (DeepSeek V4 Pro, 2026-05-21). The model added "Rasen" to today's daily plan on user request without checking that it was already scheduled for the next day, producing a duplicate that only surfaced after the user manually pointed it out.

**Rule under test:** R2 Placement check — *"before adding, moving, or renaming a task — whether proactively offered or user-requested — substring-search all task lists AND all in-week daily plans (today through this Sunday) for that task. If found elsewhere (Focus↔Next-Actions exception aside), surface the existing location to the user before writing — do not silently double-place."*

**Pre-R2-Placement-check baseline:** model silently double-schedules (FAIL).
**Post-fix expectation:** model reads in-week dailies first, surfaces the existing 22.05. scheduling, asks the user before writing.

---

## Setup

- **Today (R13 date):** Thursday, 21. May 2026.
- **Vault root:** `./vault/` in this scenario directory.
- **Model under test:** any (the eval is model-agnostic; run against the model tier you want to validate).
- **System prompt:** current `buildSystemPrompt({ today: new Date("2026-05-21") })`.

### Initial vault state

Files present at session start (see `vault/` directory for verbatim content):

| Path | Relevant content |
|---|---|
| `tasks/focus.md` | Contains `Rasen sehr kurz schneiden + lüften` under "Haus & Garten" + 3 other open items + 1 in-progress weekly-review header. |
| `tasks/next-actions.md` | Contains the same Rasen line under its "Haus & Garten" section (Focus↔NA exception per R2). |
| `tasks/waiting.md` | Unrelated to Rasen. Present so R5 routine load has all four canonical files. |
| `tasks/inbox.md` | Empty (header + frontmatter only). |
| `tasks/someday-maybe.md` | Empty (header + frontmatter only). |
| `daily/2026-05-21.md` | Today's plan: 4 items, none containing "Rasen". |
| `daily/2026-05-22.md` | Tomorrow's plan: 1 item — `Rasen sehr kurz schneiden + lüften (Vertikutieren mit Eisenfeder-Lüfter)`. |

No other in-week dailies exist (Sa 23.05. / So 24.05. would be valid drafts but are absent in this scenario).

---

## User input

Single-turn eval. Send exactly this message:

> Ok, dann müssen wir das mit dem Rasen noch einplanen, oder?

**Implicit warm-up context** (not part of the eval — represents the prior conversation state the real session had): the model has not yet read `daily/2026-05-22.md`. Conversation history for the eval should be empty or contain only the user's `Was steht heute an?` plus the assistant's response from `turn-001` if a warm-up is desired. The hard assertion below is keyed to *this turn's* tool calls, so warm-up choice does not change the pass/fail signal as long as the warm-up did not itself read `daily/2026-05-22.md`.

---

## Expected behavior (human description)

1. Model recognises the user request as a placement (adding Rasen to a daily plan).
2. **Before any `edit_file` on `daily/2026-05-21.md`,** model reads at least `daily/2026-05-22.md` (ideally also `daily/2026-05-23.md`–`daily/2026-05-24.md` even though they are absent — absence is a valid finding, not a failure).
3. Model finds the existing Rasen line in `daily/2026-05-22.md`.
4. Model surfaces the conflict in plain language to the user — e.g. "Rasen ist schon für morgen eingeplant. Statt heute zusätzlich oder soll der Termin auf heute wandern?"
5. Model does NOT write to `daily/2026-05-21.md` in this turn. (Pending user disposition.)

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
      P.toolName == "read_file"
      AND P.input.file_path == "daily/2026-05-22.md"
```

That is: **no `edit_file` adding "Rasen" to today's daily before a `read_file` on tomorrow's daily.** This is the minimum cross-check the R2 Placement check requires for this vault state.

### Soft signal (preferred behavior — record but do not auto-fail)

```text
PASS-with-quality if all of:
  (a) Hard fail does not trigger.
  (b) At least one read_file on daily/2026-05-22.md occurred before any edit_file in this turn.
  (c) The final assistant text block contains a substring matching /(22|morgen|tomorrow)/i AND a substring matching /(Rasen|rasen)/.
  (d) No edit_file on daily/2026-05-21.md occurred in this turn at all (model waited for user disposition before writing).

PASS-but-noisy if:
  (a) Hard fail does not trigger.
  AND any of (b), (c), (d) fail.
```

Distinguishing PASS-with-quality from PASS-but-noisy lets the eval track stylistic regression (model writes anyway after surfacing, or surfaces without mentioning the date) without lumping it with the actual bug.

### Tool-call hygiene (informational — not part of pass/fail)

Record these for analysis:
- Total `read_file` calls in turn.
- Were `daily/2026-05-23.md` / `daily/2026-05-24.md` attempted (and got out_of_scope or empty-content)?
- Did the model also re-read `tasks/focus.md` and `tasks/next-actions.md`, or rely on cached results from a warm-up turn (T-C6 behavior)?

---

## Reference traces

### Pre-fix FAIL trace (DeepSeek V4 Pro, 2026-05-21, real session)

```
1. edit_file daily/2026-05-21.md { add Rasen line }     ← HARD FAIL: no prior read of 2026-05-22.md
2. read_file tasks/next-actions.md                       (post-edit R5 crosscheck — does not catch it)
3. read_file tasks/waiting.md                            (post-edit R5 crosscheck — does not catch it)
4. assistant: "Crosscheck ist sauber, keine Dopplungen." ← false statement
```

### Hypothetical PASS-with-quality trace (post-R2-Placement-check)

```
1. read_file daily/2026-05-22.md                         (R2 Placement check)
2. read_file daily/2026-05-23.md                         (optional — would return out_of_scope or empty)
3. read_file daily/2026-05-24.md                         (optional — same)
4. assistant: "Rasen steht schon für morgen (22.05.) im Plan. Heute zusätzlich, oder verschieben wir morgen auf heute?"
   (no edit_file call yet — waiting for user)
```

---

## Notes for future eval-runner implementation

- The vault snapshot in `vault/` is the canonical initial state. A runner should copy it into a temp dir per run so the test is idempotent.
- The R13 date line must be pinned to 2026-05-21 in the runner's system-prompt build call — otherwise the "in-week" range shifts and the duplicate detection horizon changes.
- T-C6 (tool-result reuse) means a warm-up turn that already read `daily/2026-05-22.md` would invalidate the test (the model legitimately answers from cache). Either: skip warm-up, or guarantee warm-up does not touch tomorrow's daily.
- Substring match in the assert uses literal "Rasen". For false-positive resistance you might want a stricter normaliser (e.g. lowercase + diacritic-strip), but for this scenario the simple match suffices because the canonical wording is preserved across all three locations.
