### Task
Scaffolded `apps/web` as a standalone, zoneless Angular app that opens directly into a usable Keppt chat shell and participates in the pnpm workspace build/typecheck/test flow.

### Status
DONE

### Files Modified
- `.gitignore` (modified) — ignores Angular `.angular/` cache output so generated build/dev-server cache is not staged with the task.
- `apps/web/angular.json` (new) — defines the Angular application build and serve targets with standalone-component defaults and CSS styling.
- `apps/web/package.json` (new) — declares the web package, Angular/RxJS dependencies, and `build`, `dev`, `typecheck`, and `test` scripts for workspace recursion.
- `apps/web/public/.gitkeep` (new) — keeps the Angular public asset directory in git.
- `apps/web/src/app/app.config.ts` (new) — configures standalone bootstrap providers, router setup, browser error listeners, and zoneless change detection.
- `apps/web/src/app/app.routes.ts` (new) — routes the default path directly to the chat shell.
- `apps/web/src/app/app.ts` (new) — adds the standalone root component with a router outlet.
- `apps/web/src/app/chat-shell/chat-shell.css` (new) — implements the initial Keppt chat shell layout, `100dvh` sizing, safe-area padding, reserved composer, wrapped chips, and custom icon affordances.
- `apps/web/src/app/chat-shell/chat-shell.html` (new) — renders the initial chat header, conversation surface, quick actions, and composer instead of a welcome or landing page.
- `apps/web/src/app/chat-shell/chat-shell.ts` (new) — wires the temporary chat shell state with RxJS `Subject`/`scan` bridged into Signals via `toSignal`.
- `apps/web/src/app/chat-shell/shell-content.test.ts` (new) — covers seed chat content and simple user-message creation for the scaffold.
- `apps/web/src/app/chat-shell/shell-content.ts` (new) — holds temporary typed shell content until Task 2 introduces the chat service boundary.
- `apps/web/src/index.html` (new) — adds the app host, German document language, and viewport-fit metadata.
- `apps/web/src/main.ts` (new) — bootstraps the standalone Angular app.
- `apps/web/src/styles.css` (new) — defines the baseline Keppt CSS variables, page reset, typography stack, and focus styling.
- `apps/web/tsconfig.app.json` (new) — configures Angular app compilation entry points.
- `apps/web/tsconfig.json` (new) — configures strict Angular/browser TypeScript options while extending the root base config.
- `apps/web/vitest.config.ts` (new) — configures the web package test runner.
- `docs/work/keppt-ui/plan.md` (modified) — amended Task 2 to make the local chat store/service boundary explicit for the next task.
- `pnpm-lock.yaml` (modified) — records Angular 21/RxJS web app dependencies in the workspace lockfile.

### Files Read (Context Only)
- `docs/work/keppt-ui/plan.md` — loaded the preamble and Task 1 block during `/start-task`, then checked Task 2/3 wording before the local store plan amendment.
- `package.json` — verified root recursive scripts already route through `pnpm -r`.
- `pnpm-workspace.yaml` — verified `apps/*` is already part of the workspace.
- `pnpm-lock.yaml` — checked existing TypeScript/Vitest resolution and reviewed the new web importer after install.
- `tsconfig.base.json` — confirmed strict shared TypeScript defaults before adding Angular app configs.
- `.nvmrc` — checked intended Node major version before running Angular commands through `fnm`.
- `.gitignore` — checked existing ignored generated directories before adding Angular cache output.
- `apps/cli/package.json` — checked existing package script conventions.
- `packages/core/package.json` — checked existing package script conventions.

### Key Decisions
- Targeted Angular 21.x instead of Angular 20.x because the repo already resolves TypeScript 5.9.3 and current Angular compatibility lists Angular 21 as compatible with TypeScript 5.9 and Node 22.
- Bootstrapped the app manually instead of using a stock CLI welcome scaffold, so the default route opens directly into a Keppt chat shell and does not need cleanup from a generated landing screen.
- Enabled `provideZonelessChangeDetection()` and avoided `zone.js`; state updates in the shell currently flow through Signals or template event handlers.
- Kept all Angular components standalone and did not add NgModules.
- Used RxJS for event/state flow and bridged to Signals once with `toSignal`, avoiding manual subscription-driven field mutation.
- Kept the first chat state local and temporary for Task 1; after discussion, Task 2 plan now explicitly moves UI orchestration into a local chat store/service boundary instead of presentational components.
- Used custom CSS and CSS-drawn temporary icons rather than adding a UI component library. Broad UI kits and forbidden dependencies were not added.
- Added `.angular/` to `.gitignore` after visual verification created Angular cache files under `apps/web`.

### Test Evidence
- `fnm exec --using=22.22.2 pnpm --filter @keppt/web build` passed. Angular generated the production bundle at `apps/web/dist/web`.
- `fnm exec --using=22.22.2 pnpm --filter @keppt/web typecheck` passed with `ngc -p tsconfig.app.json --noEmit`.
- `fnm exec --using=22.22.2 pnpm --filter @keppt/web test` passed: `1 passed (1)`, `3 passed (3)`.
- `fnm exec --using=22.22.2 pnpm -r build` passed for `apps/web`, `packages/core`, and `apps/cli`.
- `fnm exec --using=22.22.2 pnpm -r typecheck` passed for `apps/web`, `packages/core`, and `apps/cli`.
- `fnm exec --using=22.22.2 pnpm -r test` passed for `apps/web`, `packages/core`, and `apps/cli`.
- `rg -n 'NgModule|@NgModule|BrowserModule|AppModule' apps/web/src apps/web` returned no matches.
- `rg -n 'hashbrown|ag-ui|a2ui|@angular/material|primeng|daisyui|shadcn' apps/web/package.json pnpm-lock.yaml` returned no matches.
- `rg -n '100dvh|safe-area-inset|env\(' apps/web/src` found the viewport and safe-area rules in `chat-shell.css` and `styles.css`.
- Started the Angular dev server at `http://127.0.0.1:4200/` and verified the app host with `curl`.
- Captured headless Chromium screenshots at `390x844` and `1280x800`; both rendered the chat shell nonblank with the composer reserved at the bottom. The first mobile screenshot exposed a horizontal chip scrollbar and clipped placeholder, which were fixed before final verification.

### Acceptance Coverage
- `T1-AC-01`: passed — the default route renders the Keppt chat shell directly; no Angular welcome page, landing page, marketing page, or iPhone-frame preview is present.
- `T1-AC-02`: passed — `chat-shell.css` uses `height: 100dvh`, `env(safe-area-inset-*)` padding, a three-row viewport grid, and an independent conversation scroll region with the composer reserved at the bottom.
- `T1-AC-03`: passed — root `pnpm -r build`, `pnpm -r typecheck`, and `pnpm -r test` all include and pass `apps/web`.
- `T1-AC-04`: passed — web runtime dependencies are Angular core/common/router/platform-browser, RxJS, and tslib only; forbidden libraries were not added and `rg` found no forbidden dependency names.

### Open Issues
- The temporary Task 1 shell keeps local state in `ChatShellComponent`; Task 2 should replace this with the planned `ChatService`, `MockChatService`, typed mock data, and local chat store boundary (→ Task 2).
- The current icons are CSS-drawn placeholders. Task 3 plans proper familiar icon affordances, likely via a narrow icon dependency such as `lucide-angular` if needed (→ Task 3).

### Context for Next Task
- `apps/web` is a standalone, zoneless Angular app. There is no `zone.js` dependency and no NgModule/app module.
- The current shell state lives in `apps/web/src/app/chat-shell/chat-shell.ts` as temporary scaffold state: `submittedText$` feeds `scan`, then `toSignal` exposes `messages`.
- Temporary seed content lives in `apps/web/src/app/chat-shell/shell-content.ts`; Task 2 should move domain models, mock data, and service behavior into `apps/web/src/app/chat/` and `apps/web/src/app/mock/`.
- The plan now expects a route/local chat store or service boundary for UI orchestration state. Prefer a component-scoped provider for the shell/screen store over an application-wide singleton unless the implementation discovers a stronger reason.
- Use Node 22 through `fnm exec --using=22.22.2` for Angular commands. The default shell Node was `v25.5.0`, while `.nvmrc` says `20` and Angular 21 supports Node `^20.19.0 || ^22.12.0 || >=24.0.0`.
- The in-app Browser plugin could not be used because its JavaScript runtime tool was unavailable in this session; visual verification was done with local dev server plus headless Chromium screenshots instead.
- `pnpm install` initially hit a sandboxed `EAI_AGAIN`; the escalated install completed quickly. A later network retry was interrupted and not needed after reverting the attempted Vitest 4 package change.

### Git State
`git diff --stat`:

```text
 .gitignore                 |    1 +
 docs/work/keppt-ui/plan.md |    4 +
 pnpm-lock.yaml             | 5294 ++++++++++++++++++++++++++++++++++++++++----
 3 files changed, 4820 insertions(+), 479 deletions(-)
```

`git status --short`:

```text
 M .gitignore
 M docs/work/keppt-ui/plan.md
 M pnpm-lock.yaml
?? .idea/
?? apps/web/
?? docs/specs/context/ui-mock.md
?? docs/work/keppt-ui/task-log/
```
