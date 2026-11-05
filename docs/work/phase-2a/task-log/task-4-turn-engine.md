# Task 4 — Extract the shared turn engine from the CLI into core

### Task
Move the CLI's user-turn pipeline (two-phase save, `streamText`, stream consumption, debug artifact) into `packages/core` as `runTurn` behind a runtime-neutral `TurnSink` and interface-typed deps, and shrink `apps/cli/src/turn-loop.ts` to an adapter — behavior-preserving, with the existing CLI suite as the safety net.

### Status
DONE. Independent review completed: `/review quick` (2026-11-05, clean session) found no hotspots; of its three blind spots two are closed by tests (decision 17) and the third — the real CLI run, T4-AC-08 — by the user's dogfooding turn (decision 19). CodeScene gate (`/cs`, 2026-11-05, own session) run on the reviewed state: the introduced `executeTurn` complexity is fixed (decision 16), the `consumeStream` finding accepted with reason (decision 18), 11 pre-existing findings landed in `docs/tech-debt-backlog.md`. Still open: a gate re-run after the recorder extraction (own session, user's call). All suites green on the final code state (core 336 · cli 54; core, cli, server and api typecheck clean; core built). One deliberate behavior change in an edge case (decision 1): an abort after a completed tool step no longer persists the partial turn — the old CLI violated its own documented contract there. Ready for `/commit 4` once the gate re-run is done or waived.

### Files Modified
- `packages/core/src/turn-engine.ts` (new) — `runTurn(deps, turn)`: Phase-1 save with rollback, `buildRequest`, `streamText` (same `stopWhen`/`onError`), stream consumption into a `TurnSink`, Phase-2 save, optional debug artifact via `createTurnRecorder` (decision 16); resolves with `TurnResult`. Also the `ProviderOptions` alias.
- `packages/core/src/turn-sink.ts` (new) — `TurnSink` (sync observer, id-first tool events, no output payload), `TurnResult`, `TurnErrorPhase`.
- `packages/core/src/turn-artifact.ts` (moved from `apps/cli/src/turn-artifact.ts`) — `writeTurnArtifact` + `TurnLogContext`; field `cliLogger` → `logger`; relative imports; comment no longer mentions the REPL.
- `packages/core/src/fs-session-store.ts` (moved from `apps/cli/src/fs-session-store.ts`) — code unchanged; doc comment corrected (core is not `node:fs`-free, the browser-safe surface is `@gtd/core/layout`).
- `packages/core/src/__tests__/fs-session-store.test.ts` (moved from `apps/cli/test/fs-session-store.test.ts`) — import path only.
- `packages/core/src/__tests__/turn-engine.test.ts` (new) — 12 engine tests: AC-02…07, Phase-2 failure, artifact, provider failure, file-tool validation failure (the last two from the review, decision 17) with `MockLanguageModelV4`, `InMemoryFileRepository`, a test-local `MemorySessionStore` and a recording sink.
- `packages/core/src/turn-log.ts` (modified) — `TurnLogger.nextTurnId()` added; `NoopTurnLogger`/`MemoryTurnLogger` count `turn-001`, `turn-002`, ….
- `packages/core/src/sessions.ts` (modified) — two doc comments that claimed core has no `node:fs` and the CLI owns `FsSessionStore`.
- `packages/core/src/index.ts` (modified) — barrel: `FsSessionStore`, `FsSessionStoreOps`, `runTurn`, `ProviderOptions`, `TurnEngineDeps`, `TurnInput`, `TurnErrorPhase`, `TurnResult`, `TurnSink`, `writeTurnArtifact`, `TurnLogContext`.
- `apps/cli/src/turn-loop.ts` (modified, 439 → 240 lines) — adapter: clock snapshot, day-rollover guard, terminal-backed sink (`createTerminalSink`), `runTurn` call, result rendering (`renderTurnResult`, `reportError`); `MODEL_ID` re-export dropped; `TurnDeps` typed against `FileRepository`/`SessionStore`.
- `apps/cli/src/index.ts` (modified) — `FsSessionStore` imported from `@gtd/core`.
- `apps/cli/src/auto-replan-opener.ts` (modified) — `writeTurnArtifact`/`TurnLogContext` from `@gtd/core`; ctx field `logger`. Otherwise untouched (Task 5).
- `apps/cli/src/fs-session-store.ts`, `apps/cli/src/turn-artifact.ts`, `apps/cli/test/fs-session-store.test.ts` (deleted) — moved, see above.
- `apps/cli/test/turn-loop-rendering.test.ts` (new) — 4 `handleTurn` tests for the terminal rendering of stream error, abort, Phase-2 and Phase-1 save failure (prefixes, log path, order `endStream` → chips → error line); review blind spot (decision 17).
- `apps/cli/test/two-phase-save.test.ts`, `apps/cli/test/quick-replies.test.ts`, `apps/cli/test/auto-replan-opener.test.ts` (modified) — `FsSessionStore` import from `@gtd/core`, nothing else.
- `apps/cli/test/turn-logger-integration.test.ts` (modified) — imports from `@gtd/core`; ctx builder field `cliLogger` → `logger`.
- `docs/improvements.md` (modified) — one promoted item (see Open Issues).
- `docs/tech-debt-backlog.md` (modified by the `/cs` session, not by this one) — 11 pre-existing CodeScene findings grazed by this task (opener, `main`, `Session.fromJSON`, three test files).

### Files Read (Context Only)
- `docs/work/phase-2a/plan.md` (preamble + Task 4 block), `docs/work/phase-2a/task-log/task-3.2-shared-api-contract.md`, `docs/work/phase-2a/task-log/docs-plan-beta-mvp-cut.md` (decisions 12, 14), `docs/work/main/task-log/task-4.1-pruning-and-sessions.md` (decision 6 on `fileVersionAt`; targeted lookup for a user question)
- `apps/cli/src/{model-provider,terminal-output,session-boundary,cli-logger,cli-error-log,fs-turn-logger,quick-replies}.ts`
- `apps/cli/test/{workspace-wiring,turn-loop,two-phase-save,turn-logger-integration,quick-replies,auto-replan-opener}.test.ts`
- `packages/core/src/{request-builder,tools,sessions,turn-log,search,file-repository,in-memory-file-repository,logging,auto-replan,tool-result-pruning}.ts`, `packages/core/src/__tests__/turn-log.test.ts`
- `ai@7.0.0-beta.116` `dist/index.d.ts` + `dist/index.js` (stream part shapes, `LanguageModel`, abort handling in `streamText`), `@ai-sdk/provider` / `provider-utils` d.ts (`SharedV4ProviderOptions`), `ai/test` (`MockLanguageModelV4`)
- `packages/core/package.json`, `apps/cli/package.json`, `tsconfig.base.json`, both package tsconfigs, `packages/core/vitest.config.ts`, root `package.json`

### Key Decisions
— session 2026-11-05
1. **Abort after a completed step no longer persists the partial turn (deliberate deviation from "behavior-preserving").** The new AC-05 test failed first: in AI SDK v7 an aborted stream ends with a `{ type: "abort" }` part, not an error, once at least one step has finished, and `result.response` then resolves with the partial messages. A probe confirmed both cases (Test Evidence). The old `consumeStream` had no `abort` case, so a Ctrl+C during step ≥ 2 ran Phase 2 on the partial turn and printed `endStream` instead of `(stream aborted)` — contradicting Task 4.1 AC-11 ("aborted turn ends with user message on disk and no assistant/tool messages"). The engine treats the `abort` part as an abort: no Phase 2, artifact `aborted`, `turnEnd({ outcome: "aborted" })`. First-step aborts behave exactly as before (thrown `AbortError` path). Both pinned by the two AC-05 tests.
2. **`turnEnd` carries the `TurnResult` object and `runTurn` resolves with the same object** (plan: `turnEnd(outcome: "ok" | "aborted" | "error")`). Observers (Task 6's SSE clients) get phase and error in the terminal event; the caller gets it as the promise value. The CLI renders from the return value because the error line needs the async log-file path before the prompt re-prints — a sync sink cannot order that.
3. **`timeZone?` deferred to Task 6 (plan amendment, approved in the briefing).** Neither `formatToday` nor `buildTools` nor the repositories accept a time zone today; an engine parameter forwarded to nothing would be dead. Task 6 supplies the zone per user and plumbs `formatToday(d, timeZone?)` + `BuildToolsOptions.timeZone` + repository options + engine dep in one change (docs-plan decision 12 names that shape).
4. **`TurnLogger` gains `nextTurnId()` instead of a second "allocator" interface.** The engine needs id + write; `FsTurnLogger` already had both. `MemoryTurnLogger`/`NoopTurnLogger` count locally. Per-day logger re-creation stays CLI-side (rollover guard); the engine takes whatever logger is current at turn time.
5. **`writeTurnArtifact` moves into core** because only the engine sees `result.steps`, `totalUsage` and the request snapshot, and `TurnLogRecord` already lived in core as the runtime-neutral shape. Consequence: `TurnLogContext.cliLogger` → `logger`; the opener and the integration test adopt the field.
6. **Debug gating stays "artifact logger present ⇔ DEBUG".** The `prompt.cache_usage` debug event is emitted only when `turnLogger` is set — the CLI's JSONL logger does not filter by level, so emitting it unconditionally would add a line per turn in non-DEBUG runs.
7. **Model id for the artifact derives from the model (`model.modelId`, or the string itself)** instead of a `modelId` dep: cannot disagree with the model actually used; CLI value unchanged (`anthropic(MODEL_ID).modelId === MODEL_ID`).
8. **`ProviderOptions` is a core-named alias `Record<string, Record<string, JSONValue>>`.** `ai` does not re-export `ProviderOptions` (it lives in `@ai-sdk/provider-utils`, not a core dependency); the alias is structurally `SharedV4ProviderOptions`. The CLI's `LocalProviderOptions` is a subtype, unchanged.
9. **Chips are buffered in the CLI sink and rendered after `runTurn` returns.** The terminal prints text → `endStream()` newline → chips; the sink has no stream-end signal and `turnEnd` comes after Phase 2. Buffering keeps the visible order byte-identical, also on Phase-2 failure (`endStream`, chips, then the error line). The engine emits `quickReplies` after the stream loop, before Phase 2; on abort it is never emitted.
10. **Test import lines updated instead of CLI re-export shims.** Four CLI test files import `FsSessionStore`/`writeTurnArtifact` from `@gtd/core` now; a shim would be a compatibility layer whose only consumers are tests. T4-AC-01 read as "pinned behavior unchanged".
11. **`turn-loop.ts` `MODEL_ID` re-export dropped** — no importer in the repo (`rg`); its comment claimed callers that do not exist.
12. **`TurnDeps.repo`/`sessionStore` typed as `FileRepository`/`SessionStore`.** The adapter needs nothing concrete; `index.ts` keeps passing `LocalFileRepository`/`FsSessionStore`.
13. **Two-phase save and the `turnStartedAt` stamp are documented once, at `persistTurnMessages`** in the engine; the former `phase1Save`/`phase2Save` comments collapsed into that one place.
14. **User clarification — `fileVersionAt` stays an injected function, not a `FileRepository` method.** Lutz asked whether it belongs to the repository. Conceptually yes; technically the repository is fully async while `buildRequest`/`pruneToolResults` are a synchronous transform (phase-1 Task 4.1 decision 6), and Supabase has no synchronous version lookup — the plan's shape is one `updated_at` query per turn into a sync map. A sync `versionOf(path)` on the repository is a possible later seam → promoted to the improvements register.
15. **Three pre-existing CLI test files left unformatted.** `two-phase-save.test.ts`, `turn-logger-integration.test.ts` and the moved `fs-session-store.test.ts` were not Prettier-clean at HEAD; formatting them would bury the one-line import edits. All new and rewritten files are Prettier-clean.

— session 2026-11-05 (review + CodeScene triage)
16. **CodeScene [FIX] `executeTurn` (cc 16, bumpy road) — fixed by extracting the debug-artifact lifecycle into `createTurnRecorder`.** The recorder owns the `TurnLogContext` (`requestBuilt`, `completed`, `aborted`, `failed`; every method a no-op without `turnLogger`), which removed four `if (turnCtx)` branches and the nested usage block from the flow. Kept in `turn-engine.ts` as a private helper: `turn-artifact.ts` stays the record builder, the recorder is the engine's use of it. Behavior unchanged (all 12 engine tests, incl. the artifact test, green).
17. **Review blind spots closed with tests (user: "wenn klein").** Engine: a provider failure resolves `{ outcome: "error", phase: "stream" }`, persists only Phase 1 and writes a `stream_error` artifact; a `read_file` call with invalid input yields `toolError` with the matching `toolCallId` and no `toolEnd`, and the turn still completes. CLI: `apps/cli/test/turn-loop-rendering.test.ts` drives `handleTurn` through stream error (`\nStream error: …\nDetails logged to: <vault>/.keppt/logs/cli-errors.jsonl`, no `endStream`), abort (only `info("(stream aborted)")`, user message alone on disk), Phase-2 save failure (`endStream` → `quickReplies` → `Session save failed after successful stream:`, `lastQuickReplies` kept) and Phase-1 save failure (`Session save failed:`, model never called). Save failures are injected through `FsSessionStoreOps.rename`.
18. **Accepted CodeScene finding — `consumeStream` (cc 12, previously 11 in the CLI).** One switch over the stream event types; the branches are the quick-reply and abort rules pinned by AC-02/05/06/07. Splitting it would scatter those state transitions across helpers. Delta marks it "introduced" only because the file is new; the complexity came over from the CLI.
19. **Review finding "real CLI run" closed by the user's smoke (T4-AC-08 passed).** `DEBUG=1`, `GTD_PROVIDER=deepseek` against the dogfooding vault: opener banner + greeting + chips, then a user turn rendering `[read_file tasks/next-actions.md]`, `[find_task_occurrences]`, `[edit_file tasks/next-actions.md]` and the answer — output shape identical to before. Not exercised: Ctrl+C during a second tool step (decision 1) and a restart replay; both remain covered by tests only.

### Review Focus
Review and CodeScene gate have run on the state before decisions 16–17; the changes since are the recorder extraction (production) and six new tests.
- **Behavior claims:** (1) Every `runTurn` call ends with exactly one `turnEnd(result)`, last, and resolves with the same object; `aborted` never appends Phase 2 (`turn-engine.test.ts`, AC-05 ×2). (2) The CLI's visible output is unchanged on all paths — status lines, chips after `endStream`, the four error prefixes with log path, `(stream aborted)` — except the step-≥2 abort (decision 1); now pinned by `turn-loop-rendering.test.ts` and the user's smoke. (3) `suggest_quick_replies` never reaches the sink as a tool event; chips come only from a validated `tool-result` (AC-06 ×2).
- **Plan deviations:** `timeZone?` engine dep → not added → dead parameter without plumbing (decision 3, Task 6). `turnEnd(outcome string)` → `turnEnd(TurnResult)` (decision 2). "Existing CLI test suite passes unchanged" → four test files changed in import lines (+ one field name), because the plan's own moves relocate the modules (decision 10). `turn-artifact.ts` move not named in Key Locations → moved (decision 5). Behavior-preserving → one edge case fixed (decision 1).
- **Assumptions / choices:** debug gate via `turnLogger` presence (6); model id derived (7); `ProviderOptions` alias (8); chips buffered CLI-side (9); `TurnLogger.nextTurnId()` on the one interface (4); recorder as a private engine helper (16).
- **Scope notes:** `apps/cli/src/auto-replan-opener.ts` touched only in imports + one field (still the duplicate pipeline until Task 5). `packages/core` now exports `FsSessionStore`; the server does not use it yet. No server/web behavior change (typechecks clean). `docs/tech-debt-backlog.md` grew by 11 pre-existing findings from the `/cs` session.
- **Read next:** `packages/core/src/turn-engine.ts` `executeTurn` + `createTurnRecorder` — the plan's invariant list (two-phase save, `turnStartedAt` stamps, `system` object passthrough, per-turn `buildTools`, stopWhen/onError), the `abort` case, and the post-gate extraction. `apps/cli/test/turn-loop-rendering.test.ts` — the four rendering claims; compare with the old `handleTurn` (git HEAD) if in doubt. `packages/core/src/__tests__/turn-engine.test.ts` AC-05 pair — the probe-derived abort semantics.

### Test Evidence
— session 2026-11-05
- Baseline before changes: core `npx vitest run` → 18 files, 317 tests green; cli → 11 files, 57 tests green.
- Probe (temporary `packages/core/src/__tests__/_probe.test.ts`, deleted after the run — `git status` shows no `_probe` file): `streamText` + `MockLanguageModelV4` with a `read_file` tool, `controller.abort()` inside `doStream` of call N, then throw `AbortError`:
  ```
  abortOnCall=1 parts=start,abort loopThrew=no
  abortOnCall=1 response rejected AbortError: This operation was aborted
  abortOnCall=2 parts=start,start-step,tool-call,tool-result,finish-step,abort loopThrew=no
  abortOnCall=2 response resolved roles=assistant,tool
  ```
  → the engine handles the `abort` part (decision 1).
- State handed to review (before decisions 16–17): core 334 / cli 50 green, core + cli + server + api typecheck clean, core built, Prettier clean on all new/rewritten files. Overtaken by the final runs below.
- Prettier `--check` not clean: `apps/cli/test/two-phase-save.test.ts`, `turn-logger-integration.test.ts`, `packages/core/src/__tests__/fs-session-store.test.ts` — all three already unformatted at HEAD (verified via `git show HEAD:<file> | prettier --check --stdin-filepath`), left as-is (decision 15). Seven untouched core files (`edit`, `file-repository`, `in-memory-file-repository`, `input-validation`, `local-file-repository`, `search`, `tool-result-pruning`) are pre-existing Prettier debt.

— session 2026-11-05 (review + CodeScene triage)
- `/review quick` (clean session): no hotspots; verified core 334 / cli 50, core build, cli typecheck. Blind spots: CLI error rendering untested via `handleTurn`; engine lacks provider-error and file-tool-error paths; T4-AC-08 open. → decisions 17, 19.
- CodeScene `/cs` (own session): 16 files checked, 14 scored 8.34–10.00; `turn-loop.ts` 8.49 → 10.00, `turn-engine.ts` 9.03. Introduced: `executeTurn` cc 16 + bumpy road ([FIX], decision 16), `consumeStream` cc 12 ([ACCEPT], decision 18). 11 pre-existing findings → `docs/tech-debt-backlog.md`. The gate ran before the recorder extraction; a re-run is open.
- User's manual smoke (T4-AC-08, screenshot in session): `DEBUG=1 … GTD_PROVIDER=deepseek pnpm dev` → core build, `tsx src/index.ts --debug`, `new session · 2026-11-05`, Auto-Replan banner, greeting with overdue items and four chips, user turn "Worum ging es bei Brains on silicon?", follow-up chips, pick `1` → `[read_file tasks/next-actions.md]`, `[find_task_occurrences]`, `[edit_file tasks/next-actions.md]`, confirmation text. Decision 19.
- Incident: after the review/CodeScene sessions, `apps/cli/src/turn-loop.ts` contained `terminal.toolStatu s(name, input)` (one stray space inside the identifier; the CLI typecheck had passed on the formatted file before). Removed; no other unexpected diff found (`git status`, Prettier clean).
- Final code state:
  - `packages/core`: `tsc --noEmit` clean, build ok, `npx vitest run` → **20 files, 336 tests passed** (317 + 7 moved + 12 engine tests). No unhandled rejections.
  - `apps/cli`: `tsc --noEmit` clean, `npx vitest run` → **11 files, 54 tests passed** (50 + 4 rendering tests), `test/turn-loop-rendering.test.ts` 4/4.
  - `apps/server` typecheck (both tsconfigs) and `packages/api` typecheck clean (unchanged since the review state; core barrel unchanged since).
  - Prettier `--check` clean: `turn-engine.ts`, `turn-sink.ts`, `turn-artifact.ts`, `fs-session-store.ts`, `turn-log.ts`, `index.ts`, `sessions.ts`, `turn-engine.test.ts`, `apps/cli/src/turn-loop.ts`, `index.ts`, `auto-replan-opener.ts`, `quick-replies.test.ts`, `auto-replan-opener.test.ts`, `turn-loop-rendering.test.ts`.

### Acceptance Coverage
- T4-AC-01: passed — cli 54/54 green incl. `workspace-wiring.test.ts` (runtime provider-flag pin untouched); the 7 `FsSessionStore` tests now run in core (336/336). Four test files changed in import lines only (decision 10).
- T4-AC-02: passed — `turn-engine.test.ts` "T4-AC-02: emits toolStart → toolEnd → assistantText → turnEnd for a tool→text turn" (exact event sequence with ids).
- T4-AC-03: passed — "T4-AC-03: a failing Phase-1 save rolls the session back, reports the phase and starts no stream" (`session.messages` empty, `doStreamCalls` 0, only `turnEnd`); CLI side: `turn-loop-rendering.test.ts` "renders a Phase-1 save failure …".
- T4-AC-04: passed — "T4-AC-04: stamps every response message with turnStartedAt although the stream finished later" (fake `Date`, read → edit → text; all six messages `createdAtOf === t0` while the clock advanced 5 s before the edit).
- T4-AC-05: passed — "T4-AC-05: an abort mid-stream ends with turnEnd(aborted); Phase 1 persists, no Phase-2 append" + "T4-AC-05: an abort before the first step completes ends with turnEnd(aborted) as well"; CLI side: "renders an abort as the (stream aborted) info line …".
- T4-AC-06: passed — valid result → one `quickReplies` event, no tool events; invalid overlong option + tool-error → no `quickReplies`, no tool events, one `stream.tool_error` warn.
- T4-AC-07: passed — "T4-AC-07: toolEnd fires for every non-quick-reply tool with its toolCallId and no payload" (`read_file` + `list_files` in one step; `toEqual` on `{ kind, toolCallId, name }` rejects extra keys); complemented by the tool-error test (decision 17).
- T4-AC-08: passed — manual dogfooding turn by the user on 2026-11-05 (the AC is defined as a manual smoke): status lines, chips and the edit turn identical in shape; `DEBUG=1` artifacts enabled. Not exercised: Ctrl+C during a second tool step (decision 1, tests only) and the restart replay. XC-05 contribution delivered.

### Open Issues
- `timeZone` plumbing (`formatToday(d, timeZone?)`, `BuildToolsOptions.timeZone`, repository options, `TurnEngineDeps.timeZone`) (→ Task 6, decision 3).
- Auto-Replan opener still duplicates the pipeline (`apps/cli/src/auto-replan-opener.ts`: own `consumeAutoReplanStream`, `makeFileVersionAt`, artifact wiring) (→ Task 5).
- Promoted: synchronous file-version seam — `fileVersionAt` as a `FileRepository.versionOf(path)` method once the Supabase repository holds its per-turn `updated_at` map (→ improvements register, decision 14).

### Context for Next Task
- Engine entry: `runTurn(deps: TurnEngineDeps, turn: TurnInput): Promise<TurnResult>` from `@gtd/core`. `TurnEngineDeps = { repo: FileRepository; sessionStore: SessionStore; logger: Logger; model: LanguageModel; providerOptions: ProviderOptions; now: () => Date; fileVersionAt: (path) => number | undefined; turnLogger?: TurnLogger; sink: TurnSink }`; `TurnInput = { session: Session; userText: string; abortSignal: AbortSignal }`.
- `TurnSink` methods are sync `void` and never awaited: `assistantText`, `toolStart(id, name, input)`, `toolEnd(id, name)`, `toolError(id, name, error)`, `quickReplies(payload)`, `turnEnd(result)`. `turnEnd` is always last and exactly once; `TurnResult = { outcome: "ok" } | { outcome: "aborted" } | { outcome: "error"; phase: "session_save_phase1" | "stream" | "session_save_phase2"; err: unknown }`.
- Event order per turn: Phase 1 (no event) → tool/text events in stream order → `quickReplies` (if any, after the loop) → Phase 2 → `turnEnd`. On abort: events so far → `turnEnd(aborted)`; no `quickReplies`, no Phase 2. A tool's validation failure is `toolStart` → `toolError` (same id, no `toolEnd`) and the loop continues.
- The engine mutates the passed `Session` and saves it through `sessionStore`; the caller owns session identity (per user-day) and the day rollover. The server (Task 6) must serialize turns per user (409) — the engine has no lock.
- `providerOptions` is the caller's duty for sequential tool dispatch (see `apps/cli/src/model-provider.ts`); the server should reuse that per-provider mapping or move it into core.
- Debug artifacts: `createTurnRecorder` (private, `turn-engine.ts`) is the only place that builds `TurnLogContext`; a server-side `TurnLogger` needs `nextTurnId()` (counter or UUID) and gets the same record shape as the CLI's files.
- Task 5 (opener): `runTurn` takes `userText` and performs Phase 1 before streaming; the opener needs a synthetic user message with an origin marker, `setAutoReplanRanFor(today)` in the same save, and no separate Phase 1 — extend `TurnInput`/the engine rather than keeping the opener's copy. The opener's `cliLogger.warn` meta carries `autoReplan: true` today; the engine's does not.
- Gotcha: AI SDK v7 ends an aborted stream with a `{ type: "abort" }` part after a completed step and `result.response` then resolves with the partial turn. Never await `response` on the aborted path (decision 1).
- Gotcha: `packages/core` resolves `@ai-sdk/provider` only transitively; core tests derive stream part types from `MockLanguageModelV4["doStream"]` instead of importing them.
- Build order unchanged: CLI tests and typecheck read `packages/core/dist`, so `pnpm -C packages/core build` must precede them after any core change.

### Git State
The index was staged by one of the review/CodeScene sessions, not by this one; `/commit 4` stages from this log anyway. `git diff --stat HEAD` (staged + unstaged):
```
 apps/cli/src/auto-replan-opener.ts                 |   5 +-
 apps/cli/src/index.ts                              |   2 +-
 apps/cli/src/turn-loop.ts                          | 433 +++++------------
 apps/cli/test/auto-replan-opener.test.ts           |   8 +-
 apps/cli/test/quick-replies.test.ts                |   2 +-
 apps/cli/test/turn-logger-integration.test.ts      |  10 +-
 apps/cli/test/two-phase-save.test.ts               |   2 +-
 docs/improvements.md                               |   1 +
 docs/tech-debt-backlog.md                          |  35 ++
 docs/work/phase-2a/task-log/task-4-turn-engine.md  | 154 +++++++
 .../core/src/__tests__}/fs-session-store.test.ts   |   2 +-
 packages/core/src/__tests__/turn-engine.test.ts    | 513 +++++++++++++++++++++
 .../cli => packages/core}/src/fs-session-store.ts  |   9 +-
 packages/core/src/index.ts                         |   9 +
 packages/core/src/sessions.ts                      |  11 +-
 {apps/cli => packages/core}/src/turn-artifact.ts   |  12 +-
 packages/core/src/turn-engine.ts                   | 296 ++++++++++++
 packages/core/src/turn-log.ts                      |  20 +
 packages/core/src/turn-sink.ts                     |  36 ++
 19 files changed, 1212 insertions(+), 348 deletions(-)
```
(plus `apps/cli/test/turn-loop-rendering.test.ts`, untracked at the time of the stat, and this log's own update)

`git status --short`:
```
M  apps/cli/src/auto-replan-opener.ts
M  apps/cli/src/index.ts
M  apps/cli/src/turn-loop.ts
M  apps/cli/test/auto-replan-opener.test.ts
M  apps/cli/test/quick-replies.test.ts
M  apps/cli/test/turn-logger-integration.test.ts
M  apps/cli/test/two-phase-save.test.ts
M  docs/improvements.md
A  docs/tech-debt-backlog.md
AM docs/work/phase-2a/task-log/task-4-turn-engine.md
R  apps/cli/test/fs-session-store.test.ts -> packages/core/src/__tests__/fs-session-store.test.ts
AM packages/core/src/__tests__/turn-engine.test.ts
R  apps/cli/src/fs-session-store.ts -> packages/core/src/fs-session-store.ts
M  packages/core/src/index.ts
M  packages/core/src/sessions.ts
R  apps/cli/src/turn-artifact.ts -> packages/core/src/turn-artifact.ts
AM packages/core/src/turn-engine.ts
M  packages/core/src/turn-log.ts
A  packages/core/src/turn-sink.ts
?? apps/cli/test/turn-loop-rendering.test.ts
```
(`docs/tech-debt-backlog.md` is the CodeScene ledger; it enters the commit with this task because the `/cs` run added this task's grazed findings.)

### Sessions
- claude-code a07f02c6-7b96-4120-9f5e-9c0d610497a3 (2026-11-05) — transcript: ~/.claude/projects/-home-lutz-projects-keppt-app/a07f02c6-7b96-4120-9f5e-9c0d610497a3.jsonl
