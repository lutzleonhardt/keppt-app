### Task
Replace the temporary assistant block AST with Markdown-rendered assistant content while keeping known product UI controls typed.

### Status
DONE

### Files Modified
- `apps/web/package.json` (modified) — added `ngx-markdown` and `marked` as runtime dependencies for assistant Markdown rendering.
- `pnpm-lock.yaml` (modified) — locked `ngx-markdown@21.3.0`, `marked@18.0.4`, and their resolved peer graph.
- `apps/web/src/app/app.config.ts` (modified) — registered `provideMarkdown()` for the standalone Angular app.
- `apps/web/src/app/chat-shell/chat-shell.html` (modified) — added the conversation template ref and scroll handler for bottom-pinned chat updates.
- `apps/web/src/app/chat-shell/chat-shell.scss` (modified) — replaced the awkward CSS send arrow with a cleaner up-arrow affordance.
- `apps/web/src/app/chat-shell/chat-shell.ts` (modified) — added bottom-pinning state and post-render scroll scheduling for new messages.
- `apps/web/src/app/chat/chat.types.ts` (modified) — changed `AssistantContentMessage` from `blocks: AssistantBlock[]` to `markdown: string` and removed obsolete prose-AST exports.
- `apps/web/src/app/chat/components/assistant-content-message.html` (new) — dedicated template for the assistant Markdown wrapper.
- `apps/web/src/app/chat/components/assistant-content-message.ts` (modified) — replaced the local block renderer loop with `MarkdownComponent`, moved the markup to `templateUrl`, and kept the host layout neutral with `display: contents`.
- `apps/web/src/app/chat/components/assistant-block.html` (deleted) — removed obsolete assistant prose block template.
- `apps/web/src/app/chat/components/assistant-block.scss` (deleted) — removed obsolete assistant prose block styles.
- `apps/web/src/app/chat/components/assistant-block.ts` (deleted) — removed obsolete assistant prose block component.
- `apps/web/src/app/chat/components/chat-inline-text.scss` (deleted) — removed obsolete inline prose styling helper.
- `apps/web/src/app/chat/components/chat-inline-text.ts` (deleted) — removed obsolete inline prose renderer.
- `apps/web/src/app/chat/components/rich-list-item.html` (deleted) — removed obsolete rich list item template.
- `apps/web/src/app/chat/components/rich-list-item.scss` (deleted) — removed obsolete rich list item styles.
- `apps/web/src/app/chat/components/rich-list-item.ts` (deleted) — removed obsolete rich list item renderer.
- `apps/web/src/app/mock/chat-mock-data.ts` (modified) — converted all mock assistant prose fixtures from local block arrays to Markdown strings while preserving German copy and typed tool/quick-reply data.
- `apps/web/src/app/mock/mock-chat.service.test.ts` (modified) — updated assertions for `markdown`, absence of `blocks`, and quick replies staying outside Markdown.
- `apps/web/src/styles.scss` (modified) — added scoped Markdown typography under `.assistant-markdown` for generated paragraphs, headings, lists, links, inline code, code blocks, strong text, and emphasis.
- `docs/work/keppt-ui/plan.md` (modified) — replaced the Task 2.5 spec-file reference with a self-contained discovery statement.
- `docs/specs/context/ngx-markdown.md` (new) — Sourcegraph DeepSearch context used to confirm current `ngx-markdown` integration, dependency, styling, and sanitizer behavior.

### Files Read (Context Only)
- `docs/work/keppt-ui/plan.md` — task scope, acceptance criteria, key locations, and self-containment check.
- `docs/work/keppt-ui/task-log/task-2-define-chat-service-contract.md` — predecessor context showing the block AST was temporary and should be replaced.
- `docs/specs/context/ui-mock.md` — checked the original `ngx-markdown` recommendation before removing the plan's direct spec reference.
- `/home/lutz/.codex/plugins/cache/openai-bundled/browser/0.1.0-alpha2/skills/browser/SKILL.md` — browser verification workflow; the in-app browser execution tool was unavailable, so local headless Chromium was used.

### Key Decisions
- Use `provideMarkdown()` in `app.config.ts`, not `MarkdownModule.forRoot()`, because this app uses standalone Angular configuration.
- Render assistant prose with `MarkdownComponent` and `<markdown [data]="message().markdown" />`; the message DTO now carries a plain Markdown string and no client-owned prose AST.
- Keep typed product UI outside Markdown. Tool rows remain `AssistantToolMessage`; quick replies remain `AssistantContentMessage.quickReplies`.
- Keep the default `ngx-markdown` sanitizer. The current content is local mock data, and the default Angular HTML sanitizer remains appropriate when backend content arrives later.
- Put Markdown typography in global `styles.scss` under `.assistant-markdown` because Angular emulated encapsulation does not reliably style DOM injected through `innerHTML`.
- Delete `AssistantBlock`, `InlineText`, `RichListItem`, and their renderer components because no remaining typed product widget depends on them.
- Treat ImageMagick RMSE as a visual smoke signal, not a pixel-perfect gate. The final visual decision used screenshot comparison plus DOM/text/overflow checks.

— session 2026-05-22

- Keep `display: contents` on the assistant content host so the Angular component wrapper stays present in the DOM without adding a layout box around the message content.
- Move the assistant Markdown markup into `assistant-content-message.html`; the component keeps only the small host style inline.
- Implement the current scroll anchoring locally instead of adding a dependency. The behavior is small and chat-specific, and Task 3 can move it into the planned `ChatMessageListComponent`.
- Use a nested `requestAnimationFrame` for scroll-to-bottom because verification showed `ngx-markdown` can grow message height after the first scroll and otherwise leave the list slightly above the bottom.
- Remove the `requestAnimationFrame` existence fallback because this app has no SSR target.

### Test Evidence
- Dependency install:

```text
fnm exec --using=22.22.2 pnpm --filter @keppt/web add ngx-markdown marked@^18.0.0

Done in 2s using pnpm v10.33.4
WARN Issues with peer dependencies found
apps/web
└─┬ @angular/build 21.2.12
  └── ✕ unmet peer vitest@^4.0.8: found 1.6.1
```

- Unit tests:

```text
fnm exec --using=22.22.2 pnpm --filter @keppt/web test

✓ src/app/chat/chat.store.test.ts  (1 test) 6ms
✓ src/app/mock/mock-chat.service.test.ts  (5 tests) 7ms

Test Files  2 passed (2)
Tests  6 passed (6)
Duration  630ms
```

- Typecheck:

```text
fnm exec --using=22.22.2 pnpm --filter @keppt/web typecheck

> ngc -p tsconfig.app.json --noEmit
```

Command exited with code 0.

- Production build:

```text
fnm exec --using=22.22.2 pnpm --filter @keppt/web build

Initial chunk files | Names         |  Raw size | Estimated transfer size
main-TJI4CCK7.js    | main          | 310.63 kB |                84.74 kB
styles-CIUGNNEK.css | styles        |   1.81 kB |               646 bytes

Initial total | 312.44 kB | 85.39 kB
Application bundle generation complete.
```

- Obsolete-renderer source scan:

```text
rg -n "AssistantBlock|InlineText|RichListItem|blocks:|\.blocks|assistant-block|chat-inline-text|rich-list-item|keppt-assistant-block|keppt-inline-text|keppt-rich-list-item" apps/web/src
```

No remaining production references. The only earlier match was the negative test asserting `blocks` is absent.

- Visual baseline and post-change screenshots:

```text
/tmp/keppt-chat-baseline.png PNG 390x844
/tmp/keppt-chat-post.png     PNG 390x844
compare -metric RMSE /tmp/keppt-chat-baseline.png /tmp/keppt-chat-post.png /tmp/keppt-chat-diff.png
5469.35 (0.083457)
```

The RMSE value was reviewed as a smoke signal; both screenshots were visually inspected and showed no meaningful layout regression in the greeting state.

- Scripted mobile DOM and overflow verification at `390px`:

```json
{
  "viewportWidth": 390,
  "scrollWidth": 390,
  "overflowX": false,
  "markdownHosts": 1,
  "paragraphs": 2,
  "strong": 2,
  "quickReplyButtons": [
    "Tag planen",
    "Warten auf zeigen",
    "Erstmal nur erfassen"
  ],
  "markdownText": "Guten Morgen, Lutz. Heute ist Mittwoch, 6. Mai.\n\nEine offene Rückmeldung wartet seit 8 Tagen — DB Follow-up-Call. Willst du kurz reinschauen, bevor wir den Tag planen?",
  "blockRendererElements": 0
}
```

— session 2026-05-22

- Typecheck after extracting the assistant template and after scroll-anchor cleanup:

```text
pnpm --dir apps/web typecheck

> @keppt/web@0.0.0 typecheck /home/lutz/projects/keppt-app-keppt-ui/apps/web
> ngc -p tsconfig.app.json --noEmit
```

Command exited with code 0.

- Unit tests after chat-shell scroll/send polish:

```text
pnpm --dir apps/web test

✓ src/app/chat/chat.store.test.ts  (1 test) 6ms
✓ src/app/mock/mock-chat.service.test.ts  (5 tests) 7ms

Test Files  2 passed (2)
Tests  6 passed (6)
Duration  604ms
```

- Headless Chromium screenshot at `390x844` verified the send button renders as an up-arrow instead of the earlier diagonal/right-arrow shape.
- DevTools scroll probe against the local Angular app verified bottom-pinned behavior and user-scroll preservation:

```json
{
  "pinnedAfterAppends": {
    "scrollTop": 2339,
    "scrollHeight": 3000,
    "clientHeight": 661,
    "distanceFromBottom": 0
  },
  "beforeOffBottom": {
    "scrollTop": 0,
    "scrollHeight": 3000,
    "clientHeight": 661,
    "distanceFromBottom": 2339
  },
  "afterOffBottomAppend": {
    "scrollTop": 0,
    "scrollHeight": 3379,
    "clientHeight": 661,
    "distanceFromBottom": 2718
  },
  "afterPinnedAppend": {
    "scrollTop": 3097,
    "scrollHeight": 3758,
    "clientHeight": 661,
    "distanceFromBottom": 0
  }
}
```

### Acceptance Coverage
- T2.5-AC-01: passed — `AssistantContentMessage` now exposes `markdown: string`; `AssistantBlock`, `InlineText`, `RichListItem`, and `blocks` were removed from the public DTO surface.
- T2.5-AC-02: passed — assistant content is rendered by `ngx-markdown` through `MarkdownComponent` and `<markdown [data]="message().markdown" />`.
- T2.5-AC-03: passed — tool rows and quick replies remain typed data; tests assert quick replies stay out of the Markdown string.
- T2.5-AC-04: passed — all existing chat/mock tests pass after conversion, and the greeting visual state preserves equivalent visible German assistant content.
- T2.5-AC-05: passed — obsolete block renderer types/components were deleted and source scans found no remaining production references.
- T2.5-AC-06: passed — Markdown output is styled only under `.assistant-markdown`; no broad global element rules for Markdown typography were added.
- T2.5-AC-07: passed — baseline/post screenshots were captured and compared; scripted DOM checks verified expected Markdown elements, separate quick-reply buttons, no horizontal overflow, and no old block renderer elements.

### Open Issues
- The package install reports an existing non-blocking peer warning: `@angular/build 21.2.12` expects `vitest@^4.0.8` but the app has `vitest@1.6.1`. Current tests, typecheck, and build pass.

### Context for Next Task
- Assistant prose now uses this DTO shape:

```ts
export interface AssistantContentMessage {
  id: string;
  role: "assistant";
  kind: "content";
  markdown: string;
  quickReplies?: QuickReply[];
  createdAt: string;
}
```

- `apps/web/src/app/chat/components/assistant-content-message.ts` imports `MarkdownComponent` from `ngx-markdown`; the dedicated `assistant-content-message.html` template renders the Markdown under `.assistant-markdown`.
- `provideMarkdown()` is registered once in `apps/web/src/app/app.config.ts`; no `HttpClient`, Prism, Mermaid, DOMPurify, or remote Markdown loading was added.
- Generated Markdown DOM styling lives in `apps/web/src/styles.scss` under `.assistant-markdown`; component-scoped SCSS should not be used for those generated child nodes unless encapsulation is deliberately changed.
- Mock assistant prose fixtures live as Markdown strings in `apps/web/src/app/mock/chat-mock-data.ts`; tool/status rows and quick replies remain typed fields.
- Current scroll anchoring and the CSS-drawn send icon live in `ChatShellComponent`; Task 3 can move the scroll behavior into the planned `ChatMessageListComponent` and may replace CSS-drawn icons with `lucide-angular` or another narrow icon dependency.
- Use Node 22 via `fnm exec --using=22.22.2` for checks.

### Git State
`git diff --stat`

```text
 apps/web/package.json                              |   2 +
 apps/web/src/app/app.config.ts                     |   2 +
 apps/web/src/app/chat-shell/chat-shell.html        |   2 +-
 apps/web/src/app/chat-shell/chat-shell.scss        |  24 +-
 apps/web/src/app/chat-shell/chat-shell.ts          |  58 ++++-
 apps/web/src/app/chat/chat.types.ts                |  19 +-
 .../src/app/chat/components/assistant-block.html   |  27 --
 .../src/app/chat/components/assistant-block.scss   |  35 ---
 .../web/src/app/chat/components/assistant-block.ts |  41 ---
 .../chat/components/assistant-content-message.ts   |  11 +-
 .../src/app/chat/components/chat-inline-text.scss  |   8 -
 .../src/app/chat/components/chat-inline-text.ts    |  36 ---
 .../src/app/chat/components/rich-list-item.html    |  17 --
 .../src/app/chat/components/rich-list-item.scss    |  13 -
 apps/web/src/app/chat/components/rich-list-item.ts |  15 --
 apps/web/src/app/mock/chat-mock-data.ts            | 285 +++++++--------------
 apps/web/src/app/mock/mock-chat.service.test.ts    |  23 +-
 apps/web/src/styles.scss                           |  52 ++++
 docs/work/keppt-ui/plan.md                         |   2 +-
 ...ace-assistant-blocks-with-markdown-rendering.md |  94 ++++++-
 pnpm-lock.yaml                                     |  91 +++++--
 21 files changed, 387 insertions(+), 470 deletions(-)
```

`git status --short`

```text
 M apps/web/package.json
 M apps/web/src/app/app.config.ts
 M apps/web/src/app/chat-shell/chat-shell.html
 M apps/web/src/app/chat-shell/chat-shell.scss
 M apps/web/src/app/chat-shell/chat-shell.ts
 M apps/web/src/app/chat/chat.types.ts
 D apps/web/src/app/chat/components/assistant-block.html
 D apps/web/src/app/chat/components/assistant-block.scss
 D apps/web/src/app/chat/components/assistant-block.ts
 M apps/web/src/app/chat/components/assistant-content-message.ts
 D apps/web/src/app/chat/components/chat-inline-text.scss
 D apps/web/src/app/chat/components/chat-inline-text.ts
 D apps/web/src/app/chat/components/rich-list-item.html
 D apps/web/src/app/chat/components/rich-list-item.scss
 D apps/web/src/app/chat/components/rich-list-item.ts
 M apps/web/src/app/mock/chat-mock-data.ts
 M apps/web/src/app/mock/mock-chat.service.test.ts
 M apps/web/src/styles.scss
A  docs/specs/context/ngx-markdown.md
 M docs/work/keppt-ui/plan.md
AM docs/work/keppt-ui/task-log/task-2.5-replace-assistant-blocks-with-markdown-rendering.md
 M pnpm-lock.yaml
?? apps/web/src/app/chat/components/assistant-content-message.html
```
