### Task
Add a metric-free, registry-backed Drawer and six read-only vault screens over a cache-free Promise repository, including honest Resource states, a minimal Daily date index with client-localized date chrome, app-level provider hoisting, and the `nextContext` mock chat flow.

### Status
DONE

### Files Modified
- `apps/web/src/app/i18n/local-date.ts` (new) — shared date-only presentation boundary: `IsoLocalDate`, injectable `APP_TODAY`, and timezone-stable `Intl.DateTimeFormat` labels keyed by the active Transloco language.
- `apps/web/src/app/i18n/local-date.test.ts` (new) — pins German/English weekday, compact, and full labels plus date-only stability at a year boundary.
- `apps/web/src/app/vault/vault.types.ts` (new) — `VAULT_TASK_FILES`, vault path types, `dailyFilePath()`, and the minimal `DailyNoteRef { date, isToday }`; transport data contains no localized labels, summary, or count.
- `apps/web/src/app/vault/vault.repository.ts` (new) — the sole framework-neutral vault boundary: `readFile(file): Promise<string | null>` and `listDailyNotes(): Promise<readonly DailyNoteRef[]>`; the Daily index exposes only ISO dates plus `isToday`.
- `apps/web/src/app/vault/vault-markdown.ts` (new) — pure, framework-agnostic sanitizer-safe Markdown rendering: the typed `taskCheckboxExtension.renderer.checkbox` hook consumes marked checkbox tokens and emits styleable, state-bearing `<span class="task-checkbox">` elements directly, without matching or rewriting serialized marked HTML.
- `apps/web/src/app/vault/vault-markdown.test.ts` (new) — renders through the real installed marked to pin open/done token rendering, generated ARIA state, absence of generated `<input>` elements, and the fact that unrelated raw HTML remains untouched at the parser layer.
- `apps/web/src/app/vault/vault-page-header.ts` / `.html` / `.scss` (new) — shared vault-screen chrome: hamburger (or back on Daily detail) + centered monogram row, then uppercase subtitle over the serif title; title/subtitle accept resolved Transloco or client-formatted date strings.
- `apps/web/src/app/vault/vault-file-screen.ts` / `.html` / `.scss` (new) — one routed component for all five task-file screens; owns a local file Resource and renders explicit loading, error/retry, missing, empty-file, and Markdown states.
- `apps/web/src/app/vault/vault-file-screen.test.ts` (new) — preserves translated chrome/Markdown/sanitizer/navigation coverage, proves open checkbox role/state and native-input removal through the real Angular sanitizer pipeline, and adds deferred loading, failure/retry, missing, empty, and delayed-success cases.
- `apps/web/src/app/vault/daily-notes-screen.ts` / `.html` / `.scss` (new) — owns the minimal Daily-index Resource, projects ISO dates to active-locale labels, renders the Transloco-owned Today badge, and renders no guessed summary.
- `apps/web/src/app/vault/daily-note-detail-screen.ts` / `.html` / `.scss` (new) — derives header labels directly from the route ISO date and active locale, owns only the selected file Resource, and performs no Daily-index read.
- `apps/web/src/app/vault/daily-notes.test.ts` (new) — covers honest list/detail states, Markdown and navigation behavior, locale switching without repository refetch, summary removal, checkbox sanitization, and the detail's file-only read path.
- `apps/web/src/app/navigation/screen-registry.ts` (new) — typed runtime `SCREEN_REGISTRY`: owns screen IDs, route patterns, vault files, i18n prefixes, and screen-specific ask flows; derives `AppScreen`, `NavigableScreen`, and `VaultScreen`, exposes runtime guards/URL construction, and declares ID-only `VAULT_SCREEN_ORDER` for UI order.
- `apps/web/src/app/navigation/screen-registry.test.ts` (new) — pins ordered vault metadata, own-key runtime validation (`Object.hasOwn`), navigable/detail discrimination, concrete URL construction, and explicit failure for erased invalid values.
- `apps/web/src/app/navigation/navigation.service.ts` (new) — `providedIn: "root"`; owns drawer visibility/current screen and async `go()`/`openDailyNote()`/`askInChat()` operations while consuming registry URL/guard helpers. Angular Router is the sole screen source: only `NavigationEnd` projects validated activated route data into `currentScreen`; same-target navigation counts as success, invalid targets fail explicitly, and cancelled navigation suppresses a chained chat message. After successful navigation, ask-in-chat resolves its static prompt from the active Transloco catalog at send time.
- `apps/web/src/app/navigation/navigation.service.test.ts` (new) — real-Router coverage plus deferred valid/unknown/rejected Daily-index navigation; pins non-optimistic screen state and `NavigationError` across the direct repository Promise boundary, as well as German and runtime-switched English ask prompts from the real catalogs.
- `apps/web/src/app/navigation/app-drawer.ts` / `.html` / `.scss` (new) — metric-free, registry-derived navigation overlay; formats its injected current date in the active locale while remaining independent of `VaultRepository` and Angular Resources.
- `apps/web/src/app/navigation/app-drawer.test.ts` (new) — pins eight plain-label rows/actions, registry order, routing/close behavior, zero repository dependency, and in-place German→English date reformatting.
- `apps/web/src/app/mock/mock-vault-data.ts` (new) — the seeded vault in the real storage format plus a four-entry `mockDailyIndex` containing only `{ date, isToday }`; no translated labels, summaries, or derived counts are seeded.
- `apps/web/src/app/mock/mock-app-context.ts` (new) — deterministic local date anchor shared by the May-2026 reference mock and the injected mock app clock.
- `apps/web/src/app/mock/mock-vault.repository.ts` (new) — deterministic asynchronous mock over the canonical seed; contains no Signals/cache identity, returns `null` for unknown files, and preserves seeded `""`.
- `apps/web/src/app/mock/mock-vault.repository.test.ts` (new) — pins seed readability, Daily order and exact minimal `{ date, isToday }` shape, unknown-null, and existing-empty semantics.
- `apps/web/src/app/app.config.ts` (modified) — composes the typed checkbox renderer, app-level mock service/repository wiring, and deterministic `APP_TODAY → MOCK_TODAY` without a global vault cache.
- `apps/web/src/app/app.routes.ts` (modified) — registry projection plus async `knownDailyDate`; the guard awaits `VaultRepository.listDailyNotes()` directly, redirects only after a resolved absence, and lets transport/auth failure reject navigation.
- `apps/web/src/app/app.routes.test.ts` (new) — verifies a one-to-one registry→route projection independent of object order and checks every vault route's component/file/i18n/optional-ask input data.
- `apps/web/src/app/app.ts` (modified) — root template is now `<router-outlet /><keppt-app-drawer />`; the drawer lives once at the root as an overlay over whatever screen is routed.
- `apps/web/src/app/chat/chat-screen.ts` (modified) — providers array removed (hoisted); injects `NavigationService`; `openDrawer()` handler.
- `apps/web/src/app/chat/chat-screen.html` (modified) — wires `(menuPressed)="openDrawer()"` on the session header.
- `apps/web/src/app/chat/components/session-header.ts` / `.html` (modified) — wires the Drawer menu output and builds the non-empty subtitle from Transloco relative copy plus a client-formatted, locale-reactive injected date.
- `apps/web/src/app/chat/chat-screen.test.ts` (modified) — covers post-hoist providers, Drawer opening, deterministic dynamic session date, and German→English subtitle reformatting.
- `apps/web/src/app/chat/chat.service.ts` (modified) — navigation state/actions removed; the boundary now contains only chat messages, lifecycle state, sending/quick replies, and cancellation.
- `apps/web/src/app/chat/chat.store.ts` (modified) — removed the unused `currentScreen` and `navigate()` pass-throughs so the store stays focused on chat/composer/mic UI state.
- `apps/web/src/app/chat/chat.types.ts` (modified) — removed `AppScreen`; the type now derives from `navigation/screen-registry.ts`.
- `apps/web/src/testing/override-component-services.ts` (deleted) — obsolete: it existed solely because `ChatScreenComponent` self-provided its services; after the hoist nothing does. (Different retirement path than the 3.5 open issue anticipated.)
- `apps/web/src/app/mock/chat-mock-data.ts` (modified) — new `nextContext` flow and turn script (read next-actions + today's daily → energy/time-fit prose over the real seed rows → chips mapping to existing flows: `Ja, Anna zuerst`/`Tag planen`/`Später`). `routePatterns` recognize both catalog languages for Today/Next Context and the actual German `warte` form; `nextContext` stays before `today` so "Was passt heute zu mir?" is not swallowed. The React mock only had the generic acknowledge fallback here.
- `apps/web/src/app/mock/mock-chat.service.ts` (modified) — `routeUserText` checks `nextContext` after `planning`, before `today`; obsolete mock-owned navigation signal/method removed with the chat-contract cleanup.
- `apps/web/src/app/mock/mock-chat.service.test.ts` (modified) — routing case for "Was passt heute zu mir?" → nextContext marker + chip plus catalog-driven routing coverage for all four ask prompts in German and English; obsolete ChatService navigation-state test removed.
- `apps/web/src/testing/vault-testing.ts` (new) — reusable deferred helper and scriptable Promise repository for Resource component tests.
- `apps/web/public/i18n/de.json` / `en.json` (modified) — Task-4 chrome, states, and static ask-in-chat prompts; the three Vault prompts sit beside their screen hints and the Today prompt beside the Drawer action. Session subtitles interpolate a client-formatted date, Today remains translated copy, obsolete Drawer date copy is absent, and Inbox subtitles contain no static count.
- `apps/web/src/testing/transloco-testing.ts` (modified) — mirrors production `reRenderOnLangChange` so template pipes and Signals both update in language-switch specs.
- `apps/web/src/styles.scss` (modified) — global sanitized Markdown styles plus shared compact `.vault-state`/retry treatment.
- `.nvmrc`, `package.json`, `apps/web/package.json`, `pnpm-lock.yaml` (modified) — Node floor 22.22.3; Angular 22, TypeScript 6.0, ngx-markdown 22, Lucide 1.23, and the Angular-22 Vitest bootstrap's direct `zone.js` dev dependency.
- `apps/web/angular.json`, `apps/web/tsconfig.app.json`, `apps/web/tsconfig.spec.json` (modified) — zoneless `polyfills: []` plus official Angular-22 migration diagnostics settings.
- `docs/specs/angular-chat-ui.md` (modified) — records the minimal Daily transport contract, client-owned Intl/Transloco date presentation, detail file-only ownership, count-free Inbox, plus the existing navigation/Resource/Markdown decisions.
- `docs/specs/architecture.md` (modified) — clarifies Angular HTTP repository → Express API → server `FileRepository` → Local/Supabase ownership.
- `docs/work/keppt-ui/plan.md` (modified) — adds the approved Task-4 date/localization amendment and updates Task 3/3.4/4 instructions and acceptance criteria to match the implemented contract.

### Files Read (Context Only)
- `docs/work/keppt-ui/task-log/task-3.5-*.md` (predecessor: ATL recipe, hoist deferral, toolchain), `task-3-*.md` (ChatService contract, mock flow invariants), `task-3.4-*.md` (i18n convention), `task-2-*.md` (abstract-class-as-DI-token pattern).
- `packages/core/src/gtd-layout.ts`, `packages/core/src/system-prompt.ts` (R10/R20/R21 sections via grep) — the real vault model the seed mirrors.
- `/home/lutz/projects/keppt/keppt-landing/src/components/mock/strings.tsx` (seed rows lines 322–427, drawer/header strings), `screens.tsx` (Drawer/PageHeader/ScreenList/Daily rendering), `MockDevice.tsx` (handleNavigate/ask-in-chat wiring).
- `apps/web/node_modules/ngx-markdown/fesm2022/ngx-markdown.mjs` + `types/ngx-markdown.d.ts` — sanitization default (`SecurityContext.HTML`), `MARKED_EXTENSIONS` provider shape, `marked.use` wiring.
- `apps/web/node_modules/@testing-library/angular/types/testing-library-angular-zoneless.d.ts` — zoneless render options: no `inputs`, native `bindings` API instead.
- `apps/web/node_modules/@angular/router/fesm2022/_router-chunk.mjs` — verified Angular 21's same-URL navigation emits `NavigationSkipped` and resolves the navigation promise with `false`.
- Angular 22 `@angular/core` Resource declarations and `@angular/build` Vitest bootstrap — verified the stable Resource API/statuses and why zoneless tests still require `zone.js/testing` to be resolvable at build time.
- Installed `marked@18.0.4` declarations/renderer source and Angular 22.0.6 HTML-sanitizer allowlist — verified the public `renderer.checkbox` token hook, marked's trailing-space contract, native-input removal, and preservation of `span`/`class`/`role`/`aria-checked`/`aria-disabled`.
- `apps/web/src/app/chat/components/chat-input.ts`, `chat-message-list.ts`, `apps/web/src/app/chat/chat-screen.scss`, `chat-message-list.scss` — read-only chat conventions and layout tokens.

### Key Decisions
- **Checkbox rendering: marked postprocess spans instead of disabling sanitization.** ngx-markdown pipes output through Angular's HTML sanitizer (`SecurityContext.HTML` default), and Angular's allowlist has no `<input>` — raw GFM task checkboxes would be silently stripped. Rejected `sanitize: SecurityContext.NONE` (future real vault content is user-authored; keeping sanitization is a security posture, not a style choice). Instead `taskCheckboxExtension` (a `hooks.postprocess`) rewrites marked's exact checkbox markup into `<span class="task-checkbox [--done]">`s, which survive sanitization (span + class are allowlisted) and style better than native inputs anyway. State is carried by class only — Angular's sanitizer also strips `aria-*`/`role`, so SR users get the row text without open/done state (accepted for the read-only view; noted in Open Issues).
- **One `VaultFileScreenComponent` for five screens, parameterized by route data.** The screens differ only in file, i18n prefix, and ask flow; `withComponentInputBinding` binds route data straight to inputs. Alternative (five thin components) rejected as pure boilerplate.
- **Navigation does both seams, with a router→service sync for the rest.** `go()` calls `ChatService.navigate` (the AC's literal requirement, and the contract's screen record) and `Router.navigateByUrl`. Browser back/forward/deep links bypass `go()`, so a `NavigationEnd` subscription maps `route.data.screen` → `chat.navigate` — one central sync instead of every screen reporting itself. Duplicate `navigate` calls on drawer selections are harmless signal re-sets.
- **Historical — superseded 2026-07-14: ask phrases treated as dynamic conversation content.** The original implementation kept the four ask-in-chat questions as German constants in `NavigationService`, borrowing T3.4-AC-05 even though these prompts are authored by the client rather than returned dynamically by the backend.
- **Static ask prompts are localized app copy.** The three Vault phrases live beside their corresponding `hint` keys (`vault.inbox.ask`, `vault.next.ask`, `vault.waiting.ask`); Today lives with the Drawer action (`drawer.ask.today`). `NavigationService` resolves the active language only after successful navigation, immediately before `sendMessage`, so runtime language changes affect the user bubble. Catalog-driven mock tests keep every German and English prompt routable. The chat busy guard still makes an in-flight send a no-op.
- **Provider hoist retired `overrideComponentServices`.** With app-level service/store providers, plain ATL `providers` bind stubs directly; the helper (which existed only to defeat component-level providers) was deleted rather than kept as dead code. The interim `VaultService` binding described in this original decision was later superseded twice; the final cache-free repository decision is recorded in the cache-removal session below.
- **Drawer stays mounted; visibility is class/inert-driven.** Needed for the 280ms slide transition (an `@if` would skip it). Consequences handled explicitly: `[attr.inert]` while closed (out of tab order/a11y tree), Escape handler guards on `drawerOpen()` (unlike the mic overlay, which only exists while open), focus moves to the container on open via an `effect` (cheap-pass parity with the mic overlay; no focus trap — deferred like there).
- **Historical — superseded by the metric-free drawer decision below: counts were derived in the drawer via a pure helper.** `countOpenCheckboxes` was a strict line regex (`- [ ]` bullets only, done boxes and mid-line occurrences didn't count), node-tested. The original synchronous source, the later global-store source, and the drawer-local Resource source have all been removed from the current contract.
- **Daily seed choices.** Past-day plan items that the day's log confirms as closed are seeded `- [x]` (R10 semantics: plan checkbox state mirrors how the day ended) — also exercises done-state rendering. Sunday keeps an empty `## Plan` heading (core R10's "add the three sections for structural consistency"); Notizen is omitted where empty per the plan block. The plan block's `## Notizen` is followed even though core's R10 names the section "Notes" — flagged as plan↔core drift, not resolved here.
- **`navigation.service.test.ts` uses TestBed directly — deliberate.** The 3.5 "no hand-written TestBed" rule targets component specs; this is a service spec whose subject IS the router seam, so it runs the real `Router` against the real route table (components are never instantiated — no outlet is rendered). ATL has no service-level entry point.
- **ATL zoneless typing gap continued:** the zoneless entry has no `inputs` render option (same family as the missing `componentProviders` noted in 3.5); specs use the native `bindings: [inputBinding(...)]` API instead.
- **Historical — superseded by the metric-free drawer decision below: accessible-name concatenation.** Count-bearing drawer rows computed names such as `"Inbox4"`; current rows have plain translated-label names and tests can match them exactly.
- **Route guard over in-component redirect for `/daily/:date`.** The route remains guarded rather than redirecting from an effect. The initial synchronous check and the later request-sharing store contract are both superseded by the direct `VaultRepository.listDailyNotes()` guard recorded in the cache-removal session below.
- **Taglines split into separate spans** — a single span with `<br>` made `getByText("Capture everything.")` unmatchable (text broken across one element); two spans render identically and test cleanly.

— session 2026-07-13

- **Router is the sole navigation source of truth.** This supersedes the earlier "both seams" decision: `go()` and `openDailyNote()` no longer pre-write a screen, and only `NavigationEnd` projects the successfully activated leaf route's `data.screen` into `NavigationService.currentScreen`. Failed, cancelled, and redirected navigation therefore cannot leave optimistic screen state behind; direct URLs and browser history still converge through the same path.
- **Navigation left the chat boundary completely.** `currentScreen` and `navigate()` were removed from `ChatService`, `MockChatService`, and `ChatStore`; the unused store proxies disappeared, `AppScreen` moved from `chat.types.ts` to `navigation/navigation.types.ts`, and the drawer reads active state from `NavigationService`.
- **Ask-in-chat is ordered behind routing.** `askInChat()` awaits `go("chat")` before sending and returns without sending on a real `false` result. Because Angular 21 also returns `false` for ignored same-URL navigation, `go()` explicitly treats an exact already-active target as success; this preserves "Heute fragen" while already on chat. The send promise is awaited so callers observe the whole operation and failures are not silently detached.

— session 2026-07-13

- **One typed runtime registry owns screen metadata.** `SCREEN_REGISTRY` is the single definition point for IDs, Angular route patterns, vault files, i18n prefixes, and screen-specific ask flows. `NavigationService`, `app.routes.ts`, and `AppDrawerComponent` consume it instead of maintaining parallel maps; dynamic daily-detail URLs remain date-specific operations because the registry holds the route pattern, not a concrete date.
- **Screen types and runtime guards derive from registry categories.** `AppScreen` derives from registry keys, while `NavigableScreen`/`VaultScreen` derive from each entry's `kind`. `isAppScreen` uses own-key validation for untrusted route data and `screenUrl` rejects invalid or detail-only targets before invoking Angular Router.
- **`VAULT_SCREEN_ORDER` repeats IDs only for intentional UI order.** It contains no metadata; routes and drawer rows use those IDs to look definitions up in the registry. Route-contract and drawer tests pin completeness, input projection, and display order.
- **Angular integration stays outside the registry.** Typed `screenRoute`/`vaultRoute` helpers correlate registry paths with `data.screen` and vault inputs, but component classes and `knownDailyDate` remain local to `app.routes.ts` to keep framework objects out of the domain registry.

— session 2026-07-13 (async vault reads; historical, superseded below)

- **The Promise repository + Angular Resource store supersedes the synchronous `VaultService`.** `VaultRepository` is framework-neutral and transport-shaped; `VaultStore` alone owns Resource lifecycle, stable identity, cache, and UI retry state. A future browser adapter calls Express, while Local/Supabase selection remains behind the server's separate `FileRepository`.
- **Five read outcomes stay distinct.** No Resource has a default value: `undefined` is not loaded, Resource `error` is a failed read, `null` is missing, `""` is an existing empty file, and `[]` is a resolved empty Daily index. Templates branch before `value()` and retain usable values during reload.
- **Mutable ResourceRefs remain private.** `file(path)` caches both the ref and its `asReadonly()` result. Lazy creation uses the captured `Injector` and `untracked(() => resource(...))`, because an Injector alone does not prevent Angular's NG0602 when first selection happens inside a component `computed`.
- **The guard and Daily Resource share one cached Promise.** `hasDailyDate()` never interprets transport failure as an unknown date. Only a resolved absence redirects; rejection produces `NavigationError` and preserves the last activated screen. `reloadDailyIndex()` does not clear the shared Promise when Angular reports an idle/loading/reloading no-op.
- **Path-only cache identity is mock-only.** The current unauthenticated store may cache for the app lifetime. Auth must destroy/clear all cached Resources on identity change/sign-out or include vault/user identity in every key; cross-user path reuse is forbidden.
- **Drawer counts communicate knowledge, not placeholders.** Loading/error/missing maps to `null` (no badge); `0` is shown only for a successfully loaded existing file/index. The mounted drawer eagerly starts five file reads and one index read; stable cache identity prevents duplicates but intentionally does not invent a bulk API.
- **Angular 22 is the architecture floor.** Official Core/CLI migrations were run; framework packages are aligned at 22.0.6, TypeScript at 6.0.3, and Node at 22.22.3. The app remains zoneless through `build.options.polyfills: []`; `zone.js` is a dev dependency solely because Angular 22's generated Vitest bootstrap contains a statically resolved conditional `zone.js/testing` import.
- **Task 4.5 writes are ordinary Promises.** Writes never run in a Resource loader, save state is separate from Resource read status, and a private ref may be updated only as an explicit optimistic/confirmed write consequence; Resource `local` status alone does not prove persistence.

— session 2026-07-13 (cache-removal simplification; current vault-screen architecture, drawer portions superseded below)

> **SUPERSEDING DECISION:** This session replaces every earlier `VaultStore`, app-global Resource cache, stable cross-component Resource identity, shared-request Promise, store-owned retry, and eager-on-mount drawer-read decision in this log. Those earlier entries and their test evidence are retained only as historical implementation evidence; they do not describe the current code.

- **`VaultRepository` is the only vault read boundary.** It remains framework-neutral and Promise-based. `app.config.ts` binds it directly to `MockVaultRepository`; there is no `VaultStore` provider, global Resource map, shared request identity, or cross-component cache guarantee.
- **Each consumer owns its Angular Resource state.** `VaultFileScreenComponent`, `DailyNotesScreenComponent`, and `DailyNoteDetailScreenComponent` adapt repository Promises locally. Their retry handlers reload only the owning Resource; the Daily detail independently loads its header metadata and Markdown content.
- **The Daily route guard reads the repository directly.** Each guarded navigation awaits `listDailyNotes()`, redirects only after a resolved absence, and lets rejection surface as `NavigationError`. It does not share a cached Promise with the Daily list or detail.
- **Historical drawer behavior — superseded below: reads were open-gated and fresh per opening.** Each file Resource and the Daily-index Resource received `undefined` params while the drawer was closed; opening enabled six repository reads and reopening performed a fresh set.
- **Historical drawer behavior — superseded below: Resource state controlled count visibility.** Loading/error/missing mapped to no drawer count, while `0` was reserved for a successfully read existing empty file/index. The still-current screen contract continues to distinguish not-yet-loaded, error, missing `null`, existing empty `""`/`[]`, and populated values.
- **Task 4.5 writes stay ordinary repository/API Promises.** After a successful write, explicitly reload or otherwise refresh the affected screen-local Resource. Do not introduce a global cache solely to synchronize consumers; the drawer has no vault-derived state to synchronize.

— session 2026-07-13 (metric-free drawer; current architecture)

> **SUPERSEDING DECISION:** This session replaces every earlier drawer count/badge, `countOpenCheckboxes`, drawer-owned Angular Resource, eager or open-gated drawer read, refresh-on-open, loading/error/missing/zero count mapping, six-read performance, post-write drawer refresh, and count-suffixed accessible-name decision and claim in this log. Count-specific implementations, acceptance statements, test totals, browser-probe output, and screenshots below are retained only as historical evidence of superseded Task-4 shapes; they do not describe or verify the current drawer. Vault-screen Resources and the direct `/daily/:date` guard repository read are unchanged.

- **Drawer rows are metrics-free navigation.** The eight rows/actions show translated labels only; no count, badge, line count, file size, or replacement mechanical metric is rendered.
- **The drawer is registry/router-backed and outside the vault data flow.** `AppDrawerComponent` derives list rows from `VAULT_SCREEN_ORDER`, uses `NavigationService` for current-route state and actions, injects no `VaultRepository`, and owns no Angular Resource.
- **Opening the drawer performs zero vault reads.** Drawer visibility affects focus, inert state, and transition styling only. Vault data is read by routed vault screens and the Daily route guard, never by the navigation surface.
- **Semantic attention signals belong to the session flow.** Future signals such as an unsorted Inbox, overdue waiting item, or missing daily plan should be computed for session-start/chat behavior rather than persisted as drawer-row metrics.

— session 2026-07-14

- **Marked's typed checkbox renderer supersedes HTML postprocessing.** `taskCheckboxExtension.renderer.checkbox` consumes the checkbox token's `checked` state and emits the sanitizer-safe span directly. This removes the dependency on marked's attribute ordering and whitespace while keeping Angular sanitization enabled. Raw HTML inputs are deliberately untouched by the extension and remain the sanitizer's responsibility.
- **Checkbox ARIA survives the real Angular pipeline.** Contrary to the earlier assumption, Angular 22 preserves `role`, `aria-checked`, and `aria-disabled` on the generated spans; component tests pin both open and done state. The spans remain read-only in Task 4, and their accessible-name association is tracked separately under Open Issues.

— session 2026-07-14

- **The Task sentence now includes the approved Daily/date amendment.** The scope materially changed from backend-shaped day cards to a minimal date index plus client-owned presentation, so the one-sentence Task summary was updated rather than preserving the stale `DailyDayCard` shape.
- **Daily transport is deliberately presentation-free.** `DailyNoteRef` contains only the ISO `date` join key and backend-owned `isToday`; weekday/month labels, summaries, task counts, and inferred activity metadata do not cross `VaultRepository`.
- **Calendar formatting belongs to the client, but not entirely to Transloco.** `Intl.DateTimeFormat` produces locale-sensitive weekday/month/date labels from date-only ISO values using the active Transloco language; Transloco supplies relative/status copy such as Today and the surrounding session sentence.
- **One injected date source keeps mock chrome coherent and tests deterministic.** `APP_TODAY` has a system-local default, while the mock app binds it to `MOCK_TODAY`; Drawer and Chat share that presentation input without reading the vault.
- **Daily detail no longer fetches list metadata.** Its route ISO date is sufficient for header formatting, so the component owns only one file Resource; list validation remains the route guard's independent responsibility.
- **The Inbox count issue is resolved by removal.** `Noch nicht sortiert` / `Not sorted yet` conveys authored chrome without claiming a value derived from user-editable content.

### Review Focus
Compact map for human review. Do not repeat the diff.

- **Behavior claims:** (1) `listDailyNotes()` exposes only `{ date, isToday }`; Daily cards render no summary and detail performs one file read with no index read. (2) Drawer, populated Chat header, Daily list, and Daily detail reformat on active-language changes without repository refetch, while Inbox chrome contains no static count. (3) Only marked checkbox tokens become state-bearing spans; raw HTML remains untouched by the extension, and Angular sanitization preserves the generated class/role/ARIA state while removing native inputs.
- **Assumptions / choices:** The backend owns `isToday` in the user's calendar context. Date-only values are valid ISO input; the future HTTP adapter must validate untrusted payloads. The current mock app intentionally injects the May-2026 anchor. Task checkboxes remain read-only and still lack an accessible-name association with sibling task text.
- **Scope notes:** The approved correction also touches Task-3 session chrome, shared Transloco test setup, and both Task-4 planning documents. The application-wide marked extension from the concurrent GFM pass remains intact. No HTTP adapter, write path, or editing behavior was added.
- **Read next:** `apps/web/src/app/vault/vault.types.ts` + `vault.repository.ts` — minimal transport boundary; `apps/web/src/app/i18n/local-date.ts` — locale/date-only presentation; `daily-notes-screen.ts` + `daily-note-detail-screen.ts` — list projection versus file-only detail; `vault-markdown.ts` + `.test.ts` — typed checkbox/sanitizer boundary.

### Test Evidence

All results below through “Historical Verification — Cache-Free Local Resources” predate the metric-free drawer change. They remain useful evidence for unchanged vault screens, routing, chat, and tooling, but count-specific tests, totals, bundle sizes, browser-probe rows, screenshots, and drawer behavior are **historical and superseded**. They do not verify the current drawer; use the metric-free final-verification block below.

- `fnm exec --using=22.22 corepack pnpm@10 -r typecheck` — clean (ngc for web, tsc for core/cli).
- `fnm exec --using=22.22 corepack pnpm@10 -r test` — all green in one invocation:

```text
packages/core:  Test Files  15 passed (15) / Tests  273 passed (273)
apps/web:       Test Files  13 passed (13) / Tests   81 passed (81)
apps/cli:       Test Files  10 passed (10) / Tests   45 passed (45)
```

  Web delta vs. Task 3.5: +6 spec files / +27 tests (`vault-markdown` 3, `mock-vault.service` 5, `app-drawer` 5, `navigation.service` 5, `vault-file-screen` 4, `daily-notes` 5) and +1 routing case in `mock-chat.service.test.ts`; `chat-screen.test.ts`'s 5 tests stay green after the provider hoist.
- `fnm exec --using=22.22 corepack pnpm@10 --dir apps/web build` — production build clean: 421.42 kB raw / 108.40 kB transfer (was 393/103.5; drawer + vault surfaces + router input binding).
- Catalog congruence: `jq -r 'paths(scalars)|join(".")'` key-set diff de vs en — identical, 81 keys.
- **Historical, superseded drawer observation — Headless-Chromium CDP probe** (dev server unsandboxed, 390×844, script in session scratchpad — pattern from 3.4): drawer items `["Chat","Heute fragen","Inbox4","Fokus3","Nächste Schritte7","Warten auf2","Vielleicht irgendwann4","Daily Notes4"]`; `/inbox` chrome (`Inbox` / `4 EINTRÄGE · NOCH NICHT SORTIERT`) with 4 `.task-checkbox` spans and **0 surviving `<input>`s**; `/next` groups `["Arbeit","Haus & Garten","Persönlich"]` with 7 checkboxes; ask-link → `/` with the user bubble "Was passt jetzt zu mir?", a "2 Dateien gelesen" tool group, and the nextContext prose (greeting still present — chat state survived navigation); `/daily` 4 cards → `/daily/2026-05-03` with sections `["Plan","Log","Notizen"]`; back button → `/daily`; `history.back()` → `/daily/2026-05-03` (history intact); direct `/daily/1999-01-01` → redirected `/daily`. The count-suffixed drawer names in this probe no longer describe the current UI. Probe caveat encoded in the script: the mock greeting renders before the Transloco catalog fetch, so it waits for a translated aria-label before clicking chrome.
- Screenshots delivered to the user: `t4-drawer.png`, `t4-inbox.png`, `t4-next.png`, `t4-ask-next-response.png`, `t4-daily.png`, `t4-daily-detail.png` (session scratchpad).

— session 2026-07-13

- `fnm exec --using=22.22 corepack pnpm@10 -r typecheck` — clean across web (ngc), core, and CLI (tsc) after removing the chat navigation API and relocating `AppScreen`.
- `fnm exec --using=22.22 corepack pnpm@10 --dir apps/web test` — 13/13 files, 82/82 tests passed. Current navigation coverage: 6 `NavigationService` tests (activated-screen sync, direct Router navigation, valid detail, non-optimistic guard redirect, same-route asks, cancelled-navigation no-send) and 6 drawer tests (including active-row binding). Net +1 web test vs. the earlier session: +1 navigation case, +1 drawer case, −1 obsolete MockChatService navigation-state case.
- `fnm exec --using=22.22 corepack pnpm@10 -r test` — all web/core/CLI test targets completed successfully in one recursive run.
- `fnm exec --using=22.22 corepack pnpm@10 --dir apps/web build` — production build clean: 421.37 kB raw / 108.34 kB estimated transfer.
- `git diff --check` — clean.

— session 2026-07-13

- `fnm exec --using=22.22 corepack pnpm@10 -r typecheck` — clean across web (ngc), core, and CLI (tsc) after the registry refactor.
- `fnm exec --using=22.22 corepack pnpm@10 --dir apps/web test` — 15/15 files, 89/89 tests passed. New coverage includes registry metadata/guards/URLs, one-to-one route projection, optional route inputs, drawer order, unregistered activated route data, and invalid runtime navigation targets.
- `fnm exec --using=22.22 corepack pnpm@10 -r test` — all web/core/CLI test targets completed successfully in one recursive run.
- `fnm exec --using=22.22 corepack pnpm@10 --dir apps/web build` — production build clean: 421.58 kB raw / 108.53 kB estimated transfer.
- `git diff --check` and stale-import search — clean; independent implementation/diff reviews found no code findings after removing an order-coupled route-test assertion.

— session 2026-07-13 (async vault reads)

- `fnm exec --using=22.22.3 corepack pnpm@10 install --offline --frozen-lockfile` — lockfile current; pnpm 10.34.4 reused the installed store without changes.
- `fnm exec --using=22.22.3 corepack pnpm@10 -r typecheck` — Web ngc plus core/CLI tsc all clean under Node 22.22.3, Angular 22.0.6, and TypeScript 6.0.3.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web test` — 16/16 files, 114/114 tests passed after the final no-op-reload regression test. Coverage includes deferred repository/store states, retries, stable identity, async guard races/errors, and all previous Task-4 component behavior.
- `fnm exec --using=22.22.3 corepack pnpm@10 -r test` — Web (114/114), core, and CLI targets completed successfully in one recursive run.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web build` — production build clean: 432.45 kB raw / 111.54 kB estimated transfer.
- `git diff --check`, de/en scalar-key diff (87/87), and stale production-import search — clean.
- Independent final review found and verified two fixes: direct `zone.js` resolution for Angular 22's generated Vitest bootstrap, and preservation of the shared Daily Promise when reload is a loading-state no-op. No remaining code findings.

### Historical Verification — Cache-Free Local Resources (Pre Metric Removal)

Historical results after the cache-free local-Resource simplification and before metric removal; the totals and build sizes below must not be reused as post-change evidence:

- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web typecheck` — PASS.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web test` — PASS: 15 files / 104 tests.
- Focused `app.routes` + `navigation.service` run — PASS: 2 files / 12 tests.
- Focused local-Resource + drawer run — PASS: 3 files / 28 tests.
- `fnm exec --using=22.22.3 corepack pnpm@10 -r typecheck` — PASS across Web, core, and CLI.
- `fnm exec --using=22.22.3 corepack pnpm@10 -r test` — PASS: Web 104 + core 273 + CLI 45 = 422 tests.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web build` — PASS: 431.15 kB initial / 111.20 kB estimated transfer.
- `rg -n "VaultStore|vault\\.store" apps/web/src` — clean; no production or test-code hits.
- `git diff --check` — PASS for the final whole worktree.

### Final Verification — Metric-Free Drawer

Post-change results from 2026-07-13:

- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web typecheck` — PASS.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web test` — PASS: 15 files / 99 tests.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web exec ng test web --watch=false --include=src/app/navigation/app-drawer.test.ts --include=src/app/vault/vault-markdown.test.ts --include=src/app/mock/mock-vault.repository.test.ts` — PASS: 3 files / 12 tests.
- `fnm exec --using=22.22.3 corepack pnpm@10 -r typecheck` — PASS across Web, core, and CLI.
- `fnm exec --using=22.22.3 corepack pnpm@10 -r test` — PASS across all three targets; package runs confirm Web 99 + core 273 + CLI 45 = 417 tests.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web build` — PASS: 430.16 kB initial / 110.92 kB estimated transfer.
- `rg -n 'countOpenCheckboxes|class="count"|\.drawer-item \.count|countFor\(|dailyCount\(' apps/web/src` — clean; no hits.
- `rg -n 'VaultRepository|resource\(' apps/web/src/app/navigation/app-drawer.ts apps/web/src/app/navigation/app-drawer.test.ts` — clean; no hits.
- `git diff --check` — PASS for the complete dirty worktree.

— session 2026-07-14

- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web exec ng test --watch=false --include=src/app/vault/vault-markdown.test.ts --include=src/app/vault/vault-file-screen.test.ts --include=src/app/vault/daily-notes.test.ts --filter='renders GFM checkbox tokens|leaves identical raw HTML|renders the translated Inbox chrome|omits Notizen'` — PASS on the final shared-worktree state: 3 files, 4 GFM-specific tests passed, 19 unrelated tests skipped.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web exec ng test --watch=false --include=src/app/vault/vault-markdown.test.ts --include=src/app/vault/vault-file-screen.test.ts --include=src/app/vault/daily-notes.test.ts` — PASS: 3 files / 21 tests; covers token rendering plus open/done state after Angular sanitization.
- `fnm exec --using=22.22.3 pnpm --filter @keppt/web typecheck` — PASS.
- `fnm exec --using=22.22.3 pnpm --filter @keppt/web test` — PASS: 15 files / 100 tests.
- `fnm exec --using=22.22.3 pnpm -r typecheck` — PASS across Web, core, and CLI.
- `fnm exec --using=22.22.3 pnpm -r test` — PASS across Web, core, and CLI.
- `fnm exec --using=22.22.3 pnpm --filter @keppt/web build` — PASS: 430.06 kB initial / 110.90 kB estimated transfer.
- `fnm exec --using=22.22.3 corepack pnpm@10 exec prettier --check apps/web/src/app/vault/vault-markdown.ts apps/web/src/app/vault/vault-markdown.test.ts` and `git diff --check` — PASS.

— session 2026-07-14

- `fnm exec --using=22.22.3 corepack pnpm@10 --dir apps/web exec ng test --no-watch --include=src/app/vault/daily-notes.test.ts` — PASS: 1 file / 13 tests, including locale switching and the detail's no-index-read assertion.
- After rereading the concurrently updated Task-4 log, `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web typecheck` — PASS.
- After the concurrent changes, `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web test` — PASS: 16 files / 107 tests.
- `fnm exec --using=22.22.3 corepack pnpm@10 -r typecheck` — PASS across Web, core, and CLI on the final shared worktree.
- `fnm exec --using=22.22.3 corepack pnpm@10 -r test` — PASS across Web, core, and CLI on the final shared worktree.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web build` — PASS: 430.46 kB initial / 111.14 kB estimated transfer.
- Relevant-source `prettier --check`, stale-contract searches, and the final `git diff --check` — PASS; no `DailyDayCard`, backend-localized Daily metadata, obsolete `drawer.date`, or static Inbox subtitle remains outside historical task-log text.
- Independent focused review reran 5 relevant specs / 34 tests plus Web typecheck and found no blocking correctness issue; the concurrent-delta audit confirmed `taskCheckboxExtension` and `APP_TODAY` coexist in `app.config.ts` without conflict.

— session 2026-07-14 (ask-prompt localization correction)

- `fnm exec --using=22.22.3 corepack pnpm@10 --dir apps/web exec ng test --no-watch --include=src/app/navigation/navigation.service.test.ts --include=src/app/mock/mock-chat.service.test.ts` — PASS: 2 files / 25 tests; covers German and runtime-switched English sends from the real catalogs plus all eight catalog-prompt routing cases. The first run exposed and the correction fixed the pre-existing `Worauf warte ich?` → fallback mismatch.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web typecheck` — PASS.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web test` — PASS: 16 files / 109 tests.
- `fnm exec --using=22.22.3 corepack pnpm@10 --filter @keppt/web build` — PASS: 430.79 kB initial / 111.26 kB estimated transfer.

### Acceptance Coverage
- T4-AC-01: passed — Drawer exposes the eight metric-free registry-backed rows/actions, tracks successful Router activation, closes through `NavigationService`, formats its injected date in the active locale, and renders without `VaultRepository` (`app-drawer.test.ts`, `navigation.service.test.ts`).
- T4-AC-02: passed — each vault screen renders translated, count-free chrome plus honest loading/error/retry/missing/existing-empty/resolved Markdown states. Checkbox tokens render through the typed marked extension and retain state after Angular sanitization; the Inbox subtitle no longer claims a content count (`vault-markdown.test.ts`, `vault-file-screen.test.ts`, `daily-notes.test.ts`).
- T4-AC-03: passed — ask-in-chat flows route before sending, resolve their prompt from the active catalog, suppress sends on cancellation, preserve same-route chat sends, and route every German/English catalog prompt to the intended mock response (`navigation.service.test.ts`, `mock-chat.service.test.ts`).
- T4-AC-04: passed — Daily list consumes only `{ date, isToday }`, derives locale-reactive labels without refetch, renders no summary, and retains all async states; detail owns exactly its route-selected file Resource and never reads the index, while the guard remains the independent date validator (`daily-notes.test.ts`, `navigation.service.test.ts`, `mock-vault.repository.test.ts`).
- T4-AC-05: passed — `SCREEN_REGISTRY` remains the single typed runtime source for screen metadata consumed by routes, Drawer, URL construction, and validation (`screen-registry.test.ts`, `app.routes.test.ts`, `app-drawer.test.ts`, `navigation.service.test.ts`).

### Open Issues
- The empty `role="checkbox"` span exposes open/done and disabled state but has no accessible name tied to the following sibling task text; associate the state with the task label when rendered checkboxes become interactive.
- Plan↔core wording drift remains: the vault seed uses `## Notizen` while core R10 names the section “Notes”; resolve before the real backend serves files (→ Task 4.5 or a core prompt pass).
- Drawer/vault screens still have no composer although the React reference shows one; this was outside Task 4 (→ Task 5).
- Drawer accessibility remains the cheap pass (focus container on open, Escape, inert), without a focus trap or focus return (→ Task 5).
- The Chat “more options” button remains unwired pending a product meaning (→ Task 5).
- Initial runtime catalog loading can briefly render mock content before translated chrome/ARIA labels appear; preload the default language if the flash becomes material.
- `APP_TODAY` is a date snapshot, not a midnight-reactive clock; a long-lived app can retain yesterday's Drawer/Chat date until restart or a future lifecycle refresh (→ Task 5).
- `IsoLocalDate` is a compile-time shape only. A future HTTP repository must validate real calendar dates before passing them to `formatLocalDate`; JavaScript otherwise normalizes values such as `2026-02-31`.
- Carried tooling notes: no root `packageManager` pin; root Vitest remains 1.4 for core/CLI while Web uses 4; ATL zoneless component inputs use `bindings`, not an `inputs` option.

### Context for Next Task
- **Vault read boundary (Task 4.5 builds on this):**

```ts
// vault.repository.ts — no Angular imports
abstract readFile(file: VaultFile): Promise<string | null>;
abstract listDailyNotes(): Promise<readonly DailyNoteRef[]>;

interface DailyNoteRef {
  readonly date: IsoLocalDate;
  readonly isToday: boolean;
}
```

- **Resource ownership:** vault task screens and Daily detail own only file Resources; Daily list owns the index Resource; the route guard awaits an independent index read. Loading, Resource error, missing `null`, existing empty `""`/`[]`, and populated values remain distinct.
- **Date/i18n boundary:** `formatLocalDate(isoDate, transloco.activeLang())` owns calendar wording through `Intl`; Transloco owns Today/status/surrounding copy. Changing language must not change Resource params or trigger repository reads.
- **Injected app date:** `APP_TODAY` defaults to the system-local date, but this mock-first app binds `MOCK_TODAY` so current-date chrome matches the seeded Daily index. Tests should override the token rather than hardcoding production component strings.
- **Metric-free UI:** Drawer rows and Inbox chrome must not regain counts, summaries, overdue guesses, or other values inferred from editable Markdown. Product attention signals belong to session-start/chat behavior.
- **Task 4.5 write path:** add ordinary Promise writes to `VaultRepository`; never put mutations in a Resource loader. Model save state separately and refresh only the affected screen-local Resource after persistence.
- **Future HTTP adapter:** validate `DailyNoteRef.date` as a real ISO calendar date at the transport boundary and keep Local/Supabase selection behind the server `FileRepository`.
- **Screen/navigation contract:** `SCREEN_REGISTRY` owns typed metadata; Angular components/guards stay in routes. Router activation remains authoritative, and ask-in-chat resolves the active-language app prompt and sends only after successful navigation.
- **Markdown/security contract:** keep the typed marked checkbox renderer and Angular sanitization enabled; do not restore serialized-HTML replacement or native unsanitized inputs.
- **Testing:** component specs use the real de/en catalogs through `provideTranslocoTesting()`, now with `reRenderOnLangChange: true`; locale-switch specs must also assert repository read counts.

### Git State

`git diff --stat`

```text
 .nvmrc                                             |    2 +-
 apps/web/angular.json                              |    1 +
 apps/web/package.json                              |   25 +-
 apps/web/public/i18n/de.json                       |   73 +-
 apps/web/public/i18n/en.json                       |   73 +-
 apps/web/src/app/app.config.ts                     |   40 +-
 apps/web/src/app/app.routes.test.ts                |   55 +
 apps/web/src/app/app.routes.ts                     |  100 +-
 apps/web/src/app/app.ts                            |    8 +-
 apps/web/src/app/chat/chat-screen.html             |    1 +
 apps/web/src/app/chat/chat-screen.test.ts          |   57 +-
 apps/web/src/app/chat/chat-screen.ts               |   17 +-
 apps/web/src/app/chat/chat.service.ts              |    4 +-
 apps/web/src/app/chat/chat.store.ts                |    7 +-
 apps/web/src/app/chat/chat.types.ts                |   10 -
 .../src/app/chat/components/session-header.html    |   20 +-
 apps/web/src/app/chat/components/session-header.ts |   33 +-
 apps/web/src/app/mock/chat-mock-data.ts            |   26 +
 apps/web/src/app/mock/mock-chat.service.test.ts    |   14 +-
 apps/web/src/app/mock/mock-chat.service.ts         |   13 +-
 apps/web/src/app/mock/mock-vault-data.ts           |  134 ++
 .../web/src/app/mock/mock-vault.repository.test.ts |   70 +
 apps/web/src/app/mock/mock-vault.repository.ts     |   20 +
 apps/web/src/app/navigation/app-drawer.html        |   87 +
 apps/web/src/app/navigation/app-drawer.scss        |  196 ++
 apps/web/src/app/navigation/app-drawer.test.ts     |  136 ++
 apps/web/src/app/navigation/app-drawer.ts          |   73 +
 .../src/app/navigation/navigation.service.test.ts  |  246 +++
 apps/web/src/app/navigation/navigation.service.ts  |  116 ++
 .../web/src/app/navigation/screen-registry.test.ts |   77 +
 apps/web/src/app/navigation/screen-registry.ts     |   91 +
 .../src/app/vault/daily-note-detail-screen.html    |   31 +
 .../src/app/vault/daily-note-detail-screen.scss    |   32 +
 apps/web/src/app/vault/daily-note-detail-screen.ts |   49 +
 apps/web/src/app/vault/daily-notes-screen.html     |   51 +
 apps/web/src/app/vault/daily-notes-screen.scss     |  103 ++
 apps/web/src/app/vault/daily-notes-screen.ts       |   46 +
 apps/web/src/app/vault/daily-notes.test.ts         |  331 ++++
 apps/web/src/app/vault/vault-file-screen.html      |   39 +
 apps/web/src/app/vault/vault-file-screen.scss      |   51 +
 apps/web/src/app/vault/vault-file-screen.test.ts   |  238 +++
 apps/web/src/app/vault/vault-file-screen.ts        |   53 +
 apps/web/src/app/vault/vault-markdown.test.ts      |   28 +
 apps/web/src/app/vault/vault-markdown.ts           |   17 +
 apps/web/src/app/vault/vault-page-header.html      |   30 +
 apps/web/src/app/vault/vault-page-header.scss      |   54 +
 apps/web/src/app/vault/vault-page-header.ts        |   32 +
 apps/web/src/app/vault/vault.repository.ts         |   13 +
 apps/web/src/app/vault/vault.types.ts              |   34 +
 apps/web/src/styles.scss                           |  149 +-
 apps/web/src/testing/transloco-testing.ts          |    6 +-
 apps/web/src/testing/vault-testing.ts              |   58 +
 apps/web/tsconfig.app.json                         |   10 +-
 apps/web/tsconfig.spec.json                        |   10 +-
 docs/specs/angular-chat-ui.md                      |  200 +-
 docs/specs/architecture.md                         |    3 +-
 docs/work/keppt-ui/plan.md                         |  143 +-
 .../task-4-add-drawer-navigation-surface.md        |  418 +++++
 package.json                                       |    2 +-
 pnpm-lock.yaml                                     | 1955 ++++++++++----------
 60 files changed, 4753 insertions(+), 1258 deletions(-)
```

`git status --short`

```text
 M .nvmrc
 M apps/web/angular.json
 M apps/web/package.json
 M apps/web/public/i18n/de.json
 M apps/web/public/i18n/en.json
 M apps/web/src/app/app.config.ts
 A apps/web/src/app/app.routes.test.ts
 M apps/web/src/app/app.routes.ts
 M apps/web/src/app/app.ts
 M apps/web/src/app/chat/chat-screen.html
 M apps/web/src/app/chat/chat-screen.test.ts
 M apps/web/src/app/chat/chat-screen.ts
 M apps/web/src/app/chat/chat.service.ts
 M apps/web/src/app/chat/chat.store.ts
 M apps/web/src/app/chat/chat.types.ts
 M apps/web/src/app/chat/components/session-header.html
 M apps/web/src/app/chat/components/session-header.ts
 M apps/web/src/app/mock/chat-mock-data.ts
 M apps/web/src/app/mock/mock-chat.service.test.ts
 M apps/web/src/app/mock/mock-chat.service.ts
 A apps/web/src/app/mock/mock-vault-data.ts
 A apps/web/src/app/mock/mock-vault.repository.test.ts
 A apps/web/src/app/mock/mock-vault.repository.ts
 A apps/web/src/app/navigation/app-drawer.html
 A apps/web/src/app/navigation/app-drawer.scss
 A apps/web/src/app/navigation/app-drawer.test.ts
 A apps/web/src/app/navigation/app-drawer.ts
 A apps/web/src/app/navigation/navigation.service.test.ts
 A apps/web/src/app/navigation/navigation.service.ts
 A apps/web/src/app/navigation/screen-registry.test.ts
 A apps/web/src/app/navigation/screen-registry.ts
 A apps/web/src/app/vault/daily-note-detail-screen.html
 A apps/web/src/app/vault/daily-note-detail-screen.scss
 A apps/web/src/app/vault/daily-note-detail-screen.ts
 A apps/web/src/app/vault/daily-notes-screen.html
 A apps/web/src/app/vault/daily-notes-screen.scss
 A apps/web/src/app/vault/daily-notes-screen.ts
 A apps/web/src/app/vault/daily-notes.test.ts
 A apps/web/src/app/vault/vault-file-screen.html
 A apps/web/src/app/vault/vault-file-screen.scss
 A apps/web/src/app/vault/vault-file-screen.test.ts
 A apps/web/src/app/vault/vault-file-screen.ts
 A apps/web/src/app/vault/vault-markdown.test.ts
 A apps/web/src/app/vault/vault-markdown.ts
 A apps/web/src/app/vault/vault-page-header.html
 A apps/web/src/app/vault/vault-page-header.scss
 A apps/web/src/app/vault/vault-page-header.ts
 A apps/web/src/app/vault/vault.repository.ts
 A apps/web/src/app/vault/vault.types.ts
 M apps/web/src/styles.scss
D  apps/web/src/testing/override-component-services.ts
 M apps/web/src/testing/transloco-testing.ts
 A apps/web/src/testing/vault-testing.ts
 M apps/web/tsconfig.app.json
 M apps/web/tsconfig.spec.json
 M docs/specs/angular-chat-ui.md
 M docs/specs/architecture.md
 M docs/work/keppt-ui/plan.md
 A docs/work/keppt-ui/task-log/task-4-add-drawer-navigation-surface.md
 M package.json
 M pnpm-lock.yaml
?? apps/web/src/app/i18n/
?? apps/web/src/app/mock/mock-app-context.ts
```
