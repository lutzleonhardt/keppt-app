# Task 3 — Wire vault screens to the backend (HttpVaultRepository)

### Task
Replace the mock vault data path in `apps/web` with an HTTP adapter over the Task-2 endpoints (`GET /api/files/{path}`, `GET /api/daily-notes`), add the `ng serve` proxy to the server, and drop the fixed `APP_TODAY` mock override so drawer and header show the real date.

### Status
DONE. Independent review performed: Codex `/review quick` and the CodeScene gate (both 2026-10-31) found no hotspots; the two Codex blind spots are triaged below (README fixed, browser check stays manual), the CodeScene duplication finding is accepted (decisions 12–14). `pnpm --filter web typecheck` and `pnpm --filter web test` (17 files, 119 tests, +10 new) are green on the final code state; the `ng serve` development build compiles. Quick functional check run in-session against a copy of Lutz's sample vault through the dev proxy (API path only). Not observed in-session: the rendered screens and the real date in a browser against the live server — the sandbox's ports are unreachable from a browser outside it; Lutz runs that part (commands in Test Evidence and now in the README). No code changed after the green test run; the only later edit is `README.md`. Ready for `/commit 3`. Two follow-ups were split out into the plan as Tasks 3.1/3.2 (decision 11); Task 3 itself lands unchanged.

### Files Modified
- `apps/web/src/app/vault/http-vault.repository.ts` (new) — `HttpVaultRepository extends VaultRepository`: `readFile` → `GET /api/files/{file}` via `HttpClient` + `firstValueFrom`, resolves `body.content`; only a 404 whose body carries `error.code === "file_not_found"` resolves to `null`, every other failure rethrows; `listDailyNotes` → `GET /api/daily-notes` passed through as `DailyNoteRef[]`. Private helpers `isFileNotFound` / `apiErrorCode` read the error body defensively
- `apps/web/src/app/vault/http-vault.repository.test.ts` (new) — 10 tests with `provideHttpClient()` + `provideHttpClientTesting()` / `HttpTestingController`: URL + method for task file and daily note, empty content stays `""`, 404 `file_not_found` → `null`, 404 with another code → reject, 403 `path_out_of_scope` → reject, network error (status 0) → reject; index mapping in server order, network error and 500 → reject (never `[]`); `verify()` after each test
- `apps/web/proxy.conf.json` (new) — `/api` → `http://localhost:3333`, `secure: false`
- `apps/web/angular.json` (modified) — `serve` target gains `options.proxyConfig: "proxy.conf.json"`
- `apps/web/src/app/app.config.ts` (modified) — `VaultRepository` bound to `HttpVaultRepository` instead of `MockVaultRepository`; the `{ provide: APP_TODAY, useValue: MOCK_TODAY }` line and the `MOCK_TODAY` / `MockVaultRepository` / `APP_TODAY` imports removed; the "mock-first" wiring comment rewritten (transport swap = one binding)
- `apps/web/src/app/mock/mock-vault.repository.ts` (modified) — doc comment only: "used until the HTTP vault adapter lands" → "over the reference fixtures, for tests"
- `README.md` (modified) — "Run it locally" gains the two-terminal startup for the Angular app (`pnpm --filter web dev`, proxy to port 3333, error state without the server, chat still on its mock) — Codex blind spot, decision 12
- `docs/improvements.md` (modified) — one promoted entry: module-boundary tooling for `apps/web` (Sheriff + ESLint) with its trigger (decision 11)
- `docs/work/phase-2a/plan.md` (modified, **separate `plan:` commit**, not part of `/commit 3`) — Tasks 3.1/3.2 added to the at-a-glance list and as full blocks between Tasks 3 and 4 (decision 11)

### Files Read (Context Only)
- `apps/web/src/app/vault/vault.repository.ts` (`readFile` null contract), `vault.types.ts` (`VaultFile`, `DailyNoteRef`, `dailyFilePath`), `vault-file-screen.ts` + `.html` (Resource state branches: error / loading / `null` missing / `""` empty / markdown), `daily-notes-screen.ts`, `daily-note-detail-screen.ts`
- `apps/web/src/app/app.routes.ts` (`knownDailyDate` guard awaits `listDailyNotes()`), `app.config.ts`, `i18n/local-date.ts` (`APP_TODAY` root factory `systemLocalToday`), `transloco-loader.ts` (relative-URL convention), `main.ts`
- `apps/web/src/app/mock/mock-vault.repository.ts`, `mock-app-context.ts` (`MOCK_TODAY`), `mock-vault-data.ts` (grep), `navigation/app-drawer.ts` + `chat/components/session-header.ts` (`APP_TODAY` consumers)
- `apps/web/src/testing/vault-testing.ts` (`TestVaultRepository`, `deferred`), `apps/web/src/app/vault/vault-file-screen.test.ts`, `daily-notes.test.ts`, `mock/mock-vault.repository.test.ts`, `app.routes.test.ts`, `navigation/navigation.service.test.ts` (guard cases: pending, redirect, `NavigationError`)
- `apps/web/angular.json`, `package.json`, `tsconfig.spec.json`; `apps/web/public/i18n/de.json` (`vault.state.*` copy)
- `apps/server/src/routes/files.ts`, `middleware/error-handler.ts` (`ErrorBody` shape), `middleware/auth-stub.ts` (no client header needed), `config.ts` (`DEFAULT_PORT` 3333, `VAULT_PATH`/`DEV_USER_ID`), `vault-init.ts` (`ensureGtdTaskFiles` at boot), `app.ts` (grep: health route is `/api/health`)
- `docs/specs/angular-chat-ui.md` lines 215–232 only (`VaultRepository` contract, guard semantics) — targeted lookup to answer a user question, not a full spec read
- `docs/work/phase-2a/task-log/task-2-files-daily-notes-endpoints.md` (predecessor), `task-1-server-skeleton-logging.md` (grep: env vars, `tsx` sandbox gotcha), `README.md` (grep: server start block)

### Key Decisions
— session 2026-10-31
1. **404 mapping is strict: only `file_not_found` becomes `null`.** A 404 with any other code (e.g. the generic `not_found` of an unmatched route) rejects, as do 400 `invalid_path` / 403 `path_out_of_scope` and transport failures. "Missing" and "broken" stay visually distinct (T3-AC-02); a mis-built URL is a client bug that should show the error state, not "Diese Datei wurde nicht gefunden". Pinned by the test "rejects a 404 that does not name a missing vault file".
2. **User clarification — why a missing file is not an error.** The spec (`angular-chat-ui.md`) defines `readFile(): Promise<string | null>` and five screen states (loading, error/retry, missing, empty, rendered); the mock already returned `null` for unknown paths and `daily-notes.test.ts` pins the missing copy. The backend serves 404 `file_not_found` only for a layout-conforming path whose file is absent. Through the UI this state is reachable only by a race (file deleted in Obsidian between index and click, or a task file deleted while the server runs): the `/daily/:date` guard redirects unknown dates before any read, and the server creates the five task files at boot. In that race "wurde nicht gefunden" is truthful; "error + retry" would promise that retrying helps.
3. **Error body read defensively.** `HttpErrorResponse.error` is a parsed object for JSON bodies, a string when parsing fails, or a `ProgressEvent` on network errors; `apiErrorCode(body: unknown)` narrows through an `ApiErrorBody` type with optional `unknown` fields rather than casting to the server's `ErrorBody`. The web cannot import `apps/server` types, so the shape is a local copy of `{ error: { code } }`.
4. **No validation of the success body.** `{ content: string }` is trusted as typed; the server is ours and the dev path has no untrusted intermediary. Rejected: a runtime shape check — YAGNI until a second consumer or an untrusted hop exists.
5. **`firstValueFrom` on `HttpClient` observables keeps the contract Promise-based** (consumers and the `TestVaultRepository` seam unchanged). No caching, no request sharing (spec: cache-free boundary); the Daily list and the guard still issue independent index reads.
6. **`APP_TODAY` override dropped, `MOCK_TODAY` kept.** The root factory in `local-date.ts` now supplies the browser-local date to `app-drawer.ts` and `session-header.ts`. `MOCK_TODAY` stays as the anchor of `mock-vault-data.ts` and is provided test-locally in `chat-screen.test.ts` / `app-drawer.test.ts`, so those specs remain deterministic. Accepted transition state until Task 8: `MockChatService` shows May-2026 demo content under a real-date header.
7. **Proxy is `/api` only, `secure: false`, no `changeOrigin`.** Same-origin from the browser's view, so no CORS work; base-URL/token handling arrives with auth (Task 9). `--host 127.0.0.1` was needed only inside the sandbox, not in the config.
8. **Comment hygiene outside the key locations:** two doc comments would have become false (`MockVaultRepository` "until the HTTP vault adapter lands", `app.config.ts` "mock implementations the only bindings"); both rewritten. Announced in the briefing.
9. **Quick check against a copy of the sample vault.** Lutz offered `/home/lutz/projects/kept-vault`; the server was run against a `cp -r` into `$TMPDIR` so that boot-time `ensureGtdTaskFiles` and any later write never touch the original (also outside the sandbox write allowlist). Note the quick check runs with HTTP 500 from Vite when the API server is dead, not status 0 — the adapter rejects either way, and the spec covers both shapes.
10. **User clarification (no code impact):** `resource()` is Angular core API (v19+), not project code; it yields `status()`, `value()`, `error()`, `hasValue()`, `reload()`; the loader's Promise drives it (resolve → `resolved`, reject → `error`). The screens' Resources are untouched by this task.
11. **Follow-ups split out as Tasks 3.1/3.2 (plan amendment 2026-10-31) instead of folding them into this task.** Lutz rejected the cast-based error-body read (`apiErrorCode`, decision 3) as the wrong level of type safety and asked for a shared contract between server and web. Agreed design: `packages/api` (`@gtd/api`) carrying `API_ERROR_CODES` tuple → `ApiErrorCode` union, `ErrorBody`, the one tested guard `apiErrorOf(body: unknown)`, and the DTOs `FileContentBody`/`DailyNoteRef`; plus a browser-safe `@gtd/core/layout` entry (Task-2 decision 11's deferred item) guarded by a `tsconfig.layout.json` with `types: []`. Package direction (api → core, server/web → api) is enforced by pnpm's strict `node_modules` + `workspace:*` declarations; Sheriff/ESLint judged overkill for that and premature for app-internal layering (register entry with trigger). Combined the work touches ~25 files across three packages, so it became two dependency-ordered tasks (layout entry first, so the contract package never churns `IsoDate`/`GtdTaskFilePath`). Task 3's code is correct and tested and lands as is; the cast lives until Task 3.2 replaces it.

— session 2026-10-31 (Codex `/review quick` + CodeScene gate triage)
12. **Codex blind spot — README explains the server start but not running it together with Angular — fixed, docs only.** Since this task the vault screens need the server on port 3333; someone starting only `ng serve` sees the error state. "Run it locally" now documents the second terminal, the proxy, and the mock chat transition. No code change.
13. **Codex blind spot — browser check of T3-AC-01/03/04 not run in-session — acknowledged, stays manual.** Already recorded as the verification gap in Acceptance Coverage (sandbox ports unreachable from a browser). Not a declined finding: Lutz runs the check with the README commands; a later `/wrap-up 3` can lift the two `partial` lines.
14. **Accepted CodeScene finding: four code-duplication hits in `http-vault.repository.test.ts` (lines 88, 100, 143, 153) — the `await outcome` → `toBeInstanceOf(HttpErrorResponse)` → `status` triple repeated per failure case.** Accepted as the gate itself proposed: test code, each failure case stays readable on its own, and the engineering guidelines exempt tests from the production-file triggers. A five-line `expectHttpError(outcome, status)` helper remains an option if the file grows.

### Review Focus
- **Behavior claims:** (1) With the server up, the five task screens and Daily list/detail render the vault's markdown via `/api`; the Resource states are unchanged — `undefined` loading, reject → `error` with working retry, `null` missing, `""` empty, `[]` empty index. (2) `readFile` resolves `null` for exactly one response, 404 with body code `file_not_found`; 400/403, other 404s, 5xx and network errors reject into the error state. (3) `listDailyNotes` passes the server's `{ date, isToday }[]` through in server order and rejects on any failure, so the `/daily/:date` guard sees a `NavigationError` on transport failure and redirects only on a successfully loaded index.
- **Plan deviations:** None in behavior. Two comment-only edits outside Key Locations (`mock-vault.repository.ts`, the wiring comment in `app.config.ts`) — decision 8.
- **Assumptions / choices:** strict `file_not_found`-only mapping (decision 1); defensive error-body read, no success-body validation (decisions 3, 4); `MOCK_TODAY` retained for fixtures and test-local overrides (decision 6); proxy `/api` only (decision 7).
- **Scope notes:** `README.md` gains the Angular startup note (review fix); `docs/improvements.md` gains one entry and `plan.md` two follow-up tasks (the plan amendment is committed separately as `plan: …`, precedent `c6fbf28`); `angular.json` gains only `serve.options.proxyConfig`; `MockVaultRepository` remains injectable and is still the default binding in the screen specs (XC-03). No i18n, template, route, or server change. The `MockChatService` fixed-date demo content under a real-date header is the plan's accepted transition state.
- **Read next:** `apps/web/src/app/vault/http-vault.repository.ts` — the `catch` branch plus `isFileNotFound`/`apiErrorCode` are the entire error surface of the task. `apps/web/src/app/vault/http-vault.repository.test.ts` "rejects a 404 that does not name a missing vault file" and "rejects when the server is unreachable" — the two cases that keep missing and broken apart. `apps/web/src/app/app.config.ts` — confirm the binding swap and that no `APP_TODAY` provider remains.

### Test Evidence
— session 2026-10-31 (final code state)

```
prettier --write  → http-vault.repository.ts, http-vault.repository.test.ts, app.config.ts,
                    mock-vault.repository.ts, proxy.conf.json (only the spec was reformatted)
pnpm --filter web typecheck → ngc -p tsconfig.app.json --noEmit: clean
pnpm --filter web test      → 17 files, 119 passed (109 before + 10 in http-vault.repository.test.ts)
ng serve (development)      → Application bundle generation complete, main.js 236.73 kB
```

Core, CLI and server are untouched by this task (no files changed under `packages/` or `apps/server/`); their suites were last run green in Task 2 (core 317 · server 85 · cli 57).

Quick functional check, API path through the dev proxy — scratchpad script `$TMPDIR/quick-check.sh` (not in the tree) starts `node apps/server/dist/index.js` with `VAULT_PATH=<copy of /home/lutz/projects/kept-vault> DEV_USER_ID=lutz` and `ng serve --port 4200 --host 127.0.0.1` in one shell, probes `127.0.0.1:4200`, kills the API server, probes again:

```
/api/daily-notes                 -> [{"date":"2026-07-14","isToday":false},{"date":"2026-05-24",…},…,{"date":"2026-05-20",…}] [200]  (6 entries, newest first)
/api/files/tasks/inbox.md        -> {"content":"---\ntitle: Inbox\ntags: [tasks, gtd]\n---\n\n# Inbox\n\nUnverarbeitete Aufgaben …"} [200]
/api/files/daily/2026-07-14.md   -> {"content":"---\ntitle: 2026-07-14\n…## Log\n\n- Vodafone: …"} [200]
/api/files/daily/2020-01-01.md   -> {"error":{"code":"file_not_found","message":"File not found: daily/2020-01-01.md","requestId":"…"}} [404]
/api/files/random.md             -> {"error":{"code":"path_out_of_scope","message":"Path is outside the GTD layout: random.md","requestId":"…"}} [403]
/ (index.html)                   -> <title>Keppt</title> <keppt-root
--- API server killed ---
/api/daily-notes                 -> [500]   (ng-serve log: "[vite] http proxy error: /api/daily-notes … ECONNREFUSED")
/api/files/tasks/inbox.md        -> [500]
```

Both probes are gone: the script and the vault copy live in `$TMPDIR`, nothing was added to the tree. The script's readiness loop polled `/health` instead of `/api/health` and therefore waited its full 30 s before probing — harmless, the probes themselves prove the server was up. Sandbox gotcha recorded for later tasks: every Bash call has its own network and PID namespace, so a server started in one call (even `run_in_background`) is unreachable from the next; server and probes must run in one script.

— session 2026-10-31 (independent review of the state above; no code changed since)

```
Codex /review quick  → no hotspots in the 7 uncommitted files; blind spots: browser check (known), README startup note (fixed)
CodeScene gate (/cs) → passed: 3 scored files 9.38–10.0; both repository implementations 10.0; app.config.ts unscored;
                       4 introduced code-duplication hits in http-vault.repository.test.ts — accepted (decision 14)
```

The README edit after the review touches no code; typecheck and the 119 web tests above remain the verification of the final code state.

Browser part of the quick check — **not run in-session** (sandbox ports are unreachable from a browser outside it). Commands for Lutz:

```
VAULT_PATH=/home/lutz/projects/kept-vault DEV_USER_ID=lutz pnpm dev:server
pnpm --filter web dev        # then open http://localhost:4200
```

Expected: Inbox and `/daily` show the sample vault (six days, 2026-07-14 first), the drawer shows today's date in the active locale; stop the server and press "Erneut versuchen" → "Inhalt konnte nicht geladen werden." with a working retry once the server is back; `/daily/1999-01-01` redirects to `/daily`.

### Acceptance Coverage
- **T3-AC-01:** partial — API chain verified end-to-end through the proxy against the sample vault (index, task file, daily note, 404, 403, server down → 500); loading/error-retry/missing/empty rendering remains pinned by `vault-file-screen.test.ts` and `daily-notes.test.ts` via `TestVaultRepository`. Gap: the screens were not observed in a browser against the live server (sandbox limit; Lutz's commands above).
- **T3-AC-02:** passed — `http-vault.repository.test.ts` "resolves null for a 404 file_not_found", "rejects a 404 that does not name a missing vault file", "rejects a path the server refuses instead of reporting it missing", "rejects when the server is unreachable"; the distinct UI for `null` vs error is pinned by the existing screen specs (missing copy in `daily-notes.test.ts`, error + retry in `vault-file-screen.test.ts`).
- **T3-AC-03:** passed — guard code unchanged; `navigation.service.test.ts` pins pending → resolve, unknown date → redirect to `/daily`, rejected index → `NavigationError` without redirect; the adapter's side is pinned by "rejects a transport failure instead of resolving an empty index" and "rejects a server error instead of resolving an empty index". The live-browser redirect is part of the pending browser check.
- **T3-AC-04:** partial — the `APP_TODAY` override is gone (`app.config.ts` no longer imports `APP_TODAY`/`MOCK_TODAY`; remaining references are the root factory and test-local providers). Gap: the real date in drawer/header was not observed in a browser in-session.
- **T3-AC-05:** passed — `http-vault.repository.test.ts` (10 tests, `provideHttpClientTesting`); all pre-existing vault-screen specs green with `MockVaultRepository` / `TestVaultRepository` (119 total); `MockVaultRepository` still injectable (XC-03: `mock-vault.repository.test.ts` plus the screen specs' default binding).

### Open Issues
- Cast-based error-body read in `http-vault.repository.ts` (`ApiErrorBody`, `apiErrorCode`) and the duplicated `FileContentBody`/`DailyNoteRef` wire shapes (→ Task 3.2)
- Web copy of the vault layout in `vault.types.ts` `VAULT_TASK_FILES` (→ Task 3.1)
- Promoted: module-boundary tooling for `apps/web` (Sheriff + ESLint), trigger: once Tasks 8/11/14/15 add chat transport, voice, history and editor (→ improvements register)

### Context for Next Task
- **Adapter pattern to copy for `HttpChatService` (Task 8):** `@Injectable()` class extending the abstract contract, `inject(HttpClient)`, relative `/api/...` URLs, `firstValueFrom` for request/response calls, bound with one `useClass` line in `app.config.ts`. The error-body reader (`apiErrorCode`) is a private stopgap in `http-vault.repository.ts`; Task 3.2 replaces it with `apiErrorOf` from `@gtd/api`, which later adapters import.
- **Dev proxy:** `apps/web/proxy.conf.json` forwards `/api` to `:3333`; every new server route under `/api` is covered automatically. Task 6/8's SSE stream (`GET /api/chat/stream`) goes through the same Vite proxy — verify streaming (no buffering) when it lands; nothing in the config addresses it yet.
- **Error shapes seen by the client:** API errors arrive as `HttpErrorResponse` with `error.error.code`; a dead API server behind the dev proxy arrives as HTTP 500 without an API body (Vite), as status 0 only without a proxy. Map by `status` + body code, never by body alone.
- **Today semantics:** `APP_TODAY` is now the browser-local date (root factory); `isToday` in the daily index is server-local. Identical on one machine; Task 6's client-timezone work owns the split.
- **Test seams unchanged:** `TestVaultRepository` / `MockVaultRepository` for screens and guard; `provideHttpClientTesting` + `HttpTestingController` for HTTP adapters (first use in this repo — `http-vault.repository.test.ts` is the template, including the `rejectionOf` helper that attaches the rejection handler before the request is flushed).
- **Gotchas:** (1) Sandbox: per-command network/PID namespaces — run server + probes in one foreground script; `ng serve` needs `--host 127.0.0.1` there. (2) Health route is `/api/health`, not `/health`. (3) `pkill -f '<pattern>'` kills the parent shell when the pattern appears in the heredoc that wrote the script. (4) The sample vault `/home/lutz/projects/kept-vault` is outside the sandbox write allowlist — copy it into `$TMPDIR` before pointing `VAULT_PATH` at it.

### Git State
```
$ git diff --stat
 README.md                                      | 12 +++++
 apps/web/angular.json                          |  3 ++
 apps/web/src/app/app.config.ts                 | 11 ++---
 apps/web/src/app/mock/mock-vault.repository.ts |  2 +-
 docs/improvements.md                           |  1 +
 docs/work/phase-2a/plan.md                     | 65 ++++++++++++++++++++++++++
 6 files changed, 86 insertions(+), 8 deletions(-)

$ git status --short
 M README.md
 M apps/web/angular.json
 M apps/web/src/app/app.config.ts
 M apps/web/src/app/mock/mock-vault.repository.ts
 M docs/improvements.md
 M docs/work/phase-2a/plan.md          ← plan amendment, separate `plan:` commit
?? apps/web/proxy.conf.json
?? apps/web/src/app/vault/http-vault.repository.test.ts
?? apps/web/src/app/vault/http-vault.repository.ts
?? docs/work/phase-2a/task-log/task-3-http-vault-repository.md
```
(Untracked shell dotfiles the sandbox projects into the working directory are omitted; they do not exist in the real tree.)

### Sessions
- claude-code 2cbec260-07a0-4e23-b633-dc98b25ef019 (2026-10-31) — transcript: ~/.claude/projects/-home-lutz-projects-keppt-app/2cbec260-07a0-4e23-b633-dc98b25ef019.jsonl
