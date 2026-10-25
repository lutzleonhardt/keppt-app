# Task 2 — Files + daily-index endpoints

### Task
Add the two read endpoints `GET /api/files/{path}` and `GET /api/daily-notes` to the Task-1 Express app, behind the auth stub, delegating to the configured `FileRepository`; in the same session the daily-note path rule was unified into core `gtd-layout.ts` so the HTTP API and the LLM gate share one definition (scope addition, see decision 10).

### Status
DONE. Independent review performed: Codex `/review quick` (2026-10-25, on the state before the core-unification addendum) raised one hotspot and one blind spot — the hotspot (malformed percent-encoding → 500) was declined (decision 13), the blind spot (repository failures untested at route level) was closed with two tests (decision 14). The core addendum itself (decisions 10–12) has not been independently reviewed. `pnpm -r typecheck` and `pnpm -r test` are green on the final code state (core 317, server 85, cli 57, web 109). Quick functional check run against the rebuilt server on a temp vault. Ready for `/commit 2`.

### Files Modified
- `packages/core/src/gtd-layout.ts` (modified) — exports `dailyNoteDate(filePath)`: the single daily-note path definition (`daily/YYYY-MM-DD.md` with a valid calendar date); `canRead`, `canWrite`, `isInActiveScope`, `isPastDaily` use it instead of the former `DAILY_RE`
- `packages/core/src/task-occurrences.ts` (modified) — private `DAILY_FILE_RE` + `dailyDate()` replaced by `dailyNoteDate`
- `packages/core/src/index.ts` (modified) — exports `dailyNoteDate`
- `packages/core/src/__tests__/gtd-layout.test.ts` (modified) — +13 tests: date extraction, non-daily shapes, impossible calendar dates, and an impossible date rejected by every gate
- `apps/server/src/routes/files.ts` (new) — `filesRouter(repo, now)`: `GET /api/files/*path`; `canRead(filePath, formatToday(now()))` throws `InvalidPathError` (400 `invalid_path`) or is false (403 `path_out_of_scope`), then `repo.read` (404 `file_not_found`); `toApiError` maps core errors to `ApiError`, anything else reaches the 500 handler
- `apps/server/src/routes/daily-notes.ts` (new) — `dailyNotesRouter(repo, now)` + pure `toDailyNoteRefs(paths, today)`: `repo.list("daily/")` filenames only, filtered by core `dailyNoteDate`, newest first, `isToday` from `formatToday(now())`
- `apps/server/src/app.ts` (modified) — `CreateAppOptions` gains `fileRepository: FileRepository` and `now?: () => Date` (default system clock); both routers registered between `authStubMiddleware` and `notFoundHandler`
- `apps/server/src/index.ts` (modified) — builds `new LocalFileRepository(config.vaultPath, { logger })` (default `changedBy: "llm"`) after `initializeVault` and passes it to `createApp`
- `apps/server/src/__tests__/spy-file-repository.ts` (new) — `spyFileRepository(paths)`: `FileRepository` with `vi.fn` `read`/`list` so tests prove the repository was (not) consulted
- `apps/server/src/__tests__/files-route.test.ts` (new) — 13 tests: on-disk vault via `LocalFileRepository` (content, empty vs missing), encoded unsafe paths → 400, out-of-layout incl. an impossible date → 403 with repo untouched, runtime `InvalidPathError` → 400, generic repository failure → 500 `internal_error` (never 404), bare prefix → 404 `not_found`
- `apps/server/src/__tests__/daily-notes-route.test.ts` (new) — 6 tests: newest-first + `isToday` from injected clock, non-matching filenames ignored, empty vault, `list` failure → 500 `internal_error` (never `[]`), on-disk vault, pure `toDailyNoteRefs`
- `apps/server/src/__tests__/app.test.ts`, `apps/server/src/__tests__/start-server.test.ts` (modified) — pass `fileRepository: new InMemoryFileRepository()` to the extended `createApp` options
- `apps/server/src/middleware/error-handler.ts` (modified) — comment only: records why router errors carrying their own `status` still become 500 (declined Codex finding, decision 13)
- `apps/web/src/app/vault/vault.types.ts` (modified) — doc comment on `VAULT_TASK_FILES` now names the core source files it copies (`gtd-task-files.ts` `GTD_TASK_FILES`, `gtd-layout.ts` `dailyNoteDate`) and why the copy exists (Node-only core barrel)
- `docs/improvements.md` (modified) — three promoted entries (see Open Issues); a fourth (percent-encoding → 500) was added and removed again after the Codex triage (decision 13)
- Created and deleted within the session, never committed: `apps/server/src/gtd-scope.ts` + `__tests__/gtd-scope.test.ts` (server-side allowlist copy, superseded by decision 10)

### Files Read (Context Only)
- `packages/core/src/file-repository.ts` (`validateFilePath`, `FileNotFoundError`, `InvalidPathError`), `gtd-task-files.ts`, `local-file-repository.ts` (`list` walk, `resolveSafe` runtime check), `search.ts` (`formatToday`, `isInScope`), `in-memory-file-repository.ts` (options)
- `packages/core/src/tools.ts` (`list_files` / `search_files` have no date window; `allowedByCanRead`; `find_task_occurrences` horizon), `system-prompt.ts` (T-C5, history-question rule), `auto-replan.ts` — for the daily-folder-scaling discussion
- `apps/server/src/{vault-init,bind-logger}.ts`, `apps/server/src/middleware/{auth-stub,error-handler,request-id}.ts`, `apps/server/src/__tests__/vault-init.test.ts`, `apps/server/{package.json,tsconfig.json}`, `tsconfig.base.json`
- `apps/web/src/app/vault/vault.repository.ts` (`readFile` null contract), `apps/web/src/app/app.config.ts` (mock providers), `app.routes.ts`, `navigation/screen-registry.ts`, `mock/mock-vault.repository.ts`, `apps/web/angular.json` (no `proxyConfig`)
- `docs/specs/architecture.md` — "Archive Layout & Lifecycle", "Open question: Daily-folder scaling"
- `docs/work/phase-2a/task-log/task-1-server-skeleton-logging.md`, `docs-plan-beta-mvp-cut.md` (grep only)
- `node_modules/.pnpm/router@2.2.0/node_modules/router/lib/layer.js` (`decodeParam`), path-to-regexp 8.4.2 (probe, see Test Evidence)

### Key Decisions
— session 2026-10-25
1. **Named wildcard route `/api/files/*path`.** Express 5 (router 2.2.0 / path-to-regexp 8.4.2) delivers the splat as an array of percent-decoded segments; `joinSegments` rejoins with `/`. Verified by probe: `/api/files/tasks/inbox.md` → `["tasks","inbox.md"]`, `/api/files/%2E%2E%2Fx` → `["../x"]`, `/api/files/` → no match. Rejected: `:param` (stops at the first slash) and manual `req.path` prefix matching (would need its own decoding).
2. *(superseded by decision 10)* Server-owned allowlist in `gtd-scope.ts` instead of reusing core `canRead` — argued from the unused `_today` parameter and the plan's "valid date" wording, which core's regex did not check.
3. **Validation order fixed and the repository never consulted for rejected paths:** path safety (400) → GTD scope (403) → `repo.read` (404). Mirrors the spec's two-layer model (path safety in core, GTD scope at the API boundary).
4. **Calendar validation also applied to `GET /api/daily-notes`** (plan said regex only). Keeps the index a subset of what `GET /api/files` serves, so no listed entry can 403 on click. Agreed in the briefing; since decision 10 the same rule lives in core.
5. **`now?: () => Date` on `CreateAppOptions`.** Makes `isToday` tests deterministic (fixture: local noon) instead of writing a today-named file; Task 6's timezone work needs the hook anyway. Default: system clock. Also feeds the `today` argument of `canRead` in the files route.
6. **One injected `fileRepository`, no per-user factory.** Matches the plan's "delegating to the configured FileRepository"; Task 10 reshapes the option when a per-request Supabase client exists. `index.ts` keeps the default `changedBy: "llm"`: nothing writes through this handle in Task 2, and in Task 6 the LLM is the writer.
7. **Repository-time `InvalidPathError` (symlink escape, runtime check #13) → 400 `invalid_path`,** the same code as the syntactic rejection, via one `toApiError` helper. `ApiError` passes through; unknown errors keep reaching the 500 handler. Error messages echo core's text including the client-supplied path (dev path; the client sent it).
8. **Bare `/api/files/` falls through to the generic 404 `not_found`** — the wildcard needs at least one segment; no special-casing.
9. **User clarifications (no code impact):** (a) The Angular UI cannot point at the API after this task: `app.config.ts` binds `MockVaultRepository`, there is no `HttpVaultRepository` and `angular.json` has no `proxyConfig` — that is Task 3. (b) UI surface after Task 3: five task files via the menu, all dailies (not only recent ones) via `/daily` + `/daily/:date`; no archive (the Task-5 redesign 2026-05-20 dropped `archive/daily/`; "archive" is a semantic property), no editor (Task 15), no history (Task 14). (c) Daily-folder growth stays the spec's open question — `list_files`/`search_files` have no date window today, only `find_task_occurrences` is bounded (today−30 … future), and the system prompt keeps `search_files`/`list_files` to explicit history questions. Decided: not now; beta testers start with empty vaults. Three ideas promoted to the improvements register (see Open Issues).

— session 2026-10-25 (core unification addendum)
10. **Supersedes decision 2: one definition of the daily-note rule, in core.** The user flagged the server copy as redundant; the inventory confirmed four copies — `gtd-layout.ts` `DAILY_RE` (gate), `task-occurrences.ts` `DAILY_FILE_RE` + private `dailyDate()`, server `gtd-scope.ts`, web `VAULT_TASK_FILES` (the CLI has none; it goes through `buildTools` → `canRead`). Now `gtd-layout.ts` `dailyNoteDate` is used by all four gate predicates, by the occurrence search, and by the server (`canRead(filePath, formatToday(now()))` in the files route, `dailyNoteDate` in the index route); `gtd-scope.ts` and its test are deleted. The calendar check moved into core rather than being dropped: the single definition is the stricter one, the plan's "valid date" holds, and LLM gate and HTTP API agree exactly. Accepted core behavior change: `canRead`/`canWrite`/`isInActiveScope`/`isPastDaily` reject impossible dates, so `write_file("daily/2026-02-30.md")` returns `out_of_scope` instead of creating a nonsense file, and such names drop out of the 30-day occurrence surface. `isCanonicalTaskFile` (string comparison against `daily/${today}.md`) is unaffected.
11. **The web copy stays, with its sources named in the comment.** `@gtd/core`'s barrel pulls `node:fs` through `LocalFileRepository`, so the browser bundle cannot import it. A browser-safe subpath export (e.g. `@gtd/core/layout`) would remove the last copy — deliberately not now. User's framing confirmed: two copies remain, core (used by everything server-side) and web (which cannot import).
12. **Capture groups in `DAILY_NOTE_PATH`** (`/^daily\/((\d{4})-(\d{2})-(\d{2}))\.md$/`) match exactly the same strings as the old `DAILY_RE`; the nested groups let one `exec` yield the ISO date (group 1) and its year/month/day (groups 2–4) for the calendar round-trip without `split("-")` + `?? 0` fallbacks under `noUncheckedIndexedAccess`. Named groups rejected: `match.groups?.year` carries the same `undefined` typing.

— session 2026-10-25 (Codex `/review quick` triage)
13. **Declined finding:** Codex — malformed percent-encoding (`/api/files/%zz`, `%C0%AF`) makes the router throw a `URIError` with `status: 400` that `errorHandler` renders as 500 `internal_error` and logs as `http.unhandled_error` — declined: the clients send fixed vault paths (five task files, `daily/YYYY-MM-DD.md`), so such a request is a client bug and the error log line is the wanted signal; no real client reaches it. Reason recorded as a comment at the 500 branch of `errorHandler`, with "revisit once request bodies are parsed" because the body parser (Task 6) raises the same error class (`entity.parse.failed` 400, `entity.too.large` 413). The improvements-register entry from the first wrap-up was removed: an accepted risk is closed, not pending.
14. **Codex blind spot — repository failures untested at route level — fixed with two tests, no production code.** `files-route.test.ts`: `read` rejecting with an `EIO` error → 500 `internal_error`, never 404; `daily-notes-route.test.ts`: `list` rejecting with `EACCES` → 500, never `[]`; neither response text contains the OS message. Pins the invariant Task 3 relies on when it maps 404 to `null`: an I/O failure must surface as an error, not as an empty file or an empty index.

### Review Focus
- **Behavior claims:** (1) `GET /api/files/{path}` returns 200 `{ content }` for the five task files and valid dailies, 404 `file_not_found` for a missing allowlisted file, and 200 `{ content: "" }` for an existing empty file — never 404 for empty. (2) Traversal, `.keppt/…`, empty segments → 400 `invalid_path`; `random.md`, `archive/daily/…`, impossible dates → 403 `path_out_of_scope`; the repository is not called in either case, and the body carries the `X-Request-Id`. (3) `GET /api/daily-notes` returns `{ date, isToday }[]` newest first from `repo.list("daily/")` filenames alone; non-matching names and impossible dates are omitted; `isToday` is server-local. (4) Core gates now reject impossible calendar dates: `canRead("daily/2026-02-30.md", today)` is false, likewise `canWrite`, `isInActiveScope`, `isPastDaily`.
- **Plan deviations:** Key Locations `routes/files.ts` + `routes/daily-notes.ts` → additionally `packages/core/src/gtd-layout.ts`, `task-occurrences.ts`, `index.ts` and their test (decision 10) — a core change outside the task block, agreed with the user in-session. Daily-notes "matched against the regex" → regex plus calendar validation, in core (decisions 4, 10). `createApp` options → `fileRepository` (implied by the plan) and `now` (decision 5). Web doc comment edited outside the task surface (decision 11).
- **Assumptions / choices:** splat param arrives as an array (decision 1, probe-verified, re-verified by every route test). Runtime `InvalidPathError` → 400 (decision 7). Error messages echo the client path (decision 7). The server passes a real `today` to `canRead` although the gate ignores `_today`. `isToday` server-local per plan.
- **Scope notes:** core behavior change for impossible dates (decision 10) — covered by `gtd-layout.test.ts`; `task-occurrences` semantics otherwise unchanged. `app.test.ts` / `start-server.test.ts` changed only to pass a repository. `docs/improvements.md` gained three entries. `error-handler.ts` changed by a comment only (decision 13). No README change (no endpoint list exists there yet). No new log codes: 4xx `ApiError`s are not logged (Task 1 decision 5), and the routes emit no events.
- **Read next:** `packages/core/src/gtd-layout.ts` `dailyNoteDate` and its four call sites — the one shared rule and the only core behavior change. `apps/server/src/routes/files.ts` — the try/catch around `canRead` → `read` and `toApiError` is the whole error surface of the task. `apps/server/src/app.ts` — route registration order relative to auth stub and 404.

### Test Evidence
— session 2026-10-25, first pass (counts overtaken by the addendum below; the probes and the quick-check output remain valid)

```
pnpm --filter @gtd/server test → 10 files, 106 passed  (incl. 23 in gtd-scope.test.ts, since deleted)
pnpm -r typecheck → core, server, cli, web: Done
pnpm -r test      → core 304 · server 106 · cli 57 · web 109 — all passed
```

Test files typechecked separately (the workspace `tsconfig.json` excludes `__tests__`, so `tsc` never sees them): ad-hoc `$TMPDIR/tsconfig.tests.json` extending the server config with `include: src/**/*`, `exclude: []`, `noEmit` → 0 errors. Probe file lives outside the tree; nothing to remove.

Wildcard probe (before implementation; path-to-regexp 8.4.2 `match("/api/files/*path")`, run from a throwaway file next to the package, removed afterwards):

```
/api/files/tasks/inbox.md → params.path = ["tasks","inbox.md"]
/api/files/random.md      → ["random.md"]
/api/files/               → false (no match)
/api/files/%2E%2E%2Fx     → ["../x"]
```

Quick functional check — scratchpad script (`quick-check.mjs`, not in the tree) spawns `node apps/server/dist/index.js` against a `mkdtemp` vault holding `tasks/inbox.md`, `daily/<today>.md`, `daily/2026-07-14.md`, `daily/notes.md`, waits for `server.listening`, probes, kills. `tsx` is unusable under the Claude sandbox (Task 1 gotcha), hence the built output.

```
/api/files/tasks/inbox.md          -> 200 {"content":"# Inbox\n\n- [ ] Anna anrufen\n"}
/api/files/daily/2026-10-25.md     -> 200 {"content":"# 2026-10-25\n\n## Plan\n- [ ] Task 2 abschließen\n"}
/api/files/daily/2020-01-01.md     -> 404 {"error":{"code":"file_not_found","message":"File not found: daily/2020-01-01.md","requestId":"…"}}
/api/files/random.md               -> 403 {"error":{"code":"path_out_of_scope","message":"Path is outside the GTD layout: random.md","requestId":"…"}}
/api/files/%2E%2E%2Fx              -> 400 {"error":{"code":"invalid_path","message":"Invalid file path '../x': parent-directory traversal is not allowed",…}}
/api/files/.keppt/file-history.jsonl -> 400 {"error":{"code":"invalid_path","message":"Invalid file path '.keppt/file-history.jsonl': '.keppt/' is reserved for internal state",…}}
/api/daily-notes                   -> 200 [{"date":"2026-10-25","isToday":true},{"date":"2026-07-14","isToday":false}]
```

`daily/notes.md` is absent from the index as intended. Against the real dogfooding vault: `pnpm dev:server`, then `curl localhost:3333/api/files/tasks/inbox.md` and `curl localhost:3333/api/daily-notes` — not run in-session (vault path not configured in the sandbox).

— session 2026-10-25 (core unification addendum; verification of the final code state)

```
prettier --write  → core gtd-layout.ts, task-occurrences.ts, index.ts, gtd-layout.test.ts; server routes/*.ts, app.ts
pnpm --filter @gtd/core build → clean
pnpm -r typecheck → core, server, cli, web: Done
pnpm -r test      → core 317 (18 files, +13 in gtd-layout.test.ts) · server 83 (9 files, gtd-scope.test.ts removed)
                    cli 57 · web 109 — all passed
pnpm --filter @gtd/server build → clean; quick-check.mjs re-run → the same seven responses as above
```

— session 2026-10-25 (after the Codex triage; verification of the final code state)

```
prettier --write  → files-route.test.ts, daily-notes-route.test.ts, error-handler.ts (all unchanged by prettier)
pnpm --filter @gtd/server typecheck → clean
pnpm --filter @gtd/server test      → 9 files, 85 passed (+2: repository-failure tests)
```

Core, CLI and web untouched since the addendum run above (core 317 · cli 57 · web 109); the only production-file change is the comment in `error-handler.ts`.

### Acceptance Coverage
- **T2-AC-01:** passed — `files-route.test.ts` "returns the content of a task file and of a daily note" and "distinguishes an empty file (200 with empty content) from a missing one (404)" against `LocalFileRepository` on a temp vault; also end-to-end in the quick check.
- **T2-AC-02:** passed — `files-route.test.ts` validation block: `%2E%2E%2Fx`, `.keppt/file-history.jsonl`, `tasks%2F%2Finbox.md` → 400 `invalid_path`; `random.md`, `tasks/other.md`, `archive/daily/2026-01-01.md`, `daily/notes.md`, `daily/2026-13-45.md` → 403 `path_out_of_scope`; `read` spy never called; `requestId` in body equals the header. The scope rule itself is unit-tested in `packages/core/src/__tests__/gtd-layout.test.ts` ("dailyNoteDate" block).
- **T2-AC-03 / T2-AC-04:** N/A — moved to Task 15 with the `PUT` endpoint by the 2026-10-24 amendment.
- **T2-AC-05:** passed — `daily-notes-route.test.ts` "lists daily notes newest first with isToday from the server clock, using filenames only" (`list` called with `"daily/"`, `read` never called), "ignores filenames that are not valid daily notes", plus the on-disk variant and the pure `toDailyNoteRefs` test.

### Open Issues
- Promoted: daily-folder scaling — reinterpret the `search_files` `archive` scope by age instead of path as a fourth candidate for the spec's open question (→ improvements register)
- Promoted: daily index UI — year grouping of `/daily` once the list grows, client-side only (→ improvements register)
- Promoted: trigger check — count `daily/*.md` in the dogfooding vault; ≥100 meets the spec's first daily-folder-scaling trigger (→ improvements register)

### Context for Next Task
- **GTD scope has one definition:** core `canRead(filePath, today)` (throws `InvalidPathError` for unsafe paths, false outside the layout) and `dailyNoteDate(filePath)` (ISO date or undefined, calendar-validated). The server has no allowlist of its own; new routes that touch vault paths call these. The web keeps its `VAULT_TASK_FILES` copy because the browser cannot import the core barrel — its comment names the sources.
- **API contract for `HttpVaultRepository` (Task 3):** `GET /api/files/{path}` → 200 `{ content: string }`; 404 `file_not_found` is the only response that maps to `null` (`VaultRepository.readFile` contract: null = does not exist, `""` = exists and empty). 400 `invalid_path` / 403 `path_out_of_scope` mean the client sent a path outside `VaultFile` — surface as an error, never as `null`. `GET /api/daily-notes` → `{ date: "YYYY-MM-DD", isToday: boolean }[]` newest first; shape already matches `apps/web/src/app/vault/vault.types.ts` `DailyNoteRef`.
- **Error body shape** for all codes: `{ error: { code, message, requestId } }` (`apps/server/src/middleware/error-handler.ts`); `X-Request-Id` header on every response.
- **Paths on the wire:** send the vault path as-is (`/api/files/tasks/inbox.md`, `/api/files/daily/2026-07-14.md`); the allowlisted names contain no characters that need encoding. Encoded slashes (`%2F`) also work (segment-wise decoding) but are unnecessary.
- **Dev proxy:** server default `PORT` 3333; `ng serve` runs on 4200 and needs a `proxyConfig` forwarding `/api` to `http://localhost:3333`. `apps/web/angular.json` has none yet.
- **Today semantics:** `isToday` is server-local; the client's `APP_TODAY` token (`app.config.ts`, currently `MOCK_TODAY`) is browser-local. Identical on one dev machine; Task 3 decides how `APP_TODAY` is provided once the mock goes.
- **Test seams:** `createApp` now requires `fileRepository`; existing tests use `InMemoryFileRepository`. `apps/server/src/__tests__/spy-file-repository.ts` gives spy `read`/`list` for call assertions; `now` on `createApp` pins the clock for both routes.
- **Gotchas:** server tests need `packages/core/dist` built (`pnpm --filter @gtd/core build`) — and rebuilt after any core change, or the server tests run against stale exports. `tsx` fails under the Claude sandbox — smoke-run `node dist/index.js`. The workspace `tsconfig.json` excludes `__tests__`, so test type errors only surface through vitest's esbuild transform; typecheck them with an ad-hoc tsconfig when in doubt (Test Evidence).

### Git State
```
$ git diff --stat
 apps/server/src/__tests__/app.test.ts          | 14 +++++++--
 apps/server/src/__tests__/start-server.test.ts |  8 +++--
 apps/server/src/app.ts                         | 20 +++++++++++--
 apps/server/src/index.ts                       |  8 ++++-
 apps/server/src/middleware/error-handler.ts    |  4 +++
 apps/web/src/app/vault/vault.types.ts          |  9 +++---
 docs/improvements.md                           |  3 ++
 packages/core/src/__tests__/gtd-layout.test.ts | 41 +++++++++++++++++++++++++-
 packages/core/src/gtd-layout.ts                | 29 ++++++++++++++----
 packages/core/src/index.ts                     |  1 +
 packages/core/src/task-occurrences.ts          | 11 ++-----
 11 files changed, 120 insertions(+), 28 deletions(-)

$ git status --short
 M apps/server/src/__tests__/app.test.ts
 M apps/server/src/__tests__/start-server.test.ts
 M apps/server/src/app.ts
 M apps/server/src/index.ts
 M apps/server/src/middleware/error-handler.ts
 M apps/web/src/app/vault/vault.types.ts
 M docs/improvements.md
 M packages/core/src/__tests__/gtd-layout.test.ts
 M packages/core/src/gtd-layout.ts
 M packages/core/src/index.ts
 M packages/core/src/task-occurrences.ts
?? apps/server/src/__tests__/daily-notes-route.test.ts
?? apps/server/src/__tests__/files-route.test.ts
?? apps/server/src/__tests__/spy-file-repository.ts
?? apps/server/src/routes/
?? docs/work/phase-2a/task-log/task-2-files-daily-notes-endpoints.md
```

### Sessions
- claude-code 248d2245-6aac-4994-9995-6d2875114d4a (2026-10-25) — transcript: ~/.claude/projects/-home-lutz-projects-keppt-app/248d2245-6aac-4994-9995-6d2875114d4a.jsonl
