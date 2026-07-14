# Angular Chat UI Spec

> Source context: `docs/specs/context/ui-mock.md`, `docs/specs/architecture.md`, and the landing mock at `/home/lutz/projects/keppt/keppt-landing/`.

**Implementation amendment (Task 3, 2026-06-08):** The voice/mic and composer model below was redesigned during implementation, and this spec has been updated to match. Voice capture moved out of `ChatService` into a dedicated `VoiceCaptureService` (`startRecording`/`stopRecording`/`cancelRecording`), and `ChatService` gained a `busy` signal. `ChatService` also gained `cancel()` to abort the in-flight turn, and the composer shows a Stop affordance while busy. The mic overlay no longer exposes idle/listening/transcript states; it opens directly into recording and runs `recording → transcribing → error`, inserting the captured transcript into the composer draft instead of displaying or auto-sending it. The composer keeps the mic button always visible and _adds_ a send button when the draft has text, rather than switching mic↔send. (The assistant tool/status row shape was also restructured during a separate tool-lifecycle redesign — the `Message and Widget Shape` section below has been updated to the structured `{ tool, target, summary?, state }` form with derived client-side display. See `docs/work/keppt-ui/task-log/task-3-render-chat-conversation-surface.md`.)

**Implementation amendment (Task 4, 2026-07-10; async read contract simplified 2026-07-13; drawer metrics removed 2026-07-13):** The list surfaces were redefined from typed-row ports of the landing mock to **vault markdown views** over the product's real storage model, which `packages/core` already fixes (`gtd-layout.ts` allowlist: the five `tasks/*.md` files plus `daily/YYYY-MM-DD.md`; system-prompt R9 checkbox task format, R7 `##` category grouping in next-actions, R10 Plan/Log/Notes daily sections). An Angular-free, Promise-based `VaultRepository` is the only client data-access boundary. Only routed Vault/Daily views adapt those Promises with small local Angular Resources, while the date guard awaits the repository directly. The boundary is deliberately cache-free: there is no cross-component cache or request-sharing guarantee among those read consumers. `AppDrawerComponent` is data-independent navigation built from `SCREEN_REGISTRY`/`VAULT_SCREEN_ORDER` and `NavigationService`; it neither injects `VaultRepository` nor performs repository reads. There is no typed `ListEntry` row model, and the landing mock's dashed-bullet/badge row optics were deliberately dropped in favor of data honesty. Read-only in Task 4; the full-document editor mode is Task 4.5, tappable checkboxes in the rendered view are deferred. GFM task-checkbox tokens render directly as styleable, state-bearing `<span>`s through marked's typed `renderer.checkbox` hook because Angular's HTML sanitizer strips native `<input>` elements — sanitization stays enabled, and no serialized marked HTML is matched or rewritten. `ChatService`/`VoiceCaptureService`/`ChatStore` moved from component-level to app-level providers so conversation and composer state survive navigation. See `docs/work/keppt-ui/task-log/task-4-add-drawer-navigation-surface.md`.

**Screen-registry amendment (Task 4, 2026-07-13; ask localization corrected 2026-07-14):** Screen navigation is Angular-Router-backed (`/inbox`, …, `/daily/:date`), and the router remains the sole source of truth for the active screen. `navigation/screen-registry.ts` owns the typed runtime screen metadata and derived screen types; `NavigationService` owns drawer and active-screen state, validates activated route data, and updates `currentScreen` only on `NavigationEnd`. Direct URLs, browser history, guard redirects, and programmatic navigation therefore converge on the successfully activated route. `ChatService` and `ChatStore` expose no navigation state or actions. Ask-in-chat flows await successful route activation before sending their user message and treat an already-active target as success. Their prompts are static, app-authored copy: `NavigationService` resolves them from the active Transloco catalog at send time, while the mock route patterns accept both catalog languages.

**Date/localization amendment (Task 4, 2026-07-14):** The Daily index exposes only `DailyNoteRef { date, isToday }`; localized calendar labels are client presentation derived with `Intl.DateTimeFormat` from the active Transloco language, while relative/status words such as “Today” remain Transloco copy. The index carries no summary. Daily detail derives its date chrome from the route date and reads only the markdown file; it never reads the Daily index. Drawer and Chat current-date chrome use the same injected client clock/date presenter, and the Inbox subtitle contains no static item count.

## Goal

Build the first Angular UI for keppt as a mock-first mobile chat application. The result should make the core app experience tangible before the backend, Supabase, Capacitor plugins, and real LLM streaming are wired.

The app represents the chat-first product direction: the user talks or types, Keppt shows what it checked, replies conversationally, and offers compact next actions as chips or lightweight typed widgets.

## Strategic Decision

Keppt will not use Hashbrown, AG-UI, or A2UI for the default chat experience.

The default UI path is:

- Angular standalone components with Signals.
- Custom, typed chat components and widgets.
- A `ChatService` abstraction so mock data and real backend streaming can be swapped without rewriting the UI.
- A separate `NavigationService` for Router-backed screen and drawer state.
- Vercel AI SDK integration later, behind the service boundary.
- Capacitor later as a shell around the same Angular app.

This keeps the app visually and behaviorally controlled by the product, rather than delegating default chat rendering to a generative UI framework. If an "adjust mode" or richer generated component mode is needed later, it must be added as a separate explicit feature, not as the base architecture.

## Non-Goals

- No Hashbrown integration.
- No AG-UI or A2UI integration.
- No Angular Material, PrimeNG, DaisyUI, or shadcn-style component library.
- No backend, Supabase Auth, Supabase persistence, or SSE implementation in the mock-first UI task.
- No real Capacitor speech-recognition plugin in the first UI pass.
- No App Store or Android packaging work.
- No landing page; the first screen is the usable app experience.

## Reference Mock Findings

The current visual mock lives in `/home/lutz/projects/keppt/keppt-landing/`.

It is an Astro site with a React island:

- `src/components/mock/MockDevice.tsx`
- `src/components/mock/screens.tsx`
- `src/components/mock/atoms.tsx`
- `src/components/mock/iphone.tsx`
- `src/components/mock/tokens.ts`
- `src/components/mock/strings.tsx`
- `src/styles/global.css`

The mock is not Tailwind-based. Most component styling is inline React style objects, with shared colors, font families, and animation keyframes in token/global CSS files.

Reusable parts:

- Visual tokens: warm paper background, ink colors, accent brown, muted ink variants, hairlines.
- Typography direction: `Inter Tight`-style UI font and italic serif brand moments.
- Interaction patterns: status/tool rows, user bubble, assistant prose, quick-reply chips, chat input, mic overlay, drawer, list screens.
- Mock data and route behavior from `strings.tsx` and `MockDevice.tsx`.
- Animation names and behavior: fade-up, fade, typing dots, mic pulse, waveform bars.
- iPhone preview dimensions for dev preview only.

Not reusable as-is:

- React state and JSX component implementation.
- Inline style objects as source code.
- The iPhone frame as the production app shell.
- Astro page/layout structure.

## Product Surface

The first Angular UI must cover these surfaces:

- Chat screen as the default entry.
- Header with menu, Keppt mark, locale-reactive current-date/status subtitle derived from the client clock, and more button.
- Scrollable message list.
- Assistant status/tool row with optional expanded file list.
- Assistant prose responses rendered from compact Markdown.
- User message bubble.
- Quick-reply chips.
- Composer with text input, an always-visible mic button, and a send button added when text is entered.
- Simulated mic overlay with recording, transcribing, and error states; the captured transcript is inserted into the composer.
- Drawer navigation.
- Vault-file screens for Inbox, Focus, Next Actions, Waiting, and Someday/Maybe: metric-free screen chrome (title, subtitle, hint, optional ask-in-chat link) plus loading, error/retry, missing, empty, and rendered-markdown states supplied by component-local Resources over `VaultRepository`.
- Daily Notes with explicit async states for its minimal `DailyNoteRef` index; date labels are derived client-side, and detail reads only its route-selected markdown file.
- Optional internal dev UI playground route for component states.

The UI should feel like a real mobile app, not like a marketing mock. The production app surface should use the viewport directly. A device frame may exist only as a local development preview mode.

## Component Model

Recommended Angular components:

| Component                        | Responsibility                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShellComponent`              | Overall mobile viewport, routing outlet, safe-area handling.                                                                                                                                                                       |
| `ChatScreenComponent`            | Header, scroll area, suggestions, composer.                                                                                                                                                                                        |
| `SessionHeaderComponent`         | Menu/more controls, Keppt mark, and locale-reactive current-date/status subtitle.                                                                                                                                                  |
| `ChatMessageListComponent`       | Message rendering and scroll anchoring.                                                                                                                                                                                            |
| `UserMessageComponent`           | User bubble.                                                                                                                                                                                                                       |
| `AssistantMessageComponent`      | Assistant prose and attached chips/widgets.                                                                                                                                                                                        |
| `ToolStatusRowComponent`         | "Keppt checked..." row plus expandable file list.                                                                                                                                                                                  |
| `QuickRepliesComponent`          | Responsive chip row.                                                                                                                                                                                                               |
| `ChatInputComponent`             | Text input, always-visible mic, additive send button.                                                                                                                                                                              |
| `MicOverlayComponent`            | Simulated capture overlay.                                                                                                                                                                                                         |
| `AppDrawerComponent`             | Metric-free navigation; derives ordered vault rows from the screen registry, formats the current client date in the active locale, and delegates routing and active-screen state to `NavigationService` without repository access. |
| `VaultFileScreenComponent`       | One reusable routed screen for the five task files (registry-generated route data supplies file, i18n prefix, and optional ask flow); branches on the selected Resource before reading its value.                                  |
| `VaultPageHeaderComponent`       | Shared vault-screen chrome: hamburger/back, monogram, subtitle-over-title.                                                                                                                                                         |
| `DailyNotesScreenComponent`      | Async `DailyNoteRef` index Resource; projects ISO dates to locale-reactive labels client-side and renders no summary.                                                                                                              |
| `DailyNoteDetailScreenComponent` | One route-selected async markdown Resource; derives header dates from the route's ISO date plus active locale and never calls `listDailyNotes()`.                                                                                  |
| `UiPlaygroundComponent`          | Dev-only component state gallery.                                                                                                                                                                                                  |

Use standalone components and Signals. Prefer component inputs and outputs for presentational components; keep state transitions in services or container components.

ISO date-only values stay unlocalized in data contracts. A shared client date presenter uses the active Transloco language with `Intl.DateTimeFormat`; Transloco supplies relative/status copy such as “Today” and “Ready”. Language changes recompute Drawer, Chat, Daily-list, and Daily-detail chrome in place without repository reads. Tests use an injected/fixed clock rather than hardcoded production dates.

## Chat Service Contract

The UI must depend on a service boundary, not directly on mock arrays.

Initial shape:

```ts
export type ChatStatus = "idle" | "thinking" | "streaming" | "error";

export interface ChatService {
  readonly messages: Signal<ChatMessage[]>;
  readonly status: Signal<ChatStatus>;
  readonly busy: Signal<boolean>; // status() !== 'idle'; one definition of "a turn is in flight"
  sendMessage(content: string): Promise<void>;
  chooseQuickReply(label: string): Promise<void>;
  cancel(): void; // abort the in-flight turn: the user message stays, the whole assistant response is discarded, the underlying work stops; no-op when idle
}

// Voice capture is a separate boundary — a turn no longer auto-sends from voice:
export interface VoiceCaptureService {
  startRecording(): void;
  stopRecording(): Promise<string>; // MUST reject promptly if cancelled mid-flight
  cancelRecording(): void;
}
```

The first implementation is `MockChatService`. It should simulate:

- tool/status row after a short delay,
- typing indicator,
- final assistant message,
- quick replies,
- simple keyword routing for planning, today, waiting, inbox, and acknowledge flows.

Voice capture is simulated by a separate `MockVoiceCaptureService`: it produces a transcript string that the UI inserts into the composer draft (it does not auto-send a message), and honors an abort contract so a cancelled capture rejects rather than leaking a late transcript.

The later real implementation can wrap backend SSE and Vercel AI SDK response events for chat, and `MediaRecorder` plus a speech-to-text client for voice. UI components should not need to know which implementation is active.

## Screen Registry and Navigation Service Contract (Task 4)

Navigation is a separate application boundary from chat. The registry owns screen metadata and derived types; the service owns drawer state, route operations, and the route-derived active screen.

```ts
export const SCREEN_REGISTRY = {
  // chat, five vault screens, daily, and the daily-detail route pattern
} as const;

export type AppScreen = keyof typeof SCREEN_REGISTRY;
export type NavigableScreen = /* registry entries whose kind is chat, vault, or daily */;
export type VaultScreen = /* registry entries whose kind is vault */;

export const VAULT_SCREEN_ORDER: readonly VaultScreen[];

export function isAppScreen(value: unknown): value is AppScreen;
export function isNavigableScreen(
  value: unknown,
): value is NavigableScreen;
export function screenUrl(screen: NavigableScreen): string;

export type AskInChatFlow =
  | 'today'
  | 'inboxCleanup'
  | 'waiting'
  | 'nextContext';

export interface NavigationService {
  readonly currentScreen: Signal<AppScreen>;
  readonly drawerOpen: Signal<boolean>;
  go(screen: NavigableScreen): Promise<boolean>;
  openDailyNote(date: string): Promise<boolean>;
  askInChat(flow: AskInChatFlow): Promise<void>;
  openDrawer(): void;
  closeDrawer(): void;
}
```

The registry is the sole runtime source for screen IDs, Angular route patterns, vault files, i18n prefixes, screen-specific ask flows, and navigable URLs. `app.routes.ts` projects routes from it but keeps Angular components and guards local. `NavigationService` validates activated `data.screen` with `isAppScreen`; it never trusts a type assertion. Dynamic daily-detail URLs remain date-specific service operations rather than registry URLs.

`NavigationService.currentScreen` is a projection of successfully activated route data, never an optimistic write performed before routing completes. `go()` treats an already-active target as success because Angular reports ignored same-URL navigation as `false`; actual cancellation or rejection prevents a chained ask-in-chat message from being sent. After navigation succeeds, `askInChat()` resolves the flow's app-authored prompt from the active Transloco catalog and passes that localized text to `ChatService.sendMessage()`. Invalid runtime targets throw an explicit unsupported-target error before the Router is called.

## Vault Read Contract (Task 4)

The list surfaces read the vault as markdown files — what the user sees is what is stored. The file model mirrors `packages/core` (`gtd-layout.ts` allowlist; system-prompt R9/R7/R10 formats). Angular 22 is the minimum Web version because generic `resource()`, `Resource`, and `ResourceRef` are stable there.

```ts
export type VaultTaskFile =
  | "tasks/inbox.md"
  | "tasks/focus.md"
  | "tasks/next-actions.md"
  | "tasks/waiting.md"
  | "tasks/someday-maybe.md";
export type VaultFile = VaultTaskFile | `daily/${string}.md`;

export interface DailyNoteRef {
  date: string; // ISO; keys `daily/${date}.md` and the route param
  isToday: boolean;
}

// vault.repository.ts — framework-neutral client data-access port
export abstract class VaultRepository {
  abstract readFile(file: VaultFile): Promise<string | null>;
  abstract listDailyNotes(): Promise<readonly DailyNoteRef[]>;
}
```

The repository stays framework-neutral and cache-free. Vault-file screens and Daily detail each own only their file Resource; the Daily list owns its index Resource. Daily detail derives presentation from its route date and does not read the index. The Daily list and route guard may perform independent index reads; no cache identity or in-flight sharing is implied. The drawer is outside this read boundary: it uses registry metadata and `NavigationService` only.

The `/daily/:date` guard awaits `VaultRepository.listDailyNotes()` directly. A successfully resolved index without the requested date redirects to `/daily`, while transport/auth failures remain navigation errors. Its read is independent from the Daily list Resource; Daily detail performs no index read.

```text
Vault-file screen / Daily detail ──readFile()────────┐
Daily list / route guard ─────────listDailyNotes()───┤
                                                     ↓
                                      VaultRepository (Promise API)
        ↓
MockVaultRepository now
HttpVaultRepository later → Express API → server FileRepository
```

These states are intentionally distinct:

| State/value      | Meaning                                                    |
| ---------------- | ---------------------------------------------------------- |
| `undefined`      | No value has loaded yet.                                   |
| Resource `error` | The read failed; do not call `value()` in this state.      |
| `null`           | The requested file does not exist.                         |
| `""`             | The file exists and is empty.                              |
| `[]`             | The Daily index loaded successfully and contains no notes. |

Resources therefore have no `defaultValue`; loading must not masquerade as an empty success. During reload, a retained usable value continues to render.

Seed/storage format facts the UI relies on: tasks are `- [ ]` / `- [x]` checkbox lines (row metas as trailing text), `tasks/next-actions.md` groups via `##` category headings, daily files use `## Plan` / `## Log` / `## Notizen` sections (Notizen omitted for days without notes). Components consume content only through `VaultRepository` — no typed row models and no direct `mock/` imports. `MockVaultRepository` provides deterministic asynchronous access to the reference seed. A future `HttpVaultRepository` calls the Express file API; the server then selects its own `FileRepository` implementation (Local or Supabase). No browser Supabase adapter belongs in this layer.

Task 4.5 adds ordinary Promise-based writes to `VaultRepository`; the HTTP implementation sends them through the Express API. Save state is modeled separately from Resource read state, and writes never run inside a Resource loader. After persistence succeeds, the affected component explicitly reloads or otherwise refreshes its local read Resource. No cross-component cache invalidation is implied, and the data-independent drawer requires none.

## Message and Widget Shape

Use typed messages so the mock and backend can converge on the same UI contract. Assistant prose is Markdown content, not a client-side prose AST. Keep typed data for product UI patterns such as tool/status rows and quick replies.

```ts
export type ChatMessage =
  | UserChatMessage
  | AssistantToolMessage
  | AssistantTypingMessage
  | AssistantContentMessage;

export interface UserChatMessage {
  id: string;
  role: "user";
  text: string;
  createdAt: string;
}

// Tool vocabulary mirrors the backend's work tools; the displayed verb + icon
// are derived client-side from the structured call, not sent by the backend.
// `suggest_quick_replies` is intentionally NOT a ToolName — the adapter maps a
// successful tool result to a content message's normalized quick replies, so an
// invalid raw call can never become either a chip or a tool row.
export type ToolName =
  | "read_file"
  | "list_files"
  | "search_files"
  | "find_task_occurrences"
  | "edit_file"
  | "write_file";

export type ToolState = "running" | "done";

export interface AssistantToolMessage {
  id: string;
  role: "assistant";
  kind: "tool";
  tool: ToolName; // structured tool name — drives the verb and icon
  target: string; // file_path, search query, list prefix, or joined candidates
  summary?: string; // model-authored change_summary (edit_file / write_file only)
  state: ToolState;
  createdAt: string;
}

export interface AssistantTypingMessage {
  id: string;
  role: "assistant";
  kind: "typing";
  createdAt: string;
}

export interface AssistantContentMessage {
  id: string;
  role: "assistant";
  kind: "content";
  markdown: string;
  quickReplies?: QuickReply[];
  createdAt: string;
}

export interface QuickReply {
  id: string;
  /** Backend-normalized mobile button label; at most 40 characters. */
  label: string;
  action?: string;
}
```

Tool/status rows carry a structured `{ tool, target, summary?, state }` shape rather than a pre-rendered label: the backend emits the tool name and its arguments, and the UI derives the displayed verb, icon, and any collapsed-group header client-side (see `apps/web/src/app/chat/chat-tool-registry.ts`). Consecutive tool messages run-length-group into one collapsible row at render time; grouping is a view concern, not domain state.

Do not model widgets as arbitrary generated UI. Model only product-known UI patterns. Add new widget types deliberately when a concrete use case needs them.

## Styling Requirements

Use custom CSS and CSS variables as the primary styling layer. Tailwind is optional only if it makes the Angular implementation materially faster; the reference mock itself is not Tailwind-based, so Tailwind is not a migration requirement.

Token baseline:

```css
:root {
  --keppt-paper: #f6f3ee;
  --keppt-paper-alt: #efebe3;
  --keppt-paper-2: #ede9df;
  --keppt-ink: #1a1814;
  --keppt-ink-2: rgba(26, 24, 20, 0.62);
  --keppt-ink-3: rgba(26, 24, 20, 0.38);
  --keppt-ink-4: rgba(26, 24, 20, 0.18);
  --keppt-ink-5: rgba(26, 24, 20, 0.1);
  --keppt-line: rgba(26, 24, 20, 0.08);
  --keppt-hairline: rgba(26, 24, 20, 0.06);
  --keppt-accent: #b07a52;
  --keppt-accent-soft: rgba(176, 122, 82, 0.1);
  --keppt-accent-soft-2: rgba(176, 122, 82, 0.18);
}
```

Layout requirements:

- Use `100dvh` for the app shell.
- Account for `env(safe-area-inset-*)`.
- Keep the composer fixed to the bottom within the app shell.
- Keep message scroll independent from the viewport.
- Support narrow mobile widths without text overlap.
- Chips must wrap and never force horizontal overflow.
- Buttons should use icon affordances where familiar: menu, more, back, mic, send.
- Avoid card-in-card layouts and decorative marketing sections.

## UI Playground

Add an internal component gallery route, for example `/dev/ui`, during the first UI implementation.

It should render important components in fixed states:

- user bubble: short, long, multi-line;
- assistant prose: paragraph, ordered list, unordered list, code token;
- tool status row: collapsed and expanded;
- quick replies: 2, 3, and 5 chips;
- chat input: empty, with text, focused;
- mic overlay: recording, transcribing, error;
- drawer rows: normal and active.

This is intentionally lighter than Storybook. Storybook may be added later if the component set becomes a shared design system, but it is not required for the mock-first phase.

## Acceptance Criteria

- **AC-01:** The Angular app opens directly into the Keppt chat experience, not a landing page.
- **AC-02:** The main mock flow from the landing mock is reproducible in Angular: greeting, status row, quick replies, voice capture that inserts a transcript into the composer draft, and the planning response. (The landing mock's auto-send "capture confirmation" step is superseded by the insert-into-composer voice model.)
- **AC-03:** The UI is implemented with Angular standalone components and Signals.
- **AC-04:** Chat components depend on a `ChatService` abstraction; replacing `MockChatService` with a future backend implementation must not require rewriting presentational components.
- **AC-05:** Hashbrown, AG-UI, and A2UI are absent from runtime dependencies and implementation.
- **AC-06:** The styling is based on Keppt CSS tokens ported from the landing mock.
- **AC-07:** The app shell supports mobile viewport behavior and safe-area insets suitable for a future Capacitor shell.
- **AC-08:** The dev UI playground shows the core components in isolated states.
- **AC-09:** The app builds through the repo's package manager scripts.
- **AC-10:** Dates in Drawer, Chat, Daily list, and Daily detail come from the client clock/ISO date plus active locale, update on language change without backend refetch, and no static Inbox count or backend-localized Daily label/summary is rendered.

## Follow-Up Tasks

### Task: Adopt `ng-mocks` for Angular Component and DI Specs

Add `ng-mocks` when the Web UI starts adding real Angular component specs or deeper DI-bound specs.

Current repo finding from 2026-06-06:

- The Web app currently has only three test files: `chat-ui-state.test.ts`, `chat.store.test.ts`, and `mock-chat.service.test.ts`.
- Only `chat.store.test.ts` touches Angular DI directly, via `createEnvironmentInjector`; there are no direct `TestBed` imports in the Web specs.
- The Web app already has a growing Angular surface: 14 standalone components and one injectable store/service boundary. This is the likely trigger for `ng-mocks`, not the current pure logic tests.
- The current Web test runner is direct Vitest with `environment: "node"`. Real Angular component specs will need an intentional DOM/Angular test setup before `ng-mocks` can carry the component tree.

Decision:

- Keep pure logic tests in plain Vitest.
- Use `ng-mocks` for Angular component specs and DI-heavy specs once the first shallow component test is introduced.
- Prefer `MockBuilder`, `MockRender`, `MockProvider`, and `ngMocks` helpers over hand-written `TestBed.configureTestingModule` boilerplate.
- Do not add `ng-mocks` just to hide the single current `createEnvironmentInjector` store test unless that test becomes a pattern.

First implementation task:

- Add `ng-mocks` as a Web dev dependency.
- Configure the Web test environment for Angular component tests under Vitest.
- Add one shallow component spec for either `ChatScreenComponent` or `ChatMessageListComponent`.
- Mock the `ChatService`/`ChatStore` boundary through `ng-mocks` instead of hand-wiring providers.
- Keep this as the template for future Angular specs.

Notes:

- `ChatService` is an abstract class, not a TypeScript interface, which makes it usable as a runtime DI token for `MockProvider`.
- `ng-mocks` is a wrapper around Angular's test infrastructure, not a replacement for it. The value is that it hides the TestBed setup behind a stable, terse testing style.
- The current `ng-mocks` compatibility table lists Angular 21 with standalone components and Signals support; `defer` support is not listed. Avoid relying on `ng-mocks` for defer-block behavior until verified.

## Deferred Work

- Backend SSE chat integration.
- Supabase Auth and persistence.
- Real Capacitor shell configuration.
- Native speech recognition.
- Image input.
- File browser and edit mode beyond mock list screens.
- Billing, App Store, Android packaging.
