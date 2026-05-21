# Angular Chat UI Plan

Spec: `docs/specs/angular-chat-ui.md`
Scope: `docs/work/keppt-ui/` on branch `keppt-ui`

This plan builds the first mock-first Angular UI for Keppt as a mobile chat app. Each task includes the reference mock files and extracted facts it needs; `/start-task N` should not require rereading the spec or sibling tasks.

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
- **T2-AC-02** — The mock service simulates tool row, typing, final assistant response, and quick replies for greeting, capture confirmation, planning, today, waiting, inbox, and acknowledge flows.
- **T2-AC-03** — Keyword routing covers planning, today/focus, waiting/Max/DB, inbox cleanup, and fallback capture.
- **T2-AC-04** — Voice capture simulation emits the Anna/tax-documents/AI-Apps transcript, then produces the capture confirmation response.

### Key Locations

- New Angular service/types: `apps/web/src/app/chat/`
- New mock data: `apps/web/src/app/mock/`
- Angular provider setup: `apps/web/src/app/app.config.ts`
- Reference mock content and route behavior: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/strings.tsx`
- Reference mock timing and handlers: `/home/lutz/projects/keppt/keppt-landing/src/components/mock/MockDevice.tsx`

### Key Discoveries

- The reference main mock flow is greeting/check status, quick replies, simulated voice transcript, capture confirmation, then a planning answer for `Ich habe morgen nur 4 Stunden. Was ist realistisch?`.
- The German mock is the primary content source for this app pass.
- Important chips include `Tag planen`, `Warten auf zeigen`, `Erstmal nur erfassen`, `Ja, Anna zuerst`, `Plan morgen — 4 h`, `Später entscheiden`, `Ja, eintragen`, `Anpassen`, `An Max pingen`, `Tagesplan starten`, `Plan für morgen`, `Räum die Inbox auf`, and `Was steht heute an?`.
- Reference regex routing is `4 stunden|plan morgen|plan für morgen|realistisch`, `heute|wichtig|fokus`, `warten|waiting|max|db`, and `inbox|aufräumen|sortier`.

## Task 3: Render Chat Conversation Surface

### Instructions

Build the chat screen and message components against the typed service data. The chat route must render the header, independent message scroll area, user messages, assistant tool/status rows, assistant typing state, assistant prose blocks, quick replies, bottom composer, and simulated mic overlay.

Implement these components or equivalent standalone components:

- `ChatScreenComponent` for the header, scroll area, suggestions, and composer.
- `SessionHeaderComponent` with menu button, Keppt mark, date/status subtitle, and more button.
- `ChatMessageListComponent` with scroll anchoring when messages change.
- `UserMessageComponent` for right-aligned dark user bubbles.
- `AssistantMessageComponent` for typed assistant blocks and attached quick replies.
- `ToolStatusRowComponent` for `"Keppt checked..."` style rows and expandable file lists.
- `QuickRepliesComponent` for wrapping chip rows.
- `ChatInputComponent` for text input and mic/send state switch.
- `MicOverlayComponent` for simulated capture overlay.

Render assistant block types without a generic markdown package: paragraphs, headings, ordered lists, unordered lists, inline strong/emphasis/muted/code marks, and code blocks/tokens. Use familiar icon affordances for menu, more, back, close, mic, send, file, and expand/collapse. Use `lucide-angular` or similarly narrow icon dependency if icons are not already available; do not add a broad UI component library.

Use these concrete UI states from the reference mock:

- Header subtitle is `Bereit zum Erfassen` when chat is empty and `Heute · Mittwoch, 6. Mai` after messages exist.
- Empty chat copy is `Was liegt dir im Kopf?` and `Halte den Mic-Button gedrückt — oder schreib einfach.`
- Input placeholder is `Frag Keppt …`.
- Tool rows should show an inline file icon, muted text, and a chevron only when files exist. Expanded state shows each file path in monospace.
- Typing state uses three pulsing dots.
- Mic overlay heading is `Erfassen`; statuses are `Höre zu …` and `Bereit`; idle prompt is `Sprich einfach drauflos. Ich schreibe mit.`

### Acceptance

- **T3-AC-01** — The chat screen renders header, independent scroll area, message list, quick replies, and bottom composer without viewport overflow.
- **T3-AC-02** — Tool rows can expand to show file paths such as `tasks/inbox.md`, `tasks/focus.md`, and `daily/2026-05-06.md`.
- **T3-AC-03** — Chips wrap on narrow screens and never force horizontal scrolling.
- **T3-AC-04** — The composer switches from mic to send when text is entered.
- **T3-AC-05** — The mic overlay shows idle, listening, and transcript states.

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
- Mic overlay: idle, listening, and transcript.
- Drawer/list rows: normal, badge, and dashed.

The playground may use a compact fixture file, but it must not introduce a separate component API that diverges from the production components.

### Acceptance

- **T6-AC-01** — `/dev/ui` shows user bubbles in short, long, and multiline states.
- **T6-AC-02** — `/dev/ui` shows assistant prose with paragraph, ordered list, unordered list, and code token states.
- **T6-AC-03** — `/dev/ui` shows collapsed and expanded tool rows.
- **T6-AC-04** — `/dev/ui` shows quick replies with 2, 3, and 5 chips.
- **T6-AC-05** — `/dev/ui` shows chat input empty, with text, and focused.
- **T6-AC-06** — `/dev/ui` shows mic overlay idle, listening, and transcript states.
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
- **XC-03** — `pnpm -r build`, `pnpm -r typecheck`, and `pnpm -r test` pass after the planned web app work. **Touches:** T1, T2, T3, T4, T5, T6
