# Task 3.6 — CLI operational error logging

**Date:** 2026-05-09
**Plan:** `docs/plans/phase-1-cli.md` — Task 3.6

## Task

Capture operational stream/API failures from the Task-3 CLI smoke path without
dumping raw SDK errors to stderr: show a stable terminal summary and write full
diagnostics to a vault-local JSONL log.

## Status

**DONE**

## Files Modified

- `apps/cli/src/index.ts` (modified) — disables the Vercel AI SDK beta's
  default raw stream-error logger via `onError: () => {}`, keeps the existing
  abort behavior, and on non-abort stream errors writes diagnostics to the
  vault-local log before printing a concise summary plus log path.
- `apps/cli/src/cli-errors.ts` (new) — formats CLI-facing errors. Handles
  `APICallError` specifically for low Anthropic balance, credential/account
  rejection, rate limiting, retryable provider errors, and generic API-call
  failures; unknown errors fall back to concise messages.
- `apps/cli/src/cli-error-log.ts` (new) — appends JSONL diagnostic entries to
  `VAULT_PATH/.keppt/logs/cli-errors.jsonl`. For `APICallError`, preserves
  stack, URL, status, retryability, request body values, response body,
  provider data, and response headers, while redacting sensitive headers
  (`set-cookie`, `cookie`, `authorization`, `x-api-key`, `api-key`).
- `apps/cli/test/cli-errors.test.ts` (new) — covers low-balance formatting and
  verifies the formatted message does not leak the model/request body.
- `apps/cli/test/cli-error-log.test.ts` (new) — covers vault-local JSONL log
  writing and header redaction for an `APICallError`.
- `docs/plans/phase-1-cli.md` (modified) — inserts Task 3.6 as the next
  unplanned Task-3 follow-up and renumbers the still-open retry-budget and
  path-safety follow-ups from `3.6`/`3.7` to `3.7`/`3.8`.
- `docs/task-log/task-3.6-cli-error-logging.md` (new) — this wrap-up log.

## Files Read (Context Only)

- `docs/specs/architecture.md` — checked for existing operational logging,
  Sentry, telemetry, and observability decisions. Found `file_history` and
  product history, but no server/Web-App error-observability section.
- `docs/specs/product.md` — checked for product-level logging/diagnostics
  language; no operational error logging contract exists there.
- `docs/plans/phase-1-cli.md` — read existing Task-3 follow-up numbering and
  Task-4 prompt-caching debug-log note before inserting the new Task 3.6.
- `docs/task-log/task-3-cli-vercel-ai-sdk.md` — confirmed the manual smoke
  open issue and the existing stream/error handling decisions.
- `docs/task-log/task-3.5-gtd-layout-policy.md` — checked the established
  pattern for post-created Task-3 decimal follow-ups.
- `node_modules/.pnpm/ai@7.0.0-beta.116*/node_modules/ai/dist/index.js` and
  `.d.ts` — verified that `streamText` defaults `onError` to
  `console.error(error)` and exposes an `onError` callback for callers.

## Key Decisions

1. **Make this Task 3.6, not Task 3.8.** The retry-budget and path-safety
   follow-ups were planned as `3.6`/`3.7` but not yet implemented or logged.
   This smoke-test fix was implemented first, so the plan now inserts it as
   the next open slot and renumbers the still-open follow-ups to `3.7`/`3.8`.
   Already committed tasks (`3`, `3.5`) were not renumbered.

2. **Do not leave the SDK default raw stderr logger enabled.** The CLI should
   expose diagnostics for local dogfooding, but not by dumping duplicate raw
   error objects into the interactive terminal. In `ai@7.0.0-beta.116`,
   `streamText`'s default `onError` calls `console.error(error)` before the
   consumer sees the `error` stream part. Passing `onError: () => {}` gives the
   CLI one owned error path.

3. **Separate terminal UX from diagnostic logging.** The terminal gets a short
   stable summary (`HTTP 400: Anthropic credit balance is too low...`) and the
   JSONL path. The log file gets the details needed for debugging provider/API
   failures. This preserves local visibility without making the REPL noisy or
   brittle.

4. **Keep operational logs separate from `file_history`.** `file_history`
   answers "what changed in the user's GTD files?" Operational failures answer
   "why did the app/LLM call fail?" They have different retention, privacy,
   and UI semantics, so the CLI writes to `.keppt/logs/cli-errors.jsonl`.

5. **Vault-local full diagnostics are a dev-only compromise.** The JSONL entry
   currently includes `requestBodyValues`, which may contain prompts/messages
   and in Task 4 may include active-file context. That is acceptable for the
   local CLI smoke path when the user explicitly wants full debug visibility,
   but the future server/Web-App needs a stricter observability spec with
   redaction and retention rules before sending anything to Sentry or another
   cloud sink.

## Test Evidence

Commands run:

```text
$ pnpm --filter @gtd/cli test
> @gtd/cli@0.0.0 test /home/lutz/projects/keppt-app/apps/cli
> vitest run

✓ test/cli-errors.test.ts  (2 tests)
✓ test/cli-error-log.test.ts  (1 test)
✓ test/workspace-wiring.test.ts  (1 test)

Test Files  3 passed (3)
Tests  4 passed (4)
```

```text
$ pnpm --filter @gtd/cli typecheck
> @gtd/cli@0.0.0 typecheck /home/lutz/projects/keppt-app/apps/cli
> tsc -p tsconfig.json --noEmit
```

Manual context:

- The task was triggered by a real CLI smoke run with an Anthropic low-balance
  `APICallError`. Before the fix, the SDK default logger printed the full raw
  object and the CLI catch printed the formatted summary after it. The code now
  disables the SDK default logger and owns the single terminal message.

## Acceptance Coverage

- **T3.6-AC-01:** passed — `apps/cli/test/cli-errors.test.ts` constructs a
  low-balance `APICallError`, asserts the short formatted output with request
  ID, and asserts the model/request body is not in the formatted message.
- **T3.6-AC-02:** partial — `apps/cli/src/index.ts` passes `onError: () => {}`
  to `streamText`, which is the SDK-supported hook that disables the raw
  default logger. No end-to-end subprocess test asserts stderr shape yet.
- **T3.6-AC-03:** passed — `apps/cli/test/cli-error-log.test.ts` verifies JSONL
  writing under `.keppt/logs/cli-errors.jsonl`, preserves API diagnostic
  fields, and redacts `set-cookie`.
- **T3.6-AC-04:** partial — the existing catch/finally path still resumes
  readline and prompts again after non-abort errors. This was verified by code
  inspection and preserved from Task 3; no REPL subprocess regression test yet.

## Open Issues

1. **No architecture-level operational observability spec.** The current
   architecture covers `file_history` and mentions logging as a reason to use
   a custom Node server, but does not define Sentry/OpenTelemetry, request IDs,
   redaction, retention, user-facing error contracts, or how frontend/backend
   errors correlate. Add this before or during Phase 2a backend work.
   (→ new architecture follow-up before production deployment)

2. **CLI error logs may contain sensitive prompt/file context.** The local
   JSONL log intentionally preserves `requestBodyValues` for dogfooding
   diagnostics. Once Task 4 injects active vault state into requests, this log
   may include GTD file content. Keep `.keppt/logs` out of LLM list/search
   surfaces and do not upload these logs to cloud observability without a
   redaction pass. (→ operational observability follow-up)

3. **No subprocess stderr regression test.** Unit tests cover formatting and
   JSONL writing, but not the full `tsx src/index.ts` REPL stderr behavior.
   Add this only if the CLI keeps accumulating terminal behavior fixes;
   otherwise Task 6's real API/vault acceptance remains the right place.
   (→ Task 6 or follow-up if regressions recur)

## Context for Next Task

- `streamText` in `ai@7.0.0-beta.116` has a default `onError` handler that
  logs raw errors to stderr. Any future CLI/server entrypoint that consumes
  `fullStream` and wants controlled logging should pass its own `onError`.
- `appendCliErrorLog(vaultPath, err, context)` writes to
  `.keppt/logs/cli-errors.jsonl` and returns `{ path, ok, error? }` instead of
  throwing; callers can include the attempted log path in the user-facing
  message even if logging fails.
- `formatCliError(err)` is intentionally CLI-facing. Do not reuse it as the
  future HTTP error contract without deciding which details the frontend should
  receive.
- `docs/plans/phase-1-cli.md` now has open follow-ups as `3.7` retry budget
  and `3.8` path safety. Any old references to `task-3.6-retry-budget.md` or
  `task-3.7-path-safety.md` should be treated as stale.

## Git State

```text
$ git diff --stat
apps/cli/src/index.ts     |  15 ++++++-
docs/plans/phase-1-cli.md | 107 +++++++++++++++++++++++++++++++++++++++-------
2 files changed, 104 insertions(+), 18 deletions(-)
```

```text
$ git status --short
 M apps/cli/src/index.ts
 M docs/plans/phase-1-cli.md
?? .idea/
?? apps/cli/src/cli-error-log.ts
?? apps/cli/src/cli-errors.ts
?? apps/cli/test/cli-error-log.test.ts
?? apps/cli/test/cli-errors.test.ts
?? docs/task-log/task-3.6-cli-error-logging.md
```
