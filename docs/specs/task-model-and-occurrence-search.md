# Task Model and Occurrence Search Spec

Date: 2026-05-22
Status: design spec for prompt/tool rewrite

## Motivation

The original system prompt encoded task consistency through long procedural
rules: single-location checks, Focus/Daily sync, routine crosschecks, and
duplicate detection. Real sessions showed that model tiers do not apply those
procedures reliably. In particular, a model silently scheduled the same "Rasen"
task into two Daily Plans because it did not inspect tomorrow's daily note
before writing.

This spec replaces prompt-heavy task consistency with:

- a small entity-relationship model the prompt can teach directly;
- one simple occurrence-search tool that behaves like safe literal `rg -C 1`;
- a few operating rules for risky Focus/Daily writes;
- eval scenarios for the cases that small models do not infer reliably.

The goal is less always-on instruction, not more. The prompt should describe the
data model and the few actions where the model must be guided; deterministic
search supplies the evidence.

## Design Principles

- Model the task system as relationships between entities, not as a long list
  of procedural crosschecks.
- Keep the occurrence-search API simple enough for small models to call
  correctly.
- Return raw evidence, not classifier truth. The user can edit Markdown freely,
  so task/open/done/transient status is ultimately interpreted by the model.
- Search before writing task-like items into Focus or Daily Plans.
- Use bounded Daily search by default: recent drift buffer plus all future
  scheduled notes, not full historical archive search.
- If raw search context is insufficient, read the matched files before writing.

## Entity Model

```text
InboxCapture
- Untriaged capture.
- Not canonical.
- Must not have matching Focus or open Daily Plan backing.
- Must be processed into Next Actions, Waiting, or Someday before Focus/Daily
  scheduling.

CanonicalTask
- Exactly one canonical bucket:
  Next Actions | Waiting | Someday.
- This is the task's source-of-truth location while open.

FocusItem
- Current-attention overlay.
- Not a canonical bucket.
- Every open Focus item should match one open CanonicalTask.

DailyPlanItem
- Scheduled checkbox-like Plan item for a date.
- Not a canonical bucket.
- Every open DailyPlanItem should match one open FocusItem and one open
  CanonicalTask.

DailyOnlyEntry
- Non-task Plan context such as appointments, notes, or time blocks.
- Outside the task graph by default.
```

Relationship sketch:

```text
InboxCapture  --process/promote-->  CanonicalTask
CanonicalTask --may have--------->  FocusItem
FocusItem     --may schedule----->  DailyPlanItem

DailyOnlyEntry is outside this graph by default.
```

Storage mapping:

```text
tasks/inbox.md                 -> InboxCapture
tasks/next-actions.md          -> CanonicalTask(bucket = Next Actions)
tasks/waiting.md               -> CanonicalTask(bucket = Waiting)
tasks/someday-maybe.md         -> CanonicalTask(bucket = Someday)
tasks/focus.md                 -> FocusItem
daily/YYYY-MM-DD.md Plan lines -> DailyPlanItem or DailyOnlyEntry,
                                  interpreted from raw Markdown context
```

## Core Constraints

1. An open canonical task appears in exactly one canonical bucket: Next Actions,
   Waiting, or Someday.
2. Inbox is pre-triage. If an Inbox item matches a canonical task, Focus item,
   or Daily Plan task, surface drift and process the Inbox item before writing a
   new Focus/Daily placement.
3. Focus may duplicate task text because it is an overlay, not a bucket.
4. Daily Plan may duplicate task text because it is scheduling, not a bucket.
5. A task-like Daily Plan item should have both Focus and canonical backing.
6. A task should not appear as open in multiple Daily Plans unless the user
   explicitly wants repetition or multiple sessions.
7. Daily-only entries are allowed for appointments, notes, and time blocks.
8. Daily-only checkbox tasks are allowed only when the user explicitly asks for
   a one-off scratch item outside the task system.
9. Completed historical occurrences are context, not blockers for new or
   repeated work.
10. Weekly Review is the maintenance cadence for stale Focus/Daily/Inbox/
    Someday/Waiting state; it is not the definition of Focus.

## Occurrence Search Tool

The occurrence-search tool is intentionally closer to `rg -C 1` than to a
classifier. It searches bounded task-relevant surfaces and returns raw blocks.
It does not decide whether a line is open, done, canonical, transient, or drift.

Input:

```ts
find_task_occurrences({
  candidates: string[]
})
```

Rules:

- `candidates` are literal strings, not regexes.
- The model supplies the literal user wording plus a small set of close
  variants: key nouns/verbs, obvious inflections/stems/compounds, and close
  everyday synonyms.
- The tool OR-searches all candidates with simple normalized matching:
  case-insensitive, whitespace-collapsed, punctuation/Markdown-marker tolerant,
  and umlaut/diacritic tolerant where practical. This is meant to behave like a
  safe literal search, not like model-side regex authoring.
- Implementation note: for diacritic tolerance, use Unicode NFKD normalization
  plus combining-mark stripping before matching.
- Do not expose scope, intent, date range, status, or regex parameters in the
  MVP API.
- A normal call checks one task-like item. For multiple unrelated tasks, make
  one call per task rather than mixing unrelated candidate sets.

Search surfaces:

```text
tasks/inbox.md
tasks/next-actions.md
tasks/waiting.md
tasks/someday-maybe.md
tasks/focus.md
daily/YYYY-MM-DD.md where date >= today - 30 days
all existing future daily/YYYY-MM-DD.md notes
```

Daily files are searched as whole files, not as parsed `## Plan` sections only.
The assistant should create daily notes with `Plan` / `Log` / `Notes`, but the
vault remains free-form Markdown and users may edit structure manually. Daily
matches are therefore heuristic raw evidence: the model must inspect the path
and returned Markdown block before deciding whether the hit is an open
DailyPlanItem, completed/log context, a note, or irrelevant.

The 30-day lookback is a drift buffer for recent missed or leftover planning,
not a history search. A negative result means "not found in the active placement
horizon", not "never existed". For explicit history questions such as "Wann habe
ich zuletzt ...?", use the generic file/search tools over the broader daily
archive and choose more specific search terms to control result volume.

Output:

```ts
{
  searchedFiles: string[],
  blocks: Array<{
    file: string,
    line: number,
    candidates: string[],
    rawBlock: string[]
  }>
}
```

Output rules:

- `line` is the central or first matched line in the block.
- `rawBlock` is a small raw Markdown context block, normally one line before,
  the matched line(s), and one line after.
- If multiple matches fall into the same or overlapping context block, return
  that block once and list all matching candidates for the block.
- If nearby matches produce blocks that overlap or have at most one raw line
  between them, merge them into one larger raw block.
- Return all matched blocks in the bounded search surfaces. Do not add a
  truncation protocol for MVP.
- Do not return derived fields such as `surface`, `date`, `checkbox`,
  `matchReason`, `taskLikeHint`, or `entryKind`; the model can inspect the path
  and raw Markdown.

Example:

```ts
{
  searchedFiles: [
    "tasks/inbox.md",
    "tasks/next-actions.md",
    "tasks/waiting.md",
    "tasks/someday-maybe.md",
    "tasks/focus.md",
    "daily/2026-05-21.md",
    "daily/2026-05-22.md"
  ],
  blocks: [
    {
      file: "daily/2026-05-22.md",
      line: 14,
      candidates: ["Rasen", "Rasen mähen"],
      rawBlock: [
        "## Plan",
        "- [ ] Rasen sehr kurz schneiden + lüften (Vertikutieren mit Eisenfeder-Lüfter)",
        "- [ ] Rindenmulch kaufen"
      ]
    }
  ]
}
```

## Prompt Operating Rules

The system prompt should contain a compact version of the entity model plus only
the following operational rules.

Before writing task-like items into Focus or Daily Plans, or before moving,
scheduling, or syncing an existing task:

1. Build candidates for one task-like item: literal words plus close variants.
2. Call `find_task_occurrences({ candidates })`.
3. Inspect the raw blocks yourself. Treat paths and Markdown as evidence, not as
   certified structure.
4. If the returned block is not enough to judge whether the hit is the same
   task, a completed item, a daily-only entry, or drift, read the full matched
   file before writing. Prefer reading only the files that actually matched.
5. Do not write based only on memory or guessed matches.

Use `find_task_occurrences` for placement/sync checks, not for history answers.
For explicit history questions, use the generic file/search tools instead and
make the query specific enough for broader daily history.

Daily/Focus write guidance:

| Finding from raw blocks | Action before writing |
|---|---|
| No canonical task exists for a new DailyPlanItem | Create or process the canonical task first. |
| Canonical task exists but no Focus item exists | Add Focus as part of the same change unless Focus overflow needs user choice. |
| Inbox match exists | Triage into Next Actions, Waiting, or Someday before Focus/Daily scheduling. If it also appears elsewhere, report drift first. |
| Waiting match exists | Do not treat the original task as directly actionable unless the user says the blocker is gone; planning may mean a follow-up task. |
| Someday match is scheduled | Treat as reactivation; promote/move before scheduling. |
| Another open Daily Plan occurrence exists | Ask whether to move, duplicate, or repeat before adding a second one. |
| Daily checkbox match lacks Focus/canonical backing | Treat as drift unless the user explicitly asked for a one-off scratch item outside the task system; ask before repairing. |

Avoid bulk auditing:

- Do not occurrence-search every Next Action unless the user explicitly asks for
  a full audit or Weekly Review.
- Small active sets such as Focus can be checked item-by-item when planning the
  week/day. Sequential calls are acceptable; provider-level parallel tool use is
  disabled for safety.

## Prompt Rewrite Scope

Replace:

- Single-location placement wording that treats Focus/Daily as possible task
  locations.
- Focus-Daily sync procedures encoded as broad prompt routines.
- Routine crosscheck file-loading as the primary safety mechanism.
- Date-range selection delegated to the model for placement checks.

Keep, but shrink:

- Vault file model and allowed file shapes.
- Inbox capture for unclear items.
- Task checkbox syntax.
- Daily `Plan` / `Log` / `Notes` sections.
- Daily lifecycle: same `daily/YYYY-MM-DD.md` namespace, past-daily correction
  limits, future-daily planning, and first-write section creation.
- Weekly Review as maintenance cadence and review marker.
- Next Actions category/subheading guidance.
- Natural-language command recognition and quick replies for discrete choices.
- Log capture and cross-day disposition.
- Current date line, voice-input tolerance, skepticism means re-check, no
  method/rule leaks, out-of-scope answer limits, self-edit limits, concise tone,
  and low-level tool protocol affordances.

Drop:

- Focus as a weekly bucket or second canonical location.
- Implicit daily-only checkbox tasks.
- Fixed routine loading of Focus / Next Actions / Waiting / today's daily as
  the safety mechanism.
- Historical done/closed occurrences as blockers for new or repeated work.

## Eval Coverage

Existing:

- `docs/evals/scenario-01-rasen-double-schedule/README.md`: prevents silent
  double-scheduling of "Rasen" across Daily Plans.

Needed before removing the old prompt procedures:

- Inbox match only: scheduling requires triage into a canonical bucket first.
- Inbox plus canonical/Focus/Daily match: report drift before writing.
- Canonical task not in Focus is planned into a Daily: add Focus too.
- Focus item without canonical backing: report drift, ask before repairing.
- Daily checkbox without Focus/canonical backing: report drift unless explicit
  scratch intent.
- Waiting item is planned: ask whether blocker is gone or create follow-up.
- Someday item is planned: reactivate/promote before scheduling.
- Daily non-checkbox appointment/note matches candidate: treat as context by
  default, not task drift.
- Explicit history question ("Wann habe ich zuletzt ...?"): use broader generic
  file/search tools, not the active-horizon occurrence search as negative
  evidence.

## Architecture Impact

This is an extension to the original architecture. The first architecture draft
assumed prompt-only R-rules could reliably maintain GTD consistency. Dogfooding
showed that long procedural prompt rules are fragile across model tiers. The
shared core should therefore add `find_task_occurrences` beside the existing
vault tools and rewrite the system prompt around the compact entity model.

The existing tool-result pruning model remains compatible: occurrence-search
results are normal tool results and age out of the model request context after
the K-window, while durable session logs keep the raw results for debugging.
