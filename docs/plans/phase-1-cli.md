# Plan — Phase 1: CLI ("It works in the terminal")

> Spec: [`docs/specs/architecture.md`](../specs/architecture.md) (Build Milestones → Phase 1) + [`docs/specs/product.md`](../specs/product.md)
> SDK research: [`docs/specs/vercel-sdk.md`](../specs/vercel-sdk.md)

## Scope

Local CLI that runs end-to-end against the user's own Obsidian vault as a `LocalFileRepository`. Vercel AI SDK with Claude Haiku (single model — model routing is an unresolved architectural question and explicitly deferred, see `docs/specs/architecture.md` → "LLM Provider Architecture"), 5 tools, system prompt R1-R13, one session per day, daily-note lifecycle. **No server, no Supabase, no auth, no tier check.** Goal: validate the GTD prompts and the tool loop under realistic conditions.

## SDK fixed points (from research)

- `ai@^7.0.0-beta.111` + `@ai-sdk/anthropic@^4.0.0-beta.37` (beta — check whether a stable release exists, otherwise accept beta)
- Node `>=20`
- Model IDs: `claude-haiku-4-5` (MVP default), `claude-sonnet-4-6` for planning/review
- Agentic loop: `stopWhen: isStepCount(10)` — **default is 1; without an explicit `stopWhen` there is no loop**
- Tool errors: the SDK automatically converts throws from `execute` into `tool-error` parts — no manual wrapping needed
- Tools: `tool({ description, inputSchema: z..., execute })` with Zod
- Persistence: append `(await result.response).messages` to the session history
- Streaming: subscribe to `fullStream`, react to `text`, `tool-call`, `tool-error`
- Testing: `MockLanguageModelV4` from `ai/test`
- Prompt caching: manual via `providerOptions.anthropic.cacheControl`
- AbortController for Ctrl+C is automatically forwarded to tool executes

## Flexibility Clause

> The executing agent may adjust scope and ordering based on more up-to-date context discovered during implementation, as long as each task still satisfies the sizing rules from `/plan`.

## Tasks at a glance

1. Monorepo + FileRepository + LocalFileRepository (read/write/list/search + JSON history)
2. `edit_file` with atomic search/replace (uniqueness check + structured error returns)
3. CLI + Vercel AI SDK + tool handlers (minimal prompt) → **first real console run**
3.5. GTD layout policy gate (`canRead` / `canWrite` at the `buildTools` boundary) — Task-3 follow-up, closes Codex adversarial-review finding #1. See `docs/task-log/task-3.5-gtd-layout-policy.md`.
3.6. CLI operational error logging — Task-3 manual-smoke follow-up, post-created 2026-05-09 after an Anthropic low-balance failure showed that the SDK default logs raw `APICallError` objects to stderr. The CLI prints a stable summary and writes full diagnostics to a vault-local JSONL log. See `docs/task-log/task-3.6-cli-error-logging.md`.
3.7. Per-message retry budget for `edit_file` (`retry-budget.ts` + tool-layer wrapper) — Task-3 follow-up, post-created 2026-05-09 from a comparison review against an autonomous-agent build. Caps repeated `edit_file` failures on the same file within one user message at 2; 3rd attempt short-circuits to `retry_budget_exhausted`. See `docs/task-log/task-3.7-retry-budget.md`.
3.8. Path-safety expansion (8 → 13 attack vectors): drive letters, segment trailing dots/whitespace, length caps, reserved Windows names, runtime symlink-escape check in `LocalFileRepository` — Task-3 follow-up, post-created 2026-05-09 from the same comparison review. See `docs/task-log/task-3.8-path-safety.md`.
3.9. Shared logging abstraction — Task-3 follow-up, post-created 2026-05-09 from the operational logging architecture decision. Introduces a runtime-neutral `Logger`/`LogEvent` contract, keeps `packages/core` free of `console.*`, and moves CLI terminal output vs. diagnostics behind explicit adapters.
4. System prompt R1-R13 + request builder + input heuristic + prompt caching (model routing deferred — see Task 4 block)
4.1. Tool-result pruning + session persistence — Task-4 follow-up, split out 2026-05-18 during `/start-task 4` because the original Task 4 exceeded the `/plan` "diff + tests fit one commit" sizing rule. Task 4 ships the prompt/router/input/caching pipeline with the existing in-memory message array; Task 4.1 swaps that array for on-disk sessions and adds `pruneToolResults` to the request-builder. Reverse dependency forced: Task 4.1 edits `request-builder.ts` and `apps/cli/src/index.ts`, which Task 4 creates/rewrites. **Pre-commit redesign 2026-05-19:** a Codex adversarial review of the in-flight 4.1 diff flagged three concrete bugs (Phase-2-save rollback gap, UTC day-rollover contamination, non-atomic write) plus a layering smell (core writing through `node:fs` directly, unusable from the Phase-2a web/Supabase target). All four folded into 4.1 before commit — they sit inside 4.1's own artifacts. Result: `Session` reshaped from passive record into a class with encapsulated invariants + injectable `SessionStore`.
4.2. Per-turn debug logging (request/response artifacts) — Task-4 follow-up, post-created 2026-05-19. Task 4 wired prompt caching and Task 4.1 wired tool-result pruning, but both are invisible at runtime. Adds a `TurnLogRecord` shape + `TurnLogger` interface in core (anchors a Phase-2a `SupabaseTurnLogger` for support/bug-report workflows — "user reports broken behaviour, support pulls the matching turn artifact" — without schema break) and a `DEBUG=1`-gated `FsTurnLogger` writing `<vault>/.keppt/logs/sessions/<date>/turn-NNN.json` artifacts containing the post-pruning request, per-step response breakdown, and `totalUsage`. Empirical-validation surface for `feedback_phase1_pragmatism` and a precondition for Task 6's real-API acceptance run.
4.3. Tool-result reminder + GTD-prompt sharpening (R2/R9 + R14–R16) — Task-4 follow-up, post-created 2026-05-19 from a dogfooding session (`<vault>/.keppt/logs/sessions/2026-05-19/turn-003.json`) where Haiku, after three writes to `tasks/{inbox,next-actions,focus}.md`, never ran the R4 crosscheck and left the same three task strings in all three lists (R2 violation on Inbox). The same turn then surfaced a reflex-correction failure: when the user asked "ist das richtig?" about a compliant Daily-Plan state (R3+R9 allow checkbox copies), Haiku reverted to a non-checkbox bullet list and apologised — sycophancy under skeptical user pressure. Adds an optional `reminder` string on `WriteFileResult` / `EditFileResult` for canonical task-file and daily-note writes (low-cost salience boost, not a deterministic enforcement layer — model choice does the heavy lifting on compliance, see Task 4.3 Discoveries), plus five prompt edits closing the rule gaps the turn exposed: R2 carves Inbox down to unspecified/idea capture only (Haiku routed three obviously-NA tasks via Inbox because R2's "new → Inbox" implied otherwise), R9 makes Daily-Plan checkbox copies explicit (so a "correction" that strips checkboxes is no longer ambiguous), R14 acknowledges voice-dictated input (the user uses Whisper; "BuzzForex" earlier in this very thread was a homophone confusion), R15 blocks reflex-correction under skeptical questioning, R16 forbids GTD evangelism and explicit anchor-token citations in user-facing text (Haiku wrote "lass mich R3 nochmal erklären" — surfacing an internal marker as if it were product vocabulary). Opening line of the system prompt softens from "GTD assistant" to "task and note assistant" to stop priming the model into tutorial mode.
5. Daily-note lifecycle (R5) + clock injection
5.5. Vault readiness on turn start (`ensureVaultReady`: first-run task-file init + day rollover) — Task-5 follow-up, post-created after planning. Closes the gap that the original Task 5 left first-run task files non-existent and pre-created empty daily notes the user may never use, **and** closes the Task-3.5 follow-up Codex finding (medium): without rollover, the new `canRead` gate makes a stale `daily/<yesterday>.md` unreachable to `list_files`/`search_files`/`read_file` until rollover runs. See `docs/task-log/task-5.5-vault-readiness.md`.
5.6. Future daily notes (today + future drafts) — Task-5.5 follow-up, post-created 2026-05-10 after a manual smoke-test surfaced that the LLM cannot read/write/list/search a user-pre-created `daily/<future>.md`. Relaxes the GTD layout gate from "exactly today" to "any `daily/YYYY-MM-DD.md` with `date >= today`", changes the rollover criterion to `date < today`, and patches a `search_files(scope: "all")` hole where future dailies fell through both active and archive scopes. Driven by the GTD ruleset (Active-Sync covers "today's/tomorrow's Daily Note plan", Weekly-Review step 8 prepares the next workday's note). See `docs/task-log/task-5.6-future-dailies.md`.
6. End-to-end acceptance against real Claude API + vault
7. Weekly Review interactive workflow (deferred placeholder) — post-created 2026-05-19. Captures the intent to port the richer Weekly-Review flow from the user's personal vault `CLAUDE.md` (group-by-theme Waiting with one question per cluster, propose-don't-walk for Next Actions, end-of-review self-reflection check) into the keppt-app system prompt. Deferred because the content is ~200 prompt tokens that only matters during an actual Weekly Review session — putting it in the always-on R1–R13 block would bloat the cached system head for negligible benefit on the 99% of turns that are not reviews. Open design question: how the review-mode content gets delivered (dedicated `weekly_review` tool that returns the protocol on call; intent-detected context-note injection like the `crosscheck-due` plumbing discussed under Task 4.3; or a separate review-mode session header). To be decided when scheduled — not blocking Phase 1.

---

## Task 1: Monorepo + FileRepository + LocalFileRepository

### Instructions

A clean foundation: pnpm monorepo with two workspaces. No LLM, no CLI — just the base everything else runs against later.

**Setup:**
- pnpm workspace with `apps/cli` (empty skeleton) and `packages/core`
- TypeScript (`strict: true`), Vitest, ESLint (optional for now), Prettier
- Node engine `>=20` in both `package.json` files (matches `.nvmrc`; Node 18 is EOL)
- `.gitignore`, `.nvmrc`, `README.md` (minimal)

**`packages/core/file-repository.ts` (interface):**
```ts
interface FileRepository {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string, changeSummary: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  search(query: string, scope?: 'active' | 'archive' | 'all'): Promise<SearchResult[]>;
  // edit() comes in Task 2
}
interface SearchResult { filePath: string; snippet: string; line: number; }
```

**`LocalFileRepository`:**
- Constructor takes a `basePath` (vault root) — the path comes from env `VAULT_PATH` via the CLI entrypoint (Task 3)
- `read`: `fs.readFile` on `basePath/filePath`; file missing → `FileNotFoundError` (not null/empty)
- `write`: `fs.mkdir -p` on the parent, `fs.writeFile`, then history append (see below)
- `list`: recursive under the vault; optional prefix filter on POSIX paths
- `search`: simple string search across files in the matching scope. `'active'` = `tasks/**` + `daily/YYYY-MM-DD.md` (today's, if present); `'archive'` = `archive/daily/**`; `'all'` = both. Returns a snippet (~80 chars around the hit) and a 1-based line number. `scope` defaults to `'active'`.

**`InMemoryFileRepository`:** Map<string, string> for tests, same interface.

**History log (local replacement for `file_history`):**
- Append-only JSON Lines under `basePath/.keppt/file-history.jsonl`
- One line per write/edit: `{ id, filePath, contentBefore, contentAfter, changeSummary, changedAt, changedBy: 'llm' | 'user' | 'system' }`
- `contentBefore` is the previous content (empty on create). This enables rollback. For large files this is acceptable — Phase 1 is single-user, single vault.

**Path convention:** all file paths are POSIX-style (`tasks/inbox.md`), regardless of OS. Use `path.posix` internally.

### Acceptance

- **T1-AC-01:** `LocalFileRepository` against a temp directory covers read/write/list/search happy paths + read-on-missing-file throws the defined error.
- **T1-AC-02:** `InMemoryFileRepository` passes the same repository contract scenario, parameterized over the same tests.
- **T1-AC-03:** A write produces a correct history entry in `.keppt/file-history.jsonl`.
- **T1-AC-04:** Search finds hits across multiple files and respects scope (`active` vs. `archive` vs. `all`).
- **T1-AC-05:** `pnpm -r build` is green.
- **T1-AC-06:** `pnpm -r test` is green.

### Key Locations

- `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`
- `apps/cli/` (empty skeleton, `package.json` + `src/index.ts` with `// placeholder`)
- `packages/core/package.json`, `packages/core/tsconfig.json`
- `packages/core/src/file-repository.ts` (interface)
- `packages/core/src/local-file-repository.ts`
- `packages/core/src/in-memory-file-repository.ts`
- `packages/core/src/history-log.ts`
- `packages/core/src/__tests__/*.test.ts`

### Key Discoveries

- Vault layout per user (see architecture "File Layout"):
  ```
  tasks/{inbox,focus,next-actions,waiting,someday-maybe}.md
  daily/YYYY-MM-DD.md    ← always exactly one file: today
  archive/daily/*.md     ← archived daily notes
  .keppt/        ← app state (history log, later: sessions)
  ```
- There is **no** `projects/` directory (R6 — projects are subheadings inside `next-actions.md`).
- There is **no** `archive/tasks/` (R7 — completed tasks are deleted; the trail lives in history + daily-note log).
- History entries are the only rollback/audit source in Phase 1. Never overwrite, never truncate.

---

## Task 2: `edit_file` with atomic search/replace

### Instructions

The most trust-critical piece. On search ambiguity the LLM gets a structured error back and can retry. No full-text rewrite.

**Extend the `FileRepository` interface:**
```ts
interface SearchReplaceEdit { search: string; replace: string; }
interface EditResult {
  ok: boolean;
  error?: {
    failedSearch: string;
    matchCount: number;   // 0 = not found, >1 = ambiguous
    currentContent: string;
  };
}
edit(filePath: string, edits: SearchReplaceEdit[], changeSummary: string): Promise<EditResult>;
```

**Implementation (in `LocalFileRepository` **and** `InMemoryFileRepository`):**
- Read the file. File missing → `EditResult { ok: false, error: { failedSearch: edits[0].search, matchCount: 0, currentContent: '' } }` (consistent feedback to the LLM).
- **Planning phase:** for each `edit` in the array count occurrences of `edit.search` in the **original** content.
  - Exactly 1 hit → OK, continue.
  - 0 hits or >1 hits → abort immediately, return `EditResult { ok: false, error: {...} }` with the failing `search`, the `matchCount`, and the current content.
  - **No** edits are applied until all are validated. Atomic.
- **Apply phase:** apply edits sequentially against a working content (`String.replace` with a literal — not a regex — replacing only the first hit, which the plan already established as unique).
  - Important: the uniqueness check holds against the **original** content, not against the partially mutated version. Reason: a later edit must not accidentally hit a text block produced by a previous edit. If two edits overlap (i.e. after applying edit N, edit N+1's search is no longer in the content), → `EditResult { ok: false }` with a fitting error (`matchCount: 0` after mutation, with `changeSummary` "overlapping edits").
- No write on failure. On success: atomic write + history entry.
- `search`/`replace` are used **exactly** as literals (incl. whitespace, tabs, newlines). No trim/normalize magic.

**Tool side (preparation for Task 3):** the tool execute function will later call `edit_file` directly and return the `EditResult` as a regular tool output (not throw) — the LLM sees `ok: false` + `currentContent` and can try an adjusted search block. No exception path needed.

### Acceptance

Vitest suite (against `InMemoryFileRepository`, since deterministic and faster):

- **T2-AC-01:** Single-edit happy path: 1 hit → applied, history entry written, returns `{ ok: true }`.
- **T2-AC-02:** Multi-edit happy path (3 edits, all unique): all three applied, **one** history entry.
- **T2-AC-03:** `matchCount === 0`: returns `{ ok: false, error: { matchCount: 0, currentContent, failedSearch } }`, file unchanged, **no** history entry.
- **T2-AC-04:** `matchCount > 1`: returns `{ ok: false, error: { matchCount: 2, ... } }`, file unchanged.
- **T2-AC-05:** Atomicity: with 3 edits, if the 2nd is ambiguous → not a single edit is written.
- **T2-AC-06:** Overlapping edits (edit 2's search is destroyed by edit 1's replace) → clean error, file unchanged.
- **T2-AC-07:** `LocalFileRepository` again with a temp directory: one happy-path test ensures the implementation behaves identically.

### Key Locations

- `packages/core/src/edit.ts` (search/replace logic, reusable from both repos)
- `packages/core/src/local-file-repository.ts` (+ `edit` method)
- `packages/core/src/in-memory-file-repository.ts` (+ `edit` method)
- `packages/core/src/__tests__/edit.test.ts`

### Key Discoveries

- The structured error return (not throw) is the deliberate design decision: the LLM should see `ok: false` as a normal tool result and react in the next step. The Vercel AI SDK would auto-embed throws as `tool-error` parts, but the control flow stays cleaner with `EditResult` as a regular output schema.
- Aider inspiration: on ambiguity, the LLM extends the `search` block with a few context lines before/after until it becomes unique. No special prompting needed — the error content is sufficient feedback.
- Atomicity across all edits of a single invocation is mandatory (spec "edit_file" section). A weekly-review cleanup with 20 simultaneous `[x]` removals is a real use case.

---

## Task 3: CLI + Vercel AI SDK + tool handlers → first real console run

### Instructions

Goal of this task: **work in a real terminal with the real Claude Haiku API against a real vault.** Intentionally minimal — system prompt is a stub, no model router, no session persistence, no pruning. The "productization pass" comes in Task 4.

**Packages:**
- `ai@^7.0.0-beta` in `packages/core` and `apps/cli`
- `@ai-sdk/anthropic@^4.0.0-beta` in `packages/core`
- `zod` (for tool schemas)

**`packages/core/src/tools.ts` — the 5 tool definitions:**
```ts
import { tool } from 'ai';
import { z } from 'zod';

export function buildTools(repo: FileRepository) {
  return {
    read_file: tool({
      description: 'Reads the markdown content of a file relative to the vault root.',
      inputSchema: z.object({ file_path: z.string() }),
      execute: async ({ file_path }) => repo.read(file_path),
    }),
    edit_file: tool({
      description: 'Applies atomic search/replace edits. Each search must occur exactly once in the file.',
      inputSchema: z.object({
        file_path: z.string(),
        edits: z.array(z.object({ search: z.string(), replace: z.string() })).min(1),
        change_summary: z.string(),
      }),
      execute: async ({ file_path, edits, change_summary }) =>
        repo.edit(file_path, edits, change_summary),
    }),
    write_file: tool({
      description: 'Writes the entire content. Only for create or full rewrite — otherwise use edit_file.',
      inputSchema: z.object({
        file_path: z.string(),
        content: z.string(),
        change_summary: z.string(),
      }),
      execute: async ({ file_path, content, change_summary }) => {
        await repo.write(file_path, content, change_summary);
        return { ok: true };
      },
    }),
    list_files: tool({
      description: 'Lists paths, optionally filtered by prefix.',
      inputSchema: z.object({ prefix: z.string().optional() }),
      execute: async ({ prefix }) => repo.list(prefix),
    }),
    search_files: tool({
      description: 'Full-text search. scope=active (default), archive, or all.',
      inputSchema: z.object({
        query: z.string(),
        scope: z.enum(['active', 'archive', 'all']).optional(),
      }),
      execute: async ({ query, scope }) => repo.search(query, scope ?? 'active'),
    }),
  };
}
```

**`apps/cli/src/index.ts` — the CLI entrypoint:**
- Reads `VAULT_PATH` and `ANTHROPIC_API_KEY` from env. Throws if either is missing.
- Instantiate `LocalFileRepository(vaultPath)`
- `readline.createInterface` on stdin/stdout, prompt `> `
- Per user line:
  - Check character limit (2000 chars, hard limit — heuristic comes in Task 4)
  - Maintain an in-memory messages array (one session per CLI run, no persistence)
  - Call `streamText`:
    ```ts
    const result = streamText({
      model: anthropic('claude-haiku-4-5'),
      system: MINIMAL_SYSTEM_PROMPT,
      messages,
      tools: buildTools(repo),
      stopWhen: isStepCount(10),
      abortSignal: controller.signal,
    });
    ```
  - `for await (const part of result.fullStream)` and:
    - `text` → `process.stdout.write(part.text)`
    - `tool-call` → `process.stdout.write('\n[' + part.toolName + '…]\n')` (UX feedback)
    - `tool-error` → `console.error('Tool error:', part.toolName, part.error)`
    - `error` → throw
  - After the stream: `messages.push(...(await result.response).messages)` to persist assistant/tool messages (only in the array, not on disk)
- `process.on('SIGINT')` → `controller.abort()` — current stream cancels cleanly, prompt returns. Two Ctrl+Cs end the process.

**Minimal system prompt (inline in `apps/cli/src/index.ts`, not yet in `packages/core`):**
```
You are a GTD assistant. The user works with an Obsidian vault
that contains the following files:
- tasks/inbox.md, tasks/focus.md, tasks/next-actions.md, tasks/waiting.md, tasks/someday-maybe.md
- daily/YYYY-MM-DD.md (today's note), archive/daily/ (past notes)

Use the tools read_file, edit_file, write_file, list_files, search_files.
Prefer edit_file (search/replace) over write_file for changes to existing files.
On ambiguous search: extend search with context lines and try again.

Today is {TODAY_ISO} ({TODAY_WEEKDAY}).
```
(Full R1-R13 comes in Task 4.)

**`pnpm --filter cli dev` script:** starts the CLI directly with `tsx` or `ts-node`.

### Acceptance

- **T3-AC-01:** Manual smoke test transcript against a real test vault + the real Haiku API: `> List my tasks` makes the LLM call `list_files({ prefix: 'tasks/' })` + `read_file(...)` and answer sensibly.
- **T3-AC-02:** Manual smoke test transcript: `> New task: buy milk` makes the LLM call `edit_file` on `tasks/inbox.md`, and a new line appears.
- **T3-AC-03:** Manual smoke test transcript: `> Check off buy milk` makes the LLM find the task and set `[x]` or remove it.
- **T3-AC-04:** Manual smoke test transcript: `> What's on for today?` makes the LLM read focus + today's daily note and answer.
- **T3-AC-05:** Manual smoke test transcript: Ctrl+C during stream cancels the stream and returns the prompt.
- **T3-AC-06:** Vitest integration test with `MockLanguageModelV4` (`ai/test`) scripts a 3-step chain (`list_files` → `read_file` → text response) against `InMemoryFileRepository`; the expected tool calls happen **in the right order** and the last step contains the expected text.
- **T3-AC-07:** Vitest integration test simulates `edit_file` ambiguity: the LLM gets `{ ok: false, error: ... }` as a tool result, then makes a second `edit_file` call with extended search, and the edit applies successfully.

### Key Locations

- `apps/cli/src/index.ts`
- `apps/cli/src/minimal-prompt.ts` (temporary, replaced by Task 4)
- `packages/core/src/tools.ts`
- `packages/core/src/__tests__/tools.test.ts` (mock LLM integration test)
- `apps/cli/package.json` with `dev`/`start` scripts

### Key Discoveries

- **`stopWhen` is essential.** Without an explicit `stopWhen: isStepCount(N)` the SDK only makes **one** LLM call — no agentic loop! Default = `isStepCount(1)`. For us: `isStepCount(10)`.
- **Tool errors don't need wrapping.** If `execute` throws, the SDK automatically embeds a `tool-error` part in the conversation, and the LLM can react in the next step. For `edit_file` we deliberately do **not** throw, but return `EditResult { ok: false, error: ... }` as a regular tool output — the LLM sees a structured feedback object, not an error string.
- **`fullStream` vs `textStream`:** we want to see tool-call events in the terminal ("[read_file…]"), so `fullStream`. `textStream` would only show the LLM speaking.
- **Persisting response messages:** `(await result.response).messages` returns the assistant message (incl. tool-call parts) + tool messages (with tool-result parts) of the last run. Appending them to the `messages` array is enough for the in-memory session. Disk persistence comes in Task 4.
- **Current date in the stub prompt:** even this minimal prompt must include the current date (R13), otherwise Haiku will guess at weekdays.

---

## Task 3.6: CLI operational error logging

> **Post-created task.** Added 2026-05-09 from the manual Task-3 smoke test. An Anthropic account with no remaining balance returned a provider `APICallError`. The CLI's own catch printed a useful summary, but the Vercel AI SDK beta also ran its default `onError` handler first (`console.error(error)`), dumping the full stack, request body, response headers, and provider response to stderr.
>
> This is a CLI/dev observability task, not a product audit-trail task. `file_history` remains reserved for GTD file mutations; operational errors live in a separate `.keppt/logs/` JSONL file. The runtime-neutral logging boundary is handled by Task 3.9; backend Pino/request-ID work starts in Phase 2a.0, and Sentry remains a later Phase 2a integration.

### Instructions

**`apps/cli/src/cli-errors.ts`:**
- Add `formatCliError(err)` for user-facing terminal output.
- Detect `APICallError` from `ai` and format common provider failures:
  - Anthropic low balance → short actionable message with request ID.
  - 401/403 → credential/account-access hint.
  - 429 → rate-limit hint.
  - retryable provider errors → mark as temporary.
- Unknown errors fall back to a concise message, not object inspection.

**`apps/cli/src/cli-error-log.ts`:**
- Add `appendCliErrorLog(vaultPath, err, context)` writing JSONL to:
  `VAULT_PATH/.keppt/logs/cli-errors.jsonl`.
- For `APICallError`, persist diagnostic fields needed during CLI dogfooding:
  stack, URL, status, retryability, request body values, response body,
  provider data, and response headers.
- Redact sensitive headers (`set-cookie`, `cookie`, `authorization`,
  `x-api-key`, `api-key`) before writing.
- If log writing fails, return a structured result so the CLI can say where
  it tried to write without crashing the REPL.

**`apps/cli/src/index.ts`:**
- Pass `onError: () => {}` to `streamText` to disable the SDK beta's default
  raw `console.error(error)` stream logger.
- In the existing stream `catch`, append the full diagnostic record to the
  vault-local log, then print the formatted summary plus the log path.
- Preserve the existing abort semantics and pending-user rollback.

### Acceptance

- **T3.6-AC-01:** Low-balance Anthropic `APICallError` formats to a short
  terminal message containing status + request ID and does not include the
  model/request body.
- **T3.6-AC-02:** Stream errors do not get printed twice. The SDK default
  raw stderr logger is disabled with `onError: () => {}`; the CLI owns the
  one terminal message.
- **T3.6-AC-03:** API-call diagnostics are written to
  `.keppt/logs/cli-errors.jsonl` as JSONL, including useful debug fields and
  redacted sensitive headers.
- **T3.6-AC-04:** Non-abort stream errors do not crash the REPL; the existing
  `finally` path resumes readline and prompts again.

### Key Locations

- `apps/cli/src/index.ts`
- `apps/cli/src/cli-errors.ts`
- `apps/cli/src/cli-error-log.ts`
- `apps/cli/test/cli-errors.test.ts`
- `apps/cli/test/cli-error-log.test.ts`
- `docs/task-log/task-3.6-cli-error-logging.md`

### Key Discoveries

- **The SDK default `onError` logs raw errors.** In `ai@7.0.0-beta.116`,
  `streamText` defaults to `onError = ({ error }) => console.error(error)`.
  Handling `part.type === "error"` in the consumer is not enough to prevent
  raw stderr output.
- **CLI diagnostics and product audit trail are different things.**
  `file_history` answers "what changed in the user's GTD files?" Operational
  failures answer "why did the app/LLM call fail?" and need separate logging.
- **The Web-App needs a separate runtime logger.** The architecture now keeps
  the shared core behind a small `Logger` contract, with CLI, backend, and
  Angular/Capacitor providing their own implementations. Task 3.9 creates that
  boundary; Phase 2a adds Pino/request IDs and later Sentry.

---

## Task 3.7: Per-message retry budget for `edit_file`

> **Post-created task.** Added 2026-05-09 after a comparison review against an autonomous-agent build of the same plan. The current stop condition is `stopWhen: isStepCount(10)` (Task 3) — that bounds total steps but not the specific "LLM retries the same SEARCH/REPLACE three times in a row on the same file" pattern. Each retry round-trips a full `currentContent` snapshot, so the third attempt is paying twice for the second's failure context.
>
> Lives at the tool layer wrapping `edit_file` — the SEARCH/REPLACE engine in `edit.ts` stays a pure planner with no awareness of LLM-loop history.

### Instructions

**Design choice — minimal plumbing.** No standalone `retry-budget.ts` module, no `RetryBudgetStore` interface, no factory, no turn-id keying. The counter is a single `Map<filePath, count>` held in `buildTools`'s closure (named type `EditFailuresByFilePath` for readability), and the CLI rebuilds tools per turn — that closure boundary **is** the turn boundary. Reasoning: the only consumer is the CLI, the budget never crosses processes, and the legacy interface/factory was only useful for hypothetical multi-consumer reuse the project doesn't have. If a server entrypoint later needs the same budget across requests, lift the closure into a shared module then.

**`tools.ts` — wrap `edit_file`:**
- Define `type EditFailuresByFilePath = Map<string, number>` (file path → consecutive `match`-failure count) with a JSDoc that explains the per-turn-via-closure semantics. No outer turn-id map — each `buildTools` call already produces exactly one counter for one turn.
- `BuildToolsOptions` stays `{ now? }`. No `turnId` field: it would be captured but unused (the per-turn scoping is enforced by per-turn rebuild, not by an id value), and a required-but-unused field is API noise.
- Allocate `const failures: EditFailuresByFilePath = new Map();` once in the `buildTools` body.
- In `edit_file.execute`, after the `canWrite` gate, before `repo.edit`:
  - Read `count = failures.get(filePath) ?? 0`.
  - If `count >= 2`, short-circuit with `currentContent` from `repo.read(filePath)`, catching `FileNotFoundError` and substituting `""` so the missing-but-writable case mirrors the structured `repo.edit` failure (`missingFileError`) instead of throwing.
  - Otherwise call `repo.edit`.
- After `repo.edit`: if `result.ok === false` with `reason: "match"`, set `failures.set(filePath, count + 1)`. Successes and other failure reasons (`out_of_scope`, `invalid_path`) do **not** count — the budget remains a true failure budget.
- The whole tool body sits inside a single `try/catch` that turns `InvalidPathError` (thrown by `canWrite → validateFilePath` on traversal / `.keppt/` / absolute / backslash / null-byte paths) into a structured `{ ok: false, error: { reason: "invalid_path" } }`. Without that catch, a malformed model-supplied path escapes as a stream error and aborts the turn instead of giving the model a recoverable shape.

**Sequential tool use at the provider boundary.** A plain `Map` mutation as the failure counter is only race-free under the assumption that `edit_file` calls within one user turn are sequential. The CLI enforces that at the Anthropic boundary by setting `providerOptions.anthropic.disableParallelToolUse: true` on the `streamText` call (see `apps/cli/src/index.ts`). Anthropic guarantees the model emits at most one tool call per step under that flag, so:
- No in-tool locking, in-flight reservation, or per-(turnId, filePath) queue is needed.
- No abort-mid-queue cancellation hazard for queued same-file edits.
- Multi-edit batches use `edit_file`'s own `edits[]` array — atomic, single call, single counter touch.

If a future entry point adds a second provider (or a future Anthropic API change relaxes the flag), the counter assumption breaks and a serialization layer becomes necessary again — re-evaluate at that point. Phase 1 is single-provider (Anthropic-only) and the CLI smoke tests verify the flag is in place.

**`EditFileError` extension:**
- Add variant `{ reason: "retry_budget_exhausted"; currentContent: string }` alongside the existing `match | invalid_path | out_of_scope`.

**CLI integration (`apps/cli/src/index.ts`):**
- Rebuild tools per turn: `tools = buildTools(repo, { now: () => turnNow })`, alongside the existing per-turn `turnNow = new Date()`. (Today they're built once at startup; the per-turn rebuild is one extra line and is what scopes the budget to the turn — the closure boundary is the turn boundary.)
- Pass `providerOptions: { anthropic: { disableParallelToolUse: true } }` to `streamText` so the budget's plain-`Map` counter cannot race.

### Acceptance

Vitest suite against `InMemoryFileRepository` + a spy wrapper that counts `repo.edit` calls:

- **T3.7-AC-01:** **Single-file exhaustion:** seed `tasks/inbox.md`, three `edit_file` calls in the same turn with a non-matching `search`. Calls 1 and 2 return `reason: "match"`; call 3 returns `reason: "retry_budget_exhausted"` with `currentContent` populated. File unchanged after all three. `repo.edit` invoked exactly twice.
- **T3.7-AC-02:** **Per-file scope:** prime `tasks/inbox.md` with two failures, then a failing `edit_file` on `tasks/focus.md` in the same turn returns `reason: "match"`, NOT `retry_budget_exhausted`.
- **T3.7-AC-03:** **Per-turn reset:** after exhausting on `tasks/inbox.md` from one `buildTools` call, a fresh `buildTools(repo, { now })` call gets a fresh counter — the same failing edit returns `reason: "match"` (counter = 1, not exhausted). The closure boundary is the turn boundary; no `turnId` field needed.
- **T3.7-AC-04:** **Success on file B doesn't reset failures on file A:** one failure for inbox, a successful edit on focus, then a second inbox failure → still `reason: "match"` (count = 2, exhausted only on the third attempt).
- **T3.7-AC-05:** **Short-circuit doesn't call `repo.edit`:** asserted via the spy in AC-01 — `repo.edit` invocation count stays at 2 after the third call.
- **T3.7-AC-06:** **`out_of_scope` failures do not count:** two `edit_file` calls in one turn on a path outside the GTD layout (e.g. `random/foo.md`) both return `reason: "out_of_scope"` and do not consume budget; a subsequent `match`-failure on a valid path is still attempt 1.
- **T3.7-AC-08:** **Exhaustion on a missing writable file:** three failing `edit_file` calls in one turn against a writable path that doesn't exist yet (e.g. today's `daily/<YYYY-MM-DD>.md` in an unseeded vault) yield two `match` results followed by `retry_budget_exhausted` with `currentContent: ""` — never an SDK tool-error from a thrown `FileNotFoundError`.
- **T3.7-AC-10:** **Invalid paths surface as structured `invalid_path`, never as stream errors:** `edit_file` calls with traversal (`../etc/passwd`), reserved-prefix (`.keppt/logs/x.md`), and backslash (`tasks\\inbox.md`) paths all return `ok: false, error.reason: "invalid_path"`; `repo.edit` is never called; a subsequent legitimate `match`-failure on `tasks/inbox.md` is still attempt 1 (invalid paths don't consume budget). Catches `InvalidPathError` thrown by `canWrite → validateFilePath`.
- **T3.7-AC-11 (CLI architecture anchor):** A static source check in `apps/cli/test/workspace-wiring.test.ts` asserts that `apps/cli/src/index.ts` contains `providerOptions: { anthropic: { disableParallelToolUse: true ... }`. The plain-`Map` retry counter is race-free only under sequential tool dispatch; if this flag is ever removed, this test fails before the change can ship.

> **Concurrency note.** Earlier draft ACs T3.7-AC-07 (parallel failing calls) and T3.7-AC-09 (parallel successful calls) were dropped after the design switched from in-tool locking to provider-level sequential dispatch. Those shapes are not reachable when `disableParallelToolUse: true` is in effect; the architecture-anchor test (AC-11) is the regression guard.

### Key Locations

- `packages/core/src/tools.ts` (+ wrap `edit_file`, extend `BuildToolsOptions` with `turnId`, add `retry_budget_exhausted` variant to `EditFileError`)
- `packages/core/src/__tests__/retry-budget.test.ts`
- `apps/cli/src/index.ts` (+ fresh `turnId` per turn, rebuild tools per turn)
- `docs/task-log/task-3.7-retry-budget.md`

### Key Discoveries

- **Per-message, not per-session.** What we cap is intra-turn looping after a structured-error feedback didn't help. A long session with many distinct asks is fine.
- **Wrap, don't entangle.** Retry tracking is a tool-layer concern. The SEARCH/REPLACE engine stays pure — easier to test, easier to reuse.
- **Only `match` failures count.** `out_of_scope` / `invalid_path` failures aren't the looping pattern this guards against — burning budget on a path that can never be edited just makes the budget less useful on the next legitimate retry.
- **Re-include `currentContent` on the short-circuit.** The LLM may not have it in its working context anymore by the third attempt; one extra `repo.read` is cheap and gives the next user message a clean starting point.
- **Closure over module.** Keeping the counter inside `buildTools` avoids a public `RetryBudgetStore` interface the rest of the system would have to depend on. The CLI is the only consumer.

---

## Task 3.8: Path-safety expansion (8 → 13 attack vectors)

> **Post-created task.** Added 2026-05-09 from the same comparison review. The current `validateFilePath` in `packages/core/src/file-repository.ts:54-82` covers 8 distinct vectors; the autonomous-agent build covered 13. Of the missing five, **one has real teeth on this stack (symlink escape)** and four are cheap defense-in-depth. None are urgent for a single-user vault, but the cost is one helper + a parametrized test table.

### Instructions

Currently rejected (`file-repository.ts:54-82`):

1. Empty / non-string path
2. Null byte (`\0`)
3. Backslash (`\`)
4. Absolute path leading `/`
5. Empty segment (leading/trailing/double slash)
6. `..` segment
7. `.` segment
8. `.keppt` top-level prefix (reserved)

**Add static checks #9–#12 to `validateFilePath` (shared by both repos via the contract):**

9. **Windows drive-letter prefix** — reject `^[A-Za-z]:`. (`C:\…` is already caught by #3, but `C:foo/bar.md` slips past #3 + #4.)
10. **Trailing whitespace or trailing dot in any segment** — Windows file aliasing: `foo.md`, `foo.md.`, `foo.md ` all map to the same NTFS file. Reject any segment that doesn't equal its own `.trim()` or that ends in `.`.
11. **Path-length caps** — reject if total length > 4096 chars or any segment > 255 chars (matches POSIX filesystem limits; bounds path-bombs from a misbehaving LLM).
12. **Reserved Windows device names** — reject any segment whose **base** (case-insensitive, before any extension) matches `CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]`. Matters if anyone runs the CLI from WSL pointing at a Windows-mounted vault.

**Add runtime check #13 in `LocalFileRepository` (filesystem-aware, can't live in the sync string validator):**

13. **Symlink escape** — after path validation, the resolved filesystem path's canonical form (`fs.realpath`) must stay inside the canonical `basePath`.

Implementation: a `resolveSafe(filePath: string): Promise<string>` helper:

1. `validateFilePath(filePath)` (sync, runs #1–#12).
2. `path.resolve(basePath, filePath)`.
3. `fs.realpath` on the result; if the file does not exist yet (write/edit creating new), `fs.realpath` the **parent directory** instead — covers symlinked subdirectories.
4. Verify the canonical path starts with the canonical `basePath`. If not, throw `InvalidPathError { reason: "symlink escapes vault root" }`.

All four I/O methods (`read`, `write`, `edit`, `list`) route through `resolveSafe`. Existing inline `path.resolve` usage is replaced by a single call site each. `InMemoryFileRepository` is unaffected — symlinks don't exist in a `Map<string, string>`.

### Acceptance

Extend `__tests__/file-repository.contract.ts` with a parametrized rejection table; add symlink-specific tests to `__tests__/local-file-repository.test.ts`.

- **T3.8-AC-01:** **Static rejections (table-driven, runs against both repos):** ≥1 example per vector #1–#12 throws `InvalidPathError` with the documented `reason`. Examples for the new five:
  - `"C:foo.md"` → drive letter
  - `"tasks/foo.md "` → trailing whitespace
  - `"tasks/foo.md."` → trailing dot
  - `"a".repeat(5000) + ".md"` → length cap (total)
  - `"tasks/" + "a".repeat(300) + ".md"` → length cap (per-segment)
  - `"tasks/CON.md"`, `"daily/nul.md"`, `"tasks/com1.md"` → reserved device name (case-insensitive)
- **T3.8-AC-02:** **Symlink escape — file (LocalFileRepository, temp dir):**
  - Setup: vault at `$tmp/vault`, secret at `$tmp/secret.md`, `fs.symlink($tmp/secret.md, $tmp/vault/tasks/escape.md)`.
  - `repo.read("tasks/escape.md")` throws `InvalidPathError { reason: "symlink escapes vault root" }`.
- **T3.8-AC-03:** **Symlink escape — directory:**
  - `fs.symlink($tmp, $tmp/vault/tasks/escape-dir)`, then `repo.read("tasks/escape-dir/secret.md")` throws.
- **T3.8-AC-04:** **Symlink escape — write to non-existent file under symlinked parent:**
  - With the directory symlink above, `repo.write("tasks/escape-dir/new.md", "...", "x")` throws (parent realpath check fires before the write).
- **T3.8-AC-05:** **In-vault symlinks stay legal** (smoke test, drop if it overcomplicates the contract): a symlink whose target stays inside the vault resolves cleanly. Not a current use case — included only to prove the check isn't over-eager.

### Key Locations

- `packages/core/src/file-repository.ts` (+ static checks #9–#12 in `validateFilePath`)
- `packages/core/src/local-file-repository.ts` (+ `resolveSafe`, route I/O through it)
- `packages/core/src/__tests__/file-repository.contract.ts` (+ parametrized rejection table for #1–#12)
- `packages/core/src/__tests__/local-file-repository.test.ts` (+ symlink-escape scenarios)
- `docs/task-log/task-3.8-path-safety.md`

### Key Discoveries

- **Symlink escape is the one vector with real teeth on a personal-vault CLI.** The others are defense-in-depth. Without #13, the LLM could write through a symlink it doesn't know exists — write-amplification through an attacker-controlled link is low probability but high blast radius on a system that holds the user's `~/.ssh/`.
- **Static + runtime split.** #9–#12 are syntactic and live in the shared validator (`InMemoryFileRepository` inherits them via the contract test for free). #13 needs filesystem state and lives in `LocalFileRepository` only.
- **No URL-decoding anywhere.** We never `decodeURIComponent` paths, so `%2e%2e/etc` is opaque text and treated as an unknown filename, not traversal. Worth documenting as an explicit non-vector to prevent future "should we add this?" reopening.
- **Trailing-dot rejection > trailing-dot normalization.** Stripping trailing dots silently would let two LLM messages addressing `foo.md` and `foo.md.` accidentally collide. Rejection makes the LLM see the structured error and adjust the next message.

---

## Task 3.9: Shared logging abstraction

> **Post-created task.** Added 2026-05-09 from the operational logging architecture decision. Task 3.6 solved the immediate CLI provider-error leak. This task creates the runtime-neutral boundary needed before the same shared core is reused by the Express backend and Angular/Capacitor app.
>
> **Amended 2026-05-10 during /start-task 3.9 briefing.** The CLI is a throwaway test balloon; `packages/core` is what the web app reuses. The original draft minimized core wiring ("do not thread a logger through just for symmetry"). That guidance is replaced here with a small set of *named observability seams* in the core — places where future backend operators will need diagnostic visibility — wired through injected `Logger` arguments with `NoopLogger` defaults so existing callers are untouched. The amendment also pulls the CLI's `console.*` count to zero and routes all four logger levels (not only `error`) through the same vault-local JSONL.
>
> This is not a Sentry task and not a backend Pino task. It only makes the shared layer logging-safe, defines stable observability seams in the core, and keeps CLI user output separate from operational diagnostics.

### Instructions

**Shared logger contract (`packages/core/src/logging.ts`):**
- Add a minimal `Logger` interface with `debug`, `info`, `warn`, and `error`.
- Add a `LogEvent` type with:
  - `message`
  - optional `code`
  - optional `phase`
  - optional `requestId`
  - optional `userId`
  - optional `sessionId`
  - optional `err`
  - optional `meta`
- Add `NoopLogger` for production defaults/tests that do not care.
- Add `MemoryLogger` for tests that need assertions. Records insertion order
  and per-event level so assertions can read both `events[i].level` and the
  `LogEvent` payload.
- Keep the contract independent of Pino, Sentry, OpenTelemetry, browser APIs,
  and Capacitor APIs.

**Core observability seams (injected `Logger`, default `NoopLogger`):**

The following *named* seams emit events with **stable codes**. Codes are part
of the contract surface — renaming one is a breaking change and must update
both the emitter and any caller assertion in the same commit (analogous to
`InvalidPathError.reason` strings in Task 3.8).

- `LocalFileRepositoryOptions.logger` (new optional field; default
  `NoopLogger`). Emits at the existing per-file `InvalidPathError` swallow
  site inside `search()` introduced by Task 3.8 (3.8 Open Issue 1):
  - `debug` — `code: "repo.search.path_skipped"`,
    `meta: { filePath, reason }`
- `BuildToolsOptions.logger` (new optional field; default `NoopLogger`). Emits
  at three points inside `editFileTool` and the path-validation catch shared
  across tools:
  - `warn` — `code: "tool.edit_file.retry_budget_exhausted"`,
    `meta: { filePath, attempts }` (3.7 short-circuit)
  - `info` — `code: "tool.edit_file.failed"`,
    `meta: { filePath, error }` (LLM-visible structured edit failure —
    `searchNotFound` / `searchNotUnique` / `missingFile`)
  - `warn` — `code: "tool.<name>.invalid_path"`,
    `meta: { filePath, reason }` at the tool-layer `InvalidPathError` catch
    (adversarial-path signal; one entry per offending tool call)

**Out of scope for 3.9** (documented as non-seams in the wrap-up): successful
`read`/`write`/`list`/`search` tool calls (would be tracing, no caller yet);
successful `edit_file` calls (already audited via `file_history`);
`validateFilePath` itself (logs at the caller, not inside the validator);
`gtd-layout.ts` and `history-log.ts` (no diagnostic surface). `NoopLogger`
remains the default at every boundary.

**CLI logger/output split:**
- Introduce a typed terminal output sink (`apps/cli/src/terminal-output.ts`)
  for user-facing terminal output: streamed assistant text, tool-call status
  lines, tool-error summary lines, abort messages, concise user-facing
  errors, and bootstrap errors before `vaultPath` is known.
- Introduce a CLI logger adapter (`apps/cli/src/cli-logger.ts`) that
  implements the shared `Logger` and writes **all four levels** to the
  vault-local `.keppt/logs/cli-errors.jsonl`. Each entry carries an explicit
  `level: "debug" | "info" | "warn" | "error"` field. Only `error` additionally
  invokes `terminal.errorSummary(formatCliError(err) + logSuffix)` so the
  REPL stays quiet for non-fatal events.
- Wire `cliLogger` into both `new LocalFileRepository(...)` and
  `buildTools(repo, ...)` so core observability seams flow into the same
  JSONL automatically.
- Pass `onError: () => {}` to `streamText` (preserved from Task 3.6) so the
  CLI owns the single error path.
- Route the CLI's `tool-error` stream part through both sinks: a short
  `terminal.toolError(name, err)` line so the user sees why the assistant
  stalled, **and** `cliLogger.warn({ code: "stream.tool_error",
  meta: { toolName }, err })` for diagnostic correlation.
- Do not treat normal streamed assistant text or tool-call status lines as
  operational log events.

**Core cleanup:**
- Audit `packages/core` for direct `console.*` (current count: zero — keep it
  zero by adding a regression assertion in the wrap-up).
- Tool errors returned to the LLM remain structured tool results; logging is
  for diagnostics, not for changing tool semantics.

**CLI cleanup:**
- Eliminate **all** direct `console.*` calls from `apps/cli/src/**`. The two
  pre-`vaultPath` sites (`requireEnv` failure, top-level `main().catch`)
  route through `terminal.errorSummary` rather than `console.error`. The
  three post-`vaultPath` sites (input-length cap, `tool-error` stream part,
  stream-error catch) route through the appropriate sink as described above.

**Redaction helper foundation:**
- Add a small shared redaction helper `redactSensitiveHeaders` in
  `packages/core/src/logging.ts`:
  - redact header keys matching `set-cookie`, `cookie`, `authorization`,
    `x-api-key`, `api-key` case-insensitively
  - leave room for backend-only redaction of prompt/file/provider payloads in
    Phase 2a.0
- `apps/cli/src/cli-error-log.ts` swaps its inline `redactHeaders` for the
  shared helper — single source of truth.
- Do not move the CLI's intentionally verbose local-only request-body logging
  into cloud-safe helpers. CLI JSONL diagnostics are explicitly vault-local.

### Acceptance

- **T3.9-AC-01:** `packages/core` has no direct `console.log`,
  `console.error`, `console.warn`, or `console.debug` usage.
- **T3.9-AC-02:** `packages/core` imports no Pino, Sentry, OpenTelemetry,
  browser, or Capacitor logging APIs.
- **T3.9-AC-03:** Existing Task 3.6 behavior is preserved: provider stream
  errors print one concise terminal message and write verbose diagnostics to
  `.keppt/logs/cli-errors.jsonl`.
- **T3.9-AC-04:** Normal assistant streaming and tool-status terminal lines go
  through the terminal output sink, not the operational logger. (Substituting
  a `MemoryLogger` for the CLI logger and exercising the streaming path
  produces zero `LogEvent`s for assistant text and tool-call status; the
  `tool-error` stream part is the one stream-side event that *does* produce a
  `warn` event by design.)
- **T3.9-AC-05:** Tests can use `NoopLogger` without output and `MemoryLogger`
  to assert emitted events. `MemoryLogger` is exercised in real core tests
  (not only logger-internal tests) — at minimum one test in
  `tools.test.ts` and one in `local-file-repository.test.ts`.
- **T3.9-AC-06:** Redaction tests cover sensitive header keys case-insensitively
  (`Set-Cookie`, `cookie`, `Authorization`, `X-API-KEY`, `api-key`) and leave
  non-sensitive keys (`content-type`, `request-id`) untouched.
- **T3.9-AC-07:** `apps/cli/src/**` has no direct `console.*` usage. All
  user-facing output flows through the terminal sink; all operational events
  flow through the CLI logger.
- **T3.9-AC-08:** `LocalFileRepositoryOptions` and `BuildToolsOptions` accept
  an optional `logger?: Logger` field. Defaulting to `NoopLogger` is
  behaviorally transparent: the existing core test suite passes unchanged
  without supplying a logger.
- **T3.9-AC-09:** Core observability seams emit the documented events with
  stable codes:
  - `repo.search.path_skipped` (debug) — asserted via `MemoryLogger` in a
    `LocalFileRepository.search` test using an in-vault path that the static
    validator rejects (e.g. `tasks/CON.md` on a non-Windows host).
  - `tool.edit_file.retry_budget_exhausted` (warn) — asserted via
    `MemoryLogger` on the third failed `edit_file` call against the same
    file within one turn.
  - `tool.edit_file.failed` (info) — asserted via `MemoryLogger` for one
    structured failure mode (`searchNotFound` is sufficient; the other
    modes share the same emission site).
  - `tool.<name>.invalid_path` (warn) — asserted via `MemoryLogger` for at
    least one tool path with an `InvalidPathError`-triggering input.
- **T3.9-AC-10:** CLI JSONL entries include a `level` field whose value is one
  of `debug`, `info`, `warn`, `error`. All four levels round-trip through
  `appendCliErrorLog` (or its successor) without losing the level field.

### Key Locations

- `packages/core/src/logging.ts`
- `packages/core/src/__tests__/logging.test.ts`
- `packages/core/src/local-file-repository.ts` — `search()` debug emission
- `packages/core/src/__tests__/local-file-repository.test.ts` — search-skip
  assertion
- `packages/core/src/tools.ts` — three seams in `editFileTool` and the
  shared path-error catch
- `packages/core/src/__tests__/tools.test.ts` — retry-budget, edit-failed,
  invalid-path assertions
- `packages/core/src/index.ts` — re-exports the new types/classes
- `apps/cli/src/cli-logger.ts`
- `apps/cli/src/terminal-output.ts`
- `apps/cli/src/index.ts` — eliminate `console.*`, wire `cliLogger` into
  `LocalFileRepository` and `buildTools`
- `apps/cli/src/cli-error-log.ts` — swap to shared `redactSensitiveHeaders`
- `apps/cli/test/cli-errors.test.ts`
- `apps/cli/test/cli-error-log.test.ts`
- `apps/cli/test/cli-logger.test.ts`
- `docs/task-log/task-3.9-shared-logging-abstraction.md`

### Key Discoveries

- **Logging and UI output are different contracts.** The CLI writes streamed
  text to a terminal, the backend writes SSE events, and Angular renders UI
  state. None of those should be modeled as operational logging.
- **Sentry is a sink, not the shared abstraction.** The shared core emits
  runtime-neutral events. Backend and frontend decide whether selected redacted
  errors are sent to Sentry.
- **Verbose local CLI logs are allowed; cloud logs are metadata-only.** Task
  3.6 intentionally stores provider request diagnostics in a developer-owned
  vault. Phase 2a must not reuse that payload shape for cloud observability.
- **Core observability seams have stable codes.** The four codes
  (`repo.search.path_skipped`, `tool.edit_file.retry_budget_exhausted`,
  `tool.edit_file.failed`, `tool.<name>.invalid_path`) are the contract any
  future Pino/Sentry sink consumes. They are asserted in core tests so a
  rename is detected at PR time, not at production-alert time.
- **`cli-errors.jsonl` becomes a multi-level event log.** The filename is kept
  for backwards compatibility with Task 3.6 entries on existing vaults; a
  later rename (e.g. `cli-events.jsonl`) is a separate decision because it
  changes vault layout. Tracked in the Task 3.9 wrap-up's open issues.

---

## Task 4: System prompt R1-R13 + request builder + input heuristic + prompt caching

> **Split note (2026-05-18).** Originally bundled tool-result pruning + session persistence too. Those moved to Task 4.1 because the combined diff exceeded the `/plan` "single commit" sizing rule. Task 4 keeps the in-memory `messages: ModelMessage[]` array from Task 3 unchanged; Task 4.1 swaps it for disk-backed sessions and adds the pruning step to `request-builder.ts`. The split point is clean because `buildRequest` already sees `messages` as an opaque input: Task 4 passes the array through verbatim; Task 4.1 inserts the pruning transform without further touching the prompt/caching surface.

> **Router-removal note (2026-05-18).** The original draft also included `packages/core/src/model-router.ts` — a regex/keyword classifier choosing between `'haiku' | 'sonnet'`. Removed before starting Task 4: (1) `haiku | sonnet` bakes Anthropic-specific names into provider-agnostic call sites, contradicting the Vercel-AI-SDK-as-abstraction stance Task 3.9 just reinforced; (2) keyword matching gives false confidence — a green test on four phrases produces a router that mis-fires on the first real workload. The architectural question — provider-agnostic tiers + discriminator (content classifier vs. user tier vs. explicit opt-in) — is captured in `docs/specs/architecture.md` → "LLM Provider Architecture: Vercel AI SDK" → "Smart routing — open question". Phase 1 runs single-model (Haiku, hardcoded in the CLI). Revisit when Phase 2a backend lands a user-tier model, or when Phase-1 smoke surfaces a request class where one model is materially worse than two.

### Instructions

The "productization pass" over Task 3 (part 1). The inline code from Task 3 gets refactored into clean core modules; pruning + persistence land in Task 4.1.

**`packages/core/src/system-prompt.ts`:**
- Export `buildSystemPrompt(ctx: { today: Date })`: builds the full system prompt with R1-R13 from the architecture spec
- Concrete rules materialized in the prompt:
  - **R1:** Five lists + daily note, purpose + crosscheck-relevance table inline
  - **R2:** Single-location invariant + focus↔next-actions exception
  - **R3:** Daily note ↔ task system relationship
  - **R4:** Crosscheck protocol steps 1–5 as an explicit step list
  - **R5:** Daily-note lifecycle (note: the server-side move happens automatically via Task 5; the LLM doesn't have to do it itself — but it must know that `daily/` always contains only today's note)
  - **R6:** Next-actions structure (one file, two-level)
  - **R7:** Weekly review with review-marker format `**Last weekly review: YYYY-MM-DD (weekday)**` in the focus header
  - **R8:** Task format (markdown checkboxes)
  - **R9:** Daily note format (plan, log, notes)
  - **R10:** Natural-language commands (examples)
  - **R11:** Proactive hints (situational, no schedule)
  - **R12:** Context-aware session start (since Phase 1 has no generative UI: render as text response)
  - **R13:** Inject date at runtime: `Today is {weekday}, {dd. month yyyy}.`
- After R1–R13, append a separate **`## Tool conventions`** section (NOT an R-rule — these are tool-protocol affordances, not GTD rules). Five short bullets, reinforcing what's already in each tool's description so the LLM has both signals. Phase-1 set:
  - **T-C1** `edit_file` returning `error.reason: "match"` with `currentContent: ""` means the file does not exist — call `write_file` to create it; do not retry `edit_file`.
  - **T-C2** `edit_file` returning `retry_budget_exhausted` is final for this turn on this file — stop retrying that path; ask the user or try a different file.
  - **T-C3** `out_of_scope` is by design — the path is permanently unwritable/unreadable under the GTD layout. Do not rewrite/rename the path; ask the user or pick an allowed path.
  - **T-C4** `write_file` is for create or full rewrite only. For changes to existing files, always `edit_file`.
  - **T-C5** `search_files` defaults to `scope: "active"`. Use `archive` only when the user explicitly asks about old material; `all` is rarely the right choice.
- Keep prompt length in mind (~1K tokens target, hard <2K)

**`packages/core/src/request-builder.ts`:**
- Export `buildRequest(opts: { today, profile, messages, userMessage })` → `{ system, messages }`
- Calls `buildSystemPrompt` + appends profile to `system`
- Passes `messages` through verbatim — Task 4.1 inserts the `pruneToolResults` call here. Reserve the seam: comment in code that this is the pruning insertion point and the function-signature contract (`messages: ModelMessage[]`) is stable across the 4 → 4.1 boundary.
- Appends the new user message
- **No active-state pre-load.** The architecture-spec Request Block (`docs/specs/architecture.md` → "Request Architecture: How Each Message Is Built") explicitly drops the "Current GTD Files" block. The LLM reads vault files on demand via `read_file`; pruning (Task 4.1) keeps recent reads as the LLM's working snapshot. Rationale captured in the spec under "Why no pre-loaded current-files block" (resolves Codex review findings 1 + 2 from 2026-05-19: trust-boundary on user-editable content and missing size cap). `buildRequest` therefore does not take a `repo` parameter — it's a pure transform over `today`/`profile`/`messages`/`userMessage`.

**Model selection:** *(deferred.)* The CLI keeps Task 3's hardcoded `anthropic("claude-haiku-4-5")` call. No `packages/core/src/model-router.ts` is introduced. See the Router-removal note above for the architectural reasoning. If Phase-1 smoke (Task 6) surfaces request classes where Haiku is materially worse, that's the trigger to revisit — not a green vitest on four phrases.

**Session persistence:** *(deferred to Task 4.1.)* Task 4's CLI keeps the in-memory `messages: ModelMessage[]` array from Task 3. Per-turn message state survives across REPL turns within one process but is lost on exit — acceptable for Task 4 smoke since the manual transcript (T4-AC-14) runs in one session.

**Input heuristic (`packages/core/src/input-validation.ts`):**
- Max 2000 chars (hard reject with a friendly message)
- Heuristic reject when:
  - > 5 lines AND either >20% of lines start with whitespace (code indent) OR share of `{};()=` in the input >5%
  - > 1500 chars AND >3 code-block markers (` ``` `)
- Response on reject: "That doesn't look like a task request. I'm your GTD assistant — what can I do for your tasks?" (CLI shows this; LLM is not invoked)

**Prompt caching:**
- `providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }` on the `streamText` call
- Anthropic then caches system prompt + tool definitions (stable across turns) — one `cacheControl` marker at the end is enough
- Log `totalUsage.inputTokenDetails.cacheReadTokens` and `cacheWriteTokens` (simple `console.debug` behind `DEBUG=1`)

**CLI refactor:**
- `apps/cli/src/index.ts` now uses `buildRequest` + input validation. Model selection stays at Task 3's hardcoded `anthropic("claude-haiku-4-5")` (no router).
- The minimal stub prompt from Task 3 is removed

### Acceptance

Vitest suite green:
- **T4-AC-01:** `buildSystemPrompt({ today: new Date('2026-04-24') })` contains `"Today is Friday, 24. April 2026"` and all R1-R13 marker strings (each rule gets a unique anchor in the prompt — the test checks all 13 anchors).
- **T4-AC-01b:** `buildSystemPrompt(...)` contains a `## Tool conventions` section with the five T-C1..T-C5 anchors (each conventions bullet has a unique marker the test asserts). Reinforces the tool-description-level rules and keeps GTD rules (R1–R13) free of tool-protocol guidance.
- **T4-AC-06:** *Removed (2026-05-18).* The original AC pinned a regex-based `routeModel` against four example phrases. The router is deferred entirely — no test surface in Task 4. See Router-removal note above.
- **T4-AC-10:** Input validation rejects 2001 chars.
- **T4-AC-11:** Input validation accepts 2000 chars of normal language.
- **T4-AC-12:** Input validation rejects a `function foo() { return 1; }` paste with 50 lines.
- **T4-AC-13:** Input validation accepts normal task text such as "New task: write VW quote".
- **T4-AC-14:** Manual smoke test transcript against the real vault: 3 turns produce cache writes on the first turn and cache reads on the second and third turns (observable in the debug log). All three turns run against `claude-haiku-4-5`; no model-routing assertion (deferred — see Router-removal note).

> AC numbering keeps gaps (`-02..-05d`, `-07..-09`) intentionally — those slots are reserved for the original pruning/session contracts, which migrated to Task 4.1 with a fresh `T4.1-AC-XX` namespace. `-06` is now also a deliberate gap (router deferred). The gaps make the split + deferral visible in code review.

### Key Locations

- `packages/core/src/system-prompt.ts` (+ possibly `system-prompt.template.md` as a file imported at compile time)
- `packages/core/src/request-builder.ts` (pruning seam reserved for Task 4.1)
- `packages/core/src/input-validation.ts`
- `packages/core/src/__tests__/` — one test file per module
- `apps/cli/src/index.ts` (refactored; in-memory `messages` array retained — Task 4.1 swaps it for sessions; model stays hardcoded — router deferred)
- **Intentionally absent:** `packages/core/src/model-router.ts` (deferred to a post-Phase-1 architectural pass; see Router-removal note)

### Key Discoveries

- **Prompt caching is manual.** The SDK caches nothing automatically. The `cacheControl` marker defines the end of the cached block. Phase 1 strategy: a single marker on the `streamText` call that flags everything up to that point (system + tool definitions) as cacheable. End-of-message markers via `prepareStep` (for message-history caching) is a Phase 2 topic.
- **R12 session-start suggestion** is a text response in Phase 1 (no generative UI). The system prompt contains the state table from R12; the LLM decides which suggestion to make on the first turn of a new session.
- **The input heuristic must not be too aggressive.** A task like "Write code review for PR #42" contains special chars but not in the proportions the heuristic rejects. Test cases cover honest edge cases.
- **The pruning seam stays a no-op in Task 4.** `request-builder.ts` passes `messages` through verbatim so the public function signature `buildRequest({ ..., messages: ModelMessage[] })` is the contract Task 4.1 extends. No `pruneToolResults` import in Task 4 — leaving it out keeps the diff minimal and avoids a half-finished implementation in tree.
- **No active-state pre-load (architecture amendment 2026-05-19).** The original Task 4 design loaded `tasks/*.md` + today's daily as a leading system-role message every turn. A post-implementation Codex review surfaced two no-ship findings: (1) elevating user-editable vault content to system-role authority opens a prompt-injection path against R1–R13 / tool rules, and (2) the per-turn vault snapshot had no size cap. Resolution: drop the pre-load entirely and rely on `read_file` + Task-4.1 pruning. Architecture spec updated in the same change. The per-tool size budget concern migrates to the spec's "Open question: Per-file size budget on read_file / edit_file / write_file" with trigger conditions for revisit and a partial-read design sketch (offset/limit + a new `grep_file` tool — Claude-Code-style but first-class, not bash).

---

## Task 4.1: Tool-result pruning + session persistence

> **Post-split task.** Carved out of the original Task 4 during `/start-task 4` on 2026-05-18. Task 4 ships the prompt/router/input/caching pipeline; Task 4.1 adds the two remaining MVP-quality concerns the original Task 4 also bundled: long-session token control (pruning) and conversation continuity across REPL restarts (sessions). Split rationale: combined diff exceeded the `/plan` "single commit" sizing rule.
>
> **Pre-commit redesign (2026-05-19).** A Codex adversarial review of the in-flight 4.1 diff (before commit) returned `needs-attention` with three concrete bugs and surfaced a layering smell. All four folded into 4.1 *before* commit — they touch 4.1's own artifacts (`sessions.ts` + CLI wiring), so a separate 4.2 immediately rewriting them would be churn:
>
> 1. **High — Phase-2 save failure leaves unsaved state live in memory.** Phase 2 appended `response.messages` to `session` *before* awaiting `saveSession`. If the write failed, the in-memory session held messages that never landed on disk, and the next successful Phase-1 save would persist them anyway — breaking the two-phase contract.
> 2. **Medium — UTC day-rollover contamination.** `session` was loaded once at startup and aliased into closures; if the CLI crosses UTC midnight, new turns get appended to the previous day's session file.
> 3. **Medium — Non-atomic write.** `saveSession` overwrote the final path directly; an interrupted `writeFile` (crash, SIGKILL, ENOSPC) corrupts the only durable conversation log.
> 4. **Layering smell — `packages/core/src/sessions.ts` imported `node:fs/promises`.** Core is shared with the Phase-2a web/Supabase target, which has no `fs`. The previous plan ratified this as "same pattern as `.keppt/logs/`", but `cli-error-log.ts` lives in `apps/cli` — `sessions.ts` lived in `core` and was the layering violation, not a parallel.
>
> All four bugs share a root cause: `Session` was a passive record, and callers were responsible for invariants the data structure should own. The fix is OOP-shaped: `Session` becomes a class with encapsulated `_messages` / `_createdAt` (invariant `length === length`), atomic `appendTurn`, `snapshot()` / restore for transactional save-and-rollback, and identity by `date`. Persistence moves behind a `SessionStore` interface in core with `FsSessionStore` implementation in `apps/cli`; `SupabaseSessionStore` slots into the same interface in Phase 2a.
>
> **Second Codex pass (2026-05-19, post-redesign).** A second adversarial review against the OOP-shaped diff surfaced two more findings:
>
> 5. **High — Phase-2 timestamps hide stale reads after same-turn edits.** Stamping response messages with `Date.now()` *after* the stream ran meant the drift check missed any same-turn `read_file → edit_file` flow on the same file. Fixed by stamping with `turnStartedAt` (captured before `streamText`); see new T4.1-AC-16 + Key Discovery.
> 6. **Medium → out-of-scope — Whole-session save loses turns from concurrent CLI processes.** Reframed during discussion: this is not primarily a persistence bug but an unhandled use case. Two parallel turns into one session produce semantically incoherent LLM context regardless of whether persistence preserves both. The Phase-1 CLI assumes single-instance per vault; documented in `FsSessionStore.save` block comment and Key Discoveries. Phase 2a solves both layers structurally (append-only `messages` rows + `sessions.in_flight_turn_id` with SSE turn-locking).

### Instructions

Two independent additions wired into the existing `request-builder.ts` + `apps/cli/src/index.ts` from Task 4.

**`packages/core/src/tool-result-pruning.ts`:**
- Export `pruneToolResults(messages: ModelMessage[], opts: { k: number; fileVersionAt: (path: string) => number | undefined; messageCreatedAt: (msg: ModelMessage) => number }): ModelMessage[]`
- Two stubbing conditions per `tool-result` block — block is stubbed if **either** holds:
  - **Age cap (K):** the block sits before the last `K` `tool`-role messages.
  - **Version drift:** the block referenced a single file (extracted via `toolCallId → previous assistant tool-call.input.file_path`) and `fileVersionAt(filePath) > messageCreatedAt(toolMessage)`. If the path lookup fails (e.g. `list_files`, `search_files`), only the K-window applies.
- For each stubbed `tool-result` content part: `output` is replaced by the stub string `[Previous ${toolName} result — superseded by current state; re-read if needed]`. `toolCallId` and `toolName` are preserved.
- `tool-error` parts stay untouched (error info may remain relevant for the LLM).
- `user` and `assistant` messages (incl. `tool-call` parts!) are **never** modified.
- K from MVP spec: 5.
- `fileVersionAt`: in the Supabase repo, joined from `files.updated_at`; in the local repo, `fs.stat(path).mtime` converted to ms epoch.
- `messageCreatedAt`: in Supabase, `messages.created_at`; in CLI memory, an injected timestamp set when the message is appended.
- Pure function — no logger, no I/O. The caller injects `fileVersionAt` and `messageCreatedAt` closures.

**`packages/core/src/sessions.ts` — `Session` class + `SessionStore` interface:**

```ts
export class Session {
  readonly date: string;          // YYYY-MM-DD — entity identity
  private _messages: ModelMessage[];
  private _createdAt: number[];   // parallel array; invariant: length === _messages.length

  static createEmpty(date: string): Session;
  static fromJSON(raw: unknown): Session;    // shape-validates, throws on malformed

  get messages(): readonly ModelMessage[];    // read-only view for streamText / buildRequest
  createdAtOf(msg: ModelMessage): number | undefined;  // encapsulates the indexOf lookup

  appendTurn(messages: ModelMessage[], createdAtMs: number): void;
  snapshot(): () => void;          // returns restore() — truncates both arrays back to snapshot lengths
  toJSON(): { date: string; messages: ModelMessage[]; createdAt: number[] };
}

export interface SessionStore {
  loadOrCreate(date: string): Promise<Session>;
  save(session: Session): Promise<void>;
}
```

- **Identity is `date`.** A `Session` is the conversation for one calendar day; the CLI never mutates `date` after construction. `loadOrCreate` returns a fresh empty session for unknown dates.
- **Invariant `_messages.length === _createdAt.length`** is the class's job, not the caller's. `appendTurn` keeps it; `snapshot()` restores both arrays together; `fromJSON` validates it on load.
- **`snapshot()` / `restore()` is the transactional seam.** Each `save` is wrapped: `snapshot → appendTurn → save → on-error restore`. Pure in-memory rollback; no file is touched in `restore`.
- **`toJSON()` makes `JSON.stringify(session)` produce the same shape `fromJSON` consumes.** Roundtrip survives a parse without a separate mapper.
- **No `node:fs` import in `packages/core/src/sessions.ts`.** Persistence lives behind `SessionStore`; core stays storage-agnostic so Phase 2a Web/Supabase can implement the same interface against the `messages` table.
- Session switching (loading a past day's session and continuing) is **not** MVP. Today's session is loaded; older files sit on disk untouched.

**`apps/cli/src/fs-session-store.ts` (new) — `class FsSessionStore implements SessionStore`:**

- Constructed with `(vaultPath: string)`. Stores at `<vaultPath>/.keppt/sessions/<date>.json`.
- `loadOrCreate(date)`: reads the file, returns `Session.fromJSON(JSON.parse(raw))`. On ENOENT returns `Session.createEmpty(date)`. Other errors propagate.
- `save(session)`: **atomic write** via tmp + rename:
  - `await mkdir(dirname(final), { recursive: true })`.
  - Write JSON to `<final>.tmp.<pid>.<Date.now()>` in the same directory.
  - `await rename(tmp, final)` — POSIX atomic replace within the same filesystem; closes the partial-write data-loss hole.
  - `fsync` deliberately omitted — Phase 1 trades the post-crash data-loss window for throughput, same trade-off `cli-error-log.ts` already makes for JSONL appends.

**Integration:**
- `packages/core/src/request-builder.ts` (modified) — adds the `pruneToolResults(messages, { k: 5, fileVersionAt, messageCreatedAt })` call at the seam reserved in Task 4. New `opts` fields: `fileVersionAt` and `messageCreatedAt` (both required). **`buildRequest` drops its `userMessage` parameter** — the user message is now part of `messages` (persisted before the call), so `buildRequest` no longer special-cases the last turn's user message. New shape: `({ today, profile, messages, fileVersionAt, messageCreatedAt }) → { system, messages: prunedMessages }`. `buildRequest` itself stays pure; the closures are constructed by the CLI.
- `apps/cli/src/index.ts` (modified) — instantiate `FsSessionStore`, day-rollover guard per turn, snapshot/restore around each save:
  ```ts
  const store = new FsSessionStore(vaultPath);
  let turnNow = new Date();
  let session = await store.loadOrCreate(formatToday(turnNow));

  // per turn:
  turnNow = new Date();
  const todayKey = formatToday(turnNow);
  if (todayKey !== session.date) {
    session = await store.loadOrCreate(todayKey);   // closes day-rollover gap
  }

  // Phase 1 (before stream) — rollback on save failure aborts the turn:
  const restoreP1 = session.snapshot();
  session.appendTurn([{ role: "user", content: line }], turnStartedAt);
  try { await store.save(session); }
  catch (err) { restoreP1(); /* log phase: "session_save_phase1", continue */ }

  // ... streamText ...

  // Phase 2 (after stream success) — rollback on save failure does NOT replay the stream:
  const restoreP2 = session.snapshot();
  session.appendTurn(response.messages, Date.now());
  try { await store.save(session); }
  catch (err) { restoreP2(); /* log phase: "session_save_phase2" */ }
  ```
  - `let session` (not `const`) is required for the day-rollover reassignment.
  - `fileVersionAt = (p) => { try { return statSync(path.join(vaultPath, p)).mtimeMs; } catch { return undefined; } }` — unchanged.
  - `messageCreatedAt = (msg) => session.createdAtOf(msg) ?? Date.now()` — was an inline `indexOf` in the previous plan; the lookup now lives in the class.
- **Logging split** — session-save failures go to `cli-error-log.ts` with `phase: "session_save_phase1" | "session_save_phase2"`, distinct from `phase: "stream"`. A streamText exception means the model failed; a save exception means the model succeeded but we couldn't persist the answer. Conflating them defeats post-mortem.
- **Stream-abort contract (replaces Task 3 Decision 8).** If the stream aborts mid-turn, Phase 2 does not run. The session file on disk retains the user message from Phase 1 but contains no assistant/tool messages from the aborted turn. This is a deliberate change from Task 3's "all-or-nothing per turn" rollback: it prepares the Phase 2 web/SSE flow where a closed browser tab / dropped connection must still show the user "you asked X" on reconnect, so the user knows to ask again. The structural property `session.messages.at(-1)?.role === "user"` becomes the "this turn was abandoned (or is in flight)" indicator, with no schema field needed.

### Acceptance

Vitest suite green:
- **T4.1-AC-01:** `pruneToolResults` with K=5, 10 tool messages, and `fileVersionAt` returning a stable version (no drift) transforms the oldest 5 into stubs and leaves the newest 5 identical.
- **T4.1-AC-02:** `pruneToolResults` leaves user/assistant messages untouched, including assistant messages that contain `tool-call` parts.
- **T4.1-AC-03:** `pruneToolResults` leaves a message with mixed parts (text + tool-call in assistant) unchanged.
- **T4.1-AC-04:** `pruneToolResults` preserves `tool-error` parts.
- **T4.1-AC-05:** `pruneToolResults` stubs a `tool-result` within the K-window when `fileVersionAt(filePath) > messageCreatedAt(toolMessage)` — version drift overrides the K-keep.
- **T4.1-AC-06:** `pruneToolResults` is granular per file: with two recent reads on `inbox.md` and `focus.md` and `fileVersionAt` reporting drift only for `focus.md`, the focus tool-result is stubbed and the inbox tool-result stays.
- **T4.1-AC-07:** `pruneToolResults` falls back to K-only for `list_files` / `search_files` results (no single `file_path` to look up); inside the K-window they stay verbatim, outside they are stubbed.
- **T4.1-AC-08:** `FsSessionStore.loadOrCreate` in an empty vault returns `Session.createEmpty(date)` (empty `messages`, no `createdAt` entries) and does NOT yet write the file. Materialization happens on `save`.
- **T4.1-AC-09:** Session roundtrip: `appendTurn` + `store.save` → `store.loadOrCreate` returns a `Session` whose `messages` (compared deeply against the originals) and per-message `createdAtOf` lookups match.
- **T4.1-AC-10:** Session roundtrip: new day → new session file at `<today2>.json`, while the original `<today1>.json` stays on disk.
- **T4.1-AC-11:** Stream-abort safety (two-phase save): simulate an abort mid-turn via `AbortController.abort()` against `MockLanguageModelV4`; assert the on-disk session file contains the user message of the aborted turn (Phase 1 save ran) **and no** assistant/tool messages from that turn (Phase 2 save did not run). The structural property `session.messages.at(-1)?.role === "user"` holds.
- **T4.1-AC-12:** Happy-path two-phase save: after a successful turn against `MockLanguageModelV4`, the on-disk session file contains `[…pre-turn history, userMessage, …response.messages]` in order, with `createdAt.length === messages.length`.
- **T4.1-AC-13:** `Session.snapshot()` + restore: a `restore()` closure obtained before `appendTurn` rolls `messages` and per-message `createdAtOf` lookups back to their pre-`appendTurn` state — including the "save throws after appendTurn" path the CLI uses for Phase-2 save-failure rollback. Closes the Codex high-severity finding.
- **T4.1-AC-14:** Day-rollover: with a CLI loop that calls `formatToday(turnNow)` per turn and reloads `session` from the store on change, simulate two turns at UTC `2026-05-19T23:59:30Z` and `2026-05-20T00:00:30Z`; the second turn's messages land in `<vault>/.keppt/sessions/2026-05-20.json`, not `2026-05-19.json`. Day-1 file retains only day-1 messages.
- **T4.1-AC-15:** Atomic write: `FsSessionStore.save` writes via `<final>.tmp.<pid>.<ts>` + `rename`. Assert via spy on `node:fs/promises.rename` that the final path is reached through a rename of a same-directory tmp file (not a direct `writeFile` to the final path). Closes the Codex non-atomic-write finding.
- **T4.1-AC-16:** Same-turn read-then-edit drift: simulate a turn where `read_file("tasks/inbox.md")` ran before `edit_file("tasks/inbox.md")` in the same response, with the file's mtime bumped during the (mocked) stream. Phase 2 stamps response messages with `turnStartedAt` (not `Date.now()`); the next turn's `buildRequest`-driven pruner classifies the read as drift-invalidated and stubs it. Closes the Codex high-severity drift finding.

### Key Locations

- `packages/core/src/tool-result-pruning.ts` (new)
- `packages/core/src/sessions.ts` (new — `class Session` + `interface SessionStore`, no `node:fs` import)
- `packages/core/src/request-builder.ts` (modified — pruning seam activated)
- `packages/core/src/__tests__/tool-result-pruning.test.ts` (new)
- `packages/core/src/__tests__/sessions.test.ts` (new — `Session` class behavior: `appendTurn`, `snapshot`/restore, `toJSON`/`fromJSON` roundtrip, invariant enforcement, malformed-JSON rejection)
- `packages/core/src/__tests__/request-builder.test.ts` (extended — assert pruning is called with `k: 5`)
- `apps/cli/src/fs-session-store.ts` (new — `FsSessionStore` with atomic tmp+rename `save`)
- `apps/cli/test/fs-session-store.test.ts` (new — ENOENT → `createEmpty`, atomic write spy, roundtrip)
- `apps/cli/src/index.ts` (modified — store DI, day-rollover guard, snapshot/restore around Phase-1 and Phase-2 saves, split error-log phases)
- `apps/cli/test/two-phase-save.test.ts` (extended — AC-13 Phase-2-save rollback, AC-14 day-rollover)
- `apps/cli/test/workspace-wiring.test.ts` (re-verified or extended if it hits the message path)
- `docs/task-log/task-4.1-pruning-and-sessions.md` (post-implementation wrap-up — includes the 2026-05-19 pre-commit redesign)

### Key Discoveries

- **Tool-result pruning only transforms `role: 'tool'` messages.** Assistant messages with `tool-call` parts stay untouched (they show "a call happened", which matters for context — only the concrete result is stubbed).
- **A `tool-result` part has the fields `type: 'tool-result'`, `toolCallId`, `toolName`, `output`** (see SDK research §8). Pruning replaces `output` with a string, not the whole part.
- **Two stubbing conditions, OR-combined.** K=5 is the size cap (long-session token control); file-version drift is the freshness cap (catches external edits between turns and prior LLM-side `edit_file`/`write_file` calls in the same conversation). Either alone leaves a real gap — see architecture spec § *Context Management: Tool-Result Pruning*.
- **`file_path` lives in the tool-call, not the tool-result.** The pruner joins `tool-result.toolCallId` to the previous assistant message's `tool-call.input.file_path`. `read_file`, `edit_file`, `write_file` all carry a single `file_path`. `list_files` and `search_files` don't and use the K-window only.
- **K=5** per the architecture spec. Tunable, but fixed for MVP.
- **Session switching is explicitly not an MVP feature.** Today's session file is loaded; past sessions just sit on disk and are not touched by the CLI. Phase 2a brings the UI for that.
- **Session as a class, not a passive record (revised 2026-05-19).** The previous plan modeled `Session` as `interface Session { date, messages, createdAt }` with helper functions (`appendMessages`, `loadOrCreateSession`, `saveSession`) operating on it from outside. The Codex pre-commit review surfaced three bugs (Phase-2-save rollback, UTC day-rollover, non-atomic write) that all share the same root cause: callers were responsible for invariants the data structure should own. Specifically: (a) "remember to truncate `messages` and `createdAt` together on save failure", (b) "remember to compare `formatToday(turnNow)` against `session.date` per turn", (c) "remember that `messages.length === createdAt.length` must hold across mutations". All three are textbook anemic-domain-model symptoms — exactly the case where OOP wins over a passive record. The redesign moves the invariant + transactional append + snapshot/restore + identity-by-date into the `Session` class itself; the caller no longer reaches into `_messages` / `_createdAt`. The functional-record style is still the right shape for value objects (`ModelMessage`, `FilePath`) — but wrong for an entity with identity, mutable state, and an invariant, and the bug class is the proof.
- **Persistence lives behind `SessionStore`, not direct `fs` in core (revised 2026-05-19).** The earlier plan ratified `sessions.ts` doing direct `fs` writes as "same pattern as `.keppt/logs/`". That justification was wrong on the wider lens: `cli-error-log.ts` lives in `apps/cli` (CLI-only persistence is fine there), but `sessions.ts` lived in `packages/core` — which is shared with the Phase-2a web/Supabase target where `node:fs` does not exist. The correct shape is `SessionStore` interface in core + `FsSessionStore` in `apps/cli` + `SupabaseSessionStore` in `apps/web` (Phase 2a). `FileRepository` continues to be the storage abstraction for LLM-visible vault files; `SessionStore` is the parallel abstraction for the system-owned session log.
- **Atomic write via tmp + rename.** Direct overwrite of the session file was a data-loss risk: a crash, SIGKILL, or ENOSPC mid-`writeFile` would truncate the only durable conversation log. The standard POSIX pattern — write to `<final>.tmp.<pid>.<timestamp>`, then `rename` to the final path — gives an atomic replace within the same filesystem. `fsync` is omitted (same trade-off as `cli-error-log.ts` JSONL appends).
- **Day-rollover handling.** `let session` (not `const`) at top of `main`, with a `formatToday(turnNow)` check per turn that reloads via the store when the day key changes. Without this guard, a long-running CLI that crosses UTC midnight would contaminate the previous day's session file with the new day's turns, and the expected `YYYY-MM-DD.json` for the new day would not appear until restart — despite `formatToday(turnNow)` already driving the system prompt and tool gate. Closed in this task; matches the spirit of the existing per-turn `turnNow` rebuild for `repo.now`.
- **Parallel `createdAt: number[]` array (internal).** Keeps `messages: ModelMessage[]` an opaque value the SDK can consume without translation. The alternative (wrap each message in `{ message, createdAt }`) would force translation on every `streamText` call. The lookup is now encapsulated behind `Session.createdAtOf(msg)` (indexOf-based, O(n) but n ≤ K + active context).
- **Two-phase save (user-first, response-after-success).** The CLI persists the user message immediately on receipt (Phase 1), then the assistant/tool response only after the stream completes successfully (Phase 2). Motivations: (a) prepares the Phase 2 web/SSE flow — on tab close / reconnect, the user sees their last question and infers "answer was lost, ask again" without any indicator field in the schema; `session.messages.at(-1)?.role === "user"` is the structural indicator. (b) `buildRequest` simplifies: with the user message already in `session.messages`, `buildRequest` drops its `userMessage` parameter and becomes a pure historical-messages transform. (c) **Both phases are now wrapped in `session.snapshot()` / `restore()`** — any in-memory mutation is reverted if its accompanying `store.save` rejects, closing the Codex high-severity finding that a failed Phase-2 save left assistant/tool state live in memory and would have persisted on the next successful turn's save. The Task 3 Decision 8 "rollback to pre-turn state" contract is **deliberately replaced** by this two-phase shape. Side-effect note: server/CLI-side tool calls (file edits) that ran before the abort *did* affect the vault even if the response message isn't persisted — that's correct, the vault is the truth, the session log is just the conversation transcript.
- **Logging split for session-save failures.** Session-save errors land in `cli-error-log.ts` with `phase: "session_save_phase1" | "session_save_phase2"`, distinct from `phase: "stream"`. A `streamText` exception means the model failed; a save exception means the model succeeded but we couldn't persist the answer. Conflating them in the JSONL defeats post-mortem.
- **Phase-2 timestamps use `turnStartedAt`, not `Date.now()` (added 2026-05-19, second Codex pass).** A second adversarial review flagged a high-severity drift bug: `Date.now()` was being captured *after* `await result.response`, which is after any same-turn `edit_file` had already bumped the file's mtime. The pruner's drift check (`fileVersionAt > messageCreatedAt`) would then return false next turn for the prior `read_file` tool-result, letting the LLM act on pre-edit state. Fix: stamp Phase-2 response messages with the `turnStartedAt` value captured immediately before `streamText` — guaranteed strictly less than any mtime produced during the turn, so the drift check fires correctly on read-then-edit-of-same-file. Granularity stays "all response messages share one stamp" — drift is per-file in the pruner (joined via `toolCallId → tool-call.input.file_path`), so a read of file A + unrelated edit of file B in the same turn does not cross-invalidate. Per-message stamping (capture during `for await (const part of result.fullStream)`) would be more precise but adds no correctness for this contract. See `apps/cli/src/index.ts` Phase-2 block comment.
- **Multi-instance same-session concurrency is out of scope for Phase 1 (added 2026-05-19, second Codex pass).** A second adversarial review flagged that whole-session atomic replace still loses turns under concurrent CLI processes. Reframed after discussion: this is not primarily a persistence bug — it's an unhandled use case. Running two CLIs (or two future-Phase-2a clients) against the same `<vault>/<date>` simultaneously would produce *semantically incoherent LLM context* even with perfect persistence: each `streamText` call would see a stale snapshot of `session.messages`, each turn's answer would be generated without knowledge of the parallel turn, and the merged on-disk history would interleave two unrelated threads. Persistence-level locking would fix data-loss but not the semantic incoherence. The Phase 1 CLI is a **single-user single-instance testballoon**; the assumption is documented in `apps/cli/src/fs-session-store.ts` block comment on `save`. Phase 2a addresses both layers structurally — append-only `messages` rows (no load-modify-save) + `sessions.in_flight_turn_id` with SSE-broadcast turn-locking (one in-flight turn per session enforced at the API boundary). For Phase 1, a cheap pidfile-guard could be added if the use case ever materializes pre-Phase-2a; not done now because the use case does not exist.

---

## Task 4.2: Per-turn debug logging (request/response artifacts)

> **Post-created task.** Added 2026-05-19 from a Phase-1 dogfooding gap. Task 4 wired prompt caching, Task 4.1 wired tool-result pruning — both are invisible at runtime. The existing `cliLogger.debug` with `code: "prompt.cache_usage"` (`apps/cli/src/index.ts`) emits the `totalUsage` breakdown to `cli-errors.jsonl` per turn, but the *post-pruning request* the LLM actually saw and the per-step response breakdown land nowhere. Without that the empirical-validation tradeoff documented under [[feedback_phase1_pragmatism]] can't be exercised — we'd have to trust the pruner instead of reading what was sent. This is also a precondition for the Task 6 acceptance run, which needs concrete artifacts to spot-check against expected prompt-cache hits and pruning stubs.
>
> Phase 1 ships only the CLI's `FsTurnLogger`, gated by `DEBUG=1` and vault-local. The `TurnLogRecord` shape and `TurnLogger` contract land in **core** anyway — Phase 2a needs the same artifact for the always-on backend support/bug-report path (user reports broken output, support pulls the matching turn artifact by `turnId`). Doing it now avoids a Phase-2a schema break. Allowlist serialization is sufficient at this seam regardless of runtime: the Anthropic API key is read from env by the SDK and never reaches our local request object, so there is no secret to redact. Phase-2a-specific concerns (cross-user content boundaries, GDPR retention/erasure, storage choice) are explicitly deferred to the `SupabaseTurnLogger` task.

### Instructions

**`packages/core/src/turn-log.ts` (new — runtime-neutral interface + types):**
- Export `interface TurnLogRecord` — the canonical artifact shape (see definition below). Single source of truth across CLI and Phase-2a backend.
- Export `interface TurnLogger { writeTurn(record: TurnLogRecord): Promise<void> }` — minimal **write-only** contract. No read API in Phase 1: Phase-2a's "user requests log" workflow is server-side (backend persists for all users continuously, support pulls by `turnId`), not client-export, so the interface stays a sink. If a client-export workflow ever materializes (offline Capacitor edge cases), it lands behind a separate `TurnLogReader` interface — not pre-emptively.
- Export `class NoopTurnLogger implements TurnLogger` — `writeTurn` resolves immediately, no I/O. Used by tests that don't care about the artifact.
- Export `class MemoryTurnLogger implements TurnLogger` — `writeTurn` appends to a public `records: TurnLogRecord[]` array. Used by tests asserting on emitted artifacts (analogous to `MemoryLogger`).
- No `node:fs` import. No `console.*`. Same hygiene rule as `packages/core/src/sessions.ts` (Task 4.1 layering finding).

**`apps/cli/src/fs-turn-logger.ts` (new — `class FsTurnLogger implements TurnLogger`):**
- Constructor `(vaultPath: string, sessionDate: string)`.
- Implements the core `TurnLogger` interface — `writeTurn(record): Promise<void>`.
- Stores artifacts at `<vaultPath>/.keppt/logs/sessions/<sessionDate>/turn-NNN.json` (zero-padded three-digit counter).
- Constructor reads the subdirectory listing (if any) to find the max existing `turn-NNN` and seeds the in-memory counter. ENOENT means "first turn this day" — start at 1.
- Exposes `nextTurnId(): string` returning `"turn-001"`, `"turn-002"`, … so callers can stamp the artifact filename consistently with the in-memory state.
- Exposes `writeTurn(turnId: string, record: TurnLogRecord): Promise<void>` — **atomic write** via tmp + rename, same shape as `FsSessionStore.save` (mirrors T4.1-AC-15 and its Key Discovery on atomic write). `mkdir(..., { recursive: true })` before the first write each day.
- Constructed once per session and again on day-rollover, mirroring the `FsSessionStore` reload. Lives only in `apps/cli` — no core interface, since Phase 2a's debug story is structurally different (per-request Pino logs + Sentry breadcrumbs around `/api/chat`).

**`TurnLogRecord` shape (allowlist serialization — never `JSON.stringify` raw SDK objects):**

```ts
interface TurnLogRecord {
  turnId: string;
  startedAt: string;           // ISO
  endedAt: string;             // ISO
  durationMs: number;
  model: string;               // e.g. "claude-haiku-4-5"
  outcome: "ok" | "stream_error" | "aborted";
  initialRequest: {
    system: string;            // exactly what buildRequest returned
    messages: ModelMessage[];  // post-pruning, the wire-shape sent to streamText
    providerOptions: unknown;  // shallow copy of providerOptions.anthropic
  };
  steps?: Array<{              // present on outcome === "ok"
    stepIndex: number;
    finishReason: string;
    text: string;
    toolCalls: unknown[];
    toolResults: unknown[];
    usage: unknown;
    warnings?: unknown[];
  }>;
  totalUsage?: unknown;        // present on outcome === "ok" — incl. inputTokenDetails for cache visibility
  responseMessages?: ModelMessage[]; // exactly what got persisted in Phase 2
  error?: { name: string; message: string };  // present on outcome !== "ok"
}
```

- Build the record explicitly field-by-field; do not pass the raw `streamText` options object through `JSON.stringify`. Same ethos as [[feedback_audit_all_seams]]: build the output shape, don't trust the input shape.
- `messages` in `initialRequest` is the **pruned** array — the output of `buildRequest`'s `pruneToolResults` call. Opening a turn-NNN.json and searching for `"[Previous read_file result — superseded"` is the empirical test that 4.1's pruner ran.

**Integration in `apps/cli/src/index.ts`:**

- Instantiate `const turnLogger: TurnLogger = DEBUG ? new FsTurnLogger(vaultPath, session.date) : new NoopTurnLogger()` after `session` is loaded; reinstantiate the same way inside the day-rollover guard alongside `sessionStore.loadOrCreate`. (`DEBUG` is the existing constant at `apps/cli/src/index.ts:25`.)
- The DEBUG check still wraps the per-turn record assembly — `NoopTurnLogger` exists for the interface contract and for tests, not as a runtime cost-saver. Building a `TurnLogRecord` involves shallow field copies that aren't free across hot REPL turns, so skip the construction outright when `DEBUG` is off rather than building it and dispatching to a noop.
- Per turn (only when `DEBUG` is on):
  - `turnId = turnLogger.nextTurnId()`; capture `turnStartedAt` (already captured at `index.ts:192`).
  - Initialize a partial `TurnLogRecord` carrying `initialRequest` immediately after `buildRequest` returns — *before* `streamText` — so the request shape is computed even on later failure paths.
  - On successful completion (after Phase 2 save): fill `outcome: "ok"`, `steps` (from `result.steps`), `totalUsage` (from `result.totalUsage`), `responseMessages` (from `result.response.messages`), `endedAt`, `durationMs`. Call `turnLogger.writeTurn(turnId, record)`.
  - On stream error (catch block, non-abort branch): fill `outcome: "stream_error"`, `error: { name, message }`, `endedAt`, `durationMs`. Call `writeTurn`.
  - On abort (catch block, `controller.signal.aborted` branch): fill `outcome: "aborted"`, `endedAt`, `durationMs`. Call `writeTurn`.
- `writeTurn` failures route through `cliLogger.warn` with `code: "turn_log.write_failed"`. Never abort the turn — debug logging must not gate the REPL.
- The existing `cliLogger.debug({ code: "prompt.cache_usage", ... })` block stays as-is: it's the searchable JSONL summary in `cli-errors.jsonl`. The per-turn artifact is the structured deep-dive; the JSONL entry is the index.

**Vault layout:**
- `.keppt/logs/` already exists from Task 3.6 (the `cli-errors.jsonl` parent). The new `sessions/<date>/turn-NNN.json` artifacts sit under the same `.keppt/logs/` root. Whatever ignores `.keppt/` for the test vault already covers them.
- Manual cleanup only. No rotation, no TTL, no automatic prune. Documented in the wrap-up: if the directory becomes unwieldy, `rm -rf <vault>/.keppt/logs/sessions/`.

### Acceptance

Vitest suite green:

- **T4.2-AC-01:** With `DEBUG=1` and `MockLanguageModelV4`, one successful turn produces `<vault>/.keppt/logs/sessions/<today>/turn-001.json` with `outcome: "ok"`, a non-empty `initialRequest.system`, the user message in `initialRequest.messages`, and `responseMessages` matching what was appended to the session in Phase 2.
- **T4.2-AC-02:** With `DEBUG=0` (or unset), running the same turn produces **no** files under `<vault>/.keppt/logs/sessions/`.
- **T4.2-AC-03:** Atomic write: spy on `node:fs/promises.rename`; assert each `turn-NNN.json` reaches its final path through a rename of a same-directory tmp file (mirrors T4.1-AC-15).
- **T4.2-AC-04:** Counter resumes across CLI restarts within the same day: pre-seed `<vault>/.keppt/logs/sessions/<today>/turn-003.json` on disk, start the CLI, run one turn → the new artifact is `turn-004.json`, not `turn-001.json`.
- **T4.2-AC-05:** Day-rollover: simulate two turns at UTC `2026-05-19T23:59:30Z` and `2026-05-20T00:00:30Z` (mirrors T4.1-AC-14); day-2 artifacts land at `<vault>/.keppt/logs/sessions/2026-05-20/turn-001.json` (not under the day-1 subdirectory), and the day-2 counter restarts at 001.
- **T4.2-AC-06:** Stream-error path: an injected `APICallError` from the mocked model produces a `turn-NNN.json` with `outcome: "stream_error"` and a populated `error.message`. The CLI still writes the existing `cli-errors.jsonl` entry (Task 3.6 contract preserved); the two artifacts coexist.
- **T4.2-AC-07:** Abort path: `AbortController.abort()` mid-stream produces a `turn-NNN.json` with `outcome: "aborted"` and no `responseMessages` / `steps` / `totalUsage`.
- **T4.2-AC-08:** Allowlist serialization: when `providerOptions.anthropic` carries an extra unexpected key, the artifact's `initialRequest.providerOptions` reflects that shallow copy faithfully; nothing outside the documented `TurnLogRecord` fields appears at the top level (no incidental passthrough of the raw `streamText` options object).
- **T4.2-AC-09:** Pruning visibility: after six tool-using turns against a mocked model whose response includes a `read_file` tool-call/result for the same file each turn, `turn-006.json`'s `initialRequest.messages` contains at least one stub string matching the Task 4.1 stub format (`/^\[Previous .* result — superseded/`). Closes the empirical-validation goal motivating this task.
- **T4.2-AC-10:** Cache-usage visibility: with a mocked usage object containing `inputTokenDetails.cacheReadTokens`, the field is reachable via `totalUsage.inputTokenDetails.cacheReadTokens` in the on-disk artifact. (No assertion against real provider behavior — that lands in Task 6.)
- **T4.2-AC-11:** Write-failure non-fatal: simulating `rename` rejecting with `EACCES` in `writeTurn` emits a `cliLogger.warn` with `code: "turn_log.write_failed"` (asserted via `MemoryLogger`) and does not throw out of the turn — the REPL continues to the next prompt.
- **T4.2-AC-12:** Interface contracts: `NoopTurnLogger.writeTurn(record)` resolves without I/O and produces no on-disk artifacts when substituted into a CLI test run. `MemoryTurnLogger` substituted in the same flow exposes a public `records` array with one entry per turn in call order, each entry shape-matching `TurnLogRecord`.
- **T4.2-AC-13:** Core hygiene: `packages/core/src/turn-log.ts` imports no `node:fs`, no `node:fs/promises`, no `console.*` (asserted alongside the existing T3.9-AC-01/-02 core-hygiene checks).

### Key Locations

- `packages/core/src/turn-log.ts` (new — `TurnLogRecord` interface + `TurnLogger` interface + `NoopTurnLogger` + `MemoryTurnLogger`, no `node:fs`, no `console.*`)
- `packages/core/src/__tests__/turn-log.test.ts` (new — `NoopTurnLogger` resolves without I/O, `MemoryTurnLogger` records in call order)
- `packages/core/src/index.ts` (modified — re-exports the new types/classes)
- `apps/cli/src/fs-turn-logger.ts` (new — `class FsTurnLogger implements TurnLogger`, atomic tmp+rename `writeTurn`, counter seeding from disk)
- `apps/cli/src/index.ts` (modified — DEBUG-gated `FsTurnLogger`/`NoopTurnLogger` instantiation, day-rollover reinstantiation, per-turn record assembly across ok / stream-error / aborted branches)
- `apps/cli/test/fs-turn-logger.test.ts` (new — counter seeding from disk, atomic write spy, day-rollover reset, allowlist serialization)
- `apps/cli/test/turn-logger-integration.test.ts` (new — DEBUG on/off, ok/aborted/stream-error outcomes, pruning visibility across multi-turn flow, NoopTurnLogger transparency)
- `docs/task-log/task-4.2-debug-turn-logging.md` (post-implementation wrap-up)

### Key Discoveries

- **`result.steps` is the empirical view the artifact needs.** The Vercel AI SDK exposes per-step `request`/`response`/`toolCalls`/`toolResults`/`usage`/`finishReason` after `streamText` completes. Each step corresponds to one HTTP round-trip to Anthropic; prompt-cache hits are *per-step* (the second step typically reads from cache after the first step's stable head established the marker). A single `result.response.messages` blob would hide the per-step structure that makes validating Task-4 caching + Task-4.1 pruning possible.
- **Allowlist serialization, anchors Phase-2a format.** The Anthropic API key is read from env by the SDK and never appears in our local request object, so Phase 1 has no secret to redact at this seam. The Phase-1 risk is "accidentally serialize an unrelated SDK object that grows new fields in a future minor" — defended by building `TurnLogRecord` field-by-field per [[feedback_audit_all_seams]]. For Phase 2a the allowlist becomes load-bearing: because `TurnLogRecord` is defined in core, the same field set ships to the backend logger, and whatever fields aren't in the record can't accidentally leak across user boundaries. Cross-user content redaction (multi-user backend writes one user's prompt that another user later reads in support context) is a separate Phase-2a concern handled at the `SupabaseTurnLogger` impl layer.
- **Core interface, not CLI-leaf concern (revised 2026-05-19).** The original draft kept `TurnLogger` as a CLI-only class on the grounds that Phase 2a's debug story is structurally different (Pino + Sentry). Reframed during planning discussion: the support/bug-report workflow ("user reports broken behaviour, support pulls the matching turn artifact") IS a Phase-2a use case, and the artifact shape — system prompt, post-pruning messages, per-step usage including cache hits — is genuinely runtime-neutral. Defining `TurnLogRecord` + `TurnLogger` in core now, with `FsTurnLogger` as the Phase-1 impl and `SupabaseTurnLogger` as the Phase-2a impl, mirrors the `SessionStore` / `FsSessionStore` shape from Task 4.1 and avoids a Phase-2a schema break. Pino + Sentry remain orthogonal — they handle *event* logging (one structured line per occurrence); `TurnLogger` handles *payload* logging (one full artifact per LLM turn). Both are needed; neither replaces the other.
- **Write-only contract, no read API in Phase 1.** Phase 2a's "user submits a bug report" UX is server-side by design: the backend persists turn artifacts continuously for emergencies/support queries, and a support tool pulls the matching `turnId` against the user's session. The user is never the one packaging logs client-side. So `TurnLogger` stays a write-only sink — no `listTurns()` / `readTurn()` in core. If a client-export workflow ever materializes (offline Capacitor edge cases, paranoid-user "show me what you logged" surface), it lands behind a separate `TurnLogReader` interface added at that point — not pre-emptively per [[feedback_phase1_pragmatism]].
- **Retention/cleanup deferred to `SupabaseTurnLogger`.** Always-on backend logging means artifact volume grows unbounded over time. A retention/cleanup policy (TTL? size cap? per-user quota? GDPR right-to-erasure?) is a real concern but explicitly **out of scope for Task 4.2** — it depends on Phase-2a storage choice (Supabase table rows vs. S3 vs. signed-URL handoff) and regulatory regime, neither of which is settled. Tracked here as a deferred open issue; revisit when `SupabaseTurnLogger` lands. For Phase 1 the CLI grows the `.keppt/logs/sessions/` directory until the user manually `rm -rf`s it — acceptable because the user IS the developer.
- **Counter resumes from disk, not from `session.messages.length`.** A user may continue a session that already has on-disk turn artifacts from a prior CLI run on the same date. Deriving the next turn number from the existing `turn-NNN.json` filenames is more robust than counting messages: the `messages` count is post-pruning and may diverge from the HTTP-turn count once future tasks add turns that don't enter the persistent message log (system messages, future tool-only auto-runs).
- **Failure during artifact write is non-fatal.** The artifact is debug-only; a write failure must not bubble into the REPL. Fire-and-forget shape consistent with `cli-logger.ts`: log the failure via `cliLogger.warn({ code: "turn_log.write_failed" })` and move on. Closes the "debug instrumentation must not become its own outage" trap.
- **Single artifact per turn, written at end.** A two-file scheme (`turn-NNN.request.json` pre-stream + `turn-NNN.response.json` post-stream) was considered but rejected: it doubles inode count and makes spot-inspection awkward (open two files to see one turn). The trade-off accepted: a hard process crash mid-stream loses that turn's artifact entirely. That's acceptable because `cli-errors.jsonl` independently captures the crash itself — a missing turn artifact next to a crash entry in `cli-errors.jsonl` is itself a signal, and the alternative (partial artifact written pre-stream) risks misleading a reader into thinking the request actually went out as recorded.
- **Reusing the `DEBUG=1` env var.** `DEBUG === "1"` at `apps/cli/src/index.ts:25` already gates the `prompt.cache_usage` debug emission. A second env var (`KEPPT_DEBUG_REQUESTS=1`) would split control over what is conceptually one toggle ("developer-visibility mode"). Reused for symmetry. If the artifact ever needs an independent toggle (e.g. cache-usage stays on but artifacts get noisy in a long session), split then — not pre-emptively, per [[feedback_phase1_pragmatism]].

---

## Task 4.3: Tool-result reminder + GTD-prompt sharpening (R2/R9 + R14–R16)

> **Post-created 2026-05-19.** Dogfooding session `<vault>/.keppt/logs/sessions/2026-05-19/turn-003.json` exposed two parallel failures with Haiku 4.5: (1) state drift — after three task-file writes the R4 crosscheck never ran, leaving "Gassi gehen / Wäsche waschen / Wäsche bügeln" duplicated across `inbox.md`, `next-actions.md`, and `focus.md`; (2) reflex-correction — on the user's follow-up "ist das richtig?" about a Daily-Plan state that was actually R3/R9-compliant, Haiku reverted to a non-checkbox bullet list and apologised. Diagnosis after design discussion: deterministic enforcement (engine-side crosscheck, semantic ops, hidden synthetic messages, restricted tool sets) was deliberately rejected as over-engineering for Phase 1 — model choice (Sonnet 4.6 or DeepSeek V4 as candidate replacements for Haiku) is the realistic compliance lever, and the engine adds only a minimal salience hint. Five prompt edits close rule gaps the same turn exposed.
>
> Scope is deliberately tight — one code-side change plus targeted prompt edits. The richer Weekly-Review content from the user's personal vault `CLAUDE.md` is split out into Task 7 (deferred placeholder), because it only matters during review sessions and would bloat the always-cached system head.

### Instructions

**`packages/core/src/gtd-layout.ts` (modified):**
- Export `isCanonicalTaskFile(filePath: string, today: string): boolean` — returns `true` for the five `TASK_FILES` entries and for `daily/${today}.md`, `false` otherwise. Shape mirrors `canWrite`'s decision but without throwing on invalid paths (the helper runs on already-validated paths from the tool layer and must not change the tool's error surface). Single source of truth so `writeFileTool` and `editFileTool` cannot drift from each other or from the existing write allowlist.

**`packages/core/src/tools.ts` (modified):**
- Extend `WriteFileResult.ok` variant: `{ ok: true; reminder?: string }`. `reminder` is set only when the write succeeds AND `isCanonicalTaskFile(filePath, today)` returns true.
- Extend `EditFileResult.ok` variant: `{ ok: true; reminder?: string }`. Same condition.
- Reminder text (constant, byte-stable for snapshot testing — define once at module scope, do not template per call):

  ```
  Task-relevant file modified. Before producing your final response,
  verify R2/R3 invariants across the affected lists.
  ```

- Place the reminder set on the success-path return only, after `repo.write` / `repo.edit` resolves. Error paths return unchanged — the reminder is meaningless if the write didn't land.
- No change to the failure variants. No change to `ReadFileResult`. No change to `searchFilesTool` / `listFilesTool`.
- The Vercel AI SDK's tool-result serializer passes the full `EditFileResult` / `WriteFileResult` to the model. No additional wiring needed: the new `reminder` field shows up in the tool-result block automatically.

**`packages/core/src/system-prompt.ts` (modified):**

- **Opening line** — change from:

  > `You are the user's GTD assistant for an Obsidian vault. The tools (read_file, edit_file, write_file, list_files, search_files) are your only access to it. Follow R1–R13.`

  to:

  > `You are the user's task and note assistant working in an Obsidian vault. The vault follows a structured method (R1–R16 below) — apply it silently. Most users do not know GTD; do not introduce the method, its terminology, or rule names unless asked. The tools (read_file, edit_file, write_file, list_files, search_files) are your only access to the vault.`

- **R2 — Inbox semantics**: prepend a sentence before the existing Flow line clarifying that Inbox is *not* the default capture target. Final shape:

  > `## R2 — Single-location invariant  [R2]`
  > `A task lives in exactly one place. Move, don't copy. **Exception:** Focus and Next Actions may carry the same task (Focus is the weekly prioritization of a Next-Actions item) — mirror any change in one to the other.`
  > ``
  > `**Inbox is for unclear or half-formed capture only** — ideas, "muss ich noch sortieren", things that need processing before they're actionable. Specific, actionable tasks with a clear category go directly to Next Actions; skip Inbox. Flow only applies when the task starts unspecified: new (unclear) → Inbox; processed → Next Actions; prioritized → also Focus; blocked → Waiting (remove from Focus + Next Actions); no time pressure → Someday Maybe; done → check off / remove everywhere.`

- **R4 — Slim**: replace the five-step protocol with a one-paragraph version that delegates the operational mechanics to the tool result's `reminder` field. Final shape:

  > `## R4 — Crosscheck on task operations  [R4]`
  > `Read affected lists before any create/complete/move/status change — never work from memory. Successful writes/edits to canonical task files (the five `tasks/*.md` and today's `daily/YYYY-MM-DD.md`) return a `reminder` in the tool result; honour it before producing your final text. The crosscheck verifies: task in exactly one place (Focus↔Next-Actions exception aside); Waiting removes from Focus + Next Actions; Done removes from Focus + Next Actions + Waiting; change in one of Focus/Next-Actions mirrors into the other; Inbox + Someday Maybe NOT checked here. Report deviations to the user — better over-report than let drift slip through.`

- **R9 — Daily-Plan checkbox clarity**: extend the Plan-section description so the format is unambiguous. Final shape:

  > `## R9 — Daily note format  [R9]`
  > `Three sections: **Plan** (today's intent — items pulled from Focus/Next Actions + transient daily tasks; same checkbox format as the source lists, `- [ ]` / `- [x]`; the Plan's checkbox state is the day's provisional view, canonical status lives in Focus/Next Actions and is reconciled on sync), **Log** (chronological, timestamped), **Notes** (free).`

- **R14 — Voice input** (new, append after R13):

  > `## R14 — Voice input tolerance  [R14]`
  > `User messages may be dictated via speech-to-text (Whisper et al.). Tolerate typos, missing punctuation, run-on sentences, and homophone confusions. When a task name, project reference, or wikilink target seems ambiguous or possibly misheard, ask one short clarifying question before committing to a file write — better to confirm than to invent.`

- **R15 — User skepticism ≠ correction mandate** (new):

  > `## R15 — User skepticism is a question  [R15]`
  > `When the user asks "is X right?" / "stimmt das?" about a state you just produced, re-check against R1–R14 before changing anything. If the state is compliant, explain the rule briefly; do not "fix" a compliant state. If non-compliant, fix and acknowledge explicitly.`

- **R16 — No method evangelism, no anchor citations** (new):

  > `## R16 — No method evangelism  [R16]`
  > `Behave like a task assistant, not a tutorial. Don't volunteer explanations of the system, GTD vocabulary, or rule names. **Never surface the internal anchors `[R1]`–`[R16]` or `[T-C1]`–`[T-C6]` in user-facing text** — they are for engineering only. When referring to lists, use them as plain nouns ("Focus", "Next Actions") without framing them as method concepts. Explain the system only when the user explicitly asks ("how does this work?", "warum landet das in Inbox?").`

- Recompute the R-anchor sweep test (see Acceptance below): the loop bound moves from `i <= 13` to `i <= 16`.

### Acceptance

Vitest suite green:

- **T4.3-AC-01:** `writeFileTool` against `tasks/inbox.md` (within `canWrite`) returns `{ ok: true, reminder: "Task-relevant file modified. Before producing your final response, verify R2/R3 invariants across the affected lists." }`. The reminder string is byte-identical to a constant exported from (or pinned to) `tools.ts`.
- **T4.3-AC-02:** `writeFileTool` against each of `tasks/focus.md`, `tasks/next-actions.md`, `tasks/waiting.md`, `tasks/someday-maybe.md`, and `daily/${today}.md` returns the same reminder.
- **T4.3-AC-03:** `editFileTool` returning `{ ok: true }` for the same paths attaches the same reminder string.
- **T4.3-AC-04:** `writeFileTool` against an archive path (e.g. `archive/daily/2026-05-01.md`) returns `out_of_scope` unchanged — the reminder concept doesn't apply because the write didn't land.
- **T4.3-AC-05:** `writeFileTool` against a future daily note (e.g. `daily/${today+1}.md` once Task 5.6 lands) attaches no reminder — the helper matches only today's daily note, mirroring `canWrite`'s "today only" predicate.
- **T4.3-AC-06:** Error variants of both tools (`out_of_scope`, `invalid_path`, `match`, `retry_budget_exhausted`) carry no `reminder` field — the field is success-path-only.
- **T4.3-AC-07:** `isCanonicalTaskFile` unit tests: returns true for the five `TASK_FILES` entries and for `daily/${today}.md`; false for `archive/daily/...`, `notes/foo.md`, future daily notes, and any path outside the GTD allowlist. Does not throw on inputs `canRead`/`canWrite` would reject (it never sees them — the helper runs on validated paths).
- **T4.3-AC-08:** System prompt contains all 16 R-rule anchors (`[R1]` through `[R16]`) and still all 6 T-C anchors. The existing `for (let i = 1; i <= 13; i++)` test bound moves to 16; the T-C loop is unchanged.
- **T4.3-AC-09:** System prompt opening line contains the phrase `"task and note assistant"` and does **not** contain `"GTD assistant"`.
- **T4.3-AC-10:** System prompt contains the phrase `"Inbox is for unclear or half-formed capture only"` (R2 sentinel), `"same checkbox format as the source lists"` (R9 sentinel), `"may be dictated via speech-to-text"` (R14 sentinel), `"User skepticism is a question"` (R15 sentinel), and `"Never surface the internal anchors"` (R16 sentinel). These pin the rule bodies against accidental future deletion.
- **T4.3-AC-11:** System prompt stays under the existing 8000-char hard cap (`expect(prompt.length).toBeLessThan(8000)`). The five new/expanded rules plus the softened opening add roughly +800–1000 chars; ample headroom remains.
- **T4.3-AC-12:** No regression in T4-AC-01, T4-AC-01b, T4-AC-02, T4-AC-03 of the existing `system-prompt.test.ts` — all four pass after the edits, only the `R*` loop bound changes.

### Key Locations

- `packages/core/src/gtd-layout.ts` (modified — export `isCanonicalTaskFile(filePath, today): boolean`)
- `packages/core/src/__tests__/gtd-layout.test.ts` (modified or new — unit tests for `isCanonicalTaskFile`)
- `packages/core/src/tools.ts` (modified — `WriteFileResult`/`EditFileResult` `ok` variant gains `reminder?: string`; `writeFileTool`/`editFileTool` set it on canonical paths; reminder constant defined at module scope)
- `packages/core/src/__tests__/tools.test.ts` (modified — `reminder` present/absent across success paths and across path classes; absent on all error paths)
- `packages/core/src/system-prompt.ts` (modified — opening line, R2 expansion, R4 slim-down, R9 expansion, R14/R15/R16 added)
- `packages/core/src/__tests__/system-prompt.test.ts` (modified — `for (let i = 1; i <= 13; i++)` becomes `i <= 16`; new sentinel-string assertions for R2/R9/R14/R15/R16 bodies; opening-line assertion)
- `packages/core/src/index.ts` (modified — if `isCanonicalTaskFile` is re-exported alongside `canRead`/`canWrite`)
- `docs/task-log/task-4.3-tool-reminder-and-prompt-sharpening.md` (post-implementation wrap-up)

### Key Discoveries

- **Reminder is a salience boost, not a determinism layer.** The design discussion explored deterministic alternatives (engine-side crosscheck with structured findings, hidden synthetic user messages, restricted-tool-set crosscheck tool, semantic ops replacing raw file primitives). All were rejected for Phase 1 because (a) the user's real task lists are large enough that Haiku-class compliance is likely the binding constraint regardless of engine guardrails, making model choice (Sonnet 4.6 / DeepSeek V4 candidates) the realistic lever, and (b) the deterministic options that survive scrutiny require solving task identity — string-match detection produces false positives on legitimately distinct same-text tasks ("Gassi gehen" at 06:00 vs. "Gassi gehen" at 18:00 are not necessarily duplicates). Reminder is the honest minimum that fits Phase-1 sizing.
- **R16 keeps the `[R*]` bracket anchors rather than renaming to XML.** Renaming to `<R1>...</R1>` would have been a stronger structural signal to the model that anchors are framing, not vocabulary, but it would force a sweeping test rewrite (every snapshot, every loop bound, every grep target) for a behavioural delta that R16's explicit prohibition is expected to cover. If empirical sessions after this task land still show anchors leaking into user-facing text, rename in a follow-up — not pre-emptively per `feedback_phase1_pragmatism`.
- **R2 framing was wrong, not just incomplete.** Pre-4.3, R2 said "Flow: new → Inbox; processed → Next Actions". In turn-003 Haiku followed that literally and routed three obviously-actionable tasks ("Gassi gehen", "Wäsche waschen", "Wäsche bügeln") through Inbox first, then forgot to clear it on the move. The fix isn't a stricter Inbox-cleanup rule; the fix is recognising that Inbox is the wrong destination for specific tasks in the first place. R2 now distinguishes "unclear capture (Inbox)" from "actionable capture (Next Actions directly)" — closes the rule gap rather than papering over the symptom.
- **R4 slim-down depends on the reminder existing.** Pre-4.3 R4 was a five-step prose protocol; post-4.3 it leans on the tool result to surface the obligation at the right moment. If the reminder gets pulled in a future refactor, R4 will lose its operational anchor and need to be re-expanded. The two changes are mechanically coupled even though they sit in different files — the tool result and the prompt rule reference the same word ("reminder") deliberately.
- **Sentinel-string assertions in tests, not full snapshots.** The plan deliberately avoids `toMatchSnapshot` against the full system prompt because every prompt iteration would regenerate the snapshot and lose the assertion power. Instead each new/changed rule gets one short sentinel substring (e.g. `"Inbox is for unclear or half-formed capture only"`) that pins the rule body against accidental deletion without locking the surrounding phrasing.
- **Opening-line framing matters more than rule body.** In turn-003 Haiku used phrases like "Excellent question!" and "lass mich R3 nochmal erklären" — both signatures of a model primed to perform tutorial competence. The pre-4.3 opening line "You are the user's GTD assistant" reinforces that priming. The post-4.3 opening ("task and note assistant ... apply it silently ... most users do not know GTD") rewires the persona before any rule fires. R16 catches the residual cases; the opening line catches the default tendency.
- **Why not also port the Vault's Weekly-Review detail here.** The user's personal vault `CLAUDE.md` carries ~200 prompt tokens of richer Weekly-Review choreography (group Waiting by theme, propose-don't-walk for Next Actions, end-of-review self-reflection). Folding it into R7 here would inflate the always-cached system head for content that matters in ~1% of turns. Split into Task 7 with an open delivery question (dedicated `weekly_review` tool returning the protocol on call vs. context-note injection vs. mode-specific header).

### Open question — `session-gap` context note (deferred; Task-6 trigger)

> **Captured 2026-05-20** from a chat-side design discussion. Not implemented. Captured here so Task-6 dogfooding can decide empirically per [[feedback_phase1_pragmatism]].

**The question.** Should the engine annotate user messages (or the current turn) with a note when the wall-clock gap to the previous user turn is large enough that the model would otherwise treat a stale conversation as still-fresh? E.g. *"Letzter Turn: 2026-05-18 21:14 (vor 2 Tagen)."*

**Why this is a real question for GTD specifically.** Time is load-bearing in this product ("push das auf Freitag", "wir haben das vorgestern besprochen", weekly-review marker logic). `today: Date` in the system prompt (`packages/core/src/system-prompt.ts:41`) covers same-day usage, which is ~95% of expected turns in single-user Phase 1. The residual case is sessions that span days or have multi-hour gaps mid-session — there the model can't distinguish "vor 2 Minuten gesagt" from "Montag gesagt, jetzt ist Donnerstag" from the history alone. Whether this actually bites is unknown until dogfooding evidence exists.

**Default position: don't ship now.** Industry norm (Claude.ai, ChatGPT, Cursor) is *not* to per-message-stamp. Adding it speculatively would burn the [[feedback_phase1_pragmatism]] budget — the symmetric counterpart to the Task-4.3 reminder, which was *triggered* by a concrete `turn-003.json` failure, not by hypothesis.

**Design sketch (if Task 6 surfaces evidence).** Extend the `ContextNote` union in `packages/core/src/request-builder.ts:14` with `kind: "session-gap"`, fire it from inside `buildRequest` when the gap between the trailing user message's `messageCreatedAt` and "now" exceeds a threshold, render via `renderNotes` alongside `stale-files`. The existing `<context-note>` channel already attaches to the trailing user message and survives the prompt-cache contract — no new plumbing.

**Open sub-decisions to settle at task time.**
- **Threshold.** Any UTC day change? `> N hours`? Both OR-combined? ("Day change" aligns with the day-rollover concept already in `Session`; pure hour-threshold may matter more for an evening-resume-next-morning pattern.)
- **`now` parameter.** `buildRequest` currently takes `today: Date` (conceptually start-of-day UTC, see `system-prompt.ts:48`). Gap detection needs the wall-clock `turnNow` from `turn-loop.ts:63`. Either thread `now: Date` as a new field on `BuildRequestInput` (cleanest, mirrors what Phase-2a's `/api/chat` route would need anyway) or aliase `today` to mean both. The first is preferred — keeps `today` semantically unambiguous.
- **Rendering granularity.** Absolute timestamp + relative phrasing? Relative only? Localised to the user's TZ or kept UTC like the rest of the engine? (R14 already acknowledges voice-dictated input — natural-language phrasing on the gap note matches the rest of the prompt's voice.)

**Realistic sizing if it lands.** ~40 LOC code (union + detection + render + threading `now`) + ~50 LOC tests (gap-present, gap-absent, combined-with-stale-files cases). Roughly a Task-4.4-shaped follow-up — small but real, not a drive-by.

**Revisit trigger.** Watch Task-6 acceptance + the first one or two real multi-day or paused-and-resumed sessions. Concrete evidence shape that would justify implementation: a turn log where the model treated a stale prior turn as fresh and produced a wrong scheduling/Daily-Plan answer because of it (the GTD-equivalent of the `turn-003.json` finding that drove Task 4.3). Without that, leave deferred.

---

## Task 5: Daily-note lifecycle (R5) + clock injection

### Instructions

Automatic archiving on day change. Runs server-side (here: CLI-side) **before** every LLM request, so the LLM always sees a clean day-state.

**`packages/core/src/lifecycle.ts`:**
```ts
export async function runDailyLifecycle(
  repo: FileRepository,
  today: Date,
): Promise<{ archivedPaths: string[]; createdTodayPath: string | null }>;
```

- `todayIso = YYYY-MM-DD` from the passed-in `today`
- `existing = await repo.list('daily/')` (only direct children, no subfolders)
- For each `daily/YYYY-MM-DD.md` with `date < today`:
  - `content = await repo.read(file)`
  - Remove open checkboxes `- [ ]` in lines (exactly: lines starting with optional whitespace + `- [ ]` are dropped — not struck through, simply gone)
  - In the log section at the end of the note: append `- Archived on ${todayIso}: open items removed (→ replan manually)` if open items were removed
  - `- [x]` lines stay
  - Write to `archive/daily/YYYY-MM-DD.md` via `repo.write(newPath, newContent, 'Archived daily note')`
  - **Delete semantics:** since `FileRepository` has no `delete`, the old `daily/YYYY-MM-DD.md` is replaced via an **explicit move**. Extend the interface with `move(from, to, changeSummary)` — simple read + write(to) + delete(from). Implementations:
    - `LocalFileRepository.move`: `fs.rename` + history entry with `contentBefore`/`contentAfter`
    - `InMemoryFileRepository.move`: rename in the map + history
  - History entry with `changeSummary: 'Archived daily note YYYY-MM-DD'` and `changedBy: 'system'`
- If `daily/${todayIso}.md` does not exist: `repo.write('daily/' + todayIso + '.md', '', 'Created new daily note for today')` with `changedBy: 'system'`
- Return object for logging/tests

**Clock injection:**
- `runDailyLifecycle` takes `today: Date` as a parameter — **never internal `new Date()`**
- CLI entrypoint:
  - Default: `today = new Date()` directly before every LLM request
  - Env override: `GTD_NOW_OVERRIDE=2026-04-25T09:00:00Z` → `today = new Date(env)` — for Task 6 E2E tests and manual day-change simulation
- Model router and system-prompt builder receive the same `today` value — single source of truth per request.

**CLI integration:**
- Before every `streamText` call: `await runDailyLifecycle(repo, today)`
- Checking only once per CLI run would be wrong — if the user leaves the CLI open across midnight, the change should be detected
- No crash if there is nothing to archive; the call is idempotent

### Acceptance

Vitest suite against `InMemoryFileRepository` + a mocked clock:

- **T5-AC-01:** **Scenario A — yesterday's note exists, today's missing:**
  - Before: `daily/2026-04-23.md` with mixed open `[ ]` + `[x]`
  - `runDailyLifecycle(repo, new Date('2026-04-24T09:00Z'))`
  - After: `daily/2026-04-23.md` is gone, `archive/daily/2026-04-23.md` contains content with `[ ]` lines removed + log note, `[x]` lines preserved, new empty `daily/2026-04-24.md` exists
  - History has 2 new entries
- **T5-AC-02:** **Scenario B — multiple old notes (user away for 3 days):**
  - Before: `daily/2026-04-21.md`, `daily/2026-04-22.md`, `daily/2026-04-23.md`
  - After: all three moved to `archive/daily/`, `daily/2026-04-24.md` is new
- **T5-AC-03:** **Scenario C — today's note already exists:**
  - Before: `daily/2026-04-24.md` with content
  - After: unchanged, no history entry, return `{ archivedPaths: [], createdTodayPath: null }`
- **T5-AC-04:** **Scenario D — idempotency:**
  - Second call with the same `today` → no mutation, no new history entries
- **T5-AC-05:** **Scenario E — open checkboxes with nested indentation:**
  - `  - [ ] Sub-task` (2 spaces of indent) → removed
  - `- [x] Done` → stays
  - `- Normal text` → stays

### Key Locations

- `packages/core/src/lifecycle.ts`
- `packages/core/src/file-repository.ts` (+ `move` method)
- `packages/core/src/local-file-repository.ts` (+ `move` impl)
- `packages/core/src/in-memory-file-repository.ts` (+ `move` impl)
- `packages/core/src/__tests__/lifecycle.test.ts`
- `apps/cli/src/index.ts` (+ `runDailyLifecycle` before every turn)

### Key Discoveries

- **Lifecycle runs server-side, not LLM-side.** The LLM gets a fully-archived day layout and doesn't have to handle the move (spec "Automatic day change").
- **Open checkboxes get deleted, not struck through.** The log entry documents the move; the detail of *what* was open lives in the `file_history` entry (`contentBefore`).
- **A new `move` primitive in the interface is cleaner than read+write+(missing delete).** Without `move`, the repo would not know it needs a second history line (one for delete of the source, one for create of the target). With `move` it's one semantically atomic entry.
- **Clock injection is more than test infrastructure.** The `GTD_NOW_OVERRIDE` env var also enables manual dogfooding tests ("what happens on Friday?") without changing the system date.

### Follow-up requirement: past-daily editability (deferred to this task's implementation)

Once archive/ exists, the prompt currently forbids edits to it (R6 "Past notes are read-only" + T-C3 `out_of_scope`). That conflicts with a realistic UX:

> User-Workflow: "Heute morgen schließe ich gestern Abend ab — ich habe Gassi gehen erst um 22 Uhr gemacht, das müsste in gestrigem Plan noch von `[ ]` auf `[x]` und einen Log-Eintrag bekommen."

Opus' reference rule (Lutz' personal `CLAUDE.md` Zeile 84) explicitly allows this: *"Wenn eine Daily Note eines vergangenen oder laufenden Tages objektiv falsche Kästchen/Einträge enthält, darf und soll Claude diese korrigieren."*

Enabling that requires four coordinated changes (do as part of this task or a follow-up slice):

1. **gtd-layout relaxation:** `archive/daily/YYYY-MM-DD.md` becomes writable. Other archive subdirectories (if added later) stay read-only. The layout predicate gets a per-subdirectory carve-out, not a blanket archive-write.
2. **Tool convention:** T-C3 wording loosens — `out_of_scope` is still by design, but `archive/daily/*` is no longer a permanent unwritable path; it's selectively writable.
3. **System-prompt rule:** R6 ("Past notes are read-only") needs to soften to "Past daily notes are read-only by default; explicit corrections are allowed when the past note is factually wrong (e.g. a task done late in the day was not checked off, an event happened that was not logged)." Consider whether this becomes a new R-rule or extends R6 — phrasing should make clear this is for *correction*, not for arbitrary edits.
4. **Crosscheck implication:** if a corrected past task `[x]` reflects something now actually done, R5 still applies — Focus/Next-Actions may need to be updated retroactively. The crosscheck should run after a past-daily correction the same way it runs after a today-daily edit.

Captured here so this task's archive mechanics don't accidentally lock out the editability story. Not in scope to *implement* in Task 5's core acceptance suite unless explicitly extended; the AC above (T5-AC-01..05) covers the archive-write path itself, which is the structural prerequisite.

---

## Task 5.5: Vault readiness on turn start (`ensureVaultReady`)

> **Post-created task.** Added after Task 5 was planned; refines and replaces parts of Task 5's design. Background: the per-turn clock fix (single `turnNow` threaded through prompt and `gtd-layout` predicates) exposed two adjacent gaps — (a) on a fresh vault the 5 GTD task files do not exist, so `read_file("tasks/inbox.md")` returns `FileNotFoundError`; (b) Task 5 pre-creates `daily/<today>.md` as an empty file, which over time fills `archive/daily/` with empty no-op notes for days the user never used the app. Both belong to the same "make the vault match the layout policy at the start of every turn" step.
>
> **Also closes a Codex adversarial-review finding from Task 3.5** (medium, verbatim):
>
> > **Stale daily notes become unreachable without rollover integration** (`apps/cli/src/index.ts:77-80`)
> >
> > The turn setup now only snapshots `turnNow` and builds the prompt from it; there is still no lifecycle/readiness call before the LLM tools run. At the same time, the new gate only allows `daily/${today}.md` and archived dailies, so an existing `daily/2026-05-07.md` left behind when the user opens the CLI on 2026-05-08 is filtered from `list_files`, excluded from active search, and rejected by `read_file` as `out_of_scope`. Because `rg` shows no implemented rollover/`ensureVaultReady` path, this change can make yesterday's real note inaccessible to the LLM until a manual move or a future task lands.
> >
> > *Recommendation:* Before shipping the gate, add an idempotent per-turn readiness step here using the same `turnNow` that moves stale `daily/YYYY-MM-DD.md` files into `archive/daily/`, or temporarily allow reads of date-formatted `daily/*.md` until that rollover path exists.
>
> Sequencing note: Task 3.5 (the gate) ships first with this finding deliberately deferred to 5.5 — the dev-only blast radius (single-user CLI, manual recovery available) does not justify holding 3.5 until 5.5 is ready. The acceptance test below labelled "Day rollover from yesterday" is the regression Codex asked for.

### Instructions

A single, idempotent vault-readiness step that runs **before every turn** (not just at app start) using the same `turnNow` value the prompt and tool gate already share. Long idle gaps (user away for days) are the exact reason this can't be an app-startup hook.

**`packages/core/src/vault-readiness.ts`:**
```ts
export async function ensureVaultReady(
  repo: FileRepository,
  today: string,            // YYYY-MM-DD, derived from the per-turn clock
): Promise<{ createdTaskFiles: string[]; archivedDailies: string[] }>;
```

What it does, in order:

1. **First-run task-file init.** For each of the 5 GTD task files (`tasks/inbox.md`, `tasks/focus.md`, `tasks/next-actions.md`, `tasks/waiting.md`, `tasks/someday-maybe.md`), if missing → create as empty (no heading, no frontmatter — the LLM adds structure on first write). Existing files are left untouched.
2. **Day rollover.** For each `daily/YYYY-MM-DD.md` whose date ≠ `today` → move to `archive/daily/<that-date>.md`, applying the same open-checkbox handling Task 5 already specifies (`- [ ]` lines removed, log line appended). Non-date entries in `daily/` (e.g. `daily/notes.md` someone manually dropped) are skipped.
3. **No pre-create of today's daily note.** This is the deliberate change vs. Task 5: `daily/<today>.md` is created lazily by the LLM's first `write_file`. Days the user never opens the app leave no empty archive entry.

Idempotency: a second call in the same turn is a no-op. The archive move skips when the target already exists (last-writer-wins on concurrent CLI sessions is fine — the content is the same).

System-actor history entries: every mutation done by `ensureVaultReady` is logged with `changedBy: 'system'`, not `'llm'`. `LocalFileRepository` already supports `changedBy` per-instance via `LocalFileRepositoryOptions`; the readiness call uses a separate system-actor handle (or a per-call override — to be decided in implementation, both are acceptable as long as the audit trail stays honest).

**CLI integration (`apps/cli/src/index.ts`):**

- Capture `turnNow = new Date()` at turn start (single source of truth — the per-turn clock fix).
- Call `await ensureVaultReady(repo, formatToday(turnNow))` **before** building the system prompt and tools.
- Then build prompt + tools using the same `turnNow`. Pass `turnNow` (or its string form) into `buildTools` so `canRead` / `canWrite` / `isInActiveScope` and `repo.search` all see the same date.

**Supersedes** the following pieces of Task 5:

- "If `daily/${todayIso}.md` does not exist: `repo.write(...)`" — removed. Lazy-create only.
- The `runDailyLifecycle` return shape changes to `{ createdTaskFiles, archivedDailies }`. The "createdTodayPath" field is gone.
- The function lives at `packages/core/src/vault-readiness.ts` (new name `ensureVaultReady`) rather than `lifecycle.ts`. If Task 5 lands first, rename and refactor; if 5.5 lands first, write directly under the new name.

The `move` primitive on `FileRepository` (Task 5's design) stays — readiness uses it for the rollover.

### Acceptance

Vitest suite against `InMemoryFileRepository` + a stub clock:

- **T5.5-AC-01:** **Fresh vault:** `ensureVaultReady(repo, '2026-05-08')` on an empty repo → 5 `tasks/*.md` files exist as empty strings, `daily/2026-05-08.md` does **not** exist, `archive/daily/` empty. Five history entries, all `changedBy: 'system'`.
- **T5.5-AC-02:** **Existing task files preserved:** seed `tasks/inbox.md` with `"- [ ] keep me\n"`, run readiness → file content unchanged, no history entry for it. Other 4 task files created.
- **T5.5-AC-03:** **Day rollover from yesterday:** seed `daily/2026-05-07.md` with mixed `[ ]`/`[x]`, run readiness with `today='2026-05-08'` → `daily/2026-05-07.md` gone, `archive/daily/2026-05-07.md` exists with `[ ]` lines removed + log line, `daily/2026-05-08.md` does **not** exist.
- **T5.5-AC-04:** **Multiple stale dailies:** seed `daily/2026-05-05.md`, `daily/2026-05-06.md`, `daily/2026-05-07.md` → all three moved, `daily/` empty afterwards, `daily/2026-05-08.md` not pre-created.
- **T5.5-AC-05:** **Today's daily already exists:** seed `daily/2026-05-08.md` with content → unchanged, not archived, no history entry.
- **T5.5-AC-06:** **Non-date file in `daily/`:** seed `daily/notes.md` → left in place, not archived, not treated as today's note.
- **T5.5-AC-07:** **Idempotency:** call twice with the same `today` → second call produces no history entries, no mutations.
- **T5.5-AC-08:** **System actor:** all mutations the readiness step performs log with `changedBy: 'system'`, never `'llm'`.
- **T5.5-AC-09:** One `LocalFileRepository` happy-path test against a temp directory confirms parity with `InMemoryFileRepository`.

### Key Locations

- `packages/core/src/vault-readiness.ts` (replaces `lifecycle.ts` from Task 5)
- `packages/core/src/file-repository.ts` (+ `move` method — already in Task 5 scope)
- `packages/core/src/local-file-repository.ts` (+ `move` impl, system-actor handle wiring)
- `packages/core/src/in-memory-file-repository.ts` (+ `move` impl)
- `packages/core/src/__tests__/vault-readiness.test.ts`
- `apps/cli/src/index.ts` (call `ensureVaultReady` before prompt/tools every turn)
- `docs/task-log/task-5.5-vault-readiness.md`

### Key Discoveries

- **First-run init and rollover share the same trigger and the same invariant owner.** Splitting them across two functions would just couple them implicitly forever — every caller has to remember to invoke both, in the right order, with the same `today`. One function, one place.
- **Lazy daily-note creation matters more than it sounds.** The "user logs in once a month" case is not a corner case for a personal GTD tool — pre-creating empty notes for unused days produces persistent noise in `archive/daily/` that the user has no way to clean up except manually.
- **Empty task files vs. files with headings.** The decision is "empty" because the LLM will add structure on first write anyway, and an Obsidian sidebar shows the file either way. A pre-baked `# Inbox` heading would also force a content-aware migration if we ever change the heading style.
- **Why this is a Task-5 follow-up, not a Task-5 amendment.** Keeping it as a separate dated task makes the design evolution legible: Task 5 captured what we knew at planning time; Task 5.5 captures what the per-turn clock fix surfaced. Future readers can see why the design changed.

---

## Task 5.6: Future daily notes (today + future drafts)

> **Post-created task.** Added 2026-05-10 after a CLI smoke-test surfaced that the LLM cannot read, write, list, or search a user-pre-created future daily note (`daily/2026-05-11.md` while today=2026-05-10). The current GTD layout gate (`canRead` / `canWrite` / `isInActiveScope` in `gtd-layout.ts`) is hard-locked to today's daily, which contradicts three established commitments:
>
> 1. **Spec ↔ code drift on `read_file`.** `architecture.md` line 1027 (pre-amendment) said `read_file` accepts `daily/YYYY-MM-DD.md` *(any date)*; the implementation only accepts today's. The architecture amendment in this CR aligns spec and code on the new "today + future drafts" rule.
> 2. **GTD ruleset, Active-Sync section.** *"If an urgent task lands in Focus, it also belongs in **today's/tomorrow's** Daily Note plan — and vice versa."* The "tomorrow's" verb is currently a dead path because `canWrite` rejects any future daily.
> 3. **GTD ruleset, Weekly-Review step 8.** *"Prepare the **next workday's Daily Note** — plan slot with top Focus items + day-specific appointments."* The closing action of every weekly review currently fails on the gate.
>
> Also closes a latent `search_files` exfiltration-shaped hole: future dailies fall through both `isInActiveScope` and `isInArchiveScope`, so even `scope: "all"` cannot surface them, breaking the "active ∪ archive covers everything `read_file` accepts" invariant.

### Instructions

A focused gate relaxation + system-prompt update + readiness-criterion adjustment. No new files, no new abstractions — the per-turn `today` string already in flight is sufficient because zero-padded `YYYY-MM-DD` makes lexical and chronological order identical, so a future check is a string compare.

**`packages/core/src/gtd-layout.ts`:**
- `canRead`: in addition to today's daily, accept any `daily/YYYY-MM-DD.md` whose date `>= today`. Past dailies in `daily/` (date `< today`) still return `false` — they belong in `archive/daily/` and the readiness step archives them.
- `canWrite`: same relaxation. The LLM may create or edit future drafts in `daily/`, but `archive/daily/` stays read-only.
- `isInActiveScope`: same relaxation. Required for security parity with `canRead` — if search surfaces a path read_file would deny, the gate becomes an exfiltration channel (the existing comment at the top of the function already states this invariant; the change preserves it for the new range).
- `isInArchiveScope`: unchanged (`archive/daily/*.md` only).
- The check uses **string comparison** on the captured date segment (`m[1] >= today`), not Date math — keeps the gate timezone-free and consistent with the single-clock invariant.

**`apps/cli/src/minimal-prompt.ts`:**
- Update the layout description so the LLM knows future drafts are in scope: `daily/YYYY-MM-DD.md` covers today and any pre-planned future dates.
- Mention the three Daily-Note sections (Plan / Log / Notes) so the LLM ergänzt the structure when its first `write_file` lands in a future draft that the user pre-created with only a calendar entry.

**`packages/core/src/vault-readiness.ts` (Task 5.5):**
- Change the rollover criterion in step 2 from `date ≠ today` to `date < today`. Future drafts (`date > today`) survive every readiness call. Once a future date *becomes* today (clock crosses midnight + next turn), the same `< today` comparison archives the previous day's note via the existing pipeline — no special "future becomes today" code path.
- If Task 5.5 ships first with the original `date ≠ today` wording, this task includes the criterion change in its diff. If Task 5.6 ships first, Task 5.5 is implemented directly with `date < today`.

### Acceptance

Vitest suite extending `gtd-layout.test.ts` and `vault-readiness.test.ts`:

- **T5.6-AC-01:** `canRead("daily/2026-05-11.md", "2026-05-10")` → `true`. `canRead("daily/2026-05-10.md", "2026-05-10")` → `true` (regression). `canRead("daily/2026-05-09.md", "2026-05-10")` → `false` (past stays out of `daily/`).
- **T5.6-AC-02:** `canWrite("daily/2026-05-11.md", "2026-05-10")` → `true`. `canWrite("archive/daily/2026-05-09.md", "2026-05-10")` → `false` (regression — archive remains read-only).
- **T5.6-AC-03:** `isInActiveScope("daily/2026-05-11.md", "2026-05-10")` → `true`. `isInActiveScope("daily/2026-05-09.md", "2026-05-10")` → `false`.
- **T5.6-AC-04:** Search-scope invariant: for any `daily/YYYY-MM-DD.md` path, `isInActiveScope(p, today) || isInArchiveScope(p)` is `true` after readiness has run (i.e. no path falls between active and archive). Property test over a small date range.
- **T5.6-AC-05:** `search_files(query, "active", today="2026-05-10")` includes hits in `daily/2026-05-11.md` when seeded.
- **T5.6-AC-06:** `list_files("daily/")` with today=2026-05-10 and seeded `daily/2026-05-10.md` + `daily/2026-05-11.md` returns both.
- **T5.6-AC-07:** `ensureVaultReady` with seeded `daily/2026-05-11.md` and today=`2026-05-10` leaves the future file untouched (no archive move, no `file_history` entry).
- **T5.6-AC-08:** Future-becomes-today self-heal: same seeded `daily/2026-05-11.md`, run readiness with today=`2026-05-12` → file moves to `archive/daily/2026-05-11.md` via the standard `< today` path.
- **T5.6-AC-09:** Today's daily that was originally pre-planned as a future draft (file already exists when its date becomes `today`): readiness leaves it alone; the LLM's `edit_file` succeeds (regression against AC-05 of Task 5.5).
- **T5.6-AC-10:** End-to-end CLI smoke (manual, recorded in the task log): user prompt "Trag den Tierarzttermin morgen ein" → LLM writes/edits `daily/<tomorrow>.md` without `out_of_scope` errors, and the file ends up with a `Plan` section containing the appointment.

### Key Locations

- `packages/core/src/gtd-layout.ts` (the three predicate functions)
- `packages/core/src/__tests__/gtd-layout.test.ts` (extend existing future/past blocks)
- `apps/cli/src/minimal-prompt.ts` (system-prompt wording)
- `packages/core/src/vault-readiness.ts` (rollover criterion `< today`)
- `packages/core/src/__tests__/vault-readiness.test.ts` (T5.6-AC-07/08/09)
- `docs/specs/architecture.md` (already amended in this CR — "Archive Layout & Lifecycle" callout, scope table, `search_files` behavior, tool-layer enforcement list)
- `docs/task-log/task-5.6-future-dailies.md` (to be created during implementation)

### Key Discoveries

- **Single-clock invariant + zero-padded `YYYY-MM-DD` makes future detection a pure string compare.** No Date math, no timezone surprises mid-turn. The same `today` string already shared between system prompt, tool gate, repository, and readiness step is sufficient for the new check — no new plumbing.
- **`isInActiveScope` covering future dailies is required for security, not convenience.** If search surfaces a path `read_file` would deny, the gate becomes an exfiltration channel (the comment at `gtd-layout.ts:36-40` is the existing in-tree justification of this invariant). Skipping the active-scope update would re-open exactly that hole in the opposite direction (`read_file` accepts but search drops).
- **Future → today → past is fully self-healing through the existing rollover pipeline.** No special-case code is needed for "future becomes today": the `< today` criterion does the right thing at every clock state.
- **The `scope: "all"` hole was a hidden dead zone, not just a missing feature.** Future dailies satisfied neither `isInActiveScope` nor `isInArchiveScope`, so they leaked out the bottom of the search filter. The new wording restores the `active ∪ archive = everything `read_file` accepts` invariant explicitly in the spec.

### Supersedes

- **Task 5.5 step 2** — rollover criterion `date ≠ today` → `date < today`. Existing acceptance test `T5.5-AC-04` stays valid (all seeded dates `2026-05-05`/`06`/`07` are `< today=2026-05-08`); T5.6-AC-07/08/09 add coverage for the new range.

---

## Task 6: End-to-end acceptance against real Claude API + vault

### Instructions

A scripted E2E harness that runs the CLI as a subprocess against the real Haiku API + a dedicated test vault. The first test that proves the entire stack works.

**`apps/cli/test-e2e/` structure:**
- `e2e.test.ts` — Vitest test file (should run with `describe.runIf(process.env.ANTHROPIC_API_KEY)`)
- `seed-vault.ts` — generates a fresh test vault in `$TMPDIR/gtd-e2e-vault-{uuid}/` with a known seed state
- `cli-harness.ts` — spawns `apps/cli` as a subprocess (via `execa` or node `child_process`), writes input, reads output
- `assertions.ts` — matcher library that asserts on file state + history log

**Seed vault:**
```
tasks/inbox.md:
- [ ] Old inbox note
- [ ] Idea: book about GTD

tasks/focus.md:
- [ ] Prep practice session
- [ ] Write VW quote
- [ ] Revise website copy

tasks/next-actions.md:
## Work
- [ ] Prep practice session
- [ ] Write VW quote
## Personal
- [ ] Make dentist appointment

tasks/waiting.md:
- [ ] Reply from Müller (since 2026-04-17)

tasks/someday-maybe.md:
- [ ] Paint garage door

daily/{today}.md: (empty)
```

**Scenarios (all assert on file state, not LLM text):**

1. **Read-only:** `"What's on for today?"` → CLI answers (stdout non-empty); no `file_history` entries with `changedBy: 'llm'` were created.
2. **Create in inbox:** `"New task: buy milk"` → `tasks/inbox.md` contains a new line with "milk" (case-insensitive substring); existing content intact.
3. **Move (single-location R2):** `"Move buy milk to next actions"` → no line in `inbox.md` with "milk", exactly one line in `next-actions.md` with "milk". Spec invariant R2 holds.
4. **Complete:** `"Check off buy milk"` → the line in `next-actions.md` is `[x]` or removed. No open "milk" entries remain.
5. **Soft-test inbox cleanup:** `"Clean up my inbox"` → number of open items in `inbox.md` is smaller than before; the difference appears either in `next-actions.md`, `waiting.md`, `someday-maybe.md`, or as `[x]`. **Property assertion:** sum of "open + done + archived" task strings stays the same (lost-task detector). No assertion on which category each item ends up in.
6. **Day change:** stop the CLI, set `GTD_NOW_OVERRIDE=2026-04-25T09:00:00Z`, restart, send any single user message → `archive/daily/{yesterday}.md` exists with yesterday's content (open items removed, log note present), new `daily/2026-04-25.md` exists.
7. **History-log check:** `.keppt/file-history.jsonl` contains one entry per mutating turn (scenarios 2-5 plus the lifecycle entries from 6).

**Test runtime and cost:**
- Test runs only when `ANTHROPIC_API_KEY` is set (`describe.runIf`), otherwise skip
- All turns use Haiku — the CLI is single-model in Phase 1 (router deferred; see Task 4 Router-removal note)
- Budget check: a full run should stay under 2 minutes and under ~$0.05
- On failure: **no automatic cleanup** of the test vault — `console.log` prints the path so the developer can inspect manually. Cleanup in `afterEach` only on success.

**Harness details:**
- CLI subprocess via `execa` with `PATH`, `VAULT_PATH`, `ANTHROPIC_API_KEY`, optionally `GTD_NOW_OVERRIDE`
- Input stream: per scenario write one line to stdin, then read stdout until the prompt `> ` reappears (ready indicator)
- Per-turn timeout: 30s (the agentic loop may need several tool calls)
- After all scenarios: `SIGINT` + `SIGINT` to terminate

### Acceptance

- **T6-AC-01:** `pnpm --filter cli test:e2e` is green when `ANTHROPIC_API_KEY` is set.
- **T6-AC-02:** Skip message is clearly visible when the key is missing ("skipped — set ANTHROPIC_API_KEY to run e2e").
- **T6-AC-03:** `README.md` contains one documentation line explaining how to run the test locally and how expensive it is.

### Key Locations

- `apps/cli/test-e2e/e2e.test.ts`
- `apps/cli/test-e2e/seed-vault.ts`
- `apps/cli/test-e2e/cli-harness.ts`
- `apps/cli/test-e2e/assertions.ts`
- `apps/cli/package.json` (+ `test:e2e` script)
- `README.md` (E2E section)

### Key Discoveries

- **LLM output is non-deterministic.** Assertions go **only** against filesystem state and `file_history`, never against exact LLM text. Allowed: rough string checks ("output contains 'milk'") for read-only scenarios.
- **R2 (single-location) is the strongest property assertion.** After every mutating turn: for any task string at most one open occurrence may exist (exception: focus ↔ next actions may duplicate).
- **Lost-task detector:** the sum of all unique task strings across all lists (incl. archived and done) is monotonically non-decreasing. If this invariant breaks, the system has lost a task — that is the core trust risk from the product spec.
- **Scenario 6 (day change) only works thanks to Task 5 clock injection.** Without `GTD_NOW_OVERRIDE`, day change would not be reproducibly testable.
- **The tests must be robust against model updates.** If Haiku answers differently in 6 months, the tests should still pass — hence property assertions instead of text matches.

---

## Task 7: Weekly Review interactive workflow (deferred placeholder)

> **Post-created 2026-05-19. Placeholder — not yet specced.** Captures the intent to port the richer Weekly-Review choreography from the user's personal vault `CLAUDE.md` into the keppt-app product so review sessions actually feel like a review and not a passive list-walk. Held out of Task 4.3 because the content is ~200 prompt tokens that only matter in ~1% of turns, and putting it in the always-cached R1–R16 head would bloat every regular turn for no benefit. To be designed and scheduled when Phase 1 acceptance (Task 6) is green and real-session feedback indicates the simpler Weekly-Review behaviour from current R7 is insufficient.

### What needs to land (content)

The Vault `CLAUDE.md`'s Weekly-Review section (see `/home/lutz/Dokumente/Lutz Vault/CLAUDE.md` "Weekly Review" — Schritte 1–9 plus the Pflicht-Hinweis) carries three behaviours that the current R7 collapses to a single sentence:

1. **Group-by-theme Waiting review.** Cluster Waiting entries thematically (Outreach, Geld/Carrier, Haus/Handwerker, Behörden, etc.) and ask **one** status question per cluster rather than walking each entry. User responds in a block; assistant executes the consequences (check off, move to Next Actions, generate nag-task, keep waiting).
2. **Propose-don't-walk for Next Actions → Focus.** Assistant reads Next Actions and surfaces a concrete proposal: 3–5 items for the new Focus plus a Leitmotiv for the week, derived from cash pressure, deadlines, and stale-but-stubborn items, with a one- to two-line justification each. User reacts with veto/swap/addition — assistant does **not** walk every NA entry.
3. **End-of-review self-reflection.** After the review steps, assistant explicitly reflects whether steps 2 and 5 (Waiting group review, Focus proposal) actually happened interactively or only as passive listing. If passive, the review was not complete — surface that.

Also worth folding in: the Vault's "PFLICHT: Token-Kosten sind akzeptabel"-framing, since Weekly Review is the one workflow where the user has explicitly authorised extra tokens for thoroughness.

### Open design question — how the content gets delivered

The keppt-app prompt budget is ~1K tokens target / <2K hard cap (cf. `system-prompt.test.ts` AC). Permanently embedding ~200 review-only tokens in R1–R16 would push the head toward the cap and dilute salience on every non-review turn. Three candidate mechanisms, no decision yet:

- **(a) Dedicated `weekly_review` tool that returns the protocol on call.** Model recognises "Weekly Review" intent (R10), calls the tool, gets the full multi-step protocol as the tool result, follows it. Pros: zero impact on the cached system head; the protocol only enters context when needed. Cons: introduces a tool whose only purpose is to return a string, which is structurally odd (tools are normally for side effects); model must remember to call it; an intent-mismatch (user said "review" colloquially without meaning Weekly Review) might fire the tool needlessly.
- **(b) Context-note injection on intent detection.** Same plumbing as the `stale-files` context-note (`packages/core/src/request-builder.ts:104` `attachContextNotes`) — extend the `ContextNote` union with `{ kind: "weekly-review-mode"; ... }`, fire it when the engine detects "Weekly Review"-class intent in the user message (Friday + relevant phrasing + R7 marker stale), and the rendered block carries the protocol. Pros: reuses an already-proven channel; detection logic stays in code, not LLM; salience peaks at the right turn. Cons: intent detection is a separate piece of code with its own correctness surface; the union starts to do many things.
- **(c) Mode-specific session header.** A user-typed command (or detected intent) flips the session into "weekly-review mode" for that session; the engine prepends an extra system block carrying the protocol. Pros: explicit, opt-in. Cons: new mode concept, new session field; user has to remember the command.

Decision deferred to the task itself. Likely (b) wins on consistency with the existing plumbing, but (a) wins on cache stability — the empirical answer depends on how often Weekly Review is invoked relative to ordinary turns.

### Open question — R7 R11/R12 reconciliation

Current R7 (current shape, pre- and post-Task-4.3) already carries the Marker-Date-Logic for "skip proposal inside current ISO week, propose if marker > 8 days old or missing". R11/R12 reference it. Adding the deeper protocol means deciding whether the protocol text replaces R7 entirely (it grows from one paragraph to ten) or sits alongside as a separately-triggered surface. The marker logic almost certainly stays in R7 because it's a date computation R11/R12 reference, but the step-by-step protocol probably moves to the new delivery channel.

### Out of scope for this placeholder

- The actual implementation of any of (a)/(b)/(c).
- The protocol's exact wording — port-then-tighten from the Vault, but the wording lives in the eventual task plan, not here.
- Any code changes. This is intent-capture only.
- LinkedIn-Posts integration from the Vault — that's vault-specific user content, not product behaviour.

### When to schedule

After Task 6 (real-API acceptance) lands and one or two real Weekly-Review sessions have been run against the current R7 — if those sessions feel passive/list-walking rather than interactive, this task takes priority over the next planned feature. If the simpler R7 actually feels adequate in real use, this task can be deprioritised or merged into a future "review polish" pass.

---

_Plan created: 2026-04-24. Based on architecture spec v1 + Vercel SDK research v1._
