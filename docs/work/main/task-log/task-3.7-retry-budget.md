# Task 3.7 — Per-message retry budget for `edit_file`

**Date:** 2026-05-09
**Plan:** `docs/plans/phase-1-cli.md` — Task 3.7

## Task

Cap repeated `edit_file` failures on the same file within a single user turn at
two `match`-reason attempts; the third attempt short-circuits to
`retry_budget_exhausted` without calling `repo.edit`. Lives at the tool layer
wrapping `edit_file`; the SEARCH/REPLACE planner in `edit.ts` stays pure.

## Status

**DONE**

## Files Modified

- `packages/core/src/tools.ts` (modified) — extended `EditFileError` with
  the `retry_budget_exhausted` variant; introduced
  `type EditFailuresByFilePath = Map<string, number>` (file path →
  consecutive match-failure count) with a JSDoc that explains the
  per-turn-via-closure semantics; allocated one such map per
  `buildTools` call (no outer turn-id keying — the closure boundary IS
  the turn boundary); `editFileTool` increments the counter only after
  `repo.edit` returns a real `match`-failure (true failure budget, no
  in-flight reservation, no per-file lock); the exhaustion path catches
  `FileNotFoundError` from `repo.read` and substitutes
  `currentContent: ""` so a missing-but-writable file mirrors the
  structured `repo.edit` failure shape; an outer `InvalidPathError`
  catch turns malformed model-supplied paths (traversal, `.keppt/`,
  absolute, backslash, null-byte) into structured `invalid_path` results
  instead of stream errors; tool description calls out both
  `retry_budget_exhausted` and the empty-`currentContent` → `write_file`
  affordance. `BuildToolsOptions` is `{ now? }` only — no `turnId` field
  (would have been captured but unused after the data-model cleanup).
- `packages/core/src/__tests__/retry-budget.test.ts` (new) — eight AC tests
  (T3.7-AC-01..06, AC-08, AC-10) + a `SpyRepository` wrapper around
  `InMemoryFileRepository` that counts `repo.edit` calls. AC-07 and AC-09
  (parallel-call shapes) were dropped after the design switched to
  provider-level sequential dispatch — see Decision 8 below.
- `apps/cli/src/index.ts` (modified) — rebuilds
  `buildTools(repo, { now })` per turn alongside the existing
  `turnNow = new Date()` snapshot; the startup-once `tools` const is
  gone. The per-turn rebuild is what makes the retry budget per-turn
  (closure boundary = turn boundary). Adds
  `providerOptions: { anthropic: { disableParallelToolUse: true } }` on
  the `streamText` call so the budget's plain-`Map` counter is race-free
  by construction (Anthropic emits at most one tool call per step).
- `apps/cli/test/workspace-wiring.test.ts` (modified) — adds a static
  source-check (T3.7-AC-11) that fails if the
  `disableParallelToolUse: true` flag is ever removed from `index.ts`.
  Architecture anchor — the budget's correctness depends on it.
- `docs/plans/phase-1-cli.md` (modified) — Task 3.7 section rewritten
  from the original `RetryBudgetStore`-interface plan to the
  minimal-plumbing closure variant with named `EditFailuresByFilePath` type
  and per-turn-rebuild scoping (no `turnId` field); ACs extended through
  T3.7-AC-11.

## Files Read (Context Only)

- `docs/specs/architecture.md` — R4 step 1 (files reloaded fresh per request),
  the `edit_file` retry-budget paragraph (lines 1170–1181), the Context
  Management: Tool-Result Pruning section (verified the budget is orthogonal
  to pruning; no special case needed).
- `docs/task-log/task-3.6-cli-error-logging.md` — direct predecessor;
  confirmed the renumbering note (`task-3.6-retry-budget.md` references are
  stale; the right path is `task-3.7-retry-budget.md`).
- `docs/task-log/task-3.5-gtd-layout-policy.md` — established
  `BuildToolsOptions { now? }` as the extension point and the
  `canWrite`-then-tool-body wrapping pattern that Task 3.7 follows.
- `docs/task-log/task-3-cli-vercel-ai-sdk.md` — foreshadowed the retry-budget
  decision and the "wrap, don't entangle" rationale; confirmed the original
  `edit_file` ambiguity-retry contract that the budget now bounds.
- `node_modules/.pnpm/ai@7.0.0-beta.116*/.../index.d.ts` — verified
  `PrepareStepFunction` / `PrepareStepResult.activeTools` /
  `StepResult.toolResults` / `TypedToolResult` shapes for the deterministic
  enforcement option (decided not to use them in Phase 1; see Key Decisions).

## Key Decisions

1. **Minimal plumbing instead of `RetryBudgetStore` interface.** The original
   plan called for a separate `retry-budget.ts` module with a public interface
   and a factory. Reduced to a `Map<string, Map<string, number>>` held in the
   `buildTools` closure because the only consumer is the CLI, the budget
   never crosses processes, and the interface added dependency surface for
   hypothetical multi-consumer reuse the project doesn't have. The plan was
   amended in the same Task-3.7 section to reflect this.

2. **Per-turn = per-`buildTools`-closure, not per-`turnId`-value.** Initial
   drafts threaded a `turnId` (string) through `BuildToolsOptions` and
   used it to key an outer `Map<turnId, Map<filePath, count>>`. After the
   final design landed, that outer map only ever held *one* entry — each
   `buildTools` call has exactly one turn's worth of tools. A user
   review caught the redundancy; the data model collapsed to a single
   `Map<filePath, count>` typed as `EditFailuresByFilePath`, and `turnId`
   left the API entirely (it was no longer load-bearing for anything;
   the closure boundary is what scopes the budget). In the agentic-loop
   world one "turn" still means one user input → one `streamText()`
   call → up to `MAX_STEPS = 10` internal model+tool steps; the
   per-turn `turnNow` clock and the per-turn `buildTools` rebuild
   already co-locate the turn-level state.

3. **Only `match`-reason failures count toward the budget.** AC-06 makes
   this explicit. `out_of_scope` and `invalid_path` failures are GTD-gate
   / path-safety rejections, not the SEARCH/REPLACE looping pattern this
   guards against. Burning budget on a permanently-rejected path would
   degrade the budget for the next legitimate `match`-failure on a
   different file.

4. **Per-turn rebuild of `buildTools` is the scoping mechanism.** The
   CLI already runs per-turn setup (`turnNow = new Date()`); adding
   `tools = buildTools(repo, { now })` one line below is cheap and is
   what makes the budget per-turn — the failure counter lives in the
   `buildTools` closure, so a fresh call gets a fresh counter, and the
   previous closure (with its counter) is GC'd at turn boundaries.
   `BuildToolsOptions` is now `{ now? }` only; no `turnId` field, no
   "make it required to enforce discipline" — the discipline is just
   "rebuild per turn", documented on `buildTools` itself. (See Decision
   2 for the cleanup.)

5. **Re-include `currentContent` on the short-circuit.** Even at the third
   attempt the LLM may not have the latest content in its working memory.
   One extra `repo.read` is cheap and gives the next user turn a clean
   starting point.

6. **No `prepareStep` deterministic enforcement for Phase 1.** Verified the
   Vercel AI SDK's `prepareStep` + `activeTools` API exists and could
   hard-block `edit_file` at the SDK layer once any prior step returned
   `retry_budget_exhausted`. Considered, rejected for now because:
   (a) the in-tool short-circuit is already the load-bearing damage-prevention
       layer — no `repo.edit` call, no history entry, no file change;
   (b) `stopWhen: isStepCount(10)` bounds infinite loops independent of LLM
       compliance;
   (c) the only residual concern is token waste in the pathological case
       where the LLM ignores the description hint and re-tries the
       short-circuited file repeatedly — bounded at ~7 wasted steps;
   (d) empirical CLI dogfooding (the indented-"Staubsaugen" smoke under
       *Test Evidence*) showed the soft hint working in practice, and the
       user explicitly preferred to defer speculative SDK plumbing until
       Task 6 produces real evidence.
   Filed as Open Issue 1 below.

7. **Per-file granularity at the SDK level is not feasible without dynamic
   tool-description rewrites.** `activeTools` is tool-level, not
   input-level — the SDK cannot block "`edit_file` on file A but not file
   B" cleanly. The in-tool short-circuit already handles per-file
   granularity (AC-02, AC-04); any future `prepareStep` enforcement would
   have to be all-or-nothing for `edit_file`.

8. **Provider-level sequential tool use, not in-tool locking
   (post-review consolidation).** Three rounds of Codex adversarial
   review on the working-tree diff exposed a series of correctness
   issues, each fix introducing the next:
   - **R1:** A naive read-then-await-then-increment counter was racy
     under parallel tool dispatch from one model step.
   - **R2:** A slot-reservation counter (pre-increment +
     decrement-on-success) closed the race but *false-blocked* three
     parallel SUCCESSFUL same-file edits with a misleading
     `retry_budget_exhausted`.
   - **R3:** A per-`(turnId, filePath)` Promise-queue lock fixed the
     false-block but introduced a cancellation hazard: queued same-file
     edits could still fire after the user aborted the turn (the queued
     promise didn't observe `streamText`'s `abortSignal`).
   Each iteration was adding more code to defend against a shape that
   doesn't actually arise on the supported provider. Switched the
   architecture: set
   `providerOptions.anthropic.disableParallelToolUse: true` on the CLI's
   `streamText` call so Anthropic emits at most one tool call per step.
   With that guarantee, the simple plain-`Map` counter (increment only
   after a real `match`-failure) is correct by construction — no lock,
   no reservation, no abort-propagation hazard. Multi-edit batches
   ("mark all three tasks done") use `edit_file`'s own `edits[]` array,
   which has always been atomic and single-call. The architecture anchor
   T3.7-AC-11 (static source check on `index.ts`) prevents silent
   regression of the flag. If a future entry point adds a second
   provider or relaxes the flag, the counter assumption breaks and a
   serialization layer becomes necessary again — re-evaluate then.

9. **Missing-file exhaustion mirrors `repo.edit`'s structured shape
   (post-review fix).** Same Codex review noted that `repo.edit` returns
   `{ ok: false, error: { ..., currentContent: "" } }` for missing-but-
   writable files (`missingFileError` in both repo implementations) but
   `repo.read` throws `FileNotFoundError`. The original exhaustion path
   used `await repo.read(filePath)` unconditionally and only caught
   `InvalidPathError`, so the third retry on a missing writable path
   (e.g. an unseeded `daily/<today>.md`) became an SDK tool-error
   instead of `retry_budget_exhausted`, denying the model the documented
   recovery shape. Now wrapped in a `FileNotFoundError`-only catch that
   substitutes `currentContent: ""`. T3.7-AC-08 covers this against the
   today's-daily path.

10. **Tool-description affordance: empty `currentContent` → `write_file`.**
    The retry budget hardens the *worst case* of the missing-file pattern
    (three failing edit_file calls bounded), but the *intended* recovery
    is for the LLM to switch tools after the first attempt: `currentContent:
    ""` is by itself the signal that the file does not exist. Extended
    `edit_file`'s tool description to call this out explicitly, so the
    model has the affordance directly at the binding site (always visible,
    independent of how the system prompt evolves). The matching System-
    prompt-level reinforcement (T-C1 in a new `## Tool conventions`
    section) is parked in the Task 4 plan with AC T4-AC-01b — out of
    scope for Task 3.7's commit.

11. **`canWrite` must stay inside an `InvalidPathError` catch
    (post-review-iteration-3 fix).** A third Codex pass caught a
    regression introduced by the serialization refactor: pulling
    `canWrite(filePath, today)` out of the original outer try/catch let
    `InvalidPathError` (thrown by `validateFilePath` for traversal,
    `.keppt/`, absolute, backslash, null-byte, malformed paths) escape
    as a stream error instead of being surfaced as the documented
    `{ ok: false, error: { reason: "invalid_path" } }` tool result. A
    malformed model-supplied path would have aborted the turn instead of
    giving the model a recoverable shape. Wrapped the GTD-gate in its own
    `InvalidPathError`-only catch at the top of `editFileTool` (before
    any locking or budget logic). T3.7-AC-10 covers traversal, reserved
    prefix, and backslash paths with `turnId` enabled; also asserts that
    invalid paths never reach `repo.edit` and never consume budget.

## Test Evidence

```text
$ pnpm --filter @gtd/core build
> tsc -p tsconfig.json
[clean]

$ pnpm --filter @gtd/core test
 ✓ src/__tests__/edit.test.ts  (11 tests)
 ✓ src/__tests__/history-log.test.ts  (2 tests)
 ✓ src/__tests__/gtd-layout.test.ts  (14 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts  (36 tests)
 ✓ src/__tests__/local-file-repository.test.ts  (42 tests)
 ✓ src/__tests__/retry-budget.test.ts  (8 tests)
 ✓ src/__tests__/tools.test.ts  (9 tests)

 Test Files  7 passed (7)
      Tests  122 passed (122)

$ pnpm --filter @gtd/cli typecheck
> tsc -p tsconfig.json --noEmit
[clean]

$ pnpm --filter @gtd/cli test
 ✓ test/cli-error-log.test.ts  (1 test)
 ✓ test/cli-errors.test.ts  (2 tests)
 ✓ test/workspace-wiring.test.ts  (1 test)

 Test Files  3 passed (3)
      Tests  4 passed (4)
```

**Real CLI smoke (validates the legitimate-retry path the budget is meant
to allow without exhausting):**

The user manually edited the daily note to indent the "Staubsaugen" task
before asking the LLM to mark it done. Observed trace:

```
> Was steht in meiner heutigen daily?
[read_file…]
"In deiner heutigen Daily Note (2026-05-09):
   - [x] Rasen mähen ✓
   - [ ] Staubsaugen (noch offen)"

> Staubsaugung ist erledigt.
[edit_file…]   # search built without leading indent → reason: "match" (counter[turnX][daily/2026-05-09.md] = 1)
"Ich sehe, das Staubsaugen ist eingerückt. Ich korrigiere das:"
[edit_file…]   # search with indent extracted from currentContent → success (counter stays at 1)
"✓ Erledigt! Das Staubsaugen ist jetzt als abgehakt markiert."
```

Counter never reached the threshold; `retry_budget_exhausted` was not
triggered. The "extend search context after seeing currentContent" loop
that Task 3 originally designed worked end-to-end. The budget sat in
the loop without firing — exactly the desired no-op for healthy retries.

## Acceptance Coverage

- **T3.7-AC-01:** passed — `retry-budget.test.ts` *single-file exhaustion
  stops repo.edit on the third attempt*. Asserts `match` → `match` →
  `retry_budget_exhausted` (with `currentContent`), file content unchanged,
  spy `repo.edit` called exactly twice.
- **T3.7-AC-02:** passed — *per-file scope — exhausted file does not block
  sibling file in the same turn*. After two failing attempts on
  `tasks/inbox.md`, a failing attempt on `tasks/focus.md` returns `match`
  (not `retry_budget_exhausted`).
- **T3.7-AC-03:** passed — *per-turn reset — a new buildTools call resets
  the counter for the same file*. After exhausting from one
  `buildTools` instance, a fresh `buildTools(repo, { now })` instance
  makes the same call return `match`. The closure boundary is the turn
  boundary; no `turnId` field is needed.
- **T3.7-AC-04:** passed — *success on file B does not reset failures on
  file A*. One inbox failure + one focus success + a second inbox failure
  still yields `match` (count = 2, exhausted only on the third inbox attempt).
- **T3.7-AC-05:** passed — *short-circuit does not call repo.edit*.
  Spy-based assertion on top of AC-01: invocation count stays at 2 after the
  exhausted call.
- **T3.7-AC-06:** passed — *out_of_scope failures do not consume budget*.
  Two `out_of_scope` rejections on `random/foo.md` followed by a `match`-
  failure on `tasks/inbox.md` returns `reason: "match"` (counter for inbox
  = 1, not exhausted).
- **T3.7-AC-08:** passed — *exhausted retry on a missing writable file
  returns retry_budget_exhausted with empty currentContent*. Three
  failing attempts against today's `daily/<YYYY-MM-DD>.md` (writable
  under the GTD layout but never seeded) yield `match` → `match` →
  `retry_budget_exhausted` with `currentContent: ""`, never an SDK
  tool-error from a thrown `FileNotFoundError`.
- **T3.7-AC-10:** passed — *invalid paths return a structured
  `invalid_path` result and never call `repo.edit`*. Three invalid paths
  (`../etc/passwd`, `.keppt/logs/x.md`, `tasks\\inbox.md`) all return
  `error.reason: "invalid_path"`; spy
  `repo.editCalls` stays 0 across all three; a subsequent legitimate
  `match`-failure on `tasks/inbox.md` is still attempt 1.
- **T3.7-AC-11:** passed — *CLI architecture anchor for sequential tool
  use*. Static source check in `apps/cli/test/workspace-wiring.test.ts`
  asserts `apps/cli/src/index.ts` contains `providerOptions: { anthropic:
  { disableParallelToolUse: true ... }`. The retry budget's plain-`Map`
  counter is race-free only under sequential tool dispatch; if this
  flag is ever removed, this test fails before the change ships.
- **AC-07 / AC-09 dropped:** Earlier draft tests for parallel `edit_file`
  dispatch (concurrent failing calls; concurrent successful calls).
  Dropped after the design switched from in-tool locking to
  provider-level sequential dispatch — those shapes are not reachable
  when `disableParallelToolUse: true` is in effect, and AC-11 is the
  regression guard for the assumption itself.

## Open Issues

1. **`prepareStep` deterministic enforcement deferred.** The LLM's stop
   behavior after `retry_budget_exhausted` currently relies on the tool
   description plus `stopWhen: isStepCount(10)`. The in-tool short-circuit
   prevents damage; the residual cost is ~7 wasted steps in the worst case
   where the LLM ignores the hint. Empirical Phase-1 dogfooding has not
   surfaced this. (→ Re-evaluate during Task 6 real-API acceptance; if
   pathological retry-spinning shows up, add a `prepareStep` that drops
   `edit_file` from `activeTools` after any `retry_budget_exhausted` in the
   current turn. Type APIs verified to exist in `ai@7.0.0-beta.116`.)

2. **No per-file granularity at the SDK boundary.** Any future `prepareStep`
   enforcement would be tool-level, not input-level — once added, the LLM
   would lose the "or try a different file" affordance for the rest of the
   turn. Acceptable trade-off if (1) becomes necessary; the user can always
   re-prompt for a fresh turn. (→ Same Task 6 trigger.)

3. **`out_of_scope` / `invalid_path` failures intentionally don't count.**
   AC-06 documents this. If real-API testing shows the LLM looping on a
   permanently-rejected path until `stopWhen` kicks in, revisit — possibly
   with a separate, stricter cap dedicated to those reasons. Not expected.

4. **(Resolved 2026-05-09)** Concurrency-related issues from the
   adversarial-review iterations (slot-reservation false-block;
   per-`(turnId, filePath)` queue cancellation hazard) were all
   collapsed by the architecture switch in Decision 8: provider-level
   `disableParallelToolUse: true` instead of in-tool locking. The
   counter is now a plain `Map` mutation under a sequential-dispatch
   guarantee. T3.7-AC-11 (static source anchor) is the regression
   guard for the assumption.

## Context for Next Task

- **Per-turn scoping is by closure rebuild, not by id.** Task 4's
  `buildRequest` should call `buildTools(repo, { now })` once per
  request — that's how the retry budget resets per turn. There is no
  `turnId` field on `BuildToolsOptions`; if Task 4 needs a turn id for
  prompt metadata or telemetry, it can mint one separately, but the
  budget itself does not need or use one.
- **`EditFileError` is now a four-variant union:**
  `match | invalid_path | out_of_scope | retry_budget_exhausted`. Task 4's
  R1–R13 system prompt must enumerate all four reasons under the
  `edit_file` rule (`retry_budget_exhausted` explicitly: *stop retrying,
  ask the user or try a different file*).
- **Budget scope = per-`buildTools`-call.** Rebuilding `buildTools` resets
  the counter. The CLI rebuilds per turn; the future server's `/api/chat`
  handler should rebuild tools per request — DO NOT share `buildTools`
  across HTTP requests, or the budget leaks across users.
- **Interaction with tool-result pruning (Task 4):**
  `retry_budget_exhausted` tool-results are subject to the same K-window-+-
  version-drift rule as any other tool-result — no special case. The
  architecture spec was updated in commit `68c8507` to use the hybrid
  pruning rule (K + `file.updated_at > message.created_at`); the Task 4
  plan section now reflects the new `pruneToolResults` signature plus
  ACs T4-AC-05b/c/d for the version-drift / per-file-granularity /
  `list_files`-fallback paths.

## Git State

```text
$ git status --short
 M apps/cli/src/index.ts
 M docs/plans/phase-1-cli.md
 M packages/core/src/tools.ts
?? .idea/
?? docs/task-log/task-3.7-retry-budget.md
?? packages/core/src/__tests__/retry-budget.test.ts
?? handoff.md
```

(Plus a set of untracked dotfiles surfaced by `git status` from the parent
home directory — `.bashrc`, `.zshrc`, `.gitconfig`, etc. — not part of this
task and not intended to be tracked. `.idea/` is JetBrains workspace
metadata; `handoff.md` is temporary scaffolding to be deleted after the
commit lands.)
