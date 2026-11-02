# Task 3.2 — Shared API contract package (`@gtd/api`)

### Task
Create `packages/api` (`@gtd/api`), the HTTP wire contract shared by `apps/server` and `apps/web` — the closed error-code tuple `API_ERROR_CODES` → `ApiErrorCode`, `ErrorBody`, the one tested guard `apiErrorOf(body: unknown)`, and the DTOs `FileContentBody` / `DailyNoteRef` — so that `ApiError.code` on the server and the `"file_not_found"` literal in `HttpVaultRepository` are both checked against the same union, and the web's cast-based error-body read goes away.

### Status
DONE. Independent review performed: Codex `/review quick` (2026-11-02) found no functional regression; its one LOW finding (the `index.ts` comment overclaimed what the tsconfig guard enforces) is fixed (decision 12), its blind spot (a repository-level test for an incomplete 404 body) is declined (decision 13). Codex also ran the owed fresh-install check outside the sandbox — an isolated offline `pnpm install --frozen-lockfile --ignore-scripts` confirmed the hand-written lockfile entries and all new workspace links (decision 7) — so no check remains open. The CodeScene gate (`/cs`) has not been run for this task. All suites green on the final code state (api 7 · server 86 · web 119 · core 317 · cli 57), all typechecks clean, Prettier clean; the only change since those runs is the comment rewrite in `packages/api/src/index.ts` (api rebuilt, Prettier clean). `pnpm install` itself could not run in the sandbox (store lock outside the write allowlist, bypass declined by the permission gate — same as Task 3.1), hence the hand-written symlinks and lockfile entries. Plan deviation accepted in the briefing: the server's test files are now typechecked (`tsconfig.spec.json`), otherwise the AC-02 `@ts-expect-error` pin would have been checked by nobody (decision 1). Ready for `/commit 3.2`.

### Files Modified
- `packages/api/package.json` (new) — `@gtd/api`: ESM, `exports` with `types`/`default` onto `dist`, scripts `build`/`typecheck`/`test`; dependency `@gtd/core: workspace:*`, devDependencies `typescript` + `vitest` only (no `@types/node`, no `engines` — browser-safe)
- `packages/api/tsconfig.json` (new) — extends the base; `types: []` + `noUncheckedSideEffectImports` (the Task-3.1 guard pattern) so a `node:*` import fails the build; tests excluded from emit
- `packages/api/vitest.config.ts` (new) — same `include` as core
- `packages/api/src/errors.ts` (new) — `API_ERROR_CODES` tuple (six codes in use), `ApiErrorCode`, `ApiErrorPayload`, `ErrorBody`, `apiErrorOf` + two private predicates
- `packages/api/src/files.ts` (new) — `FileContentBody { readonly content: string }`
- `packages/api/src/daily-notes.ts` (new) — `DailyNoteRef { readonly date: IsoDate; readonly isToday: boolean }`, `IsoDate` from `@gtd/core/layout`
- `packages/api/src/index.ts` (new) — barrel; comment states the browser-safety rule and, after the Codex LOW, what enforces which part of it: `types: []` rejects a direct `node:*` import in these sources, the no-barrel rule is review, `ng build` is the backstop (decision 12)
- `packages/api/src/__tests__/errors.test.ts` (new) — 7 guard cases (T3.2-AC-01)
- `apps/server/package.json` (modified) — dependency `@gtd/api: workspace:*`; `typecheck` now also runs `tsc -p tsconfig.spec.json`
- `apps/server/tsconfig.spec.json` (new) — `noEmit`, includes `src/**/*` with tests, so test files are typechecked (decision 1)
- `apps/server/src/middleware/error-handler.ts` (modified) — `ApiError.code: ApiErrorCode`; `ErrorBody` imported from `@gtd/api`, local interface removed
- `apps/server/src/routes/files.ts` (modified) — `FileContentBody` imported from `@gtd/api`, local interface removed
- `apps/server/src/routes/daily-notes.ts` (modified) — `DailyNoteRef` imported from `@gtd/api`, local interface and the `IsoDate` import removed; `toDailyNoteRefs` unchanged
- `apps/server/src/__tests__/error-handler.test.ts` (modified) — `ErrorBody` from `@gtd/api`; new test "rejects a code outside API_ERROR_CODES at compile time" carrying the `@ts-expect-error` pin (T3.2-AC-02)
- `apps/web/package.json` (modified) — dependency `@gtd/api: workspace:*`
- `apps/web/src/app/vault/http-vault.repository.ts` (modified) — `apiErrorOf` + `FileContentBody` from `@gtd/api`; local `FileContentBody`, `ApiErrorBody` and `apiErrorCode` (the cast) removed; `isFileNotFound` decides via `apiErrorOf(error.error)?.code === "file_not_found"`
- `apps/web/src/app/vault/vault.types.ts` (modified) — local `DailyNoteRef` replaced by `export type { DailyNoteRef } from "@gtd/api"` (seven consumers keep their import path); `IsoDate` import dropped
- `pnpm-lock.yaml` (modified) — hand-written in pnpm's shape: `@gtd/api` link in the `apps/server` and `apps/web` importers, new `packages/api` importer (decision 7)
- `README.md` (modified) — build-order note names `@gtd/api` next to `@gtd/core`; repository layout block gains `apps/server/`, `apps/web/`, `packages/api/` (decision 10)
- Not in the tree (gitignored / local only): `packages/api/dist/` (built), symlinks `packages/api/node_modules/@gtd/core`, `apps/server/node_modules/@gtd/api`, `apps/web/node_modules/@gtd/api`

### Files Read (Context Only)
- `docs/work/phase-2a/plan.md` (preamble + Task 3.2 block), `task-log/task-3.1-core-layout-entry.md` (predecessor: guard pattern, hand-written lockfile precedent, `@gtd/core/layout` consumption), `task-log/task-3-http-vault-repository.md` decisions 1, 3, 9, 11 (strict 404 mapping, why the body is read defensively, origin of this task)
- `packages/core/package.json`, `tsconfig.json`, `tsconfig.layout.json`, `vitest.config.ts`, `src/layout/{index,daily-note}.ts`, `dist/layout/` listing — template for the new package and the `IsoDate` source
- `tsconfig.base.json`, `pnpm-workspace.yaml`, root `package.json` (scripts), `pnpm-lock.yaml` importer blocks (`apps/server`, `apps/web`, `packages/core`, root — vitest peer-suffix shape), `apps/*/node_modules/@gtd/` symlink shape, `.gitignore`
- `apps/server/tsconfig.json`, `src/__tests__/{files-route,daily-notes-route}.test.ts` headers, `src/middleware/request-id.ts` (grep: `req.requestId` augmentation)
- `apps/web/tsconfig{,.app,.spec}.json`, `angular.json` (unit-test builder), `src/app/vault/http-vault.repository.test.ts`, `vault.repository.ts`, `src/app/mock/mock-vault.repository.ts`, grep of all `DailyNoteRef` consumers
- `docs/improvements.md` (Sheriff/ESLint entry — confirms the package direction stays pnpm-enforced), `docs/tech-debt-backlog.md` (untracked, pre-existing)

### Key Decisions
— session 2026-10-31
1. **Server test files are now typechecked (plan deviation, approved in the briefing).** The server's `typecheck` was `tsc -p tsconfig.json --noEmit`, which excludes `__tests__`, and Vitest strips types — so the AC-02 `@ts-expect-error` pin in `error-handler.test.ts` would have been checked by nobody. A probe before any change showed the server tests already typecheck cleanly under a test-inclusive config (exit 0). `apps/server/tsconfig.spec.json` (`noEmit`, `include: src/**/*`, `exclude: []`) plus `&& tsc -p tsconfig.spec.json` in the script make the pin real: if the constructor ever accepted `string` again, `tsc` would fail on the unused directive. Not mirrored into `packages/api` or `packages/core` — no pin lives there (YAGNI).
2. **`apiErrorOf` returns a payload only when all three fields have the declared shape** — `code` in the tuple, `message` and `requestId` strings. The plan text says "only when `code` is a member of the tuple"; checking the code alone would type `message`/`requestId` as `string` without evidence. Consequence: a 404 with `{ error: { code: "file_not_found" } }` and no message would not be `null` but an error state — our server always sends all three, so the stricter guard costs nothing today. Pinned by "returns undefined when message or requestId is missing".
3. **No cast inside the guard.** `isApiErrorCode` uses `API_ERROR_CODES.some((code) => code === value)` instead of `(API_ERROR_CODES as readonly string[]).includes(value)`; `isRecord` is a `Record<string, unknown>` predicate so `body.error` and its fields narrow without `as`. The web file now has no cast on an error body (AC-03 grep).
4. **DTO fields are `readonly`.** Both the web's former `DailyNoteRef` and `FileContentBody` were `readonly`; the server's were not. Object literals assign to readonly fields, so the server's `const body: FileContentBody = { content }` and `toDailyNoteRefs`'s `.map(...)` compile unchanged. A wire DTO is immutable data; the web convention wins.
5. **`vault.types.ts` re-exports `DailyNoteRef` as planned; the two web-specific doc comments moved into the package in shorter form.** The former `{@link dailyFilePath}` reference was web-only and is gone; the package comment says "keys the day's vault file (`daily/{date}.md`) and the client route".
6. **Server imports from `@gtd/api` are type-only (`import type`), so the server has no runtime dependency on `packages/api/dist`.** `pnpm dev:server` (`tsx`) and `vitest` keep working without an api build; only `tsc` (needs the `.d.ts`) and the web build/typecheck/test (needs `apiErrorOf` at runtime) require it. Root scripts therefore stay unchanged; the README's build-order note names both packages for the direct `--filter` case. Rejected: adding `pnpm -C packages/api build` to `dev:server` — a build step for a dependency the running server never loads.
7. **`pnpm install` replaced by hand-written symlinks + lockfile entries (sandbox constraint, not a design choice — Task 3.1 decision 8 precedent).** `pnpm install --offline` failed with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK … Read-only file system`; the retry with the sandbox bypass was declined by the auto-mode permission gate. Symlinks created: `packages/api/node_modules/@gtd/core`, `apps/server/node_modules/@gtd/api`, `apps/web/node_modules/@gtd/api` (all `../../../../packages/<name>`, the shape pnpm uses). Lockfile: `@gtd/api` link before `@gtd/core` in the `apps/server` and `apps/web` importers (alphabetical), and a `packages/api` importer before `packages/core` whose `vitest` version string copies core's `1.6.1(@types/node@20.19.39)(jsdom@…)(sass@…)` — pnpm resolves the optional `@types/node` peer from the workspace root, so a package without its own `@types/node` gets the same suffix. `typescript`/`vitest` resolve from the root `node_modules` (`pnpm run` puts the root `.bin` on PATH), so no further symlinks were needed to run the package's scripts. Owed: `pnpm install --frozen-lockfile` on Lutz's machine — it fails if pnpm would have generated any entry differently, instead of silently rewriting it. Per-package scripts ran with `--config.verify-deps-before-run=false` for the same lock reason (3.1 gotcha).
8. **The `@ts-expect-error` pin sits inside an `it` block, not at module level.** The constructed instance is asserted (`toBeInstanceOf(ApiError)`), so there is no unused variable and the suite lists the rule by name ("rejects a code outside API_ERROR_CODES at compile time"); `tsc -p tsconfig.spec.json` is what verifies it, the runtime assertion is incidental.
9. **`ErrorBody` is imported from `@gtd/api` in the server test, not re-exported from `error-handler.ts`.** The plan says "local declarations removed"; a re-export would keep a second import path alive for no consumer.
10. **README layout block: two lines beyond the plan's mention.** The block listed neither `apps/server/` nor `apps/web/` although both have existed since Tasks 1 and 4 (phase-1 `keppt-ui`); adding `packages/api/` to a stale list would have made the list more wrong, so the two app lines were added as well. The `packages/core/` line was left byte-identical ("(later) prompts, tools, sessions") to keep the edit to the list's shape.
11. **`API_ERROR_CODES` carries `turn_in_flight` although no route throws it yet.** The plan names it (409 per the core design, and `error-handler.test.ts` already threw it before this task); dropping it would have broken that test for no gain. Later tasks extend the tuple together with the throw site, as the comment in `errors.ts` states.

— session 2026-11-02 (user review of the design + Codex `/review quick` triage)
12. **Codex LOW — `index.ts` claimed the tsconfig prevents importing the main `@gtd/core` barrel — fixed, comment only.** Verified in-session: `export { LocalFileRepository } from "@gtd/core"` passes `tsc -p packages/api/tsconfig.json`. Not a recursion gap — `tsc` follows the re-export — but a cross-package import reaches only `dist/*.d.ts`, and `tsc` strips implementation imports from declarations: core's `.d.ts` files contain no `node:*` import (one hit, a comment in `sessions.d.ts`) and no Node global; the Node dependency lives in `.js`, which `tsc` never reads. On top, `skipLibCheck: true` (base config) skips every `.d.ts`; with `--skipLibCheck false` the probe fails only incidentally, through `@ai-sdk/provider-utils/dist/index.d.ts` (`Buffer`, `URL`, `AbortSignal`). So the guard proves Node-freedom of `@gtd/api`'s own source graph (Task 3.1's guard was stronger only because `src/layout/` imports hit core's *sources*). The no-barrel rule stays a review convention — the same resolution as 3.1 decision 13 for the folder rule. Real backstop: `ng build` fails for any value re-export (esbuild: "Could not resolve node:crypto / node:fs/promises" at `packages/core/dist/history-log.js`, two hops deep; tree-shaking does not help because every import is resolved before shaking); a `type`-only re-export is erased from the `.js` and harmless. Rejected: a `paths` trick mapping `@gtd/core` to nothing (hacky, unverified under NodeNext) and a lint rule (the improvements-register entry with trigger already covers boundary tooling).
13. **Declined finding: Codex blind spot — "404 with `file_not_found` but an incomplete body" is tested only in the guard, not in `HttpVaultRepository` — the guard is the single reader of the body (`isFileNotFound` comment says so) and `errors.test.ts` pins exactly that case; a repository-level test would re-run the guard through the adapter. Cost is small, but the claim it would add is already made where the logic lives.**
14. **User clarification — no `Dto` suffix on the contract types.** Lutz asked whether exchange types should carry a `Dto` suffix for use-site readability (his guideline: a type should be readable without chasing the import). Resolution: a suffix should encode only what the context does not already say (the useful half of Hungarian notation — `IsoDate` vs `string` is that kind). Here the package path `@gtd/api` marks the wire types, and HTTP bodies already say so by name (`ErrorBody`, `FileContentBody`). `DailyNoteRef` is the one type that leaves the adapters, and there it serves as the web's port model (`VaultRepository`, `MockVaultRepository`, navigation, screens — none of which see a transport), so `DailyNoteRefDto` would state something false at those sites. Rule for later tasks: a type in `@gtd/api` is named after the HTTP thing it is; when a wire type and a domain type of the same concept coexist (Task 7 session replay next to core's `Session`), the wire type gets a name that says what it is (`SessionReplay`, `SessionEvent`), not `…Dto`. Considered and declined: an alias at the port (`DailyNoteRefDto` in api, re-exported as `DailyNoteRef` in `vault.types.ts`) — two names for one role boundary, grep-hostile, not needed while the shapes are identical.
15. **User clarification — the `vault.types.ts` re-export is a seam, not insulation.** It fixes the dependency direction (seven consumers depend on `./vault.types`; only `http-vault.repository.ts` names `@gtd/api`) but not shape coupling: a server-side field rename surfaces in every consumer, not in one file. Deliberate (YAGNI): the contract is built for the web (`isToday` is server-computed for the client, Task 2), a mapper would be identity today, and the compiler drives the switch — replace the re-export by an own `DailyNoteRef` in `vault.types.ts` and `listDailyNotes` in the HTTP adapter must map (aliasing the wire type locally, e.g. `DailyNoteRef as DailyNoteRefDto`); a web-side addition (e.g. `title`) additionally reaches the `mock-vault-data.ts` fixtures because the mock adapter builds port objects directly. The mapper belongs in the adapter, never in the types file (which stays declarative and transport-free).
16. **`isRecord` not extracted.** Lutz asked whether the object guard was defined several times. It is defined once (`errors.ts`); the only neighbour, `isPlainObject` in `apps/server/src/backend-logger.ts`, has different semantics (prototype check — must reject `Error`/`Date` so redaction does not recurse into them), and `local-file-repository.ts` has an inline errno narrowing. A shared helper would need to pick one meaning and would have to live in a new browser-safe core entry (api may only import `@gtd/core/layout`). Revisit when a second guard with `isRecord`'s semantics appears (Tasks 7/8, SSE events / replay DTOs in the web); it then gets exported from `@gtd/api` next to `apiErrorOf`, not moved to core.

### Review Focus
Codex `/review quick` (2026-11-02) covered the state below; the only change since is the `index.ts` comment (decision 12).
- **Behavior claims:** (1) Every server error response still has the `ErrorBody` shape with a code from `API_ERROR_CODES`; a `new ApiError(status, "no_such_code", …)` is a compile error (TS2345), verified by the server `typecheck` script. (2) `HttpVaultRepository.readFile` resolves `null` for exactly one response — 404 whose body passes `apiErrorOf` with code `file_not_found`; every other 404, 400/403, 5xx and network error still rejects (spec unchanged, 119 web tests green). A typo in the client literal (`"file_not_fuond"`) is a compile error (TS2367, no overlap with the union). (3) `apiErrorOf` yields a payload only for an object body whose `error.code` is in the tuple and whose `message`/`requestId` are strings; a text body, a `ProgressEvent`-shaped object, `null` and `undefined` yield `undefined`.
- **Plan deviations:** AC-02 pin needed a typechecked test file → `apps/server/tsconfig.spec.json` + extended `typecheck` script (decision 1). `pnpm install` not run → hand-written symlinks and lockfile entries, fresh-install check owed (decision 7). `apiErrorOf` stricter than the plan's wording — validates `message`/`requestId` too (decision 2). README gained two layout lines the plan did not ask for (decision 10).
- **Assumptions / choices:** `readonly` DTO fields (decision 4); type-only server imports, no root-script change (decision 6); vitest peer-suffix copied from core's importer (decision 7); pin inside an `it` block (decision 8).
- **Scope notes:** `apps/server/package.json` `typecheck` script now runs two `tsc` configs — every future server test must typecheck. No behavior change in any route, screen or test; web test count identical (119), server +1 (the pin test). The three `@gtd` symlinks exist only on this machine until `pnpm install` recreates them (Codex's isolated install confirmed pnpm creates the same ones).
- **Read next:** `packages/api/src/errors.ts` — the tuple and the guard are the whole contract; check that the honesty claim (decision 2) matches what the server actually sends (`error-handler.ts` lines 33–57). `packages/api/src/index.ts` header comment — it now states which part of browser-safety is enforced and which is convention (decision 12); confirm it does not overclaim again. `apps/server/package.json` `typecheck` + `apps/server/src/__tests__/error-handler.test.ts` last test — the AC-02 pin is only meaningful with the spec tsconfig in the script.

### Test Evidence
— session 2026-10-31 (final code state)

```
pnpm --filter @gtd/api build        → tsc -p tsconfig.json: clean; dist/{index,errors,files,daily-notes}.{js,d.ts} present
pnpm --filter @gtd/api typecheck    → clean
pnpm --filter @gtd/api test         → 1 file, 7 passed
pnpm --filter @gtd/server typecheck → tsc -p tsconfig.json --noEmit && tsc -p tsconfig.spec.json: clean (the @ts-expect-error pin is consumed)
pnpm --filter @gtd/server test      → 9 files, 86 passed (85 + the pin test)
pnpm --filter web typecheck         → ngc -p tsconfig.app.json --noEmit: clean
pnpm --filter web test              → 17 files, 119 passed (unchanged, XC-03)
pnpm --filter @gtd/core test        → 317 passed
pnpm --filter @gtd/cli typecheck    → clean
pnpm --filter @gtd/cli test         → 57 passed
prettier --check <15 new/changed ts/json files> → All matched files use Prettier code style!
rg "ApiErrorBody|apiErrorCode|as ErrorBody" apps/web/src → no hits (AC-03)
```

All package scripts ran with `--config.verify-deps-before-run=false` (pnpm 12 would otherwise re-install before every script and fail on the store lock, decision 7). `pnpm -r typecheck` / `pnpm -r test` as one command were not runnable for the same reason; the per-package runs above cover every workspace package.

Probe before any change (decision 1) — do the server tests typecheck today?

```
tsc -p $TMPDIR/probe-server-spec.json   (extends apps/server/tsconfig.json, include src/**/*, exclude [])
  → exit 0   (so tsconfig.spec.json adds no new failures)
```

Quick functional check (run in-session, both probes restored — `grep -c file_not_fuond` = 0, `git diff --stat` shows only the intended change):

```
sed 's/=== "file_not_found"/=== "file_not_fuond"/' in apps/web/src/app/vault/http-vault.repository.ts
pnpm --filter web typecheck →
  src/app/vault/http-vault.repository.ts:42:5 - error TS2367: This comparison appears to be
  unintentional because the types '"invalid_path" | "path_out_of_scope" | "file_not_found" |
  "not_found" | "internal_error" | "turn_in_flight" | undefined' and '"file_not_fuond"' have no overlap.
restored → ngc clean (exit 0)
```

Browser-safety guard probe (`packages/api/src/errors.ts`, line prepended, file restored from a `$TMPDIR` copy; `head -1` shows the original comment):

```
import "node:fs";
pnpm --filter @gtd/api typecheck → src/errors.ts(1,8): error TS2307: Cannot find module 'node:fs' or its corresponding type declarations.  exit 1
restored → clean (exit 0)
```

Install attempt (decision 7):

```
pnpm install --offline            → ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK: Failed to open the store operation lock … Read-only file system (os error 30)
same, sandbox bypass requested    → denied by the auto-mode permission gate
```

Owed outside the sandbox at the time of the first wrap-up: `pnpm install --frozen-lockfile` — settled by Codex's run below.

— session 2026-11-02 (Codex `/review quick` + guard probes; code state = final except the `index.ts` comment, which was changed afterwards)

```
Codex /review quick → "Verifiziert: alle Workspace-Typechecks; API 7, Server 86, Web 119 Tests grün.
                       Die isolierte Offline-Installation mit --frozen-lockfile --ignore-scripts bestätigt
                       außerdem das unveränderte Lockfile und sämtliche neuen Workspace-Verknüpfungen."
                       hotspots: 1 LOW (index.ts:3 comment, fixed — decision 12); no functional regression;
                       blind spot: repository-level test for an incomplete 404 body (declined — decision 13)
```

Guard probes (decision 12; `packages/api/src/index.ts` with `export { LocalFileRepository } from "@gtd/core";` appended, file restored from a `$TMPDIR` copy after each run, `dist` rebuilt from the restored source — `grep -c LocalFileRepository` is 0 in both `src/index.ts` and `dist/index.js`):

```
tsc -p packages/api/tsconfig.json --noEmit                      → exit 0   (Codex's claim confirmed; skipLibCheck: true from the base config)
tsc … --skipLibCheck false                                      → exit 2, errors only in node_modules/.pnpm/@ai-sdk+provider-utils…/dist/index.d.ts:
                                                                  TS2591 Cannot find name 'Buffer' · TS2304 'URL' · 'ReadableStream' · 'FormData' · 'AbortSignal'
rg 'node:' packages/core/dist --glob '*.d.ts'                   → 1 hit: a comment in sessions.d.ts (no import)
rg -l 'from "node:' packages/core/dist --glob '*.js'            → local-file-repository.js, history-log.js, … (runtime only)
pnpm --filter @gtd/api build (probe in dist) → pnpm --filter web build:
  ✘ [ERROR] Could not resolve "node:crypto"      ../../packages/core/dist/history-log.js:1:27
  ✘ [ERROR] Could not resolve "node:fs/promises" ../../packages/core/dist/history-log.js:2:34
  Application bundle generation failed.  exit 1
```

After the comment rewrite (final code state): `pnpm --filter @gtd/api build` clean, `prettier --check packages/api/src/index.ts` clean. The other suites were not repeated for a comment-only change; `dist/index.d.ts` carries no comment, so server and web see an identical contract.

### Acceptance Coverage
- **T3.2-AC-01:** passed — `packages/api/src/__tests__/errors.test.ts`, 7 tests: well-formed body → payload; every tuple code accepted; unknown code, text body, `ProgressEvent`-shaped object, `null`/`undefined`, missing `message`/`requestId` → `undefined`.
- **T3.2-AC-02:** passed — `error-handler.test.ts` "rejects a code outside API_ERROR_CODES at compile time" pins `new ApiError(409, "no_such_code", …)` with `@ts-expect-error`, verified by `tsc -p tsconfig.spec.json` inside `pnpm --filter @gtd/server typecheck` (decision 1); every error-handler test reads the response as `ErrorBody` from `@gtd/api`; server suite 86 green.
- **T3.2-AC-03:** passed — `http-vault.repository.test.ts` unchanged and green (web 119); `rg "ApiErrorBody|apiErrorCode|as ErrorBody" apps/web/src` finds nothing. The remaining `as HttpErrorResponse` casts in the spec narrow the thrown error object, not a body.
- **T3.2-AC-04:** passed — typecheck and test green for api, server, web, core, cli (counts above); web specs untouched (XC-03). In-sandbox runs were per package rather than one `pnpm -r` command (decision 7); Codex's review ran all workspace typechecks and the three affected suites outside the sandbox with the same result.

### Open Issues
- None. (The owed fresh-install check from the first wrap-up is settled by Codex's isolated `pnpm install --frozen-lockfile --ignore-scripts`, see Test Evidence.)

### Context for Next Task
- **Adding an error code:** append it to `API_ERROR_CODES` in `packages/api/src/errors.ts` in the same change as its throw site; `ApiError.code` (server) and `apiErrorOf(...)?.code` comparisons (web) are checked against the union, so a code used but not listed is a compile error on the server, and a code compared but not listed is TS2367 in the web. Task 6's `turn_in_flight` (409) is already in the tuple.
- **Adding a DTO:** one file per resource under `packages/api/src/` (`files.ts`, `daily-notes.ts` are the pattern), exported through `index.ts`. Rules: no `node:*`, no main `@gtd/core` barrel — only `@gtd/core/layout`; `pnpm --filter @gtd/api typecheck` enforces it (`types: []` + `noUncheckedSideEffectImports`). Tasks 7/8 put the session replay DTO and SSE event types here.
- **Import style:** the server imports the contract type-only (`import type … from "@gtd/api"`), so it never loads `packages/api/dist` at runtime; the web imports `apiErrorOf` as a value, so `ng build`/`ng test`/`ngc` need `pnpm --filter @gtd/api build` first (and `@gtd/core build` before that — api's `.d.ts` references `@gtd/core/layout`).
- **Server tests are typechecked now:** `pnpm --filter @gtd/server typecheck` runs `tsconfig.spec.json` over `src/**/*`; a type error in a new server test fails the typecheck, not just the test run.
- **Web consumers of `DailyNoteRef`** keep importing from `./vault.types` (re-export); `HttpVaultRepository` and `vault.types.ts` are the only web files that name `@gtd/api` so far.
- **Naming rule for `@gtd/api`:** no `Dto` suffix — the package path is the marker; HTTP bodies end in `Body`; a wire type the web reuses as its port model is re-exported from `vault.types.ts` under its own name. When a wire type and a core domain type of the same concept coexist (Task 7: session replay next to `Session`), name the wire type by what it is (`SessionReplay`, `SessionEvent`) — decision 14. The moment a port type and a wire type diverge, `vault.types.ts` gets an own type and the HTTP adapter maps; the mapper never lives in the types file — decision 15.
- **What the browser-safety guard does and does not prove:** `pnpm --filter @gtd/api typecheck` fails on a direct `node:*` import in api's own sources; it cannot see a value re-export of the main `@gtd/core` barrel because cross-package imports reach only `.d.ts` files and `skipLibCheck` is on. That rule is review; `ng build` is the backstop (decision 12).
- **Gotchas:** (1) The three `@gtd` symlinks and `packages/api/dist` exist only on this machine until `pnpm install` / `pnpm -r build` run; a fresh clone gets them from the lockfile. (2) Inside the sandbox, run package scripts with `--config.verify-deps-before-run=false`; `tsc` is not on PATH, use `pnpm exec tsc`. (3) `tsc` does not clean `dist` — a renamed api module leaves stale output behind, delete by name (3.1 gotcha 1).

### Git State
```
$ git diff --stat
 README.md                                       | 10 +++++++---
 apps/server/package.json                        |  3 ++-
 apps/server/src/__tests__/error-handler.test.ts |  8 +++++++-
 apps/server/src/middleware/error-handler.ts     |  7 ++-----
 apps/server/src/routes/daily-notes.ts           | 13 ++-----------
 apps/server/src/routes/files.ts                 |  5 +----
 apps/web/package.json                           |  1 +
 apps/web/src/app/vault/http-vault.repository.ts | 20 ++++----------------
 apps/web/src/app/vault/vault.types.ts           | 13 ++++---------
 pnpm-lock.yaml                                  | 19 +++++++++++++++++++
 10 files changed, 49 insertions(+), 50 deletions(-)
 (plus the untracked packages/api/ tree and apps/server/tsconfig.spec.json, which `git diff` does not show)

$ git status --short        (sandbox-projected shell dotfiles omitted; docs/tech-debt-backlog.md is pre-existing and untracked, not part of this task)
 M README.md
 M apps/server/package.json
 M apps/server/src/__tests__/error-handler.test.ts
 M apps/server/src/middleware/error-handler.ts
 M apps/server/src/routes/daily-notes.ts
 M apps/server/src/routes/files.ts
 M apps/web/package.json
 M apps/web/src/app/vault/http-vault.repository.ts
 M apps/web/src/app/vault/vault.types.ts
 M pnpm-lock.yaml
?? apps/server/tsconfig.spec.json
?? docs/work/phase-2a/task-log/task-3.2-shared-api-contract.md
?? packages/api/package.json
?? packages/api/src/__tests__/errors.test.ts
?? packages/api/src/daily-notes.ts
?? packages/api/src/errors.ts
?? packages/api/src/files.ts
?? packages/api/src/index.ts
?? packages/api/tsconfig.json
?? packages/api/vitest.config.ts
```

### Sessions
- claude-code 1eb3b295-5463-483b-9e1f-264fd6f3cdfe (2026-10-31) — transcript: ~/.claude/projects/-home-lutz-projects-keppt-app/1eb3b295-5463-483b-9e1f-264fd6f3cdfe.jsonl
- codex 01a19ce7-dbae-7862-9a9e-f96c99172229 (2026-11-02) — transcript: ~/.codex/sessions/2026/11/02/rollout-2026-11-02T16-36-43-01a19ce7-dbae-7862-9a9e-f96c99172229.jsonl
