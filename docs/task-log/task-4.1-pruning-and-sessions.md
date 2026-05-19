# Task 4.1 — Tool-result pruning + session persistence

**Date:** 2026-05-19
**Plan:** `docs/plans/phase-1-cli.md` — Task 4.1

## Task

Wire the two pieces of MVP-quality conversation handling that
Task 4 explicitly deferred: K=5 + per-file version-drift pruning
of stale `tool-result` parts (`pruneToolResults`), and on-disk
per-day session persistence (`loadOrCreateSession` /
`appendMessages` / `saveSession`). Activate the pruning seam in
`buildRequest` and replace the CLI's in-memory `messages: ModelMessage[]`
with the session-backed array. As part of the same change, adopt a
two-phase save in the CLI — user message persists immediately on
receipt, response messages persist only after a successful stream —
to prepare the Phase-2 web/SSE reconnect story without adding a
new schema field.

## Status

**DONE**

## Files Modified

- `packages/core/src/tool-result-pruning.ts` (new) — exports
  `pruneToolResults(messages, { k, fileVersionAt, messageCreatedAt })`
  plus the `PruneToolResultsOptions` type. Two-pass implementation:
  pre-pass indexes every assistant `tool-call`'s `input.file_path`
  by `toolCallId`; main pass walks the message list, classifies
  each `tool`-role message as aged-out (outside last K) or
  within-K, then per `tool-result` part decides whether to stub.
  Stub form: `output = { type: "text", value: "[Previous ${toolName}
  result — superseded by current state; re-read if needed]" }`.
  `error-text` / `error-json` outputs and non-tool messages are
  never touched. Pure: clones only the messages it actually
  mutates; inputs stay intact.
- `packages/core/src/__tests__/tool-result-pruning.test.ts` (new)
  — 8 tests covering T4.1-AC-01..07 plus a no-mutation pin.
- `packages/core/src/sessions.ts` (new) — exports `Session`,
  `loadOrCreateSession(vaultPath, today: Date)`,
  `appendMessages(session, msgs, createdAtMs)` (in-place),
  `saveSession(vaultPath, session)`, plus the helpers
  `sessionsDir` and `sessionFilePath` used by tests and (later)
  by tooling. Direct-`fs/promises` writes to
  `<vault>/.keppt/sessions/<YYYY-MM-DD>.json` mirroring the Task
  3.6 `cli-error-log.ts` pattern — the GTD layout gate forbids
  `.keppt/` writes for the LLM, system code bypasses the gate
  intentionally. `loadOrCreateSession` does **not** write the
  empty case to disk; the file materializes on the first
  `saveSession`. Uses the existing `formatToday` helper from
  `search.ts` for UTC YYYY-MM-DD day keys (matches the rest of
  the codebase's day convention).
- `packages/core/src/__tests__/sessions.test.ts` (new) — 4 tests
  covering T4.1-AC-08..10 + a "creates the `.keppt/sessions/`
  directory on first save" pin.
- `packages/core/src/request-builder.ts` (modified) — drops the
  `userMessage` parameter, adds required `fileVersionAt` and
  `messageCreatedAt` closure fields to `BuildRequestInput`,
  activates the pruning seam with a hard-coded `PRUNE_K = 5`.
  `messages` is now expected to already contain the new user
  turn (CLI persists it before calling). Function stays pure +
  synchronous; the output shape `{ system, messages }` is
  unchanged. Docstring rewritten to state the no-active-state
  + pruning-as-working-memory contract.
- `packages/core/src/__tests__/request-builder.test.ts` (modified)
  — six tests, partially rewritten: kept the system-prompt /
  profile / no-active-state pins; replaced the
  `userMessage`-flavored tests with a "passes prior messages
  through after pruning" check and an explicit K=5 pin
  (6 read_file tool messages → oldest stubbed, newest 5 verbatim).
- `packages/core/src/index.ts` (modified) — re-exports
  `pruneToolResults` + `PruneToolResultsOptions`,
  `loadOrCreateSession` + `appendMessages` + `saveSession` +
  `sessionsDir` + `sessionFilePath` + `Session`.
- `apps/cli/src/index.ts` (modified) — replaces the in-memory
  `messages: ModelMessage[]` with `const session = await
  loadOrCreateSession(vaultPath, turnNow); const messages =
  session.messages;`. The two-phase save:
  - *Phase 1* — before `streamText`: build
    `const pendingUser: ModelMessage = { role: "user", content:
    line }`, `appendMessages(session, [pendingUser], turnStartedAt)`,
    `await saveSession(...)`. If the Phase-1 save itself throws,
    pop the just-appended entry, route the error through
    `appendCliErrorLog` with `phase: "session_save_phase1"`,
    print a stable summary, reset `activeAbort` / resume
    readline, and `continue` to the next prompt — the turn never
    starts.
  - *Phase 2* — after `await result.response` resolves:
    `appendMessages(session, response.messages, Date.now())`,
    `await saveSession(...)`. The previous `messages.push({ role:
    "user", ... }, ...response.messages)` line is gone.
  - Closures: `fileVersionAt = (p) => statSync(path.join(vaultPath,
    p)).mtimeMs` (catch → undefined), `messageCreatedAt = (msg)
    => session.createdAt[session.messages.indexOf(msg)] ??
    Date.now()`. Passed into `buildRequest`.
  - `buildRequest({ today, messages, fileVersionAt, messageCreatedAt })`
    — no `userMessage` field.
  - `disableParallelToolUse` stays the first key in
    `providerOptions.anthropic`; the workspace-wiring static
    regex was not weakened.
- `apps/cli/test/two-phase-save.test.ts` (new) — 2 tests pinning
  the two-phase contract end-to-end through `streamText` +
  `MockLanguageModelV4`, sidestepping the readline orchestration
  in `main()`. T4.1-AC-12 happy path: after a successful turn,
  on-disk session file has `[userMsg, ...response.messages]` and
  `createdAt.length === messages.length`. T4.1-AC-11 abort path:
  doStream observes the signal and rejects with an `AbortError`;
  the catch arm skips Phase 2; on-disk file ends with the user
  message alone, and `session.messages.at(-1)?.role === "user"`
  holds as the structural "answer missing" indicator.
- `docs/plans/phase-1-cli.md` (modified) — Task 4.1 Integration
  block rewritten to describe the two-phase save and the
  `userMessage`-parameter drop; AC-11 reformulated for the
  two-phase semantics; new AC-12 added (happy-path persistence
  pin); new Key Discovery entry "Two-phase save (user-first,
  response-after-success)" explaining the rationale, the
  `buildRequest` simplification, and the deliberate replacement
  of Task 3 Decision 8's all-or-nothing rollback contract.

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — Task 4.1 block (lines 823–893) +
  preamble + Task-at-a-glance entry for the split rationale.
- `docs/task-log/task-4-system-prompt-request-builder.md` —
  direct predecessor. The `[Task 4.1 seam]` comment in
  `request-builder.ts:52`, the `cacheControl` / first-key
  ordering pin, and Decision #5 (pruning seam as a labeled
  comment + identity assignment, no import) were the binding
  surfaces this task replaces.
- `docs/task-log/task-3.6-cli-error-logging.md` (skim) —
  confirmed the direct-`fs/promises` write pattern to
  `.keppt/logs/` that `sessions.ts` mirrors for
  `.keppt/sessions/`.
- `apps/cli/src/cli-error-log.ts` — pattern source for
  `saveSession` (mkdir + writeFile via `fs/promises`).
- `packages/core/src/search.ts` — reused `formatToday(d: Date):
  string` (UTC YYYY-MM-DD) so sessions match the rest of the
  codebase's day-key convention; not exported from `index.ts`,
  consumed via direct module import.
- `packages/core/src/__tests__/history-log.test.ts` —
  `mkdtemp`/`afterEach` tempDirs pattern reused in
  `sessions.test.ts`.
- `packages/core/src/__tests__/tools.test.ts` —
  `MockLanguageModelV4` + `simulateReadableStream` +
  `sequencedMockModel` patterns reused in `two-phase-save.test.ts`
  (text-chunks helper, ZERO_USAGE shape).
- `apps/cli/test/workspace-wiring.test.ts` — confirmed the
  `disableParallelToolUse` first-key static regex; the
  `providerOptions.anthropic` block ordering was preserved
  unchanged.
- `node_modules/.pnpm/@ai-sdk+provider-utils@5.0.0-beta.30/.../dist/index.d.ts`
  L240–408 — confirmed `ToolResultPart.output: ToolResultOutput`
  is a tagged union (`text` / `json` / `error-text` /
  `error-json` / `execution-denied` / `content`), not a string;
  the stub form had to be `{ type: "text", value: "..." }`, not
  a bare string. Also confirmed `ToolCallPart.input: unknown`
  is JSON-shaped, and `tool-error` parts in stored messages are
  expressed as `tool-result` parts with `output.type ===
  "error-text"` / `error-json`.

## Key Decisions

1. **Pre-pass index for `toolCallId → file_path`.** The pruner
   walks messages twice: once to build a `Map<toolCallId, string
   | undefined>` from every assistant `tool-call` part, then
   once to apply the K + drift rules per `tool-result` part. The
   alternative — look up the originating `tool-call` lazily by
   scanning backwards from each `tool` message — is the same
   O(n·m) work in a different shape and harder to reason about
   when a single tool message has multiple parts. The two-pass
   form makes per-file granularity (T4.1-AC-06) a trivial
   `Map.get`.
2. **Age cap is message-level, drift is part-level.** The plan
   spec ("the block sits before the last K tool-role messages")
   reads K at the message level: if the containing tool message
   is outside the last K tool messages, *all* its `tool-result`
   parts get stubbed by age. Inside the K-window, drift is
   evaluated per `tool-result` part independently (each carries
   its own `toolCallId` → file path). This shape preserves the
   intent of T4.1-AC-06 (same tool message could in principle
   carry multiple results; per-file granularity needs part-level
   drift).
3. **`Number.NEGATIVE_INFINITY` for the no-overflow case.** First
   draft used `+Infinity` as the "no age cutoff" sentinel, which
   inverted the comparison and aged everything out when there
   were fewer tool messages than K. Two failing tests
   (T4.1-AC-02, T4.1-AC-06) surfaced it immediately; fix is a
   single-line constant swap. Worth pinning by test rather than
   by comment — the test names already capture the invariant.
4. **`error-text` / `error-json` outputs are never stubbed.** The
   plan spec says "`tool-error` parts stay untouched (error info
   may remain relevant for the LLM)". In stored `ModelMessage`s
   that maps to `ToolResultPart` whose `output.type` is one of
   the two error variants — that's where SDK-thrown tool
   executes land. Errors carry information the LLM needs to
   recover (e.g. `edit_file` match-failure already returned the
   actual `currentContent`); stubbing would force the LLM to
   re-discover state it just learned about.
5. **`messages` reference identity is the closure contract.**
   `messageCreatedAt = (msg) =>
   session.createdAt[session.messages.indexOf(msg)] ?? Date.now()`
   relies on `messages[i] === session.messages[i]` for the
   lookup to work. As long as the CLI keeps using `const
   messages = session.messages` (aliasing, no clone) and the
   SDK does not mutate `ModelMessage` objects passed into
   `streamText`, this is fine. The fallback to `Date.now()`
   means: a stale reference silently disables the drift check
   for that message — drift returns false, message stays
   verbatim within K. Not a safety issue (worst case: a stale
   result lives one extra turn), but a future refactor that
   reassigns `messages` would silently degrade pruning quality.
   Comment in the CLI captures this.
6. **`fileVersionAt` is `statSync` in the CLI hot path.** The
   call sits inside the per-turn closure and only fires for
   tool-result parts inside the K-window — at most K=5 stat
   calls per turn, each on a small daily/task file in a local
   FS. The async alternative would have forced `pruneToolResults`
   to be async, which makes `buildRequest` async, which fights
   the "pure synchronous transform" contract Task 4 just
   simplified into. Stays sync; the cost is acceptable for
   Phase 1.
7. **Two-phase save adopted now, not deferred.** Originally the
   plan said "after each successful turn: `appendMessages(...,
   [pendingUser, ...response.messages], Date.now()); save`."
   Discussion mid-task identified that the Phase-2 web/SSE
   client needs to show "your last question is still
   unanswered" on reconnect after a closed tab. The cheapest
   way to support that without a schema field is the structural
   property `session.messages.at(-1)?.role === "user"`, which
   requires persisting the user message *before* the stream
   starts. Cost in the CLI: one extra `saveSession` call per
   turn + a small error path if Phase 1 fails. Benefit:
   `buildRequest` drops its `userMessage` parameter (the user
   message is already in `messages`), shrinking the public
   surface area. Trade-off explicit: this **replaces** Task 3
   Decision 8's "all-or-nothing per turn" rollback contract.
8. **Phase-1 failure short-circuits the turn.** If `saveSession`
   throws during the Phase-1 write (disk full, permission
   error), the just-appended user message is popped from
   memory, the error is logged through the existing
   `appendCliErrorLog` path with `phase: "session_save_phase1"`,
   and the loop returns to the readline prompt without ever
   invoking `streamText`. The alternative — proceeding to the
   stream and saving twice in Phase 2 — would silently turn a
   broken vault into a working-conversation-but-no-history
   scenario that's painful to diagnose later. Refusing to
   proceed on Phase-1 save failure is the conservative choice
   and matches Task 3.6's "vault writes are the contract"
   posture.
9. **No "in-flight turn" indicator in the session schema.** The
   alternative would have been a `pendingTurn: { startedAt }`
   field that the CLI sets in Phase 1 and clears in Phase 2.
   Rejected per the discussion: the indicator that matters for
   the Phase-2 web client is "is there a `streamText` call
   running on a server right now?", which lives in server
   memory and cannot be inferred from disk anyway — server
   crashes, multiple replicas, and reconnects all create cases
   where the disk flag is true but no live stream exists.
   `session.messages.at(-1)?.role === "user"` captures the
   only on-disk-derivable property correctly ("the answer is
   missing"), and the server's live-status query is a separate
   runtime concern that doesn't belong in the persistence
   schema. Matches the
   [`phase1_pragmatism`](../../home/lutz/.claude/projects/-home-lutz-projects-keppt-app/memory/feedback_phase1_pragmatism.md)
   pattern.
10. **`MockLanguageModelV4` abort simulation: throw `AbortError`
    from `doStream`.** Cleanest mid-stream abort reproduction:
    inside `doStream`, call `controller.abort()`, then check
    `abortSignal?.aborted` and throw `Object.assign(new
    Error("aborted"), { name: "AbortError" })`. The SDK
    propagates that as a stream-level error, the test's `for
    await` loop's `case "error"` arm picks it up, the catch arm
    skips Phase 2 — the same shape the production CLI's catch
    arm hits when the user presses Ctrl+C during a real
    Anthropic stream.
11. **Behavioral integration test, not a static source regex,
    for AC-11/AC-12.** `workspace-wiring.test.ts` pins the
    `disableParallelToolUse` first-key invariant by grep — fine
    for that one-line static fact. The two-phase save is a
    multi-step sequence (append→save→stream→[append→save]) where
    a regex would have lots of false positives. The
    `two-phase-save.test.ts` integration test reproduces the
    sequence with `streamText` + a scripted `MockLanguageModelV4`
    and asserts the on-disk session file shape after both the
    happy path and the abort path. If the CLI ever wires
    Phase 1 / Phase 2 in the wrong order or drops one, the
    asserted disk contents diverge.

## Test Evidence

```text
$ pnpm -r typecheck
packages/core typecheck: Done
apps/cli   typecheck:   Done

$ pnpm --filter @gtd/core test
 ✓ src/__tests__/system-prompt.test.ts                (4 tests)
 ✓ src/__tests__/input-validation.test.ts             (5 tests)
 ✓ src/__tests__/edit.test.ts                        (11 tests)
 ✓ src/__tests__/tool-result-pruning.test.ts          (8 tests)
 ✓ src/__tests__/request-builder.test.ts              (6 tests)
 ✓ src/__tests__/logging.test.ts                     (10 tests)
 ✓ src/__tests__/history-log.test.ts                  (2 tests)
 ✓ src/__tests__/gtd-layout.test.ts                  (14 tests)
 ✓ src/__tests__/sessions.test.ts                     (4 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts   (60 tests)
 ✓ src/__tests__/local-file-repository.test.ts       (73 tests)
 ✓ src/__tests__/retry-budget.test.ts                 (8 tests)
 ✓ src/__tests__/tools.test.ts                       (13 tests)

 Test Files  13 passed (13)
      Tests  218 passed (218)

$ pnpm --filter @gtd/cli test
 ✓ test/cli-errors.test.ts        (3 tests)
 ✓ test/cli-error-log.test.ts     (1 test)
 ✓ test/workspace-wiring.test.ts  (2 tests)
 ✓ test/two-phase-save.test.ts    (2 tests)
 ✓ test/cli-logger.test.ts        (3 tests)

 Test Files  5 passed (5)
      Tests  11 passed (11)
```

Core test growth: 206 → 218 (+12). Breakdown: +8
tool-result-pruning, +4 sessions; request-builder stays at 6
(rewritten test mix, same count). CLI test growth: 9 → 11 (+2,
new `two-phase-save.test.ts`).

Invariants re-checked:

```text
$ grep -rn 'console\.' packages/core/src/ apps/cli/src/ | grep -v __tests__ | wc -l
0
```

`workspace-wiring.test.ts` static regex
(`disableParallelToolUse:\s*true` as first key inside
`providerOptions.anthropic`) — still green; the closure additions
sit outside the `providerOptions` literal.

Manual smoke against the real Anthropic API + the user's vault
was **not** run as part of this task — Task 4.1's contract is
testable in full against the SDK's `MockLanguageModelV4`, and
Task 4's still-outstanding T4-AC-14 smoke covers the
end-to-end-against-real-API surface (see Open Issues).

## Acceptance Coverage

- **T4.1-AC-01:** passed — `tool-result-pruning.test.ts > stubs
  the oldest 5 of 10 tool messages when no drift, leaves the
  newest 5 verbatim`.
- **T4.1-AC-02:** passed — `tool-result-pruning.test.ts > leaves
  user and assistant-with-tool-call messages untouched`. Uses
  `toBe` reference identity on the unchanged tool message too.
- **T4.1-AC-03:** passed — `tool-result-pruning.test.ts > leaves
  an assistant message with mixed text + tool-call parts
  unchanged`.
- **T4.1-AC-04:** passed — `tool-result-pruning.test.ts >
  preserves tool-error parts (output.type === 'error-text')`.
- **T4.1-AC-05:** passed — `tool-result-pruning.test.ts > stubs
  a within-K tool-result when fileVersionAt > messageCreatedAt
  (drift overrides K-keep)`.
- **T4.1-AC-06:** passed — `tool-result-pruning.test.ts >
  per-file granularity — drift on focus.md stubs that result;
  inbox.md result stays`.
- **T4.1-AC-07:** passed — `tool-result-pruning.test.ts >
  list_files / search_files results stay verbatim within K (no
  file_path to look up); stubbed only when outside K`.
- **T4.1-AC-08:** passed — `sessions.test.ts > loadOrCreateSession
  in an empty vault returns an empty session and does not yet
  create the file`. Slightly stronger than the AC text: also
  asserts `stat(file).code === "ENOENT"` (the empty case never
  touches disk).
- **T4.1-AC-09:** passed — `sessions.test.ts > append + save →
  load returns identical messages and createdAt arrays`.
- **T4.1-AC-10:** passed — `sessions.test.ts > a new day creates
  a new session file alongside the previous day's`.
- **T4.1-AC-11:** passed — `apps/cli/test/two-phase-save.test.ts
  > stream-abort safety — aborted turn ends with user message on
  disk and no assistant/tool messages from that turn`.
  Reformulated from the original "session file unchanged from
  pre-turn state" wording — see Decision #7 / Key Discoveries
  entry on Two-phase save in `phase-1-cli.md`.
- **T4.1-AC-12:** passed — `apps/cli/test/two-phase-save.test.ts
  > happy path — successful turn ends with user + response
  messages on disk, parallel createdAt arrays`. New AC added
  this session to pin the happy-path counterpart of the new
  AC-11.

## Addendum 2026-05-19 — Pre-commit redesign (Codex adversarial review)

A Codex adversarial review of the in-flight Task 4.1 diff (pre-commit) returned `needs-attention` with three concrete bugs in the session layer; user discussion additionally surfaced a layering smell in `sessions.ts`. All four are folded into Task 4.1 before commit — they sit inside Task 4.1's own artifacts, so a separate Task 4.2 immediately rewriting them would be churn.

### Findings folded in

1. **High — Phase-2 save failure leaves unsaved state live in memory.** Phase 2 appended `response.messages` to `session` *before* awaiting `saveSession`. If the write failed, the in-memory session held messages that never landed on disk; the next successful Phase-1 save would persist them anyway, breaking the two-phase contract.
2. **Medium — UTC day-rollover contamination.** `session` was loaded once at startup and aliased into the request-builder closures; a CLI that crosses UTC midnight would append new turns to yesterday's session file, and the new day's `YYYY-MM-DD.json` would never appear until restart.
3. **Medium — Non-atomic write.** `saveSession` overwrote the final path directly via `writeFile`; a crash, SIGKILL, or ENOSPC mid-write would truncate the only durable conversation log.
4. **Layering smell — `packages/core/src/sessions.ts` imported `node:fs/promises`.** Core is shared with the Phase-2a web/Supabase target, where there is no `fs`. The original Task 4.1 plan ratified this as "same pattern as `.keppt/logs/`", but `cli-error-log.ts` lives in `apps/cli` — `sessions.ts` lived in `packages/core` and was the layering violation, not a parallel.

All four share the same root cause: `Session` was modeled as a passive record (interface + helper functions), and callers were responsible for invariants the data structure should own — "remember to truncate `messages` and `createdAt` together on save failure", "remember to compare `formatToday(turnNow)` against `session.date` per turn", "remember that `messages.length === createdAt.length`". Textbook anemic-domain-model symptoms.

### Redesign

- **`Session` is now a class**, not a passive record:
  - `readonly date: string` — entity identity.
  - Private `_messages` / `_createdAt` parallel arrays; the `length === length` invariant is the class's responsibility.
  - `get messages(): readonly ModelMessage[]` — read-only view for `streamText` / `buildRequest`.
  - `createdAtOf(msg)` — encapsulates the `indexOf` lookup that was previously inlined in the CLI.
  - `appendTurn(messages, createdAtMs)` — single append-many entry point; the only way to mutate the session.
  - `snapshot(): () => void` — returns a `restore()` closure that truncates both arrays back to snapshot lengths. The transactional seam used around each `save`.
  - `toJSON()` / `static fromJSON(raw)` — JSON roundtrip with shape + invariant validation on load. `JSON.stringify(session)` produces the on-disk shape directly; `fromJSON` rejects malformed input rather than constructing an inconsistent session.
  - `static createEmpty(date)` — empty-session constructor.
- **Persistence lives behind `SessionStore` interface in `packages/core/src/sessions.ts`** (no `node:fs` import). The CLI provides `apps/cli/src/fs-session-store.ts` (`class FsSessionStore implements SessionStore`); Phase 2a will provide a Supabase-backed implementation against the `messages` table. `FileRepository` continues to be the storage abstraction for LLM-visible vault files; `SessionStore` is the parallel abstraction for the system-owned session log.
- **`FsSessionStore.save` is atomic via tmp + rename**: write to `<final>.tmp.<pid>.<Date.now()>`, then `await rename(tmp, final)`. POSIX atomic replace within the same filesystem closes the partial-write data-loss hole. `fsync` deliberately omitted — Phase 1 trades the post-crash data-loss window for throughput, same trade-off as `cli-error-log.ts` JSONL appends.
- **`FsSessionStore` constructor takes an injectable `fs: FsSessionStoreOps`** (subset of `node:fs/promises`). Production callers use the default; tests inject a wrapper that records calls and conditionally fails. ESM module namespaces are frozen, so `vi.spyOn(fs, "rename")` would fail with `Cannot redefine property: rename` — the DI seam is the simplest workaround.
- **CLI day-rollover guard**: `let session` (not `const`) at top of `main`; per turn, `if (formatToday(turnNow) !== session.date) session = await store.loadOrCreate(todayKey)`. Closes the day-rollover gap. A `session_load_rollover` error path covers the rare load failure at boundary crossing.
- **Both Phase-1 and Phase-2 saves wrap `appendTurn` in `session.snapshot()` / restore-on-failure.** A save rejection rolls the in-memory state back to the pre-`appendTurn` lengths; the next turn cannot build a prompt from messages that never reached disk.
- **Logging split**: session-save failures land in `cli-error-log.ts` with `phase: "session_save_phase1" | "session_save_phase2"` (plus `phase: "session_load_rollover"`), distinct from `phase: "stream"`. A streamText exception means the model failed; a save exception means the model succeeded but we couldn't persist it. Conflating them defeats post-mortem.
- **`pruneToolResults` + `buildRequest` accept `readonly ModelMessage[]`.** Lets callers pass `Session.messages` directly without a cast; the pruner returns a fresh mutable array for `streamText`.
- **`formatToday` is now exported from `packages/core/src/index.ts`.** It was already in `search.ts`; the day-rollover guard in the CLI needs it.

### File changes (delta on top of the original 4.1 diff)

- `packages/core/src/sessions.ts` — fully rewritten: `class Session` + `interface SessionStore`. No `node:fs` import. Removed `appendMessages` / `loadOrCreateSession` / `saveSession` / `sessionsDir` / `sessionFilePath` (their roles moved to `Session` methods + `FsSessionStore`).
- `packages/core/src/index.ts` — re-exports updated: drops the function-style session helpers; exports `Session` (class), `SessionStore` (interface), `formatToday`.
- `packages/core/src/request-builder.ts` — `BuildRequestInput.messages` widened to `readonly ModelMessage[]`.
- `packages/core/src/tool-result-pruning.ts` — `pruneToolResults` signature widened to `readonly ModelMessage[]`.
- `packages/core/src/__tests__/sessions.test.ts` — rewritten for class API. 14 tests covering: `createEmpty`, `appendTurn` (single + multi-call), `createdAtOf` (hit + miss), `messages` identity, `snapshot()` rollback (T4.1-AC-13 backbone), `toJSON` / `fromJSON` roundtrip, and four `fromJSON` rejection paths (not-object, missing date, non-array messages, non-number createdAt, length-mismatch invariant violation).
- `apps/cli/src/fs-session-store.ts` (new) — `FsSessionStore` with atomic write + injectable `fs`.
- `apps/cli/test/fs-session-store.test.ts` (new) — 7 tests: T4.1-AC-08 (no-write on empty load), T4.1-AC-09 (roundtrip), T4.1-AC-10 (per-day files), `.keppt/sessions` dir creation, T4.1-AC-15 (tmp+rename via recording fs), interrupted-rename safety (previous good file intact), malformed-JSON load rethrow.
- `apps/cli/test/two-phase-save.test.ts` — rewritten against the new class + store. 4 tests: T4.1-AC-11 (abort), T4.1-AC-12 (happy path), T4.1-AC-13 (Phase-2 save rollback via `failingStore` + `snapshot`/`restore`), T4.1-AC-14 (day-rollover into separate files).
- `apps/cli/src/index.ts` — replaced session imports; `let session` + day-rollover guard; both phases wrap `snapshot` + `appendTurn` + `save` with `restore()` on failure; new `session_save_phase2` error path; existing `session_save_phase1` path now uses `restore()` instead of `pop`.
- `docs/plans/phase-1-cli.md` — Task 4.1 section restructured: pre-commit redesign note in the post-split blockquote; `sessions.ts` bullet replaced with the class skeleton; new `fs-session-store.ts` bullet; Integration block rewritten with the day-rollover guard and snapshot/restore code shape; new T4.1-AC-13, T4.1-AC-14, T4.1-AC-15; Key Locations + Key Discoveries extended.

### New acceptance criteria (in addition to the original AC-01..12)

- **T4.1-AC-13:** passed — `apps/cli/test/two-phase-save.test.ts > Phase-2 save failure — restore() rolls in-memory session back to its pre-Phase-2 state`. Also exercised at the class-API level by `sessions.test.ts > snapshot() returns a restore() that rolls back appendTurn`.
- **T4.1-AC-14:** passed — `apps/cli/test/two-phase-save.test.ts > day-rollover — two turns across UTC midnight land in separate per-day session files`.
- **T4.1-AC-15:** passed — `apps/cli/test/fs-session-store.test.ts > save writes via a same-directory tmp file + rename (atomic against partial writes)`. Reinforced by `> save leaves the previous good file intact when an interrupted rename fails`.

### Additional decisions

12. **OOP shape adopted for `Session`, not for `ModelMessage`.** The functional-record style is still the right shape for value objects (a `ModelMessage`, a `FilePath`) — they're plain data passing through boundaries with no identity, no invariants, no encapsulated lifecycle. `Session` is an *entity*: it has identity (`date`), mutable state, an invariant, and operations that compose into transactions. The choice is per-shape, not per-codebase. The Codex review surfaced three bugs all expressible as "caller forgot to maintain an invariant the data structure should own" — proof that the previous record-style was the wrong shape for this thing in particular.
13. **`SessionStore` interface in core, `FsSessionStore` in `apps/cli`.** The original 4.1 plan rationalized direct-`fs` in `packages/core/src/sessions.ts` as "same pattern as `.keppt/logs/`". That was wrong on the wider lens: `cli-error-log.ts` lives in `apps/cli`, so its direct-`fs` is fine; `sessions.ts` lived in `packages/core`, which is shared with the Phase-2a web/Supabase target where there is no `node:fs`. Fix is structural — interface in core, implementation in CLI, Supabase implementation slots into the same interface in Phase 2a. This is the same pattern as `FileRepository` (interface in core, `LocalFileRepository` in core, future Supabase repo on the same interface).
14. **`snapshot()` / `restore()` over `appendTurn` returning a transactional handle.** Considered: `const handle = session.beginTurn(); handle.append(...); await handle.commit(store);` Rejected — the `commit` would need `store` injected (`session` shouldn't know `store`), and the API surface grows for a 5-line caller pattern. The `snapshot() → restore()` pair lives entirely on `Session`, the caller wraps `save` with whatever error handling is appropriate, and the seam stays small. The two callsites in the CLI are nearly identical, which is the load-bearing simplicity.
15. **Atomic write via tmp + rename, no fsync.** Same trade-off `cli-error-log.ts` already makes for JSONL appends — the throughput cost of `fsync` is paid every turn, the post-crash data-loss window is small (≤ one turn). Phase 1 prioritizes throughput; Phase 2a backend will likely be database-backed anyway, so the fsync decision doesn't transfer. Recorded here so a future "make it durable" task knows where to start.
16. **`FsSessionStore` constructor `fs` parameter is for testability, not pluggability.** Production callers always use the default `node:fs/promises`. The injection seam exists because ESM namespace properties are frozen — `vi.spyOn(fs, "rename")` throws `Cannot redefine property: rename` on `node:fs/promises`, so a constructor parameter is the simplest test seam that doesn't require module-level `vi.mock` (which would apply to the whole test file and complicate the other tests' use of `mkdtemp` / `readFile`). The cost (one extra constructor parameter, one exported `FsSessionStoreOps` type) is trivial; the benefit is two clear tests for the atomic-write contract.
17. **Day-rollover guard at turn start, not via filesystem watcher.** Considered: `fs.watch(.keppt/sessions/)` or a periodic interval. Rejected — a CLI that's idle at the prompt doesn't need to react to day changes until the user types something; the per-turn check is free (one string compare) and aligns with the existing `turnNow = new Date()` rebuild at turn start. The cost of doing it any other way is complexity for no benefit.

## Addendum 2026-05-19 — Second Codex pass (post-redesign)

A second adversarial review against the OOP-shaped diff surfaced two more findings. Both are folded in (one as a code fix, one as a documented out-of-scope assumption) before commit.

### Finding 1 (high) — Post-stream timestamps hide stale reads after same-turn edits

`apps/cli/src/index.ts` Phase 2 stamped `response.messages` with `Date.now()` after `await result.response`. The pruner's drift check (`fileVersionAt > messageCreatedAt`) then failed for the most common flow:

```
t=50    turnStartedAt
t=100   read_file("inbox.md") runs              ← tool-result stamped with t=300 (wrong)
t=200   edit_file("inbox.md") runs              ← file.mtime = 200
t=300   stream ends, Date.now() = 300
t=300   appendTurn(response.messages, 300)      ← read-result.createdAt = 300

next turn's pruner: fileVersionAt(inbox.md) > read.createdAt
                    200 > 300? false → no drift → stale read kept verbatim
```

The LLM would then see a stale `read_file` snapshot from a file it had already edited, and could duplicate work or overwrite changes.

**Fix:** stamp Phase-2 response messages with `turnStartedAt` (captured before `streamText`):

```ts
session.appendTurn(response.messages, turnStartedAt);
```

`turnStartedAt` is guaranteed strictly less than any mtime produced during the turn (single wall-clock source, process-internal ordering). The next-turn drift check then fires correctly: `200 > 50 → true → stub`.

**Conservative-bound trade-off, accepted:** all Phase-2 response messages share one timestamp, so a read of file A in turn N gets the same stamp as an edit of file B in the same turn. This does *not* cross-invalidate because the pruner's drift check is per-file (joined via `toolCallId → tool-call.input.file_path`). Per-message stamping (capture each tool-result during `for await (const part of result.fullStream)`) would be more precise but offers no correctness gain for this contract — added complexity for no real benefit.

New acceptance criterion: **T4.1-AC-16** — same-turn read-then-edit drift, asserted via `apps/cli/test/two-phase-save.test.ts > same-turn read-then-edit — next turn's pruner stubs the stale read because Phase 2 stamps with turnStartedAt`. The test simulates the full scenario with a real file on disk + `utimes`-controlled mtime to bisect "before vs. during the turn"; asserts the read-result is stubbed by the pruner.

### Finding 2 (medium → reframed out-of-scope) — Whole-session save loses turns from concurrent CLI processes

Codex flagged that `FsSessionStore.save` uses atomic rename for partial-write safety, but the load-modify-save sequence at the caller level still has a last-writer-wins race between two CLI processes against the same `<vault>/<date>`:

1. Process A loads session = `[m1, m2]`.
2. Process B loads session = `[m1, m2]`.
3. A appends turn → saves `[m1, m2, userA, assistA]`.
4. B appends turn → saves `[m1, m2, userB, assistB]`. A's turn is lost.

**Reframed during discussion:** this is not primarily a persistence bug. Two parallel turns into one session produce *semantically incoherent LLM context* regardless of whether persistence preserves both:

- Each `streamText` call sees a stale snapshot of `session.messages` (loaded before the parallel turn arrived).
- Each turn's answer is generated without knowledge of the parallel turn.
- The merged on-disk history would interleave two unrelated threads.

Persistence-level locking would prevent data loss but not the semantic incoherence — `AssistA` was generated as if `UserB` did not exist, and vice versa. The conversation is already broken before any save happens.

**Decision: scope out of Phase 1, document assumption.** Three reasons:

1. **The Phase 1 CLI is a single-user single-instance testballoon.** The use case "two CLIs against the same vault" does not exist in the intended deployment.
2. **Phase 2a solves it structurally at both layers.** Persistence: append-only `messages` rows (`INSERT` semantics, no load-modify-save, last-writer-wins impossible). Semantics: `sessions.in_flight_turn_id uuid` with SSE-broadcast turn-locking — only one in-flight turn per session, enforced at the API boundary, second client's UI shows "turn in progress on another device".
3. **A Phase-1 filesystem lock (pidfile or similar) would be throwaway engineering.** The Phase-2a fix is a structural data-model change, not a transferable concurrency primitive. Adding a pidfile to `FsSessionStore` now means writing code that dies on Phase-2a migration.

**What landed instead:** a block comment on `FsSessionStore.save` documenting the single-user assumption, plus a Key Discovery in the plan + this section in the wrap-up. If a "two CLI instances per vault" use case ever materializes pre-Phase-2a, the cheap fix is a pidfile (`<vault>/.keppt/sessions/.in-flight` with `{ pid, startedAt }`, reject new instance if a live PID holds the lock); ~20 LOC. Not done now because the use case does not exist.

Matches the [`feedback_phase1_pragmatism`](../../home/lutz/.claude/projects/-home-lutz-projects-keppt-app/memory/feedback_phase1_pragmatism.md) pattern: when worst-case is bounded (lost turn, visible to user, no silent vault corruption) and a deterministic structural fix exists in Phase 2a (DB INSERT + in_flight_turn_id), prefer documented open-issue + Phase-2a-trigger over speculative SDK enforcement.

### Decisions (continued)

18. **Conservative single-stamp over per-message timestamps for Phase 2.** Per-message stamping (`Date.now()` captured as each `tool-result` stream part arrives) would be marginally more precise but offers no correctness gain — drift is per-file in the pruner, and `turnStartedAt` is already strictly less than any same-turn mtime. The conservative single-stamp is simpler code, smaller surface, and identical correctness for the contract that matters.
19. **Single-user assumption documented in code, not enforced.** `FsSessionStore.save` carries a block comment explaining why no locking. The alternative — adding a pidfile or `O_EXCL` lock — would be ~20 LOC of throwaway engineering for a use case that doesn't exist, and the Phase-2a fix replaces this layer entirely. If a multi-instance scenario ever shows up pre-Phase-2a, the pidfile guard is the obvious 20-LOC add.

## Open Issues

0. **Multi-instance same-session use case is out of scope for Phase 1.** Two CLI processes against the same `<vault>/<date>` would lose a turn (persistence layer) AND produce semantically incoherent LLM context (each `streamText` sees a stale snapshot). Single-user assumption documented in `apps/cli/src/fs-session-store.ts` `save` block comment and the plan's Key Discoveries. Phase 2a solves both layers structurally: append-only `messages` table + `sessions.in_flight_turn_id` with SSE turn-locking. **Trigger to revisit pre-Phase-2a:** any actual report of a user running two CLIs concurrently. Cheap fix path (if ever needed): pidfile guard in `.keppt/sessions/.in-flight` with `{ pid, startedAt }`; ~20 LOC. Not done now because the use case does not exist.

1. **T4-AC-14 manual smoke is still unrun.** Inherited from
   Task 4 — neither Task 4.1 work nor the two-phase save
   change requires a real-API run to validate the modules
   themselves, but the cache-write-then-cache-read transcript
   against Claude Haiku 4.5 + the user's vault remains the
   only way to confirm the `ephemeral` `cacheControl` marker
   actually produces reads in production. Plan to fold into
   the next interactive Task-5 / Task-6 session against the
   real vault. (→ Task 4 follow-up — see
   `docs/task-log/task-4-system-prompt-request-builder.md`
   Open Issues 1, 3, 6, 8 — all still open.)

2. **`messageCreatedAt` reference-identity fragility.** The
   closure relies on `session.messages` not being
   reference-replaced by a future refactor. If `messages =
   [...messages]` ever shows up between
   `loadOrCreateSession` and the `buildRequest` call,
   `indexOf` returns -1 and every tool-result inside the
   K-window silently falls back to `Date.now()` — drift check
   evaluates against "right now" and always returns false.
   Catchable in code review; not failing any current test.
   Comment in `apps/cli/src/index.ts` captures the assumption.
   (→ Task 6 hardening, only if it shows up.)

3. **`statSync` in the per-turn hot path.** Up to K=5 sync stat
   calls per turn against the local FS. Real-vault smoke
   should confirm this isn't a visible latency floor; if it
   ever is, the per-turn `fileVersionAt` could memoize results
   in a `Map` reset at turn start. Not load-bearing for Phase
   1. (→ Task 6 / Phase 2 backend.)

4. **No "in-flight server-side turn" runtime signal yet.** The
   schema deliberately does not carry an indicator (Decision
   #9). The Phase-2 web/SSE path needs one runtime — almost
   certainly via an SSE event or a separate
   `/api/sessions/:id/status` route. Captured for the Phase-2
   plan; nothing actionable in Phase 1.

5. **Session switching across days is not in MVP.** Today's
   session file is loaded; past sessions sit on disk
   untouched. Phase-2a brings the UI surface. The on-disk
   layout (`<vault>/.keppt/sessions/YYYY-MM-DD.json`) already
   supports it — no schema change needed when that lands.

## Context for Next Task

- **`buildRequest` signature contract** is now
  `({ today, profile, messages, fileVersionAt, messageCreatedAt })
  → { system, messages }`. The `userMessage` parameter is gone;
  callers must include the new user turn at the tail of
  `messages` before invoking. Pruning is applied
  unconditionally with `k = 5`. Downstream consumers (Task 5
  daily-note flow, Task 5.5 vault readiness) call
  `buildRequest` through the CLI and don't directly construct
  the input — but if a future task adds a new entry point
  (e.g. Phase-2 HTTP handler), it must materialize both
  closures and pass `messages` already including the user
  turn.

- **Session file layout:** `<vault>/.keppt/sessions/YYYY-MM-DD.json`
  with `{ date: string, messages: ModelMessage[], createdAt:
  number[] }`. `messages` and `createdAt` are guaranteed
  parallel after every `appendMessages` call. Day key is UTC
  via `formatToday(date)` — matches `search.ts` /
  `gtd-layout.ts`. Future archive / rollover tasks (Task 5,
  Task 5.5) should treat this file as opaque-to-the-LLM
  (canRead/canWrite already block `.keppt/`).

- **Two-phase save contract:** the CLI persists the user
  message *before* `streamText` and the response messages
  *after* the stream completes. On abort, the user message
  stays on disk and `session.messages.at(-1)?.role === "user"`
  is the structural "this turn was abandoned" indicator. Any
  future code that constructs or extends a session must keep
  this property — never persist a response without persisting
  the originating user message first, never overwrite the
  user message with the response before success. Task 5 +
  5.5 do not touch this surface directly but should respect
  the invariant if they ever add another save site (they
  currently don't need one).

- **Pruning is the only working-memory mechanism** (Task 4
  amendment continues to hold). K=5 is fixed in
  `request-builder.ts`'s `PRUNE_K`. If a future task changes
  the value, the request-builder K-pin test will fail loudly
  with a count mismatch — that's intentional, the choice
  belongs to the spec/plan.

- **Task 3.9 invariants still hold.** Zero `console.*` in
  `packages/core/src/` and `apps/cli/src/`;
  `redactSensitiveHeaders` remains the single source of
  truth; `cliLogger` is wired into `LocalFileRepository` and
  `buildTools`. Task 4.1 did not touch any of that.

- **The `disableParallelToolUse: true` first-key ordering**
  inside `providerOptions.anthropic` is still load-bearing.
  Task 4.1's CLI changes sit outside the literal — the
  workspace-wiring static regex is unaffected — but anyone
  adding another anthropic provider option must continue to
  keep `disableParallelToolUse` first.

- **Plan-text references to `pendingUser`-from-Task-3** are
  now stale. Task 3 Decision 8 (`task-3-cli-vercel-ai-sdk.md`)
  said "rollback to pre-turn state on stream error" — that
  contract is deliberately replaced by the two-phase save.
  Any future log that quotes Decision 8 should also reference
  this task's Decision #7 + the plan's new Key Discoveries
  entry.

## Git State

```text
$ git diff --stat
 apps/cli/src/index.ts                              |  72 ++++++++++++-
 docs/plans/phase-1-cli.md                          |  13 ++-
 packages/core/src/__tests__/request-builder.test.ts | 113 +++++++++++++++------
 packages/core/src/index.ts                         |  12 +++
 packages/core/src/request-builder.ts               |  47 ++++++---
 5 files changed, 205 insertions(+), 52 deletions(-)

$ git status --short
 M apps/cli/src/index.ts
 M docs/plans/phase-1-cli.md
 M packages/core/src/__tests__/request-builder.test.ts
 M packages/core/src/index.ts
 M packages/core/src/request-builder.ts
?? apps/cli/test/two-phase-save.test.ts
?? packages/core/src/__tests__/sessions.test.ts
?? packages/core/src/__tests__/tool-result-pruning.test.ts
?? packages/core/src/sessions.ts
?? packages/core/src/tool-result-pruning.ts
```

(Home-directory dotfiles `.bashrc`, `.zshrc`, `.gitconfig`,
`.mcp.json` etc. and `.vscode/`/`.idea/` workspace metadata are
surfaced by `git status` but are not part of this repo's working
set; omitted from the snapshot above.)
