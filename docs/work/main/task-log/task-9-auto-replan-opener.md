# Task 9 — Auto-Replan-Opener at day boundary

### Task

Add an Auto-Replan opener that runs once per non-empty day boundary, gathers recent planning context, starts a synthetic LLM kickoff turn, and persists a per-day marker so it does not re-fire.

### Status

DONE

### Files Modified

- `packages/core/src/auto-replan.ts` (new) — added `gatherAutoReplanContext(repo, today, daysBack = 5)`, reading recent daily context plus `tasks/next-actions.md` and `tasks/waiting.md` while silently skipping missing files.
- `packages/core/src/__tests__/auto-replan.test.ts` (new) — covers deterministic daily window selection, missing daily skips, and empty-context detection.
- `packages/core/src/sessions.ts` (modified) — added additive `autoReplanRanFor?: string` session state, getter/setter, JSON roundtrip validation, and snapshot rollback for the marker.
- `packages/core/src/__tests__/sessions.test.ts` (modified) — added persistence, validation, and snapshot coverage for `autoReplanRanFor`.
- `packages/core/src/index.ts` (modified) — exported `gatherAutoReplanContext` and `AutoReplanContext`.
- `apps/cli/src/auto-replan-opener.ts` (new) — added `runAutoReplanOpener` and `maybeRunAutoReplanOpener`, including synthetic user-message construction, streaming, quick-reply capture, session persistence, marker setting, and stream-error logging.
- `apps/cli/src/index.ts` (modified) — triggers `maybeRunAutoReplanOpener` once after startup session load, boundary announcement, repository setup, and first-run task-file initialization.
- `apps/cli/src/turn-loop.ts` (modified) — triggers `maybeRunAutoReplanOpener` inside the day-rollover guard after loading/announcing the new session and re-seeding the debug turn logger.
- `apps/cli/src/terminal-output.ts` (modified) — added `autoReplanBanner(message)` to show the Auto-Replan kickoff before the synthetic stream starts.
- `apps/cli/test/auto-replan-opener.test.ts` (new) — covers opener success, empty skip, marker no-op, startup trigger helper, rollover integration, stream failure, synthetic user-message shape, and today-daily inclusion.
- `apps/cli/test/cli-logger.test.ts` (modified) — updated the `TerminalOutput` test stub for `autoReplanBanner`.
- `apps/cli/test/quick-replies.test.ts` (modified) — updated the `TerminalOutput` test stub for `autoReplanBanner`; Prettier also reformatted a long quick-reply fixture.
- `packages/core/src/search.ts` (modified) — changed `formatToday` from UTC date fields to local calendar-date fields so sessions roll over at the user's local midnight.
- `packages/core/src/__tests__/search.test.ts` (new) — pins Berlin-after-midnight behavior (`2026-05-22T22:30Z` -> `2026-05-23`).
- `packages/core/src/system-prompt.ts` (modified) — aligned the date line with local calendar fields and tightened Daily Plan checkbox semantics: `[ ]` open, `[x]` done, `[-]` closed without completion; task files keep strict `[x] = done`.
- `packages/core/src/__tests__/system-prompt.test.ts` (modified) — pins local-date rendering and the new `[x]`/`[-]` Daily Plan disposition wording.
- `packages/core/src/tools.ts` and `packages/core/src/file-repository.ts` (modified) — updated date-boundary comments from UTC-midnight to local-midnight semantics.
- `packages/core/src/__tests__/tools.test.ts` (modified) — adjusted injected-clock fixtures/comments from UTC rollover wording to local calendar rollover wording.
- `apps/cli/src/session-boundary.ts` (modified) — updated session-boundary documentation to local-midnight semantics.
- `apps/cli/test/two-phase-save.test.ts` (modified) — adjusted rollover test wording from UTC midnight to generic calendar boundary.

### Files Read (Context Only)

- `docs/work/main/plan.md` — plan preamble and Task 9 block for scope, instructions, AC IDs, and key locations.
- `docs/work/main/task-log/task-8-task-model-prompt-rewrite.md` — direct predecessor; confirmed no carried-forward blocker and current task-model/prompt assumptions.
- `docs/work/main/task-log/task-6-quick-replies.md` — confirmed `suggest_quick_replies` is a terminal UI tool with `question` + `options` and no separate Auto-Replan renderer should be introduced.
- `docs/work/main/task-log/task-4.1-pruning-and-sessions.md` — confirmed `Session` class invariants, `SessionStore`, atomic save, and snapshot rollback pattern.
- `docs/work/main/task-log/task-4.2-debug-turn-logging.md` — confirmed `TurnLogger` / `writeTurnArtifact` shape and the requirement that debug logging cannot block the REPL.
- `apps/cli/src/model-provider.ts` — checked provider/model/providerOptions seam so the opener uses the same provider path as regular turns.
- `apps/cli/src/request-builder.ts` — checked the request-building contract, cache-marker behavior, and message-created-at closure expectations.
- `apps/cli/src/session-boundary.ts` — checked startup/rollover banner behavior and persisted-message replay semantics.
- `apps/cli/src/turn-artifact.ts` — checked turn artifact context assembly and outcome write helper.
- `apps/cli/test/quick-replies.test.ts` and `apps/cli/test/two-phase-save.test.ts` — reused mock-provider, stream, harness, and session persistence test patterns.
- `/home/lutz/projects/kept-vault/.keppt/logs/sessions/2026-05-22/turn-001.json` — dogfooding artifact showing DeepSeek incorrectly inferred "today has no daily plan" when today's daily was absent from Auto-Replan context.
- `/home/lutz/projects/kept-vault/daily/2026-05-22.md` — verified the dogfooding claim was wrong: the daily contained four Plan entries, two still open.
- `/home/lutz/projects/kept-vault/.keppt/logs/sessions/2026-05-23/turn-001.json` and `turn-002.json` — dogfooding artifacts showing the revised Auto-Replan prompt correctly offered and applied `[-]/Log` disposition for stale Daily Plan items.
- `/home/lutz/projects/kept-vault/.keppt/logs/sessions/2026-05-23/turn-005.json` and `turn-006.json` — checked downstream behavior after `[-]` introduction and follow-up task-graph cleanup.

### Key Decisions

1. **Core gathers deterministic context only.** `gatherAutoReplanContext` decides which files are read, but it does no regex filtering or task-state classification. The LLM still performs semantic stale-pending interpretation.
2. **Daily context now includes today.** The original plan excluded today on the theory that Auto-Replan is about stale carry-over only. Dogfooding on 2026-05-22 showed that absence let the model falsely claim no daily plan existed. The approved amendment now reads the previous 5 dailies plus `daily/<today>.md`; future dailies remain excluded.
3. **Today's daily is current-plan context, not stale carry-over.** The synthetic prompt tells the model to use `daily/<today>.md` as today's current plan context while still identifying stale pending items from dated sources.
4. **Synthetic instructions are in English.** After user review, the Auto-Replan synthetic prompt was rewritten in English and still asks the model to answer in the user's language.
5. **Marker lives on `Session`.** `autoReplanRanFor` is additive JSON state on the daily session, avoiding a separate marker file. Existing sessions parse as "not run yet".
6. **Marker mutation participates in `snapshot()` rollback.** If the opener stream succeeds but session save fails, the synthetic messages and marker both roll back in memory, matching disk.
7. **Skip-when-empty leaves the marker unset.** Fresh/empty vaults should not get noisy morning greetings. Leaving the marker unset means the opener can run later the same day if meaningful context appears and the CLI restarts.
8. **Stream failure leaves the marker unset.** Failures are logged with `phase: "auto_replan_stream"`, the standard terminal summary is printed, and a later CLI start can retry.
9. **One helper owns trigger conditional logic.** `maybeRunAutoReplanOpener(deps, refs)` wraps the marker check and is used by both startup and rollover paths.
10. **Quick replies remain tool-driven.** The opener asks the LLM to use `suggest_quick_replies`; the CLI reuses the existing quick-reply capture/render contract instead of adding a bespoke option renderer.

— session 2026-05-23

11. **Session date uses local calendar time, not UTC.** Dogfooding after midnight in Germany showed UTC keys kept the old session active until 02:00 CEST. `formatToday` and the system prompt date line now use local date fields so "today" matches the user's actual day boundary.
12. **Daily Plan gets a third checkbox state.** `[x]` now means actually completed; `[-]` means closed out of that Daily Plan without completion. This avoids the old ambiguity where `[x]` in a daily could mean either "done" or "not doing this today".
13. **`[-]` is Daily Plan disposition only.** Task files keep strict checkbox semantics: `[ ]` open, `[x]` done. Canonical task completion still lives in `tasks/*.md`; `[-]` is not introduced there.
14. **Auto-Replan prompt uses examples for small-model compliance.** The synthetic message now gives direct chip-response mappings: `"später/verschieben/ignorieren" -> source Plan box [-] + today's Log with source date; "erledigt" -> source [x]`. This is intentionally more sample-like than abstract rule prose.

### Test Evidence

- `pnpm --filter @gtd/core build` — passed; needed because CLI tests resolve `@gtd/core` through the package build output.
- `pnpm --filter @gtd/core test -- --run packages/core/src/__tests__/auto-replan.test.ts` — passed. Because of Vitest argument forwarding in this workspace, this ran the full core suite: 17 files, 294 tests.
- `pnpm --filter @gtd/cli test -- --run apps/cli/test/auto-replan-opener.test.ts` — passed. Because of Vitest argument forwarding in this workspace, this ran the full CLI suite: 11 files, 54 tests.
- `pnpm -r typecheck` — passed for `packages/core` and `apps/cli`.
- `pnpm exec prettier --check packages/core/src/auto-replan.ts packages/core/src/__tests__/auto-replan.test.ts apps/cli/src/auto-replan-opener.ts apps/cli/test/auto-replan-opener.test.ts` — passed.
- Earlier full verification before the today-inclusion amendment also passed: `pnpm -r test`, `pnpm -r typecheck`, and Prettier over all changed Task 9 files.
- Manual dogfooding inspection: `/home/lutz/projects/kept-vault/.keppt/logs/sessions/2026-05-22/turn-001.json` showed the opener request omitted `daily/2026-05-22.md`, and `/home/lutz/projects/kept-vault/daily/2026-05-22.md` proved the model's "no daily plan" statement was false. This drove the approved design change to include today deterministically.

— session 2026-05-23

- `pnpm --filter @gtd/core test` — passed: 18 test files, 296 tests.
- `pnpm --filter @gtd/cli test` — passed: 11 test files, 54 tests.
- `pnpm --filter @gtd/core test -- src/__tests__/system-prompt.test.ts` — passed; due workspace argument forwarding this ran the full core suite and included the updated system-prompt assertions.
- `pnpm --filter @gtd/cli test -- test/auto-replan-opener.test.ts` — passed; due workspace argument forwarding this ran the full CLI suite and included the updated Auto-Replan synthetic-message assertions.
- `pnpm -r typecheck` — passed for `packages/core` and `apps/cli`.
- Manual dogfooding inspection: `/home/lutz/projects/kept-vault/.keppt/logs/sessions/2026-05-23/turn-001.json` offered `Alle drei sauber schließen ([-]/Log)` for stale Daily Plan entries, and `turn-002.json` applied `[-]` plus today's Log entries with source dates for Manfred, Weekly Review, and Rasen.

### Acceptance Coverage

- T9-AC-01: passed — `packages/core/src/__tests__/auto-replan.test.ts` pins the approved amended behavior: previous 5 dailies plus today are read; future dailies are excluded.
- T9-AC-02: passed — `auto-replan.test.ts` asserts missing dailies in the window are silently skipped and only present files appear in `dailies`.
- T9-AC-03: passed — `auto-replan.test.ts` asserts `isEmpty` is true only when there is no daily content and both `next-actions.md` and `waiting.md` are whitespace/missing; any non-whitespace source makes it false.
- T9-AC-04: passed — `apps/cli/test/auto-replan-opener.test.ts` asserts a non-empty opener persists the synthetic user message plus response messages and sets `session.autoReplanRanFor === today`.
- T9-AC-05: passed — `auto-replan-opener.test.ts` asserts empty context produces no banner, no model call, no messages, and no marker.
- T9-AC-06: passed — `auto-replan-opener.test.ts` asserts `maybeRunAutoReplanOpener` is a no-op when `session.autoReplanRanFor === today`.
- T9-AC-07: passed — `auto-replan-opener.test.ts` asserts the startup helper fires before any REPL turn is handled and prints the Auto-Replan banner first.
- T9-AC-08: passed — `auto-replan-opener.test.ts` drives `handleTurn` across a day rollover and asserts the rollover banner precedes the Auto-Replan banner, the new session gets the marker, and the submitted user turn still persists afterward.
- T9-AC-09: passed — `auto-replan-opener.test.ts` asserts stream failure leaves the marker unset, adds no messages, prints an error summary, and writes `auto_replan_stream` to the CLI error log.
- T9-AC-10: passed — `auto-replan-opener.test.ts` asserts the synthetic kickoff is a normal user-role message with string content containing the day-rollover context.

— session 2026-05-23

- T9-AC-01: passed — still covered after the local-date change; `gatherAutoReplanContext` remains date-string based and independent of timezone.
- T9-AC-04: passed — `auto-replan-opener.test.ts` now also pins that the synthetic message carries the `[-]`/`[x]` chip-disposition examples.
- T9-AC-07: passed — startup semantics now use local `formatToday`; the covered trigger path is unchanged.
- T9-AC-08: passed — rollover semantics now follow local calendar date via `formatToday`; the handleTurn rollover integration remains green.
- T9-AC-10: passed — synthetic user message remains a normal persisted `ModelMessage` while carrying the new sample-like disposition instruction.

### Open Issues

None for Task 9.

### Context for Next Task

- `formatToday(d: Date)` now returns a local calendar `YYYY-MM-DD`. Prompt date, tools, session keys, and Auto-Replan trigger checks share that local day key through `refs.turnNow`.
- `gatherAutoReplanContext(repo, today, daysBack = 5)` returns `{ dailies, nextActions, waiting, isEmpty }`. The `dailies` window is `today - daysBack` through `today` inclusive. Missing files are skipped. Future dailies are excluded.
- `runAutoReplanOpener(deps, refs)` performs the one-shot stream and persistence. `maybeRunAutoReplanOpener(deps, refs)` is the public trigger helper and owns the `session.autoReplanRanFor !== today` check.
- `Session` has `autoReplanRanFor?: string` and `setAutoReplanRanFor(date)`. `snapshot()` restores the marker as well as message/createdAt lengths.
- The opener's synthetic message is persisted only after stream success, together with response messages and the marker. On stream failure or save failure, the marker remains unset.
- Daily Plan checkbox semantics are now: `[ ]` open, `[x]` completed, `[-]` closed without completion. Task files do not use `[-]`; canonical open/done state remains `[ ]`/`[x]`.
- Auto-Replan's synthetic prompt deliberately includes chip mapping examples for stale Daily Plan disposition: defer/move/ignore -> source `[-]` + today's Log with source date; erledigt -> source `[x]`.
- CLI tests import `@gtd/core` from `packages/core/dist`, so after adding or changing core exports, run `pnpm --filter @gtd/core build` before CLI tests.
- The Auto-Replan stream path duplicates a small amount of regular-turn stream handling for quick replies and tool errors. If a third streaming surface appears, extract a shared stream consumer.
- Task 10's real-API day-change scenario should assert the amended behavior: local-midnight rollover, opener context includes today's daily if present, stale Daily Plan items can be closed as `[-]`, and `autoReplanRanFor` persists.

### Git State

`git diff --stat`:

```text
 apps/cli/src/index.ts                             |  5 +++-
 apps/cli/src/session-boundary.ts                  |  2 +-
 apps/cli/src/terminal-output.ts                   | 13 +++++----
 apps/cli/src/turn-loop.ts                         |  7 +++--
 apps/cli/test/cli-logger.test.ts                  |  5 ++--
 apps/cli/test/quick-replies.test.ts               | 16 ++++++-----
 apps/cli/test/two-phase-save.test.ts              |  4 +--
 packages/core/src/__tests__/sessions.test.ts      | 32 ++++++++++++++++++++++
 packages/core/src/__tests__/system-prompt.test.ts | 33 ++++++++++++++++++++---
 packages/core/src/__tests__/tools.test.ts         | 14 +++++-----
 packages/core/src/file-repository.ts              |  2 +-
 packages/core/src/index.ts                        |  4 +++
 packages/core/src/search.ts                       |  6 ++---
 packages/core/src/sessions.ts                     | 31 +++++++++++++++++++--
 packages/core/src/system-prompt.ts                | 14 +++++-----
 packages/core/src/tools.ts                        |  4 +--
 16 files changed, 148 insertions(+), 44 deletions(-)
```

`git status --short`:

```text
 M apps/cli/src/index.ts
 M apps/cli/src/session-boundary.ts
 M apps/cli/src/terminal-output.ts
 M apps/cli/src/turn-loop.ts
 M apps/cli/test/cli-logger.test.ts
 M apps/cli/test/quick-replies.test.ts
 M apps/cli/test/two-phase-save.test.ts
 M packages/core/src/__tests__/sessions.test.ts
 M packages/core/src/__tests__/system-prompt.test.ts
 M packages/core/src/__tests__/tools.test.ts
 M packages/core/src/file-repository.ts
 M packages/core/src/index.ts
 M packages/core/src/search.ts
 M packages/core/src/sessions.ts
 M packages/core/src/system-prompt.ts
 M packages/core/src/tools.ts
?? apps/cli/src/auto-replan-opener.ts
?? apps/cli/test/auto-replan-opener.test.ts
?? docs/work/main/task-log/task-9-auto-replan-opener.md
?? packages/core/src/__tests__/auto-replan.test.ts
?? packages/core/src/__tests__/search.test.ts
?? packages/core/src/auto-replan.ts
```
