# Task 4.2 — Per-turn debug logging (request/response artifacts)

**Date:** 2026-05-19
**Plan:** `docs/plans/phase-1-cli.md` — Task 4.2

## Task

Add a runtime-neutral `TurnLogRecord` shape + `TurnLogger`
write-only contract in `packages/core`, plus a `DEBUG=1`-gated
`FsTurnLogger` in `apps/cli` that writes one JSON artifact per
LLM turn at `<vault>/.keppt/logs/sessions/<date>/turn-NNN.json`.
Each artifact carries the post-pruning request, per-step
response breakdown, and `totalUsage` so Task 4's prompt caching
and Task 4.1's tool-result pruning become empirically
inspectable. Integrate into the CLI across the ok /
stream_error / aborted exit paths.

## Status

**DONE**

## Files Modified

- `packages/core/src/turn-log.ts` (new) — `TurnLogRecord`
  interface (allowlist serialization, no raw SDK passthrough),
  `TurnLogger` write-only interface, `NoopTurnLogger`,
  `MemoryTurnLogger`. Zero `node:fs`, zero `console.*`. Single
  source of truth for the artifact shape across Phase 1 and the
  planned Phase-2a `SupabaseTurnLogger`.
- `packages/core/src/__tests__/turn-log.test.ts` (new) — 3 tests
  pinning T4.2-AC-12 (Noop/Memory contracts, call order) and
  T4.2-AC-13 (regex-absent core hygiene check on the source
  file).
- `packages/core/src/index.ts` (modified) — re-exports
  `TurnLogRecord`, `TurnLogger`, `NoopTurnLogger`,
  `MemoryTurnLogger`.
- `apps/cli/src/fs-turn-logger.ts` (new, ~99 LOC) — `class
  FsTurnLogger implements TurnLogger`. Async static factory
  `FsTurnLogger.create(vaultPath, sessionDate, fs?)` seeds the
  counter once from the existing `turn-NNN.json` filenames in
  the session directory (ENOENT means "first turn this day").
  `nextTurnId()` is sync afterwards. `writeTurn(record)` is
  atomic via tmp + rename (same shape as `FsSessionStore.save`).
  Injectable `FsTurnLoggerOps` for tests (ESM-frozen-namespace
  workaround).
- `apps/cli/src/turn-artifact.ts` (new, ~108 LOC) — `interface
  TurnLogContext`, `type TurnOutcomeInput` (discriminated
  union: `"ok" | "aborted" | "stream_error"`), `async function
  writeTurnArtifact(ctx, outcome)`. Single helper for record
  assembly + dispatch across all three exit paths; failures
  from the underlying `writeTurn` are caught and surfaced via
  `cliLogger.warn({ code: "turn_log.write_failed" })` so debug
  logging cannot gate the REPL.
- `apps/cli/test/fs-turn-logger.test.ts` (new) — 4 tests
  covering T4.2-AC-03 (atomic tmp+rename via recording fs),
  T4.2-AC-04 (counter resumes from `turn-003.json` → `turn-004`),
  the ENOENT path (first id is `turn-001`), and T4.2-AC-08
  (allowlist serialization — extra `providerOptions` keys
  roundtrip; no incidental top-level fields).
- `apps/cli/test/turn-logger-integration.test.ts` (new) — 9
  tests driving the production `writeTurnArtifact` helper
  through every documented AC: T4.2-AC-01 (ok turn), AC-02
  (DEBUG off → no files), AC-05 (day-rollover counter reset),
  AC-06 (stream_error with `error.name`/`message`), AC-07
  (aborted, no `steps`/`totalUsage`/`responseMessages`), AC-09
  (pruning visibility — the 4.1 pruner stub regex appears in
  `turn-006.json`'s `initialRequest.messages` after 6 same-file
  `read_file` turns), AC-10 (mocked
  `usage.inputTokenDetails.cacheReadTokens` reachable on disk),
  AC-11 (`rename` rejection captures
  `code: "turn_log.write_failed"` and the helper does not
  throw), AC-12 (`MemoryTurnLogger` substitution).
- `apps/cli/src/index.ts` (modified) —
  - Added `MODEL_ID = "claude-haiku-4-5"` constant; used both
    by `anthropic(MODEL_ID)` and the artifact's `model` field.
    Single source of truth.
  - `let turnLogger: FsTurnLogger | null = DEBUG ? await
    FsTurnLogger.create(...) : null` after session load.
  - Day-rollover guard re-creates `turnLogger` against the new
    day's subdirectory alongside `sessionStore.loadOrCreate`,
    so post-midnight artifacts land under
    `.keppt/logs/sessions/<today>/`, not yesterday's dir.
  - Per-turn `turnCtx: TurnLogContext | null` built after
    `buildRequest` returns (so the catch arm sees the same
    captured `system` + `requestMessages`).
  - Three exit paths each call `writeTurnArtifact(turnCtx,
    {outcome: ...})` as a single one-liner:
    happy path with `steps`/`totalUsage`/`responseMessages`,
    aborted with no tail data, stream_error with the captured
    `err`.
  - Existing `cliLogger.debug({ code: "prompt.cache_usage" })`
    block kept per plan (line 1059). `result.totalUsage` is
    awaited once and shared between the artifact and the
    JSONL line.

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — Task 4.2 block (lines 991-1106),
  preamble.
- `handoff.md` — the pre-task briefing (deleted after wrap-up).
- `docs/task-log/task-4.1-pruning-and-sessions.md` — direct
  predecessor. The `FsSessionStore` atomic-write pattern,
  injectable `FsSessionStoreOps`, day-rollover guard at the
  CLI level, and `MockLanguageModelV4` test scaffolding all
  carried over as templates.
- `apps/cli/src/fs-session-store.ts` — shape template for
  `FsTurnLogger`.
- `apps/cli/src/cli-logger.ts` — call shape for the
  `turn_log.write_failed` warn.
- `apps/cli/test/two-phase-save.test.ts` — `MockLanguageModelV4`
  + `simulateReadableStream` patterns reused in
  `turn-logger-integration.test.ts`.
- `apps/cli/test/fs-session-store.test.ts` — recording-fs
  helper pattern for atomic-write assertion.
- `packages/core/src/sessions.ts` — core-hygiene reference
  (`class Session` + interface in core, fs impl in CLI).
- `packages/core/src/logging.ts` — `MemoryLogger.events` API
  (used in AC-11 to assert the warn was captured; entries
  are `{ level, ...event }` flattened).
- `node_modules/.pnpm/ai@7.0.0-beta.116*/ai/dist/index.d.ts`
  L1311-1428 (`StepResult`), L295-335 (`LanguageModelUsage`),
  L2536-2562 (`StreamTextResult.steps` /
  `.totalUsage` / `.response` are all `PromiseLike`).

## Key Decisions

1. **`writeTurn(record)` is single-param, not two-param.** The
   plan's task block was internally inconsistent — line 1001
   declared `writeTurn(record: TurnLogRecord): Promise<void>`
   but line 1012 reads "exposes `writeTurn(turnId: string,
   record: TurnLogRecord)`". Resolved to the single-param
   form because `turnId` is already a field on
   `TurnLogRecord`; an explicit parameter would force callers
   to either duplicate it or risk it drifting from
   `record.turnId`. The interface declaration won over the
   prose.

2. **`FsTurnLogger.create()` is an async static factory, not
   a sync constructor.** Counter seeding reads the session
   directory; that's an async call that doesn't belong in a
   constructor. After construction `nextTurnId()` stays sync,
   so the production CLI calls it inline without an extra
   await per turn. Plan line 1010 reads "Constructor reads
   the subdirectory listing"; reinterpreted to match the
   shape `FsSessionStore` already uses (sync constructor +
   async `loadOrCreate`, but here the seed and the writer
   are paired so a factory is the natural fit).

3. **`MODEL_ID` constant as the single source of truth.** The
   first pass hardcoded `"claude-haiku-4-5"` three times in
   the artifact-assembly blocks AND once in
   `anthropic("claude-haiku-4-5")`. Hoisted to a top-level
   `const MODEL_ID = "claude-haiku-4-5"` so a future model
   change touches one line. Both the `streamText` call site
   and the per-turn artifact reference it.

4. **`writeTurnArtifact(ctx, outcome)` helper, three
   one-liner call sites.** The first integration draft
   inlined a ~30-line record literal at each of the three
   exit paths — `main()` ballooned with near-duplicate
   blocks. Refactored to a single helper in
   `apps/cli/src/turn-artifact.ts` with a `TurnOutcomeInput`
   discriminated union. Each call site is now one line:
   `await writeTurnArtifact(turnCtx, { outcome: "ok", ... })`
   etc. The `turn_log.write_failed` warn is also folded into
   the helper, so the catch-around-`writeTurn` shape is
   defined exactly once.

5. **`turnLogger` is the single runtime gate; no separate
   `DEBUG &&` checks at write sites.** `turnLogger` is only
   non-null when `DEBUG === "1"`, so `DEBUG && turnLogger`
   is equivalent to `turnLogger`. Removed the redundant
   `DEBUG` guard from the `nextTurnId` allocation and the
   three write sites. The `DEBUG` gate remains around the
   `prompt.cache_usage` JSONL line — that block has been
   `DEBUG`-gated since Task 4 and is independent of the
   artifact.

6. **Up-front init at startup + re-init on day-rollover, not
   a unified null/rollover check.** Mirrors how the existing
   `session` is handled (`sessionStore.loadOrCreate(...)` is
   called once at startup and again inside the rollover
   guard). Combining the two into `if (turnLogger === null
   || todayKey !== session.date)` would conflate "first
   creation" with "day boundary crossed", divergent from
   the `session` pattern one line over. Kept symmetric.

7. **`providerOptions` literal is duplicated between
   `streamText` call site and artifact snapshot —
   intentionally.** `workspace-wiring.test.ts` pins
   `disableParallelToolUse:\s*true` as first key inside
   `providerOptions.anthropic` via a static regex on
   `index.ts` source. Extracting the literal to a shared
   `const` would defeat the regex (`disableParallelToolUse`
   would no longer appear at the asserted position). Kept
   the streamText literal inline; the artifact gets a
   separate literal inside `turnCtx` construction. The
   ~5-line duplication is the cost of keeping the static
   pin readable.

8. **Open Decision #1 (cache_usage JSONL block): keep both.**
   The plan (line 1059) says keep; user confirmed. The
   per-turn artifact is the structured deep-dive, the JSONL
   line is the searchable compact index. `result.totalUsage`
   is awaited once and shared between them so no
   double-await cost.

9. **Open Decision #2 (slim `steps[]`): keep verbose.** User
   confirmed verbose per plan skeleton. The redundancy
   between `steps[].text` / `toolCalls` / `toolResults` and
   `responseMessages` is real but acceptable for an
   inspection artifact — having both makes spot-checking
   easier.

10. **`TurnOutcomeInput.ok.totalUsage` typed as `unknown`,
    not `LanguageModelUsage`.** Matches the on-disk shape
    on `TurnLogRecord.totalUsage` (also `unknown` per the
    allowlist-serialization rationale) and lets tests
    substitute a minimal usage shape without committing to
    whichever variant of `LanguageModelUsage` the current
    SDK beta exposes. The CLI still passes the real SDK
    value at runtime.

11. **Test patterns: integration test drives the production
    helper directly.** First draft duplicated
    `writeTurnArtifact` as an inline `safeWriteTurn` helper
    in the test file. After the production helper was
    extracted to `turn-artifact.ts`, the test was refactored
    to import and call it directly — tests verify the real
    code path, not a parallel copy.

## Test Evidence

```text
$ pnpm -r typecheck
packages/core typecheck: Done
apps/cli   typecheck:   Done

$ pnpm --filter @gtd/core test
 ✓ src/__tests__/turn-log.test.ts                     (3 tests)
 ✓ src/__tests__/tool-result-pruning.test.ts          (8 tests)
 ✓ src/__tests__/sessions.test.ts                    (14 tests)
 ✓ src/__tests__/request-builder.test.ts              (6 tests)
 ✓ src/__tests__/edit.test.ts                        (11 tests)
 ✓ src/__tests__/input-validation.test.ts             (5 tests)
 ✓ src/__tests__/system-prompt.test.ts                (4 tests)
 ✓ src/__tests__/history-log.test.ts                  (2 tests)
 ✓ src/__tests__/gtd-layout.test.ts                  (14 tests)
 ✓ src/__tests__/logging.test.ts                     (10 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts   (60 tests)
 ✓ src/__tests__/retry-budget.test.ts                 (8 tests)
 ✓ src/__tests__/local-file-repository.test.ts       (73 tests)
 ✓ src/__tests__/tools.test.ts                       (13 tests)

 Test Files  14 passed (14)
      Tests  231 passed (231)

$ pnpm --filter @gtd/cli test
 ✓ test/fs-turn-logger.test.ts            (4 tests)
 ✓ test/turn-logger-integration.test.ts   (9 tests)
 ✓ test/fs-session-store.test.ts          (7 tests)
 ✓ test/two-phase-save.test.ts            (5 tests)
 ✓ test/cli-errors.test.ts                (3 tests)
 ✓ test/cli-error-log.test.ts             (1 test)
 ✓ test/cli-logger.test.ts                (3 tests)
 ✓ test/workspace-wiring.test.ts          (2 tests)

 Test Files  8 passed (8)
      Tests  34 passed (34)
```

Core test growth: 218 → 231 (+13). Of those: +3
`turn-log.test.ts` from this task; the remaining +10 are
the `sessions.test.ts` rewrite that landed in the Task 4.1
addendum (4 → 14) and were captured in that wrap-up.

CLI test growth: 25 → 34 (+9 in this task: 4 new in
`fs-turn-logger.test.ts`, 9 new in
`turn-logger-integration.test.ts`; one prior test was
absorbed into the new shape).

Invariants re-checked:

```text
$ grep -c 'console\.' packages/core/src/turn-log.ts \
                     apps/cli/src/fs-turn-logger.ts \
                     apps/cli/src/turn-artifact.ts
0 0 0
```

`workspace-wiring.test.ts > forces sequential tool
execution via providerOptions.anthropic.disableParallelToolUse`
— still green; the `streamText` `providerOptions` literal
stayed inline (the artifact snapshot is a separate literal
inside `TurnLogContext`).

Manual smoke against the real Anthropic API was **not**
run this session — the new code is fully testable against
`MockLanguageModelV4` and a temp-dir vault; the real-API
spot-check belongs in Task 6 (which now has the artifact
to spot-check against). See Open Issues.

## Acceptance Coverage

- **T4.2-AC-01:** passed —
  `turn-logger-integration.test.ts > DEBUG=1 → one ok turn
  produces turn-001.json with the post-pruning request
  snapshot and response messages`.
- **T4.2-AC-02:** passed —
  `turn-logger-integration.test.ts > no turnLogger (DEBUG
  off) → nothing under .keppt/logs/sessions/`. Models the
  production gating where `turnLogger` is null when DEBUG
  is off, so `writeTurnArtifact` is never invoked.
- **T4.2-AC-03:** passed —
  `fs-turn-logger.test.ts > writeTurn lands the artifact
  via a same-directory tmp file + rename`.
- **T4.2-AC-04:** passed —
  `fs-turn-logger.test.ts > counter seeds from existing
  turn-NNN.json so the next id is turn-(max+1)`.
- **T4.2-AC-05:** passed —
  `turn-logger-integration.test.ts > day-rollover → day-2
  artifacts land under day-2 dir, counter restarts at 001`.
- **T4.2-AC-06:** passed —
  `turn-logger-integration.test.ts > stream_error path
  writes outcome:'stream_error' with populated error fields`.
  The CLI's `appendCliErrorLog` continues to write the
  Task 3.6 JSONL entry independently; both artifacts coexist.
- **T4.2-AC-07:** passed —
  `turn-logger-integration.test.ts > abort path writes
  outcome:'aborted' and no steps/totalUsage/responseMessages/error`.
- **T4.2-AC-08:** passed —
  `fs-turn-logger.test.ts > artifact roundtrips the
  documented TurnLogRecord shape — extra providerOptions
  keys preserved, no incidental top-level fields`.
- **T4.2-AC-09:** passed —
  `turn-logger-integration.test.ts > pruning visibility —
  after 6 same-file read_file turns, turn-006.json's
  initialRequest.messages contains the pruner stub`. The
  4.1 stub regex `/^\[Previous .* result — superseded/`
  matches via the age-cap path (K=5 in request-builder;
  turn 6's read falls outside the K-window).
- **T4.2-AC-10:** passed —
  `turn-logger-integration.test.ts > mocked
  usage.inputTokenDetails.cacheReadTokens is reachable in
  the on-disk artifact`.
- **T4.2-AC-11:** passed —
  `turn-logger-integration.test.ts > rename rejecting with
  EACCES → cliLogger.warn captures turn_log.write_failed
  and the helper does not throw`. The catch lives inside
  `writeTurnArtifact`, so any future call site inherits the
  non-fatal-write contract for free.
- **T4.2-AC-12:** passed — covered at two layers:
  `turn-log.test.ts > NoopTurnLogger.writeTurn resolves
  without side effects` + `MemoryTurnLogger records appended
  in call order` (core); plus
  `turn-logger-integration.test.ts > MemoryTurnLogger
  substitution exposes records in call order, each matching
  the TurnLogRecord shape` (CLI integration).
- **T4.2-AC-13:** passed —
  `turn-log.test.ts > turn-log.ts imports no node:fs and
  uses no console.*`. Regex-absent assertion on the source
  text mirrors the `workspace-wiring.test.ts` pattern.

## Open Issues

1. **`main()` in `apps/cli/src/index.ts` is 346 LOC — well
   over the project's <50 LOC/function guideline.** User
   flagged this near the end of the session. The pre-existing
   per-turn body inside `main()` was already large (~250
   LOC) before Task 4.2; the artifact-write integration
   (~30 LOC of context build + three one-liner write calls)
   made it worse rather than triggering a refactor.
   Refactor plan (proposed and approved-in-spirit during the
   session, but not executed before wrap-up): extract the
   per-turn body into `apps/cli/src/turn-loop.ts` with
   `handleTurn(deps, refs, line, turnNow, controller)` as
   the orchestrator, plus private helpers
   `dayRolloverGuard`, `phase1Save`,
   `streamAndPersist`, `consumeStream`, `phase2Save`,
   `postStreamDebug`, `handleStreamError`. Result: `main()`
   shrinks to ~50 LOC (bootstrap + REPL loop), each helper
   ≤ 50 LOC. Strictly internal refactor; production
   behaviour unchanged; existing CLI tests stay the
   regression guard. **(→ Task 4.3 or a Task-4 follow-up.)**
2. **T4-AC-14 / T4.1 manual real-API smoke is still
   unrun.** Inherited from Task 4 / Task 4.1. Task 4.2 now
   produces the inspection artifact (`turn-NNN.json` with
   `totalUsage.inputTokenDetails.cacheReadTokens` and the
   pruner stub regex inside `initialRequest.messages`) that
   makes the smoke check meaningful, so the natural place
   for it is the start of Task 6. (→ Task 6.)
3. **No artifact rotation / retention policy.** The
   `.keppt/logs/sessions/<date>/` directories grow
   unbounded. Phase 1 accepts this — manual `rm -rf` when
   needed. A retention policy will land alongside the Phase
   2a `SupabaseTurnLogger` (depends on storage choice + GDPR
   regime, both unsettled). Documented in plan line 1100.
4. **Counter holes possible on `writeTurn` failure.** The
   counter is incremented in `nextTurnId()` regardless of
   whether the subsequent `writeTurn` succeeds. A failed
   write leaves the id consumed but no file on disk. Next
   turn proceeds from the incremented counter. Cosmetic
   only — gaps in the `turn-NNN.json` sequence are a
   *signal* (paired with the `turn_log.write_failed` warn
   in `cli-errors.jsonl`) that something went wrong, which
   is the desired observability. Not load-bearing.

## Context for Next Task

- **`TurnLogger` contract** is `writeTurn(record): Promise<void>` —
  write-only, single-param. Phase-2a `SupabaseTurnLogger`
  will slot into this same interface without schema break.
  No `TurnLogReader` in Phase 1; if a client-export workflow
  ever materializes (offline Capacitor edge case), it lands
  behind a separate interface added at that point.
- **`FsTurnLogger` construction is async** (`await
  FsTurnLogger.create(vaultPath, sessionDate)`). After
  construction `nextTurnId()` is sync. The CLI re-creates
  on day rollover; any future code that adds another
  long-lived REPL surface should do the same.
- **`TurnLogContext` is the single integration handoff.**
  Code that wants to write per-turn artifacts builds a
  `TurnLogContext` once after `buildRequest` returns and
  calls `writeTurnArtifact(ctx, outcome)` at each exit
  path. The failure-handling shape
  (`code: "turn_log.write_failed"` warn, no throw) is
  defined exactly once inside the helper.
- **`MODEL_ID` is a top-level constant in
  `apps/cli/src/index.ts`.** A future model-routing task
  (deferred per `feedback_no_stub_classifiers` /
  architecture spec) should replace the constant with a
  per-turn decision but keep the single-source-of-truth
  invariant — the `streamText` call and the artifact's
  `model` field must agree.
- **The `prompt.cache_usage` JSONL line is the compact
  index**; the `turn-NNN.json` artifact is the structured
  deep-dive. Don't drop either — they serve different
  inspection workflows.
- **`main()` is 346 LOC and needs splitting.** See Open
  Issue #1. Strictly internal refactor; touch only
  `apps/cli/src/index.ts` and add `apps/cli/src/turn-loop.ts`.
  Existing test suite covers regression.
- **Plan-text references to `writeTurn(turnId, record)`**
  (line 1012) are now stale — the canonical signature is
  `writeTurn(record)`. The plan block should be patched
  during a future plan-cleanup pass.

## Git State

```text
$ git diff --stat
 apps/cli/src/index.ts      | 64 +++++++++++++++++++++++++++++++++++++++++++++-
 packages/core/src/index.ts |  6 +++++
 2 files changed, 69 insertions(+), 1 deletion(-)

$ git status --short
 M apps/cli/src/index.ts
 M packages/core/src/index.ts
?? apps/cli/src/fs-turn-logger.ts
?? apps/cli/src/turn-artifact.ts
?? apps/cli/test/fs-turn-logger.test.ts
?? apps/cli/test/turn-logger-integration.test.ts
?? handoff.md
?? packages/core/src/__tests__/turn-log.test.ts
?? packages/core/src/turn-log.ts
```

`handoff.md` is the pre-task briefing — delete on commit.
Home-directory dotfiles surfaced by `git status` (sandbox
overlay artifacts) are omitted from the snapshot above.
