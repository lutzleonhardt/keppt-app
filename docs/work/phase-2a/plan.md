# Plan — Phase 2a: Backend + UI Wiring (vault-backed)

> Spec: [`docs/specs/architecture.md`](../../specs/architecture.md) (Build Milestones → 2a.0, 2a.1, 2a.2 light, 2a.3, 2a.4 web variant) + [`docs/specs/angular-chat-ui.md`](../../specs/angular-chat-ui.md)
> Branch scope: `docs/work/phase-2a/` on branch `phase-2a`.

> **Amendment 2026-10-24 — beta-MVP cut.** The plan grew from a single-user dogfooding milestone into an invite-only hosted beta, because the next goal is handing the app to 5–10 testers within ~3 weeks. Decisions: (1) **PWA before Capacitor** — testers install the web app on the phone home screen; no App Store, no native shell. (2) **Voice via `MediaRecorder` + server-side STT** (OpenAI transcription), inverting the spec's "native STT first, Whisper v2" order; the native path stays a later option. (3) **Supabase light** — `files`/`file_history` per spec, but `sessions` as one JSONB row per user-day (no `messages` table yet), no migration script for the dogfooding vault, no Supabase checkpoint as a separate phase. (4) **Auth = Supabase Auth with Google only**, JWT verified locally on the server, invite allowlist by e-mail; OTP/magic-link login is trigger-gated (see Task 9). (5) Original Tasks 9/10 (session history UI, vault editor) are deferred to Tasks 14/15 with explicit triggers; image input (2a.5) is the first post-launch feature although the strategy roadmap had locked it into V1. Gaps the original plan missed, now folded in: server-side timezone (T6), empty-vault first contact (T8), mobile stream re-attach (T8), LLM reply language (T13), daily turn cap per user (T6), single-instance deployment constraint (T12). **Spec follow-up owed:** `architecture.md` Build Milestones 2a.2/2a.4, "Voice Input Quality", and the `sessions`/`messages` rows of "Database Schema" must be amended to this plan.

> **Amendment 2026-11-06 — tracer-bullet re-cut of Tasks 6–8.** Tasks 6 (server chat surface), 7 (session read) and 8 (HttpChatService) were layer sweeps: nothing would have been visible in the app before the third of them landed, while the integration risk (SSE through the dev proxy, fetch streaming, the event reducer against the mock's block model) sits exactly between the layers. They are re-cut into five vertical slices 6.1–6.5, each verifiable end-to-end right after it lands; the real chat in the app arrives after 6.2. Order: server turn + event stream (6.1) → minimal client (6.2) → session boot + re-attach (6.3) → opener, empty-vault welcome, debug artifacts (6.4) → user-local day + daily turn cap (6.5). The core timezone plumbing moves to the end because the dev path runs in the process zone like the CLI. Vocabulary fixed on the way: the event `kind` is the persisted turn kind `"user" | "opener"` (Task-5 decision 16; `"auto-replan"`/`"synthetic"` are gone), `turn-end` carries the engine `phase` on an error, and the error codes are `input_rejected`, `invalid_request`, `turn_failed`, `turn_limit_reached`. T7-AC-03 (legacy session files) is dropped: there is no legacy reader since Task 5 amendment 4. Each new AC names the ID it replaces (`was T6-AC-NN`).

## Scope

The shared core moves behind an Express server, and the Angular app's mocks are replaced by HTTP/SSE implementations. Two configurations of the same server: the **dev path** (`REPOSITORY=local`, `AUTH=stub`) runs against the real Obsidian vault and stays the daily-dogfooding surface throughout the build; the **beta path** (`REPOSITORY=supabase`, `AUTH=supabase`) is what testers get — Google login, Supabase persistence with RLS, web voice capture, installable PWA, hosted on a single container. End state: a tester logs in on the phone, speaks a brain dump on the couch, and watches the vault files change — the three core advantages (capture → files change, no maintenance via the Auto-Replan opener, trust via tool rows + readable files) are all live.

**Core design decisions (apply to all tasks):**
- **Detached turns:** the server runs every chat turn to completion and persists it regardless of client connections. SSE clients are observers. Disconnect ≠ cancel; only the explicit cancel endpoint aborts.
- **Command/event split:** `POST /api/chat` is a command (202); all rendering flows through one standing session event stream per client with monotonic event seq + cursor catch-up. Multiple parallel clients per user are supported; one in-flight turn per user at a time (409).
- **Multi-user-shaped, single-user-valued:** all server state is keyed by `userId` (from the stub); endpoints authorize against it. Real auth/RLS swap in later without rework.

**Explicitly OUT:** image input (2a.5 — first post-launch feature, decided 2026-10-24), session history UI and vault editor (Tasks 14/15, deferred with triggers), `GET/PUT /api/profile` + `profile` in `buildRequest` (the server has no profile consumer yet), `messages` table normalization (JSONB session blob stays until a per-message query exists), migration script for the dogfooding vault (Lutz decides later whether CLI-on-vault and app-on-Supabase stay separate), Capacitor shell + native STT, payment, Sentry, push notifications, multi-device live sync of vault file views, usage-tracking table, Supabase inactivity timeout (Pro-plan feature), OTP/magic-link login (trigger-gated, Task 9), per-file size budgets and daily-folder scaling (open questions stay open).

> The executing agent may adjust scope and ordering based on more
> up-to-date context discovered during implementation, as long as
> each task still satisfies the sizing rules above.
>
> When a task is finished (DONE or BLOCKED), close it with the
> `/wrap-up N` → `/commit N` pair. `/wrap-up N` writes or extends
> `docs/work/<scope>/task-log/task-{N}-{slug}.md`, where `<scope>`
> is derived from the current git branch, and is safe to run multiple
> times across sessions — it merges. `/commit N` reads that log,
> stages code + summary, and commits them together after showing
> the plan and waiting for confirmation. Optionally run `/review`
> (quick per-task, full before a PR) between wrap-up and commit;
> a second `/wrap-up N` can absorb the review findings.

## Tasks at a glance

Execution order = numeric order. Tasks 1–8 run against the dogfooding vault; 9–13 turn the result into the hosted beta.

1. Express server skeleton + operational logging foundation (2a.0)
2. Files + daily-index read endpoints (`GET /api/files/*`, `GET /api/daily-notes`)
3. Wire vault screens to the backend (`HttpVaultRepository` + dev proxy)
3.1. Browser-safe core layout entry (`@gtd/core/layout`) — Task-3 follow-up, post-created 2026-10-31 during the Task-3 wrap-up; closes the item Task-2 decision 11 deferred (the web copy of the vault layout). Prerequisite of 3.2.
3.2. Shared API contract package (`@gtd/api`) — Task-3 follow-up, post-created 2026-10-31: `HttpVaultRepository` had to read the API error body through an untyped cast because no wire contract is shared between server and web, and the error code is `string` on the server, so nothing checks the client's `"file_not_found"` literal.
4. Extract the shared turn engine from the CLI into `packages/core` (behavior-preserving)
5. Move the Auto-Replan opener onto the engine + synthetic-message origin marker
6. Re-cut 2026-11-06 into five vertical slices (Tasks 7 and 8 folded in; see the amendment above):
6.1. Server chat turn — detached execution + session event stream (`POST /api/chat`, `GET /api/chat/stream`, cancel) — curl-visible
6.2. `HttpChatService` — the chat UI talks to the server — **the "it chats in the app" milestone**
6.3. Session boot + stream re-attach (`GET /api/sessions/today` replay DTO with attach cursor, reconnect, resync, error state)
6.4. Day start — Auto-Replan opener on the server, empty-vault welcome, server debug artifacts
6.5. User-local day (`X-Timezone`) + daily turn cap
7./8. Folded into 6.2–6.4 (2026-11-06).
9. Supabase Auth: Google login, local JWT verification, invite allowlist, per-request Supabase client
10. Supabase persistence: `SupabaseFileRepository` + `SupabaseSessionStore` + `REPOSITORY` switch
11. Web voice capture: `POST /api/transcribe` + `WebVoiceCaptureService` (`MediaRecorder`)
12. Deploy + PWA: Express serves the Angular build, manifest + service worker, single container, phone smoke
13. Launch hygiene: LLM reply-language rule, feedback entry, privacy notice
14. **DEFERRED** — Session history UI (list + read-only replay) + the session list endpoints
15. **DEFERRED** — Vault editor mode with autosave + `PUT /api/files/*`

---

## Task 1: Express server skeleton + operational logging foundation

### Instructions

New workspace `apps/server` (package `@gtd/server`), mirroring the conventions of `apps/cli`: ESM (`"type": "module"`), TS `module: NodeNext` / `target: ES2022`, extends `tsconfig.base.json` with `outDir: dist, rootDir: src`, `tsx src/index.ts` as `dev` script, `tsc -p tsconfig.json` as `build`, vitest for tests (own `vitest.config.ts` like `packages/core`). Depends on `@gtd/core` via `workspace:*` (core is a built package — `dist` barrel; root `pnpm dev` builds core first). Express 5 + Pino as new deps. Root engines are Node `>=22.22.3`.

**`BackendLogger`** wrapping Pino, implementing the core `Logger` contract (`packages/core/src/logging.ts`):

```ts
interface LogEvent { message: string; code?: string; phase?: string; requestId?: string; userId?: string; sessionId?: string; err?: unknown; meta?: Record<string, unknown>; }
interface Logger { debug(e: LogEvent): void; info(e: LogEvent): void; warn(e: LogEvent): void; error(e: LogEvent): void; }
```

Contract: sync `void`, must never throw (wrap with core `safeLog`). Structured JSON to stdout/stderr. **Metadata-only:** never log prompts/messages, GTD file contents, tool payloads, provider request/response bodies, headers, tokens, or API keys. Allowed: model ID, provider name, status code, retryability, requestId, route/phase, tool name, non-sensitive file path, token counts, duration, userId (MVP allows the real ID).

**Middleware:**
- Request-ID: `crypto.randomUUID()` per request, attached to `req` and every log event.
- Auth stub: `req.userId = process.env.DEV_USER_ID` (server refuses to boot without it). No JWT validation — but the middleware is the single place a future JWT branch replaces the stub.

**Stable error shape** via a central error handler:

```json
{ "error": { "code": "internal_error", "message": "…", "requestId": "…" } }
```

Unknown errors → `internal_error` with a generic message; no stack traces, no provider bodies to the client. `GET /api/health` → `{ "status": "ok" }`.

**Boot sequence:** read env (`VAULT_PATH`, `DEV_USER_ID`, `PORT` default 3333, provider API key check comes with Task 6.1), then run `ensureGtdTaskFiles` once with a dedicated `new LocalFileRepository(vaultPath, { changedBy: "system", logger })` handle — mirrors `apps/cli/src/index.ts` startup; idempotent; creations attributed to `system` in the history log. Core reads zero env vars — all env handling lives in the server entrypoint.

### Acceptance

- **T1-AC-01:** `GET /api/health` returns 200 `{ status: "ok" }`; every response carries the request's `requestId` on errors.
- **T1-AC-02:** A route that throws returns the stable error shape with `code: "internal_error"` and no stack/provider details in the body.
- **T1-AC-03:** Redaction unit tests: a `LogEvent` carrying `meta` with disallowed keys (prompt/file content/headers) is not emitted verbatim — the logger layer strips or the call sites never pass them (test the seam that exists).
- **T1-AC-04:** Boot against a temp vault creates missing `tasks/*.md` files exactly once (idempotent on re-boot) with `changedBy: "system"` history entries.
- **T1-AC-05:** Missing `VAULT_PATH` or `DEV_USER_ID` aborts startup with a clear terminal message.
- **T1-AC-06:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test` are green with the new workspace (XC-01).

### Key Locations

- New: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`
- New: `apps/server/src/index.ts` (boot), `apps/server/src/app.ts` (Express app factory, testable without listen)
- New: `apps/server/src/backend-logger.ts`, `apps/server/src/middleware/{request-id,auth-stub,error-handler}.ts`
- Reference: `packages/core/src/logging.ts` (Logger contract, `safeLog`), `packages/core/src/vault-readiness.ts` (`ensureGtdTaskFiles`), `apps/cli/src/index.ts` (boot pattern), `pnpm-workspace.yaml`

### Key Discoveries

- Core `Logger` doc comment already names "the future Express backend" as an intended implementer and `LogEvent.requestId` as "a UUID minted by the future Express middleware" — the contract fits as-is.
- App factory separate from `listen` keeps endpoint tests fast (supertest against the factory).
- The spec's log-code registry lives in the `logging.ts` file header — new server codes extend it, they don't invent a parallel scheme.

---

## Task 2: Files + daily-index endpoints

### Instructions

Two read endpoints on the Task-1 app, behind the auth middleware, delegating to the configured `FileRepository` (Task 1 boots `LocalFileRepository`; Task 10 adds the Supabase variant behind the same route code). `PUT /api/files/{path}` was removed from this task on 2026-10-24: without the editor (Task 15) it has no consumer, and its past-daily-readonly rule moves with it.

**`GET /api/files/{path}`** — path contains `/` (`tasks/inbox.md`, `daily/2026-07-14.md`), so an Express 5 `:param` won't match; use a wildcard route (Express 5 named splat) or match the `/api/files/` prefix manually. Response 200 `{ content: string }`. Missing file → 404 `{ error: { code: "file_not_found", … } }` (the client maps this to `null`). Validation order: core `validateFilePath` (`InvalidPathError` → 400 `invalid_path`), then allowlist — exactly the five `GTD_TASK_FILES` plus `daily/YYYY-MM-DD.md` with a valid date; anything else → 403 `path_out_of_scope`.

**`GET /api/daily-notes`** — `[{ date: "YYYY-MM-DD", isToday: boolean }]`, newest first. Source: `repo.list("daily/")` filenames only, matched against `^daily/(\d{4}-\d{2}-\d{2})\.md$` — no file contents are read. `isToday` compares against server-local `formatToday(new Date())`; it is backend-owned per the client contract (`DailyNoteRef` doc). Known bounds, both deliberate: the list grows unbounded (~365/year — the daily-folder-scaling open question in the spec stays open; acceptable for a dev vault), and "today" is server-local while the client's `APP_TODAY` is browser-local (identical on one dev machine; timezone ownership is deferred to the beta plan).

### Acceptance

- **T2-AC-01:** `GET` returns content for an existing task file and daily note; 404 `file_not_found` for a missing-but-allowlisted path.
- **T2-AC-02:** Traversal (`../x`), `.keppt/…`, and non-allowlisted paths (`random.md`) return 400/403 with stable codes; the repository is never called for them.
- **T2-AC-03 / T2-AC-04:** *Moved to Task 15 (2026-10-24)* — the `PUT` persistence and past-daily-readonly criteria travel with the endpoint.
- **T2-AC-05:** `GET /api/daily-notes` returns newest-first refs with correct `isToday`, ignores non-matching filenames, and performs no content reads (assert via a spying repo).

### Key Locations

- New: `apps/server/src/routes/files.ts`, `apps/server/src/routes/daily-notes.ts`, tests beside them
- Reference: `packages/core/src/file-repository.ts` (`validateFilePath`, `FileNotFoundError`), `packages/core/src/gtd-layout.ts` (`GTD_TASK_FILES`, `isPastDaily`), `packages/core/src/local-file-repository.ts`

### Key Discoveries

- The client `VaultRepository` contract fixes the semantics this API must produce: `null` only for "file does not exist", `""` for "exists and is empty" — so 404 must be distinguishable from an empty 200.
- `LocalFileRepository` already enforces path safety (incl. symlink escape) at runtime; the route-level allowlist is the GTD-scope layer on top, mirroring the two-layer model from the spec.

---

## Task 3: Wire vault screens to the backend (HttpVaultRepository)

### Instructions

Replace the mock vault data path in `apps/web` with HTTP against Task 2. First visible payoff of the plan: the app renders the real vault.

- **Dev proxy:** `apps/web/proxy.conf.json` forwarding `/api` → `http://localhost:3333`, wired via the `serve` target's `proxyConfig` in `angular.json`. Client code uses relative `/api/...` URLs (same convention as the Transloco loader's relative `/i18n/...`). No environments infrastructure is introduced — relative paths + proxy cover dev; base-URL/token handling arrives with auth in the beta plan.
- **`HttpVaultRepository`** implementing the abstract class `VaultRepository` (`apps/web/src/app/vault/vault.repository.ts`): `readFile(file): Promise<string | null>` via `HttpClient` `GET /api/files/{file}` — 404 with code `file_not_found` resolves to `null`, any other failure rejects (feeds the Resource `error` state); `listDailyNotes()` via `GET /api/daily-notes`. Promise-based, Angular-free consumers unchanged. Swap `{ provide: VaultRepository, useClass: HttpVaultRepository }` in `app.config.ts`; `MockVaultRepository` stays for tests.
- **Drop the `APP_TODAY` mock override** (`{ provide: APP_TODAY, useValue: MOCK_TODAY }` with `"2026-05-06"`) from `app.config.ts` — the root factory in `apps/web/src/app/i18n/local-date.ts` already returns the real local date. Consumers: `app-drawer.ts`, `session-header.ts`. Known cosmetic transition state: `MockChatService` (active until Task 6.2) keeps its fixed-date German demo content while header/drawer show the real date — acceptable and deliberate.
- State semantics stay exactly: `undefined` loading, Resource `error` transport failure, `null` missing, `""` existing-empty, `[]` empty index. No caching, no request sharing — the boundary stays cache-free per spec.

### Acceptance

- **T3-AC-01:** With the server running against a vault, all five task screens and Daily list/detail render the real markdown; loading/error-retry/missing/empty states still work (kill the server → error state with working retry).
- **T3-AC-02:** `readFile` maps 404 `file_not_found` to `null` (missing-file UI), while server-down rejects into the Resource `error` state — the two are visually distinct.
- **T3-AC-03:** The `/daily/:date` guard works against the real index (unknown date redirects, transport failure is a navigation error).
- **T3-AC-04:** `APP_TODAY` override is gone; drawer/header show the real current date in the active locale.
- **T3-AC-05:** ATL/unit specs cover `HttpVaultRepository` with `provideHttpClientTesting` (404→null, error→reject, index mapping); existing vault-screen specs stay green with the mock (XC-03).

### Key Locations

- New: `apps/web/src/app/vault/http-vault.repository.ts` (+ spec), `apps/web/proxy.conf.json`
- Modify: `apps/web/src/app/app.config.ts`, `apps/web/angular.json` (serve target)
- Reference: `apps/web/src/app/vault/vault.types.ts` (`VaultFile`, `DailyNoteRef`), `apps/web/src/app/mock/mock-vault.repository.ts`

### Key Discoveries

- Abstract classes are the DI tokens (deliberate, spec'd) — the swap is exactly one `useClass` line per boundary; presentational components and Resources are untouched (spec AC: replacing mocks "must not require rewriting presentational components").
- `provideHttpClient()` is already configured (XHR backend) — fine for request/response reads; streaming concerns only Task 6.2.

---

## Task 3.1: Browser-safe core layout entry (`@gtd/core/layout`)

### Instructions

Give `packages/core` a second entry point that carries the vault layout rule without any Node dependency, so the web app (and Task 3.2's contract package) import the one definition instead of copying it. Behavior-preserving: server, CLI and core internals keep importing `@gtd/core`.

- **`src/layout/` with its own barrel.** Move `gtd-task-files.ts` there as-is; extract `DAILY_NOTE_PATH` + `dailyNoteDate` from `gtd-layout.ts` into `src/layout/daily-note.ts` (`gtd-layout.ts` imports them back; `canRead`/`canWrite`/`isPastDaily`/`isInActiveScope` stay where they are — the gates are not a browser concern). Add `IsoDate` (`${number}-${number}-${number}`) next to `dailyNoteDate`, whose return type becomes `IsoDate | undefined` (it validates exactly that shape). Nothing under `src/layout/` imports from outside the folder.
- **`exports["./layout"]`** → `dist/layout/index.{js,d.ts}`; the main barrel re-exports the folder so existing imports are untouched.
- **Guard:** `packages/core/tsconfig.layout.json` extending the package config with `types: []`, `lib: ["ES2022"]`, `include: ["src/layout/**/*.ts"]`, run by core's `typecheck` script — a `node:*` import anywhere behind the entry point fails typecheck (TypeScript follows imports transitively).
- **Web consumes it:** `apps/web` adds `@gtd/core: workspace:*`; `vault.types.ts` replaces the `VAULT_TASK_FILES` copy and its "keep both in sync" comment with imports (`VaultTaskFile` = `GtdTaskFilePath`), `i18n/local-date.ts` re-exports `IsoDate` as `IsoLocalDate` (or the three consumers rename — implementer's call). Resolution goes through the package `exports` like the server's; a tsconfig `paths` mapping onto core's `src` is rejected unless the Angular bundler cannot consume `dist`.
- **Build order:** `pnpm -r` is topological; a direct `pnpm --filter web typecheck|test` needs `@gtd/core` built first — the same gotcha the server has; add the line to README.

### Acceptance

- **T3.1-AC-01:** `pnpm --filter @gtd/core typecheck` runs the layout guard; a probe `import "node:fs"` placed under `src/layout/` fails it (probe removed, result in the log).
- **T3.1-AC-02:** `apps/web` imports `GTD_TASK_FILES`, `GtdTaskFilePath` and `IsoDate` from `@gtd/core/layout`; the `VAULT_TASK_FILES` copy is gone; `ng build` and `ng test` succeed.
- **T3.1-AC-03:** Core, server and CLI behavior unchanged: `pnpm -r test` green with the same counts (core 317 · server 85 · cli 57 · web 119); `gtd-layout.test.ts`'s `dailyNoteDate` block still passes against the moved module.
- **T3.1-AC-04:** `dailyNoteDate` returns `IsoDate | undefined`; `DailyNoteRef.date` (server `routes/daily-notes.ts`) is typed `IsoDate` without a cast.

### Key Locations

- New: `packages/core/src/layout/{index,gtd-task-files,daily-note}.ts`, `packages/core/tsconfig.layout.json`
- Modify: `packages/core/{package.json,src/index.ts,src/gtd-layout.ts}`, `apps/web/{package.json,src/app/vault/vault.types.ts,src/app/i18n/local-date.ts}`, `apps/server/src/routes/daily-notes.ts`, `README.md`
- Reference: Task-2 log decisions 10–11 (why the copy exists), `apps/web/tsconfig.json` (`moduleResolution: bundler`), `apps/web/tsconfig.spec.json` (`types: []` precedent)

### Key Discoveries

- `gtd-task-files.ts` has no imports; `gtd-layout.ts` imports `validateFilePath` from `file-repository.ts` — hence the extraction instead of moving the whole file.
- pnpm's strict `node_modules` already enforces the package direction (core never declares `@gtd/api`); the guard needed is Node-freedom inside core, not import direction.

---

## Task 3.2: Shared API contract package (`@gtd/api`)

### Instructions

Create `packages/api`, the HTTP wire contract shared by `apps/server` and `apps/web`: TypeScript only, no `node:*` imports, the only dependency is `@gtd/core` (layout entry). Built like core (`tsc` → `dist`, `exports` with `types`/`default`), Vitest for the one runtime function. Direction is fixed by `package.json` declarations: api → core, server and web → api, never core → api.

- **Error contract.** `API_ERROR_CODES` as a readonly tuple with the codes in use — `invalid_path`, `path_out_of_scope`, `file_not_found`, `not_found`, `internal_error`, `turn_in_flight` (409 per the core design; `error-handler.test.ts` already throws it) — and `ApiErrorCode` derived from it; later tasks extend the tuple together with the throw site. `ApiErrorPayload { code; message; requestId }`, `ErrorBody { error: ApiErrorPayload }`, and `apiErrorOf(body: unknown): ApiErrorPayload | undefined` — the single place that inspects an untrusted body (parsed JSON, text, `ProgressEvent`, `null`); it returns a payload only when `code` is a member of the tuple, so the type is honest.
- **DTOs.** `FileContentBody { content: string }`, `DailyNoteRef { date: IsoDate; isToday: boolean }` (`IsoDate` from `@gtd/core/layout`). Success bodies stay trusted as typed — no zod, no runtime validation beyond the error guard (YAGNI until an untrusted hop exists).
- **Server:** `ApiError.code: ApiErrorCode`; `ErrorBody`, `FileContentBody`, `DailyNoteRef` imported from `@gtd/api`, local declarations removed. **Web:** `http-vault.repository.ts` decides via `apiErrorOf(error.error)?.code === "file_not_found"`; `ApiErrorBody`, `FileContentBody` and the cast go; `vault.types.ts` re-exports `DailyNoteRef` so consumers keep their import path.
- **OUT:** session/replay DTOs and SSE event types (Tasks 6.1/6.3 add them here when they exist), moving `canRead`/gates to the browser, Sheriff/ESLint boundary tooling (pnpm enforces the package direction; app-internal layering is a later chore, see the improvements register).

### Acceptance

- **T3.2-AC-01:** `apiErrorOf` unit tests: valid body → payload; unknown code, text body, `ProgressEvent`-shaped object, `null` → `undefined`.
- **T3.2-AC-02:** `new ApiError(409, "no_such_code", …)` is a compile error (pinned with `@ts-expect-error` in `error-handler.test.ts`); every error response still matches `ErrorBody`; server suite green.
- **T3.2-AC-03:** `HttpVaultRepository` spec green unchanged; no `as` cast on an error body remains in `apps/web/src` (grep).
- **T3.2-AC-04:** `pnpm -r typecheck` and `pnpm -r test` green; web screen specs unchanged (XC-03).

### Key Locations

- New: `packages/api/{package.json,tsconfig.json,src/index.ts,src/errors.ts,src/files.ts,src/daily-notes.ts,src/__tests__/errors.test.ts}`
- Modify: `apps/server/{package.json,src/middleware/error-handler.ts,src/routes/files.ts,src/routes/daily-notes.ts,src/__tests__/error-handler.test.ts}`, `apps/web/{package.json,src/app/vault/http-vault.repository.ts,src/app/vault/vault.types.ts}`, `README.md`
- Reference: Task-3 log decisions 1, 3, 9 (strict 404 mapping; why the body is read defensively; 500-without-body from the dev proxy), `packages/core/package.json` (template)

### Key Discoveries

- The server's `ApiError.code` is `string` today, so sharing the type alone would not catch a client-side typo — the tuple/union is the actual gain.
- `HttpErrorResponse.error` is `any` in Angular; the guard cannot be avoided, only moved into one tested place.

---

## Task 4: Extract the shared turn engine from the CLI into core

### Instructions

`apps/cli/src/turn-loop.ts` (`handleTurn`) and `apps/cli/src/auto-replan-opener.ts` are near-duplicate pipelines typed to concrete CLI classes. This task extracts ONE turn engine into `packages/core` and refactors the CLI to consume it — **behavior-preserving** (the existing CLI test suite is the safety net). The opener migrates in Task 5; this task covers the user-turn pipeline. Biggest task of the plan; it stays a refactor with no user-visible change.

**New core module (`packages/core/src/turn-engine.ts` + `turn-sink.ts`):**

`TurnSink` — runtime-neutral, sync fire-and-forget (no backpressure), designed around the tool-call lifecycle (the CLI's `TerminalOutput.toolStatus(name, input)` has no id and no completion signal — that shape cannot feed the SSE protocol, so the sink is id-first):

```ts
interface TurnSink {
  assistantText(text: string): void;
  toolStart(toolCallId: string, name: string, input: unknown): void;
  toolEnd(toolCallId: string, name: string): void;       // no output payload — redaction by design
  toolError(toolCallId: string, name: string, error: unknown): void;
  quickReplies(payload: QuickRepliesResult): void;
  turnEnd(outcome: "ok" | "aborted" | "error"): void;
}
```

`suggest_quick_replies` is never emitted as tool events. To emit `toolEnd`, the engine now consumes `tool-result` parts for **all** tools from `fullStream` (currently only quick-reply results are consumed) — id + name only, never the output payload. A `tool-error` settles the same `toolCallId` (clients with only running/done treat it as settled; the LLM handles recovery in-loop).

**Engine deps — interfaces, not CLI classes:** `FileRepository`, `SessionStore`, `Logger`, plus injected `model: LanguageModel`, `providerOptions`, `now(): Date`, `timeZone?: string` (IANA; forwarded to `buildTools` and every `formatToday(now())` derivation — Task 6 supplies it per user, the CLI passes nothing and keeps process-local dates), `fileVersionAt(path): number | undefined`, `sink: TurnSink`, and a turn-logging seam (core `TurnLogger` is write-only `writeTurn`; the CLI flow also needs `nextTurnId()` and per-day logger re-creation — design a small factory/allocator seam so `FsTurnLogger` remains CLI-side and the server can pass its own or none). Errors are reported through a structured result/callback (code, phase, err) — the entrypoint renders: CLI keeps its exact `formatCliError` + `appendCliErrorLog` + log-path message composition in its adapter; the server (Task 6) logs metadata and emits an SSE error event. Day-rollover stays CLI-side until Task 5.

**Invariants that MUST survive verbatim (each has bitten before or is contract-pinned):**
1. Two-phase save: user message appended + saved **before** streaming (with `session.snapshot()` rollback on save failure); response messages appended stamped with **`turnStartedAt`, not completion time** (pruner drift correctness).
2. Cache markers ride the `SystemModelMessage` **object** and the trailing user message's `providerOptions` — passing system as a string or rebuilding message objects silently kills Anthropic prompt caching (regression 2026-05-20).
3. `Session.createdAtOf` uses object identity — the exact message objects held by the `Session` flow into `buildRequest`; no serialize/rebuild in between.
4. `buildTools(repo, { now, logger })` is rebuilt per turn (retry-budget closure = turn boundary).
5. Sequential `edit_file` dispatch is the **caller's** duty via provider options (`disableParallelToolUse` etc.) — engine documents it, entrypoints guarantee it.
6. Quick replies come only from the `tool-result` part (`part.dynamic !== true`), never from tool-call input (invalid-call hardening, commit af2aa26); a quick-replies `tool-error` clears the payload silently.
7. `stopWhen: [hasToolCall("suggest_quick_replies"), isStepCount(10)]`, `onError: () => {}` on `streamText`.

**Moves:** `FsSessionStore` (+ its tests) moves from `apps/cli` to `packages/core` — its doc comment claims core must stay `node:fs`-free, which is already false (`local-file-repository.ts`, `history-log.ts`); correct the comment. `GTD_NOW_OVERRIDE`/`readTurnClock` stays CLI-side (engine takes `now()`). CLI's `TerminalOutput` gets a thin `TurnSink` adapter (toolStart → existing `[name arg]` status line via `formatToolStatusLabel` semantics; toolEnd → no-op; toolError → existing stderr line).

### Acceptance

- **T4-AC-01:** The entire existing CLI test suite passes unchanged, including `apps/cli/test/workspace-wiring.test.ts` (runtime provider-flag pin).
- **T4-AC-02:** New core engine tests (MockLanguageModel from `ai/test` + `InMemoryFileRepository` + in-memory `SessionStore`) prove sink event ordering for a scripted tool→text turn: toolStart → toolEnd → assistantText → turnEnd.
- **T4-AC-03:** Phase-1 save failure rolls the session back and reports a structured error; no stream is started.
- **T4-AC-04:** Response messages are stamped with `turnStartedAt` (assert via `createdAtOf` on a same-turn read→edit sequence).
- **T4-AC-05:** Abort mid-stream ends with `turnEnd("aborted")`; the phase-1 user message persists, no phase-2 append.
- **T4-AC-06:** Quick replies captured only from a valid tool-result; an invalid `suggest_quick_replies` call followed by tool-error yields no `quickReplies` sink event.
- **T4-AC-07:** `toolEnd` fires for every non-quick-reply tool with the matching `toolCallId` and carries no output payload.
- **T4-AC-08:** Manual CLI smoke: one real dogfooding turn behaves identically (status lines, chips, session file) — XC-05.

### Key Locations

- New: `packages/core/src/turn-engine.ts`, `packages/core/src/turn-sink.ts`, `packages/core/src/fs-session-store.ts` (moved), `packages/core/src/__tests__/turn-engine.test.ts`
- Modify: `apps/cli/src/turn-loop.ts` (shrinks to adapter + rollover guard), `apps/cli/src/index.ts`, `packages/core/src/index.ts` (barrel)
- Reference: `apps/cli/src/terminal-output.ts`, `apps/cli/src/model-provider.ts`, `packages/core/src/{sessions,request-builder,tools,turn-log}.ts`

### Key Discoveries

- Sink methods are sync `void` — the engine never awaits observers, which is exactly what makes Task 6.1's detached execution trivial: the engine already runs to completion regardless of who is listening.
- `handleTurn`'s only user-facing writes go through the injected `TerminalOutput` — there is no direct stdout use inside the pipeline; the coupling is in the *types* (`FsSessionStore`, `FsTurnLogger`, `LocalFileRepository` instead of interfaces).
- The stale comment at `turn-loop.ts:126-128` claims the provider-flag pin is a static regex; the real test is a runtime assertion on `providerOptions()` — it survives this refactor untouched.

---

## Task 5: Move the Auto-Replan opener onto the engine + origin marker

### Instructions

Migrate `apps/cli/src/auto-replan-opener.ts` and the day-rollover guard onto the Task-4 engine, killing the duplicated stream-switch and `makeFileVersionAt` copies. CLI behavior stays identical (opener at startup + on rollover, once per day, banner, chips).

> **Amendment 2026-11-05 (Task-5 briefing) — context as fabricated `read_file` results, not inline text.** The opener used to paste the vault content (six dailies + `tasks/next-actions.md` + `tasks/waiting.md`, ~12 KB in the sample vault) into the synthetic user message. `pruneToolResults` only stubs `tool`-role messages, so that copy sat in every request of the day and never drifted: after the first chip turn edited `tasks/next-actions.md`, the model held a stale copy that T-C6 told it to reuse. The opener now fabricates the turn prefix a real read would have produced, built in core (`packages/core/src/auto-replan.ts`, the server runs the same opener in Task 6): `[user kickoff, assistant (ONE message, one read_file tool-call part per existing context file), tool (the matching results, shape `{ ok: true, content }`), user instruction]`. Consequences: (1) age-out and drift apply per file exactly like a real read; one tool message = one K slot. (2) ~~Missing files get no fabricated result~~ — superseded by amendment 6: every window date gets a pair, missing dailies with the real `not_found` result. (3) The trailing instruction message keeps `buildRequest`'s "request ends with a user message" invariant (cache marker + context notes) without touching the request builder. (4) Every message of the opener turn — prefix and response — carries origin `opener`. (5) A same-day CLI resume replays the fabricated `[read_file …]` status lines after the kickoff line — accepted; Task 7/8 hide synthetic user/tool content by origin and show only the greeting. Spec follow-up: `architecture.md` "deterministic system-injected turn" wording.

> **Amendment 2, 2026-11-05 — the empty-vault skip marks the day (superseded by amendment 5: no marker, the empty session itself is the signal).** Task-9 decision 7 left `autoReplanRanFor` unset on an empty vault so a later CLI start could still run the opener once content appeared. That puts a replanning turn into the middle of a first day's conversation, which is wrong for a first contact; the empty-vault welcome is Task 8's job (web UI). The opener now sets the marker on the empty skip (in memory, no extra save: the next user turn's Phase-1 save persists it, and a restart on a still-empty vault merely skips again) and does not return the same day; the CLI stays silent on an empty vault. Stream failure keeps leaving the marker unset: `streamText` already retries API calls (`maxRetries` default 2), so a failure that reaches the opener is persistent, and the next startup/rollover (CLI) or first-contact check (server, Task 6) retries.

> **Amendment 3, 2026-11-05 — session entries instead of parallel arrays.** The origin would have become the third parallel array (`messages`/`createdAt`/`origins`). `Session` switches to one list of entries `{ message, createdAt, origin }`: the length invariant holds by construction, `fromJSON` validates entries instead of two length equalities (the CodeScene hotspot, cc 18), `snapshot` truncates one list. `messages` stays a `readonly ModelMessage[]` view with the same object identities (the pruner's identity lookups keep working) at the cost of one `map` per request. On-disk shape becomes `{ date, entries }` (amendment 5 dropped the marker). Done now because Task 5 rewrites every affected method anyway and Task 10 fixes the JSON shape as a JSONB row. The engine input is a discriminated union `{ kind: "user", userText, abortSignal } | { kind: "opener", openerMessages }` — `kind` decides Phase 1 (user only) and the origin passed to `appendTurn`; a future image input widens `userText` to the SDK's `UserContent` in the user branch only.

> **Amendment 4, 2026-11-05 — no legacy session reader.** Nothing is live: the only consumer of the pre-entry `{ messages, createdAt }` shape is today's file in the dogfooding vault, which the user deletes before the next CLI start (`rm <vault>/.keppt/sessions/*.json`). `fromJSON` reads the entry shape only; an old file fails the start with `Session.fromJSON: \`entries\` must be an array`. Task 14 (session history, deferred) is the first reader of older days and decides about its own data then. The legacy half of T5-AC-03 is N/A.

> **Amendment 5, 2026-11-05 — no `autoReplanRanFor` marker.** The per-day session is the marker: the opener opens a day and therefore runs only into an empty session. Its own persisted turn, or a user turn after a failed or skipped opener, means the day has started without it — which also covers amendment 2 without any state (the empty-vault skip leaves the session empty; a later start on a still-empty vault checks again, a start after the user chatted does not). Behavior change: after a stream failure the opener retries only while the day is still empty, never into a running conversation. Removed: `autoReplanRanFor`/`setAutoReplanRanFor`, its JSON field, snapshot restore and validation, the marker line in the engine's final save (the engine knows nothing opener-specific beyond the `kind`). Session JSON is `{ date, entries }`. Sibling blocks still mention the marker (T10-AC-04) — align when Task 10 starts.

> **Amendment 6, 2026-11-05 — after the live smoke: `not_found` pairs for missing dailies, `tasks/focus.md` in the context.** The DEBUG artifact of the first live opener (DeepSeek, dormant vault with no daily since 2026-07-14) showed the model ignoring the kickoff's "a daily without a result does not exist" and reading all five window dates itself (five `not_found` results, one wasted model step), then exploring `tasks/focus.md`, `tasks/inbox.md` and the last existing dailies. (1) The prefix now holds one pair per window date; a missing daily carries the `not_found` result a real read returns — evidence instead of prose. Amendment 1's worry about error outputs was wrong: `read_file` reports `not_found` as a plain json result that ages out normally. (2) `tasks/focus.md` joins the context (Task-9 choice extended): the greeting used it ("Focus hängt noch auf KW20"), it is small and the day-start's natural anchor. `inbox.md` stays out (pre-triage), the old-daily exploration is empty-window behavior a used vault will not show. T5-AC-07's "missing context files produce no pair" is inverted accordingly.

**Preserved opener semantics (differ from user turns — name them, don't unify away):**
- **Single-phase persistence:** `[...fabricatedPrefix, ...responseMessages]` in ONE `appendTurn`, rolled back by one snapshot on save failure (amendment 5: no marker). The prefix exists only in the request until the response arrives; a failed opener leaves nothing on disk.
- Opens a day: runs only into an empty session (amendment 5; formerly the once-per-day guard via `session.autoReplanRanFor`).
- Not abortable (no abortSignal).
- Context from core `gatherAutoReplanContext(repo, today, daysBack = 5)`; silent skip when `context.isEmpty`; nothing is written, the still-empty session lets a later start check again (amendment 5).
- The prefix messages' `createdAt` is `turnStartedAt` via the existing identity-based `messageCreatedAt` override; the context files are read before the stamp, so their mtime is older than it and a later edit shows up as drift.

**New: origin marker in the Session schema.** The opener's messages are persisted as plain `ModelMessage`s — the kickoff and instruction messages are indistinguishable from real user input and would leak into every replay surface (Task 7/8/9) as user bubbles, the fabricated tool calls as status rows. Extend `packages/core/src/sessions.ts`: `appendTurn` accepts an optional origin per append (`"user" | "opener"` — the engine's turn kind, so no second vocabulary; stored per entry, amendment 3), `toJSON`/`fromJSON` persist it (amendment 4: no legacy reader), and expose a read API (`originOf(msg)`). The opener marks every message of its turn. Display surfaces hide opener user messages and tool-call rows and keep the assistant text; `buildRequest` never looks at the marker — the model always sees the full history. Keyword filtering ("starts with `[Day rollover`") is explicitly forbidden (no-stub-classifiers rule).

### Acceptance

- **T5-AC-01:** Existing CLI opener behavior verified by tests: fires once per day, skips on empty vault, skips when today's session already has messages (amendment 5).
- **T5-AC-02:** Opener save failure leaves session bytes unchanged (single-phase all-or-nothing).
- **T5-AC-03:** The opener turn's messages round-trip with origin `"opener"` through `toJSON`/`fromJSON`. (Legacy half — "a JSON without origins loads with all messages defaulting to `user`" — N/A per amendment 4.)
- **T5-AC-04:** The duplicated stream-consumption switch and `makeFileVersionAt` copies in `auto-replan-opener.ts` are gone; the opener runs through the Task-4 engine.
- **T5-AC-05:** Manual CLI smoke on a day rollover (via `GTD_NOW_OVERRIDE`): banner, opener turn, chips, then a normal user turn — unchanged UX (XC-05).
- **T5-AC-06 (amendment):** After the opener, an edit to one context file makes the next request stub that file's fabricated `read_file` result and emit a `<context-note>` naming it; the other fabricated results stay intact.
- **T5-AC-07 (amendment):** The opener request ends with a user message (the instruction) carrying the trailing cache marker, never with the fabricated tool message; every window date and task file has a fabricated pair, a missing daily with the `not_found` result (amendment 6).

### Key Locations

- Modify: `packages/core/src/sessions.ts` (+ origin), `packages/core/src/turn-engine.ts` (opener entry), `packages/core/src/auto-replan.ts` (fabricated turn prefix, moved from the CLI), `apps/cli/src/auto-replan-opener.ts` (shrinks to adapter), `apps/cli/src/turn-loop.ts` (rollover guard onto engine), `apps/cli/src/index.ts`
- New: `apps/cli/src/turn-adapter.ts` — terminal sink, engine deps, result rendering shared by user turns and the opener (avoids a value-level import cycle `turn-loop` ↔ `auto-replan-opener`)
- Reference: `packages/core/src/request-builder.ts` (trailing-user-message invariant, cache marker, context notes), `packages/core/src/tool-result-pruning.ts` (drift join via `toolCallId` → `input.file_path`), `apps/cli/src/session-boundary.ts`

### Key Discoveries

- The opener's rollover ordering is: rollover guard (loads new session, runs opener) happens **before** the user message's phase-1 save — on disk the opener turn precedes the user message. Live clients see user message first (they sent it); replay shows disk order. Cosmetic, known, not worth fixing.
- `Session` enforced `messages.length === createdAt.length` as a parallel-array invariant; amendment 3 replaces the arrays with one entry list so the origin needs no third array and the invariant holds by construction.

---

## Task 6.1: Server chat turn — detached execution + session event stream

### Instructions

The server half of the tracer bullet: `POST /api/chat` starts a turn through the core engine and answers 202 at once; the turn runs to completion and persists regardless of any client; observers get it through one standing SSE stream per client. All state keyed by `userId`. The opener, the user-local day, the turn cap and debug artifacts are later slices (6.4, 6.5) — this slice runs in the process's zone like the CLI.

**Turn registry (in-memory, `apps/server/src/chat/turn-registry.ts`):** per `userId`: the current `Session` (loaded once per server-day through `SessionStore.loadOrCreate(formatToday(now()))`; reloaded when the date changes, which clears the event log while `seq` keeps counting; never swapped while a turn is in flight — the 409 check runs first), one in-flight slot `{ turnId, abort: AbortController, startSeq }` (a second `POST /api/chat` → 409 `turn_in_flight`), `settledEntries` (the session's entry count at the last `turnEnd`), and the day event log. The registry builds the `TurnEngineDeps` (repo, session store, logger bound to the originating request's `requestId` + `userId`, `model` + `providerOptions` from the server model provider, `now` = a clock snapshot taken at turn start, `fileVersionAt` = the vault mtime closure the CLI adapter uses, the per-turn sink) and calls `runTurn` **without awaiting it in the handler**. The engine's sync sink is what makes detachment free; the only rule is never to couple the `AbortController` to the HTTP connection. `startSeq` (the seq of the turn's own `turn-start`) and `settledEntries` are two lines here and the whole basis of the attach cursor in 6.3.

**Event log (`apps/server/src/chat/event-log.ts`):** append-only array per user-day of `{ seq, event }`. `seq` is monotonic within the process and seeded at boot from `Date.now()`, so a cursor from an earlier process is always older than the oldest retained event and triggers `resync` instead of silently skipping events. `append` stores the event and fans it out synchronously to every subscriber; `since(cursor)` returns the events with `seq > cursor`, the whole log without a cursor, and `"resync"` when the cursor lies before the oldest retained event or beyond the tip. Server restart empties the log — persisted truth is the session file.

**SSE event vocabulary** — wire types in `@gtd/api` (`packages/api/src/chat.ts`); SSE `id:` = seq, `event:` = type, `data:` = JSON:

```
turn-start    { turnId, kind: "user" | "opener", message?: string }  // message = the user text for kind "user" (lets other clients render it); "opener" turns arrive with 6.4 and carry no message
text-delta    { turnId, text }
tool-start    { turnId, toolCallId, tool, target, summary? }
tool-end      { turnId, toolCallId }                                    // also emitted when a tool errors — settles the row
quick-replies { turnId, question, options }
turn-end      { turnId, outcome: "ok" | "aborted" | "error", phase? }   // phase = engine phase on "error": session_save_phase1 | stream | session_save_phase2
error         { turnId, error: { code: "turn_failed", message, requestId } }  // precedes turn-end on an error; `error` has the HTTP ErrorBody payload shape
resync        {}                                                        // control event without id; the client reloads the session (6.3) and re-attaches
```

`kind` is the persisted turn kind (`MessageOrigin` from core), one vocabulary for event, session entry and engine input. `tool`/`target`/`summary` derivation (`apps/server/src/chat/turn-events.ts`) mirrors the CLI's `formatToolStatusLabel` and the client's `AssistantToolMessage`: `file_path` for read/edit/write_file, `query` for search_files, `prefix` for list_files, candidates joined with `", "` for find_task_occurrences; `summary` = the model-authored `change_summary` for edit/write. `suggest_quick_replies` never appears as a tool event (the engine filters it). The `error` event carries the `requestId` of the `POST /api/chat` that started the turn and a generic message; details go to the server log as metadata only (XC-02).

**Endpoints (`apps/server/src/routes/chat.ts`):**
- `POST /api/chat` `{ message }` — JSON body (`express.json()` mounted on this router; a body-parser failure or a non-string `message` → 400 `invalid_request`, which also resolves the error handler's "revisit once bodies are parsed" note). Order: `validateUserInput` (core — **its first intended consumer, full gate incl. the code-paste heuristic**; reject → 400 `input_rejected`, no model call) → 409 if in flight → day check → start the turn → **202 `{ turnId }`**.
- `POST /api/chat/cancel` → aborts the in-flight turn via the registry (204; no-op without one). **The only abort path — a client disconnect never aborts.**
- `GET /api/chat/stream?cursor=N` → SSE (`text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, headers flushed immediately). Replay (`since`) and subscribe happen in one synchronous block, so no event can fall between them; `resync` when the cursor cannot be served; a comment line every 15 s keeps proxies from killing idle streams; the connection's `close` only unsubscribes.

**Server model provider (`apps/server/src/model-provider.ts`):** a pure factory `createModelProvider({ provider, modelId })` → `{ model, providerOptions }`, plus `apiKeyEnvName(provider)` and the per-provider defaults (`anthropic` `claude-sonnet-4-6`, `deepseek` `deepseek-v4-pro`, `openai` `gpt-5.4-mini`). The env contract (`GTD_PROVIDER` default anthropic, `GTD_MODEL`, API-key presence at boot) is read in `config.ts` only — nothing below `index.ts` touches `process.env`. Same `providerOptions` shapes as the CLI; because the server module takes the provider as an argument, the sequential-dispatch pin covers all three branches in one test.

**Documented caveat:** CLI and server share `.keppt/sessions/` last-writer-wins — don't run both at the same time on the local path.

### Acceptance

- **T6.1-AC-01 (detached completion, XC-06; was T6-AC-01):** Start a turn, attach no stream, wait for completion → the session file contains the user message + full response; a client attaching afterwards receives the turn's events via replay.
- **T6.1-AC-02 (late subscriber; was T6-AC-02):** Attaching mid-turn with no cursor replays all buffered events in order, then delivers live events — seamless seq continuity.
- **T6.1-AC-03 (cursor catch-up; was T6-AC-03):** Attaching with cursor N delivers only events with seq > N; a cursor before the oldest retained event or beyond the tip yields exactly one `resync` and nothing else.
- **T6.1-AC-04 (was T6-AC-04):** Second `POST /api/chat` during an in-flight turn → 409 `turn_in_flight`, no second turn starts.
- **T6.1-AC-05 (was T6-AC-05):** `POST /api/chat/cancel` aborts: stream shows `turn-end {outcome:"aborted"}`; phase-1 user message persists, no phase-2 append.
- **T6.1-AC-06 (was T6-AC-06):** Code-paste input → 400 `input_rejected`, model never invoked (spy); malformed JSON or a non-string `message` → 400 `invalid_request`.
- **T6.1-AC-07 (SSE error contract, XC-02; was T6-AC-07):** A mid-stream provider failure emits `error` carrying the originating `requestId` before `turn-end {outcome:"error", phase:"stream"}`; the server log entry is metadata-only.
- **T6.1-AC-08 (XC-06; was T6-AC-09):** Client disconnect mid-turn does NOT abort: the turn completes and persists.
- **T6.1-AC-09 (was T6-AC-10):** Provider-options pin asserts the sequential tool-dispatch flags for anthropic and openai and the documented best-effort shape for deepseek.
- **T6.1-AC-10:** `tool-start` derivation: every vault tool's input maps to the documented `target`; edit/write carry `summary`; `suggest_quick_replies` produces no tool event.

### Quick functional check

Start the server (`pnpm dev:server` with `VAULT_PATH`, `DEV_USER_ID` and the provider key); `curl -N localhost:3333/api/chat/stream` in one terminal, `curl -X POST localhost:3333/api/chat -H 'content-type: application/json' -d '{"message":"Was steht heute an?"}'` in another → 202 `{ turnId }`, the stream shows `turn-start … tool-start/tool-end … text-delta … turn-end`, and the vault's daily/task files change. Ctrl-C on the stream curl mid-turn: the turn still lands in `.keppt/sessions/<date>.json`.

### Key Locations

- New: `apps/server/src/chat/{turn-registry,event-log,sse,turn-events}.ts`, `apps/server/src/routes/chat.ts`, `apps/server/src/model-provider.ts`, `packages/api/src/chat.ts`; tests `apps/server/src/__tests__/{chat-route,event-log,turn-events,model-provider}.test.ts` plus an SSE test client helper (real `listen(0)` + `fetch` — supertest buffers responses and cannot observe a stream).
- Modify: `apps/server/src/{app,config,index}.ts` (registry wiring; `GTD_PROVIDER`/`GTD_MODEL`/API-key config), `apps/server/src/middleware/error-handler.ts` (body-parser errors → 400 `invalid_request`), `apps/server/package.json` (`ai`, `@ai-sdk/{anthropic,deepseek,openai}`), `packages/api/src/{errors,index}.ts` (`input_rejected`, `invalid_request`, `turn_failed`; chat exports), `apps/server/src/__tests__/config.test.ts`.
- Reference: `packages/core/src/turn-engine.ts` + `turn-sink.ts` (engine contract: sync sink, `turnEnd` exactly once and last, `TurnResult` phases, `TurnInput` union), `packages/core/src/input-validation.ts`, `apps/cli/src/model-provider.ts` (shapes to mirror, DeepSeek caveat), `apps/cli/src/turn-adapter.ts` (`createEngineDeps`, `makeFileVersionAt`), `apps/cli/src/terminal-output.ts` (`formatToolStatusLabel`), `apps/cli/test/workspace-wiring.test.ts` (pin pattern), `packages/core/src/__tests__/turn-engine.test.ts` (`MockLanguageModelV4` stream fixtures, abort pattern).

### Key Discoveries

- The engine's fire-and-forget sink (Task 4) is what makes detachment free — the endpoint's only job is *not* to couple the AbortController to the HTTP connection.
- One event log per user-day (not per turn) is what makes the cursor a single monotonic axis for reconnects across turn boundaries; the client only ever remembers the last `id:`.
- The sink appends synchronously from the engine's stream loop, so an `await` between replay and subscribe is the only way to lose an event — hence one synchronous block.
- The registry must serialize turns per user; the engine has no lock (Task 4). The in-flight check precedes the day check so the session object is never swapped under a running turn.
- `REJECTION_MESSAGE` in core is English; the server may include it in the 400 body, but the client renders catalog copy from the `code` — server strings never reach the UI.
- The web `ToolName` vocabulary (`apps/web/src/app/chat/chat-tool-registry.ts`) is the closed set `tool` must come from.

---

## Task 6.2: HttpChatService — the chat UI talks to the server

### Instructions

Replace `MockChatService` with `HttpChatService extends ChatService` (abstract class = DI token; `useClass` swap in `app.config.ts`; the mock stays for tests, XC-03). This is the minimal client for the end-to-end milestone: send, stream, render, chips, cancel. Session boot, re-attach and the welcome message are 6.3/6.4; until then the service opens the stream once at construction **without a cursor** (the server replays the whole day log), which already restores the day's turns after a page reload within one server run. Zoneless: all updates land in signals.

**Transport:** raw `fetch` + ReadableStream SSE parsing (`sse-client.ts`: named events, `id:` tracking, `AbortController` for the standing stream) — a deliberate deviation from `provideHttpClient(withFetch())` for cleaner named-event parsing and an abortable standing stream; documented caveat: bypasses HttpClient interceptors, so Task 9's bearer-token wiring must cover this path explicitly. Dev proxy: `apps/web/proxy.conf.json` already routes `/api`; **first check of the slice:** events must arrive while the turn runs — if they show up only at `turn-end`, the dev server buffers and the proxy config needs fixing.

**Event mapping — reproduce the mock's lifecycle invariants exactly:**
- `sendMessage`: status flips to `"thinking"` **synchronously before any await** (re-entrancy guard: `busy()` blocks double-send), append the user message optimistically, `POST /api/chat`, remember the 202 `turnId` as the own turn.
- `turn-start` kind `"user"`: own turn (turnId match) → no duplicate user message; a foreign turn (second client) → append its `message` as a user message. Kind `"opener"`: no user message (its output arrives as content/tool events; the opener itself lands with 6.4).
- Typing indicator: client-derived single live-edge cue exactly like the mock — inserted before the first tool event and before each prose run, removed when the tool row/content lands, never alongside a running tool row.
- `tool-start` → append `AssistantToolMessage` `state: "running"` (id = `toolCallId`); `tool-end` → immutable update to `"done"`, same id (`track item.id` reuse). Tool internals stay collapsed (non-dev UX rule).
- `text-delta` → grow **one content message per contiguous text run** (a new content message after intervening tool events — the mock's block model); status `"streaming"` while deltas flow.
- `quick-replies` → merge the `question` into the trailing content message's markdown and attach the normalized labels as `quickReplies` (chips render only from the trailing content message via `activeQuickReplies`).
- `turn-end` → remove typing, status `"idle"`.
- `chooseQuickReply(label)` → `sendMessage(label)`.
- **Errors in this slice:** 400 `input_rejected`, 409 `turn_in_flight` and an SSE `error` event (`turn_failed`) render localized catalog copy as an assistant content message (de/en) and return the status to `"idle"`. **Never render server `message` strings** (core's `REJECTION_MESSAGE` is English). The `status "error"` state and its UI belong to 6.3 (they are tied to the re-attach probe).

**`cancel()`:** `POST /api/chat/cancel` + local rollback to the post-user-message checkpoint (all-or-nothing visual rollback, mock-identical). Adjust the over-promising doc comment on `ChatService.cancel`: vault mutations the turn already executed are NOT undone (same as CLI Ctrl+C); the rollback is visual.

### Acceptance

- **T6.2-AC-01 (was T8-AC-01):** Scripted SSE fixture (mocked fetch) proves the full lifecycle order: thinking-sync → typing → tool running→done (same id) → streamed content growth → chips on the trailing content → idle. Text→tools→text yields two content messages.
- **T6.2-AC-02 (was T8-AC-02):** `cancel()` calls the endpoint and rolls the list back to the checkpoint; a `turn-end {aborted}` arriving afterwards causes no duplicate state.
- **T6.2-AC-03 (was part of T8-AC-03):** The own turn's `turn-start` does not duplicate the optimistic user message; a foreign `turn-start` renders its message text; a `turn-start` of kind `"opener"` renders no user bubble.
- **T6.2-AC-04 (was part of T8-AC-05):** 400 `input_rejected`, 409 `turn_in_flight` and an SSE `error` event render localized catalog copy as assistant content (both languages routable); no English core string appears; status returns to idle.
- **T6.2-AC-05 (XC-03):** `MockChatService` stays injectable and green; `ng build` and `ng test` pass.
- **T6.2-AC-06 (the Phase-2a milestone, manual; was T8-AC-07):** A real chat turn end-to-end from the app against the real server + vault: user text → collapsed tool rows → streamed answer → chips; the vault screen shows the changed file.

### Quick functional check

`pnpm dev:server` plus the Angular dev server; type "Was steht heute an?" in the chat → tool rows, streamed answer, chips; open the daily note in the vault screen and see the change the turn made.

### Key Locations

- New: `apps/web/src/app/chat/http-chat.service.ts`, `apps/web/src/app/chat/sse-client.ts` (+ specs)
- Modify: `apps/web/src/app/app.config.ts` (provider swap), `apps/web/src/app/chat/chat.service.ts` (cancel doc comment), `apps/web/public/i18n/{de,en}.json` (error copy), `apps/web/proxy.conf.json` only if the stream is buffered
- Reference: `apps/web/src/app/mock/mock-chat.service.ts` (lifecycle reference implementation), `apps/web/src/app/chat/chat.types.ts`, `apps/web/src/app/chat/chat.store.ts` (untouched — pure facade), `packages/api/src/chat.ts` (events, 6.1), `apps/web/src/app/vault/http-vault.repository.ts` (Task-3 HTTP pattern, `apiErrorOf`)

### Key Discoveries

- `ChatStore` and all presentational components are contract-clean — the swap touches only providers + the new service; the store's `activeQuickReplies` (chips only on the trailing content message) already implements the product rule.
- Message ids are client-minted and must stay stable across updates (monotonic counter, never list-length-derived); `toolCallId` from the stream is a natural stable id for tool rows.
- The typing indicator and `ChatStatus` are client-derived UI states, not protocol data — the adapter decides when to insert/remove them.
- Without a cursor the server replays the whole day log on attach; after a server restart the log is empty and the chat starts blank until 6.3 boots from the session file.

---

## Task 6.3: Session boot + stream re-attach

### Instructions

The persisted counterpart to the live feed plus the client's boot and reconnect behavior. Cut on 2026-10-24: `GET /api/sessions` (date list) and `GET /api/sessions/:date` live in Task 14 with the history UI; the MVP boots from today only.

**Server — `GET /api/sessions/today`** (`apps/server/src/routes/sessions.ts`, DTO types in `packages/api/src/sessions.ts`) → replay DTO built from the registry's in-memory `Session` (never from raw files, so Task 10's store swap does not touch this route):

```ts
{ messages: ReplayMessage[], cursor: number, inFlight: boolean }
type ReplayMessage =
  | { kind: "user"; text: string }
  | { kind: "content"; markdown: string }
  | { kind: "tool"; tool: string; target: string; summary?: string };   // state is always "done"
```

Mapping rules (`apps/server/src/chat/replay-dto.ts`; mirror the CLI session-boundary replay + the client `ChatMessage` vocabulary): hide a message when `session.originOf(msg) === "opener"` and it is user-role or a tool-call/tool row (the fabricated kickoff, reads and instruction never reach a client); the opener's assistant text is content like any other (the greeting). Real user text → `user`; assistant text → `content`; assistant tool-calls → `tool` rows with `target`/`summary` through the same derivation as the live `tool-start`; `suggest_quick_replies` calls are skipped; tool-result payloads are never included. Never filter by content. Chips are deliberately not reconstructible from replay (they live in tool-results) — chips survive exactly one turn.

**The atomic snapshot:** `messages` = the first `settledEntries` entries of the session (the count the registry records at every `turnEnd`); `cursor` = `startSeq − 1` of the in-flight turn, else the log tip; `inFlight` accordingly — read in one synchronous block of the registry. This kills the reload/attach race by construction: the in-flight turn's phase-1 user message is beyond `settledEntries`, so it arrives once, through the replayed `turn-start`. "Today" is the registry's current day (process zone until 6.5). Malformed session JSON → 500 with a stable code, metadata-only log (XC-02).

**Client boot:** `GET /api/sessions/today` → map `ReplayMessage`s to `ChatMessage`s (mint client ids; tool rows `state: "done"`) → seed `messages` (replaces the no-cursor attach of 6.2) → open the standing stream with the DTO's `cursor`. Exactly two requests regardless of day length.

**Re-attach policy (PWA):** a stream close is *not* an error. iOS Safari drops the connection every time the home-screen app goes to the background, so the client re-attaches with its last seen `seq` on every stream close, on `visibilitychange` → visible and on `online`, with exponential backoff (1 s doubling to a 30 s cap, reset on success). `resync` → refetch `/api/sessions/today`, reset messages from the DTO, reconnect with the fresh cursor. Each attach fetches a fresh bearer token once Task 9 exists — an expired token never surfaces as a reconnect failure.

**Error state (first real error UI):** `status "error"` only when a `GET /api/sessions/today` probe also fails; render it in the chat template (nothing consumes it today): catalog copy + retry affordance + the `requestId` shown as a support ID when present. A stream failure alone never shows it.

### Acceptance

- **T6.3-AC-01 (was T7-AC-02):** A session containing user turns, tool calls, an opener turn and quick-reply calls maps to the DTO with: the opener's user and tool content absent, its greeting present as content, tool rows with correct target/summary, no tool-result content anywhere, no quick-reply data.
- **T6.3-AC-02 (was T7-AC-04):** `/today` with a turn in flight: `inFlight: true`, `cursor` before the in-flight `turn-start`, and the phase-1 user message is not duplicated between DTO and event replay.
- **T6.3-AC-03 (was T7-AC-05):** `/today` with nothing in flight: `cursor` = current tip; attaching with it yields no replayed events.
- **T6.3-AC-04 (was part of T8-AC-03):** Boot maps a replay DTO (user/content/tool) into rendered messages and attaches with the DTO cursor.
- **T6.3-AC-05 (was T8-AC-04):** Stream drop mid-turn: automatic re-attach with cursor resumes rendering without duplicated or missing events (fixture-driven); a simulated `visibilitychange` → visible after a closed stream triggers a re-attach; backoff grows and resets as specified (fake timers).
- **T6.3-AC-06 (was T8-AC-06):** Stream failure plus a failing `/api/sessions/today` probe → `status "error"` UI with retry + requestId support ID; retry re-attaches. A stream failure alone never shows the error state.
- **T6.3-AC-07:** A `resync` control event refetches the DTO, resets the messages and reconnects with the fresh cursor — no duplicated messages.
- **T6.3-AC-08 (manual, XC-06):** Reload the app mid-turn → the chat is restored and the running turn keeps streaming on screen; stop and restart the server → the day's chat is there.
- *T7-AC-03 (legacy session files) dropped 2026-11-06: there is no legacy reader since Task 5 amendment 4.*

### Quick functional check

Start a turn in the app and reload the page while it streams → the messages reappear and the answer keeps streaming; restart the server → the day's chat is shown after the reload.

### Key Locations

- New: `apps/server/src/routes/sessions.ts`, `apps/server/src/chat/replay-dto.ts`, `packages/api/src/sessions.ts`, tests beside them
- Modify: `apps/server/src/chat/turn-registry.ts` (snapshot), `apps/server/src/app.ts`, `packages/api/src/index.ts`, `apps/web/src/app/chat/{http-chat.service,sse-client}.ts` (+ specs), chat screen template/styles (error state), `apps/web/public/i18n/{de,en}.json`
- Reference: `packages/core/src/sessions.ts` (`originOf`, entry list), `apps/cli/src/session-boundary.ts` (replay rules), `apps/server/src/chat/turn-events.ts` (shared target/summary derivation), Task-5 log "Context for Next Task" (display rule)

### Key Discoveries

- Session files store full `ModelMessage` arrays including tool results with file contents — the DTO is a privacy/size trim, not just a reshape; that is why raw session JSON never goes to the client.
- The client boots with exactly two requests (`/api/sessions/today` + stream attach) regardless of day length — no N+1 anywhere on the chat path.
- The persisted origin vocabulary is the turn kind (`"user" | "opener"`); the DTO filters by origin, never by content.

---

## Task 6.4: Day start — Auto-Replan opener on the server, empty-vault welcome, debug artifacts

### Instructions

**Opener on the server.** Same sequence as `apps/cli/src/auto-replan-opener.ts`: the task files exist since boot (`initializeVault`); the opener is due when today's session is empty and `gatherAutoReplanContext(repo, today)` is not empty; then `runTurn(deps, { kind: "opener", session, openerMessages: buildAutoReplanOpener(context, today) })`. No marker state anywhere — the per-day session being non-empty is the "day has started" signal.
- `POST /api/chat/open` → runs the opener if due (202 `{ turnId }`), else 204 — also 204 while a turn is in flight (the day has started) and on an empty vault. Called by the app after the stream attach.
- `POST /api/chat` runs the opener first when due, then the user turn, as one in-flight chain; 202 carries the user turn's id. The user turn runs regardless of the opener's outcome. Cancel during the opener: the opener is not abortable and finishes; the user turn then starts with an already-aborted signal and ends `aborted` (its phase-1 message persists).
- Opener turn on the feed: `turn-start { kind: "opener" }` without `message`; the fabricated reads produce no tool events; real tool calls the model makes during the opener do; `turn-end` last.

**Server debug artifacts.** `FsTurnLogger` moves from `apps/cli/src/fs-turn-logger.ts` into core (with its test), as `FsSessionStore` did in Task 4; `DEBUG=1` (read in `config.ts`) → one logger per user-day under `<vault>/.keppt/logs/sessions/<date>/turn-NNN.json`, created by the registry on day rollover, exactly as the CLI. The opener's live smoke needs the artifact: Task 5 found the wasted model step only there.

**Client.** `POST /api/chat/open` fire-and-forget after the stream attach; the opener's output renders as content/tool events (6.2 already renders a `turn-start` of kind `"opener"` without a user bubble). **Empty-vault welcome** (spec R12 "first start, empty state"): the opener skips empty vaults silently, so a new tester would see a blank chat. When the boot DTO has zero messages, nothing is in flight and `open` returned 204, the client renders one **non-persisted** assistant content message from the catalog (`chat.welcome.body`, e.g. "Sag mir einfach, was dir im Kopf ist — ich kümmere mich um den Rest.") with two catalog quick replies through the normal chip path (e.g. "Ich habe eine Liste im Kopf" / "Was kannst du?"). No LLM call, no server state; after the first real turn it is naturally gone on reload because the session is no longer empty.

### Acceptance

- **T6.4-AC-01 (was T6-AC-08):** First request of a new day: the feed carries the opener turn (`kind: "opener"`) before the user turn; a second request the same day runs no opener.
- **T6.4-AC-02:** `POST /api/chat/open` → 202 with a turn when due; 204 on a non-empty session, on an empty vault and while a turn is in flight — in all three cases no turn starts.
- **T6.4-AC-03:** The opener turn emits no tool events for its fabricated reads and a `turn-start` without `message`; an opener stream failure ends with `error` + `turn-end {error}` and the queued user turn still runs.
- **T6.4-AC-04 (was T8-AC-08):** Empty session + `open` → 204 renders the welcome message with two chips; choosing a chip sends it as a normal message; a non-empty DTO never shows the welcome; the welcome is absent from any request payload.
- **T6.4-AC-05 (XC-05):** CLI suite green after the `FsTurnLogger` move with import-line changes only; with `DEBUG=1` the server writes one `turn-NNN.json` per turn in the CLI's record shape.
- **T6.4-AC-06 (manual):** A fresh day in the app opens with the greeting and chips before any typing; the first Anthropic run of the fabricated prefix (open issue from Task 5) is observed through the artifact.

### Quick functional check

Delete today's session file, reload the app → the Auto-Replan greeting with chips appears without typing; a vault with no content shows the welcome message instead.

### Key Locations

- Modify: `apps/server/src/chat/turn-registry.ts` (opener chain, per-day turn logger), `apps/server/src/routes/chat.ts` (`/open`), `apps/server/src/{config,index}.ts` (`DEBUG`), `packages/core/src/index.ts`, `apps/cli/src/{index,turn-loop}.ts` + `apps/cli/test/turn-logger-integration.test.ts` (imports), `apps/web/src/app/chat/http-chat.service.ts` (+ spec), `apps/web/public/i18n/{de,en}.json` (`chat.welcome.*`)
- New: `packages/core/src/fs-turn-logger.ts` + `packages/core/src/__tests__/fs-turn-logger.test.ts` (moved from the CLI; `apps/cli/src/fs-turn-logger.ts` and `apps/cli/test/fs-turn-logger.test.ts` deleted), server tests for `/open` and the chain
- Reference: `apps/cli/src/auto-replan-opener.ts` (the sequence to mirror), `packages/core/src/auto-replan.ts` (`gatherAutoReplanContext`, `buildAutoReplanOpener`), `packages/core/src/turn-log.ts` (`TurnLogger.nextTurnId`), `docs/specs/architecture.md` → "Context-Aware Session Start" (R12 table, first row), Task-5 log "Context for Next Task"

### Key Discoveries

- The opener never yields `aborted`; `turnEnd` is always last. A post-stream save failure is `session_save_phase2` for both kinds — one phase vocabulary.
- The opener request must end with the instruction user message — never append to `openerMessages`; `buildRequest` attaches the cache marker and context notes to the last user message. Fabricated tool-call ids are `auto-replan-N`; a real provider id never collides.
- The welcome is client-only by design: an LLM greeting on an empty vault would be a replanning turn on nothing.

---

## Task 6.5: User-local day + daily turn cap

### Instructions

**Client timezone (gap found 2026-10-24):** core's `formatToday(d)` uses local `Date` getters, i.e. the *server's* zone. A hosted server runs `TZ=UTC` (XC-08), so without this the day would roll over at 01:00/02:00 German time — the late-evening couch scenario lands in yesterday's daily note and triggers the opener at the wrong moment.
- Core: `formatToday(d, timeZone?)` formats through `Intl.DateTimeFormat("en-CA", { timeZone })` when a zone is given (local getters otherwise — CLI unchanged); the system prompt's date line (`buildSystemPrompt`, via `buildRequest`) takes the same zone so weekday/day/month/year are user-local; `BuildToolsOptions.timeZone`, `LocalFileRepository`/`InMemoryFileRepository` options and `TurnEngineDeps.timeZone` carry it. `createdAt`/`turnStartedAt` stamps stay real instants (never shifted dates) — shifting `now()` would corrupt the pruner's drift comparison against `fileVersionAt`.
- Server: `X-Timezone` middleware (`apps/server/src/middleware/timezone.ts`): a valid IANA zone sets `req.timeZone`, an invalid one → 400 `invalid_request`, absent → process zone. The registry stores the latest zone per user; every "today" derivation on the server (session date and rollover, opener window, engine deps) uses it.
- Client: `X-Timezone: Intl.DateTimeFormat().resolvedOptions().timeZone` on every `/api/chat*` and `/api/sessions*` request.

**Daily turn cap (cost brake for a shared API key):** `DAILY_TURN_LIMIT` env (default 60); the registry's `turnsToday` counts started user turns and resets with the user's day; opener turns don't count. Checked after the day check and before the turn starts → 429 `turn_limit_reached` with the stable error shape; the client renders catalog copy ("daily limit reached, continues tomorrow"). In-memory only — a server restart resets the counter, acceptable for a beta brake (not a billing control).

### Acceptance

- **T6.5-AC-01 (was T6-AC-11; XC-08):** With the process in `TZ=UTC` and `X-Timezone: Europe/Berlin`, a request at 23:30 UTC on day D runs against session/daily D+1 (user-local), the system prompt's current date is D+1, and the opener-due check uses D+1; with `Pacific/Honolulu` the same instant stays on D.
- **T6.5-AC-02 (XC-05):** Core unit tests cover `formatToday` and the prompt date line with and without a zone; CLI tests stay green with no zone.
- **T6.5-AC-03:** An invalid `X-Timezone` → 400 `invalid_request`; a missing header keeps the process zone.
- **T6.5-AC-04 (was T6-AC-12):** The `DAILY_TURN_LIMIT`-th+1 user turn of a user-day returns 429 `turn_limit_reached` and starts no turn; opener turns never count; the counter resets on the user's day rollover.
- **T6.5-AC-05 (was part of T8-AC-05):** The client sends `X-Timezone` on chat and session requests and renders the 429 as localized catalog copy; no English core string appears; status returns to idle.

### Quick functional check

Run the server with `TZ=UTC` and post the same message once with `X-Timezone: Pacific/Kiritimati` and once with `Pacific/Honolulu` around 12:00 UTC → two session files with different dates appear under `.keppt/sessions/`; with `DAILY_TURN_LIMIT=1` the second post of the day returns 429.

### Key Locations

- Modify: `packages/core/src/{search,tools,local-file-repository,in-memory-file-repository,system-prompt,request-builder,turn-engine}.ts` + `packages/core/src/__tests__/{search,system-prompt,turn-engine}.test.ts`; `apps/server/src/{config,app}.ts`, `apps/server/src/chat/turn-registry.ts`, `apps/server/src/routes/chat.ts`, `packages/api/src/errors.ts` (`turn_limit_reached`), `apps/web/src/app/chat/{http-chat.service,sse-client}.ts`, `apps/web/public/i18n/{de,en}.json`
- New: `apps/server/src/middleware/timezone.ts` + test
- Reference: `apps/cli/src/index.ts` (the turn clock), Task-4 log decision 3 (why the zone was deferred), Task-5 log decision 11 (the one engine line the clock touches)

### Key Discoveries

- `buildSystemPrompt` derives weekday/month/day/year with local getters — the zone must reach it, not only `formatToday`, or the prompt and the gates disagree across midnight.
- Opener turns don't count against the cap because the user cannot avoid them.

---

## Task 9: Supabase Auth — Google login, local JWT verification, invite allowlist

### Instructions

First beta-path task. Supabase Auth is the identity broker: Angular signs in with Google through Supabase, Supabase mints its own JWT, our Express server verifies that JWT locally. Nothing in our code talks to Google, holds a Google secret, or runs an OAuth flow of its own. Order rationale: Task 10's RLS tests need real user JWTs, so auth lands first.

**Supabase project (hosted, free plan):** Google provider enabled with a Google OAuth client (client ID/secret live only in the Supabase dashboard); the Google consent screen is set to **"In production"** — in "Testing" status refresh tokens expire after 7 days and testers would be logged out weekly; basic scopes (email, profile) need no Google verification. Redirect URLs registered for `http://localhost:4200` and the prod origin (Task 12). Asymmetric JWT signing keys enabled so the server can verify against the project's JWKS; if the project is still on the legacy shared secret, verification falls back to HS256 with `SUPABASE_JWT_SECRET`.

**Server — `AUTH=stub|supabase`:** the Task-1 middleware is the single switch point. `supabase` mode: read `Authorization: Bearer <jwt>`, verify locally with `jose` (signature via cached JWKS from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, `iss`, `aud === "authenticated"`, `exp`) — **no per-request network call to Supabase**; the stream path would otherwise pay a roundtrip per attach. `req.userId = sub`, `req.userEmail = email`. Missing/invalid → 401 `unauthorized`. Then the **invite allowlist**: `BETA_ALLOWLIST` env (comma-separated e-mails) — a valid JWT whose `email` is not listed → 403 `not_invited`. Deterministic, no table, no dashboard signup toggle to keep in sync; Lutz invites by editing one env var and redeploying. A **per-request Supabase client factory** (`createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization } } })`) is attached to `req` for Task 10, so every data access runs under the user's JWT and Postgres RLS applies. The `service_role` key is **not** part of the server runtime env at all. **SSE and expiry:** the stream is authorized at connect time and stays open if the token expires mid-stream; the next attach carries a fresh token. `stub` mode keeps `DEV_USER_ID` exactly as Task 1 built it.

**Client:** `@supabase/supabase-js` with PKCE (the library default for browsers), `detectSessionInUrl` handling the `?code=` exchange after the redirect. A thin `AuthService` exposing a `session` signal; `/login` route with **one Google button** (no e-mail form); an auth guard on all app routes that redirects to `/login` only when `getSession()` is null (F5 never shows the login — the persisted session is read from `localStorage` and refreshed silently). Bearer token attached by an `HttpInterceptorFn` **and** by the `fetch`-based SSE client (Task 6.2's documented interceptor bypass), both reading `getSession()` per request so supabase-js's auto-refresh is always honored. On 401: one `getSession()` + retry, then sign-out → `/login`. `SIGNED_OUT` event → `/login`. A "Logout" entry in the drawer. The client always requires a Supabase session, also against a stub-mode server (which ignores the token) — keeps dev on the real login path daily, no second mechanism.

**Trigger-gated fallback, not built now:** e-mail OTP code login (`signInWithOtp` + `verifyOtp`, no redirect) — build it if (a) the iPhone home-screen PWA cannot complete the Google redirect in Task 12's smoke, or (b) a tester Lutz wants has no Google account. ~half a day; Supabase needs no extra configuration for it.

### Acceptance

- **T9-AC-01:** Middleware unit tests with a locally generated key pair: valid token → `req.userId`/`req.userEmail` set; expired, wrong `aud`, wrong `iss`, bad signature, missing header → 401 `unauthorized` with the stable error shape; no network call (fetch spy on the JWKS URL fires once across the suite).
- **T9-AC-02:** Valid token with an e-mail not in `BETA_ALLOWLIST` → 403 `not_invited`; listed e-mail passes; comparison is case-insensitive.
- **T9-AC-03:** `AUTH=stub` behaves exactly as before Task 9 (existing server tests green); the server refuses to boot in `supabase` mode without `SUPABASE_URL`/`SUPABASE_ANON_KEY`, and refuses to boot if `SUPABASE_SERVICE_ROLE_KEY` is present in the environment (guard against the key leaking onto the request path).
- **T9-AC-04:** Angular specs (ATL, fake `AuthService`): guard redirects to `/login` without a session and passes with one; interceptor and SSE client send `Authorization: Bearer` from `getSession()`; a 401 triggers exactly one refresh + retry before sign-out.
- **T9-AC-05:** Manual: Google login on desktop Chrome → app loads; F5 keeps the session; logout → `/login`; an un-invited Google account sees the "not invited" copy (catalog, both languages).
- **T9-AC-06:** An SSE stream opened with a token that expires during the turn keeps delivering events to `turn-end` (test with a 2-second token).

### Key Locations

- New: `apps/server/src/middleware/auth-supabase.ts` (+ spec), `apps/server/src/supabase/client-factory.ts`, `apps/web/src/app/auth/{auth.service,auth.guard,auth.interceptor,login-screen}.ts` (+ specs)
- Modify: `apps/server/src/middleware/auth-stub.ts` → mode switch, `apps/server/src/index.ts` (env), `apps/web/src/app/app.config.ts`, `apps/web/src/app/app.routes.ts`, `apps/web/src/app/chat/sse-client.ts` (bearer), `apps/web/src/app/navigation/app-drawer.html` (logout), `apps/web/public/i18n/{de,en}.json`
- Reference: `docs/specs/architecture.md` → "Authentication: Supabase Auth → JWT → Express" (the spec's `getUser(token)` sample is superseded by local verification), Supabase docs on JWT signing keys / JWKS

### Key Discoveries

- Supabase's asymmetric signing keys make the server stateless with respect to auth: one cached public key, zero auth roundtrips. The spec's `supabase.auth.getUser(token)` sketch predates that option.
- The allowlist belongs on the server, not in Supabase's signup toggle: Google sign-in for a new account would otherwise fail opaquely on the Google page instead of landing on our "not invited" copy.
- iOS home-screen PWAs have their own storage, separate from Safari — any login that bounces through Safari (magic link from the Mail app, possibly OAuth redirects) can land the session in the wrong place. That is why the OTP fallback exists as a named trigger instead of a speculative build.
- Refresh tokens rotate and Supabase detects reuse (steals the whole session family on a replayed token); access-token lifetime (default 60 min, can go to 15–30) is the exposure window of a leaked JWT because local verification cannot revoke. "Stay logged in forever" is the consumer-app norm; the kill switch is the admin "sign out user" call, not a periodic re-login.

---

## Task 10: Supabase persistence — `SupabaseFileRepository` + `SupabaseSessionStore`

### Instructions

Second implementation of the two persistence interfaces, selected by `REPOSITORY=local|supabase` at boot. Everything above the interfaces — engine, tools, pruning, opener, routes, DTO — must not change. Lives in `apps/server/src/persistence/`, **not** in `packages/core`: core stays free of vendor SDKs, the same rule that kept Pino out (T3.9-AC-02).

**Schema (SQL migration under `apps/server/supabase/migrations/`):** `files` and `file_history` exactly per the spec's "Database Schema"; `sessions(id, user_id, date, state jsonb, created_at, updated_at, UNIQUE(user_id, date))` — **deviation:** `state` holds `Session.toJSON()` verbatim (messages, createdAt, origins, `autoReplanRanFor`); no `messages` table until a per-message query exists. RLS enabled on all three tables with `USING (user_id = auth.uid())` and `WITH CHECK (user_id = auth.uid())` for select/insert/update/delete. One Postgres function `write_file(p_path text, p_content text, p_summary text, p_changed_by text)` (SECURITY INVOKER, so RLS still applies) that upserts `files` and inserts `file_history` in one transaction — PostgREST cannot span two REST calls atomically, and the history-first discipline of `LocalFileRepository` must survive. `profiles` is **not** created here (no consumer yet; the allowlist is env-based).

**`SupabaseFileRepository implements FileRepository`**, modeled on `InMemoryFileRepository` (114 lines): `validateFilePath` first on every call; `read` → select `content` (`FileNotFoundError` on no row); `write` → `rpc("write_file")`; `edit` → read → `planAndApplyEdits` (shared, `packages/core/src/edit.ts`) → `rpc("write_file")`; `list(prefix)` → `select file_path ... like prefix%`; `search` → load the user's files once (a few hundred rows at most) and reuse `findMatches`/`isInScope` in memory, as Local does per file. Options `now`, `timeZone`, `changedBy` as on the other repositories. One instance per request/turn, built from Task 9's per-request client, so RLS is the isolation layer and `userId` never appears in a query as a trust decision (it is still written redundantly into `file_history.user_id` per spec).

**`fileVersionAt` without `statSync`:** the engine's `fileVersionAt(path)` is synchronous. The Supabase repository loads `select file_path, updated_at` for the user once at turn start into a `Map<path, epochMs>` that the turn's `fileVersionAt` reads; files written during the turn update the map from the RPC's returned `updated_at`. Without this the pruner's drift stub (anti-confabulation, Task 4.2) would be silently disabled on the beta path.

**`SupabaseSessionStore implements SessionStore`:** `loadOrCreate(date)` → select `state` where `date` → `Session.fromJSON(state)` or `Session.createEmpty(date)`; `save(session)` → upsert `{ user_id, date, state: session.toJSON() }`. The two-phase save, snapshot rollback and origin markers are engine/Session concerns and stay untouched.

**Boot + readiness:** `REPOSITORY=supabase` requires `AUTH=supabase` (RLS needs a user JWT; the stub has none) and `SUPABASE_URL`/`SUPABASE_ANON_KEY`. `ensureGtdTaskFiles` moves from boot to **once per user per process on the first authenticated request** (registry flag), with a `changedBy: "system"` repository — on the local path it stays at boot. Server logs stay metadata-only: paths and byte counts, never `content`.

**Tests:** integration tests against a local Supabase (`supabase start`, Docker) or a dedicated dev project, gated by `SUPABASE_TEST_URL` + two seeded test users (sign in with password to obtain real JWTs); skipped with a visible notice when the env is absent. Port the behavioral cases of the `LocalFileRepository` tests (not-found, empty vs missing, edit ambiguity, history entry shape, list prefix, search scope) so both implementations are pinned to the same contract.

### Acceptance

- **T10-AC-01 (isolation):** With two users' JWTs, user A's `read`/`list`/`search` never return B's rows and A's `write`/`edit` on B's path creates a row owned by A, not a modification of B's — asserted through the repository, i.e. through RLS, not through application filtering.
- **T10-AC-02 (atomic history):** A failing `write_file` (forced constraint violation) leaves neither a `files` change nor a `file_history` row; a succeeding one produces exactly one of each with `changed_by`, `change_summary`, and the full before/after content.
- **T10-AC-03 (shared edit semantics):** The same fixture file + search/replace edits produce identical `EditResult`s on `LocalFileRepository`, `InMemoryFileRepository`, and `SupabaseFileRepository` (ambiguous match, zero match, multi-edit).
- **T10-AC-04 (session round-trip):** A `Session` with user/assistant/tool messages, origin markers (`"synthetic"`), and `autoReplanRanFor` survives `save` → `loadOrCreate` byte-identical in `toJSON()`; a missing row yields `createEmpty`.
- **T10-AC-05 (drift map):** `fileVersionAt` reflects `updated_at` after a single query per turn (query spy = 1) and updates after a write within the turn; a read-then-external-write sequence produces the pruner's drift stub exactly as on the local path.
- **T10-AC-06:** `REPOSITORY=local` is unchanged — the entire earlier server suite stays green; `REPOSITORY=supabase` with `AUTH=stub` refuses to boot with a clear message.
- **T10-AC-07:** `ensureGtdTaskFiles` runs once per user per process (spy), creates the five task files with `changed_by = "system"` history rows, and is idempotent on the next request.
- **T10-AC-08 (XC-02):** No log line produced during T10 tests contains file content or message text.
- **T10-AC-09:** Manual: full app chat turn against the hosted Supabase project; the written file shows in the Supabase table editor; `file_history` carries the LLM's `change_summary`.

### Key Locations

- New: `apps/server/supabase/migrations/0001_files_sessions.sql`, `apps/server/src/persistence/{supabase-file-repository,supabase-session-store,file-version-map}.ts` (+ specs), `apps/server/src/persistence/repository-factory.ts` (the `REPOSITORY` switch)
- Modify: `apps/server/src/index.ts` (boot env + readiness relocation), `apps/server/src/chat/turn-registry.ts` (readiness flag, drift map lifecycle)
- Reference: `packages/core/src/in-memory-file-repository.ts` (template), `packages/core/src/edit.ts` (`planAndApplyEdits`), `packages/core/src/sessions.ts` (`toJSON`/`fromJSON`), `packages/core/src/history-log.ts` (`buildHistoryEntry` shape to mirror in SQL), `docs/specs/architecture.md` → "Database Schema", "Multi-Tenancy"

### Key Discoveries

- The repository interfaces were designed for this swap, but two things sit *outside* them and had to be re-homed: `fileVersionAt` (CLI `statSync`) and `ensureGtdTaskFiles` at boot (per-vault, not per-user). Both are now explicit in this task so the swap is actually interface-only for everything else.
- The JSONB session blob is the pragmatic cut: `FsSessionStore` already persists exactly that shape, pruning works on the loaded `Session`, and no current feature queries messages individually. Normalizing to a `messages` table later is a data migration, not a code redesign.
- Per-user turn serialization (one in-flight turn per user, 409 otherwise — Task 6.1) is what makes the repository safe without row locks: the recheck-vs-rename race from the Task-2 log cannot occur on the server path.

---

## Task 11: Web voice capture — `POST /api/transcribe` + `WebVoiceCaptureService`

### Instructions

Voice is the primary capture modality of the product ("evening on the couch"). The spec planned native STT via Capacitor first; the PWA decision flips the order: browser `MediaRecorder` → our server → OpenAI's audio transcription API. The abstract `VoiceCaptureService` and its cancel contract already prescribe exactly this implementation in their doc comments; the mock stays for tests.

**Server `POST /api/transcribe`:** `multipart/form-data` with field `audio` (Blob) and optional `language` (BCP-47 from the active Transloco language, passed as a hint). Size cap 15 MB → 413 `audio_too_large`; unsupported MIME → 415 `audio_unsupported`; provider failure → 502 `stt_failed` with `requestId`. Forwards to the OpenAI transcription endpoint (`STT_MODEL` env, default `whisper-1`; `OPENAI_API_KEY` required at boot when `STT=openai`, the only STT option now). Response `{ text: string }`. Logs: bytes, MIME, duration ms, model, status — **never the transcript**. Cost is cents per minute; no separate cap — the LLM turn cap (Task 6) is the brake that matters, and transcription without a turn is pointless.

**Client `WebVoiceCaptureService extends VoiceCaptureService`:** `startRecording()` → `getUserMedia({ audio: true })` + `MediaRecorder` with MIME negotiation (`audio/webm;codecs=opus` → `audio/mp4` → browser default; iOS Safari records AAC in `audio/mp4`, which the API accepts). `stopRecording()` → stop recorder and tracks → assemble Blob → `POST /api/transcribe` with an `AbortController` → resolve `text`. `cancelRecording()` → abort the request **and** stop tracks, so the pending `stopRecording()` promise rejects (the store's contract: never a late resolve). Permission denied / no device → reject with a typed error the overlay maps to a new catalog state ("Mikrofon nicht erlaubt" next to the existing "Nichts gehört"). Swap `{ provide: VoiceCaptureService, useClass: WebVoiceCaptureService }` in `app.config.ts`. The transcript lands in the composer draft as today — no auto-send (keppt-ui Task 3 decision).

### Acceptance

- **T11-AC-01:** Server tests with a mocked provider fetch: success returns `{ text }`; oversize → 413; unsupported MIME → 415; provider 5xx → 502 with `requestId`; log lines contain no transcript (XC-02).
- **T11-AC-02:** Client spec with fake `MediaRecorder`/`getUserMedia`: MIME negotiation picks the first supported type; `stopRecording()` posts the Blob and resolves the text; `cancelRecording()` during the request rejects the pending promise and stops all tracks; a provider response arriving after cancel is dropped.
- **T11-AC-03:** Permission denied renders the new overlay error state with catalog copy in both languages; the composer draft is untouched.
- **T11-AC-04:** Mock providers remain injectable and the existing overlay/store specs stay green (XC-03).
- **T11-AC-05:** Manual: desktop Chrome and desktop Safari record → transcript appears in the composer; a German and an English dictation each come back in their own language. Phone verification is Task 12's smoke.

### Key Locations

- New: `apps/server/src/routes/transcribe.ts` (+ spec), `apps/server/src/stt/openai-transcription.ts`, `apps/web/src/app/chat/web-voice-capture.service.ts` (+ spec)
- Modify: `apps/web/src/app/app.config.ts`, `apps/web/src/app/chat/chat-ui-state.ts` (new error key), mic overlay template, `apps/web/public/i18n/{de,en}.json`, `apps/server/src/index.ts` (STT env)
- Reference: `apps/web/src/app/chat/voice-capture.service.ts` (contract + the doc comment that already describes this implementation), `apps/web/src/app/mock/mock-voice-capture.service.ts`, `docs/specs/architecture.md` → "Voice Input Quality" (to be amended: web STT is now MVP)

### Key Discoveries

- The cancel contract ("must reject, never resolve late") is the only non-obvious part; everything else is a straight port of the doc comments written in keppt-ui Task 3.
- iOS Safari in standalone mode re-prompts microphone permission more often than in-tab Safari; the overlay's error state must be a normal, recoverable state, not a dead end.

---

## Task 12: Deploy + PWA — one container, installable on the phone

### Instructions

**Same origin:** Express serves the Angular production build (`apps/web/dist/web/browser`) with an SPA fallback for every non-`/api` path; hashed assets `Cache-Control: immutable`, `index.html` `no-cache`. One origin means no CORS, one bearer path, one PWA scope. Security headers incl. a Content-Security-Policy (`default-src 'self'`; `connect-src 'self' <SUPABASE_URL>`; `img-src 'self' data:`; `frame-ancestors 'none'`; no inline scripts — Angular's build output complies) — LLM-authored markdown is our XSS surface, and the tokens live in `localStorage`.

**PWA:** `manifest.webmanifest` (name, icons, `display: standalone`, theme/background colors from the Keppt tokens), `@angular/service-worker` with `ngsw-config.json`: app shell prefetch, `/api/**` excluded from every data group (never cache API), and `SwUpdate.versionUpdates` → reload on `VERSION_READY` so daily deploys never leave a tester on a stale shell. iOS needs no service worker for "Add to Home Screen"; Android Chrome's install prompt benefits from one.

**Container + platform:** multi-stage Dockerfile (pnpm install → build core, web, server → slim Node 22 runtime), `TZ=UTC` (Task 6.5's timezone plumbing assumes it), health check on `GET /api/health`. Platform: **Fly.io (EU region) or a Hetzner Cloud VPS with Docker Compose + Caddy** — decided at task start against these requirements: **exactly one always-on instance** (registry and event log are in-process; no autoscale, no scale-to-zero, which would also kill idle SSE streams), persistent outbound HTTPS, SSE pass-through with a known idle timeout — the server's heartbeat interval must be below it, EU data residency (the privacy notice in Task 13 names the location). **Railway is ruled out (2026-10-24):** on 2026-10-21 it disclosed that an intruder may have accessed customers' encrypted environment variables and decrypted some of them, told *all* users to rotate every secret, paused builds for two days, and has new signups suspended; in May 2026 a Google-Cloud account suspension took its control plane down for ~8 hours. A PaaS whose env-var store is the breach surface is the wrong home for a server whose entire configuration is env vars. Secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BETA_ALLOWLIST`, `DAILY_TURN_LIMIT`, `REPOSITORY=supabase`, `AUTH=supabase`, `STT=openai`, `GTD_PROVIDER`/`GTD_MODEL`. **Blast-radius rule regardless of platform:** the prod API keys are dedicated keys (not Lutz's personal dev keys) with spend caps set at Anthropic and OpenAI, so a leaked env store costs a rotation, not a bill. Register the prod origin in Supabase redirect URLs and in the Google OAuth client. Deploy is a manual CLI command for the beta; no pipeline.

**Phone smoke protocol (the acceptance that matters):** on a real iPhone (Safari) and a real Android phone (Chrome): install to home screen → Google login from inside the installed app → mic permission + a dictated capture → a full chat turn with visible tool rows → file visible on a vault screen → background the app 5 minutes mid-turn → foreground: stream re-attached, turn complete → F5 mid-turn on desktop resumes seamlessly. If the iPhone login fails inside the installed app, Task 9's OTP trigger fires.

### Acceptance

- **T12-AC-01:** `GET /` and any deep link (`/daily/2026-10-24`) serve the Angular shell; `/api/*` is untouched; asset/HTML cache headers as specified; CSP header present and the app runs without CSP violations in the console.
- **T12-AC-02:** Lighthouse "installable" passes; the manifest and service worker are served; `/api/**` is absent from the ngsw manifest's data groups; a new deploy makes an open client reload within one navigation.
- **T12-AC-03:** Container builds from a clean checkout and boots with the listed env; missing required env aborts with a clear message (T1-AC-05 carried forward); the platform config pins one instance and `TZ=UTC`.
- **T12-AC-04:** An SSE stream idles for 2× the platform's proxy timeout and stays open (heartbeat verified against the real proxy, not localhost).
- **T12-AC-05:** The phone smoke protocol passes on iPhone and Android, recorded in the task log with OS/browser versions.
- **T12-AC-06:** An un-invited account, a cancelled turn, and a `turn_limit_reached` are each exercised once on prod and render catalog copy.

### Key Locations

- New: `apps/server/Dockerfile`, `fly.toml` or `railway.json` at repo root, `apps/web/public/manifest.webmanifest` + icons, `apps/web/ngsw-config.json`, `apps/server/src/static.ts` (SPA serving + headers)
- Modify: `apps/web/angular.json` (service worker, assets), `apps/web/src/app/app.config.ts` (`provideServiceWorker`), `apps/web/src/index.html` (manifest link, theme color, apple-touch-icon), `apps/server/src/app.ts`
- Reference: `apps/web/src/styles.scss` (tokens for theme colors), Task 6.1 heartbeat implementation

### Key Discoveries

- "One instance" is a correctness constraint, not a cost choice — it must be written into the platform config and into `README`/task log so a future "just scale to 2" does not silently break cursor replay.
- Serving the SPA from Express is what keeps auth simple: one origin, one bearer path, no CORS preflights on the SSE route.

---

## Task 13: Launch hygiene — reply language, feedback channel, privacy notice

### Instructions

Three small items a non-dev tester hits in the first ten minutes, none of them in the original plan.

**LLM reply language (gap found 2026-10-24):** the system prompt has no language rule; it is written in English with German examples, and Lutz's tester network is largely non-German. Add one rule to `packages/core/src/system-prompt.ts`: reply in the user's language and write free-text file content (task lines, log entries, notes) in the user's language; structural headings and the file layout stay as the R-rules define them. Keep the prompt within the existing size test bound (adjust the bound only if the test says so, and record it). CLI and server share the prompt — no divergence.

**Feedback channel:** a "Feedback" row in the drawer (catalog keys de/en) opening `mailto:` with a prefilled subject — the roadmap's "support = founder DMs" principle, and the cheapest research channel for the beta. No form, no backend.

**Privacy notice:** a static `/privacy` route rendering `apps/web/public/legal/privacy.{de,en}.md` through the existing markdown pipeline, linked from the login screen and the drawer. Content (plain language, draft for Lutz's review — not legal advice): what is stored (task files, chat sessions, change history), where (Supabase EU region, the hosting platform), which processors see what (Anthropic for chat turns, OpenAI for voice transcription, Google for sign-in), that this is a closed beta, and that deletion is available on request via the feedback address. Account self-deletion and data export stay out (MVP scope cuts). The beta invitation e-mail text lives in the strategy repo, not here.

### Acceptance

- **T13-AC-01:** Prompt test asserts the language rule is present once and the prompt stays under the size bound; a manual turn in English against the real model answers in English and writes English task lines; the same in German stays German.
- **T13-AC-02:** Drawer shows the feedback entry in both languages; it opens the mail client with the prefilled subject; no network request is made.
- **T13-AC-03:** `/privacy` renders in both languages, is reachable logged-out from the login screen, and names every processor the running configuration uses.

### Key Locations

- Modify: `packages/core/src/system-prompt.ts` (+ its test), `apps/web/src/app/navigation/app-drawer.html`, `apps/web/src/app/app.routes.ts`, `apps/web/src/app/auth/login-screen.*`, `apps/web/public/i18n/{de,en}.json`
- New: `apps/web/public/legal/privacy.de.md`, `apps/web/public/legal/privacy.en.md`, `apps/web/src/app/legal/privacy-screen.ts`

### Key Discoveries

- The language rule is the only prompt change in this plan; everything else about R1–R21 is deliberately untouched so Phase-1 dogfooding evidence stays valid.

---

## Task 14: Session history UI — DEFERRED

> **Deferred 2026-10-24.** Trigger to pull it in: a tester asks what was discussed on a previous day, or Lutz needs it for dogfooding on the beta path. Includes the endpoints removed from the session read surface (now Task 6.3): `GET /api/sessions` (date list, newest first — on the local path from the `.keppt/sessions/*.json` filenames with zero content reads; on the Supabase path a `select date` on `sessions`, so `SessionStore` gains `listDates()`) and `GET /api/sessions/:date` (replay DTO, 404 `session_not_found`). The former T7-AC-01 (filename-only listing, spy: zero file reads) lands here.

### Instructions

The past-days surface over Task 6.3 — list and read-only replay, using the existing chat rendering.

- **Drawer:** add a "Chat-Verlauf" row to the existing History section (currently holds only Daily Notes). Registry-driven like all navigation: new screens in `SCREEN_REGISTRY` (`history`, `history-detail` with `:date` param — not vault screens; follow the `daily`/`daily-detail` pattern incl. route `data.screen` validation).
- **List screen:** `GET /api/sessions` dates rendered newest-first with locale-formatted labels (`Intl.DateTimeFormat` in the active Transloco language + relative "Today"/"Yesterday" catalog copy — same conventions as the Daily list). Today's entry navigates to chat (`""` route) instead of a detail view. States: loading / error-retry / empty ("no past conversations" copy).
- **Detail screen:** `GET /api/sessions/:date` → map ReplayMessages to `ChatMessage`s (same mapper as the Task 6.3 boot — extract it to a shared module) → render through the **existing** `ChatMessageListComponent`/`groupMessagesForRender` pipeline. Read-only: no composer, no chips, no typing; back button like daily-detail. A guard mirrors `/daily/:date` (unknown date redirects to the list).
- **Deliberately deferred, documented in the task log:** "continue chatting in a past session" (spec Session Architecture allows appending to old sessions). Read-only is the MVP cut; revisit with beta feedback.
- All new chrome (drawer label, screen titles, empty/error copy, a11y labels) as keys in both `de.json` and `en.json`.

### Acceptance

- **T9-AC-01:** Drawer shows the history entry; navigation is registry/router-driven; the drawer performs no data reads (stays metric-free).
- **T9-AC-02:** List renders real past sessions newest-first with locale-aware labels in both languages; today routes to chat; loading/error/empty states work.
- **T9-AC-03:** Detail replays a past day read-only through the existing message components — tool rows grouped/collapsed and settled, markdown rendered, no composer/chips/typing present.
- **T9-AC-04:** Unknown `:date` redirects to the list; transport failure surfaces the error-retry state.
- **T9-AC-05:** Exactly one request per screen visit (list: one `GET /api/sessions`; detail: one `GET /api/sessions/:date`) — no per-row fetches (spy-asserted).

### Key Locations

- New: `apps/web/src/app/history/` (list + detail components, specs), shared replay mapper module (with Task 6.3)
- Modify: `apps/web/src/app/navigation/screen-registry.ts`, `apps/web/src/app/app.routes.ts`, `apps/web/src/app/navigation/app-drawer.html`, `apps/web/public/i18n/{de,en}.json`
- Reference: `apps/web/src/app/vault/daily-notes-screen.ts` (list pattern), `apps/web/src/app/chat/components/chat-message-list.ts` (render pipeline)

### Key Discoveries

- `ChatMessageListComponent` renders from an input of messages via `groupMessagesForRender` — reusing it read-only means history gets tool-row grouping, markdown styling, and future rendering fixes for free, at the cost of ensuring it accepts a plain input signal (verify; adjust without breaking the chat screen).
- Chips are not in the replay DTO by design (Task 6.3) — the read-only screen has nothing interactive to suppress.

---

## Task 15: Vault editor mode with autosave — DEFERRED

> **Deferred 2026-10-24.** Trigger to pull it in: a tester cannot repair a file through chat, or asks to edit directly. Until then the chat is the only write channel and the vault screens stay read-only. Includes `PUT /api/files/{path}` removed from Task 2: body `{ content }` → `repo.write(path, content, "Manual edit")` with `changedBy: "user"`; same validation as `GET`; **past dailies (date < user-local today) → 403 `past_daily_readonly`** — the user gets no manual write channel for past dailies (mirrors the core `write_file` gate; the LLM keeps its narrow `edit_file` correction carve-out per R6). The former T2-AC-03/T2-AC-04 (persist + history entry with `changedBy: "user"`; past daily 403 writes nothing, today/future writable) land here.

### Instructions

Port of the former keppt-ui Task 4.5, adjusted for the real write path and the history-amplification finding.

- **Contract:** `VaultRepository` gains `abstract writeFile(file: VaultFile, content: string): Promise<void>`. `HttpVaultRepository` → `PUT /api/files/{path}` (this task). `MockVaultRepository` → in-memory write. Document the autosave rationale on the contract: the backend persists every change as revertable history, so no confirm/cancel model.
- **UI:** edit (pencil) toggle in the screen header swaps rendered markdown ⇄ full-document plain `<textarea>` (no editor dependency) on the five task screens and **today's** daily note. Past dailies show no edit affordance (client check: route date vs real `APP_TODAY`; server enforces regardless — this task's 403).
- **Autosave policy (deliberate, reviewed):** generous idle debounce (~2–3 s) + flush on edit-mode exit, blur, and navigation — NOT an aggressive short debounce: every PUT appends a full `contentBefore + contentAfter` snapshot to the history JSONL, and the spec's storage analysis warns per-edit snapshots dominate; a tight debounce would also flood the future history/changelog view with "Manual edit" entries. Accepted residual amplification on the dev JSONL path is documented; the Supabase history schema decision (delta/dedupe) belongs to the beta plan.
- **State:** saving/saved/error modeled separately from the Resource read state; writes never run in a Resource loader; after a confirmed write, explicitly `reload()` the owning read Resource so toggling back renders the edited markdown.
- **Failure handling:** PUT 403 (`past_daily_readonly` via clock skew, `path_out_of_scope`) and transport failures surface as a visible save-error state with catalog copy; textarea content is preserved (no data loss, no crash). Edits survive navigate-away-and-back through persisted data.
- New chrome (toggle label/aria, saving/saved/error hints) as keys in both catalogs.

### Acceptance

- **T10-AC-01:** Toggle switches rendered ⇄ raw editing on the five task screens and today's daily; past dailies expose no edit affordance.
- **T10-AC-02:** Edits autosave through the PUT path (debounced, flushed on exit/blur/navigation); the vault file changes and the history JSONL gains a `changedBy: "user"` entry; toggling back shows the edited markdown after the explicit Resource reload.
- **T10-AC-03:** Rapid typing produces bounded saves (idle debounce asserted with fake timers), and leaving edit mode always flushes the final state.
- **T10-AC-04:** A failing save shows the error state with catalog copy and preserves the draft; a subsequent successful save clears it.
- **T10-AC-05:** No save/cancel buttons exist; edits survive navigating away and back.

### Key Locations

- Modify: `apps/web/src/app/vault/vault.repository.ts`, `http-vault.repository.ts`, `apps/web/src/app/mock/mock-vault.repository.ts`, `vault-file-screen.ts`/`daily-note-detail-screen.ts` (+ templates/styles), `apps/web/public/i18n/{de,en}.json`
- Reference: `packages/core/src/gtd-layout.ts` (`isPastDaily`), `packages/core/src/history-log.ts` (snapshot shape behind the amplification concern)

### Key Discoveries

- The editor is safe by product design only because every write is revertable history — that rationale must live as a comment on the contract so a future confirm/cancel "improvement" doesn't re-litigate it blindly.
- Tappable checkboxes in the rendered view remain deferred (separate task, unchanged from the keppt-ui plan decision).

---

## Cross-Cutting Acceptance

- **XC-01** — `pnpm -r build`, `pnpm -r typecheck`, and `pnpm -r test` pass after every task. **Touches:** T1–T10.
- **XC-02** — Server logs are metadata-only end to end: no chat text, GTD file contents, tool payloads, or provider bodies in any log line produced by the new server across all endpoints. **Touches:** T1, T2, T6.1, T6.3, T6.4.
- **XC-03** — Mock providers (`MockChatService`, `MockVaultRepository`, `MockVoiceCaptureService`) remain injectable and green for tests after every swap. **Touches:** T3, T6.2, T11, T15. (`/dev/ui` from the keppt-ui plan was never built and is not part of this plan.)
- **XC-04** — Anthropic prompt-cache hit rate survives the engine extraction: cache markers stay on the system-message object and trailing user message, byte-stable across turns (verify via a `DEBUG=1` turn artifact's cache usage before/after T4 — **this smoke has been owed since Phase 1 and must actually be run this time**). **Touches:** T4, T5, T6.1.
- **XC-05** — CLI dogfooding behavior is unchanged after the engine migration: same prompts, same tool loop, same session files, same terminal UX. **Touches:** T4, T5, T6.4 (`FsTurnLogger` move), T6.5 (timezone parameter defaults), T13 (language rule applies to both).
- **XC-06** — A started turn always completes and persists server-side with zero connected clients; any client connecting later (cursor attach or fresh boot replay) converges on the same persisted result. **Touches:** T6.1, T6.2, T6.3.
- **XC-07** — Tenant isolation is enforced by Postgres RLS under the user's own JWT: every Supabase access on the request path uses the per-request client; the `service_role` key is absent from the server runtime and its presence aborts boot. **Touches:** T9, T10.
- **XC-08** — The server is a single process with `TZ=UTC`: registry and event log are in-memory, the platform config pins one instance, and every "today" on the server is derived from the user's `X-Timezone`. **Touches:** T6.1, T6.5, T10, T12.
- **XC-09** — Phone-usable: login, voice capture, a full chat turn, and background/foreground stream re-attach pass on a real iPhone and a real Android home-screen install before any tester is invited. **Touches:** T6.3, T9, T11, T12.
