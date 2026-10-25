# Task 1 — Express server skeleton + operational logging foundation

### Task
Create the `apps/server` Express workspace (`@gtd/server`) with a Pino-backed implementation of the core `Logger` contract, request-id and auth-stub middleware, a stable JSON error shape, `GET /api/health`, and the vault-init boot sequence (Phase 2a.0).

### Status
DONE. Independent review performed: Codex `/review quick` (2026-10-25) raised two hotspots and two blind spots — the listen-error hotspot and the README blind spot were fixed, the error-text redaction hotspot was declined (decision 12), the workspace-regression blind spot was answered by a full re-run. `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` are green on the final code state (core 304, server 66, cli 57, web 109). Ready for `/commit 1`.

### Files Modified
- `apps/server/package.json` (new) — workspace `@gtd/server`: ESM, Express ^5.3.0 + Pino ^10.4.0, dev deps supertest/@types/express/tsx/vitest ^1.4, engines `>=22.22.3`
- `apps/server/tsconfig.json` (new) — extends base, `outDir: dist` / `rootDir: src`, excludes `__tests__` (mirrors core)
- `apps/server/vitest.config.ts` (new) — `include: src/**/__tests__/**/*.test.ts` (mirrors core)
- `apps/server/src/index.ts` (new) — boot: `readServerConfig` → `createBackendLogger` → `initializeVault` → `createApp` → `startServer`; `server.listening` logged only after the server listens; `ConfigError` → plain stderr message + exit 1; any other boot failure (incl. `EADDRINUSE`) → `Fatal: …` + exit 1 via `main().catch`
- `apps/server/src/config.ts` (new) — `readServerConfig(env)`: `VAULT_PATH`/`DEV_USER_ID` required (all missing names in one message), `PORT` default 3333 validated 1–65535, `LOG_LEVEL` default `info` restricted to core `LogLevel`
- `apps/server/src/backend-logger.ts` (new) — `createBackendLogger`: Pino adapter behind the core `Logger`; `redactMeta`/`isSensitiveMetaKey` key-segment redaction; `toErrorRecord` allowlist serializer (declined-finding comment, decision 12); wrapped in `safeLog`
- `apps/server/src/bind-logger.ts` (new) — `bindLogger(inner, { requestId, userId, sessionId })` fills unset correlation fields; knows nothing about Express
- `apps/server/src/middleware/request-id.ts` (new) — mints `randomUUID()`, sets `req.requestId`, `req.log`, `X-Request-Id`; declares the `Express.Request` augmentation for `requestId`/`log`
- `apps/server/src/middleware/auth-stub.ts` (new) — `req.userId = devUserId`, rebinds `req.log` with `userId`; declares the `userId` augmentation; the single JWT replacement point (Task 9)
- `apps/server/src/middleware/error-handler.ts` (new) — `ApiError(status, code, message)`, `notFoundHandler`, `errorHandler(logger)`: `ApiError` passthrough, everything else → 500 `internal_error` + one `http.unhandled_error` log
- `apps/server/src/app.ts` (new) — `createApp({ logger, devUserId })` factory without `listen`; fixed middleware order
- `apps/server/src/start-server.ts` (new) — `startServer(app, port)`: promise that resolves with the `http.Server` on `listening` and rejects on listen errors, which Express 5 passes to the listen callback
- `apps/server/src/vault-init.ts` (new) — `initializeVault(vaultPath, logger)`: `LocalFileRepository` with `changedBy: "system"` + `ensureGtdTaskFiles`, logs `server.vault_ready`
- `apps/server/src/__tests__/config.test.ts` (new) — 7 tests, AC-05
- `apps/server/src/__tests__/backend-logger.test.ts` (new) — 47 tests (incl. 39-row key table), AC-03
- `apps/server/src/__tests__/middleware.test.ts` (new) — 2 tests: UUID per request, header, `req.log` binding
- `apps/server/src/__tests__/error-handler.test.ts` (new) — 5 tests, AC-01/AC-02
- `apps/server/src/__tests__/app.test.ts` (new) — 2 tests, AC-01
- `apps/server/src/__tests__/vault-init.test.ts` (new) — 1 test, AC-04
- `apps/server/src/__tests__/start-server.test.ts` (new) — 2 tests: free port resolves, occupied port rejects with `EADDRINUSE` (review fix, no AC)
- `packages/core/src/logging.ts` (modified) — header comment only: registry extended with `server.vault_ready`, `server.listening`, `http.unhandled_error`; the "payload redaction belongs to the future cloud adapter" sentence now points at `apps/server/src/backend-logger.ts`
- `README.md` (modified) — "Run it locally": Node floor corrected to 22.22.3 (was "≥ 20, `.nvmrc` pins 20"), server start block (`VAULT_PATH`, `DEV_USER_ID`, optional `PORT`/`LOG_LEVEL`, `pnpm dev:server`, health curl); heading lost its "(Phase 1)" suffix
- `package.json` (modified) — root `dev:server` script (`core build` + `@gtd/server dev`)
- `pnpm-workspace.yaml` (modified) — `allowBuilds` block; pre-existing uncommitted tooling change that the plan log assigned to this task
- `pnpm-lock.yaml` (modified) — express/pino/supertest and transitives; Angular's transitive `express` moves 5.2.1 → 5.3.0 (same peer range), minor bumps of body-parser/qs/hasown/proxy-addr

### Files Read (Context Only)
- `packages/core/src/vault-readiness.ts`, `gtd-task-files.ts`, `history-log.ts`, `local-file-repository.ts` (constructor options), `index.ts` (barrel exports)
- `apps/cli/src/index.ts` (boot pattern, `requireEnv`), `apps/cli/src/cli-logger.ts`, `apps/cli/src/cli-error-log.ts` (how the CLI expands `err`)
- `apps/cli/package.json`, `apps/cli/tsconfig.json`, `packages/core/{package.json,tsconfig.json,vitest.config.ts}`, `tsconfig.base.json`, `apps/web/package.json` (recursive script surface)
- `packages/core/src/__tests__/logging.test.ts`, `apps/cli/test/cli-logger.test.ts` (temp-vault test pattern)
- `docs/work/phase-2a/task-log/docs-plan-beta-mvp-cut.md` (`allowBuilds` assignment, dev-path note)
- `node_modules/.pnpm/express@5.3.0/node_modules/express/lib/application.js` `app.listen` (to confirm the Codex listen-error finding)

### Key Decisions
— session 2026-10-24
1. **Redaction lives in the logger, not only at call sites.** `isSensitiveMetaKey` splits a key into camelCase/snake/kebab segments and redacts when any segment names content (`prompt`, `message`, `content`, `body`, `header`, `token`, `key`, `text`, `input`, `output`, `payload`, `args`, `data`, `secret`, `password`, `authorization`, `cookie`, plurals) unless the **last** segment is a size/identity qualifier (`length`, `count`, `size`, `bytes`, `chars`, `tokens`, `id`, `name`, `type`, `kind`, `hash`). Why the qualifier rule: a plain substring match would blank core's existing `currentContentLength`, `failedSearchLength`, `promptTokens` metrics, breaking the "log lengths, not strings" convention. False positives (`cacheKey`) are accepted; false negatives are the failure mode that matters. Rejected: Pino `redact` paths (exact paths only, meta keys are open-ended); string-length truncation (not in the AC, speculative).
2. **`err` allowlist serializer instead of Pino's `stdSerializers.err`.** Pino copies every enumerable own property; for an `APICallError` that includes `responseBody`, `requestBodyValues`, `responseHeaders`. Kept: `name`, `message`, `stack`, `code` (string), `statusCode`, `isRetryable`. `cause` chains are not walked (no present consumer).
3. **Correlation via a `bindLogger` decorator chain, not Pino child loggers.** Keeps the core `Logger` the only type in the chain; a bound logger works outside Express (turn engine, Task 6). An event's own field wins over the bound one. Chain: `pino → createBackendLogger (redact + safeLog) → bind requestId → bind userId → req.log`; core seams wrap in `safeLog` again (idempotent by design).
4. **`/api/health` is registered before the auth stub.** Health probes carry no credentials (Task 12 deploy). The stub never rejects today, so this is structural only.
5. **`ApiError` + JSON `notFoundHandler` already in Task 1** although only `not_found` exists. The error handler needs a discriminator for "message safe to show" vs. generic, and Express's default HTML 404 would break the stable shape for Task 2 clients. 4xx `ApiError` responses are not logged.
6. **`LOG_LEVEL` env added** (not in the plan's env list), default `info`, restricted to core's four levels. Core emits `debug` codes operators are told to tail (`repo.search.path_skipped`); without a switch they are unreachable. Pino's `trace`/`fatal`/`silent` deliberately not exposed.
7. **Pino configuration:** `base: null` (no pid/hostname — the container platform adds them), level emitted as label string, stdout only. The plan's "stdout/stderr" is read as "process streams, not a file". No `pino-pretty` dependency; pipe through `pnpm dlx pino-pretty` locally.
8. **Env failure is plain text on stderr + exit 1**, not a JSON log line — AC-05 asks for a clear terminal message, mirrors the CLI's `requireEnv`. All missing names are reported in one message.
9. **Separate `config.ts`, `bind-logger.ts`, `vault-init.ts`** beyond the plan's Key Locations: AC-04 and AC-05 become unit-testable without spawning a process, and each module has one reason to change.
10. **Server `engines` is `>=22.22.3`** (root floor), not the CLI's `>=20`.
11. **User clarifications (no code impact):** the request-id is correlation only — it links a client-visible error to the server log lines of that request; no distributed tracing, no persistence. `DEV_USER_ID` exists so every server state is `userId`-keyed from day one; Task 9 swaps the same middleware for local JWT verification (`sub` claim) and the invite allowlist. `VAULT_PATH` is the dev path (`REPOSITORY=local`); the Supabase repository arrives in Task 10.

— session 2026-10-25 (Codex `/review quick` triage)
12. **Declined finding:** Codex — `toErrorRecord` emits `err.message` and `err.stack` verbatim; they could carry provider content — declined: the message is the diagnostic payload the log exists for (`"[redacted]"` there would blank every provider incident), the content channels (`responseBody`, `requestBodyValues`, `responseHeaders`) are already stripped, a provider's error text ("prompt is too long …") is not the prompt, and Codex itself rated the trigger theoretical for the productive routes. Reason recorded as a comment at `toErrorRecord`.
13. **Listen errors abort the boot.** Express 5's `app.listen` attaches the callback to `server.once("error")`; the original callback ignored the argument, logged `server.listening`, and the process exited 0 on a busy `PORT` with no message. Fixed with `startServer` (promise around `app.listen`) so success is logged only after `listening`; rejections flow into the existing `main().catch` → `Fatal: listen EADDRINUSE …`, exit 1. Found by Codex, reproduced before and after the fix.
14. **README updated in this task** (Codex blind spot): a new workspace needs its start recipe next to the CLI one, and the pre-existing Node-floor line was already wrong (`.nvmrc` pins 22.22.3). Tech-stack target column deliberately untouched (spec-level content).
15. **Codex blind spot "web/CLI not re-run"**: the full `pnpm -r` suite was re-run on the final code after the review fixes (Test Evidence 2026-10-25).

### Review Focus
- **Behavior claims:** (1) `GET /api/health` → 200 `{ "status": "ok" }`; every response carries `X-Request-Id`, and every error body carries the same `requestId`. (2) Any sync throw or async rejection in a handler → 500 `{ error: { code: "internal_error", message: "Internal server error", requestId } }` with no stack or original message in the body, logged exactly once as `http.unhandled_error` with `requestId`, `method`, `path`. (3) A `LogEvent` whose `meta` carries content keys or whose `err` carries provider bodies is emitted with those values replaced by `"[redacted]"` or dropped; the logger never throws, even with a broken sink. (4) A busy `PORT` aborts the boot with `Fatal: listen EADDRINUSE …` and exit 1; `server.listening` appears only after the server actually listens.
- **Plan deviations:** Key Locations named `index/app/backend-logger/middleware/*` → added `config.ts`, `bind-logger.ts`, `vault-init.ts`, `start-server.ts` (decisions 9, 13). Env list `VAULT_PATH, DEV_USER_ID, PORT` → plus `LOG_LEVEL` (decision 6). "stdout/stderr" → stdout only (decision 7). Health route before auth stub (decision 4). `ApiError`/`not_found` not in the task block (decision 5). README edit not in the task block (decision 14).
- **Assumptions / choices:** `X-Request-Id` is always minted server-side, never trusted from the client. `notFoundHandler` covers all paths, not only `/api/*` (Task 12 static serving will be registered before it). `authStubMiddleware` requires `requestIdMiddleware` to have run (uses `req.log`); `createApp` owns that order. `err.message`/`err.stack` are logged verbatim by decision (12).
- **Scope notes:** comment-only edit in `packages/core/src/logging.ts`; root `dev:server` script; README "Run it locally" section; `pnpm-workspace.yaml` `allowBuilds` committed here per plan log; lockfile moves Angular's transitive `express` 5.2.1 → 5.3.0 (web build + 109 tests green).
- **Read next:** `apps/server/src/start-server.ts` + the `await startServer` / `server.listening` order in `index.ts` — the review fix. `apps/server/src/backend-logger.ts` `isSensitiveMetaKey` + `CONTENT_SEGMENTS`/`QUALIFIER_SEGMENTS` — the one heuristic in the task. `apps/server/src/middleware/error-handler.ts` — the only code that writes a client-facing error body.

### Test Evidence
— session 2026-10-24

Final code state (after prettier formatting of `apps/server`):

```
pnpm -r build      → core, server, cli, web: Done (web bundle 430.79 kB)
pnpm -r typecheck  → core, server, cli, web: Done
pnpm -r test       → core 304 passed (18 files) · server 64 passed (6 files)
                     cli 57 passed (11 files) · web 109 passed (16 files)
pnpm --filter @gtd/server test (re-run after prettier) → 64 passed
```

Quick functional check — run via a throwaway Node script in the session scratchpad (spawns `node dist/index.js` twice against a `mkdtemp` vault, probes, kills). Not part of the tree; nothing to remove. `tsx` was not usable under the Claude sandbox (`listen EPERM` on its IPC socket), hence the built output.

```
=== boot without DEV_USER_ID ===
exit=1 stderr=Error: Missing required environment variable(s): DEV_USER_ID
=== first boot ===
/api/health -> 200 x-request-id=2b69a61b-… body={"status":"ok"}
/api/nope   -> 404 x-request-id=ebbb295d-… body={"error":{"code":"not_found","message":"Route not found","requestId":"ebbb295d-…"}}
{"level":"info","time":…,"code":"server.vault_ready","meta":{"createdCount":5,"created":["tasks/inbox.md","tasks/focus.md","tasks/next-actions.md","tasks/waiting.md","tasks/someday-maybe.md"]},"msg":"Vault task files verified"}
{"level":"info","time":…,"code":"server.listening","meta":{"port":3399},"msg":"Listening on port 3399"}
=== second boot (idempotent) ===
{"level":"info","time":…,"code":"server.vault_ready","meta":{"createdCount":0,"created":[]},"msg":"Vault task files verified"}
=== vault ===
focus.md inbox.md next-actions.md someday-maybe.md waiting.md
history entries: 5, changedBy: system
```

— session 2026-10-25 (after the review fixes; supersedes the runs above as verification of the final code)

```
pnpm --filter @gtd/server test → 7 files, 66 passed (new: start-server.test.ts, 2 tests)
pnpm -r build      → core, server, cli, web: Done
pnpm -r typecheck  → core, server, cli, web: Done
pnpm -r test       → core 304 · server 66 · cli 57 · web 109 — all passed
```

Busy-port probe (scratchpad script: `net.createServer` on a random port, then `node dist/index.js` with that `PORT`; not in the tree):

```
exit=1
stdout={"level":"info",…,"code":"server.vault_ready",…}        ← no server.listening line
stderr=Fatal: listen EADDRINUSE: address already in use :::42151
```

Before the fix the same probe printed `server.listening` and exited 0 (Codex reproduction, confirmed against the Express source).

### Acceptance Coverage
- **T1-AC-01:** passed — `app.test.ts` "GET /api/health → 200 { status: ok } with a request id header"; `error-handler.test.ts` asserts `body.error.requestId === X-Request-Id` on 500 and 404.
- **T1-AC-02:** passed — `error-handler.test.ts` sync throw and async rejection → 500 `internal_error`; response text asserted free of the provider secret and of stack frames; one `http.unhandled_error` log event.
- **T1-AC-03:** passed — `backend-logger.test.ts`: redaction table (20 redacted / 19 kept keys), nested objects and arrays, `err` allowlist (`responseBody`/`requestBodyValues`/`responseHeaders` absent), never-throws with a throwing destination.
- **T1-AC-04:** passed — `vault-init.test.ts`: two boots on a temp vault → 5 files, `created` 5 then 0, history has exactly 5 entries all `changedBy: "system"`. Also exercised end-to-end in the quick check.
- **T1-AC-05:** passed — `config.test.ts` names a missing `VAULT_PATH`, `DEV_USER_ID`, and both at once in one `ConfigError`; the actual exit-1 with the terminal message verified in the quick check.
- **T1-AC-06:** passed — `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` green across all five workspaces on the final code (core 304, server 66, cli 57, web 109) (XC-01).

### Open Issues
- Boot does not yet verify the provider API key (→ Task 6, per plan).

### Context for Next Task
- **Adding routes:** register them in `createApp` between `authStubMiddleware` and `notFoundHandler`. Handlers read `req.userId`, log through `req.log` (already carries `requestId` + `userId`), and signal client errors with `next(new ApiError(status, code, message))` or by throwing — Express 5 routes async rejections to the error handler.
- **`CreateAppOptions`** is `{ logger: Logger; devUserId: string }`. Task 2 needs a per-user `LocalFileRepository` (default `changedBy`); build it in `index.ts` and extend the options — `initializeVault` builds its system-attributed handle for boot only and does not expose it.
- **`startServer` returns the `http.Server`**; `index.ts` currently discards it. Task 6 (SSE streams, detached turns) will likely want the handle for graceful shutdown — keep it there, do not re-introduce a bare `app.listen` callback.
- **New log codes** go into the registry comment at the top of `packages/core/src/logging.ts`; server codes use the `server.*` / `http.*` prefixes.
- **Test pattern:** supertest against `createApp` (or a mini `express()` app for middleware-level tests) with `MemoryLogger`; temp vault via `mkdtemp` + `rm` in `afterEach`. Server tests need `packages/core/dist` built (runtime import in `vault-init.ts`), same as the CLI.
- **Gotcha:** under the Claude sandbox `tsx` fails with `listen EPERM` on its IPC pipe; smoke-run the built `dist/index.js` with plain `node` instead. A normal shell `pnpm dev:server` is unaffected.
- **Gotcha:** `isSensitiveMetaKey` redacts `data`, `input`, `output`, `args` as whole segments — a Task 6 meta key like `toolInput` is blanked by design; log `toolName` and sizes instead.

### Git State
```
$ git diff --stat
 README.md                    |  19 +-
 package.json                 |   1 +
 packages/core/src/logging.ts |  11 +-
 pnpm-lock.yaml               | 519 ++++++++++++++++++++++++++++++++++++++-----
 pnpm-workspace.yaml          |   5 +
 5 files changed, 492 insertions(+), 63 deletions(-)

$ git status --short
 M README.md
 M package.json
 M packages/core/src/logging.ts
 M pnpm-lock.yaml
 M pnpm-workspace.yaml
?? apps/server/
?? docs/work/phase-2a/task-log/task-1-server-skeleton-logging.md
```

### Sessions
- claude-code d7cd11ad-6af7-4e87-8da5-be1e74134695 (2026-10-24) — transcript: ~/.claude/projects/-home-lutz-projects-keppt-app/d7cd11ad-6af7-4e87-8da5-be1e74134695.jsonl
