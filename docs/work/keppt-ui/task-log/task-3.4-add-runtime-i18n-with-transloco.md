### Task
Add runtime internationalization with Transloco (signal API): migrate all UI-chrome strings from Tasks 1–3 into HTTP-loaded JSON catalogs (`de`/`en`), including — beyond the plan's enumerated file list, per user decision — six additional template aria-labels and the tool-registry display copy (group headers, line labels), which now flow as `{ key, params }` references translated at the component edge.

### Status
DONE

### Files Modified
- `apps/web/package.json` (modified) — added `@jsverse/transloco@^8.4.0` as the runtime i18n dependency.
- `pnpm-lock.yaml` (modified) — locked Transloco 8.4.0 (installed via `corepack pnpm@10` — see Key Decisions on the store-version mismatch).
- `apps/web/src/app/transloco-loader.ts` (new) — `TranslocoHttpLoader` fetching `/i18n/${lang}.json` via `inject(HttpClient)`; JSON only, no XLIFF.
- `apps/web/public/i18n/de.json` (new) — German catalog (41 keys), wording verbatim from the previous hardcoded literals; namespaces `chat.*`, `mic.*`, `composer.*`, `tools.*`, `a11y.*`.
- `apps/web/public/i18n/en.json` (new) — faithful English translation, key-set identical to `de.json` (verified via `jq` paths diff).
- `apps/web/src/app/app.config.ts` (modified) — added `provideHttpClient(withFetch())` (app previously had no HttpClient at all) and `provideTransloco` (availableLangs `["de","en"]`, default + fallback `de`, `reRenderOnLangChange: true`, `prodMode: !isDevMode()`).
- `apps/web/src/app/chat/chat-ui-state.ts` (modified) — `micOverlayStatus()` returns `mic.status.*` translation keys instead of German text; module stays pure (no injection context).
- `apps/web/src/app/chat/chat-ui-state.test.ts` (modified) — asserts on keys; added the `closed → mic.status.ready` case.
- `apps/web/src/app/chat/components/session-header.ts` (modified) — `subtitle` is now `translateSignal(computed(key))` over `chat.subtitle.session|empty`; imports `TranslocoPipe`.
- `apps/web/src/app/chat/components/session-header.html` (modified) — menu/more `aria-label`s via `'a11y.menu' | transloco` / `'a11y.moreOptions' | transloco`.
- `apps/web/src/app/chat/components/mic-overlay.ts` (modified) — `status` and new `prompt` are `translateSignal` over computed keys (prompt `@switch` moved out of the template); `hintLabel` renamed to `hintKey`, returns `string | null` so the template guards with `@if` instead of translating an empty key.
- `apps/web/src/app/chat/components/mic-overlay.html` (modified) — heading `mic.title`, prompt/status render the translated signals, action `aria-label`s via `mic.a11y.cancel|confirm|retry`.
- `apps/web/src/app/chat/components/chat-message-list.html` (modified) — empty-state title/hint via `chat.empty.*`, conversation region label via `a11y.conversation`.
- `apps/web/src/app/chat/components/chat-message-list.scss` (modified) — `.empty-title` gets `white-space: pre-line`; the title's line break lives in the catalog as `\n` (replaces the hardcoded `<br>`).
- `apps/web/src/app/chat/components/chat-message-list.ts` (modified) — imports `TranslocoPipe`.
- `apps/web/src/app/chat/components/chat-input.html` (modified) — placeholder `composer.placeholder` (now `[placeholder]` binding), region/hidden-label/mic/send/stop labels via `composer.a11y.*` (stop = `Antwort abbrechen`, added post-plan by the cancel affordance, migrated too).
- `apps/web/src/app/chat/components/chat-input.ts` (modified) — imports `TranslocoPipe`.
- `apps/web/src/app/chat/chat-screen.html` (modified) — `main` label via `a11y.chatScreen` (sweep extra).
- `apps/web/src/app/chat/chat-screen.ts` (modified) — imports `TranslocoPipe`.
- `apps/web/src/app/chat/components/quick-replies.html` (modified) — bar label via `a11y.quickReplies` (sweep extra).
- `apps/web/src/app/chat/components/quick-replies.ts` (modified) — adds `imports: [TranslocoPipe]`.
- `apps/web/src/app/chat/components/tool-group.html` (modified) — expanded-list label via `a11y.toolSteps` (sweep extra).
- `apps/web/src/app/chat/components/tool-group.ts` (modified) — `header` is now `translateSignal(keySignal, paramsSignal)` over the registry's `ToolCopyRef`; the empty-group fallback key `""` is evaluated eagerly (translateSignal subscribes on construction — the template's ≥2 guard only gates rendering) but safe: Transloco returns empty keys as-is without hitting the missing-key handler.
- `apps/web/src/app/chat/components/tool-status-row.html` (modified) — running `aria-label` via `a11y.toolRunning` with a `{ label }` param (sweep extra; the label param is the already-translated line text).
- `apps/web/src/app/chat/components/tool-status-row.ts` (modified) — `label` is `translateSignal` over `toolLineLabel`'s `ToolCopyRef`.
- `apps/web/src/app/chat/chat-tool-registry.ts` (modified) — display resolvers return `ToolCopyRef = { key, params? }` instead of finished strings (second session, user decision): per-tool `label` lambdas emit `tools.line.plain` (passthrough for paths/change-summaries), `tools.line.allFiles`, or `tools.line.query` (quote marks now localize); `FAMILY_COPY` maps family × run-state to `tools.group.*` keys with a `count` param; `toolGroupSummary` returns `ToolCopyRef | null` (null = empty-group fail-soft, with a dev-only `console.warn` guarded by the global `ngDevMode` — no import, tree-shaken from prod). Module stays framework-agnostic — no Transloco import.
- `apps/web/src/app/chat/chat-tool-registry.test.ts` (modified) — all label/summary assertions rewritten to key+params objects (`toEqual`); empty group asserts `null`.
- `apps/web/src/app/mock/mock-chat.service.test.ts` (modified) — the end-to-end mixed-group assertion `"5 Schritte"` became `{ key: "tools.group.mixed.done", params: { count: 5 } }`.

### Files Read (Context Only)
- `docs/work/keppt-ui/plan.md` — preamble + Task 3.4 block only (per `/start-task` isolation).
- `docs/work/keppt-ui/task-log/task-3-render-chat-conversation-surface.md` — predecessor: purity rule for `chat-ui-state`/registry, node test env, current (post-rework) UI copy.
- `docs/work/keppt-ui/task-log/task-1-*.md` / `task-2.5-*.md` — via targeted grep only: zoneless scaffold, vitest config origin, "no HttpClient yet" and the vitest-4 peer-warning precedent.
- `apps/web/node_modules/@jsverse/transloco/lib/transloco.signal.d.ts` (+ loader/config/providers/pipe d.ts) — confirmed `translateSignal` accepts `Signal<string>` keys AND `Signal<HashMap>` params; confirmed `TranslocoLoader`/`provideTransloco` shapes.
- `apps/web/angular.json` — confirmed `public/` glob asset mapping serves `/i18n/*.json` with zero config.
- `apps/web/vitest.config.ts` — confirmed `environment: "node"`, no Angular compiler → registry/helpers must stay Angular-free.
- All migrated templates/components before editing.

### Key Decisions
- **Translate at the edge, keys in pure modules.** `micOverlayStatus()` and the whole tool registry return translation keys (registry: `ToolCopyRef` with params), never translated text — they have no injection context and their Node tests must not need `@angular/compiler`. Components resolve them via `translateSignal(keySignal, paramsSignal)` (the d.ts explicitly supports signal keys and signal params); static template strings use the `transloco` pipe. No Observable/`subscribe` API anywhere.
- **`provideHttpClient(withFetch())` added app-wide** — the app had no HttpClient; the Transloco HTTP loader is its first consumer.
- **Scope extension (user-approved, 2026-07-09):** beyond the plan's five files, six template labels (`session-header.html` menu/more, `quick-replies.html`, `chat-screen.html`, `tool-group.html` steps list, `tool-status-row.html` running suffix) were migrated in the first pass. The tool-registry copy was initially deferred as an open issue (plan's AC-04 didn't enumerate it); the user overruled the deferral ("es soll alles übersetzt werden") and it was migrated in a second session the same day. Root cause of the deferral was scope discipline, not complexity — the count param feeds display only, no logic.
- **Registry copy model:** three line-key shapes — `tools.line.plain` is a deliberate passthrough key (`"{{value}}"`) so data-only labels (paths, model-authored change summaries) render through the same single code path; `tools.line.query` keys the search quoting so quotation marks localize („…“ vs “…”); `tools.line.allFiles` replaces the previously hardcoded `list_files` fallback. Group headers are `tools.group.{family}.{running|done}` with a `count` param; plural-only wording is safe because headers only render for ≥2 tools. `toolGroupSummary([])` now returns `null` (was `""`) and warns in dev (`ngDevMode`-guarded — unreachable in-app, loud for future callers); the component maps `null` to the `""` key, which translateSignal evaluates eagerly (the template's length > 1 guard only gates rendering) — safe because Transloco returns empty keys as-is without invoking the missing-key handler.
- **Catalog conventions:** feature namespaces for feature-owned strings; `feature.a11y.*` for a feature's assistive-only labels; global `a11y.*` for cross-surface landmarks. The empty-state title's line break is `\n` in the catalog + `white-space: pre-line` (avoids `innerHTML`/`<br>` in translations). `de.json` wording is verbatim from the code as shipped (including the post-plan tap-model hint `"Tippe auf das Mikrofon …"` and the stop label `"Antwort abbrechen"` — the plan block's wording was stale on both).
- **Mock content stays German by design** (T3.4-AC-05): assistant prose, chips, transcript, and `change_summary` values simulate backend/LLM output that production returns in the user's language. The English mock dataset remains an open question (plan).
- **Toolchain:** system pnpm 11 refused the repo's v10 store (`ERR_PNPM_UNEXPECTED_STORE`); installs and all task commands ran through `fnm exec --using=22.22 corepack pnpm@10`. A `packageManager` pin in the root `package.json` would fix this permanently (separate chore).
- **AC-03 verification strategy:** no language-switcher UI exists (not in scope), so runtime switching was verified via a temporary `provideAppInitializer` hook exposing `TranslocoService` on `window`, driven by a headless-Chromium CDP script (plain Node 22, native WebSocket, no Playwright dependency). The hook was removed before wrap-up (scan-verified); the script lives in the session scratchpad, not the repo.

### Review Focus
Compact map for human review. Do not repeat the diff.

- **Behavior claims:** (1) Booting renders German chrome fetched at runtime from `/i18n/de.json` — only the active language is loaded. (2) `setActiveLang("en")` swaps every chrome string in place — subtitle, empty state, composer, mic overlay, aria-labels, and tool-group headers (`"4 Dateien gelesen" ↔ "4 files read"`) — with `en.json` lazy-loaded and no page reload (window-marker survived). (3) Data-only tool lines (paths, change summaries) pass through translation unchanged via `tools.line.plain`.
- **Assumptions / choices:** passthrough key `tools.line.plain: "{{value}}"` is intentional (uniform render path; quoting/locale-specific decoration stays possible); `toolGroupSummary` returns `null` for empty groups (dev-only warn) and the component's `""` fallback key is evaluated eagerly by translateSignal but safe — Transloco returns empty keys unchanged; the `length > 1` guard only gates rendering; `fallbackLang: "de"` is configured but `missingHandler.useFallbackTranslation` is not enabled — both catalogs are authored fully, congruence is checked by key-set diff, not at runtime.
- **Scope notes:** six template labels + the tool registry were migrated beyond the plan's enumerated file list (user-approved extension; plan AC-04 names only the five files, all of which are clean). `chat-ui-state.test.ts` lost its German-literal assertions by design (keys now). No `TranslocoTestingModule` was wired — there are no component specs yet (Task 3.5); only pure key-asserting tests exist.
- **Read next:** `apps/web/src/app/chat/chat-tool-registry.ts` — the `ToolCopyRef` model and passthrough decision; `apps/web/src/app/chat/components/tool-group.ts` — `translateSignal` over nullable copy with the `""` fallback; `apps/web/src/app/app.config.ts` — provider order and Transloco config.

### Test Evidence
- `fnm exec --using=22.22 corepack pnpm@10 -r typecheck` — all three packages clean (`ngc` for web).
- `fnm exec --using=22.22 corepack pnpm@10 -r test` — packages/core 273, apps/cli 45, apps/web 49 tests green. Web breakdown after the registry refactor:

```text
✓ src/app/chat/chat-ui-state.test.ts  (2 tests)
✓ src/app/chat/chat-tool-registry.test.ts  (12 tests)
✓ src/app/chat/chat-message-groups.test.ts  (5 tests)
✓ src/app/chat/chat.store.test.ts  (13 tests)
✓ src/app/mock/mock-voice-capture.service.test.ts  (3 tests)
✓ src/app/mock/mock-chat.service.test.ts  (14 tests)
Test Files  6 passed (6) / Tests  49 passed (49)
```

- `fnm exec --using=22.22 corepack pnpm@10 --dir apps/web build` — hermetic production build passes; both catalogs land in `dist/web/browser/i18n/`. Initial bundle 393 kB raw / 103.5 kB transfer (was 348/93 — Transloco + HttpClient).
- **Headless-Chromium CDP probe** (dev server + temporary `window.__transloco` hook, 390×844):
  - de baseline: subtitle `Heute · Mittwoch, 6. Mai`, placeholder `Frag Keppt …`, all aria-labels German, tool group `4 Dateien gelesen` with lines `tasks/inbox.md, tasks/focus.md, tasks/waiting.md, daily/2026-05-06.md`; resource entries show **only** `de.json` fetched.
  - mic overlay (de): `Erfassen` / `Höre zu …` / `Sprich einfach drauflos. Ich schreibe mit.` / `Tippe ✓, wenn du fertig bist` / cancel `Abbrechen`, confirm `Aufnahme übernehmen`.
  - `setActiveLang("en")`: subtitle `Today · Wednesday, May 6`, placeholder `Ask Keppt …`, tool group `4 files read` (lines unchanged — passthrough), overlay `Capture` / `Listening …` / `Tap ✓ when you're done`; `en.json` appears as a lazy second fetch; a `window.__reloadMarker` set before the switch survived → **no reload**. Switch back to `de` reverts everything with no third fetch.
  - Screenshots delivered to the user: `t34-de-chat.png`, `t34-en-chat.png`, `t34-de-overlay.png`, `t34-en-overlay.png` (note: the en-chat screenshot predates the registry refactor and still shows the German group header; the JSON probe above documents the corrected state).
- Catalog congruence: `jq -r 'paths(scalars)|join(".")'` key-set diff of `de.json` vs `en.json` — identical, 41 keys.
- German-literal scan over `apps/web/src/app` (excluding `mock/` and tests): zero user-facing hits; remaining matches are mock content (by design) and two doc comments.
- Temp-hook removal verified: `rg 'TEMP|__transloco' apps/web/src/app/app.config.ts` — no matches.

### Acceptance Coverage
- T3.4-AC-01: passed — `provideTransloco` in `app.config.ts` with langs `de`/`en`, default+fallback `de`, `reRenderOnLangChange: true`; runtime switching proven live (CDP probe).
- T3.4-AC-02: passed — catalogs are JSON under `apps/web/public/i18n/`, fetched at runtime over HTTP by `TranslocoHttpLoader`; no XLIFF/XML anywhere (`rg -i 'xliff|\.xlf|\.xmb'` clean), no per-locale build (single hermetic build, catalogs as assets).
- T3.4-AC-03: passed — live de→en→de switch updates all migrated chrome without reload (marker survived), `en.json` lazy-loads on first switch only; driven by `translateSignal`/`transloco` pipe.
- T3.4-AC-04: passed — the five named files contain no German literals (scan-verified); every key exists in both catalogs (key-set diff identical). Exceeded: six additional template labels + the tool registry migrated too (user-approved).
- T3.4-AC-05: passed — `apps/web/src/app/mock/chat-mock-data.ts` untouched (`git status` clean for `mock/`); no mock content in the catalogs.
- T3.4-AC-06: passed — `pnpm -r typecheck` and `pnpm -r test` green; pure helpers assert on keys (`chat-ui-state.test.ts`, `chat-tool-registry.test.ts`); no Transloco test module needed since no component specs exist yet (→ Task 3.5).

### Open Issues
- No component-DOM coverage of the translated templates (pipes, `[attr.aria-label]` bindings, `translateSignal` wiring) — the ng-mocks harness is Task 3.5; wire `TranslocoTestingModule`/`provideTransloco` test setup there.
- Initial-render flash was not explicitly measured: with the HTTP loader, first paint can briefly show untranslated bindings before `de.json` arrives. Not observed as disturbing in probe screenshots; if it shows up, preload the default lang via an app initializer or use the `*transloco` structural directive for the first-paint-critical blocks.
- `fallbackLang: "de"` is set, but `missingHandler.useFallbackTranslation` is not enabled — a key missing only from `en.json` would render the raw key in English mode. Mitigated by the key-set congruence check; consider a CI guard (script comparing `jq` key sets) once CI exists.
- English mock conversation dataset intentionally deferred (plan-level open question) — mock content remains German in both languages.
- No language-switcher UI yet; the language is switchable only programmatically. A visible switcher presumably arrives with the drawer (Task 4) or settings surface.
- Toolchain: no `packageManager` pin in root `package.json`; system pnpm 11 breaks against the repo's v10 store. Workaround documented (corepack pnpm@10); pin as a separate chore commit.

### Context for Next Task
- **Convention from now on (plan Task 4+):** every new chrome string is a translation key with entries in BOTH `apps/web/public/i18n/de.json` and `en.json`. Visible text → feature namespace (`chat.*`, `mic.*`, `composer.*`, `tools.*`, …); a feature's assistive-only labels → `feature.a11y.*`; cross-surface landmarks → global `a11y.*`.
- Transloco 8.4.0, signal API: `translateSignal(key)` for static keys in TS, `translateSignal(computed(() => key), computed(() => params))` for dynamic key+params (both accept signals), `'key' | transloco` / `'key' | transloco: params` in templates (component must import `TranslocoPipe`). App is zoneless — keep using these, never the Observable API.
- Pure modules (`chat-ui-state.ts`, `chat-tool-registry.ts`) return keys / `ToolCopyRef` (`{ key, params? }`) — never translated text, never a Transloco import. Their Vitest specs (node env, no Angular compiler) assert keys.
- Tool display: `toolLineLabel(tool) → ToolCopyRef` (passthrough `tools.line.plain` for data, `tools.line.query`, `tools.line.allFiles`); `toolGroupSummary(tools) → ToolCopyRef | null` (null = empty, single tool = its line ref, ≥2 = `tools.group.{family}.{running|done}` + `{ count }`). Components translate via `translateSignal`; templates read `header()` / `label()` as plain strings. Adding a tool still is one `TOOL_REGISTRY` edit, but its label lambda must return a `ToolCopyRef` and any NEW key needs entries in both catalogs (the compiler cannot check catalog completeness — the `jq` key-diff can).
- The loader serves any `/i18n/{lang}.json`; adding a language = new catalog file + adding the code to `availableLangs` in `app.config.ts`.
- `HttpClient` is now app-wide (`provideHttpClient(withFetch())` in `app.config.ts`) — available for future real services (`ChatService` adapter, `VoiceCaptureService`).
- Empty-state title line break: `\n` in the catalog + `white-space: pre-line` on `.empty-title` — keep translations markup-free.
- `mic-overlay.ts`: `hintKey` (nullable key, `@if`-guarded in the template) replaced `hintLabel`; `prompt`/`status` are translated signals; the prompt `@switch` no longer exists in the template.
- Test/verification loop for language behavior without a switcher UI: temporary `provideAppInitializer` hook exposing `TranslocoService` on `window` + the CDP script pattern (plain Node, native WebSocket, chromium `--headless=new --remote-debugging-port=0`, unique `--user-data-dir` per run). Remember: background dev servers started sandboxed bind an isolated network namespace — start them unsandboxed for browser probes, and `TaskStop` may orphan the `ng serve` child (kill the PID if port 4200 stays busy).
- All package commands: `fnm exec --using=22.22 corepack pnpm@10 …` until a `packageManager` pin lands.

### Git State

`git diff --stat` (all Task-3.4 changes, unstaged):

```text
 apps/web/package.json                              |   1 +
 apps/web/src/app/app.config.ts                     |  15 +++
 apps/web/src/app/chat/chat-screen.html             |   2 +-
 apps/web/src/app/chat/chat-screen.ts               |   2 +
 apps/web/src/app/chat/chat-tool-registry.test.ts   |  77 +++++++-----
 apps/web/src/app/chat/chat-tool-registry.ts        |  74 ++++++++----
 apps/web/src/app/chat/chat-ui-state.test.ts        |   7 +-
 apps/web/src/app/chat/chat-ui-state.ts             |  10 +-
 apps/web/src/app/chat/components/chat-input.html   |  12 +-
 apps/web/src/app/chat/components/chat-input.ts     |   3 +-
 .../src/app/chat/components/chat-message-list.html |   6 +-
 .../src/app/chat/components/chat-message-list.scss |   2 +
 .../src/app/chat/components/chat-message-list.ts   |   4 +-
 apps/web/src/app/chat/components/mic-overlay.html  |  28 ++---
 apps/web/src/app/chat/components/mic-overlay.ts    |  29 ++++-
 .../web/src/app/chat/components/quick-replies.html |   2 +-
 apps/web/src/app/chat/components/quick-replies.ts  |   2 +
 .../src/app/chat/components/session-header.html    |   4 +-
 apps/web/src/app/chat/components/session-header.ts |  13 +-
 apps/web/src/app/chat/components/tool-group.html   |   2 +-
 apps/web/src/app/chat/components/tool-group.ts     |  11 +-
 .../src/app/chat/components/tool-status-row.html   |   6 +-
 .../web/src/app/chat/components/tool-status-row.ts |  11 +-
 apps/web/src/app/mock/mock-chat.service.test.ts    |   5 +-
 pnpm-lock.yaml                                     | 134 +++++++++++++++++++++
 25 files changed, 359 insertions(+), 103 deletions(-)
```

`git status --short` (project files only): the 25 modified files above plus **untracked** `apps/web/src/app/transloco-loader.ts` and `apps/web/public/i18n/` (`de.json`, `en.json`) — `/commit 3.4` must stage these three new paths as well. The untracked home-directory/env entries (`.bash_profile`, `.claude/`, `.mcp.json`, …) must NOT be staged.
