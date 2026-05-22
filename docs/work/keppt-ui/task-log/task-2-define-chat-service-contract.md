### Task
Define the chat service contract, move the mock chat flow behind that contract, and connect the shell through a local store instead of embedded mock arrays.

### Status
DONE

### Files Modified
- `apps/web/angular.json` (modified) - switched the web app style entry and component schematic default from CSS to SCSS.
- `apps/web/src/styles.scss` (new) - renamed the global stylesheet from CSS to SCSS.
- `apps/web/src/styles.css` (deleted) - replaced by `styles.scss`.
- `apps/web/src/app/chat-shell/chat-shell.ts` (modified) - provides `MockChatService` as the local `ChatService` implementation and consumes `ChatStore`.
- `apps/web/src/app/chat-shell/chat-shell.html` (modified) - renders messages through dedicated chat message components instead of inline mock content blocks.
- `apps/web/src/app/chat-shell/chat-shell.scss` (new) - SCSS replacement for the shell styles.
- `apps/web/src/app/chat-shell/chat-shell.css` (deleted) - replaced by `chat-shell.scss`.
- `apps/web/src/app/chat-shell/shell-content.ts` (deleted) - removed the temporary static shell mock arrays.
- `apps/web/src/app/chat-shell/shell-content.test.ts` (deleted) - replaced by service/store tests.
- `apps/web/src/app/chat/chat.service.ts` (new/modified) - defines abstract `ChatService` as the Angular DI token and service contract.
- `apps/web/src/app/chat/chat.store.ts` (new/modified) - adds the local store boundary with readonly service signals, draft state, computed quick replies, and chat actions.
- `apps/web/src/app/chat/chat.store.test.ts` (new/modified) - covers store signal/action behavior.
- `apps/web/src/app/chat/chat.types.ts` (new/modified) - defines chat DTO types, discriminated message union, base message contract, assistant block types, and type guards.
- `apps/web/src/app/chat/components/chat-message.ts` (new/modified) - dispatches a message to the correct presentational renderer through guards.
- `apps/web/src/app/chat/components/chat-message.html` (new) - template for user, assistant tool, typing, and content messages.
- `apps/web/src/app/chat/components/chat-message.scss` (new) - styles for the message wrapper and bubbles.
- `apps/web/src/app/chat/components/chat-message.css` (deleted) - replaced by `chat-message.scss`.
- `apps/web/src/app/chat/components/assistant-content-message.ts` (new/modified) - renders assistant content blocks and tracks them by block id.
- `apps/web/src/app/chat/components/assistant-block.ts` (new/modified) - renders current typed assistant block variants.
- `apps/web/src/app/chat/components/assistant-block.html` (new/modified) - template for block rendering with stable tracking for nested lists/text.
- `apps/web/src/app/chat/components/assistant-block.scss` (new) - SCSS replacement for assistant block styles.
- `apps/web/src/app/chat/components/assistant-block.css` (deleted) - replaced by `assistant-block.scss`.
- `apps/web/src/app/chat/components/chat-inline-text.ts` (new/modified) - presentational inline text renderer.
- `apps/web/src/app/chat/components/chat-inline-text.scss` (new) - moved inline styles into SCSS.
- `apps/web/src/app/chat/components/rich-list-item.ts` (new/modified) - presentational renderer for rich list rows.
- `apps/web/src/app/chat/components/rich-list-item.html` (new/modified) - template for rich list rows.
- `apps/web/src/app/chat/components/rich-list-item.scss` (new) - moved inline styles into SCSS.
- `apps/web/src/app/mock/chat-mock-data.ts` (new/modified) - holds mock response content, routing patterns, quick replies, and helper creators.
- `apps/web/src/app/mock/mock-chat.service.ts` (new/moved) - implements the mock `ChatService` behind private writable signals and readonly public signals.
- `apps/web/src/app/mock/mock-chat.service.test.ts` (new/moved) - covers mock greeting, routing, quick replies, and voice capture behavior.
- `apps/web/src/app/chat/mock-chat.service.ts` (deleted) - moved the mock implementation under `mock/`.
- `apps/web/src/app/chat/mock-chat.service.test.ts` (deleted) - moved the mock tests under `mock/`.

### Files Read (Context Only)
- `docs/work/keppt-ui/plan.md` - task scope and acceptance criteria.
- `docs/work/keppt-ui/task-log/task-1-scaffold-web-app-foundation.md` - prior task context.
- `docs/specs/angular-chat-ui.md` - product and UI direction for the Angular chat app.
- `docs/specs/context/ui-mock.md` - reference context for the chat mock, including the later `ngx-markdown` note.
- `/home/lutz/projects/keppt/keppt-landing/src/components/mock/strings.tsx` - source mock copy and quick reply wording.
- `/home/lutz/projects/keppt/keppt-landing/src/components/mock/MockDevice.tsx` - reference shell/device behavior.
- `apps/web/package.json` - existing scripts and dependencies.
- `apps/web/src/app/app.config.ts` - app provider context.
- `apps/web/src/app/app.routes.ts` - route context.

### Key Decisions
- Use an abstract `ChatService` class as the Angular DI token instead of a separate `InjectionToken`. The class is already a token in Angular DI and keeps the provider setup less noisy for this local boundary.
- Keep the mock service and its tests under `apps/web/src/app/mock/`. The mock is demo data and behavior, not the long-term chat domain implementation.
- Expose service and store state as readonly Angular `Signal` values. Writable signals stay private inside the mock service or store; public state is exposed through `asReadonly()` where the owner creates the signal.
- Use RxJS/signals meaningfully and avoid subscribing just to copy async values into synchronous fields. The store is a thin signal/action boundary and has no subscription-driven field mutation.
- Model network-like chat data as plain JSON DTOs with a discriminator (`kind`), a `ChatMessage` union, a `BaseChatMessage` contract, and guard helpers. This is idiomatic TypeScript for duck-typed data and avoids pretending that JSON payloads are real class instances.
- Split the large shell message template into presentational components. This keeps the shell focused on layout and store actions, and prevents future agents from extending a large inline switch.
- Switch component/global styling to SCSS now. CSS custom properties remain useful for runtime design tokens, while SCSS makes local component styling more ergonomic.
- Add stable `id` fields to assistant block variants and track blocks by id instead of `$index`.
- Important follow-up decision: the current typed `AssistantBlock` AST exists because Task 2/3 in the plan asked for typed blocks. After reviewing the context spec, this is probably the wrong long-term model. Assistant content should likely become a markdown string rendered through `ngx-markdown`, so the next task should amend the plan and remove the block AST instead of expanding it.

### Test Evidence
- `fnm exec --using=22.22.2 pnpm --filter @keppt/web test`

```text
✓ src/app/chat/chat.store.test.ts  (1 test) 5ms
✓ src/app/mock/mock-chat.service.test.ts  (5 tests) 8ms

Test Files  2 passed (2)
Tests  6 passed (6)
Duration  659ms
```

- `fnm exec --using=22.22.2 pnpm --filter @keppt/web typecheck`

```text
> ngc -p tsconfig.app.json --noEmit
```

Command exited with code 0.

- `fnm exec --using=22.22.2 pnpm --filter @keppt/web build`

```text
Initial chunk files | Names         |  Raw size | Estimated transfer size
main-H6PAWFHN.js    | main          | 227.36 kB |                61.44 kB
styles-RFYAHOZJ.css | styles        |   1.02 kB |                 1.02 kB

Application bundle generation complete. [1.999 seconds] - 2026-05-22T13:11:37.835Z
```

- `rg -n 'track \$index' apps/web/src/app`

```text
No matches.
```

- Manual visual verification was done earlier with headless Chromium screenshots after the component and SCSS refactors. The in-app browser automation was unavailable in that session, so Chromium was used as the fallback local browser check.

### Acceptance Coverage
- T2-AC-01: passed - chat shell and presentational components now depend on `ChatStore`/`ChatService`; static shell mock arrays were removed.
- T2-AC-02: passed - `MockChatService` simulates greeting, tool rows, typing, final assistant responses, and quick replies; covered by `apps/web/src/app/mock/mock-chat.service.test.ts`.
- T2-AC-03: passed - keyword routing for planning, today/focus, waiting/Max/DB, inbox cleanup, acknowledge, and fallback is covered by mock service tests.
- T2-AC-04: passed - voice capture produces the Anna/tax-documents/AI-Apps transcript and capture confirmation; covered by mock service tests.
- T2-AC-05: passed - `ChatStore` owns the local action boundary, exposes readonly signals, and avoids subscription-driven sync field mutation.

### Open Issues
- Assistant content is currently modeled as typed `AssistantBlock` data because the Task 2/3 plan asked for typed blocks. The context spec also points toward `ngx-markdown` for assistant markdown rendering, and the user decided the block AST should be replaced next. Follow-up should convert assistant content to markdown strings and render with `ngx-markdown` before investing further in block components.
- Icons are still CSS-drawn placeholders in the current chat shell. Proper icon affordances should be handled with the icon system in the next UI polish task.
- The chat surface still needs the richer later-task behavior: scroll anchoring, full voice overlay polish, drawer/list surfaces, and final responsive interaction details.

### Context for Next Task
- `ChatService` is the abstract class contract and Angular DI token. The shell currently provides `{ provide: ChatService, useClass: MockChatService }`.
- `ChatStore` exposes `messages`, `status`, `currentScreen`, `draft`, `quickReplies`, and `canSubmit` as signals, plus action methods for submit, quick reply, voice capture, cancel, and navigation.
- Mock data and behavior live under `apps/web/src/app/mock/`.
- Message rendering components live under `apps/web/src/app/chat/components/`.
- The likely next technical step is a small plan amendment or direct refactor: replace `AssistantContentMessage.blocks` with a markdown string, add/use `ngx-markdown`, remove `AssistantBlock`/`RichListItem`/`InlineText` once no longer needed, and keep mock response data as markdown fixtures.
- Styles are now SCSS, but CSS custom properties still carry runtime theme values.
- Use Node 22 via `fnm exec --using=22.22.2` for checks.

### Git State
`git diff --stat`

```text
 apps/web/angular.json                              |   4 +-
 apps/web/src/app/chat-shell/chat-shell.css         | 307 ---------------------
 apps/web/src/app/chat-shell/chat-shell.html        |  26 +-
 apps/web/src/app/chat-shell/chat-shell.ts          |  69 ++---
 apps/web/src/app/chat-shell/shell-content.test.ts  |  30 --
 apps/web/src/app/chat-shell/shell-content.ts       |  45 ---
 apps/web/src/app/chat/chat.service.ts              |  24 +-
 apps/web/src/app/chat/chat.store.test.ts           |   6 +-
 apps/web/src/app/chat/chat.store.ts                |  34 ++-
 apps/web/src/app/chat/chat.types.ts                |  63 +++--
 .../src/app/chat/components/assistant-block.css    |  35 ---
 .../src/app/chat/components/assistant-block.html   |   6 +-
 .../web/src/app/chat/components/assistant-block.ts |   2 +-
 .../chat/components/assistant-content-message.ts   |   2 +-
 .../src/app/chat/components/chat-inline-text.ts    |  13 +-
 apps/web/src/app/chat/components/chat-message.css  |  73 -----
 apps/web/src/app/chat/components/chat-message.ts   |  16 +-
 .../src/app/chat/components/rich-list-item.html    |   4 +-
 apps/web/src/app/chat/components/rich-list-item.ts |  18 +-
 apps/web/src/app/chat/mock-chat.service.test.ts    | 156 -----------
 apps/web/src/app/chat/mock-chat.service.ts         | 230 ---------------
 apps/web/src/app/mock/chat-mock-data.ts            |  62 +++--
 apps/web/src/app/mock/mock-chat.service.test.ts    |   2 +
 apps/web/src/styles.css                            |  62 -----
 24 files changed, 158 insertions(+), 1131 deletions(-)
```

`git status --short`

```text
 M apps/web/angular.json
 D apps/web/src/app/chat-shell/chat-shell.css
 M apps/web/src/app/chat-shell/chat-shell.html
A  apps/web/src/app/chat-shell/chat-shell.scss
 M apps/web/src/app/chat-shell/chat-shell.ts
 D apps/web/src/app/chat-shell/shell-content.test.ts
 D apps/web/src/app/chat-shell/shell-content.ts
AM apps/web/src/app/chat/chat.service.ts
AM apps/web/src/app/chat/chat.store.test.ts
AM apps/web/src/app/chat/chat.store.ts
AM apps/web/src/app/chat/chat.types.ts
AD apps/web/src/app/chat/components/assistant-block.css
AM apps/web/src/app/chat/components/assistant-block.html
A  apps/web/src/app/chat/components/assistant-block.scss
AM apps/web/src/app/chat/components/assistant-block.ts
AM apps/web/src/app/chat/components/assistant-content-message.ts
A  apps/web/src/app/chat/components/chat-inline-text.scss
AM apps/web/src/app/chat/components/chat-inline-text.ts
AD apps/web/src/app/chat/components/chat-message.css
A  apps/web/src/app/chat/components/chat-message.html
A  apps/web/src/app/chat/components/chat-message.scss
AM apps/web/src/app/chat/components/chat-message.ts
AM apps/web/src/app/chat/components/rich-list-item.html
A  apps/web/src/app/chat/components/rich-list-item.scss
AM apps/web/src/app/chat/components/rich-list-item.ts
AD apps/web/src/app/chat/mock-chat.service.test.ts
AD apps/web/src/app/chat/mock-chat.service.ts
AM apps/web/src/app/mock/chat-mock-data.ts
AM apps/web/src/app/mock/mock-chat.service.test.ts
A  apps/web/src/app/mock/mock-chat.service.ts
 D apps/web/src/styles.css
A  apps/web/src/styles.scss
A  docs/specs/context/ui-mock.md
?? .idea/
?? docs/work/keppt-ui/task-log/task-2-define-chat-service-contract.md
```
