### Task
Establish the Angular component-spec harness for the Web app: move the test setup from bare `vitest run` (node env, cannot compile Angular components) to the official `ng test` Vitest runner (`@angular/build:unit-test`, jsdom, zoneless), add `@testing-library/angular` (zoneless entry point), and ship `chat-screen.test.ts` as the template spec — DI-boundary stubs, real child tree, Testing Library DOM queries.

### Status
DONE

### Files Modified
- `apps/web/package.json` (modified) — `test` script `vitest run` → `ng test --watch=false` (explicit non-watch so `pnpm -r test` never hangs in a TTY); `vitest` `^1.4.0` → `^4.1.10` (the builder's peer range is `^4.0.8`); added `@testing-library/angular@^19.4.1` (Angular ≥21 peers), `@testing-library/dom@^10.4.1` (ATL peer), `@testing-library/user-event@^14.6.1`, `jsdom@^29.1.1` (the builder requires jsdom or happy-dom explicitly installed).
- `pnpm-lock.yaml` (modified) — lockfile fallout of the dev-dependency changes (+65 packages, web-scoped).
- `apps/web/angular.json` (modified) — new `test` architect target: `@angular/build:unit-test` with `runner: "vitest"`, `tsConfig: "tsconfig.spec.json"`, `include: ["src/**/*.test.ts"]` (repo naming convention, scoped to `src/`).
- `apps/web/tsconfig.spec.json` (new) — spec compilation unit extending `tsconfig.json`; includes `src/**/*.test.ts`, `src/**/*.d.ts`, `src/testing/**/*.ts`; `types: []` keeps explicit vitest imports enforced in the IDE (the builder enables runtime `globals: true` regardless).
- `apps/web/vitest.config.ts` (deleted) — superseded by the builder (default `runnerConfig: false` loads no external config; the builder warns on and deletes `test.include` from custom configs anyway).
- `apps/web/src/testing/transloco-testing.ts` (new) — `provideTranslocoTesting()`: `importProvidersFrom(TranslocoTestingModule.forRoot(...))` with the REAL `de.json`/`en.json` catalogs (JSON imports), `defaultLang/fallbackLang: de`, `preloadLangs: true`. Specs assert translated German strings — a missing catalog key fails the test instead of rendering a raw key.
- `apps/web/src/testing/override-component-services.ts` (new) — `overrideComponentServices(component, [[token, stub], …])`: builds the ATL `configureTestBed` callback that registers the standalone SUT in the TestBed scope and applies `TestBed.overrideProvider` per token. Encapsulates the non-obvious mechanics (see Key Decisions) so future specs never hand-wire TestBed.
- `apps/web/src/app/chat/chat-screen.test.ts` (new) — the template spec (5 tests): ATL `render` from `@testing-library/angular/zoneless`, full real child tree (session header, message list, markdown, quick replies, composer), `StubChatService`/`StubVoiceCaptureService` classes extending the abstract contracts with writable `signal()` fields + `vi.fn()` methods. Covers: translated empty state, user message + Markdown `<strong>` through the real pipeline, draft→send→`sendMessage()` at the DI boundary, quick-reply→`chooseQuickReply()`, busy→Stop(✕) composer swap + `cancel()` (closes a deferred Task-3 DOM check).
- `apps/web/src/app/chat/chat-message-groups.test.ts` (modified) — the new builder type-checks specs for the first time; fixed `noUncheckedIndexedAccess` violations via `?.` access (2 sites; user-requested over `!` — honest types, clean `expected undefined to be …` diff instead of a TypeError crash).
- `apps/web/src/app/mock/mock-chat.service.test.ts` (modified) — same `?.` fixes (4 sites; two of them had no preceding `toHaveLength` guard, so the failure-quality argument is real there).
- `apps/web/src/app/chat/chat-tool-registry.test.ts` (modified) — `tool()` factory gained the required `createdAt`; it could previously produce incomplete `AssistantToolMessage` objects (genuine type hole surfaced by the new type-checking).

### Files Read (Context Only)
- `docs/work/keppt-ui/plan.md` — preamble + Task 3.5 block only (per `/start-task` isolation).
- `docs/work/keppt-ui/task-log/task-3.4-*.md` (predecessor: Transloco-under-test constraint, toolchain), `task-3-*.md` (candidate components, component-level provider wiring, deferred DOM checks), `task-1-*.md`/`task-2.5-*.md` (targeted greps: vitest config origin, `provideMarkdown()` app-wide).
- `apps/web/node_modules/@angular/build/src/builders/unit-test/` — `schema.json` (options, defaults: include covers `*.test.ts`, watch TTY-dependent), `runners/vitest/plugins.js` (`globals: true`, happy-dom preferred over jsdom when installed, custom-config `include` stripped), `runners/vitest/index.js` (jsdom/happy-dom install check), `build-options.js` (auto-generated TestBed init; zoneless when no zone.js polyfill).
- `apps/web/node_modules/@testing-library/angular/` — zoneless + main + vitest-utils `.d.ts` and fesm sources: zoneless `render` API surface (no `componentProviders`/`imports` for components), main entry's `componentProviders` implementation (`overrideProvider` + SUT auto-import), `createMock` mechanics (prototype methods only).
- `apps/web/node_modules/@jsverse/transloco/lib/transloco-testing.module.d.ts` — `TranslocoTestingModule.forRoot` options.
- `apps/web/src/app/chat/chat-screen.ts`/`.html`, `components/chat-input.html`, `components/chat-message-list.ts`, `components/quick-replies.html`, `chat.service.ts`, `chat.types.ts`, `chat.store.ts` (grep), `apps/web/public/i18n/de.json` — assertion targets and DI shape.
- `apps/web/tsconfig.json`, `tsconfig.app.json`, root `tsconfig.base.json` — strictness flags (`noUncheckedIndexedAccess`), `resolveJsonModule`/`esModuleInterop` already inherited.

### Key Decisions
- **The load-bearing discovery — component-level providers vs. test stubs.** `ChatScreenComponent` provides `ChatService`/`VoiceCaptureService` itself (`useClass` → mock impls), so plain `render(..., { providers })` is shadowed. `TestBed.overrideProvider` replaces a token at every level *but only for components registered in the TestBed scope* — and ATL's zoneless entry, unlike the main entry, does NOT auto-register the standalone SUT. Symptom: the spec silently rendered against the real `MockChatService` (greeting seed visible, stubs never called). Fix: `overrideComponentServices` registers the SUT (`configureTestingModule({ imports: [sut] })`) and then applies the overrides. Rejected alternatives: ATL main entry's `componentProviders` (plan mandates the zoneless entry), the untyped `renderOptions.imports` runtime pathway (typing gap, cast needed), moving the mock wiring from the component to `app.config.ts` (product change — service lifetime semantics belong to Task 4's navigation work, not a test task).
- **Stub classes instead of ATL `provideMock`.** `createMock` walks the prototype for function-valued properties — an abstract class contributes neither abstract methods nor signal-valued instance fields, so `provideMock(ChatService)` yields an empty object. `StubChatService extends ChatService` with writable `signal()` fields + `vi.fn()` methods is typed by the compiler against the contract, and the concrete `busy` computed on the base class works for real — `chat.status.set("thinking")` genuinely drives the busy→stop test through the production signal graph.
- **Assert translated German strings, not keys** (user-approved in briefing): that is what the user sees, and it makes catalog completeness a test concern for free. Real catalogs are loaded statically via `TranslocoTestingModule` (`preloadLangs`); the app's HTTP loader cannot run under test.
- **Fix legacy tests for `noUncheckedIndexedAccess` instead of loosening `tsconfig.spec.json`.** The builder type-checks specs (the old `vitest run` never did; `ngc` excludes tests) — 11 errors surfaced in 3 files. Keeping one strictness standard across app and spec code beats a divergent spec config. Initially fixed with `!` after length asserts; reworked to `?.` on user feedback: `!` lies to the type checker and turns a genuinely missing element into a `TypeError` crash, `?.` fails as a readable assertion diff — decisive at the two sites without a preceding `toHaveLength` guard.
- **jsdom, not happy-dom.** More spec-compliant; vitest's jsdom runs with `pretendToBeVisual`, providing the `requestAnimationFrame` the message list's scroll anchoring uses. Note: the builder auto-prefers happy-dom *if it is ever installed* — do not add happy-dom casually.
- **`ng test --watch=false` in the script.** The builder defaults to watch in TTYs; the explicit flag keeps `pnpm -r test` single-run everywhere. Direct `ng test` still gives developers watch mode.
- **Zoneless CD needs no manual pumping in specs.** After `signal.set(...)` outside Angular, `findByRole`/`findByText` (polling) pick up the scheduled render; no `fixture.detectChanges()` calls anywhere in the spec.

### Review Focus
Compact map for human review. Do not repeat the diff.

- **Behavior claims:** (1) `pnpm -r test` runs core 273 + web 54 + cli 45 in one invocation; the web suite now executes under `ng test` (vitest 4, jsdom, zoneless) and compiles standalone components with external `templateUrl`/`.scss`. (2) `chat-screen.test.ts` renders the full real child tree — Transloco pipes resolve German strings from the real catalogs, `ngx-markdown` renders `**…**` to `<strong>` — with `ChatService`/`VoiceCaptureService` stubbed purely via DI; `sendMessage`/`chooseQuickReply`/`cancel` interactions are asserted on the stubs. (3) Setting the stub's `status` signal to `"thinking"` flips the composer to the Stop(✕) button through the production `busy` computed — the first DOM-level verification of the Task-3 cancel affordance.
- **Assumptions / choices:** specs assert German strings (de = default lang) rather than keys; spec naming stays `*.test.ts` (builder `include` scoped to `src/**/*.test.ts`); the one TestBed touch lives inside `overrideComponentServices` because ATL's zoneless entry lacks `componentProviders` — treated as compatible with T3.5-AC-02's "no hand-written TestBed boilerplate" since specs only compose ATL options.
- **Scope notes:** 3 pre-existing test files were touched (14 lines) solely to satisfy the builder's new type-checking (`?.` index access, one `createdAt` in a factory) — assertions and structure unchanged. The vitest 4 major bump is web-only; root/core/cli stay on vitest 1.4 (pnpm per-package resolution isolates this). Production bundle unchanged (393 kB) — all additions are dev-only.
- **Read next:** `apps/web/src/app/chat/chat-screen.test.ts` — the pattern future specs copy; `apps/web/src/testing/override-component-services.ts` — the TestBed-scope mechanics and their doc comment; `apps/web/angular.json` — the `test` target options.

### Test Evidence
- `fnm exec --using=22.22 corepack pnpm@10 -r test` — one invocation, all green:

```text
packages/core test:  Test Files  15 passed (15) / Tests  273 passed (273)
apps/web test:       Test Files   7 passed (7)  / Tests   54 passed (54)
apps/cli test:       Test Files  10 passed (10) / Tests   45 passed (45)
```

  Web breakdown: the 6 pre-existing files (49 tests) + `chat-screen.test.ts` (5 tests), ~4.7 s wall clock under jsdom.
- `fnm exec --using=22.22 corepack pnpm@10 -r typecheck` — clean (ngc for web).
- `fnm exec --using=22.22 corepack pnpm@10 --dir apps/web build` — production build clean, initial bundle unchanged at 393.44 kB raw / 103.56 kB transfer.
- Failure-driven verification of the DI boundary: the first spec run failed with the real `MockChatService` greeting visible in the DOM dump (subtitle `Heute · Mittwoch, 6. Mai` = non-empty store) — proving test-level providers were shadowed; after `overrideComponentServices`, the same assertions pass against the stubs. The busy→stop test additionally proves signal-driven zoneless CD works under the runner without manual `detectChanges`.
- Scans: `rg 'chat-mock-data|mock-chat\.service|mock-voice-capture|TestBed' apps/web/src/app/chat/chat-screen.test.ts` → only the `configureTestBed:` option name matches (no mock-data/mock-service imports, no TestBed API in the spec).

### Acceptance Coverage
- T3.5-AC-01: passed — `chat-screen.test.ts` renders `ChatScreenComponent` (external `templateUrl` + `.scss`) under `ng test` with the builder's jsdom environment; green in `pnpm --dir apps/web test`.
- T3.5-AC-02: passed — the spec imports `render`/`screen` from `@testing-library/angular/zoneless` and asserts via `getByRole`/`getByText`/`findByRole`; all children render for real (header, list, markdown, quick replies, composer — no component mocks, no `importOverrides`). The single TestBed interaction is encapsulated in the shared `overrideComponentServices` helper (documented deviation: the zoneless entry has no `componentProviders` option).
- T3.5-AC-03: passed — `ChatService`/`VoiceCaptureService` are stubbed through Angular DI (`TestBed.overrideProvider` via the helper); the spec imports nothing from `apps/web/src/app/mock/` (scan-verified). ATL's `provideMock` was evaluated and rejected — it cannot mock abstract-class contracts with signal fields (see Key Decisions).
- T3.5-AC-04: passed — the 6 pre-existing test files remain plain Vitest with no new Angular imports (changes limited to `?.` index access + one factory `createdAt`, forced by the builder's type-checking); all 49 tests green under the new runner.
- T3.5-AC-05: passed — root `pnpm -r test` runs core, cli, and the new web `ng test` suite (49 + 5 tests) in one invocation (output above).

### Open Issues
- ATL's zoneless entry lacks `componentProviders`/`imports` in its typed render options (the main entry has both) — `overrideComponentServices` compensates. Re-check on ATL upgrades; if the zoneless entry gains `componentProviders`, the helper can be retired.
- The remaining deferred Task-3 DOM checks are now cheaply writable with this harness but not yet written: mic-overlay states (recording/transcribing/error), focus-return to the composer, draft preservation after cancel (→ natural fits alongside Task 4–6 component work).
- Root `package.json` still pins `vitest ^1.4.0` for packages/core and apps/cli while web is on v4 — works via per-package resolution; unify in a separate chore when core/cli are ready for the major.
- No `packageManager` pin in root `package.json` (carried from Task 3.4); all commands still need `fnm exec --using=22.22 corepack pnpm@10 …`.
- pnpm 10 "Ignored build scripts" warning (esbuild, lmdb, …) — postinstall scripts are blocked by default; no observed impact (esbuild ships platform binaries as optional deps). Run `pnpm approve-builds` only if a tool actually misbehaves.

### Context for Next Task
- **Recipe for a new component spec** (copy from `chat-screen.test.ts`):
  1. `import { render, screen } from "@testing-library/angular/zoneless";` — never the main entry, never `TestBed` directly.
  2. `providers: [provideMarkdown(), provideTranslocoTesting()]` — Transloco is needed by any template using the `transloco` pipe / `translateSignal` (that is: all chat chrome since Task 3.4); `provideMarkdown()` whenever the rendered tree reaches an assistant content message.
  3. Services the SUT provides *itself* (screen-level components): stub via `configureTestBed: overrideComponentServices(Sut, [[Token, stub]])`. Components without own providers: plain `providers` suffice.
  4. Stub pattern: `class Stub extends AbstractService { readonly x = signal(...); method = vi.fn(...); }` — writable signals for state, `vi.fn()` for interaction assertions; inherited computeds (like `busy`) then work for real.
  5. Assert German strings (de is the default lang) and roles/accessible names; after mutating a stub signal, use `findBy*` (polls) — zoneless CD flushes on its own, no `detectChanges()`.
- **`ng test` builder facts:** specs are type-checked (base-config strictness incl. `noUncheckedIndexedAccess` now applies to test code — prefer `?.` + assertion over `!`); runtime `globals: true` is forced by the builder but the convention stays explicit `from "vitest"` imports (`tsconfig.spec.json` has `types: []` to enforce it in the IDE); `vi.mock` module mocking does NOT work under the builder (angular/angular-cli#31609) — always mock at the DI level; test naming stays `*.test.ts` (`include` is `src/**/*.test.ts`); `--watch=false` is in the script, plain `ng test` gives watch mode.
- **Environment:** jsdom (with rAF via pretendToBeVisual — the message list's scroll anchoring runs, scroll positions are no-ops). The builder silently prefers happy-dom if it ever appears in node_modules — don't install it without intent.
- Web is on vitest 4 (`toHaveBeenCalledExactlyOnceWith` etc. available); packages/core and apps/cli remain on vitest 1.4 — don't copy v4-only matchers into those suites.
- `apps/web/src/testing/` is the home for shared spec utilities (`transloco-testing.ts`, `override-component-services.ts`); it is included in `tsconfig.spec.json`, not in the app build.
- Toolchain unchanged: `fnm exec --using=22.22 corepack pnpm@10 …` for every package command.

### Git State

`git diff --stat` (tracked changes):

```text
 apps/web/angular.json                             |   8 +
 apps/web/package.json                             |   8 +-
 apps/web/src/app/chat/chat-message-groups.test.ts |   6 +-
 apps/web/src/app/chat/chat-tool-registry.test.ts  |   1 +
 apps/web/src/app/mock/mock-chat.service.test.ts   |   8 +-
 apps/web/vitest.config.ts                         |   8 -
 pnpm-lock.yaml                                    | 618 +++++++++++++++++++++-
 7 files changed, 632 insertions(+), 25 deletions(-)
```

`git status --short` (project files only): the 6 modified files plus deleted `apps/web/vitest.config.ts` above, and **untracked** `apps/web/src/app/chat/chat-screen.test.ts`, `apps/web/src/testing/` (two files), `apps/web/tsconfig.spec.json` — `/commit 3.5` must stage these four new paths as well. The untracked home-directory/env entries (`.bashrc`, `.claude/`, `.mcp.json`, …) must NOT be staged.
