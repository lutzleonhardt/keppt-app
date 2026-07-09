# Angular Chat UI Plan

Spec: `docs/specs/angular-chat-ui.md`
Scope: `docs/work/keppt-ui/` on branch `keppt-ui`

This plan builds the first mock-first Angular UI for Keppt as a mobile chat app. Each task includes the reference mock files and extracted facts it needs; `/start-task N` should not require rereading the spec or sibling tasks.

Post-Task-2 amendment: Task 2 implemented a temporary typed assistant block model because the original plan asked for it. Task 2.5 supersedes that part of the contract. From Task 2.5 onward, assistant prose is Markdown rendered through `ngx-markdown`; typed data remains for product UI patterns such as tool rows and quick replies.

Post-Task-3 amendment (2026-06-08): Task 3 shipped a redesigned voice/mic and composer model that supersedes the original mic/composer wording. The mic overlay no longer exposes idle/listening/transcript states; it opens directly into recording and runs `recording → transcribing → error`, inserting the captured transcript into the composer draft instead of displaying or auto-sending it (cancel/confirm/retry controls). The composer keeps the mic button always visible and *adds* a send button when the draft has text, rather than switching mic↔send. T3-AC-04, T3-AC-05, the Task 3 "concrete UI states" instructions, and the Task 6 mic-overlay playground state (T6-AC-06) are updated to match. The upstream spec `docs/specs/angular-chat-ui.md` has been amended to this model: a separate `VoiceCaptureService` boundary, the `busy` signal and `cancel()` on the `ChatService` contract, the recording → transcribing → error overlay that inserts the transcript into the composer (no auto-send), and the always-visible-mic + additive-send composer.

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

## Task 1: Scaffold Web App Foundation

### Instructions

Create `apps/web` as an Angular 20+ standalone app in the existing pnpm workspace. Use routing, CSS, Signals-ready app setup, and package scripts compatible with root `pnpm -r build`, `pnpm -r typecheck`, and `pnpm -r test`. The app must open to a usable Keppt chat shell, not a welcome screen, landing page, marketing page, or iPhone-frame preview.

Add the baseline Keppt design system as CSS variables and global styles. Port these token values into app CSS:

```css
--keppt-paper: #f6f3ee;
--keppt-paper-alt: #efebe3;
--keppt-paper-2: #ede9df;
--keppt-ink: #1a1814;
--keppt-ink-2: rgba(26, 24, 20, 0.62);
--keppt-ink-3: rgba(26, 24, 20, 0.38);
--keppt-ink-4: rgba(26, 24, 20, 0.18);
--keppt-ink-5: rgba(26, 24, 20, 0.10);
--keppt-line: rgba(26, 24, 20, 0.08);
--keppt-hairline: rgba(26, 24, 20, 0.06);
--keppt-accent: #b07a52;
--keppt-accent-soft: rgba(176, 122, 82, 0.10);
--keppt-accent-soft-2: rgba(176, 122, 82, 0.18);
```

Use the production viewport directly. The shell should use `100dvh`, account for `env(safe-area-inset-*)`, keep the composer area reserved at the bottom, and avoid depending on an iPhone frame. If a device preview is added later, it must be separate from the default route.

### Acceptance

- **T1-AC-01** — Running the web app opens directly into a chat app shell, not a welcome page, landing page, or marketing page.
- **T1-AC-02** — The shell uses `100dvh`, accounts for `env(safe-area-inset-*)`, and keeps the main app surface within the viewport.
- **T1-AC-03** — Root workspace build/typecheck/test scripts include the web app through pnpm workspace recursion.
- **T1-AC-04** — Runtime dependencies do not include Hashbrown, AG-UI, A2UI, Angular Material, PrimeNG, DaisyUI, or shadcn-style UI libraries.

### Key Locations

- New app: `apps/web/`
- Workspace config: `pnpm-workspace.yaml`, `package.json`
- Reference tokens: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/tokens.ts`
- Reference global styles and animations: `/home/lutz/projects/keppt/keppt-landing/src/styles/global.css`
- Reference shell behavior only; do not copy production framing: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/iphone.tsx`

### Key Discoveries

- The repo currently has `apps/cli` and `packages/core`; no Angular app exists yet.
- The UI should be custom Angular standalone components with Signals and custom CSS, not a component-library skin.
- Reference typography uses an `Inter Tight`-style UI font, italic serif brand moments, and a monospace stack for file/code paths.
- The reference mock's iPhone frame is only useful as a local preview reference. It is not the production shell.

## Task 2: Define Chat Service Contract

### Instructions

Add typed chat/domain models and a `ChatService` boundary with a `MockChatService` implementation. UI components must consume service Signals and methods rather than importing mock arrays directly.

Keep UI orchestration state in a route/local shell store rather than in presentational components. The store may be provided at the chat shell/screen component boundary instead of as an application-wide singleton, and should bridge RxJS streams to Signals deliberately (for example via `toSignal`) instead of relying on manual subscription field mutation. Presentational components should read Signals/view-model values and call store/service actions.

Use this service shape:

```ts
export type ChatStatus = 'idle' | 'thinking' | 'streaming' | 'error';

export interface ChatService {
  readonly messages: Signal<ChatMessage[]>;
  readonly status: Signal<ChatStatus>;
  readonly currentScreen: Signal<AppScreen>;
  sendMessage(content: string): Promise<void>;
  chooseQuickReply(label: string): Promise<void>;
  startVoiceCapture(): void;
  cancelVoiceCapture(): void;
  navigate(screen: AppScreen): void;
}
```

Use typed messages and blocks:

```ts
export type ChatMessage =
  | UserChatMessage
  | AssistantToolMessage
  | AssistantTypingMessage
  | AssistantContentMessage;

export interface UserChatMessage {
  id: string;
  role: 'user';
  text: string;
  createdAt: string;
}

export interface AssistantToolMessage {
  id: string;
  role: 'assistant';
  kind: 'tool';
  text: string;
  files?: string[];
  createdAt: string;
}

export interface AssistantTypingMessage {
  id: string;
  role: 'assistant';
  kind: 'typing';
  createdAt: string;
}

export interface AssistantContentMessage {
  id: string;
  role: 'assistant';
  kind: 'content';
  blocks: AssistantBlock[];
  quickReplies?: QuickReply[];
  createdAt: string;
}

export type AssistantBlock =
  | { type: 'paragraph'; text: InlineText[] }
  | { type: 'heading'; text: string }
  | { type: 'ordered-list'; items: RichListItem[] }
  | { type: 'unordered-list'; items: RichListItem[] }
  | { type: 'code'; text: string };

export interface QuickReply {
  id: string;
  label: string;
  action?: string;
}

export type InlineText =
  | { text: string }
  | { text: string; mark: 'strong' | 'emphasis' | 'muted' | 'code' };

export interface RichListItem {
  title?: InlineText[];
  body: InlineText[];
  meta?: string;
}

export type AppScreen =
  | 'chat'
  | 'inbox'
  | 'focus'
  | 'next'
  | 'waiting'
  | 'someday'
  | 'daily'
  | 'daily-detail';
```

Convert the reference mock strings, flow, routing, chips, list entries, and daily notes into Angular-friendly typed mock data. Do not model widgets as arbitrary generated UI; only model known product UI patterns.

Implement these mock behaviors:

- Initial chat state should be able to show the greeting flow: tool row `"Keppt hat deine offenen Punkte geprüft"` with files `tasks/inbox.md`, `tasks/focus.md`, `tasks/waiting.md`, `daily/2026-05-06.md`; then a conversational greeting about Wednesday, May 6 and DB follow-up waiting for 8 days; then chips `Tag planen`, `Warten auf zeigen`, `Erstmal nur erfassen`.
- `startVoiceCapture()` should simulate the transcript: `Morgen Anna wegen Angebot schreiben, Steuerunterlagen irgendwann sortieren, und Idee für YouTube-Video über AI Apps festhalten.`
- After voice capture completes, append a user message with that transcript, a tool row `"3 Einträge sicher abgelegt"` with files `tasks/inbox.md`, `tasks/someday-maybe.md`, a typing message, then the capture confirmation response with chips `Ja, Anna zuerst`, `Plan morgen — 4 h`, `Später entscheiden`.
- Planning text such as `4 stunden`, `plan morgen`, `plan für morgen`, or `realistisch` should route to a planning response with tool row `"Geprüft: Wochenfokus, offene Aufgaben und Follow-ups"` and files `tasks/focus.md`, `tasks/next-actions.md`, `tasks/waiting.md`, `daily/2026-05-06.md`.
- Today/focus text should route to the today response, waiting/Max/DB text should route to the waiting response, inbox cleanup text should route to the inbox cleanup response, and unknown text should be acknowledged as captured in the inbox.
- Quick reply `Ja, eintragen` should simulate writing the plan to `daily/2026-05-07.md`; `Ja, Anna zuerst` should simulate prioritizing Anna; `Erstmal nur erfassen` should produce a capture-only response; `Später entscheiden`, `Nichts tun`, and `Später` should produce a later response.

### Acceptance

- **T2-AC-01** — Presentational components can depend on the `ChatService` abstraction without importing mock arrays directly.
- **T2-AC-05** — Chat UI state is orchestrated through a local store/service boundary, with no manual subscription-driven field mutation in presentational components.
- **T2-AC-02** — The mock service simulates tool row, typing, final assistant response, and quick replies for greeting, capture confirmation, planning, today, waiting, inbox, and acknowledge flows.
- **T2-AC-03** — Keyword routing covers planning, today/focus, waiting/Max/DB, inbox cleanup, and fallback capture.
- **T2-AC-04** — Voice capture simulation emits the Anna/tax-documents/AI-Apps transcript, then produces the capture confirmation response.

### Key Locations

- New Angular service/types: `apps/web/src/app/chat/`
- Local chat store/shell state: `apps/web/src/app/chat/`
- New mock data: `apps/web/src/app/mock/`
- Angular provider setup: `apps/web/src/app/app.config.ts`
- Reference mock content and route behavior: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/strings.tsx`
- Reference mock timing and handlers: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/MockDevice.tsx`

### Key Discoveries

- The reference main mock flow is greeting/check status, quick replies, simulated voice transcript, capture confirmation, then a planning answer for `Ich habe morgen nur 4 Stunden. Was ist realistisch?`.
- The German mock is the primary content source for this app pass.
- Important chips include `Tag planen`, `Warten auf zeigen`, `Erstmal nur erfassen`, `Ja, Anna zuerst`, `Plan morgen — 4 h`, `Später entscheiden`, `Ja, eintragen`, `Anpassen`, `An Max pingen`, `Tagesplan starten`, `Plan für morgen`, `Räum die Inbox auf`, and `Was steht heute an?`.
- Reference regex routing is `4 stunden|plan morgen|plan für morgen|realistisch`, `heute|wichtig|fokus`, `warten|waiting|max|db`, and `inbox|aufräumen|sortier`.

## Task 2.5: Replace Assistant Blocks With Markdown Rendering

### Instructions

Replace the temporary assistant block AST with Markdown-rendered assistant content before expanding the chat surface further. Assistant prose messages should carry a Markdown string, and the UI should render that string through `ngx-markdown`.

Update the chat DTOs so assistant content is shaped like this:

```ts
export interface AssistantContentMessage {
  id: string;
  role: 'assistant';
  kind: 'content';
  markdown: string;
  quickReplies?: QuickReply[];
  createdAt: string;
}
```

Remove `AssistantBlock`, `InlineText`, `RichListItem`, and the block renderer components unless a remaining typed product widget still needs them. Do not encode known product UI such as tool/status rows or quick replies inside Markdown; keep those as typed message fields/components.

Add and configure `ngx-markdown` for the Angular app using the current standalone Angular integration recommended by the package. Convert all mock assistant response bodies from block arrays to Markdown strings while preserving the German copy and the visible structure of the existing mock flows.

Keep the existing mock texts semantically identical. The conversion may add Markdown syntax for structure, emphasis, lists, and code, but it must not rewrite the German wording as part of this task. If the rendered output differs visually from the current assistant block rendering in a meaningful way, adjust the Markdown styling rather than changing the copy.

Wrap rendered Markdown in a stable assistant-only scope such as `.assistant-markdown`. Style the generated Markdown DOM under that scope only, including paragraphs, headings, ordered and unordered lists, list items, links, inline code, code blocks, strong text, and emphasis. Do not add broad global element styles for `p`, `ul`, `ol`, `li`, `code`, or headings. Prefer scoped rules in `styles.scss` if Angular component style encapsulation does not reach the generated Markdown nodes cleanly.

Before changing the renderer, capture a visual baseline for the current mock chat states that contain assistant prose. After the Markdown conversion, run the same states again and compare screenshots/DOM output. Use automated checks where practical; if pixel-perfect matching is too brittle, assert stable text content, key Markdown-generated elements, lack of horizontal overflow, and screenshot similarity for the main mobile viewport.

### Acceptance

- **T2.5-AC-01** — `AssistantContentMessage` uses `markdown: string` and no longer exposes `blocks: AssistantBlock[]`.
- **T2.5-AC-02** — Assistant Markdown is rendered through `ngx-markdown` in the chat UI.
- **T2.5-AC-03** — Tool/status rows and quick replies remain typed UI data, not Markdown-encoded controls.
- **T2.5-AC-04** — Existing mock flows still produce equivalent visible assistant content and all existing chat/mock tests pass after the conversion.
- **T2.5-AC-05** — Obsolete block renderer types/components are removed unless still justified by a typed product widget.
- **T2.5-AC-06** — Markdown output is styled under an assistant-only scope and does not rely on broad global element selectors.
- **T2.5-AC-07** — Automated or scripted visual verification compares pre/post conversion chat states for equivalent text, expected Markdown elements, no horizontal overflow, and acceptable screenshot similarity.

### Key Locations

- Chat DTOs and guards: `apps/web/src/app/chat/chat.types.ts`
- Assistant content rendering: `apps/web/src/app/chat/components/assistant-content-message.ts`
- Temporary block renderers to remove or simplify: `apps/web/src/app/chat/components/assistant-block.*`, `chat-inline-text.*`, `rich-list-item.*`
- Mock response content: `apps/web/src/app/mock/chat-mock-data.ts`
- Markdown typography scope: `apps/web/src/styles.scss`, or the assistant content component stylesheet if encapsulation works cleanly
- Angular dependency/configuration: `apps/web/package.json`, `apps/web/src/app/app.config.ts`

### Key Discoveries

- The current UI direction is `ngx-markdown` for assistant prose rendering, with typed data kept for known product UI patterns such as tool/status rows, quick replies, confirmations, and plan lists.
- The previous `AssistantBlock` model was a local client AST for prose, not a product UI contract. It creates extra component surface without matching the later backend shape.
- Markdown should cover prose structure such as paragraphs, emphasis, headings, lists, and code. Typed message variants should cover non-prose UI like tool rows, typing state, and quick replies.
- `ngx-markdown` renders normal HTML elements. Those generated elements need a scoped typography layer for assistant prose so the chat keeps the current visual rhythm after the block components are removed.

## Task 3: Render Chat Conversation Surface

### Instructions

Build the chat screen and message components against the typed service data after Task 2.5. The chat route must render the header, independent message scroll area, user messages, assistant tool/status rows, assistant typing state, assistant Markdown content, quick replies, bottom composer, and simulated mic overlay.

Implement these components or equivalent standalone components:

- `ChatScreenComponent` for the header, scroll area, suggestions, and composer.
- `SessionHeaderComponent` with menu button, Keppt mark, date/status subtitle, and more button.
- `ChatMessageListComponent` with scroll anchoring when messages change.
- `UserMessageComponent` for right-aligned dark user bubbles.
- `AssistantMessageComponent` for Markdown assistant content and attached quick replies.
- `ToolStatusRowComponent` for `"Keppt checked..."` style rows and expandable file lists.
- `QuickRepliesComponent` for wrapping chip rows.
- `ChatInputComponent` for text input with an always-visible mic button and an additive send button shown once the draft has text.
- `MicOverlayComponent` for simulated capture overlay.

Render assistant prose through `ngx-markdown`. Keep tool/status rows, typing state, and quick replies as typed Angular UI components. Use familiar icon affordances for menu, more, back, close, mic, send, file, and expand/collapse. Use `lucide-angular` or similarly narrow icon dependency if icons are not already available; do not add a broad UI component library.

Use these concrete UI states from the reference mock:

- Header subtitle is `Bereit zum Erfassen` when chat is empty and `Heute · Mittwoch, 6. Mai` after messages exist.
- Empty chat copy is `Was liegt dir im Kopf?` and `Halte den Mic-Button gedrückt — oder schreib einfach.`
- Input placeholder is `Frag Keppt …`.
- Tool rows should show an inline file icon, muted text, and a chevron only when files exist. Expanded state shows each file path in monospace.
- Typing state uses three pulsing dots.
- Mic overlay heading is `Erfassen`. It opens directly into recording and runs through recording (status `Höre zu …`, prompt `Sprich einfach drauflos. Ich schreibe mit.`), transcribing (status `Verarbeite …`, prompt `Einen Moment — ich schreibe es auf.`), and error (status `Nichts gehört`, prompt `Ich habe nichts verstanden. Probier es nochmal.`). The captured transcript is appended to the composer draft, not shown in the overlay.

### Acceptance

- **T3-AC-01** — The chat screen renders header, independent scroll area, message list, quick replies, and bottom composer without viewport overflow.
- **T3-AC-02** — Tool rows can expand to show file paths such as `tasks/inbox.md`, `tasks/focus.md`, and `daily/2026-05-06.md`.
- **T3-AC-03** — Chips wrap on narrow screens and never force horizontal scrolling.
- **T3-AC-04** — The composer keeps the mic button always visible and adds a send button when the draft contains text, so voice stays reachable while editing.
- **T3-AC-05** — The mic overlay opens directly into recording and shows recording, transcribing, and error states with cancel/confirm/retry controls; the captured transcript is inserted into the composer draft and is never displayed in the overlay.

### Key Locations

- Chat components: `apps/web/src/app/chat/`
- Shared UI components if introduced: `apps/web/src/app/ui/`
- Reference chat/list screen implementation: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/screens.tsx`
- Reference atoms such as chips, monogram, status dot, and mic button: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/atoms.tsx`
- Reference icons: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/icons.tsx`
- Reference visual tokens: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/tokens.ts`

### Key Discoveries

- The production app surface should use the viewport directly. The iPhone frame from the landing mock is not the default app shell.
- The reference user bubble is right-aligned, dark ink background, paper text, and rounded with a tighter lower-right corner.
- The reference assistant prose is unframed and inline in the conversation, with chips beneath the response.
- The reference composer is a rounded white input bar with subtle line/shadow, fixed near the bottom of the app shell.

## Task 3.4: Add Runtime i18n With Transloco (Signal API)

### Instructions

Introduce runtime internationalization for the Web app before the string-heavy drawer/list/polish tasks (Task 4, Task 5) add more hardcoded German. Add **Transloco** (`@jsverse/transloco`) as the i18n library and migrate the existing static UI-chrome strings from Task 1–3 into JSON translation catalogs.

Scope is **UI chrome only** — the static runtime text the app itself owns (header subtitle, mic overlay copy, composer placeholder, empty-state copy, and icon-only `aria-label`s). The mock conversation content in `apps/web/src/app/mock/chat-mock-data.ts` (assistant responses, voice transcript, tool-row text, quick-reply labels) is **out of scope**: it simulates dynamic backend/LLM output that production would return already in the user's language. Do not move it into the catalogs and do not author an English mock dataset in this task.

Use Transloco's **signal API** (`translateSignal` / the `transloco` pipe + structural directive), not the Observable/`subscribe` API. The app runs zone-less (`provideZonelessChangeDetection()`), so signal-based translations integrate with change detection without `zone.js` and without manual `toSignal` bridging.

Set up:

- `provideTransloco(...)` in `apps/web/src/app/app.config.ts` alongside the existing `provideMarkdown()`, configured with available langs `['de', 'en']`, default + fallback lang `de`, and `reRenderOnLangChange: true`.
- A small HTTP loader that fetches JSON catalogs at runtime (e.g. `GET /i18n/${lang}.json`). Catalogs live at `apps/web/public/i18n/de.json` and `apps/web/public/i18n/en.json`. JSON only — no XLIFF/XMB/XML and no per-locale build.
- Only the active language is fetched; switching to `en` lazy-loads `en.json` at runtime with no page reload and no rebuild.

Migrate these existing chrome strings into the catalogs and replace the hardcoded literals with translation keys (use a nested key namespace such as `chat.*`, `mic.*`, `composer.*`, `a11y.*`):

- `apps/web/src/app/chat/components/session-header.ts` — the `subtitle` computed (`"Heute · Mittwoch, 6. Mai"` / `"Bereit zum Erfassen"`).
- `apps/web/src/app/chat/chat-ui-state.ts` — `micOverlayStatus()` strings (`"Höre zu …"`, `"Verarbeite …"`, `"Nichts gehört"`, `"Bereit"`).
- `apps/web/src/app/chat/components/mic-overlay.html` (+ `mic-overlay.ts` `hintLabel`) — heading `Erfassen`, the three prompt variants, and the `aria-label`s (`Abbrechen`, `Aufnahme übernehmen`, `Erneut aufnehmen`).
- `apps/web/src/app/chat/components/chat-message-list.html` — empty-state title `Was liegt dir im Kopf?`, hint `Halte den Mic-Button gedrückt — oder schreib einfach.`, and the `aria-label="Unterhaltung"`.
- `apps/web/src/app/chat/components/chat-input.html` — placeholder `Frag Keppt …` and the `aria-label`s (`Nachricht verfassen`, `Nachricht`, `Spracheingabe öffnen`, `Nachricht senden`).

Author both `de.json` (the current German wording, verbatim) and `en.json` (a faithful English translation) for every migrated key.

Keep `chat-ui-state.ts` pure: `micOverlayStatus()` (and similar pure helpers) should return a stable **translation key**, not a translated string. Translation happens at the component/template edge where an injection context exists. Update `chat-ui-state.test.ts` to assert on keys rather than German literals.

Wire the Vitest setup so the existing specs keep passing: provide `TranslocoTestingModule` (or the standalone `provideTransloco` test equivalent) wherever a migrated component/helper is exercised. Pure logic specs that now assert on keys do not need the Transloco runtime.

### Acceptance

- **T3.4-AC-01** — Transloco is a Web dependency; `provideTransloco` is configured in `app.config.ts` with langs `de`/`en`, default `de`, and runtime language switching enabled.
- **T3.4-AC-02** — Translation catalogs are JSON files under `apps/web/public/i18n/` loaded at runtime via HTTP; no XLIFF/XML files and no per-locale build are introduced.
- **T3.4-AC-03** — Switching the active language between `de` and `en` updates the migrated chrome strings without a page reload, driven by Transloco's signal API.
- **T3.4-AC-04** — The migrated files (`session-header.ts`, `chat-ui-state.ts`, `mic-overlay.*`, `chat-message-list.html`, `chat-input.html`) contain no hardcoded German chrome strings; each resolves through a translation key present in both `de.json` and `en.json`.
- **T3.4-AC-05** — `apps/web/src/app/mock/chat-mock-data.ts` is unchanged; mock conversation content is not added to the catalogs.
- **T3.4-AC-06** — `pnpm -r typecheck` and `pnpm -r test` pass; existing chat/store/mock specs remain green, with pure helpers asserting on keys and component specs using the Transloco test setup.

### Key Locations

- Provider setup: `apps/web/src/app/app.config.ts`
- Transloco HTTP loader: new file under `apps/web/src/app/` (e.g. `transloco-loader.ts`)
- Catalogs: `apps/web/public/i18n/de.json`, `apps/web/public/i18n/en.json`
- Strings to migrate: `apps/web/src/app/chat/components/session-header.ts`, `apps/web/src/app/chat/chat-ui-state.ts`, `apps/web/src/app/chat/components/mic-overlay.html`, `apps/web/src/app/chat/components/mic-overlay.ts`, `apps/web/src/app/chat/components/chat-message-list.html`, `apps/web/src/app/chat/components/chat-input.html`
- Test setup: `apps/web/vitest.config.ts`, `apps/web/src/app/chat/chat-ui-state.test.ts`
- Out of scope (do not modify): `apps/web/src/app/mock/chat-mock-data.ts`
- Dependencies: `apps/web/package.json`, `pnpm-lock.yaml`

### Key Discoveries

- The app is zone-less (`provideZonelessChangeDetection()` in `app.config.ts`), so the Transloco **signal API** (`translateSignal`, `transloco` pipe/directive) is the natural fit; avoid the Observable/`subscribe` path and `toSignal` bridging.
- `public/` is already mapped as a build asset in `apps/web/angular.json` (`input: "public"`), so catalogs placed in `apps/web/public/i18n/` are served at `/i18n/*.json` without extra config.
- Transloco loads JSON catalogs at runtime and lazy-loads per language; this avoids the `@angular/localize` compile-time model (one build per locale, XLIFF extraction) the team wants to avoid.
- `micOverlayStatus()` in `chat-ui-state.ts` is a pure helper with no injection context, so it cannot call `translateSignal` directly. Return a translation key and translate at the component edge; this keeps the helper pure and lets `chat-ui-state.test.ts` assert on keys.
- This task front-loads i18n on purpose: Task 4 (drawer + six list screens + daily notes) and Task 5 (icon `aria-label`s like `Menü öffnen`, `Mehr`, `Zurück`, `Senden`) add the bulk of chrome strings. From Task 4 onward, new chrome strings should be added as translation keys with `de`/`en` entries rather than hardcoded literals.
- An English **mock conversation dataset** (translating `chat-mock-data.ts`) is intentionally deferred as an open question; only chrome is localized here.

## Task 3.5: Establish Angular Component Spec Harness With Angular Testing Library

### Instructions

Add a reusable Angular component-spec harness for the Web app before the drawer, polish, and UI playground work expands the component surface.

Move the Web test setup to Angular's official Vitest runner (`ng test` via the `@angular/build:unit-test` builder, stable since Angular 21) so standalone components with external `templateUrl`/`.scss` compile under test. The current direct `vitest run` with `environment: "node"` cannot compile Angular components; the builder replaces it and provides the DOM environment (jsdom or happy-dom). Update the Web `test` script so `pnpm -r test` still works, and align or remove the standalone `apps/web/vitest.config.ts` in favor of the builder's configuration (test include patterns must cover the existing `*.test.ts` naming — the builder defaults to `*.spec.ts`).

Add `@testing-library/angular` as a Web dev dependency and use its zoneless entry point (`@testing-library/angular/zoneless`), matching the app's `provideZonelessChangeDetection()` setup.

Add one component spec that becomes the template for future Angular specs. Prefer `ChatScreenComponent` or `ChatMessageListComponent`, because those components sit on the chat/store boundary and are representative of upcoming component tests. Use ATL's `render()` and assert through Testing Library DOM queries (what the user sees), not through component internals. Render child components for real — no shallow rendering and no component mocking; the standalone `imports` arrays keep the rendered tree small and explicit.

Mock at the DI boundary through runtime tokens. `ChatService` is an abstract class, not a TypeScript interface, so it can be used as a DI token; provide it via ATL's `vitest-utils` (`provideMock` / `provideMockWithValues`, built on `vi.fn()`) or a plain provider object in `render(..., { providers: [...] })`. Do not introduce a pattern where every component spec hand-wires `createEnvironmentInjector`, `Injector.create`, or direct `TestBed.configureTestingModule` setup.

Keep the test strategy split:

- Pure state and mock-service tests stay plain Vitest tests with no Angular runtime imports.
- Angular component and DI-heavy specs use ATL `render` + DOM queries.
- The existing chat/store tests should keep passing.
- No backend, Supabase, SSE, Capacitor, or real speech integration is introduced by this task.

### Acceptance

- **T3.5-AC-01** — The Web test setup can render at least one standalone Angular component (with external `templateUrl`/`.scss`) under the official `ng test` Vitest runner with a DOM-capable Angular test environment.
- **T3.5-AC-02** — `@testing-library/angular` is available as a Web dev dependency and the new component spec uses ATL `render()` (zoneless entry point) with Testing Library DOM queries instead of hand-written `TestBed.configureTestingModule` boilerplate; child components are rendered for real, not mocked.
- **T3.5-AC-03** — The new component spec mocks the `ChatService` or `ChatStore` boundary through Angular DI (e.g. ATL `vitest-utils` `provideMock`) rather than importing production mock arrays directly.
- **T3.5-AC-04** — Existing pure logic tests remain plain Vitest tests with no Angular runtime imports and keep passing under the new runner.
- **T3.5-AC-05** — The Web test command (`pnpm -r test`) runs both existing logic tests and the new Angular component spec in one invocation.

### Key Locations

- Web test config: `apps/web/vitest.config.ts` (to be replaced/aligned with the `ng test` builder config in `apps/web/angular.json`)
- Optional test setup file: `apps/web/src/test-setup.ts` or equivalent
- Web package dependencies/scripts: `apps/web/package.json` (`test` script, `vitest` version bump, `@testing-library/angular`, DOM environment package), `pnpm-lock.yaml`
- Candidate component spec: `apps/web/src/app/chat/chat-screen*.test.ts` or `apps/web/src/app/chat/components/chat-message-list*.test.ts`
- Chat DI boundary: `apps/web/src/app/chat/chat.service.ts`, `apps/web/src/app/chat/chat.store.ts`
- Existing tests to preserve: `apps/web/src/app/chat/chat-ui-state.test.ts`, `apps/web/src/app/chat/chat.store.test.ts`, `apps/web/src/app/mock/mock-chat.service.test.ts`

### Key Discoveries

- Decision 2026-07-09: Angular Testing Library replaces the originally planned `ng-mocks`. ng-mocks has an open Angular 21 bug breaking `MockProvider` (help-me-mom/ng-mocks#12725), a recurring 3–4 month support lag on new Angular majors, bus factor 1, and no official Vitest support. ATL tracks Angular releases within days, ships a dedicated zoneless entry point, and provides Vitest mock helpers.
- Testing philosophy shift accepted with this decision: mock at the service/DI boundary, render children for real, assert via DOM queries. Shallow rendering was a workaround for the NgModule era; standalone `imports` make it unnecessary. If a genuine shallow-rendering need appears later, ATL and ng-mocks are composable — decide then, not now.
- The Web app currently has only three test files, and only `chat.store.test.ts` touches Angular DI directly. There are no direct `TestBed` imports in the Web specs today.
- The Web app already has a growing Angular surface with standalone chat components; this task establishes the testing style before Task 4, Task 5, and Task 6 add more component states.
- Chat templates use the Transloco pipe since Task 3.4 with an HTTP loader; component specs must provide Transloco statically (e.g. `TranslocoTestingModule` with the real `de.json`/`en.json` catalogs) — the HTTP loader does not work under test. Decide deliberately whether specs assert translated strings or keys.
- `vi.mock` module mocking does not work under the `ng test` builder (angular/angular-cli#31609); mock at the DI level instead — ATL's `provideMock` is built on `vi.fn()` and is unaffected.
- The Web `vitest` devDependency is `^1.4.0`; the `@angular/build:unit-test` builder requires a newer Vitest major — bump it as part of this task (verify against the builder's peer range).
- `fakeAsync`/`waitForAsync` rely on zone.js and are not available in this zoneless setup; use Vitest fake timers where timing control is needed.

## Task 4: Add Drawer Navigation Surface

### Instructions

Implement the app drawer and reusable list screens for Inbox, Focus, Next Actions, Waiting, Someday/Maybe, and Daily Notes. Drawer navigation must call the chat service's `navigate` method and must close the drawer after selection.

Implement these surfaces:

- `AppDrawerComponent` with brand/date area, nav rows, counts, and user/trial footer.
- `ListScreenComponent` for Inbox, Focus, Waiting, and Someday/Maybe.
- Group support in `ListScreenComponent` for Next Actions.
- `DailyNotesComponent` with list and detail states for daily notes.

Use these drawer labels:

- Date: `Mittwoch · 6. Mai`
- Brand: `Keppt.`
- Taglines: `Capture everything.` and `Manage nothing.`
- Items: `Chat`, `Heute fragen`, `Inbox`, `Fokus`, `Nächste Schritte`, `Warten auf`, `Vielleicht irgendwann`, `Daily Notes`
- User footer: `Lutz`, `Trial · noch 11 Tage`

Use these screen headers and hints:

- Inbox: title `Inbox`, subtitle `4 Einträge · noch nicht sortiert`, hint `Alles, was rein wollte. Sag „Räum die Inbox auf"`
- Focus: title `Fokus`, subtitle `Diese Woche · 3–5 Prioritäten`, hint `Was wirklich auf dich zählt — der Rest darf warten.`
- Next: title `Nächste Schritte`, subtitle `Konkrete nächste Aktionen · gruppiert`, hint `Hier liegt alles, was du machen könntest. Frag „Was passt jetzt zu mir?"`
- Waiting: title `Warten auf`, subtitle `Blockiert · liegt nicht bei dir`, hint `Ich hake nicht von selbst nach — frag mich gern.`
- Someday: title `Vielleicht irgendwann`, subtitle `Ohne Zeitdruck · ohne schlechtes Gewissen`, hint `Hier landen Ideen. Wir schauen beim Weekly Review gemeinsam drauf.`
- Daily: title `Daily Notes`, subtitle `Tagesplan & Protokoll`

Use these mock rows:

- Inbox: `Anna wegen Angebot schreiben`, `Steuerunterlagen sortieren`, `YouTube-Idee — „AI Apps"`, `Geschenk für Mama recherchieren`.
- Focus: `Anna wegen Angebot schreiben`, `AI-Apps-Video gliedern`, `Auftrag VW abschließen`.
- Next groups: `Arbeit`, `Haus & Garten`, `Persönlich`, with the rows from the reference mock.
- Waiting: `Feedback von Max zur Rechnung` badge `3T`, `Antwort von DB zum Followup-Call` badge `8T`.
- Someday: `Sabbatical-Konzept skizzieren`, `Buchidee: GTD ohne Aufwand`, `Rust durchspielen`, `Garten-Wasserspiel`.
- Daily notes: Today/Wednesday May 6 plus Tuesday May 5, Monday May 4, Sunday May 3, each with plan/log/notes from the reference mock.

Ask-in-chat actions should route back to chat and trigger the related mock response: inbox cleanup, today, waiting, or next-action context.

### Acceptance

- **T4-AC-01** — Drawer shows Chat, Ask Today, Inbox, Focus, Next Actions, Waiting, Someday/Maybe, and Daily Notes with mock counts.
- **T4-AC-02** — Each list screen renders its title, subtitle, hint, and mock rows from typed data.
- **T4-AC-03** — Ask-in-chat actions return to chat and trigger the matching mock response for today, inbox cleanup, waiting, or next-action context.
- **T4-AC-04** — Daily Notes opens a detail surface with plan, log, and notes sections.

### Key Locations

- Drawer/list components: `apps/web/src/app/navigation/` or `apps/web/src/app/lists/`
- Router config: `apps/web/src/app/app.routes.ts`
- Mock list data: `apps/web/src/app/mock/`
- Reference mock data and strings: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/strings.tsx`
- Reference drawer/list/daily rendering: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/screens.tsx`
- Reference route state behavior: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/MockDevice.tsx`

### Key Discoveries

- `AppScreen` should use `daily-detail` for the opened daily note state.
- List rows support normal, dashed, and badge states.
- Next Actions is grouped; the other list screens are flat.
- Daily Notes detail must show plan, log, and notes sections, not only the daily note summary.

## Task 5: Polish Mobile App Behavior

### Instructions

Finish responsive behavior and interaction polish across chat, drawer, and list surfaces. Add scroll anchoring for new messages, fade/typing/mic animations, stable dimensions for buttons and repeated UI elements, accessible labels, and narrow-width safeguards.

Port or recreate these reference animation names and behaviors:

- `keppt-fade-up`: messages enter with opacity and a slight upward movement.
- `keppt-fade`: overlays/screens fade in.
- `keppt-typing`: typing dots pulse opacity in sequence.
- `keppt-pulse` and `keppt-pulse-tight`: mic capture circles pulse.
- `keppt-bar`: waveform bars scale vertically while listening.

Keep styling token-driven and custom CSS based. Avoid card-in-card layouts, decorative marketing sections, broad UI kits, and horizontal overflow. Text must not overlap or be clipped on narrow mobile widths. Buttons should have stable width/height so hover/focus/state changes do not shift the layout.

Add accessible labels for icon-only controls:

- Menu: `Menü öffnen`
- More: `Mehr`
- Back: `Zurück`
- Cancel/close: `Abbrechen` or `Menü schließen` depending on context
- Mic: `Sprache erfassen`
- Send: `Senden`
- Settings if present: `Einstellungen`

### Acceptance

- **T5-AC-01** — New chat messages keep the message list anchored near the latest message without moving the fixed composer.
- **T5-AC-02** — Fade-up, typing dots, mic pulse, and waveform/listening animations are present and do not cause layout shift.
- **T5-AC-03** — Header, drawer, composer, chips, badges, and buttons remain readable without overlap on narrow mobile widths.
- **T5-AC-04** — Familiar icon buttons have accessible labels for menu, more, back, close, mic, and send.

### Key Locations

- Global CSS: `apps/web/src/styles.css`
- Component styles: `apps/web/src/app/**/*.css`
- Reference animation CSS: `/home/lutz/projects/keppt/keppt-landing/src/styles/global.css`
- Reference layout/states: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/screens.tsx`
- Reference tokens: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/tokens.ts`
- Reference atoms for chip/status/mic behavior: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/atoms.tsx`

### Key Discoveries

- The reference mock hides scrollbars for chat/list scroll regions.
- The composer should stay fixed within the app shell while the message/list content scrolls independently.
- The Keppt palette is intentionally warm paper plus ink and accent brown; do not drift into a generic dark-blue, purple-gradient, or decorative landing-page theme.

## Task 6: Add UI Playground

### Instructions

Add an internal `/dev/ui` route that renders isolated component states for the core UI. Keep it lightweight and app-native; do not add Storybook. The route should be reachable in development and should not become the default route.

Render all of these fixed states using the same components and typed mock data shapes as the app:

- User bubble: short, long, and multi-line.
- Assistant prose: paragraph, ordered list, unordered list, and inline code/code token.
- Tool status row: collapsed and expanded.
- Quick replies: 2, 3, and 5 chips.
- Chat input: empty, with text, and focused.
- Mic overlay: recording, transcribing, and error.
- Drawer/list rows: normal, badge, and dashed.

The playground may use a compact fixture file, but it must not introduce a separate component API that diverges from the production components.

### Acceptance

- **T6-AC-01** — `/dev/ui` shows user bubbles in short, long, and multiline states.
- **T6-AC-02** — `/dev/ui` shows assistant prose with paragraph, ordered list, unordered list, and code token states.
- **T6-AC-03** — `/dev/ui` shows collapsed and expanded tool rows.
- **T6-AC-04** — `/dev/ui` shows quick replies with 2, 3, and 5 chips.
- **T6-AC-05** — `/dev/ui` shows chat input empty, with text, and focused.
- **T6-AC-06** — `/dev/ui` shows mic overlay recording, transcribing, and error states.
- **T6-AC-07** — `/dev/ui` shows drawer/list rows in normal, badge, and dashed states.

### Key Locations

- Playground route/component: `apps/web/src/app/dev/`
- Router config: `apps/web/src/app/app.routes.ts`
- Shared fixtures: `apps/web/src/app/mock/` or `apps/web/src/app/dev/`
- Reference state list: `/home/lutz/projects/keppt-app-keppt-ui/docs/specs/angular-chat-ui.md`
- Reference components/states: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/screens.tsx`
- Reference atoms: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/atoms.tsx`
- Reference data: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/strings.tsx`

### Key Discoveries

- The playground is intentionally lighter than Storybook and exists to inspect component states during the first UI implementation.
- It should exercise the production components, not duplicate them with one-off demo markup.

## Cross-Cutting Acceptance

- **XC-01** — The Angular UI remains mock-first: no backend, Supabase, SSE, Capacitor plugin, or real speech-recognition integration is introduced. **Touches:** T1, T2, T3, T4
- **XC-02** — Presentational UI remains product-owned and typed; no arbitrary generated UI/widget framework becomes the default chat renderer. **Touches:** T2, T3, T6
- **XC-03** — `pnpm -r build`, `pnpm -r typecheck`, and `pnpm -r test` pass after the planned web app work. **Touches:** T1, T2, T3, T3.4, T3.5, T4, T5, T6
