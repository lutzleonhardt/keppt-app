### Task
Render the Angular chat conversation surface (header, independent scroll area, typed product rows, Markdown assistant prose, quick replies, composer) and the voice capture overlay. The mic capture was reworked (2026-06-08) from a simulated press-and-hold preview into a record → transcribe (async) → insert-into-composer model backed by a dedicated `VoiceCaptureService`. The assistant tool/typing lifecycle was redesigned (2026-06-09) to mirror the real agent loop: a turn is an ordered block list (Text/Tool interleave) replayed as `••• → tool(running→done)… → ••• → prose → chips`, tool messages carry a structured `{ tool, target, summary?, state }` shape, and consecutive tool calls run-length-group into one collapsible box. A turn can now be cancelled mid-flight (2026-06-09): while a response is in flight the composer swaps its action area to a single Stop (✕) button whose press discards the whole assistant turn — keeping the user message — and returns to idle, backed by a new `ChatService.cancel()` contract method.

### Status
DONE

### Files Modified
- `apps/web/package.json` (modified) — added the maintained narrow `@lucide/angular` icon package for familiar menu, more, file, chevron, mic, send, close, and confirm affordances.
- `pnpm-lock.yaml` (modified) — locked `@lucide/angular@1.16.0`.
- `apps/web/src/app/app.routes.ts` (modified) — routes the default path to `ChatScreenComponent` instead of the removed coarse chat shell.
- `apps/web/src/app/chat-shell/chat-shell.html` (deleted) — replaced by dedicated chat screen and component templates.
- `apps/web/src/app/chat-shell/chat-shell.scss` (deleted) — replaced by scoped component styles under `apps/web/src/app/chat/`.
- `apps/web/src/app/chat-shell/chat-shell.ts` (deleted) — replaced by `ChatScreenComponent` plus focused presentational/chat UI components.
- `apps/web/src/app/chat/chat-screen.html` (new) — composes the header, conversation list, composer, and mic overlay; overlay wired to `cancel`/`stop`/`retry`. Renders the quick-reply bar (`store.activeQuickReplies()`) between the conversation list and the composer (2026-06-08).
- `apps/web/src/app/chat/chat-screen.scss` (new) — defines the full-viewport routed chat screen surface.
- `apps/web/src/app/chat/chat-screen.ts` (new) — wires the routed screen to `ChatStore`, provides `MockChatService` and `MockVoiceCaptureService` via `useClass`, and returns focus to the composer (caret at end) after OK/cancel via `afterNextRender` + `viewChild`. Imports `QuickRepliesComponent` for the screen-level bar (2026-06-08).
- `apps/web/src/app/chat/chat-ui-state.ts` (new) — pure helpers for composer state and expandable tool rows; defines `MicCaptureState` (`closed|recording|transcribing|error`) and `micOverlayStatus`/`isMicOverlayVisible`.
- `apps/web/src/app/chat/chat-ui-state.test.ts` (new) — covers the pure helpers and the four capture-state → status/visibility mappings.
- `apps/web/src/app/chat/chat.service.ts` (modified) — reverted to the conversation-only contract (messages/status/currentScreen/sendMessage/chooseQuickReply/navigate). The voice methods moved to `VoiceCaptureService` (2026-06-08). Adds a concrete `busy` signal (`status !== "idle"`) to the contract so the store, UI, and the mock's re-entrancy guards share one definition (2026-06-08).
- `apps/web/src/app/chat/voice-capture.service.ts` (new) — abstract `VoiceCaptureService` (`startRecording`/`stopRecording`/`cancelRecording`) with the documented abort contract: `stopRecording()` must settle by rejecting if cancelled mid-flight.
- `apps/web/src/app/chat/chat.store.ts` (modified) — injects `ChatService` + `VoiceCaptureService`; owns the `MicCaptureState` machine; `finishRecording()` transcribes async and appends the transcript to the composer draft (never sends); cancel/error guards rely on the abort contract (no generation token). Exposes `activeQuickReplies` (derived from the **last** message only) and `busy` (pass-through of `ChatService.busy`); `chooseQuickReply`/`submitDraft` are in-flight-guarded (busy-check before clearing the draft); `canSubmit` uses `!busy` (2026-06-08).
- `apps/web/src/app/chat/chat.store.test.ts` (modified) — two-service injector helper; covers record→transcribe→append, append-to-existing-draft, cancel-while-recording, the cancel→reopen abort race, empty→error+retry, and async submit, using Vitest fake timers. Adds in-flight-guard coverage (ignore second quick reply while busy; ignore submit while busy without losing the typed draft), the stale-chip regression test (latest turn with no chips ⇒ no quick replies), and renames `quickReplies()` → `activeQuickReplies()` (2026-06-08).
- `apps/web/src/app/chat/components/session-header.html` (new) — renders menu button, Keppt mark, subtitle, and more button.
- `apps/web/src/app/chat/components/session-header.scss` (new) — styles the compact app header.
- `apps/web/src/app/chat/components/session-header.ts` (new) — computes empty/non-empty chat subtitle copy.
- `apps/web/src/app/chat/components/chat-message-list.html` (new) — renders the independent conversation scroll viewport, empty state, and message stack.
- `apps/web/src/app/chat/components/chat-message-list.scss` (new) — styles the scroll area, empty state, message stack, and native scrollbar preferences.
- `apps/web/src/app/chat/components/chat-message-list.ts` (new) — owns scroll anchoring. (Quick-reply source detection removed 2026-06-08 — quick replies moved to a store-driven bar in `chat-screen`.)
- `apps/web/src/app/chat/components/chat-message.html` (modified) — delegates user, tool, typing, and assistant content variants to focused components.
- `apps/web/src/app/chat/components/chat-message.scss` (modified) — keeps only shared dispatch/typing-dot styles.
- `apps/web/src/app/chat/components/chat-message.ts` (modified) — dispatches to the focused message variant components. (Quick-reply input/output wiring removed 2026-06-08.)
- `apps/web/src/app/chat/components/user-message.html` (new) — renders right-aligned user message bubbles.
- `apps/web/src/app/chat/components/user-message.scss` (new) — styles dark user bubbles with the tighter lower-right corner.
- `apps/web/src/app/chat/components/user-message.ts` (new) — typed user-message presentational component.
- `apps/web/src/app/chat/components/assistant-message.html` (new) — renders assistant Markdown content. (Inline quick replies removed 2026-06-08; they now render once in the screen-level bar.)
- `apps/web/src/app/chat/components/assistant-message.scss` (new) — keeps assistant prose unframed in the conversation.
- `apps/web/src/app/chat/components/assistant-message.ts` (new) — typed assistant content wrapper.
- `apps/web/src/app/chat/components/tool-status-row.html` (new) — renders typed status/tool rows and expandable file lists.
- `apps/web/src/app/chat/components/tool-status-row.scss` (new) — styles muted file/status rows and monospace expanded paths.
- `apps/web/src/app/chat/components/tool-status-row.ts` (new) — controls per-row expansion only when files exist.
- `apps/web/src/app/chat/components/quick-replies.html` (new) — renders wrapping quick-reply chips.
- `apps/web/src/app/chat/components/quick-replies.scss` (new) — keeps chips responsive without horizontal scrolling. Styled as a standalone bar (max-width 640px, centered, 18px gutter) to align with the composer now that it renders between the message list and the composer (2026-06-08).
- `apps/web/src/app/chat/components/quick-replies.ts` (new) — typed quick-reply list component.
- `apps/web/src/app/chat/components/chat-input.html` (new) — composer; mic button is always present, send button is added when the draft has text (two buttons), and the textarea carries a `#composerInput` ref.
- `apps/web/src/app/chat/components/chat-input.scss` (new) — styles the bottom composer; action column holds the mic + optional send.
- `apps/web/src/app/chat/components/chat-input.ts` (new) — emits draft/submit/mic-open actions and exposes `focusEnd()` (via `viewChild`) to place the caret at the end of the draft.
- `apps/web/src/app/chat/components/mic-overlay.html` (new) — capture overlay for recording/transcribing/error; decorative center visual; cancel(✕)+OK(✓) action pair (retry on error); no transcript text shown.
- `apps/web/src/app/chat/components/mic-overlay.scss` (new) — styles the overlay, the decorative mic visual, the transcribing spinner, and the capture-button pair.
- `apps/web/src/app/chat/components/mic-overlay.ts` (new) — typed overlay component; `state` input + `cancel`/`stop`/`retry` outputs; no transcript input.
- `apps/web/src/app/mock/mock-chat.service.ts` (modified) — conversation mock only; voice methods removed (moved to `MockVoiceCaptureService`). Keeps mock delays as internal constants and the transient typing lifecycle. Adds a re-entrancy guard (`busy`) to `sendMessage`/`chooseQuickReply` so overlapping turns can't corrupt the shared typing state; documents the "set busy synchronously before the first await" invariant in `respondWith` (2026-06-08).
- `apps/web/src/app/mock/mock-chat.service.test.ts` (modified) — fake-timer-driven routing/typing-lifecycle coverage; the voice test moved out to the voice-capture mock spec. Adds a concurrent-send guard test (a second send while a response is in flight is a no-op) (2026-06-08).
- `apps/web/src/app/mock/mock-voice-capture.service.ts` (new) — mock that honors the abort contract: timer + stored `reject`; `cancelRecording()` does `clearTimeout` + reject. Comments point the real impl at MediaRecorder + Whisper + `AbortController`/unsubscribe.
- `apps/web/src/app/mock/mock-voice-capture.service.test.ts` (new) — covers transcription-after-delay, the abort contract (`rejects.toThrowError()`), and cancel-with-nothing-in-flight no-op.
- `apps/web/src/app/ui/keppt-monogram.ts` (new) — adds a reusable Keppt monogram atom for header and future shell surfaces.
- `apps/web/src/app/ui/keppt-monogram.scss` (new) — styles the monogram with the shared serif token.
- `apps/web/src/app/ui/status-dot.ts` (new) — adds a reusable status-dot atom.
- `apps/web/src/app/ui/status-dot.scss` (new) — styles the status indicator used by the session header.
- `apps/web/src/index.html` (modified) — adds a woff2 preload link for the self-hosted primary font (`<link rel="preload" href="/fonts/inter-tight-latin.woff2" as="font" type="font/woff2" crossorigin>`); no Google Fonts links or preconnects (fonts are self-hosted, 2026-06-09).
- `apps/web/src/styles.scss` (modified) — added secondary sage tokens, font tokens, refined Markdown typography, shared mock animation keyframes/classes, and the four self-hosting `@font-face` declarations (Inter Tight latin/latin-ext, Instrument Serif latin/italic, with `unicode-range` subsetting; 2026-06-09).
- `apps/web/public/fonts/inter-tight-latin.woff2` (new) — self-hosted webfont, latin subset (Inter Tight variable, weights 400–700).
- `apps/web/public/fonts/inter-tight-latin-ext.woff2` (new) — self-hosted webfont, latin-ext subset (Inter Tight variable).
- `apps/web/public/fonts/instrument-serif-latin.woff2` (new) — self-hosted webfont, latin subset (Instrument Serif, 400).
- `apps/web/public/fonts/instrument-serif-latin-italic.woff2` (new) — self-hosted webfont, latin subset (Instrument Serif italic, 400).
- `apps/web/public/fonts/OFL-inter-tight.txt` (new) — SIL OFL 1.1 license text + upstream copyright notice for the vendored Inter Tight subsets (verbatim from google/fonts; 2026-06-10).
- `apps/web/public/fonts/OFL-instrument-serif.txt` (new) — SIL OFL 1.1 license text + upstream copyright notice for the vendored Instrument Serif subsets (verbatim from google/fonts; 2026-06-10).

— session 2026-06-09 (tool/typing lifecycle redesign + run-length tool grouping)

- `apps/web/src/app/chat/chat.types.ts` (modified) — restructured `AssistantToolMessage` from `{ text, files? }` to `{ tool: ToolName, target, summary?, state: "running"|"done" }`; added `ToolName` (the 6 backend work tools) and `ToolState`. `ToolName` deliberately excludes `suggest_quick_replies` so it can never become a tool row (adapter contract).
- `apps/web/src/app/chat/chat-tool-display.ts` (new) — pure display derivation: `toolLineLabel` (writes→`change_summary`, reads→path, searches→quoted query), `toolGroupSummary` (client-synthesized count/verb header), `toolGroupIcon` (icon bucket incl. neutral `steps` for mixed).
- `apps/web/src/app/chat/chat-tool-display.test.ts` (new) — covers line labels, group summary (read/search/write/mixed, running vs done), the neutral mixed icon, and empty-group fail-soft.
- `apps/web/src/app/chat/chat-message-groups.ts` (new) — `RenderItem` union + `groupMessagesForRender`: run-length groups consecutive tool messages into one `tool-group`, everything else stays its own item; group id = first tool's id (stable trackBy).
- `apps/web/src/app/chat/chat-message-groups.test.ts` (new) — covers grouping, interleaving, typing breaking a run, and trailing-run flush.
- `apps/web/src/app/chat/components/tool-group.ts` / `.html` / `.scss` (new) — the collapsible box: 1 tool → a plain line; >1 → count header (`toolGroupSummary`/`toolGroupIcon`) that expands to per-tool lines. Owns the chevron/expand state.
- `apps/web/src/app/chat/components/tool-status-row.ts` / `.html` / `.scss` (modified) — repurposed from a standalone expandable file-row into a single tool **line**: icon per `ToolName` via `@switch` (spinner while `running`), label from `toolLineLabel`. Collapsing moved up to `tool-group`.
- `apps/web/src/app/chat/components/chat-message.ts` / `.html` (modified) — removed the tool branch; tools now route exclusively through `tool-group`. Renders user/typing/content only.
- `apps/web/src/app/chat/components/chat-message-list.ts` / `.html` (modified) — iterates `renderItems()` (a `groupMessagesForRender` computed), delegating `tool-group` vs `chat-message`; scroll bookkeeping still reads raw `messages()`.
- `apps/web/src/app/chat/chat-ui-state.ts` / `.test.ts` (modified) — removed the now-obsolete `hasToolFiles` helper and its test (the `files` field is gone).
- `apps/web/src/app/mock/chat-mock-data.ts` (modified) — rewritten from `{ tool, markdown, quickReplies }` responses to ordered `MockTurn` block scripts (`tool` | `prose` | `chips`) with structured tool calls; `planEntered` is now a genuinely mixed run (read → read → find → write → edit); chips authored as their own block (mapped to the last content message's quick replies).
- `apps/web/src/app/mock/mock-chat.service.ts` (modified) — `respondWith` now replays a turn block-by-block via `playTurn` (typing before the first tool of a run / before prose; the running tool's spinner is the indicator otherwise; no flicker between consecutive tools); `try/finally` guarantees the typing indicator is cleared and `busy` resets even on a throw; `removeTypingMessages` made idempotent; tool timing bumped (`MOCK_TOOL_DELAY_MS` 260→750) so the work phase is perceptible.
- `apps/web/src/app/mock/mock-chat.service.test.ts` (modified) — rewrote the lifecycle test for the new order, added a mixed-run no-flicker test (asserts `5 Schritte` end-to-end) and a `chooseQuickReply` direct-path re-entrancy test.

— session 2026-06-09 (central tool registry refactor)

- `apps/web/src/app/chat/chat-tool-registry.ts` (new) — the single source of truth for tools: `TOOL_REGISTRY: Record<ToolName, { family, icon, label }>` plus `FAMILY_ICON`/`FAMILY_COPY` (`Record<…>`) and the pure derivation fns. Replaces `chat-tool-display.ts`; owns `ToolName`/`ToolState`/`ToolFamily`/`ToolIconName`. Framework-agnostic — icons are stable string tokens, **no** `@lucide/angular` import — so the Node unit tests load it directly.
- `apps/web/src/app/chat/chat-tool-display.ts` (deleted) — superseded by `chat-tool-registry.ts`; the per-tool `@switch`es/labels collapsed into the registry `Record`s.
- `apps/web/src/app/chat/chat-tool-registry.test.ts` (new, renamed from `chat-tool-display.test.ts`) — same label/summary coverage plus a `toolLineIcon`/`toolGroupIcon` block asserted against glyph **tokens** (e.g. `"file-text"`); no `@lucide/angular` import.
- `apps/web/src/app/chat/chat-tool-icons.ts` (new) — the view-layer half: `TOOL_ICON: Record<ToolIconName, LucideIcon>` mapping each token to its Lucide component. The only place importing `@lucide/angular` icon values; compiler-enforced (a new token fails the build until it has a component). Imported solely by the two tool components.
- `apps/web/src/app/chat/chat.types.ts` (modified) — `ToolName`/`ToolState` moved into `chat-tool-registry.ts` and re-exported here, so chat.types stays the chat-domain type barrel and existing importers (`mock-chat.service.ts`, `chat-mock-data.ts`) are unchanged; `AssistantToolMessage` keeps its shape and references the re-exported tokens. One-way dependency (chat.types → registry); no cycle.
- `apps/web/src/app/chat/components/tool-status-row.ts` / `.html` (modified) — per-line icon is now data-driven: `icon = TOOL_ICON[toolLineIcon(message())]` bound via `<svg [lucideIcon]="icon()">` (`LucideDynamicIcon`); the old per-`ToolName` `@switch` is gone. Spinner-while-running stays a static `lucideLoaderCircle` directive.
- `apps/web/src/app/chat/components/tool-group.ts` / `.html` (modified) — header glyph likewise data-driven (`TOOL_ICON[toolGroupIcon(tools())]`); the 5-case icon `@switch` replaced by `@if (running()) { spinner } @else { <svg [lucideIcon]="icon()"> }`, with `running` a new computed.
- `apps/web/src/app/mock/mock-chat.service.test.ts` (modified) — `toolGroupSummary` import path updated `chat-tool-display` → `chat-tool-registry`.

— session 2026-06-09 (composer cancel / stop affordance)

- `apps/web/src/app/chat/chat.service.ts` (modified) — added `abstract cancel(): void` to the contract, documenting the all-or-nothing semantics (keep the user message, discard every assistant artifact of the turn, stop the underlying work so a real backend releases the stream, no-op when idle).
- `apps/web/src/app/mock/mock-chat.service.ts` (modified) — per-turn `AbortController` (`inFlight`); `cancel()` aborts the pending `wait`; `respondWith` snapshots a checkpoint (user message committed, no assistant artifacts yet) and on abort restores it, distinguishing an abort (rollback) from a real throw (rethrow); `wait(ms, signal)` is now abortable (`clearTimeout` + reject with `AbortError` on `signal`); `playTurn(turn, signal)` threads the signal to every `wait`.
- `apps/web/src/app/chat/chat.store.ts` (modified) — added `cancel()` (no-op while `!busy`) delegating to `ChatService.cancel()`.
- `apps/web/src/app/chat/components/chat-input.ts` (modified) — added the required `busy` input and `cancelMessage` output; imports `LucideX`.
- `apps/web/src/app/chat/components/chat-input.html` (modified) — the action area swaps on `busy`: while a turn is in flight only the Stop (✕) button renders (mic + send hidden); idle restores mic + the optional send. The textarea stays enabled throughout.
- `apps/web/src/app/chat/chat-screen.ts` (modified) — added `cancelResponse()` → `store.cancel()`.
- `apps/web/src/app/chat/chat-screen.html` (modified) — passes `[busy]="store.busy()"` and wires `(cancelMessage)="cancelResponse()"` to the composer.
- `apps/web/src/app/chat/chat.store.test.ts` (modified) — added "cancels an in-flight turn and keeps the user message"; imports `isAssistantTypingMessage`.
- `apps/web/src/app/mock/mock-chat.service.test.ts` (modified) — added "cancels an in-flight turn: keeps the user message, discards the whole response" and "treats cancel as a no-op when no turn is in flight".

— session 2026-06-10 (post-review fix pass)

- `apps/web/src/app/mock/chat-mock-data.ts` (modified) — added the content-specific `routePatterns.captureConfirm` (three order-independent lookaheads over the dictated items); `captureOnly` prose reworded to the tap model ("Tipp auf das Mikrofon …").
- `apps/web/src/app/mock/mock-chat.service.ts` (modified) — `nextId()` is now a monotonic per-instance counter (`m-${++idCounter}`) so ids are never reused after typing-removal/cancel rollback; `routeUserText` checks `captureConfirm` first.
- `apps/web/src/app/mock/mock-chat.service.test.ts` (modified) — +2 regression tests (demo dictation → captureConfirm; no id reuse across removals/rollback); tap-copy assertion updated.
- `apps/web/src/app/chat/chat.store.ts` (modified) — `appendTranscript` trims the incoming transcript once at the seam and no-ops on whitespace-only input.
- `apps/web/src/app/chat/chat.store.test.ts` (modified) — +2 transcript-trim tests via a `PaddedVoiceCaptureService` driving the public voice path.
- `apps/web/src/app/chat/components/mic-overlay.ts` (modified) — a11y cheap pass: document-level Escape host listener emitting `cancel`; focuses the dialog container on open (`afterNextRender` + `viewChild`).
- `apps/web/src/app/chat/components/mic-overlay.html` (modified) — `#overlayRoot` ref + `tabindex="-1"` on the dialog section.
- `apps/web/src/app/chat/components/mic-overlay.scss` (modified) — suppress the focus ring on the programmatically-focused dialog container.
- `apps/web/src/app/chat/chat-screen.html` (modified) — `[attr.inert]` on the four background siblings (session header, message list, quick replies, composer) while the mic overlay is open.
- `docs/specs/angular-chat-ui.md` (modified) — Task-3 amendment note + `busy`/`VoiceCaptureService` rewrite (earlier sessions, previously missing from this list); `cancel(): void` added to the `ChatService` interface (2026-06-10).
- `docs/work/keppt-ui/plan.md` (modified) — Post-Task-3 amendment (earlier session, previously missing from this list); the false "pending spec pass" sentence corrected (2026-06-10).

### Files Read (Context Only)
- `docs/work/keppt-ui/plan.md` — Task 3 scope, acceptance criteria, key locations, and UI copy.
- `docs/work/keppt-ui/task-log/task-2-define-chat-service-contract.md` — prior service/store/message contract decisions.
- `docs/work/keppt-ui/task-log/task-2.5-replace-assistant-blocks-with-markdown-rendering.md` — Markdown rendering contract, `ngx-markdown` setup, and scroll-anchor context.
- `docs/work/keppt-ui/task-log/task-1-scaffold-web-app-foundation.md` — original viewport shell, composer, safe-area, and chip behavior context.
- `apps/web/src/app/chat/components/assistant-content-message.ts` — existing Markdown leaf component preserved by the new assistant wrapper.
- `apps/web/src/app/chat/components/assistant-content-message.html` — existing Markdown template preserved by the new assistant wrapper.
- `apps/web/src/app/app.config.ts` — confirmed `provideMarkdown()` remains app-level configuration.
- `apps/web/node_modules/@lucide/angular/package.json` — checked the installed icon package metadata and peer support.
- `apps/web/node_modules/@lucide/angular/types/lucide-angular.d.ts` — checked standalone icon component exports and selectors.
- `/home/lutz/.codex/plugins/cache/openai-bundled/browser/0.1.0-alpha2/skills/browser/SKILL.md` — attempted the preferred in-app browser workflow before falling back to headless Chromium because the required Node runtime tool was unavailable.
- `apps/web/src/app/chat/components/chat-input.scss` — read the composer gutter (640px centered, 18px left pad) to align the new standalone quick-reply bar (2026-06-08).
- `apps/web/node_modules/@lucide/angular/types/lucide-angular.d.ts` — confirmed the `LucideDynamicIcon` directive (selector `svg[lucideIcon]`, input `lucideIcon: LucideIconInput`) and that `[lucideIcon]` accepts a Lucide component directly (no `provideLucideIcons`) (2026-06-09 registry refactor).
- `apps/web/vitest.config.ts` — confirmed `environment: "node"` with no setup file / no `@angular/compiler`, which is why the pure registry must stay Angular-value-free (2026-06-09).
- `tsconfig.base.json` — checked strictness flags (`strict`, no `noImplicitReturns`); the registry's `Record` exhaustiveness makes `noImplicitReturns` unnecessary for this code (2026-06-09).

### Key Decisions
- Replace the coarse `ChatShellComponent` with a routed `ChatScreenComponent` and focused standalone components. This matches the Task 3 component boundary and keeps layout, message variants, composer behavior, and overlay behavior testable in smaller units.
- Use `@lucide/angular`, not deprecated `lucide-angular`. The registry first returned a deprecation warning for `lucide-angular@1.0.0`, so it was removed and replaced with the maintained scoped package.
- Keep assistant prose rendered through the existing `AssistantContentMessageComponent` and `ngx-markdown`. Tool rows and quick replies remain typed Angular UI outside Markdown, preserving the Task 2.5 contract.
- Keep scroll anchoring inside `ChatMessageListComponent`, where the scroll viewport lives. The behavior remains small, local, and uses the existing nested `requestAnimationFrame` pattern needed after Markdown layout growth.
- Render tool/status rows as button rows only when files exist; expansion is local to the row and file paths render in monospace.
- Keep quick replies attached to the latest assistant content message instead of returning to a global composer quick-action strip. This keeps typed reply controls visually associated with assistant content and avoids horizontal composer pressure.
- Keep native scrollbars. A temporary custom scrollbar was tried after a visibility complaint, but it was removed because it was non-native, always visible, and not draggable.
- Put mic overlay state in `ChatStore`, not `ChatScreenComponent` and not `MockChatService`. The store owns local UI orchestration state; the service remains the chat/mock data boundary.
- Expose `voiceTranscript` through `ChatService`/`ChatStore` rather than importing mock data into `ChatScreenComponent`. This removes direct UI coupling to `mock/chat-mock-data`. (Superseded 2026-06-08 — see below.)
- Treat `.gitignore` changes as unrelated current worktree state unless the user explicitly includes them in Task 3 commit scope. The file is modified in the worktree but was not part of the Task 3 implementation.

— session 2026-05-24

- Add shared UI atoms for the Keppt monogram and status dot so header visuals are reusable instead of being hand-coded inside `SessionHeaderComponent`.
- `MockChatService` now accepts `MockSimulationDelays`; the app uses default delays while tests inject zero or short delays for deterministic assertions.
- Typing messages are transient mock state: the service appends typing while thinking and removes typing before final assistant content lands.
- Global font tokens, Google Font links, Markdown typography tuning, and mock animation keyframes were added to better match the reference mock. *(Superseded 2026-06-09: the Google Font links were replaced by self-hosted `@font-face` declarations + woff2 assets; see the 2026-06-09 self-hosting migration.)*
- Angular production builds now fetch Google Fonts for font inlining. In sandboxed/offline environments the build needs network access, or a follow-up should self-host fonts or disable font inlining. *(Superseded 2026-06-09: fonts are now self-hosted — see Open Issues; production builds no longer fetch Google Fonts and are hermetic.)*

— session 2026-05-24 (visual parity follow-up)

- Center the composer on wider viewports by splitting layout responsibilities: the `<footer class="composer">` carries the screen-edge padding (`8px 12px 18px`), and `.composer-pill` carries `max-width: 640px; margin: 0 auto`. The pill stretches to fill the gutter on narrow screens and centers on desktop without a separate breakpoint.
- Reveal a slim, native scrollbar on devices with a precise pointer (`@media (pointer: fine)`) instead of leaving the scroll area entirely chromeless. Mobile/touch keeps the chrome-free behavior matching the landing prototype, while desktop users get a visible scroll indicator. Uses `scrollbar-width: thin` + `::-webkit-scrollbar-thumb` so it remains the OS-native bar with only the thumb color tinted (`--keppt-ink-4`, hover `--keppt-ink-3`); no custom scrollbar widget.
- Implement the React-mock `replaceTyping` lifecycle in `MockChatService.respondWith`: after the tool row appears, a typing message is appended, then awaited and removed before the final content lands. Removed `@Injectable()` from `MockChatService` and switched `ChatScreenComponent`'s provider to `useFactory: () => new MockChatService()` so the constructor can take `MockSimulationDelays` without DI complaining about an interface token.

— session 2026-06-06

- Supersede the `MockSimulationDelays` constructor/configuration path. The app does not need external delay configuration, so `MockChatService` keeps `@Injectable()`, has a no-argument constructor, and is provided via `{ provide: ChatService, useClass: MockChatService }`.
- Keep mock timing as private module constants (`MOCK_TOOL_DELAY_MS = 350`, `MOCK_TYPING_DELAY_MS = 850`) rather than exporting an injection token or a constructor parameter. This keeps production code free of a test-only configuration API.
- Test time-based behavior with Vitest fake timers. Unit tests call `vi.useFakeTimers()`, advance the two service timers with `advanceTimersToNextTimerAsync()` when asserting the intermediate typing state, or flush all timers with `runAllTimersAsync()` for full-response cases. The returned `Promise` from `sendMessage`/`chooseQuickReply` remains the completion signal.
- `chat.store.test.ts` still provides `useValue: new MockChatService()` because this plain Vitest test is not an Angular component/JIT harness; using `useClass` there asks Angular to JIT-compile the injectable without `@angular/compiler` loaded. The app runtime provider remains `useClass`.

— session 2026-06-08 (mic interaction redesign)

- Redesign the mic state model from `closed|idle|listening|transcript` to `closed|recording|transcribing|error`. Reasoning: `idle` was an orthogonal "armed" axis and `transcript` was derivable from the captured text — the wrong four states. Auto-start on open removes `idle`; moving the transcript into the composer removes the in-overlay `transcript`; honesty about STT latency adds `transcribing`; failure/empty adds `error`. The result is one honest async-capture lifecycle.
- Voice produces editable composer text (append to the draft), not an auto-sent message. Safer (STT errors are reviewed/edited before send), more flexible (mix typing + dictation, re-dictate appends), and it dissolves the review concern — capture is just "produce text". The transcript is never rendered in the overlay.
- Extract `VoiceCaptureService` (start/stop/cancel) out of `ChatService`. Once voice stopped sending, it no longer touches the conversation, so it has no place in the chat contract. One public facade; the real impl composes `MediaRecorder` + a Whisper/STT client internally. Removed `voiceTranscript`/`startVoiceCapture`/`cancelVoiceCapture` from `ChatService`.
- Fix the cancel→reopen→stop race by aborting the in-flight transcription at the source, not by tracking a generation token in the store. Contract: `cancelRecording()` aborts and `stopRecording()` settles by **rejecting** on cancel; the store then keeps plain state guards. Rejected the generation-token approach — it is parallel bookkeeping and would leave the real request running. (A promise is not itself cancellable: the underlying request is aborted and the promise rejects with an AbortError, which must be handled.)
- The mock honors the abort contract (timer + stored `reject`; cancel → `clearTimeout` + reject) so the store race spec is meaningful — without the abort, `await captureA` would deadlock. Mock comments mark exactly where the real impl aborts (`AbortController`/`signal` for fetch, `unsubscribe`/`takeUntil` for HttpClient).
- Composer keeps the mic always visible and adds send only when the draft has text (two buttons), instead of swapping mic↔send. Keeps voice reachable while text exists, consistent with append.
- Return focus to the composer with the caret at the end after OK/cancel, deferred via `afterNextRender` so the appended transcript is in the DOM before the caret is positioned. No focus on `error` (overlay stays open). `viewChild(ChatInputComponent)` + `ChatInputComponent.focusEnd()`.
- Overlay: the center visual is decorative (no longer a second stop trigger); a single cancel(✕)+OK(✓) pair lives at the bottom (retry on error); the header ✕ was removed to avoid a duplicate cancel.

— session 2026-06-08 (quick-reply concurrency + bottom-bar)

- Make `ChatStore` the single source of truth for quick replies via `activeQuickReplies`, derived from the **last** message only (`messages().at(-1)`), and render them once as a standalone bar between the message list and the composer. This removes the dead store `quickReplies` computed and the inline per-message rendering, collapsing a 4-hop output chain (`quick-replies → assistant-message → chat-message → chat-message-list → chat-screen`) to one hop.
- Rejected the prior inline approach where `chat-message-list` searched backwards for the last content message *with* chips (`findLast` + `quickReplies?.length`). It resurrected stale chips from an older turn whenever the latest turn had none (e.g. the `captureOnly`/`later` flows) — a correctness regression. "Last message only" fixes it and makes `busy`-gating unnecessary for visibility, since during a turn the last message is always a user/tool/typing message.
- Accepted trade-off: the chips are visually detached from the assistant bubble (a pinned bar vs. hugging the message). For follow-up suggestions tied to "now", a bar above the composer reads as next-actions and stays reachable while scrolling history. (Inline-bubble was the alternative; it would have required threading the active id back down to each message.)
- Hoist `busy` (`status !== "idle"`) onto the `ChatService` contract rather than re-deriving it. The lifecycle owner defines what "busy" means (a real streaming backend stays busy through `"streaming"` — which also future-proofs the previously-dead `canSubmit` check that referenced `"streaming"`), and the store (`this.chat.busy`), the UI, and the mock guards all read one definition.
- In-flight guards live at two layers, each for a distinct reason: the **store** guards `chooseQuickReply` and `submitDraft` (the latter checks `busy` *before* clearing the draft, so a blocked submit never loses typed text); the **service** guards `sendMessage`/`chooseQuickReply` as defense-in-depth so the global `removeTypingMessages()` can never see two overlapping `respondWith` runs. Guards ignore the second action (no-op), not queue/cancel — cancel semantics are deliberately out of scope.
- Documented the load-bearing invariant with a prominent comment in `respondWith`: status must flip to a non-idle (busy) value **synchronously, before the first `await`**. Run-to-completion is what makes the double-click guard reliable — a second queued click can only run after the first handler suspends, by which point `busy` is already true. Moving an `await` ahead of that line silently reopens the race.

— session 2026-06-09 (tool/typing lifecycle redesign + tool grouping)

- Model a turn as an ordered block list in generation order (Text/Tool interleave), not a fixed template. Grounded in the real backend turn loop (keppt-app): tools are sequential (`disableParallelToolUse`), text and `tool_use` interleave, and `suggest_quick_replies` is the only turn-terminating tool and always last. The flat `ChatMessage[]` already IS that block list, so no model rewrite was needed.
- Structure `AssistantToolMessage` as `{ tool, target, summary?, state }` and derive all display client-side. The backend sends no human label; the old `{ text, files[] }` baked an editorial summary the real loop never produces. `change_summary` (a required field on `edit_file`/`write_file`) is the model-authored write description; reads/searches carry only their target. Keeps the mock LLM/provider-agnostic.
- Run-length grouping is a render-only transform (`groupMessagesForRender`), not domain state, and lives in the view (a `chat-message-list` computed over a pure tested function), not the store. The group header is synthesized from the contained tools (`toolGroupSummary`), never sent by the backend — the backend doesn't group.
- Exclude `suggest_quick_replies` from `ToolName` so the type system guarantees it can never reach a tool row; the mock maps it to a `chips` block → the last content message's quick replies. The filter lives at the adapter seam (type-enforced), keeping the grouping/header free of special-cases.
- Single live-edge indicator: `•••` shows while deciding (before the first tool of a run) and composing (before prose); a running tool's own spinner is the indicator otherwise. They never coexist, and no `•••` flickers between consecutive tools — this falls out of rendering in generation order with one live edge.
- Keep the tool group collapsed by default and the header generic for mixed runs ("N Schritte"). Per the product owner: Keppt's users are non-developers — they want to see that work is happening, not an engineer-facing tool log. Mixed-run lines stay distinguishable on expand by icon + text shape (path vs quoted query vs change-summary sentence); explicit per-line verbs were considered and declined for this audience.
- Harden the lifecycle: `try/finally` in `respondWith` (clear typing + reset `busy` even on a throw) plus an idempotent `removeTypingMessages`. The re-entrancy guard is load-bearing, so a wedged `busy` must be impossible.
- Slow the simulated tool phase (`MOCK_TOOL_DELAY_MS` 260→750) so non-devs can perceive that work is happening; the previous sub-second blur was imperceptible.

— session 2026-06-09 (central tool registry refactor)

- Centralize all tool metadata into one `Record<ToolName, ToolMeta>` (`chat-tool-registry.ts`) so adding a tool is a single, compiler-enforced edit. Before, adding a tool touched 4–5 spots (`ToolName`, `TOOL_FAMILY`, the `toolLineLabel` switch, the per-line icon `@switch` in the template, the per-component icon `imports`), of which only the `Record<ToolName,…>` family map was compiler-enforced; the rest degraded silently (default icon + empty label). The registry makes family/icon/label all `Record`-keyed → the build fails until a new tool is complete. No template `@switch` survives.
- Keep the registry framework-agnostic; store icons as **string tokens** (`ToolIconName`, the Lucide kebab names), not Lucide component classes. First attempt stored the classes directly (cleaner-looking, one place) but importing a Lucide icon class runs its static initializer → `ɵɵngDeclareFactory` → JIT compile, which throws in the `environment: "node"` test runtime (no `@angular/compiler`). Rather than pull the Angular compiler into the deliberately-pure test env, the token→component map lives in the view layer (`chat-tool-icons.ts`, `Record<ToolIconName, LucideIcon>`). This honors the original design's choice (`chat-tool-display.ts` was Angular-free on purpose) and keeps the pure tests fast.
- Render icons via `LucideDynamicIcon` (`<svg [lucideIcon]="icon()">`) bound to the Lucide **component** resolved from `TOOL_ICON`. `[lucideIcon]` accepts a component/data directly, so no `provideLucideIcons` registration and no string-name lookup fragility. Spinner-while-running stays the static `lucideLoaderCircle` directive (a fixed glyph needing the `spin` class), so the resolvers stay state-agnostic and "running" is a component concern.
- Relocate `ToolName`/`ToolState` into the registry and **re-export** them from `chat.types.ts` rather than splitting `AssistantToolMessage` out. Keeping the message shape with its `ChatMessage` siblings avoids a `chat.types ↔ registry` circular import (the registry defines its own minimal `ToolDisplay` input shape and imports nothing from chat.types); existing importers that pull `ToolName` from chat.types are unchanged.
- Chose a single file over a `chat/tool/` subfolder (user decision). The codebase is flat (no domain subfolders), and a registry grows by `Record` entries, not files — a folder only pays off once tools get per-tool files. Deferred per the project's empirical-over-speculative preference.
- `FAMILY_COPY`/`FAMILY_ICON` as `Record<ToolFamily | "mixed", …>` make a *new family* compiler-enforced too, replacing the old `switch` with a `default`. With every switch gone, `noImplicitReturns` is no longer needed to guarantee exhaustiveness for this code.

— session 2026-06-09 (composer cancel / stop affordance)

- Cancel **discards the whole assistant turn** (checkpoint rollback to the snapshot taken right after the user message), keeping the user message. This is a deliberate divergence from ChatGPT/Claude, which keep the partial output — chosen for Keppt's non-dev audience (a half-finished tool run / partial prose is noise, not signal) and confirmed with the user. The "keep partial output" alternative was considered and rejected. The semantics are documented on the `ChatService.cancel()` contract so the real adapter inherits them.
- Put cancellation on the `ChatService` contract (`cancel(): void`), not a UI-only flag, so it is the single seam a real streaming backend implements (`AbortController.abort()` on the fetch / send a stop signal). The mock's `cancel()` aborts the pending timer — the stand-in for "tell the backend to stop and stop billing", which was the user's explicit cost motivation.
- Abort mechanics in the mock: one `AbortController` per turn; an abortable `wait(ms, signal)` that `clearTimeout`s and rejects with an `AbortError`; `respondWith` wraps `playTurn` in try/catch and uses `controller.signal.aborted` (not the error type) to decide rollback-vs-rethrow, so a genuine mid-turn throw still propagates and still resets `busy`/typing via the existing `finally`. The checkpoint is the `messagesState` snapshot captured after the user message and before any assistant artifact — restoring it is exactly "keep the user message, drop the response".
- Composer UI = Option 1 "Senden ⇄ Stop (1 Slot)", chosen via `AskUserQuestion` over (a) keep-mic-visible-while-busy and (b) disabled-send + extra-X (3-button clutter). While `busy` the action area shows **only** the ✕ (mic + send hidden); idle restores mic + optional send. The textarea stays enabled the whole time so the user can pre-draft the next message during a turn, and that draft survives the cancel (cancel never touches `draftState`). This reverses the earlier reviewer suggestion to hide the composer during a turn — the user wanted to keep typing.
- The `.stop` button reuses the existing `.action-button` styling (dark filled circle) — no new SCSS — mirroring how the `mic` class already carries no dedicated rule. Send (`→`) and Stop (`✕`) never co-exist, so there is no glyph-confusion risk. A calmer/ghost treatment was left as a trivial follow-up if wanted.
- Store `cancel()` keeps a `!busy` guard for symmetry with `submitDraft`/`chooseQuickReply`, even though `ChatService.cancel()` is already a no-op when idle (`inFlight` is null).
- This resolves the long-standing "Cancel semantics for a pending response are still unimplemented" open issue. During review it was also confirmed that the in-flight double-click guards and the `typing → tool → typing → content` lifecycle order — flagged as outstanding in an earlier external review — were already in place; the genuine gap was only the cancel affordance.

— session 2026-06-10 (post-review fix pass)

- Triage of the 2026-06-09 review per the pre-PMF rule (user-confirmed): fix now only what is demo-visible (dictation routing), makes the audit trail untruthful (spec/plan/log drift), is a legal duty (OFL texts for the vendored fonts), or is a cent-fix with footgun character (monotonic ids, transcript trim, tap copy). Deliberately deferred: mobile Enter-semantics and the `<label>`-wraps-buttons structure (both superseded by the planned dynamic-resize composer rework), `prefers-reduced-motion`, browserslist floor, overlay focus trap.
- Each review finding was independently re-verified against the code before fixing (12 verifier agents); one was refuted in its mechanism (`findLast`/`.at(-1)` need no polyfill — prototype methods are never downleveled; Baseline 2022), one downgraded (spec drift is doc-only).
- `routePatterns.captureConfirm`: three order-independent co-occurrence lookaheads (Anna-Angebot ∧ Steuerunterlagen ∧ YouTube/AI-Apps), checked before all generic routes. Content-specific by design — the captureConfirm prose enumerates exactly these items, so a generic "capture-ish" pattern would mis-route.
- Mock ids: monotonic per-instance counter; deliberately not rolled back on cancel, so ids from discarded turns are never re-issued (`track item.id` stability; protects the Task-5 enter animations).
- Mic overlay a11y is a deliberately cheap pass: document-level Escape (cancel is available in every capture state), focus the dialog container itself (SR announces the `aria-labelledby` title; no button autofocus), `inert` on the background siblings. No focus trap / no CDK Dialog — deferred. Close-ordering is safe: inert evaporates in the same render pass that destroys the overlay; `focusComposer()` runs in `afterNextRender`, after the DOM update.
- Prettier-check warnings on the touched files are pre-existing committed style (no `.prettierrc`, no format script in the repo) — deliberately not reformatted.

### Review Focus
Compact map for human review. Do not repeat the diff.

- **Behavior claims (newest — review-fix pass):** the demo dictation (`voiceTranscript`) routes to the capture confirmation ("Ich habe drei Dinge mitgenommen …"), not the inbox cleanup; mock message ids are never reused across typing-removal or cancel rollback; the mic overlay closes via Escape, receives focus on open, and renders the covered background inert; a padded transcript lands in the draft with single-space joins and no leading/trailing whitespace. Prior claims still hold: busy→Stop(✕) composer swap with draft preservation, whole-turn cancel discard (no-op when idle), `••• → tools(running→done, one run, no flicker) → ••• → prose → chips` replay, run-length tool grouping, double-click guards, latest-turn-only quick replies.
- **Assumptions / choices:** captureConfirm routing is content-specific by design (co-occurrence lookaheads — the response enumerates exactly the dictated items); Escape always cancels (the cancel button is unconditional in every capture state); focus lands on the dialog container, not a button; overlay a11y is deliberately the cheap pass (no focus trap/CDK — deferred). Carried from the cancel session: discard-the-**whole**-turn is a deliberate, user-confirmed divergence from ChatGPT/Claude; abort-vs-real-error is decided by `controller.signal.aborted`.
- **Scope notes:** docs changed alongside code — the spec `ChatService` gained `cancel()` and the false "pending spec pass" sentences in `plan.md`/this log were corrected; OFL license files added under `public/fonts/` (untracked — `/commit 3` must stage them); `.gitignore` unstaged (separate chore). Deliberately NOT fixed (pre-PMF triage): mobile Enter-semantics + label-wraps-buttons (planned composer rework), reduced-motion, browserslist floor. Still no real `ChatService` adapter (mock only); no component DOM tests (Task 3.5); the plan still has no cancel AC.
- **Read next:** `apps/web/src/app/mock/chat-mock-data.ts` — `routePatterns.captureConfirm` + its shadowing rationale; `apps/web/src/app/chat/components/mic-overlay.ts` — Escape host listener + focus-on-open; `apps/web/src/app/chat/chat-screen.html` — the four `[attr.inert]` bindings vs. the `@if` overlay ordering.

### Test Evidence
- `fnm exec --using=22.22.2 pnpm --dir apps/web test`

```text
✓ src/app/chat/chat-ui-state.test.ts  (3 tests)
✓ src/app/chat/chat.store.test.ts  (1 test)
✓ src/app/mock/mock-chat.service.test.ts  (5 tests)

Test Files  3 passed (3)
Tests  9 passed (9)
```

- `fnm exec --using=22.22.2 pnpm --dir apps/web typecheck`

```text
> ngc -p tsconfig.app.json --noEmit
```

Command exited with code 0.

- `fnm exec --using=22.22.2 pnpm --dir apps/web build`

```text
Initial chunk files | Names         |  Raw size | Estimated transfer size
main-RID3PFAF.js    | main          | 346.70 kB |                92.41 kB
styles-33MULBD6.css | styles        |   1.91 kB |               676 bytes

Initial total | 348.61 kB | 93.08 kB
Application bundle generation complete.
```

- Earlier full workspace checks also passed during Task 3:

```text
fnm exec --using=22.22.2 pnpm test
fnm exec --using=22.22.2 pnpm typecheck
fnm exec --using=22.22.2 pnpm build
```

Each completed successfully for `apps/web`, `packages/core`, and `apps/cli`.

- Headless Chromium verification against the local Angular dev server checked both `390x844` and `1280x800`:

```json
{
  "overflowX": false,
  "composerBottom": "viewport bottom",
  "subtitle": "Heute · Mittwoch, 6. Mai",
  "placeholder": "Frag Keppt …",
  "quickRepliesWrapWithinViewport": true,
  "expandedFiles": [
    "tasks/inbox.md",
    "tasks/focus.md",
    "tasks/waiting.md",
    "daily/2026-05-06.md"
  ],
  "composerSwitch": "mic hidden, send visible after draft text",
  "micOverlayStates": ["Bereit", "Höre zu …", "transcript", "committed"]
}
```

> Note (2026-06-08): the `composerSwitch` and `micOverlayStates` results above describe the **superseded** model. Current behavior: mic stays visible (send is additive), and overlay states are recording/transcribing/error with the transcript going to the composer. These were not re-verified in a browser this session.

- Screenshots captured during browser verification:
  - `/tmp/keppt-task3-mobile.png`
  - `/tmp/keppt-task3-desktop.png`

- Source scans:

```text
rg -n 'chat-shell|ChatShellComponent|Nachricht an Keppt|AssistantBlock|RichListItem|chat-inline-text|assistant-block' apps/web/src apps/web/package.json pnpm-lock.yaml
```

No stale production references were found.

```text
rg -n 'voiceTranscript|chat-mock-data|ChatScreenComponent|export class ChatScreen' apps/web/src/app/chat apps/web/src/app/mock
```

Confirmed `ChatScreenComponent` no longer imports mock data directly; transcript access is through `ChatService`/`ChatStore`, while mock data remains inside `apps/web/src/app/mock/`.

— session 2026-05-24

- `fnm exec --using=22.22.2 pnpm --dir apps/web test`

```text
✓ src/app/chat/chat-ui-state.test.ts  (3 tests) 4ms
✓ src/app/chat/chat.store.test.ts  (1 test) 6ms
✓ src/app/mock/mock-chat.service.test.ts  (6 tests) 41ms

Test Files  3 passed (3)
Tests  10 passed (10)
```

- `fnm exec --using=22.22.2 pnpm --dir apps/web typecheck`

```text
> ngc -p tsconfig.app.json --noEmit
```

Command exited with code 0.

- `fnm exec --using=22.22.2 pnpm --dir apps/web build` first failed in the sandbox because Angular attempted to fetch Google Fonts for font inlining and DNS was blocked *(historical — superseded by the 2026-06-09 self-hosting migration; the build no longer fetches Google Fonts)*:

```text
Inlining of fonts failed. An error has occurred while retrieving https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap over the internet.
getaddrinfo EAI_AGAIN fonts.googleapis.com
```

- The same build passed with network escalation:

```text
Initial chunk files | Names         |  Raw size | Estimated transfer size
main-XXZQADH4.js    | main          | 350.07 kB |                92.99 kB
styles-OGMFUYRE.css | styles        |   3.87 kB |                 1.15 kB

Initial total | 353.94 kB | 94.14 kB
Application bundle generation complete.
```

— session 2026-05-24 (visual parity follow-up)

- `pnpm -r test` (apps/web 3 files / 10 tests; packages/core 15 files / 273 tests; apps/cli 10 files / 45 tests) — all green. The web suite includes a new `shows typing while the assistant is thinking and removes it once the response lands` test that uses a 25 ms `typingDelayMs` to assert the intermediate (typing visible + status `thinking`) and final (typing removed, content present, status `idle`) states of the lifecycle.
- `pnpm -r typecheck` — clean.
- `pnpm -r build` — clean (`main-XXZQADH4.js | 350.07 kB | 92.99 kB`; `styles-OGMFUYRE.css | 3.87 kB | 1.15 kB`).
- Playwright-driven screenshots against the local Angular dev server at `http://localhost:4200`:
  - `414×896` greeting (`/tmp/claude/screenshots/chat-1-greeting.png`) — confirms top-down message flow, monogram + accent status dot in the single-line subtitle, outlined translucent icon buttons, white chip pills with `ink-4` border.
  - `414×896` planning (`/tmp/claude/screenshots/chat-2-planning.png`) — confirms flat inline tool row (file icon + `ink-3` text + chevron), user bubble with `18 18 4 18` border-radius, headings at the lighter `14.5px/600`, ordered list with bold names + muted meta, unordered list with custom dot bullets.
  - `414×896` mic overlay idle (`/tmp/claude/screenshots/chat-3-mic.png`) — confirms full-screen paper takeover, italic-serif "Erfassen" + status dot, 96 px ink core with two accent-orange halos, italic-serif idle prompt, uppercase "HALTEN ZUM SPRECHEN" hint. (Superseded model — press-and-hold UI.)
  - `1400×900` composer (`/tmp/claude/screenshots/wide-composer.png`) — confirms the 640 px pill centered with 380 px left/right padding-equivalents on a wide viewport.
  - `414×896` typing during (`/tmp/claude/screenshots/typing-during.png`) — confirms the user bubble + tool row + three muted dots are visible while the response is in flight.
  - `414×896` typing after (`/tmp/claude/screenshots/typing-after.png`) — confirms the three dots are gone and the final content + quick replies have replaced them.
- DOM probe for the composer pill on `1400×900`:

```json
{
  "pillRect": { "x": 380, "y": 828, "width": 640, "height": 54 },
  "footerRect": { "x": 0, "width": 1400 }
}
```

— session 2026-06-06

- `pnpm -C apps/web typecheck`

```text
$ ngc -p tsconfig.app.json --noEmit
```

Command exited with code 0.

- `pnpm -C apps/web test`

```text
✓ src/app/chat/chat-ui-state.test.ts  (3 tests) 3ms
✓ src/app/chat/chat.store.test.ts  (1 test) 8ms
✓ src/app/mock/mock-chat.service.test.ts  (6 tests) 10ms

Test Files  3 passed (3)
Tests  10 passed (10)
```

- Source scan after simplifying mock delays:

```text
rg -n "useFactory: \\(\\) => new MockChatService|new MockChatService\\([^)]|MockSimulationDelays|MOCK_SIMULATION_DELAYS|DEFAULT_MOCK_DELAYS" apps/web/src -g '*.ts'
```

No delay-constructor, injection-token, or `useFactory` references remain in production source; `new MockChatService()` remains only in unit tests.

— session 2026-06-08 (mic interaction redesign)

- `pnpm --dir apps/web typecheck` — `ngc` exited 0 (Angular template type-checking validates the redesigned overlay/composer/screen bindings).
- `pnpm --dir apps/web test`

```text
✓ src/app/chat/chat-ui-state.test.ts  (3 tests)
✓ src/app/mock/mock-voice-capture.service.test.ts  (3 tests)
✓ src/app/chat/chat.store.test.ts  (7 tests)
✓ src/app/mock/mock-chat.service.test.ts  (5 tests)

Test Files  4 passed (4)
Tests  18 passed (18)
```

- New coverage this session: `mock-voice-capture.service.test.ts` asserts the abort contract (`await expect(pending).rejects.toThrowError()`); `chat.store.test.ts` adds the cancel→reopen race ("discards a cancelled transcription and never leaks it into a later capture") and empty→error+retry. The race spec would deadlock without the abort contract, so it enforces the contract.
- `git diff --check` — clean (no trailing whitespace / conflict markers in the changed files).
- NOT run this session: `build` and browser/visual verification. The redesigned overlay (recording/transcribing/error visuals + button pair), the composer two-button layout, and the focus-return are unverified visually because the Angular production build still fetches Google Fonts (sandbox/offline blocker — see Open Issues). There are no component DOM tests yet (the ng-mocks harness is Task 3.5). *(Note: the Google Fonts build blocker was resolved 2026-06-09 by self-hosting fonts; visual verification is no longer font-blocked.)*

— session 2026-06-08 (quick-reply concurrency + bottom-bar)

- `npm --prefix apps/web run typecheck` — `ngc` exited 0 (Angular template type-checking validates the new screen-level quick-reply bar bindings and the removal of the per-message quick-reply inputs/outputs).
- `npm --prefix apps/web test`

```text
✓ src/app/chat/chat-ui-state.test.ts  (3 tests)
✓ src/app/mock/mock-chat.service.test.ts  (6 tests)
✓ src/app/chat/chat.store.test.ts  (10 tests)
✓ src/app/mock/mock-voice-capture.service.test.ts  (3 tests)

Test Files  4 passed (4)
Tests  22 passed (22)
```

- New coverage this session: `chat.store.test.ts` — "ignores a second quick reply while the first response is in flight", "ignores a submit while busy and keeps the unsent draft", "drops quick replies once the latest turn offers none" (the stale-chip regression); `mock-chat.service.test.ts` — "ignores a concurrent message while a response is in flight" (the service-level guard).
- `git diff --check` — clean.
- NOT run this session: `build` and browser/visual verification (Google Fonts build blocker unchanged). The new quick-reply bar's standalone styling was reasoned from the composer gutter, not visually confirmed. *(Note: the Google Fonts build blocker was resolved 2026-06-09 by self-hosting fonts.)*

— session 2026-06-09 (tool/typing lifecycle redesign + tool grouping)

- `pnpm --dir apps/web test` — 40 passed (6 files):

```text
✓ src/app/chat/chat-tool-display.test.ts      (12 tests)
✓ src/app/chat/chat-ui-state.test.ts          (2 tests)
✓ src/app/chat/chat-message-groups.test.ts    (5 tests)
✓ src/app/chat/chat.store.test.ts             (10 tests)
✓ src/app/mock/mock-chat.service.test.ts      (8 tests)
✓ src/app/mock/mock-voice-capture.service.test.ts (3 tests)

Test Files  6 passed (6)
Tests  40 passed (40)
```

- `pnpm --dir apps/web typecheck` — `ngc` exited 0 (strictTemplates validates the new `@switch` icon cases, `tool-group`, and the `renderItems` delegation).
- Key new coverage: `mock-chat.service.test.ts` "plays a turn in order" (single-tool: `••• → tool → ••• → content`) and "runs a mixed tool run as one continuous group with no typing flicker between tools" (`planEntered` = read→read→find→write→edit; asserts no `•••` at each tool→tool boundary and `toolGroupSummary` = "5 Schritte" end-to-end); `chat-tool-display.test.ts` running-vs-done header copy for every family + empty-group fail-soft; `chat-message-groups.test.ts` interleaving + typing-breaks-a-run + trailing-run flush.
- Adversarial review via the `review-chat-lifecycle` workflow (25 agents): 19 findings → 10 confirmed, 9 refuted (chips-on-prior-turn, id-reuse, empty-summary, already-planned component harness, etc.). Applied 8 fixes (multi-tool lifecycle test, family running-copy tests, `try/finally` lifecycle guard, empty-array header guard, neutral mixed icon, symmetric search-label quote `„…"`→`„…“`, explicit `read_file` icon `@case`, direct-path `chooseQuickReply` re-entrancy test). Skipped 2 with rationale (timer fragility tied to never-set `durationMs`; spinner live-region — deliberate parity with the typing indicator).
- NOT run this session: production `build` and browser/visual verification (Google Fonts inlining blocker unchanged; no component DOM tests yet — Task 3.5). *(Note: the Google Fonts inlining blocker was resolved 2026-06-09 by self-hosting fonts.)*

— session 2026-06-09 (central tool registry refactor)

- `npm --prefix apps/web run typecheck` — `ngc` exited 0; strictTemplates validates the new `[lucideIcon]="icon()"` bindings against `LucideDynamicIcon` in both tool components and the `Record` exhaustiveness.
- `npm --prefix apps/web test` — 40 passed (6 files). The two suites that import the registry (`chat-tool-registry.test.ts`, `mock-chat.service.test.ts`) load cleanly in the Node env now that the registry is `@lucide/angular`-free:

```text
✓ src/app/chat/chat-tool-registry.test.ts          (12 tests)
✓ src/app/chat/chat-ui-state.test.ts               (2 tests)
✓ src/app/chat/chat-message-groups.test.ts         (5 tests)
✓ src/app/mock/mock-voice-capture.service.test.ts  (3 tests)
✓ src/app/mock/mock-chat.service.test.ts           (8 tests)
✓ src/app/chat/chat.store.test.ts                  (10 tests)

Test Files  6 passed (6)
Tests  40 passed (40)
```

- `npm --prefix apps/web run build` — full AOT production build **succeeded** this session (`main-TTYSMSDB.js 362.27 kB / 95.47 kB`), confirming `[lucideIcon]` matches the `LucideDynamicIcon` selector in AOT, not just in typecheck. (The Google Fonts inlining step did not fail this run — network was available; the blocker remains environment-dependent, see Open Issues.) *(Note: the environment-dependent Google Fonts inlining blocker was resolved 2026-06-09 by self-hosting fonts; the build is now hermetic.)*

```text
Initial chunk files | Names  |  Raw size | Estimated transfer size
main-TTYSMSDB.js    | main   | 362.27 kB |                95.47 kB
styles-OGMFUYRE.css | styles |   3.87 kB |                 1.15 kB
Application bundle generation complete.
```

- Intermediate finding (drove a design change): a first attempt storing the Lucide icon **classes** in the registry broke the Node tests with `Error: The component 'LucideIconBase' needs to be compiled using the JIT compiler, but '@angular/compiler' is not available` — the icon-class static initializer JIT-compiles on import, which `environment: "node"` can't do. Resolved by switching to string tokens + a view-layer map (kept the test env compiler-free), then re-ran the full suite green.

— session 2026-06-09 (composer cancel / stop affordance)

- `npx vitest run` (from `apps/web`) — 43 passed (6 files):

```text
✓ src/app/chat/chat-ui-state.test.ts        (2 tests)
✓ src/app/chat/chat-tool-registry.test.ts   (12 tests)
✓ src/app/chat/chat-message-groups.test.ts  (5 tests)
✓ src/app/chat/chat.store.test.ts           (11 tests)
✓ src/app/mock/mock-voice-capture.service.test.ts (3 tests)
✓ src/app/mock/mock-chat.service.test.ts    (10 tests)

Test Files  6 passed (6)
Tests  43 passed (43)
```

- `npm run typecheck` (`ngc -p tsconfig.app.json --noEmit`) — exited 0; Angular template type-checking validates the new required `[busy]` input, the `(cancelMessage)` output, and the `lucideX` binding in the composer.
- New coverage this session: `mock-chat.service.test.ts` — "cancels an in-flight turn: keeps the user message, discards the whole response" (advances to a running tool, calls `cancel()`, asserts the message list is back to greeting + the single user message, no typing, no running tools, `idle`/`!busy`) and "treats cancel as a no-op when no turn is in flight" (idle `cancel()` leaves status and the messages array reference untouched); `chat.store.test.ts` — "cancels an in-flight turn and keeps the user message" (submit → `cancel()` mid-flight → user message survives, no typing, `!busy`).
- Only `cancel` was added this session; the increase 40→43 tests is the two mock cases + the one store case.
- NOT run this session: production `build` and browser/visual verification (Google Fonts inlining blocker unchanged). No component DOM test exists yet for the busy→stop composer swap (Task 3.5). *(Note: the Google Fonts inlining blocker was resolved 2026-06-09 by self-hosting fonts; visual verification is no longer font-blocked, only the Task 3.5 component-DOM coverage remains.)*

— session 2026-06-10 (post-review fix pass)

- Applied the confirmed findings from the 2026-06-09 review (each independently re-verified against the code before fixing): the demo dictation now routes to `captureConfirm` via a content-specific co-occurrence pattern checked before the inbox route; mock message ids switched from length-derived to a monotonic counter (no id reuse after typing-removal/cancel rollback); `appendTranscript` trims the incoming transcript once at the seam (leading *and* trailing whitespace); `captureOnly` copy updated to the tap model; the spec `ChatService` interface gained `cancel()` and the stale "pending spec pass" statements in `plan.md`/this log were corrected; OFL license files added for the vendored fonts; `.gitignore` unstaged (separate chore).
- Mic overlay cheap a11y pass: Escape-to-cancel (document-level host listener; cancel is available in every capture state), dialog container `tabindex="-1"` + focused on open (`afterNextRender`), and `[attr.inert]` on the background siblings (session header, message list, quick replies, composer) while the overlay is open. Close ordering verified: inert is removed in the same render pass that destroys the overlay, and `focusComposer()` runs in `afterNextRender` — after the DOM update — so the focus return can never hit an inert subtree.
- `npx vitest run` — 49 passed (6 files; 45→49: +2 regression tests in `mock-chat.service.test.ts` for dictation routing and id non-reuse, +2 transcript-trim tests in `chat.store.test.ts`). `npm run typecheck` (`ngc -p tsconfig.app.json --noEmit`) — exited 0 (validates the host binding, `#overlayRoot` view child, and the `[attr.inert]` bindings).
- Deliberately NOT done (user decision — product is pre-PMF, no speculative polish): composer Enter-semantics on mobile and the `<label>`-wraps-buttons structure (both deferred to the planned dynamic-resize composer rework), `prefers-reduced-motion` guard, browserslist floor declaration, and the overlay focus trap / focus-restore-to-previous-element (Task 3.5 or a later a11y pass).

### Acceptance Coverage
- T3-AC-01: passed — the routed chat screen renders header, independent conversation scroll area, message list, typed quick replies, and bottom composer without horizontal overflow; verified by build/typecheck and Chromium checks at `390x844` and `1280x800`. (The composer gained a second action button on 2026-06-08; layout impact is low-risk but was not re-verified visually.) Quick replies now render in a store-driven bar between the list and composer; a rapid double-click can no longer spawn duplicate user messages / parallel responses (in-flight guards in store + service), covered by new unit tests (2026-06-08). Bar layout not re-verified visually.
- T3-AC-02: passed — tool rows run-length-group into one collapsible `keppt-tool-group`; a multi-tool group expands to its per-tool lines, and a read group surfaces the file paths (e.g. the greeting's `tasks/inbox.md`, `tasks/focus.md`, `tasks/waiting.md`, `daily/2026-05-06.md`). Covered by `chat-message-groups` + `chat-tool-registry` unit tests and the mock lifecycle test. The 2026-06-09 tool-registry refactor is behavior-preserving (same icons/labels/headers, now `Record`-driven); typecheck + the full 40-test suite + an AOT build stayed green, so the grouping AC is unaffected. Earlier Chromium verification observed the same paths on the pre-grouping row; the grouped DOM was not re-verified in a browser.
- T3-AC-03: passed — `QuickRepliesComponent` uses wrapping chips with max-width constraints; Chromium verification reported `quickRepliesWrapWithinViewport: true` on mobile and desktop. The component is unchanged (still flex-wrap, no horizontal scroll) but now mounts as a standalone bar (max-width 640px, centered); the review's staleness concern (chips lingering through user/tool/typing turns) is resolved by deriving them from the last message only (2026-06-08). Standalone-bar wrap not re-verified visually.
- T3-AC-04: partial — the composer now keeps the mic **always visible** and **adds** send when draft text exists (intentionally additive, not a mic→send "switch", so voice stays reachable while editing). As of 2026-06-09 it also has an **in-flight state**: while `busy` the action area shows a single Stop (✕) (mic + send hidden) that cancels the turn; the textarea stays editable so the next message can be pre-drafted. Cancel logic is covered at the store and mock layers (see Test Evidence); the busy→stop **DOM swap** has no component test and was not visually verified. The behavior diverges from the plan's "switches from mic to send" wording and the plan carries **no** cancel AC — the plan should be updated to capture both the additive send and the in-flight cancel state.
- T3-AC-05: partial — the mic overlay was redesigned to `recording / transcribing / error`, with the transcript inserted into the composer (never shown in the overlay); the plan's idle/listening/transcript states are superseded. Store transitions, the cancel/abort race, empty→error+retry, and append-to-draft are covered by 18 unit tests; the redesigned overlay DOM, focus-return, and animations were NOT visually verified this session (Google Fonts build blocker, since resolved — see below). Diverges from the plan's named states — the plan AC should be updated. *(Note: the Google Fonts build blocker was resolved 2026-06-09 by self-hosting fonts; visual verification is no longer font-blocked, only the Task 3.5 component-DOM coverage remains pending.)* A cheap a11y pass (2026-06-10) added Escape-to-cancel, focus-on-open (dialog container), and inert background siblings; focus trap/restore + `aria-live` deferred (see Open Issues).

### Open Issues
- ~~`.gitignore` has an unrelated change in the current worktree (currently staged) that should be reviewed before `/commit 3` decides what to stage.~~ **Resolved 2026-06-10:** unstaged; the blanket `.idea/` rule stays in the worktree to land as a separate chore commit (`git ls-files .idea` is clean — nothing tracked, so the rule change is safe).
- ~~Production build currently depends on Google Fonts network access for Angular font inlining. If offline/sandbox builds should work without escalation, follow up by self-hosting fonts or adjusting Angular font optimization. This also blocks visual verification of the 2026-06-08 redesign in-sandbox.~~ **Resolved 2026-06-09:** fonts are now fully self-hosted — the four `apps/web/public/fonts/*.woff2` subsets, `@font-face` declarations in `apps/web/src/styles.scss`, and a woff2 preload in `apps/web/src/index.html` (no Google Fonts links/preconnects). The production build no longer fetches Google Fonts and is hermetic (networkless/offline builds work without escalation). Visual verification is therefore no longer font-blocked; only the Task 3.5 component-DOM coverage remains pending.
- ~~The plan's T3-AC-04 and T3-AC-05 wording is now stale versus the shipped behavior (record → transcribe → insert-into-composer; always-mic + add-send composer).~~ Resolved 2026-06-09: `docs/work/keppt-ui/plan.md` updated — T3-AC-04/T3-AC-05, the Task 3 component-list + "concrete UI states" instructions, and the Task 6 playground state (T6-AC-06) now describe the new mic/composer model, plus a "Post-Task-3 amendment" note. ~~The upstream spec `docs/specs/angular-chat-ui.md` still carries the old idle/listening/transcript model and the auto-send capture flow — pending a spec pass.~~ **Resolved 2026-06-10:** the spec has been amended to the new model — a "Implementation amendment (Task 3)" note, the recording → transcribing → error overlay that inserts the transcript into the composer (no auto-send), the always-visible-mic + additive-send composer, and `busy` + `cancel()` on the `ChatService` contract alongside the separate `VoiceCaptureService` boundary.
- Visual/DOM verification of the redesigned overlay, the composer two-button layout, the focus-return, and the new standalone quick-reply bar is pending (no longer font-blocked as of the 2026-06-09 self-hosting migration; a natural fit for the Task 3.5 `ng-mocks` component specs).
- Mic overlay a11y is the cheap pass only (2026-06-10): Escape-to-cancel, focus-on-open, inert background. Still missing: a real focus trap (Tab can leave the dialog toward browser chrome), focus restore to the previously-focused element, and `aria-live` announcements of the recording→transcribing→error transitions — a fit for Task 3.5 or a CDK Dialog migration.
- `VoiceCaptureService` has only a mock implementation. The real `MediaRecorder` + Whisper/HTTP impl (with `AbortController`/unsubscribe wired into `cancelRecording`, and microphone-permission-denied → `error` mapping) is future work.
- ~~`captureConfirm` mock response in `chat-mock-data.ts` is still dead — it was tied to the old voice auto-send and no router returns it. Rewritten to the new block-script form (2026-06-09) but remains unrouted. Harmless; can be removed later.~~ **Resolved 2026-06-10:** the demo dictation (`voiceTranscript`) now routes to `captureConfirm` via `routePatterns.captureConfirm` — three order-independent lookaheads requiring co-occurrence of the dictated items, checked *before* the inbox route so the transcript's "sortieren" is no longer swallowed by the inbox pattern. Covered by a routing regression test.
- Per-message `keppt-fade-up` entry animation is wired globally (`apps/web/src/styles.scss`) but is not yet applied to message wrappers. Animation polish belongs to Task 5 ("Polish Mobile App Behavior").
- ~~Cancel semantics for a pending response are still unimplemented — the composer stays usable during a turn instead of offering "Abbrechen"; in-flight actions are ignored, not cancellable.~~ **Resolved 2026-06-09:** `ChatService.cancel()` added; the composer shows a Stop (✕) while `busy`; cancel discards the whole assistant turn (keeps the user message) and the mock aborts the pending timer. Real-backend abort (`AbortController` on the fetch/stream) is still future work, gated on the real `ChatService` adapter. (The previously-deferred MEDIUM finding — mock lifecycle order `tool → typing → final` — was **resolved 2026-06-09** by the replay redesign: the order is now `typing → tool(running→done) → typing → prose → chips`.)
- The busy→stop composer swap and the discard-whole-turn cancel are covered only at the store/mock layers; the DOM swap (✕ shown, mic + send hidden) and the focus/draft-preservation-after-cancel have no component test and were not visually verified — a fit for the Task 3.5 `ng-mocks` specs.
- Cancel discards the **entire** assistant response rather than keeping the partial output (the ChatGPT/Claude convention). This is a deliberate, user-confirmed choice for the non-dev audience; flagged here as a product divergence in case a future "keep what streamed" expectation surfaces — it would be a localized change in `respondWith` (stop replaying instead of restoring the checkpoint).
- Mixed-family tool groups render the neutral "N Schritte" header, and `read` + `search` in one consecutive run also degrade to "N Schritte" (separate display families). Intentional for the non-dev audience; a one-line change to coarser `gather`/`mutate` families would yield "N geprüft" if richer copy is ever wanted.

### Context for Next Task
- The default route now targets `ChatScreenComponent` from `apps/web/src/app/chat/chat-screen.ts`.
- `ChatService` is conversation-only (voice methods removed) plus a concrete `busy` signal — the single definition of "a turn is in flight":

```ts
abstract readonly messages: Signal<readonly ChatMessage[]>;
abstract readonly status: Signal<ChatStatus>;
abstract readonly currentScreen: Signal<AppScreen>;
readonly busy: Signal<boolean>; // concrete on the base: () => status() !== "idle"
abstract sendMessage(content: string): Promise<void>;
abstract chooseQuickReply(label: string): Promise<void>;
abstract cancel(): void; // abort the in-flight turn: keep the user message, discard the whole response, stop the work; no-op when idle
abstract navigate(screen: AppScreen): void;
```

- Cancel contract (2026-06-09): `cancel()` aborts the in-flight turn. The user message that started it stays; every assistant artifact of that turn is discarded; the implementation must stop the underlying work (mock: aborts the pending timer; real adapter: `AbortController.abort()` on the fetch/stream so the backend stops billing). `ChatStore.cancel()` delegates and is a `!busy` no-op. The composer drives it: `[busy]="store.busy()"` and `(cancelMessage)` → `cancelResponse()` → `store.cancel()`.
- Mock abort internals: one `AbortController` per turn (`inFlight`); `wait(ms, signal)` is abortable; `respondWith` snapshots a checkpoint (user message in, no assistant artifacts) and restores it on abort, telling abort from a real throw via `controller.signal.aborted`. A real adapter replaces this with stream cancellation but keeps the same observable contract.

- New `VoiceCaptureService` (provided alongside `ChatService` via `useClass`):

```ts
abstract startRecording(): void;
abstract stopRecording(): Promise<string>; // MUST reject promptly if cancelled mid-flight
abstract cancelRecording(): void;
```

  Contract: `cancelRecording()` aborts in-flight work and `stopRecording()` settles by **rejecting** on cancel — it must never resolve with a transcript after a cancel. The store relies on this and uses plain state guards (no generation token). A promise is not cancellable; the underlying request is aborted and the promise rejects (AbortError).
- `MicCaptureState = "closed" | "recording" | "transcribing" | "error"` lives in `chat-ui-state.ts`; `isMicOverlayVisible(state)` = `state !== "closed"`; `micOverlayStatus(state)` maps to the header status copy.
- `ChatStore` mic API: `micState`, `micOverlayVisible`, `openMicOverlay()` (auto-starts recording), `finishRecording()` (async: transcribe → append to draft → close, or → error), `cancelMicOverlay()`, `retryRecording()`. The transcript is appended to the existing draft (space-joined), never sent, and trimmed once at the seam (`appendTranscript`); whitespace-only transcripts are dropped (2026-06-10).
- `ChatScreenComponent` returns focus to the composer (caret at end) after OK/cancel via `afterNextRender` + `viewChild(ChatInputComponent)`; `ChatInputComponent.focusEnd()` is the entry point. No focus on `error`.
- Mic overlay a11y (2026-06-10): Escape cancels (document-level host listener), the dialog container (`tabindex="-1"`, `#overlayRoot`) is focused on open, and `chat-screen.html` sets `[attr.inert]` on the four background siblings while the overlay is open. No focus trap yet (deferred — see Open Issues). When touching overlay open/close, keep the ordering: inert is removed in the same render pass that destroys the overlay; focus-return runs in `afterNextRender`, after the DOM update.
- Mock message ids are monotonic (`m-${++idCounter}` in `mock-chat.service.ts`) — never derive ids from list length/position; reuse breaks `track item.id` and would suppress the Task-5 enter animations.
- Demo dictation routing: `routePatterns.captureConfirm` must stay the FIRST check in `routeUserText` — the dictation contains "sortieren" and would otherwise be swallowed by the generic inbox pattern.
- Composer action area is `busy`-aware (`chat-input.html`): while idle the mic is always present and the send button is added when `hasComposerText(draft)` is true; while `busy` both are hidden and a single Stop (✕) button renders (emits `cancelMessage`). The textarea is always editable, and a cancel leaves `draftState` untouched, so a message drafted during a turn survives.
- The mic overlay shows no transcript text. recording = waveform; transcribing = spinner; error = retry. The bottom action is a cancel(✕)+OK(✓) pair.
- `MockChatService` and `MockVoiceCaptureService` are `@Injectable()` no-argument services provided by `ChatScreenComponent` through `useClass`. Plain Vitest tests construct them directly (`useValue`) and drive timers with Vitest fake timers.
- Mock response timing is private constants in `mock-chat.service.ts` (replay lifecycle, 2026-06-09): `MOCK_THINK_DELAY_MS = 500` (••• before the first tool of a run), `MOCK_TOOL_DELAY_MS = 750` (one tool running — slowed so the work phase is perceptible), `MOCK_COMPOSE_DELAY_MS = 700` (••• before a prose block). The voice mock uses `MOCK_TRANSCRIBE_DELAY_MS = 600`. Tests should not configure these through the service API; use fake timers and step with `advanceTimersToNextTimerAsync()` per phase (the steps assume each phase registers exactly one timer — keep tool `durationMs` unset/positive).
- Assistant prose still flows through `AssistantContentMessage.markdown` and `AssistantContentMessageComponent`; component-scoped styles should not be used for generated Markdown DOM unless encapsulation changes.
- Quick replies render once in a screen-level bar (`chat-screen.html`, between the message list and the composer), driven by `ChatStore.activeQuickReplies()` (derived from the last message only). They are NOT rendered inline per message anymore — `chat-message`, `assistant-message`, and `chat-message-list` no longer know about quick replies.
- `ChatStore` exposes `busy` (= `ChatService.busy`); `chooseQuickReply`/`submitDraft` no-op while `busy` (submit checks before clearing the draft); `canSubmit` is `draft non-empty && !busy`; `cancel()` delegates to `ChatService.cancel()` and no-ops while `!busy`. The mock mirrors the guard in `sendMessage`/`chooseQuickReply`. Mock invariant: set a non-idle status synchronously before the first `await` in `respondWith` (and take the cancel checkpoint there too), or the double-click guard's race protection breaks.
- Tool rows and quick replies are typed product UI, not Markdown. Keep that split in later tasks.
- Tool messages are structured: `AssistantToolMessage = { tool: ToolName, target: string, summary?: string, state: "running" | "done" }` where `ToolName` = `read_file | list_files | search_files | find_task_occurrences | edit_file | write_file`. As of 2026-06-09 `ToolName`/`ToolState` are defined in `chat-tool-registry.ts` and **re-exported** from `chat.types.ts` (importers can keep pulling them from either). `suggest_quick_replies` is intentionally NOT a `ToolName` — the real `ChatService` adapter must map it to the content message's quick replies (and `question`), never to a tool row.
- **Adding a tool is one edit** (2026-06-09): append the `ToolName` and a `TOOL_REGISTRY` entry in `chat-tool-registry.ts` (`{ family, icon, label }`). The `Record<ToolName, …>` makes the compiler demand all three. Reuse an existing glyph token (`ToolIconName`) and that's the only change; a brand-new glyph also needs one line in `TOOL_ICON` (`chat-tool-icons.ts`, also a `Record` → enforced). No template `@switch`, no per-component icon import.
- Display is derived, never stored, in `chat-tool-registry.ts` (pure, framework-agnostic, tested): `toolLineLabel`, `toolLineIcon` (token), `toolGroupSummary` (count + family verb, neutral "N Schritte" for mixed), `toolGroupIcon` (token). It imports **no** Angular/Lucide — icons are string tokens; the token→Lucide-component map (`TOOL_ICON: Record<ToolIconName, LucideIcon>`) lives in `chat-tool-icons.ts` and is imported only by the components. Keep that split: registry stays pure so its Node tests don't need `@angular/compiler`. Run-length grouping is in `chat-message-groups.ts` (`groupMessagesForRender` → `RenderItem[]`), consumed by a `chat-message-list` computed. `keppt-tool-group` owns the collapsible box (1 tool → a line; >1 → header + expandable lines); `keppt-tool-status-row` is a single line.
- Mock turns are ordered block scripts in `chat-mock-data.ts`: `MockTurn = (MockToolBlock | MockProseBlock | MockChipsBlock)[]` (chips always last). `MockChatService.respondWith` → `playTurn` replays them; `seedTurn` commits the greeting instantly (tools `done`). When wiring the real backend, the adapter produces the same `ChatMessage[]` block list from the tool-call stream — the UI needs no change.
- `@lucide/angular` is the icon dependency. Fixed glyphs use the standalone per-icon directives (e.g. `lucideLoaderCircle`, `lucideChevronDown`); data-driven glyphs use `LucideDynamicIcon` via `<svg [lucideIcon]="iconComponent">` (the binding accepts a Lucide component directly — no `provideLucideIcons`). Tool icons resolve through `TOOL_ICON` (2026-06-09); don't reintroduce per-`ToolName` icon `@switch`es.
- Shared UI atoms live under `apps/web/src/app/ui/` (`KepptMonogramComponent`, `StatusDotComponent`).
- Global typography is delivered by the self-hosted `@font-face` declarations in `apps/web/src/styles.scss` (four `apps/web/public/fonts/*.woff2` subsets) plus a woff2 preload in `apps/web/src/index.html`; there is no Google Fonts dependency, so networkless production builds work (2026-06-09). The OFL license files (`OFL-inter-tight.txt`, `OFL-instrument-serif.txt`) must travel with the woff2 files (2026-06-10).
- The `apps/web/src/app/chat-shell/` directory is no longer the active UI surface.
- Composer layout split: outer `<footer class="composer">` owns the screen-edge padding (`8px 12px 18px`), inner `.composer-pill` owns the max width (`640px`) and centering (`margin: 0 auto`). Keep that split when adjusting composer responsiveness.
- Conversation scrollbar is hidden by default and revealed only via `@media (pointer: fine)` in `chat-message-list.scss`. Touch stays chromeless; desktop gets a native slim bar with a tinted thumb.

### Git State

— session 2026-06-10 (post-review fix pass — current)

`git diff HEAD --shortstat` (the whole Task-3 accumulation vs `HEAD`):

```text
 71 files changed, 4442 insertions(+), 901 deletions(-)
```

This session's fixes are **unstaged on top of the staged Task-3 bulk** (`git diff --stat`: 14 files, +247 −46) — the mock routing/id/copy fixes, the store trim, the mic-overlay a11y pass + `chat-screen.html` inert bindings, and the spec/plan/log doc corrections. `/commit 3` re-derives the final state and must additionally stage the two **untracked** license files `apps/web/public/fonts/OFL-inter-tight.txt` + `apps/web/public/fonts/OFL-instrument-serif.txt`. `.gitignore` is now **unstaged** (` M`) and must NOT be part of the Task-3 commit (it lands as a separate chore); the trailing untracked home-directory/env entries (`.bash_profile`, `.claude/`, `.mcp.json`, …) must NOT be staged either.

— session 2026-06-09 (composer cancel / stop affordance)

`git diff HEAD --shortstat` (the whole Task-3 accumulation vs `HEAD`; everything was staged at that point so the unstaged `git diff --stat` was empty; `/commit 3` re-derives the final state):

```text
 71 files changed, 4168 insertions(+), 891 deletions(-)
```

This session added **no new files** — it modified 9 already-tracked/staged Task-3 files: `chat.service.ts`, `mock-chat.service.ts`, `chat.store.ts`, `chat-input.{ts,html}`, `chat-screen.{ts,html}`, and the `chat.store.test.ts` / `mock-chat.service.test.ts` specs. The `git status --short` shape is unchanged from the prior snapshot below (same paths, all staged); the trailing untracked home-directory/env entries (`.bash_profile`, `.claude/`, `.mcp.json`, …) and the unrelated `.gitignore` change must NOT be staged by `/commit 3`.

— session 2026-06-09 (central tool registry refactor)

`git diff HEAD --shortstat` (captured at that session):

```text
 57 files changed, 3169 insertions(+), 874 deletions(-)
```

Untracked source files `/commit 3` must stage (the full task's new files; `chat-tool-display.ts`/`.test.ts` from the prior session were superseded by the registry and removed):

```text
?? apps/web/src/app/chat/chat-message-groups.ts
?? apps/web/src/app/chat/chat-message-groups.test.ts
?? apps/web/src/app/chat/chat-tool-registry.ts
?? apps/web/src/app/chat/chat-tool-registry.test.ts
?? apps/web/src/app/chat/chat-tool-icons.ts
?? apps/web/src/app/chat/components/tool-group.ts
?? apps/web/src/app/chat/components/tool-group.html
?? apps/web/src/app/chat/components/tool-group.scss
```

Changed by this (registry) session specifically: `chat.types.ts` (modified), `tool-status-row.{ts,html}` (modified), `tool-group.{ts,html}` (modified — from prior-session untracked), `mock-chat.service.test.ts` (modified); added `chat-tool-registry.{ts,test.ts}` + `chat-tool-icons.ts`; deleted `chat-tool-display.{ts,test.ts}`.

Untracked env files that must NOT be staged by `/commit 3`: `apps/web/.claude/`, `apps/web/.mcp.json` (plus the home-directory noise noted below).

---

Prior snapshot (earlier sessions):

`git diff HEAD --stat` (captured during an earlier wrap-up; the task-log line count grows further as this summary is written, and `/commit 3` re-derives the final state):

```text
 .gitignore                                         |   6 +-
 apps/web/package.json                              |   1 +
 apps/web/src/app/app.routes.ts                     |   4 +-
 apps/web/src/app/chat-shell/chat-shell.html        |  62 ---
 apps/web/src/app/chat-shell/chat-shell.scss        | 279 ------------
 apps/web/src/app/chat-shell/chat-shell.ts          |  92 ----
 apps/web/src/app/chat/chat-screen.html             |  29 ++
 apps/web/src/app/chat/chat-screen.scss             |  11 +
 apps/web/src/app/chat/chat-screen.ts               |  91 ++++
 apps/web/src/app/chat/chat-ui-state.test.ts        |  32 ++
 apps/web/src/app/chat/chat-ui-state.ts             |  28 ++
 apps/web/src/app/chat/chat.service.ts              |  14 +-
 apps/web/src/app/chat/chat.store.test.ts           | 233 +++++++++-
 apps/web/src/app/chat/chat.store.ts                |  95 +++-
 .../src/app/chat/components/assistant-message.html |   3 +
 .../src/app/chat/components/assistant-message.scss |  18 +
 .../src/app/chat/components/assistant-message.ts   |  15 +
 apps/web/src/app/chat/components/chat-input.html   |  36 ++
 apps/web/src/app/chat/components/chat-input.scss   |  78 ++++
 apps/web/src/app/chat/components/chat-input.ts     |  56 +++
 .../src/app/chat/components/chat-message-list.html |  19 +
 .../src/app/chat/components/chat-message-list.scss |  86 ++++
 .../src/app/chat/components/chat-message-list.ts   |  74 ++++
 apps/web/src/app/chat/components/chat-message.html |  19 +-
 apps/web/src/app/chat/components/chat-message.scss |  66 +--
 apps/web/src/app/chat/components/chat-message.ts   |   6 +-
 apps/web/src/app/chat/components/mic-overlay.html  | 100 +++++
 apps/web/src/app/chat/components/mic-overlay.scss  | 210 +++++++++
 apps/web/src/app/chat/components/mic-overlay.ts    |  45 ++
 .../web/src/app/chat/components/quick-replies.html |   7 +
 .../web/src/app/chat/components/quick-replies.scss |  30 ++
 apps/web/src/app/chat/components/quick-replies.ts  |  14 +
 .../src/app/chat/components/session-header.html    |  17 +
 .../src/app/chat/components/session-header.scss    |  50 +++
 apps/web/src/app/chat/components/session-header.ts |  20 +
 .../src/app/chat/components/tool-status-row.html   |  33 ++
 .../src/app/chat/components/tool-status-row.scss   |  87 ++++
 .../web/src/app/chat/components/tool-status-row.ts |  27 ++
 apps/web/src/app/chat/components/user-message.html |   3 +
 apps/web/src/app/chat/components/user-message.scss |  27 ++
 apps/web/src/app/chat/components/user-message.ts   |  13 +
 apps/web/src/app/chat/voice-capture.service.ts     |  38 ++
 apps/web/src/app/mock/mock-chat.service.test.ts    | 127 ++++--
 apps/web/src/app/mock/mock-chat.service.ts         | 111 +++--
 .../app/mock/mock-voice-capture.service.test.ts    |  42 ++
 .../web/src/app/mock/mock-voice-capture.service.ts |  54 +++
 apps/web/src/app/ui/keppt-monogram.scss            |  21 +
 apps/web/src/app/ui/keppt-monogram.ts              |  18 +
 apps/web/src/app/ui/status-dot.scss                |   9 +
 apps/web/src/app/ui/status-dot.ts                  |  10 +
 apps/web/src/index.html                            |   6 +
 apps/web/src/styles.scss                           | 201 ++++++++-
 apps/web/tsconfig.json                             |   2 +-
 .../task-3-render-chat-conversation-surface.md     | 491 +++++++++++++++++++++
 pnpm-lock.yaml                                     |  15 +
 55 files changed, 2650 insertions(+), 631 deletions(-)
```

`git status --short`

```text
M  .gitignore
M  apps/web/package.json
M  apps/web/src/app/app.routes.ts
D  apps/web/src/app/chat-shell/chat-shell.html
D  apps/web/src/app/chat-shell/chat-shell.scss
D  apps/web/src/app/chat-shell/chat-shell.ts
AM apps/web/src/app/chat/chat-screen.html
A  apps/web/src/app/chat/chat-screen.scss
AM apps/web/src/app/chat/chat-screen.ts
A  apps/web/src/app/chat/chat-ui-state.test.ts
A  apps/web/src/app/chat/chat-ui-state.ts
MM apps/web/src/app/chat/chat.service.ts
MM apps/web/src/app/chat/chat.store.test.ts
MM apps/web/src/app/chat/chat.store.ts
AM apps/web/src/app/chat/components/assistant-message.html
A  apps/web/src/app/chat/components/assistant-message.scss
AM apps/web/src/app/chat/components/assistant-message.ts
A  apps/web/src/app/chat/components/chat-input.html
A  apps/web/src/app/chat/components/chat-input.scss
A  apps/web/src/app/chat/components/chat-input.ts
AM apps/web/src/app/chat/components/chat-message-list.html
A  apps/web/src/app/chat/components/chat-message-list.scss
AM apps/web/src/app/chat/components/chat-message-list.ts
MM apps/web/src/app/chat/components/chat-message.html
M  apps/web/src/app/chat/components/chat-message.scss
MM apps/web/src/app/chat/components/chat-message.ts
A  apps/web/src/app/chat/components/mic-overlay.html
A  apps/web/src/app/chat/components/mic-overlay.scss
A  apps/web/src/app/chat/components/mic-overlay.ts
A  apps/web/src/app/chat/components/quick-replies.html
AM apps/web/src/app/chat/components/quick-replies.scss
A  apps/web/src/app/chat/components/quick-replies.ts
A  apps/web/src/app/chat/components/session-header.html
A  apps/web/src/app/chat/components/session-header.scss
A  apps/web/src/app/chat/components/session-header.ts
A  apps/web/src/app/chat/components/tool-status-row.html
A  apps/web/src/app/chat/components/tool-status-row.scss
A  apps/web/src/app/chat/components/tool-status-row.ts
A  apps/web/src/app/chat/components/user-message.html
A  apps/web/src/app/chat/components/user-message.scss
A  apps/web/src/app/chat/components/user-message.ts
A  apps/web/src/app/chat/voice-capture.service.ts
MM apps/web/src/app/mock/mock-chat.service.test.ts
MM apps/web/src/app/mock/mock-chat.service.ts
A  apps/web/src/app/mock/mock-voice-capture.service.test.ts
A  apps/web/src/app/mock/mock-voice-capture.service.ts
A  apps/web/src/app/ui/keppt-monogram.scss
A  apps/web/src/app/ui/keppt-monogram.ts
A  apps/web/src/app/ui/status-dot.scss
A  apps/web/src/app/ui/status-dot.ts
M  apps/web/src/index.html
M  apps/web/src/styles.scss
M  apps/web/tsconfig.json
A  docs/work/keppt-ui/task-log/task-3-render-chat-conversation-surface.md
M  pnpm-lock.yaml
```

The trailing untracked entries from `git status` (`.bash_profile`, `.bashrc`, `.claude/`, `.gitconfig`, `.gitmodules`, `.mcp.json`, `.profile`, `.ripgreprc`, `.vscode`, `.zprofile`, `.zshrc`) are unrelated home-directory/environment files, not part of Task 3, and must not be staged by `/commit 3`. `.gitignore` is likewise an unrelated worktree change (see Open Issues).
