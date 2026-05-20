# Task 5 — Daily-note gate unification + GTD task-file init + R6/R20/R21 prompt update

**Date:** 2026-05-20
**Plan:** `docs/plans/phase-1-cli.md` — Task 5

## Task

Replace the previously-planned daily-archive flow (`daily/` →
`archive/daily/` move + open-checkbox stripping) with a single
unified rule: any `daily/YYYY-MM-DD.md` (past, today, future)
is readable and writable through one gate predicate; the
"past dailies default read-only" stance moves out of the
filesystem layer and into a prompt-soft rule (R6 with a
correction carve-out). Cross-day task carry-over moves out of
silent file mutation into the explicit Auto-Replan-Opener
(Task 7). Adds a one-shot startup `ensureGtdTaskFiles` helper
so the five canonical `tasks/*.md` files exist before the
first turn touches them. Adds a `GTD_NOW_OVERRIDE` env hook
for Task-8 day-rollover reproducibility. Adds two new prompt
rules — **R20** (Log-section capture: completion-with-context
gets a single condensed Log line) and **R21** (Cross-day
disposition: three-step closeout when today's action lands on
a past daily's `[ ]`, with the `[x]` semantic note that
Daily-Plan `[x]` ≠ `tasks/*` `[x]`).

## Status

**DONE**

## Files Modified

- `packages/core/src/gtd-layout.ts` (modified) — `canRead` /
  `canWrite` / `isInActiveScope` accept any date-formatted
  `daily/YYYY-MM-DD.md` regardless of `today`. `today` stays
  in the signatures (still used by other layout entries in
  the future) but is unused for the `daily/*` branch — flagged
  with `_today` in TS. `canRead("archive/daily/<date>.md")`
  flipped from `true` to `false` (dead surface after redesign;
  legacy vaults with `archive/daily/` content stop being
  surfaced through the LLM gate). `isInArchiveScope` regex
  preserved exactly so the search-scope plumbing has a shape
  for future non-daily archive subpaths. `isCanonicalTaskFile`
  unchanged — the Task-4.3 reminder gate remains today-only by
  design (past-daily writes are corrections, not crosscheck
  triggers). **Followup session 2026-05-20:** added
  `isPastDaily(filePath, today)` predicate — returns `true`
  only for date-formatted dailies strictly before today.
  Pure helper, no `validateFilePath` side effect (called
  after `canWrite` has already validated). Used by the
  `writeFileTool` R6 hard guard (see `tools.ts`); not used
  by `editFileTool`, so R6's narrow-correction carve-out
  and R21's three-step disposition still land. `canWrite`
  doc-comment updated to point at the new guard.
- `packages/core/src/vault-readiness.ts` (new) — exports
  `ensureGtdTaskFiles(repo)` + `GTD_TASK_FILES` constant. For
  each of the five `tasks/*.md`, reads to check existence;
  on `FileNotFoundError`, writes an empty file with summary
  `"first-run task-file init"`. Idempotent on second call.
  Helper is repo-agnostic — the caller is responsible for
  passing a repo whose `changedBy` is `"system"`.
- `packages/core/src/system-prompt.ts` (modified) — R6
  rewritten: archive-move sentence dropped; past-dailies
  default-read-only with correction carve-out; future
  dailies writable for planning; first-write into an empty
  future draft scaffolds the three sections (Plan / Log /
  Notes); cross-day carry-over routed through the explicit
  Auto-Replan-Opener (Task 7). R1's data-model table row for
  `daily/YYYY-MM-DD.md` reworded from "today only" to "per
  date (past, today, future)". R11 picked up a "**Quick
  replies (`suggest_quick_replies`).**" paragraph in
  forward-looking framing ("When this tool is available…")
  so the model doesn't attempt a Task-6 tool that doesn't
  exist yet. **R20** (Log-section capture) and **R21**
  (Cross-day disposition) appended after R19, before
  `## Tool conventions`. File-top doc-comment bumped
  R1–R19 → R1–R21 with a Task-5 redesign note.
- `packages/core/src/tools.ts` (modified) — `list_files`
  description reworded to "5 task files, any date-formatted
  daily note under daily/" (was "today's daily note, archived
  dailies"). `search_files` description reworded to
  explicitly call `archive` scope "reserved for future
  non-daily archived paths and currently empty". The
  `TASK_FILE_REMINDER` constant and reminder semantics are
  untouched. **Followup session 2026-05-20:** `writeFileTool`
  gained the R6 hard guard — after `canWrite` succeeds, calls
  `isPastDaily(filePath, today)` and returns `out_of_scope`
  with the message `Past daily '<path>' cannot be rewritten
  via write_file; use edit_file for narrow corrections (R6).`
  The block is `write_file`-only by design: `editFileTool`
  intentionally does NOT consult `isPastDaily`, preserving R6's
  correction carve-out and R21's `(Plan von DD.MM.)` flow.
  Import line picked up `isPastDaily`.
- `packages/core/src/index.ts` (modified) — re-export
  `ensureGtdTaskFiles`, `GTD_TASK_FILES`, and
  `EnsureGtdTaskFilesResult`.
- `apps/cli/src/turn-loop.ts` (modified) — added
  `export function readTurnClock()` that honours
  `GTD_NOW_OVERRIDE` (ISO timestamp). Integrated at
  `refs.turnNow = readTurnClock()`. Empty / malformed env
  values silently fall back to `new Date()`. Read fresh per
  turn so unsetting the env mid-process returns to wall
  clock without restart.
- `apps/cli/src/index.ts` (modified) — imports
  `ensureGtdTaskFiles`. After `repo` construction and before
  the REPL loop, constructs a parallel `systemRepo` handle
  (same `vaultPath`, same `now`, same `logger`, but
  `changedBy: "system"`) and awaits `ensureGtdTaskFiles`.
  Per-vault one-shot — no per-turn surface.

### Tests

- `packages/core/src/__tests__/gtd-layout.test.ts` (modified)
  — `canRead`, `canWrite`, `isInActiveScope` blocks rewritten
  for T5-AC-01..03 (past/today/future all true). Added an
  explicit `isInArchiveScope("daily/<date>.md") === false`
  assertion. Kept the legacy archive/daily regex-match test
  (predicate shape preserved) but added an explanatory inline
  comment that the LLM-gate `canRead` denies those paths
  regardless. Block count 18 → 21. **Followup session
  2026-05-20:** new `isPastDaily` describe-block with 3
  cases (strictly-past true; today/future false; non-daily
  paths false). Test count 21 → 24.
- `packages/core/src/__tests__/vault-readiness.test.ts` (new)
  — three tests: T5-AC-06 (creates exactly five empty files
  with `changedBy: "system"` and summary
  `"first-run task-file init"`), T5-AC-07 (second call is a
  full no-op), T5-AC-08 (existing content preserved; only
  missing files created).
- `packages/core/src/__tests__/system-prompt.test.ts`
  (modified) — R-loop bound bumped 19 → 21; R-anchor test
  renamed. Three new test cases: T5-AC-09 (R6 rewrite +
  `suggest_quick_replies` mention; explicit
  `not.toContain("server-side")` to pin the archive-move
  claim is gone), T5-AC-11 (R20 sentinel block), T5-AC-12
  (R21 sentinel block). Char-cap moved 11800 → 14400 (post-
  edit length 14250); inline comment-block extended with
  the Task-5 delta breakdown and a "T5-AC-13 literal is
  stale" note.
- `packages/core/src/__tests__/tools.test.ts` (modified) —
  Four cases adjusted to match the new gate. The Codex-
  regression "leaky stub" test (line ~292) drops the
  `archive/daily/2026-04-30.md` expectation — that path is
  now postfiltered too. The UTC-rollover test repurposed
  from "tool clock keeps the turn-day daily visible" to
  "neither daily is dropped by repo/tool clock disagreement"
  (both `daily/2026-05-08.md` and `daily/2026-05-09.md` are
  now active-scope regardless of which clock leads). The
  "buildTools honors the injected clock" test repurposed
  from gate-by-today to reminder-by-today (write to today's
  daily attaches `reminder`; write to past daily succeeds
  without reminder). The `list_files` matrix updated for
  T5-AC-04: past/today/future dailies all listed,
  `archive/` prefix returns `[]`. T4.3-AC-05 retitled and
  inverted to "future daily succeeds without reminder"
  (`ok: true`, no `reminder` field). **Followup session
  2026-05-20:** added "write_file against a past daily is
  blocked, edit_file still works" — pins `out_of_scope` on
  the write attempt with `TrapRepository` (no repo write
  observed) and `ok: true` on the parallel `edit_file`
  correction. The clock-injection test's past-daily branch
  was redirected from `write_file` to `edit_file` (since
  `write_file` now hard-blocks past dailies; the clock-flow
  guarantee for the reminder gate still holds via
  `edit_file`). Test count 19 → 20.
- `packages/core/src/__tests__/file-repository.contract.ts`
  (modified) — "search respects active/archive/all scope"
  test rewritten: past dailies now appear in active scope
  alongside today's. Added an inline note on the
  `archive/daily/<date>.md` divergence between `canRead`
  (denies) and the repo's `isInArchiveScope` (still
  matches) — repo-level contract still holds because the
  tool-layer postfilter is the cross-layer safety net.
- `apps/cli/test/turn-loop.test.ts` (new) — five tests
  covering T5-AC-10: env set returns ISO-parsed Date, env
  unset / empty / malformed all fall back to wall clock,
  fresh read per call (unset mid-session returns to wall
  clock). Imports the exported `readTurnClock` directly so
  the test doesn't have to spin up the full `handleTurn`
  pipeline.

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — Task 5 block
  (lines 1240-1321), preamble + Tasks-at-a-glance
  (lines 1-46).
- `docs/task-log/task-4.3-tool-reminder-and-prompt-sharpening.md`
  — direct predecessor. Confirmed: (a) prompt lives at
  `packages/core/src/system-prompt.ts` (plan's
  `apps/cli/src/minimal-prompt.ts` is stale), (b) R-numbering
  reached R16 in 4.3 then was extended to R19 in mid-redesign
  commits `f5cc320` / `887648f` *after* 4.3's wrap-up but
  *before* the plan-redesign commit `df9c543` — the plan's
  "R17/R18" labels for the new rules collided with shipped
  R-rules; resolved by renumbering to R20/R21. (c) Task 4.3
  Open Issue #5 ("past-daily editability deferred to Task 5")
  explicitly handed the requirement to this task.
- `packages/core/src/{tools,in-memory-file-repository,
  local-file-repository,file-repository,search,system-prompt,
  index}.ts` and `apps/cli/src/{index,turn-loop}.ts` — to
  locate the seams the redesign needs to touch.
- `packages/core/src/__tests__/{gtd-layout,system-prompt,
  tools}.test.ts` and
  `packages/core/src/__tests__/file-repository.contract.ts`
  — to understand the existing assertion patterns before
  rewriting them.
- `docs/specs/architecture.md` (lines 1022, 1041) — the
  spec's amendment after the Task-5 redesign confirms
  `changedBy: "system"` is the contract for first-run
  task-file init, and that the daily-archive move is gone.

## Key Decisions

1. **New rules numbered R20 / R21, not R17 / R18.** The plan
   text (commit `df9c543`, 2026-05-20 15:50) labels the two
   new rules R17 and R18, but commits `f5cc320` (2026-05-20
   11:32, R17 = out-of-scope refusal) and `887648f`
   (2026-05-20 14:41, R18 = self-edit limit, R19 = tone)
   landed those numbers *before* the plan-redesign commit
   was written. The plan author was renumbering to a state
   that no longer existed. Two options were considered:
   (a) shift R17/R18/R19 up to R19/R20/R21 and let the new
   rules claim R17/R18 as the plan said, or (b) extend the
   chain to R20/R21 for the new rules. (b) chosen — option
   (a) would churn three shipped rule anchors that are
   already pinned by `system-prompt.test.ts` sentinels, plus
   any external references in turn artifacts, with no
   semantic benefit. The file-top doc-comment captures the
   collision so the next prompt-modifying task knows about
   it. **Plan amendment recommended:** the plan's R17/R18
   labels in Task 5 (and the cross-references in Task 5's
   ACs) should be patched to R20/R21 — see Open Issue #1.

2. **`archive/daily/*` flipped from `canRead === true` to
   `false`.** The plan said `isInArchiveScope` survives "for
   future non-daily archive subpaths"; what it didn't pin
   was whether the LLM gate still treats legacy
   `archive/daily/*.md` files as readable. Keeping them
   readable would have been a contract-stale surface — the
   prompt no longer points at them and no future code path
   writes to them. Flipping `canRead` to `false` makes the
   directory truly dead: the gate denies it, the tool-layer
   postfilter drops snippets, and `list_files` doesn't
   enumerate it. The predicate `isInArchiveScope` keeps its
   regex so search-scope plumbing has a shape, but
   tools.test.ts's "leak through search" regression now
   asserts archive/daily snippets *are* filtered out.
   Cross-layer consequence: the repo-level scope predicates
   (`isInScope` via `isInArchiveScope`) and the gate
   (`canRead`) deliberately diverge for that path. Captured
   inline in `file-repository.contract.ts`'s "search does
   not surface content from paths denied by canRead" test
   so a future reader doesn't try to "fix" the inconsistency
   at the repo layer.

3. **T-C3 left untouched.** Plan didn't list T-C3 as a Task
   5 touchpoint, but its wording ("the path is permanently
   unwritable/unreadable under the GTD layout") sounded
   suspect after past-daily writability moved to the prompt
   side. Audited: T-C3 is correct for the paths that still
   return `out_of_scope` — non-allowlisted task files
   (`tasks/random.md`), non-date dailies (`daily/notes.md`),
   `archive/daily/*` (now dead), `archive/tasks/*`, top-level
   files. Those are all permanently denied. T-C3 simply no
   longer applies to past dailies because past dailies are
   no longer out-of-scope. No edit needed.

4. **`suggest_quick_replies` added to R11 with forward-
   looking framing, not added to the opening sentence's
   tool list.** AC-09 requires the literal string in the
   prompt. Adding it to the opening sentence's tool list
   ("read_file, edit_file, …, suggest_quick_replies") would
   tell Haiku the tool is available — and Task 6 hasn't
   shipped it yet. Result would be tool-not-found errors in
   the stream during Phase-1 dogfooding. Compromise: a
   one-paragraph mention in R11 framed as "When this tool is
   available and the next user step has 2–5 discrete,
   anticipatable answers, call it…". Task 6 should flip the
   framing to active language ("call `suggest_quick_replies`
   when…") when the tool actually ships. The opening
   sentence stays accurate for Phase-1 tool surface.

5. **`isCanonicalTaskFile` stays today-only.** The reminder
   gate triggers the `TASK_FILE_REMINDER` salience hint
   (Task 4.3) only on writes to the five `tasks/*.md` and
   *today's* daily. With past-daily writability now allowed,
   the temptation is to extend the reminder to any daily.
   Rejected — the reminder's purpose is to drive the R5
   crosscheck against today's source-of-truth lists, which
   is a "build today's plan" loop. A correction on a past
   daily (R6 carve-out) or an Auto-Replan deferral (R21) is
   not a crosscheck trigger; reminding the model to re-read
   Focus / Next Actions in that context would be off-target
   nudging. Predicate signature stays unchanged; new
   `tools.test.ts` "future daily succeeds without reminder"
   case pins the contract.

6. **`readTurnClock` exported for unit-test access.** The
   env-override branch is one line inside `handleTurn`'s
   prologue. Two test paths considered: (a) spin up the
   full `handleTurn` with a mock repo / session / logger
   and observe `refs.turnNow` post-call; (b) export the
   helper and unit-test it directly. (b) chosen — the seam
   is single-purpose, the helper has no dependencies, and
   the full-pipeline test would carry incidental setup
   complexity that has nothing to do with what AC-10
   actually asserts (env value flows through to a Date).
   Export keeps the surface honest: the function shows up
   in the module's public API instead of hiding behind
   `handleTurn` as a private detail.

7. **Char-cap moved 11800 → 14400 with extended comment
   block, not aggressive trimming.** R6 rewrite was a net
   add (the archive-move drop was smaller than the new
   wording about past-default-read-only + future-writable
   + first-write Plan/Log/Notes scaffolding). R11 chip-tool
   line added ~340 chars. R20 added ~590 chars. R21 added
   ~870 chars. Empirical post-edit length: 14250 chars
   against a pre-edit 11697 baseline (+2553). Trimming to
   stay under 11800 would have meant cutting either the
   semantic carve-outs in R20 (the three NOT-log cases) or
   the R21 three-step disposition, both of which are
   designed to disambiguate cases that *will* come up in
   real usage (the user's Gassi / Wäsche workflow that
   motivated R20+R21 in the first place). Cap raised
   instead, comment block carries the new delta breakdown
   and an explicit "T5-AC-13's `<2K tokens` literal is now
   stale" note. Matches the precedent set in Task 4.3
   (Open Issue #1, char-cap bump 8000 → 8500 → 9000 with
   plan-amendment-recommended).

8. **Test-update strategy: rewrite assertions, don't
   delete tests.** Five existing tests in `tools.test.ts`
   and `file-repository.contract.ts` had assertions that
   contradicted the new gate (past dailies denied, archive/
   daily readable, today-only daily-gate). Rejected
   approach: delete the tests as no-longer-applicable.
   Chosen: rewrite each to assert the *new* contract. Two
   reasons: (a) the tests' test names still describe
   real cross-layer guarantees (clock injection still
   matters, leak-through-search still must be prevented),
   they just need updated truth tables; (b) deleting them
   would leave silent gaps in the regression net — a future
   Task 5.x ish that re-introduces date filtering could
   slip past with no failing test. Each rewritten test has
   an inline comment naming the redesign and the new
   guarantee, so the next reader can trace why the
   assertion shape changed.

9. **`vault-readiness.ts` takes a `FileRepository`, not a
   `LocalFileRepository`.** The helper writes through the
   repository interface only — no Local-specific behavior.
   Means: (a) the test can use `InMemoryFileRepository`
   without a dance, (b) when Phase 2a moves to Supabase,
   the helper still works against the new repo class
   unchanged, (c) the `changedBy: "system"` actor is the
   caller's contract, not the helper's. CLI startup builds
   a parallel `LocalFileRepository` handle with
   `changedBy: "system"` and the same `now` / `logger`,
   and passes that in. Alternative considered: have the
   helper take a `LocalFileRepository` and a `vaultPath`
   and build the system handle internally. Rejected —
   pushes Phase-1 storage choice into the helper signature.

— session 2026-05-20 (followup)

10. **`write_file` hard-blocks past dailies; `edit_file`
    stays open (R6 carve-out).** Codex adversarial review
    on the working tree flagged R6's prompt-only enforcement
    as a soft guard: with `canWrite` returning `true` for
    any date-formatted `daily/*`, a mistaken model call
    could rewrite historical plans via `write_file` (the
    unbounded full-rewrite path). Two options weighed:
    (a) leave R6 as prompt-only and rely on empirical
    observation per the project's "empirical validation
    over speculative hardening" preference, or (b) add a
    surgical hard guard at the tool layer. Chose (b) only
    because the asymmetry between `write_file` (irreversible
    full overwrite of unbounded content) and `edit_file`
    (narrow anchored search/replace, single-write minimum)
    maps cleanly onto R6's intent — "past dailies are
    default read-only; correct, don't rewrite". The fix
    is ~15 LoC: a pure `isPastDaily(filePath, today)`
    predicate in `gtd-layout.ts`, an early-return guard in
    `writeFileTool` after the existing `canWrite` check,
    and a new test in each layer. `editFileTool` does NOT
    consult `isPastDaily` — that's the carve-out for R6's
    "the user states the task was actually done on the
    past date" exception and R21's three-step disposition.
    `canWrite`'s signature is unchanged (still
    date-agnostic) because the date check belongs alongside
    the today-only reminder logic at the tool layer, not
    in the layout-shape gate. Codex's first finding (legacy
    `archive/daily/*` losing reachability) explicitly
    dismissed for this session — the redesign is unshipped,
    no real vault has legacy archive content. Trade-off
    accepted: `isPastDaily` becomes a second
    layout-aware predicate that future surfaces must keep
    in sync with the `daily/YYYY-MM-DD.md` regex shape —
    cheap because both predicates live in one file.

## Test Evidence

```text
$ pnpm -r typecheck
packages/core typecheck: Done
apps/cli  typecheck:    Done

$ pnpm --filter @gtd/core test
 ✓ src/__tests__/sessions.test.ts                     (14 tests)
 ✓ src/__tests__/turn-log.test.ts                     ( 3 tests)
 ✓ src/__tests__/tool-result-pruning.test.ts          (10 tests)
 ✓ src/__tests__/request-builder.test.ts              (12 tests)
 ✓ src/__tests__/system-prompt.test.ts                ( 9 tests)
 ✓ src/__tests__/edit.test.ts                         (11 tests)
 ✓ src/__tests__/input-validation.test.ts             ( 5 tests)
 ✓ src/__tests__/history-log.test.ts                  ( 2 tests)
 ✓ src/__tests__/gtd-layout.test.ts                   (21 tests)
 ✓ src/__tests__/vault-readiness.test.ts              ( 3 tests)
 ✓ src/__tests__/logging.test.ts                      (10 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts    (60 tests)
 ✓ src/__tests__/retry-budget.test.ts                 ( 8 tests)
 ✓ src/__tests__/local-file-repository.test.ts        (73 tests)
 ✓ src/__tests__/tools.test.ts                        (19 tests)

 Test Files  15 passed (15)
      Tests  262 passed (262)

$ pnpm --filter @gtd/cli test
 ✓ test/turn-loop.test.ts                  ( 5 tests)
 ✓ test/fs-turn-logger.test.ts             ( 4 tests)
 ✓ test/turn-logger-integration.test.ts    ( 9 tests)
 ✓ test/fs-session-store.test.ts           ( 7 tests)
 ✓ test/two-phase-save.test.ts             ( 5 tests)
 ✓ test/cli-errors.test.ts                 ( 3 tests)
 ✓ test/cli-error-log.test.ts              ( 1 test)
 ✓ test/cli-logger.test.ts                 ( 3 tests)
 ✓ test/workspace-wiring.test.ts           ( 2 tests)

 Test Files  9 passed (9)
      Tests  39 passed (39)
```

Net test growth this task:
- Core: 249 → 262 (+13).
  - `gtd-layout.test.ts` 18 → 21 (+3): the new past/today/
    future matrix tests, plus the explicit `isInArchiveScope`
    daily-false assertion.
  - `vault-readiness.test.ts` 0 → 3 (+3): T5-AC-06..08.
  - `system-prompt.test.ts` 6 → 9 (+3): T5-AC-09, T5-AC-11,
    T5-AC-12.
  - `tools.test.ts` 19 → 19 (=): four cases rewritten in
    place (UTC-rollover, clock-injection, list_files matrix,
    T4.3-AC-05 future-daily). No count change because the
    rewrites are 1:1 — same `it()` blocks.
  - `file-repository.contract.ts`: contract-shared; the
    "search respects active/archive/all scope" test
    rewritten in place.
  - (Other +4 from contract-test consumers: in-memory and
    local repos each run the contract, so the rewritten case
    multiplies into both fixture sets.)
- CLI: 34 → 39 (+5): the new `turn-loop.test.ts`.

Post-Task-5 prompt char count: **14250 chars** at the
fixed date `2026-04-24` (against the 14400 cap and the
prior 11697 baseline — delta +2553 chars).

No manual real-API smoke this session. The new prompt
rules (R6 rewrite, R20, R21) are fully testable through
the sentinel string asserts; whether the model honours
R20's "condense, don't paste" and R21's three-step
disposition is the empirical question Task 8's real-API
acceptance run is the natural place to observe. The
`GTD_NOW_OVERRIDE` env hook makes Task 8's day-rollover
scenario reproducible without waiting for actual midnight.

— session 2026-05-20 (followup)

```text
$ pnpm -w build
packages/core build: Done
apps/cli build:      Done

$ pnpm --filter @gtd/core test --run -- gtd-layout tools
 ✓ src/__tests__/gtd-layout.test.ts                   (24 tests)
 ✓ src/__tests__/tools.test.ts                        (20 tests)
 …                                                    (full suite)
 Test Files  15 passed (15)
      Tests  266 passed (266)

$ pnpm --filter @gtd/cli test --run
 …
 Test Files  9 passed (9)
      Tests  39 passed (39)
```

Net deltas vs. the prior session:
- Core: 262 → 266 (+4).
  - `gtd-layout.test.ts` 21 → 24 (+3): the new
    `isPastDaily` describe-block.
  - `tools.test.ts` 19 → 20 (+1): "write_file against a
    past daily is blocked, edit_file still works".
- CLI: 39 → 39 (=).

Cap / token math unchanged (no system-prompt edit this
session). R6 hard-guard is silent in the prompt — the
guard is a tool-layer assert, not a new sentinel.

## Acceptance Coverage

- **T5-AC-01** → passed —
  `gtd-layout.test.ts > canRead > allows past, today, and
  future date-formatted daily notes` (line ~28) plus
  `denies non-date daily files` and the unchanged
  `denies arbitrary directories outside the layout`. The
  `daily/2026-05-09.md` (past), `daily/2026-05-08.md`
  (today), and `daily/2026-06-01.md` (future) cases all
  assert `true`; `daily/notes.md` asserts `false`.
- **T5-AC-02** → passed —
  `gtd-layout.test.ts > canWrite > allows past, today, and
  future date-formatted daily notes` (line ~70). Same three
  dates assert `true`; the archive-deny test (`archive/
  daily/2025-01-01.md`) and non-date deny tests remain.
- **T5-AC-03** → passed —
  `gtd-layout.test.ts > isInActiveScope / isInArchiveScope
  > active scope covers the 5 task files plus any
  date-formatted daily` (line ~92) and
  `isInArchiveScope returns false for daily/*` (line ~115).
  The explicit `isInArchiveScope("daily/2026-05-09.md")
  === false` is pinned.
- **T5-AC-04** → passed —
  `tools.test.ts > list_files returns past, today, and
  future dailies; denies archive + non-allowlisted`
  (line ~427). Seeds past + today + future dailies plus
  out-of-scope paths; asserts result is
  `["daily/2026-05-07.md", "daily/2026-05-08.md",
  "daily/2026-06-01.md", "tasks/inbox.md"]`. Archive prefix
  returns `[]`.
- **T5-AC-05** → passed —
  `file-repository.contract.ts > search respects
  active/archive/all scope across any date-formatted
  daily`. Past (`2026-04-23`) and today (`2026-04-24`)
  dailies seeded; active-scope search returns both.
  `archive` scope still surfaces the archive/daily entry
  (predicate shape preserved); cross-layer leak prevention
  for the gate-vs-archive divergence is asserted by
  `tools.test.ts > search_files filters hits from paths
  denied by canRead`.
- **T5-AC-06** → passed —
  `vault-readiness.test.ts > creates exactly the 5 GTD
  task files as empty strings`. Asserts the five paths
  match `GTD_TASK_FILES`, content empty, five history
  entries with `changedBy: "system"` and summary
  `"first-run task-file init"`.
- **T5-AC-07** → passed —
  `vault-readiness.test.ts > second call is a full no-op`.
  Asserts `result.created === []` and history length
  unchanged.
- **T5-AC-08** → passed —
  `vault-readiness.test.ts > preserves existing file
  content`. Seeds `tasks/inbox.md` with content; calls
  ensureGtdTaskFiles; asserts inbox content survives, only
  four other files created (not five).
- **T5-AC-09** → passed —
  `system-prompt.test.ts > contains sentinel phrases for
  the Task-5 R6 rewrite and chip-tool hint`. Pins
  `"Past daily notes default read-only"`,
  `"Future daily notes are writable for planning"`,
  `"three sections (Plan / Log / Notes)"`,
  `"suggest_quick_replies"`, and the negative-assert
  `not.toContain("server-side")` to confirm the
  archive-move sentence is gone.
- **T5-AC-10** → passed —
  `apps/cli/test/turn-loop.test.ts` (5 tests):
  env-set returns ISO-parsed Date; env-unset / empty /
  malformed all fall back to wall clock; mid-process unset
  returns to wall clock on next call.
- **T5-AC-11** → passed —
  `system-prompt.test.ts > contains sentinel phrases for
  R20 Log-section capture`. Pins `[R20]`,
  `"Log-section capture"`, `"Condense the user's wording"`,
  and the three NOT-log carve-outs (structural moves,
  context-less check-offs, status-without-completion).
- **T5-AC-12** → passed —
  `system-prompt.test.ts > contains sentinel phrases for
  R21 Cross-day disposition`. Pins `[R21]`,
  `"Cross-day disposition"`,
  `"closed out of this day's plan"`, `"R6 exception"`,
  and the `(Plan von` source-date annotation prefix.
- **T5-AC-13** → partial — the AC literal says
  `target ~1K, hard cap <2K` tokens. The char-cap test
  asserts `<14400` (current length 14250, ≈3563 tokens
  at the 4-chars/tk rule of thumb). The R-loop bound
  moved 19 → 21 as the AC said. Intent of the AC
  (no unbounded growth) holds, but the numeric ceiling
  the plan text pins is stale. Same pattern as Task 4.3
  Open Issue #1. See Open Issue #1 below.

## Open Issues

1. **Plan text references R17/R18 for the new rules; code
   shipped them as R20/R21.** The plan-redesign commit
   `df9c543` was written *after* commits `f5cc320` (R17 =
   out-of-scope) and `887648f` (R18 = self-edit, R19 =
   tone), but used the labels R17/R18 for the new
   Log-capture / Cross-day rules, presumably from working
   off a pre-mid-redesign R-numbering. Resolved at
   implementation time by renumbering the *new* rules to
   R20/R21 (cheaper than renumbering three shipped rules).
   Plan text (Task 5 block, lines 1259-1260; preamble
   reference line 41; AC IDs T5-AC-11 and T5-AC-12) should
   be patched to R20/R21 so future task-history reads
   match the code. **(→ plan-cleanup pass; no new task
   needed.)**
2. **T5-AC-13's "<2K tokens" literal is stale.** Char-cap
   test now `<14400` (current 14250 chars ≈ 3563 tokens).
   Cumulative drift across Task 4.3 (already over) and
   Task 5 (R20+R21 added significant determinism content).
   Plan amendment should restate the AC as "no unbounded
   growth, current cap N chars" or drop the numeric
   ceiling and rely on the test's char-cap as the
   authoritative number. **(→ plan-cleanup pass.)**
3. **Plan paths reference `apps/cli/src/minimal-prompt.ts`
   and `apps/cli/src/__tests__/minimal-prompt.test.ts` —
   neither exists.** The actual prompt lives at
   `packages/core/src/system-prompt.ts` with tests at
   `packages/core/src/__tests__/system-prompt.test.ts`.
   Implementation used the real paths. Plan Key Locations
   block should be updated. **(→ plan-cleanup pass.)**
4. **`suggest_quick_replies` is currently named in R11 but
   not implemented as a tool.** R11's forward-looking
   framing ("When this tool is available…") prevents
   Haiku from attempting to call a non-existent tool, but
   Task 6 (chip tool) needs to flip the wording to active
   language when shipping the tool. **(→ Task 6.)**
5. **R20 / R21 empirical validation deferred to Task 8.**
   The sentinel-string ACs prove the rules are in the
   prompt; whether the model actually honours "condense,
   don't paste" for Log entries (R20) and the three-step
   disposition (R21) — including the source-date
   annotation `(Plan von 19.05.)` — is observable only in
   real API turns. Task 8's day-rollover scenario, now
   reproducible via `GTD_NOW_OVERRIDE`, is the natural
   acceptance surface. **(→ Task 8.)**
6. **Tool-description tweaks in `tools.ts` (list_files,
   search_files) are unverified against the cache-stability
   harness.** Tool descriptions are part of the cached
   prompt prefix on Anthropic. The two changes here
   (~120 chars net) are byte-edits to the tool-set
   serialization. Cache-stability is asserted indirectly
   by every `tools.test.ts` + `workspace-wiring.test.ts`
   pass, but no explicit cache-write delta was measured.
   First real-API session post-commit should sanity-check
   `prompt.cache_usage` JSONL for an unexpected cache-write
   spike on turn 1 vs turn 2. Cheap to observe; flagging so
   it isn't forgotten. **(→ first dogfooding session
   post-commit.)**
7. **No XC-NN cross-cutting AC references picked up.** The
   Task 5 block does not name any `XC-NN` IDs, so the
   plan-end Cross-Cutting Acceptance section was not
   loaded (per `/start-task` workflow point 4 on the XC
   gate). Same pattern as Task 4.3 Decision #7.

## Context for Next Task

- **The daily-note gate is now date-agnostic for
  `daily/YYYY-MM-DD.md`.** All four predicates (`canRead`,
  `canWrite`, `isInActiveScope`, `isCanonicalTaskFile`'s
  *non-daily* branch) accept any valid daily date.
  `isCanonicalTaskFile` remains today-only for the reminder
  gate — past-daily writes don't trigger
  `TASK_FILE_REMINDER`. New consumers (Task 6 chip tool,
  Task 7 Auto-Replan-Opener) should use the unified gate
  via `canRead`/`canWrite` and not re-implement date
  checks. The signature `(filePath, today)` is preserved
  so non-daily layout entries (tasks/*, future archive
  subpaths) can still use the parameter.

- **R6 has a hard guard in addition to the prompt rule:
  `isPastDaily` + `writeFileTool` early-return.** The
  asymmetry is intentional — `write_file` (full rewrite)
  is blocked on past dailies, `edit_file` (anchored
  search/replace) is not. Task 7 Auto-Replan-Opener can
  apply the R21 three-step disposition through `edit_file`
  without tripping the guard. If Task 7 ever needs a path
  to overwrite a past daily wholesale (e.g. structured
  reflow), do not weaken the guard — add a new tool or a
  scoped escape hatch instead, so the R6 contract surface
  stays explicit. The predicate is `gtd-layout.ts`
  `isPastDaily(filePath, today)`, exported alongside
  `canRead`/`canWrite`.

- **`isInArchiveScope` is a vestigial predicate.** Its
  regex still matches legacy `archive/daily/<date>.md`
  files but `canRead` denies them — the predicate exists
  for future non-daily archive subpaths. Do NOT
  re-introduce a daily-archive flow on top of this
  predicate; the redesign deliberately routes carry-over
  through the explicit Auto-Replan-Opener (Task 7).

- **`ensureGtdTaskFiles(repo)` is the canonical first-run
  init.** Idempotent, repo-agnostic, takes a
  `FileRepository`. Caller passes a repo built with
  `changedBy: "system"` so the history reflects who
  created the files. The CLI calls it once after
  `LocalFileRepository` construction, before the REPL.
  Phase 2a (Supabase) will reuse the same helper against
  a `SupabaseFileRepository` instance — no per-storage
  branch needed.

- **`readTurnClock()` is exported from
  `apps/cli/src/turn-loop.ts`.** Honours
  `GTD_NOW_OVERRIDE=<ISO>` for the whole process; falls
  back to wall clock on unset / empty / malformed.
  Read fresh per turn — set/unset takes effect on the
  next turn. Task 8's day-rollover scenario uses this
  directly; Task 6 / Task 7 dev loops can use it to
  reproduce time-sensitive cases without waiting.

- **R20 / R21 work together; R6's correction carve-out
  is the third leg.** Four real cases the trio covers:
  (a) same-day completion *with* context → R20 Log line
  in today's daily, R5 crosscheck against tasks/* —
  reminder fires (today's daily is canonical).
  (b) same-day completion *without* context → no Log
  line (R20's `check-offs without any user-supplied
  context` carve-out), just the check-off + crosscheck.
  (c) cross-day disposition (completion / deferral /
  cancellation acted on today against a past `[ ]`) →
  R21 three-step: past `[ ]` → `[x]`, tasks/* update,
  today's Log with `(Plan von DD.MM.)`. No reminder
  (past daily is not canonical), but R5 still applies
  to the tasks/* update.
  (d) past-date completion the user forgot to check off
  ("hab ich gestern doch noch gemacht") → R6 exception
  + R21's escape clause: correct the past daily inline,
  past Log entry, nothing in today's daily.

  All four cases assume the LLM honours the prompt — no
  deterministic enforcement layer ensures it. Task 8 is
  the empirical observation point. The
  `daily/<übermorgen>.md` future-write path is
  unexercised by these four cases — that's pre-scheduling
  territory (Task 5.6 in the old plan, now folded into
  the unified gate but with no behaviour test beyond
  T5-AC-04/05).

- **Char budget headroom is ~150 chars (14250 / 14400).**
  Each subsequent prompt-modifying task either trims
  existing content or bumps the cap. R11's chip-tool
  paragraph (~340 chars) is the most expendable if Task 6
  ships the tool and an external dev-doc carries the
  detailed semantics; trimming it back to a single
  sentence would buy ~250 chars. R21's three example
  bullets (`Wäsche: erledigt / verschoben / gestrichen`)
  are also trimable. Don't bump the cap without naming
  the budget cost.

- **Plan amendment debt is accumulating.** Three plan-text
  issues for this task alone (Open Issues #1-3) plus
  Task 4.3 Open Issues #1 / #4 unresolved. A dedicated
  plan-cleanup pass before Task 8 would be cheap and
  worth doing — Task 8 is the acceptance run and will
  cross-reference every task's ACs.

## Git State

```text
$ git diff --stat
 apps/cli/src/index.ts                                   |  16 ++
 apps/cli/src/turn-loop.ts                               |  24 ++-
 packages/core/src/__tests__/file-repository.contract.ts |  21 ++-
 packages/core/src/__tests__/gtd-layout.test.ts          |  93 ++++++++---
 packages/core/src/__tests__/system-prompt.test.ts       |  75 ++++++--
 packages/core/src/__tests__/tools.test.ts               | 197 ++++++++++++---------
 packages/core/src/gtd-layout.ts                         |  48 +++--
 packages/core/src/index.ts                              |   5 +
 packages/core/src/system-prompt.ts                      |  27 ++-
 packages/core/src/tools.ts                              |  22 ++-
 10 files changed, 382 insertions(+), 146 deletions(-)

$ git status --short
 M apps/cli/src/index.ts
 M apps/cli/src/turn-loop.ts
 M packages/core/src/__tests__/file-repository.contract.ts
 M packages/core/src/__tests__/gtd-layout.test.ts
 M packages/core/src/__tests__/system-prompt.test.ts
 M packages/core/src/__tests__/tools.test.ts
 M packages/core/src/gtd-layout.ts
 M packages/core/src/index.ts
 M packages/core/src/system-prompt.ts
 M packages/core/src/tools.ts
?? apps/cli/test/turn-loop.test.ts
?? packages/core/src/__tests__/vault-readiness.test.ts
?? packages/core/src/vault-readiness.ts
?? docs/task-log/task-5-daily-gate-unification.md
```

**Scope note for `/commit 5`.** Every modified or new file
above is in Task 5 scope. Exact staging list (no `git add -u`
— home-directory dotfiles and `.claude/` overlay are sandbox
artifacts to exclude):

- `apps/cli/src/index.ts`
- `apps/cli/src/turn-loop.ts`
- `apps/cli/test/turn-loop.test.ts`
- `packages/core/src/gtd-layout.ts`
- `packages/core/src/system-prompt.ts`
- `packages/core/src/tools.ts`
- `packages/core/src/vault-readiness.ts`
- `packages/core/src/index.ts`
- `packages/core/src/__tests__/file-repository.contract.ts`
- `packages/core/src/__tests__/gtd-layout.test.ts`
- `packages/core/src/__tests__/system-prompt.test.ts`
- `packages/core/src/__tests__/tools.test.ts`
- `packages/core/src/__tests__/vault-readiness.test.ts`
- `docs/task-log/task-5-daily-gate-unification.md`

Home-directory dotfiles (`.bash_profile`, `.bashrc`,
`.gitconfig`, `.mcp.json`, `.vscode/`, etc.) surfaced by
`git status` are sandbox-overlay artifacts and not part
of this task — omitted from the snapshot.
