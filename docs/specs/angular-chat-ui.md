# Angular Chat UI Spec

> Source context: `docs/specs/context/ui-mock.md`, `docs/specs/architecture.md`, and the landing mock at `/home/lutz/projects/keppt/keppt-landing/`.

**Implementation amendment (Task 3, 2026-06-08):** The voice/mic and composer model below was redesigned during implementation, and this spec has been updated to match. Voice capture moved out of `ChatService` into a dedicated `VoiceCaptureService` (`startRecording`/`stopRecording`/`cancelRecording`), and `ChatService` gained a `busy` signal. `ChatService` also gained `cancel()` to abort the in-flight turn, and the composer shows a Stop affordance while busy. The mic overlay no longer exposes idle/listening/transcript states; it opens directly into recording and runs `recording → transcribing → error`, inserting the captured transcript into the composer draft instead of displaying or auto-sending it. The composer keeps the mic button always visible and *adds* a send button when the draft has text, rather than switching mic↔send. (The assistant tool/status row shape was also restructured during a separate tool-lifecycle redesign — the `Message and Widget Shape` section below has been updated to the structured `{ tool, target, summary?, state }` form with derived client-side display. See `docs/work/keppt-ui/task-log/task-3-render-chat-conversation-surface.md`.)

## Goal

Build the first Angular UI for keppt as a mock-first mobile chat application. The result should make the core app experience tangible before the backend, Supabase, Capacitor plugins, and real LLM streaming are wired.

The app represents the chat-first product direction: the user talks or types, Keppt shows what it checked, replies conversationally, and offers compact next actions as chips or lightweight typed widgets.

## Strategic Decision

Keppt will not use Hashbrown, AG-UI, or A2UI for the default chat experience.

The default UI path is:

- Angular standalone components with Signals.
- Custom, typed chat components and widgets.
- A `ChatService` abstraction so mock data and real backend streaming can be swapped without rewriting the UI.
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
- Header with menu, Keppt mark, date/status subtitle, and more button.
- Scrollable message list.
- Assistant status/tool row with optional expanded file list.
- Assistant prose responses rendered from compact Markdown.
- User message bubble.
- Quick-reply chips.
- Composer with text input, an always-visible mic button, and a send button added when text is entered.
- Simulated mic overlay with recording, transcribing, and error states; the captured transcript is inserted into the composer.
- Drawer navigation.
- Mock list screens for Inbox, Focus, Next Actions, Waiting, Someday/Maybe, and Daily Notes.
- Optional internal dev UI playground route for component states.

The UI should feel like a real mobile app, not like a marketing mock. The production app surface should use the viewport directly. A device frame may exist only as a local development preview mode.

## Component Model

Recommended Angular components:

| Component | Responsibility |
|---|---|
| `AppShellComponent` | Overall mobile viewport, routing outlet, safe-area handling. |
| `ChatScreenComponent` | Header, scroll area, suggestions, composer. |
| `SessionHeaderComponent` | Menu/more controls, Keppt mark, date/status subtitle. |
| `ChatMessageListComponent` | Message rendering and scroll anchoring. |
| `UserMessageComponent` | User bubble. |
| `AssistantMessageComponent` | Assistant prose and attached chips/widgets. |
| `ToolStatusRowComponent` | "Keppt checked..." row plus expandable file list. |
| `QuickRepliesComponent` | Responsive chip row. |
| `ChatInputComponent` | Text input, always-visible mic, additive send button. |
| `MicOverlayComponent` | Simulated capture overlay. |
| `AppDrawerComponent` | Navigation and counts. |
| `ListScreenComponent` | Reusable list screen for GTD lists. |
| `DailyNotesComponent` | Daily note list and detail surface. |
| `UiPlaygroundComponent` | Dev-only component state gallery. |

Use standalone components and Signals. Prefer component inputs and outputs for presentational components; keep state transitions in services or container components.

## Chat Service Contract

The UI must depend on a service boundary, not directly on mock arrays.

Initial shape:

```ts
export type ChatStatus = 'idle' | 'thinking' | 'streaming' | 'error';

export interface ChatService {
  readonly messages: Signal<ChatMessage[]>;
  readonly status: Signal<ChatStatus>;
  readonly busy: Signal<boolean>; // status() !== 'idle'; one definition of "a turn is in flight"
  readonly currentScreen: Signal<AppScreen>;
  sendMessage(content: string): Promise<void>;
  chooseQuickReply(label: string): Promise<void>;
  cancel(): void; // abort the in-flight turn: the user message stays, the whole assistant response is discarded, the underlying work stops; no-op when idle
  navigate(screen: AppScreen): void;
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
  role: 'user';
  text: string;
  createdAt: string;
}

// Tool vocabulary mirrors the backend's work tools; the displayed verb + icon
// are derived client-side from the structured call, not sent by the backend.
// `suggest_quick_replies` is intentionally NOT a ToolName — the adapter maps it
// to a content message's quick replies, so it can never become a tool row.
export type ToolName =
  | 'read_file'
  | 'list_files'
  | 'search_files'
  | 'find_task_occurrences'
  | 'edit_file'
  | 'write_file';

export type ToolState = 'running' | 'done';

export interface AssistantToolMessage {
  id: string;
  role: 'assistant';
  kind: 'tool';
  tool: ToolName;   // structured tool name — drives the verb and icon
  target: string;   // file_path, search query, list prefix, or joined candidates
  summary?: string; // model-authored change_summary (edit_file / write_file only)
  state: ToolState;
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
  markdown: string;
  quickReplies?: QuickReply[];
  createdAt: string;
}

export interface QuickReply {
  id: string;
  label: string;
  action?: string;
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
  --keppt-ink-5: rgba(26, 24, 20, 0.10);
  --keppt-line: rgba(26, 24, 20, 0.08);
  --keppt-hairline: rgba(26, 24, 20, 0.06);
  --keppt-accent: #b07a52;
  --keppt-accent-soft: rgba(176, 122, 82, 0.10);
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
- drawer/list rows: normal, badge, dashed.

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
