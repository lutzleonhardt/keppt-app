# Task 3.9 — Shared logging abstraction

**Date:** 2026-05-10
**Plan:** `docs/plans/phase-1-cli.md` — Task 3.9

## Task

Introduce a runtime-neutral `Logger` / `LogEvent` contract in
`packages/core`, wire it into named observability seams in
`LocalFileRepository` and the tool layer with `NoopLogger`
defaults, eliminate every `console.*` call from `apps/cli/src/`,
and route all four levels of CLI operational events through one
serialized JSONL sink at `.keppt/logs/cli-errors.jsonl` while
keeping the Task 3.6 user-facing terminal contract intact.

## Status

**DONE**

## Files Modified

- `packages/core/src/logging.ts` (new) — `Logger` interface
  (`debug`/`info`/`warn`/`error`), `LogEvent` type, `NoopLogger`,
  `MemoryLogger` (records `{ level, ...event }` with `byCode` and
  `clear` helpers), and `redactSensitiveHeaders` (case-insensitive
  redaction of `set-cookie`, `cookie`, `authorization`,
  `x-api-key`, `api-key`). Session 2026-05-18 extended the
  module-header JSDoc to a full conventions block: code naming
  (`<surface>.<verb_or_noun>`, snake_case, stable-contract policy
  with test-pin requirement), level guidance (debug/info/warn/error
  rationale), `meta` payload rules (bounded sizes, no raw vault
  content or model output, stable shapes per code, redaction
  responsibility), and an inline registry of all currently emitted
  codes. Also added a clarifying comment on `LogEvent.requestId`
  distinguishing it from Anthropic's `request-id` response header
  (which belongs in `meta.providerRequestId`).
- `packages/core/src/index.ts` (modified) — re-exports
  `Logger`, `LogEvent`, `LogLevel`, `MemoryLogEntry`, `NoopLogger`,
  `MemoryLogger`, `redactSensitiveHeaders`.
- `packages/core/src/local-file-repository.ts` (modified) — added
  `logger?: Logger` to `LocalFileRepositoryOptions`, defaulting to
  `NoopLogger`. Wired the existing per-file `InvalidPathError`
  swallow site in `search()` to emit a `debug` event with stable
  code `repo.search.path_skipped` and `meta: { filePath, reason }`,
  closing 3.8 Open Issue 1 (silent skip is now observable). Session
  2026-05-18 (Codex adversarial review follow-up): wrapped the
  injected logger with `safeLog` in the constructor so a throwing
  logger inside the search-skip emission cannot flip the
  deliberately-degraded path into a rejected `search()` promise.
  Mirrors the existing `buildTools` wrap; closes the inconsistency
  between the two core seams.
- `packages/core/src/__tests__/local-file-repository.test.ts`
  (modified) — added a `LocalFileRepository — search logger seam`
  describe (gated on `symlinkable`) that subclasses
  `LocalFileRepository` to inject `tasks/inbox.md` into the search
  loop directly and realizes it on disk as a symlink escaping the
  vault. `walk()` does not surface symlinks (DT_LNK), so driving
  the search-skip catch through `list()`'s normal output is not
  reachable; the production path under test starts at the catch,
  not at the listing. Asserts a single `repo.search.path_skipped`
  debug event with `reason: "symlink escapes vault root"`. Session
  2026-05-18: added a sibling regression test in the same describe
  that injects a `Logger` whose `debug` throws synchronously and
  asserts `search()` still resolves to `[]` (i.e. `safeLog`'s
  swallow keeps the degraded-search contract intact).
- `packages/core/src/tools.ts` (modified) — added `logger?: Logger`
  to `BuildToolsOptions`, defaulting to `NoopLogger`. Threaded
  `logger` into `readFileTool`, `writeFileTool`, `editFileTool`.
  Three named observability seams emitted with stable codes:
  - `tool.<name>.invalid_path` (warn) at the tool-layer
    `InvalidPathError` catch in `read_file`, `write_file`,
    `edit_file` — adversarial-path signal.
  - `tool.edit_file.failed` (info) at structured edit failures
    (`searchNotFound` / `searchNotUnique` / `missingFile`) — the
    LLM already sees this; backend operators get correlation.
  - `tool.edit_file.retry_budget_exhausted` (warn) at the 3rd
    failed `edit_file` call against the same file inside one
    `buildTools` closure — prompt-drift indicator.
  `list_files` and `search_files` are intentionally not
  instrumented (out of scope per plan: "do not thread a logger
  through just for symmetry"); list has no path-validation
  surface and search emits at the repo level.
- `packages/core/src/__tests__/tools.test.ts` (modified) — added a
  `buildTools — Logger seams` describe with three tests covering
  the three codes, each driving the seam through
  `streamText` + `MockLanguageModelV4` and asserting via
  `MemoryLogger.byCode(...)`. Retry-exhaustion test also asserts
  exactly two preceding `tool.edit_file.failed` events from the
  first two ambiguous attempts.
- `apps/cli/src/terminal-output.ts` (new) — typed sink for
  user-facing terminal output. Methods: `assistantText`,
  `toolStatus`, `toolError`, `info`, `errorSummary`, `endStream`.
  `createStdTerminalOutput()` is the production impl wrapping
  `process.stdout` / `process.stderr`. Owns every byte the user
  sees — operational logs go through `cli-logger.ts`.
- `apps/cli/src/cli-logger.ts` (new) — implements `@gtd/core`'s
  `Logger`. All four levels go through a per-instance promise
  chain (`chain = next.catch(() => undefined)`) so JSONL writes
  preserve call order; without serialization, four close calls
  race their `appendFile` syscalls and land on disk in scheduler
  order, breaking diagnostic causality. `error` level
  additionally renders a concise summary on `terminal.errorSummary`
  with the JSONL path appended, after the chained write resolves.
- `apps/cli/src/cli-error-log.ts` (modified) — extracted a generic
  `appendCliLogEntry(vaultPath, level, event)` that builds an
  entry from a `LogEvent`. APICallError block (kind, name, stack,
  api{...}) is preserved when `event.err` is one. `level` is now a
  top-level field on every entry. The Task 3.6 `appendCliErrorLog`
  is kept as a thin compat wrapper — `apps/cli/src/index.ts`'s
  stream-error catch uses it directly (not via `cliLogger.error`)
  so the user-facing summary can include the literal log path
  after awaiting the write, which the sync `Logger` interface
  cannot offer to its callers. Header redaction now imports
  `redactSensitiveHeaders` from `@gtd/core` — single source of
  truth.
- `apps/cli/src/cli-errors.ts` (modified, session 2026-05-18) —
  refactored provider-specific handling out of the hard-coded
  Anthropic format. New `Provider = "anthropic" | "openai" |
  "unknown"` type with `detectProvider(url)` discriminating on
  URL substring. Two provider-aware helpers isolated as switch
  statements: `providerRequestId(provider, headers)` (Anthropic
  `request-id`, OpenAI `x-request-id`, `unknown` falls back
  through `request-id` → `x-request-id` → `x-amzn-requestid`);
  `providerActionableHint(provider, message)` (only the Anthropic
  low-balance CTA "Add credits in Anthropic Plans & Billing" is
  currently registered; OpenAI has an explicit empty case with a
  comment noting `insufficient_quota` as the obvious add later).
  `formatApiCallError` now uses `err.message` directly — Vercel
  AI SDK already runs each provider's `errorToMessage` so
  `extractProviderMessage(err.data)` was double-parsing the same
  string. Status-code branches (401/403/429/retryable) verbalized
  in provider-neutral terms ("API rejected the credentials"
  instead of "Anthropic rejected the API credentials").
  Anthropic-output of the existing low-balance path is
  byte-identical to before. Removed: `extractProviderMessage` and
  `isLowBalanceMessage` private helpers (subsumed by the new
  helpers).
- `apps/cli/test/cli-errors.test.ts` (modified, session
  2026-05-18) — added one OpenAI test asserting `x-request-id`
  pickup and provider-neutral 429 wording. The existing Anthropic
  low-balance test stays green unchanged.
- `apps/cli/test/cli-error-log.test.ts` (modified) — entry shape
  changed: top-level `context: {phase:"stream"}` → `meta:
  {phase:"stream"}`, plus new `level: "error"` assertion. The
  `kind: "api_call_error"` / `api: {...}` / redacted headers
  contracts are unchanged.
- `apps/cli/test/cli-logger.test.ts` (new) — three tests covering
  T3.9-AC-04, T3.9-AC-10, and the terminal-summary path:
  (1) all four levels round-trip with the correct `level` field
  in disk order; (2) `error` produces exactly one
  `terminal.errorSummary` containing the formatted error and the
  JSONL path; (3) `debug`/`info`/`warn` produce zero terminal
  events. Uses a polling helper (`waitForEntries`,
  `drainTerminal`) instead of a fixed sleep — fire-and-forget
  writes are not microtask-bounded.
- `apps/cli/src/index.ts` (modified) — replaced all five
  `console.*` call sites with terminal-sink or logger calls:
  - `requireEnv` and the top-level `main().catch` →
    `terminal.errorSummary` (no JSONL access pre-vault).
  - Input-length cap → `terminal.errorSummary` (validation hint,
    not an operational event).
  - `tool-error` stream part → `terminal.toolError(name, err)` for
    the user-visible line **plus** `cliLogger.warn({ code:
    "stream.tool_error", err, meta: { toolName } })` for the
    JSONL — every tool failure is now both visible and recorded.
  - Stream-error catch keeps the awaited `appendCliErrorLog`
    direct call so the summary line includes the literal log
    path; routed through `terminal.errorSummary` instead of
    `console.error`.
  Wired `cliLogger` into `new LocalFileRepository(..., { logger })`
  and `buildTools(..., { logger })` so all four core seams flow
  into the same JSONL automatically.
- `docs/plans/phase-1-cli.md` (modified — Task 3.9 block, lines
  529–726) — amendment block at the top documenting the strategic
  shift ("CLI is throwaway test balloon, packages/core is what the
  web app reuses"), new "Core observability seams" section listing
  the four codes with stable contracts and the explicit
  out-of-scope list, expanded "CLI logger/output split" mandating
  all-levels-to-JSONL with explicit `level` field, new "CLI
  cleanup" section for the `console.*`-zero rule, and four
  additional ACs (T3.9-AC-07..10) covering CLI cleanup, options
  injection, code stability, and `level` round-trip.

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — Task 3.9 block (lines 529–618 in
  the original) and preamble; not the spec or sibling tasks.
- `docs/task-log/task-3.8-path-safety.md` — direct predecessor;
  orthogonal to logging, but Open Issue 1 (silent search skip)
  was the natural plug-in for the new `repo.search.path_skipped`
  event.
- `docs/task-log/task-3.6-cli-error-logging.md` — the foundation
  3.9 generalizes; established the JSONL path, `APICallError`
  entry shape, `formatCliError` summary contract, and the
  `onError: () => {}` pattern.
- `packages/core/src/__tests__/history-log.test.ts` — read for
  testing-style baseline (afterEach tmp-dir cleanup, `mkdtemp`
  pattern, vitest layout).
- `packages/core/src/file-repository.ts` — confirmed
  `InvalidPathError.reason` is a public readonly field used in
  the new event meta.
- `packages/core/src/gtd-layout.ts` — confirmed `isInActiveScope`
  uses a fixed allowlist (`TASK_FILES` + today's daily); a
  user-named `tasks/CON.md` would never reach the search-skip
  catch through normal listing, which drove the symlink-based
  test design.
- `packages/core/src/search.ts` — confirmed `isInScope` runs
  before `resolveSafe` in the search loop, which constrained the
  reachability of the skip path.
- `apps/cli/src/cli-errors.ts` — confirmed `formatCliError` is
  the existing concise formatter; reused as-is for both the
  terminal sink's `toolError` and `cliLogger.error`.
- `apps/cli/test/workspace-wiring.test.ts` — confirmed the CLI
  test pattern (vitest, `@gtd/core` import surface) before
  writing the new `cli-logger.test.ts`.

## Key Decisions

1. **Amend the plan's "no symmetry threading" rule.** Original
   draft minimized core wiring. User pushback: CLI is a
   throwaway test balloon; `packages/core` is the surface the
   future web app reuses, so the *whole point* of this task is
   to give core diagnostic seams that backend operators can
   observe. Amended the plan with a small set of *named*
   observability seams (4 codes, not pervasive instrumentation)
   and an explicit out-of-scope list.

2. **Stable codes are part of the contract surface.** The four
   codes (`repo.search.path_skipped`,
   `tool.edit_file.retry_budget_exhausted`,
   `tool.edit_file.failed`, `tool.<name>.invalid_path`) are
   asserted in core tests so a rename is detected at PR review
   time, not at production-alert time. Same rationale as
   3.8's `InvalidPathError.reason` strings.

3. **All four CLI levels write to JSONL.** Not just `error`.
   User correction during planning: a Logger interface where
   three of four methods are no-ops is a half-built abstraction.
   With all levels persisted, the file is the single
   operational-event log. `error` additionally renders a
   terminal summary; `debug`/`info`/`warn` stay silent on the
   terminal so the REPL doesn't get noisy from core seams.

4. **Per-logger-instance write chain instead of unordered
   fire-and-forget.** Without serialization, four `logger.*`
   calls in quick succession race their `appendFile` syscalls.
   The kernel's `O_APPEND` atomicity guarantees no interleaving
   *within* a write but says nothing about *between* writes.
   For diagnostic logs, call-order *is* the contract — "X
   happened before Y" is what backend operators read. The chain
   is `chain = chain.then(...).catch(() => undefined)` so a
   single failed write does not poison subsequent ones.

5. **`Logger` interface stays sync; one CLI path bypasses it.**
   The Logger contract is `void` returns so core seams don't
   need async/await through tool `execute()` boundaries. The
   CLI's stream-error catch needs the awaited log path inside
   the user-facing summary line ("Details logged to: …"), which
   sync methods cannot deliver. That single path keeps using
   `appendCliErrorLog` directly. Both paths land in the same
   JSONL via the same `appendCliLogEntry` underneath, so this is
   not a "two log paths" violation — just one synchronous
   ordering guarantee held outside the Logger interface.

6. **Search-skip seam tested through a subclass.** With the
   current `isInScope` allowlist (5 task files + today's daily +
   archive dailies) and `walk()`'s symlink exclusion (DT_LNK),
   the search-skip catch is unreachable through normal listing.
   The test subclasses `LocalFileRepository` to inject a
   real-on-disk symlink at `tasks/inbox.md` (in scope by name,
   escaping the vault by canonical target) into the search loop.
   This is *not* a contrived scenario — the catch exists
   precisely for the case where a future scope expansion or a
   user-placed symlink puts a path-violating file in scope. The
   test gates the production code starting at the catch.

7. **Reserved-name regex test (`tasks/CON.md`) abandoned.**
   First draft of the search-seam test created `tasks/CON.md`
   on disk and expected the validator to skip it inside search.
   It didn't — `isInScope("active")` filters out anything not in
   `TASK_FILES`, so `CON.md` never reaches `resolveSafe`. The
   subclass-injected symlink path is correct.

8. **`cli-error-log.ts` shape change: `context` → `meta`.** The
   Task 3.6 entry had `context: {phase:"stream"}` at the top
   level. The unified shape moves it into `meta`, the standard
   LogEvent metadata field. Updated the existing test
   (`cli-error-log.test.ts`) to assert the new shape. The
   `kind`/`api`/redacted-headers contract for `APICallError` is
   unchanged. New entries also have a `level` field; old entries
   on existing vaults do not — readers should treat `level`
   absence as `"error"` for the Task 3.6 era.

9. **`cli-errors.jsonl` filename kept; rename deferred.** With
   all levels writing to it, the name is misleading
   (`cli-events.jsonl` would be more accurate). Renaming would
   change vault layout — a contract we have not changed before
   in this phase. Captured in Open Issues for a deliberate
   future decision.

10. **`tool-error` stream part now produces both terminal *and*
    JSONL output.** Pre-3.9 it only hit stderr via
    `console.error`. After 3.9 the user still sees the line
    (`terminal.toolError`) and the same event lands as a `warn`
    in the JSONL with `code: "stream.tool_error"`. Acceptable
    minor behavior expansion vs. 3.6 — the stream-tool-error
    info was already on stderr, now it's also structured for
    backend observability.

11. **`list_files` and `search_files` not instrumented in
    tools.ts.** They have no `InvalidPathError` catch in the
    tool function. `list` doesn't validate paths
    (string-prefix filter only); `search` validates inside the
    repo and the new `repo.search.path_skipped` event is the
    canonical seam for that surface. Adding tracing-style
    `debug` events for tool entry/exit was rejected as
    speculative — no caller needs them today, and the LLM's
    chatty edit/read cycles would flood the JSONL.

— session 2026-05-18

12. **Logging conventions documented inline in `logging.ts`,
    not in `docs/`.** User asked whether the implicit code
    naming/level/meta conventions need their own doc page. The
    Plan and Task-Log entries document them historically, but
    a developer adding a new emitter looks at `logging.ts`, not
    at `docs/plans/phase-1-cli.md`. Plan docs are project-mgmt
    artifacts; they rot with the phase. Conventions go where
    they're discovered, as a JSDoc block. A separate `docs/
    logging.md` is the natural migration point when the code
    registry grows past ~10 entries or when Phase 2a backend
    adds its own surface — neither is true today.

13. **Vercel AI SDK is a thin envelope; provider error
    extraction is the consumer's job.** Verified directly against
    `@ai-sdk/provider@4.0.0-beta.14`'s `api-call-error.ts` and
    `@ai-sdk/anthropic`'s `anthropic-error.ts`. `APICallError`
    has provider-neutral *shape* (`statusCode`, `responseHeaders`,
    `responseBody`, `data`, `isRetryable`) but provider-specific
    *content* — no normalized request-id slot, no error
    subclasses for billing/auth/rate-limit, `data` follows each
    provider's own schema. The only cross-provider semantic
    signal is `isRetryable` (heuristic from 408/409/429/5xx).
    Sourcegraph cross-checked the Anthropic vs OpenAI `data`
    shapes (both happen to expose `data.error.message`, but
    `data` is not a contract). Conclusion: `err.message` (which
    each provider already routes through `errorToMessage`) is
    the right consumer-facing string; `extractProviderMessage(
    err.data)` was double-parsing.

14. **No file split for provider-specific helpers.** User
    explicitly asked whether the three new provider helpers
    deserve their own file. Rejected: the helpers exist only
    for `formatApiCallError` and have no second consumer; ~40
    LOC of tightly coupled switches don't warrant a file
    boundary. Discoverability comes from naming (`provider*`
    prefix), the header comment ("Adding a new provider =
    extend the switch in those three functions"), and explicit
    per-provider switch cases (not collapsed `case "openai":
    case "unknown":` blocks). File split is the next migration
    point when a third provider with substantial logic each
    arrives, or when the hint list grows to ~5+ patterns per
    provider.

15. **`safeLog` wrap was missing on `LocalFileRepository`'s
    injected logger.** Codex adversarial review caught the
    inconsistency: `buildTools` wraps with `safeLog` (per the
    Logger contract's "implementations MUST NOT throw
    synchronously" rule), but `LocalFileRepository`'s constructor
    stored `options.logger ?? new NoopLogger()` directly. A
    throwing logger inside the `repo.search.path_skipped`
    emission would have propagated out of the search-skip catch
    and rejected the entire `search()` promise — flipping a
    deliberately-degraded path (skip the unsafe file, keep
    searching the others) into an aborted search. Fixed by
    wrapping in the constructor; new regression test in
    `local-file-repository.test.ts` pins the behavior with a
    throwing-logger injection. Takeaway: when a contract is
    enforced at one seam via a helper, audit every other seam
    that takes the same injected dependency — `safeLog` was
    designed as the boundary mechanism, so every boundary needs
    it, not just the first one written.

## Test Evidence

```text
$ pnpm --filter @gtd/core build
> tsc -p tsconfig.json
[clean]

$ pnpm --filter @gtd/core test
 ✓ src/__tests__/edit.test.ts             (11 tests)
 ✓ src/__tests__/logging.test.ts           (8 tests)
 ✓ src/__tests__/history-log.test.ts       (2 tests)
 ✓ src/__tests__/gtd-layout.test.ts        (14 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts  (60 tests)
 ✓ src/__tests__/retry-budget.test.ts      (8 tests)
 ✓ src/__tests__/local-file-repository.test.ts      (72 tests)
 ✓ src/__tests__/tools.test.ts             (12 tests)

 Test Files  8 passed (8)
      Tests  187 passed (187)

$ pnpm --filter @gtd/cli typecheck
> tsc -p tsconfig.json --noEmit
[clean]

$ pnpm --filter @gtd/cli test
 ✓ test/cli-errors.test.ts        (2 tests)
 ✓ test/cli-error-log.test.ts     (1 test)
 ✓ test/cli-logger.test.ts        (3 tests)
 ✓ test/workspace-wiring.test.ts  (2 tests)

 Test Files  4 passed (4)
      Tests  8 passed (8)
```

Test growth: core 175 → 187 (+12: 8 new logging-contract tests, 1
new search-seam test, 3 new tool-seam tests). CLI 5 → 8 (+3 new
cli-logger tests).

— session 2026-05-18

```text
$ pnpm --filter @gtd/core test
 ✓ src/__tests__/edit.test.ts             (11 tests)
 ✓ src/__tests__/logging.test.ts          (10 tests)
 ✓ src/__tests__/history-log.test.ts       (2 tests)
 ✓ src/__tests__/gtd-layout.test.ts       (14 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts  (60 tests)
 ✓ src/__tests__/retry-budget.test.ts      (8 tests)
 ✓ src/__tests__/local-file-repository.test.ts      (73 tests)
 ✓ src/__tests__/tools.test.ts            (13 tests)

 Test Files  8 passed (8)
      Tests  191 passed (191)

$ pnpm --filter @gtd/cli test
 ✓ test/cli-errors.test.ts        (3 tests)
 ✓ test/cli-error-log.test.ts     (1 test)
 ✓ test/cli-logger.test.ts        (3 tests)
 ✓ test/workspace-wiring.test.ts  (2 tests)

 Test Files  4 passed (4)
      Tests  9 passed (9)

$ pnpm --filter @gtd/cli typecheck
> tsc -p tsconfig.json --noEmit
[clean]
```

Test growth since session 2026-05-10 baseline: core 187 → 191
(+4: interim `logging.test.ts` 8 → 10 and `tools.test.ts` 12 → 13
counts reconciled, plus +1 from this session's
`local-file-repository.test.ts` throwing-logger regression
[72 → 73]). CLI 8 → 9 (+1 OpenAI cli-errors test).
`cli-errors.test.ts` was 2 tests pre-session, now 3.

Regression greps for the AC contract:

```text
$ grep -rn 'console\.' packages/core/src/ | grep -v __tests__ | wc -l
0
$ grep -rEn 'from .pino|from .@sentry|from .@opentelemetry|@capacitor' packages/core/src/ | wc -l
0
$ grep -rn 'console\.' apps/cli/src/ | wc -l
0
```

No manual smoke run this session — Task 6 is the real-API
acceptance gate. The only LLM-visible change is the existing
3.6 stream-error path is unchanged and the `tool-error` stream
part still surfaces to stderr identically (now via the typed
sink instead of `console.error`).

## Acceptance Coverage

- **T3.9-AC-01:** passed — `grep console\. packages/core/src/`
  excluding `__tests__` returns 0. Regression captured in this
  log; the existing build/test pipeline catches future additions.
- **T3.9-AC-02:** passed — `grep` for `pino`/`@sentry`/
  `@opentelemetry`/`@capacitor` against `packages/core/src/`
  returns 0. The new `logging.ts` only depends on TypeScript
  types and standard JS.
- **T3.9-AC-03:** passed — Task 3.6 behavior preserved.
  `cli-error-log.test.ts` (the original 3.6 test) still passes
  with the additive `level: "error"` and `meta` field changes;
  the user-facing stream-error summary still includes the JSONL
  path and uses the same `formatCliError` formatter; the
  `onError: () => {}` SDK hook is untouched.
- **T3.9-AC-04:** passed — `cli-logger.test.ts` test 3 asserts
  `debug`/`info`/`warn` produce zero events on the captured
  terminal sink even after the JSONL writes complete. Streamed
  assistant text and tool-call status flow through
  `terminal.assistantText` and `terminal.toolStatus` (verified by
  inspection of `apps/cli/src/index.ts`); the `tool-error` stream
  part is the one stream-side event that *does* produce a
  `cliLogger.warn` event by design (Decision 10), and the test
  scoping makes that explicit by not asserting zero JSONL
  entries — only zero terminal entries for non-error levels.
- **T3.9-AC-05:** passed — `MemoryLogger` is exercised in three
  real core tests (`tools.test.ts` × 3 seam tests,
  `local-file-repository.test.ts` × 1 search-seam test) plus
  three logger-internal tests in `logging.test.ts`. `NoopLogger`
  default is verified by the existing 175 core tests staying
  green without supplying a logger.
- **T3.9-AC-06:** passed — `logging.test.ts` contains four
  `redactSensitiveHeaders` tests covering: `undefined` input,
  empty input, mixed sensitive headers (`Set-Cookie`, `cookie`,
  `Authorization`, `X-API-KEY`, `api-key`) all redacted
  case-insensitively, and non-sensitive keys (`content-type`,
  `request-id`, `x-custom`) passing through verbatim.
- **T3.9-AC-07:** passed — `grep console\. apps/cli/src/`
  returns 0. All five pre-3.9 sites are routed through
  `TerminalOutput` or `cliLogger`.
- **T3.9-AC-08:** passed — `LocalFileRepositoryOptions.logger`
  and `BuildToolsOptions.logger` are both `Logger | undefined`
  with `NoopLogger` defaults. Verified transparent: the existing
  `runFileRepositoryContract` (60 InMemory + 60+ Local tests),
  `edit.test.ts`, `gtd-layout.test.ts`, `retry-budget.test.ts`,
  `history-log.test.ts`, and the pre-3.9 portion of
  `tools.test.ts` and `local-file-repository.test.ts` all pass
  unchanged without supplying a logger.
- **T3.9-AC-09:** passed — all four codes asserted with
  `MemoryLogger`:
  - `repo.search.path_skipped` —
    `local-file-repository.test.ts:LocalFileRepository — search logger seam`
  - `tool.edit_file.retry_budget_exhausted` —
    `tools.test.ts:buildTools — Logger seams` test 2
  - `tool.edit_file.failed` —
    `tools.test.ts:buildTools — Logger seams` tests 1 and 2
  - `tool.read_file.invalid_path` (representative of
    `tool.<name>.invalid_path`) —
    `tools.test.ts:buildTools — Logger seams` test 3
- **T3.9-AC-10:** passed — `cli-logger.test.ts` test 1 emits one
  event per level and asserts
  `entries.map(e => e.level) === ["debug", "info", "warn", "error"]`
  in disk order. The promise-chain serialization in
  `cli-logger.ts` is what makes this deterministic.

## Open Issues

1. **`cli-errors.jsonl` filename is now misleading.** With
   `debug`/`info`/`warn` events also writing here, the name
   suggests error-only content. Renaming to `cli-events.jsonl`
   (or similar) would be clearer but changes vault layout — a
   contract we have not changed in Phase 1. Defer to a deliberate
   later decision. Readers of existing vaults will see mixed
   shapes: pre-3.9 entries lack a `level` field (treat as
   `"error"`), pre-3.9 had top-level `context` (now `meta`).

2. **Pre-vault errors have no JSONL trail.** `requireEnv`
   failures and pre-`vaultPath` exceptions in `main().catch`
   route through `terminal.errorSummary` only. Acceptable for
   Phase 1 (the user sees the message; the pre-vault config
   error surface is small) and unavoidable without a fallback
   log location. If the future server uses environment
   variables and the same Logger contract, this becomes
   irrelevant — failures get logged via Pino into the standard
   server logging path before any vault concept exists.

3. **`appendFile` write atomicity for large entries.** The
   per-logger promise chain serializes calls inside one
   process, but if a single entry exceeds the kernel's
   `PIPE_BUF` (typically 4096 bytes on Linux), the write may
   not be atomic with respect to *other processes* writing the
   same file. Not a Phase-1 concern (single CLI process per
   vault), but worth noting if multiple CLI sessions ever
   share a vault. APICallError entries with long
   `requestBodyValues` are the realistic candidate.

4. **`cliLogger.error` is implemented but currently unused
   from CLI's own paths.** The CLI's stream-error catch needs
   the awaited log path in its summary line, which the sync
   Logger interface cannot offer; that path keeps using
   `appendCliErrorLog` directly. `cliLogger.error` exists for
   completeness — future code (a tool error path, a backend
   adapter, a Capacitor adapter) can use it to get the
   default ergonomics. Not dead code; it's contract surface.

5. **`tool-error` stream part now writes to JSONL too.**
   Strictly speaking a small UX expansion vs. Task 3.6 (which
   only hit stderr). Acceptable — the same information was
   already on stderr, now it's also structured for backend
   observability. If the JSONL grows uncomfortably from
   chatty edit/read failures during smoke runs, a verbosity
   flag could later silence `stream.tool_error` events.
   (→ optional follow-up if Task 6 surfaces noise complaints)

6. **`list_files` and `search_files` tools not instrumented.**
   No `InvalidPathError` catch exists in their tool functions
   (list has no path validation; search delegates to the repo
   which now has its own seam). If a future tool surface
   adds validation, the same `tool.<name>.invalid_path`
   pattern should be applied.

7. **Provider-agnostic error formatting is half-built**
   (session 2026-05-18). The new `detectProvider` /
   `providerRequestId` / `providerActionableHint` split makes
   the CLI's error formatter work cleanly for any future
   provider Vercel AI SDK supports — but only Anthropic has
   real entries in the hint table. The OpenAI case is an
   explicit empty branch with a comment naming
   `insufficient_quota` as the obvious add. Will revisit when
   Task 4's model router actually adds a non-Anthropic
   provider; not before. Aligns with phase-1 pragmatism
   feedback (see memory).

8. **`isLowBalanceMessage` regex preserved, just gated by URL.**
   Anthropic's API has no dedicated error type for billing
   (it returns `invalid_request_error` with the message text
   carrying the specifics). String-matching is the only
   available discriminator. The fragility now lives behind
   `provider === "anthropic"`, so a future provider with a
   genuine billing error code can be added with proper
   structured detection without touching the Anthropic path.

## Context for Next Task

- **Logger contract is stable for Task 4 and beyond.** The
  `@gtd/core` exports `Logger`, `LogEvent`, `LogLevel`,
  `NoopLogger`, `MemoryLogger`, `MemoryLogEntry`, and
  `redactSensitiveHeaders`. Task 4 (system prompt + request
  builder + tool-result pruning + caching) can emit events
  through the same Logger if any of its pipelines have
  diagnostic surfaces — most likely candidates are
  cache-hit/miss debug events and tool-result-pruning info
  events. The CLI's `cliLogger` is constructed once per
  process and passed to `LocalFileRepository` and
  `buildTools`; Task 4 should accept it the same way for
  any new options-bag entry points.

- **Conventions for new events are documented inline.** See
  the JSDoc block at the top of `packages/core/src/logging.ts`
  for the full convention surface: code naming
  (`<surface>.<verb_or_noun>`, snake_case, stable contract
  pinned via `MemoryLogger.byCode(...)` tests), level
  guidance, `meta` payload rules (bounded sizes; no raw
  vault content, model output, or request bodies; pass
  headers through `redactSensitiveHeaders` first), and a
  registry of all currently emitted codes. When Task 4 adds
  events, **update the registry block** in the same commit.
  Top-level `LogEvent.requestId` is the cross-cutting
  backend-request correlation slot; Anthropic's
  `request-id` response header is NOT that slot — it goes
  in `meta.providerRequestId` so multiple provider calls
  inside one backend request don't fight for the field.

- **Stable code contract.** The four codes (`repo.search.
  path_skipped`, `tool.edit_file.retry_budget_exhausted`,
  `tool.edit_file.failed`, `tool.<name>.invalid_path`) plus
  the CLI-level `stream.tool_error` are asserted in tests.
  Renaming any of them is a breaking change and must update
  emitter + assertion in the same commit. If Task 4 adds
  events, follow the `<surface>.<verb>` convention (e.g.
  `prompt.cache_hit`, `pruning.message_dropped`).

- **No `console.*` allowed anywhere except in test files.**
  Both `packages/core/src/**` and `apps/cli/src/**` are at
  zero. Task 4 work that adds new files must respect this
  invariant — terminal output goes through `TerminalOutput`,
  diagnostics through `Logger`. The `__tests__` directories
  may use `console.*` if needed; production code does not.

- **`cli-errors.jsonl` is now a multi-level event log.** Any
  Phase-2a backend work that wants to reuse the entry shape
  must carry the `level` field forward. The compat wrapper
  `appendCliErrorLog(vaultPath, err, context)` still works
  for callers that only want to log an error with a context
  object — but the unified `appendCliLogEntry(vaultPath,
  level, event)` is the primary entrypoint going forward.

- **Provider-aware CLI error formatting.** `apps/cli/src/
  cli-errors.ts` now has a tiny three-function provider
  layer (`detectProvider`, `providerRequestId`,
  `providerActionableHint`). When Task 4's model router
  adds a non-Anthropic provider, extending these three
  switches is the only change required — no adapter
  interface to wire up, no registry. `formatApiCallError`
  uses `err.message` directly (each provider's
  `errorToMessage` has already shaped it); do not reach
  into `err.data` unless you need a provider-specific
  structured field that `err.message` cannot give you.

- **Promise-chain serialization is per-instance.** If a
  future test or backend wires multiple `cliLogger`
  instances against the same JSONL path, write order between
  instances is no longer guaranteed. Not a concern for the
  current single-CLI-process model; flag if/when it changes.

- **Symlink-injection-via-subclass is the test pattern for
  unreachable-via-listing seams.** Used in
  `local-file-repository.test.ts` for the search-skip seam.
  Future seams that sit behind `walk()`'s DT_LNK exclusion
  or `isInScope`'s allowlist follow the same pattern.

## Git State (session 2026-05-18)

```text
$ git diff --stat
 .gitignore                                         |   1 +
 apps/cli/src/cli-error-log.ts                      |  96 ++++----
 apps/cli/src/cli-errors.ts                         |  88 ++++++--
 apps/cli/src/index.ts                              |  56 +++--
 apps/cli/test/cli-error-log.test.ts                |   3 +-
 apps/cli/test/cli-errors.test.ts                   |  16 ++
 docs/specs/architecture.md                         |  42 +++-
 .../task-3.9-shared-logging-abstraction.md         | 242 ++++++++++++++++++++-
 .../src/__tests__/local-file-repository.test.ts    | 103 +++++++++
 packages/core/src/__tests__/tools.test.ts          | 212 ++++++++++++++++++
 packages/core/src/index.ts                         |  10 +
 packages/core/src/local-file-repository.ts         |  28 ++-
 packages/core/src/logging.ts                       |  76 +++++++
 packages/core/src/tools.ts                         |  57 ++++-
 14 files changed, 944 insertions(+), 86 deletions(-)

$ git status --short
 M .gitignore
 M apps/cli/src/cli-error-log.ts
 M apps/cli/src/cli-errors.ts
A  apps/cli/src/cli-logger.ts
 M apps/cli/src/index.ts
A  apps/cli/src/terminal-output.ts
 M apps/cli/test/cli-error-log.test.ts
 M apps/cli/test/cli-errors.test.ts
A  apps/cli/test/cli-logger.test.ts
A  docs/task-log/task-3.9-shared-logging-abstraction.md
 M packages/core/src/__tests__/local-file-repository.test.ts
A  packages/core/src/__tests__/logging.test.ts
 M packages/core/src/__tests__/tools.test.ts
 M packages/core/src/index.ts
 M packages/core/src/local-file-repository.ts
AM packages/core/src/logging.ts
 M packages/core/src/tools.ts
```

(Previous session 2026-05-10 snapshot is preserved below for
historical comparison.)

```text
$ git diff --stat   (2026-05-10)
 apps/cli/src/cli-error-log.ts                      |  96 +++++++------
 apps/cli/src/index.ts                              |  56 +++++---
 apps/cli/test/cli-error-log.test.ts                |   3 +-
 docs/plans/phase-1-cli.md                          | 149 ++++++++++++++++++---
 .../src/__tests__/local-file-repository.test.ts    |  55 ++++++++
 packages/core/src/__tests__/tools.test.ts          | 124 +++++++++++++++++
 packages/core/src/index.ts                         |   9 ++
 packages/core/src/local-file-repository.ts         |  16 ++-
 packages/core/src/tools.ts                         |  40 +++++-
 9 files changed, 469 insertions(+), 79 deletions(-)

$ git status --short
 M apps/cli/src/cli-error-log.ts
 M apps/cli/src/index.ts
 M apps/cli/test/cli-error-log.test.ts
 M docs/plans/phase-1-cli.md
 M packages/core/src/__tests__/local-file-repository.test.ts
 M packages/core/src/__tests__/tools.test.ts
 M packages/core/src/index.ts
 M packages/core/src/local-file-repository.ts
 M packages/core/src/tools.ts
?? .idea/
?? apps/cli/src/cli-logger.ts
?? apps/cli/src/terminal-output.ts
?? apps/cli/test/cli-logger.test.ts
?? docs/task-log/task-3.9-shared-logging-abstraction.md
?? packages/core/src/__tests__/logging.test.ts
?? packages/core/src/logging.ts
```

(The home-directory dotfiles surfaced earlier — `.bashrc`,
`.zshrc`, `.gitconfig`, `.bash_profile`, `.profile`, `.zprofile`,
`.gitmodules`, `.mcp.json`, `.ripgreprc`, `.vscode/` — are not
part of this repo's working set; omitted from the status snapshot
above. `.idea/` is JetBrains workspace metadata and is
intentionally untracked.)
