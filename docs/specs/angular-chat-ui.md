# Angular Chat UI Spec

> Source context: `docs/specs/context/ui-mock.md`, `docs/specs/architecture.md`, and the landing mock at `/home/lutz/projects/keppt/keppt-landing/`.

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
- Composer with text input and mic/send button.
- Simulated mic overlay with idle, listening, and transcript states.
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
| `ChatInputComponent` | Text input, send/mic state switch. |
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
  readonly currentScreen: Signal<AppScreen>;
  sendMessage(content: string): Promise<void>;
  chooseQuickReply(label: string): Promise<void>;
  startVoiceCapture(): void;
  cancelVoiceCapture(): void;
  navigate(screen: AppScreen): void;
}
```

The first implementation is `MockChatService`. It should simulate:

- tool/status row after a short delay,
- typing indicator,
- final assistant message,
- quick replies,
- mic transcript capture,
- simple keyword routing for planning, today, waiting, inbox, and acknowledge flows.

The later real implementation can wrap backend SSE and Vercel AI SDK response events. UI components should not need to know which implementation is active.

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
- mic overlay: idle, listening, transcript;
- drawer/list rows: normal, badge, dashed.

This is intentionally lighter than Storybook. Storybook may be added later if the component set becomes a shared design system, but it is not required for the mock-first phase.

## Acceptance Criteria

- **AC-01:** The Angular app opens directly into the Keppt chat experience, not a landing page.
- **AC-02:** The main mock flow from the landing mock is reproducible in Angular: greeting, status row, quick replies, voice capture simulation, capture confirmation, planning response.
- **AC-03:** The UI is implemented with Angular standalone components and Signals.
- **AC-04:** Chat components depend on a `ChatService` abstraction; replacing `MockChatService` with a future backend implementation must not require rewriting presentational components.
- **AC-05:** Hashbrown, AG-UI, and A2UI are absent from runtime dependencies and implementation.
- **AC-06:** The styling is based on Keppt CSS tokens ported from the landing mock.
- **AC-07:** The app shell supports mobile viewport behavior and safe-area insets suitable for a future Capacitor shell.
- **AC-08:** The dev UI playground shows the core components in isolated states.
- **AC-09:** The app builds through the repo's package manager scripts.

## Deferred Work

- Backend SSE chat integration.
- Supabase Auth and persistence.
- Real Capacitor shell configuration.
- Native speech recognition.
- Image input.
- File browser and edit mode beyond mock list screens.
- Billing, App Store, Android packaging.
