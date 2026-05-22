# Task 8 - Task-model prompt rewrite + placement evals

### Task

Rewrite the task prompt and task-file reminder around a compact entity model and the `find_task_occurrences` evidence loop, with placement eval coverage for smaller-model compliance.

### Status

DONE

### Files Modified

- `packages/core/src/system-prompt.ts` (modified) - replaced the accumulated R1-R21 prompt with a shorter R1-R12 structure centered on `InboxCapture`, `CanonicalTask`, `FocusItem`, `DailyPlanItem`, and `DailyOnlyEntry`; added the explicit occurrence-search evidence loop and Focus/Daily write decisions.
- `packages/core/src/tools.ts` (modified) - replaced `TASK_FILE_REMINDER` with an item-scoped graph reminder that reuses occurrence/read evidence and explicitly avoids routine-loading Focus, Next Actions, Waiting, and today's daily as the primary safety procedure.
- `packages/core/src/__tests__/system-prompt.test.ts` (modified) - replaced old R-anchor/single-location/crosscheck sentinels with Task 8 entity-model, occurrence-search, history-separation, write-guidance, and regression-preservation assertions.
- `packages/core/src/__tests__/tools.test.ts` (modified) - updated reminder exact-value coverage and added negative assertions against the old routine-read and `R5 crosscheck` wording.
- `packages/core/src/__tests__/request-builder.test.ts` (modified) - updated the prompt smoke assertion for the compact R1-R12 contract and the active `find_task_occurrences` tool surface.
- `docs/evals/scenario-01-rasen-double-schedule/README.md` (modified) - updated the Rasen regression from in-week routine daily checking to the Task 8 occurrence-search contract, requiring the assistant to ask whether to move, duplicate, or repeat before writing.
- `docs/evals/scenario-02-task-model-placement/README.md` (new) - added a placement matrix for Inbox-only, Inbox-plus-drift, canonical-without-Focus, Focus-without-canonical, Daily-checkbox-without-backing, Waiting, Someday, daily-only context, explicit history question, plain completion-log, and daily-metadata-drift cases.

### Files Read (Context Only)

- `docs/work/main/plan.md` - preamble and Task 8 block during `/start-task 8`.
- `docs/work/main/task-log/task-7-find-task-occurrences.md` - direct predecessor; confirmed the occurrence tool shape and the open reminder handoff to Task 8.
- `docs/work/main/task-log/task-4.3-tool-reminder-and-prompt-sharpening.md` - context for the old `TASK_FILE_REMINDER` and R-rule prompt structure.
- `docs/work/main/task-log/task-5-daily-gate-unification.md` - context for daily lifecycle, Log capture, and cross-day disposition behavior that had to survive the rewrite.
- `docs/work/main/task-log/task-6-quick-replies.md` - context for active `suggest_quick_replies` prompt behavior.
- `docs/evals/scenario-01-rasen-double-schedule/vault/*` - inspected existing Rasen fixture shape before updating the eval README.

### Key Decisions

1. **Simplify instead of append.** The prompt was intentionally restructured from 21 numbered rules to 12 topic rules so smaller models such as DeepSeek V4 have one placement model to follow instead of conflicting historical wording.
2. **Entity graph replaces "single location + exception".** Focus and Daily Plan are now described as overlay/schedule views, while only Next Actions, Waiting, and Someday are canonical buckets. This removes the old Focus/Next-Actions exception framing that made Focus look canonical.
3. **Occurrence search is the placement gate.** Risky Focus/Daily placement, scheduling, moving, and syncing now route through `find_task_occurrences({ candidates })`, followed by raw-block inspection and targeted matched-file reads only when needed.
4. **History questions are separate.** The prompt explicitly sends "Wann habe ich zuletzt ...?" style questions to `search_files`/`read_file`, preventing bounded placement misses from becoming false historical negatives.
5. **Reminder became item-scoped.** `TASK_FILE_REMINDER` no longer names broad routine reads. It asks the model to validate only touched items, reuse current evidence, and ask/report drift instead of guessing.
6. **Eval docs emphasize smaller-model failure modes.** The new placement matrix is documentation-first so it can be manually replayed or later automated without re-reading the spec.
7. **Completion keeps a daily trail.** Post-review of the 2026-05-22 DeepSeek V4 manual run showed that a plain "LinkedIn ist fertig" check-off updated task files but skipped the Daily Log because R8 still required extra outcome context. R8 now logs every user-declared completion to the relevant date with a generic `erledigt` fallback when no richer context exists.
8. **Daily metadata drift is now corrected opportunistically.** The same manual run showed `daily/2026-05-23.md` containing `title: 2026-05-22` / `# 2026-05-22`; DeepSeek noticed the mismatch while adding a tomorrow item but chose not to fix it. R6 now says to correct frontmatter/H1 date metadata in the same edit when touching a daily note.

### Test Evidence

- `pnpm --filter @gtd/core test -- --run packages/core/src/__tests__/system-prompt.test.ts packages/core/src/__tests__/tools.test.ts packages/core/src/__tests__/request-builder.test.ts` - passed. Because of Vitest argument forwarding in this workspace, this ran the full core suite: 16 files, 289 tests.
- `pnpm -r test` - passed:

```text
Scope: 2 of 3 workspace projects
packages/core test$ vitest run
packages/core test: Done
apps/cli test$ vitest run
apps/cli test: Done
```

- `pnpm -r typecheck` - passed:

```text
Scope: 2 of 3 workspace projects
packages/core typecheck$ tsc -p tsconfig.json --noEmit
packages/core typecheck: Done
apps/cli typecheck$ tsc -p tsconfig.json --noEmit
apps/cli typecheck: Done
```

- `pnpm exec prettier --check packages/core/src/system-prompt.ts packages/core/src/tools.ts packages/core/src/__tests__/system-prompt.test.ts packages/core/src/__tests__/tools.test.ts packages/core/src/__tests__/request-builder.test.ts docs/evals/scenario-01-rasen-double-schedule/README.md docs/evals/scenario-02-task-model-placement/README.md` - passed:

```text
Checking formatting...
All matched files use Prettier code style!
```

- `pnpm exec prettier --check docs/work/main/task-log/task-8-task-model-prompt-rewrite.md` - passed.

- Manual acceptance text checks with `rg` confirmed the eval docs cover all Task 8 placement cases and that old routine-crosscheck/single-location prompt wording is absent from production prompt/reminder text.

### Acceptance Coverage

- **T8-AC-01:** passed - `system-prompt.test.ts > pins the task entity model and graph relationships` asserts all five entity names and CanonicalTask/FocusItem/DailyPlanItem relationships.
- **T8-AC-02:** passed - `system-prompt.test.ts > describes Focus as an overlay...` asserts Focus is not a canonical bucket and the old Focus/Next-Actions exception wording is absent.
- **T8-AC-03:** passed - `system-prompt.test.ts > requires occurrence-search evidence...` asserts `find_task_occurrences({ candidates })` before Focus/Daily placement, scheduling, moving, or syncing decisions.
- **T8-AC-04:** passed - the same prompt test asserts raw blocks are evidence, not certified structure, and matched files are read when raw evidence is insufficient.
- **T8-AC-05:** passed - `system-prompt.test.ts > separates placement checks from history questions` asserts history questions use broader `search_files`/`read_file` and not occurrence-search negative evidence.
- **T8-AC-06:** passed - `system-prompt.test.ts > contains the Focus/Daily write guidance table content` pins all required findings and actions.
- **T8-AC-07:** passed - `tools.test.ts > TASK_FILE_REMINDER carries the task-graph evidence reminder` asserts the new reminder and negative-checks the old routine-read / `R5 crosscheck` wording.
- **T8-AC-08:** passed - `system-prompt.test.ts`, `tools.test.ts`, and `request-builder.test.ts` were updated to remove old routine-crosscheck/single-location expectations and pin the new entity wording.
- **T8-AC-09:** passed - `docs/evals/scenario-02-task-model-placement/README.md` covers Inbox-only, Inbox-plus-drift, canonical-without-Focus, Focus-without-canonical, Daily-checkbox-without-backing, Waiting, Someday, daily-only context, explicit history question, plain completion-log, and daily-metadata-drift cases; scenario 01 covers Rasen double-schedule.
- **T8-AC-10:** passed - `docs/evals/scenario-01-rasen-double-schedule/README.md` now requires asking whether to move, duplicate, or repeat when occurrence search returns the future Daily Plan hit.
- **T8-AC-11:** passed - `system-prompt.test.ts > preserves daily lifecycle...` and `system-prompt.test.ts > preserves quick replies...` assert daily lifecycle, daily metadata correction, completion Log capture, cross-day disposition, quick replies, voice tolerance, skepticism, no-rule-leak, out-of-scope, self-edit, and tone behavior.
- **T8-AC-12:** passed - `pnpm -r test` is green for core and CLI.

### Open Issues

None for Task 8.

### Context for Next Task

- `buildSystemPrompt({ today })` now emits R1-R12, not R1-R21. Tests and future prompt work should target topic behavior rather than restoring old anchor numbers.
- `TASK_FILE_REMINDER` remains attached to successful canonical-file writes/edits, but its semantics are item-scoped and evidence-driven; it should not be expanded back into broad routine reads without a regression reason.
- Placement/sync safety now depends on the model using `find_task_occurrences({ candidates })` for one task-like item at a time and reading matched files only when raw blocks are insufficient.
- The new eval matrix is documentation-only; a future eval runner can turn `docs/evals/scenario-02-task-model-placement/README.md` cases into executable traces.

### Git State

`git diff --stat`:

```text
 .../scenario-01-rasen-double-schedule/README.md    | 108 ++++----
 .../scenario-02-task-model-placement/README.md     |  81 ++++++
 .../core/src/__tests__/request-builder.test.ts     |  11 +-
 packages/core/src/__tests__/system-prompt.test.ts  | 307 ++++++++-------------
 packages/core/src/__tests__/tools.test.ts          |  38 ++-
 packages/core/src/system-prompt.ts                 | 176 ++++--------
 packages/core/src/tools.ts                         |  26 +-
 7 files changed, 334 insertions(+), 413 deletions(-)
```

`git status --short`:

```text
 M docs/evals/scenario-01-rasen-double-schedule/README.md
AM docs/evals/scenario-02-task-model-placement/README.md
 M packages/core/src/__tests__/request-builder.test.ts
 M packages/core/src/__tests__/system-prompt.test.ts
 M packages/core/src/__tests__/tools.test.ts
 M packages/core/src/system-prompt.ts
 M packages/core/src/tools.ts
?? docs/work/main/task-log/task-8-task-model-prompt-rewrite.md
```
