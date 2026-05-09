# Plan — Phase 1: CLI ("It works in the terminal")

> Spec: [`docs/specs/architecture.md`](../specs/architecture.md) (Build Milestones → Phase 1) + [`docs/specs/product.md`](../specs/product.md)
> SDK research: [`docs/specs/vercel-sdk.md`](../specs/vercel-sdk.md)

## Scope

Local CLI that runs end-to-end against the user's own Obsidian vault as a `LocalFileRepository`. Vercel AI SDK with Claude (Haiku + Sonnet), 5 tools, system prompt R1-R13, one session per day, daily-note lifecycle. **No server, no Supabase, no auth, no tier check.** Goal: validate the GTD prompts and the tool loop under realistic conditions.

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
3.6. Per-message retry budget for `edit_file` (`retry-budget.ts` + tool-layer wrapper) — Task-3 follow-up, post-created 2026-05-09 from a comparison review against an autonomous-agent build. Caps repeated `edit_file` failures on the same file within one user message at 2; 3rd attempt short-circuits to `retry_budget_exhausted`. See `docs/task-log/task-3.6-retry-budget.md`.
3.7. Path-safety expansion (8 → 13 attack vectors): drive letters, segment trailing dots/whitespace, length caps, reserved Windows names, runtime symlink-escape check in `LocalFileRepository` — Task-3 follow-up, post-created 2026-05-09 from the same comparison review. See `docs/task-log/task-3.7-path-safety.md`.
4. System prompt R1-R13 + request builder + tool-result pruning + model router + session persistence + input heuristic + prompt caching
5. Daily-note lifecycle (R5) + clock injection
5.5. Vault readiness on turn start (`ensureVaultReady`: first-run task-file init + day rollover) — Task-5 follow-up, post-created after planning. Closes the gap that the original Task 5 left first-run task files non-existent and pre-created empty daily notes the user may never use, **and** closes the Task-3.5 follow-up Codex finding (medium): without rollover, the new `canRead` gate makes a stale `daily/<yesterday>.md` unreachable to `list_files`/`search_files`/`read_file` until rollover runs. See `docs/task-log/task-5.5-vault-readiness.md`.
6. End-to-end acceptance against real Claude API + vault

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

- Vitest suite in `packages/core` green:
  - `LocalFileRepository` against a temp directory: read/write/list/search happy paths + read-on-missing-file throws the defined error
  - `InMemoryFileRepository` against the same scenario (parameterized over the same tests)
  - Write produces a correct history entry in `.keppt/file-history.jsonl`
  - Search finds hits across multiple files, respects scope (`active` vs. `archive` vs. `all`)
- `pnpm -r build` green
- `pnpm -r test` green

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

- Single-edit happy path: 1 hit → applied, history entry written, returns `{ ok: true }`
- Multi-edit happy path (3 edits, all unique): all three applied, **one** history entry
- `matchCount === 0`: returns `{ ok: false, error: { matchCount: 0, currentContent, failedSearch } }`, file unchanged, **no** history entry
- `matchCount > 1`: returns `{ ok: false, error: { matchCount: 2, ... } }`, file unchanged
- Atomicity: with 3 edits, if the 2nd is ambiguous → not a single edit is written
- Overlapping edits (edit 2's search is destroyed by edit 1's replace) → clean error, file unchanged
- `LocalFileRepository` again with a temp directory: one happy-path test to ensure the implementation behaves identically

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

- **Manual smoke test** (documented in the PR/commit message as a transcript) against a real test vault + the real Haiku API:
  1. `> List my tasks` — LLM calls `list_files({ prefix: 'tasks/' })` + `read_file(...)` and answers sensibly
  2. `> New task: buy milk` — LLM calls `edit_file` on `tasks/inbox.md`, new line appears
  3. `> Check off buy milk` — LLM finds the task, sets `[x]` or removes it
  4. `> What's on for today?` — LLM reads focus + today's daily note and answers
  5. Ctrl+C during stream: stream cancels, prompt returns

- **Vitest integration test** with `MockLanguageModelV4` (`ai/test`):
  - Script a 3-step tool chain: (1) `list_files` → (2) `read_file` → (3) text response
  - Repo is `InMemoryFileRepository` with predefined state
  - Assertion: after the run the expected tool calls were made **in the right order**; the last step contains the expected text
  - Second test: simulated `edit_file` ambiguity → LLM gets `{ ok: false, error: ... }` as tool result → second `edit_file` call with extended search → successful apply

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

## Task 3.6: Per-message retry budget for `edit_file`

> **Post-created task.** Added 2026-05-09 after a comparison review against an autonomous-agent build of the same plan. The current stop condition is `stopWhen: isStepCount(10)` (Task 3) — that bounds total steps but not the specific "LLM retries the same SEARCH/REPLACE three times in a row on the same file" pattern. Each retry round-trips a full `currentContent` snapshot, so the third attempt is paying twice for the second's failure context.
>
> Lives at the tool layer wrapping `edit_file` — the SEARCH/REPLACE engine in `edit.ts` stays a pure planner with no awareness of LLM-loop history.

### Instructions

**`packages/core/src/retry-budget.ts`:**
```ts
export interface RetryBudgetStore {
  registerFailure(messageId: string, filePath: string): number; // post-increment count
  isExhausted(messageId: string, filePath: string): boolean;    // count >= maxFailures
  resetMessage(messageId: string): void;
}
export function createInMemoryRetryBudget(maxFailures = 2): RetryBudgetStore;
```

- Counter keyed on `(messageId, filePath)` — failures on different files in the same message have independent budgets.
- New `messageId` → no entries → counter starts at 0.
- A **success** does NOT decrement / reset the counter (one bad turn shouldn't be rescued by an unrelated success on the same file later in the message).

**`tools.ts` — wrap `edit_file`:**
- Extend `BuildToolsOptions`: `{ now, retryBudget, messageId }`.
- In `edit_file.execute`: before delegating to `repo.edit`, check `retryBudget.isExhausted(messageId, filePath)`. If true, short-circuit:
  ```ts
  return {
    ok: false,
    error: { reason: "retry_budget_exhausted", currentContent: await repo.read(filePath) },
  };
  ```
- After `repo.edit`: if `result.ok === false`, call `retryBudget.registerFailure(messageId, filePath)`. Successes do nothing.

**CLI integration (`apps/cli/src/index.ts`):**
- One `RetryBudgetStore` per CLI process (`createInMemoryRetryBudget()` once at startup).
- Fresh `messageId = crypto.randomUUID()` per user input, passed into `buildTools` for that turn.
- Optional: call `retryBudget.resetMessage(previousMessageId)` to free memory; not required for a single-user session.

### Acceptance

Vitest suite against `InMemoryFileRepository` + a spy `repo`:

- **Single-file exhaustion:** seed `tasks/inbox.md`, three `edit_file` calls with the same `messageId` and a non-matching `search`. Calls 1 and 2 return `search_not_found`; call 3 returns `retry_budget_exhausted` with `currentContent` populated. File unchanged after all three. No history entry from call 3.
- **Per-file scope:** with `failedAttempts = 2` on `tasks/inbox.md` under `msg-1`, a failing `edit_file` on `tasks/focus.md` under the same `msg-1` returns `search_not_found`, NOT `retry_budget_exhausted`.
- **`messageId` reset:** after exhausting on `tasks/inbox.md` under `msg-1`, the same call under `msg-2` returns `search_not_found` (counter for `msg-2` = 1).
- **Success on file B doesn't reset failures on file A:** with `failedAttempts = 1` for inbox under `msg-1`, a successful edit on focus does not change inbox's counter — the next inbox failure becomes `failedAttempts = 2`.
- **Short-circuit doesn't call `repo.edit`:** assert via spy that `repo.edit` is not invoked when `isExhausted` returns true (and therefore no history entry is appended).

### Key Locations

- `packages/core/src/retry-budget.ts`
- `packages/core/src/tools.ts` (+ wrap `edit_file`, extend `BuildToolsOptions`)
- `packages/core/src/__tests__/retry-budget.test.ts`
- `apps/cli/src/index.ts` (+ allocate budget once, fresh `messageId` per turn, pass to `buildTools`)
- `docs/task-log/task-3.6-retry-budget.md`

### Key Discoveries

- **Per-message, not per-session.** What we cap is intra-turn looping after a structured-error feedback didn't help. A long session with many distinct asks is fine.
- **Wrap, don't entangle.** Retry tracking is a tool-layer concern. The SEARCH/REPLACE engine stays pure — easier to test, easier to reuse.
- **Re-include `currentContent` on the short-circuit.** The LLM may not have it in its working context anymore by the third attempt; one extra `repo.read` is cheap and gives the next user message a clean starting point.

---

## Task 3.7: Path-safety expansion (8 → 13 attack vectors)

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

- **Static rejections (table-driven, runs against both repos):** ≥1 example per vector #1–#12 throws `InvalidPathError` with the documented `reason`. Examples for the new five:
  - `"C:foo.md"` → drive letter
  - `"tasks/foo.md "` → trailing whitespace
  - `"tasks/foo.md."` → trailing dot
  - `"a".repeat(5000) + ".md"` → length cap (total)
  - `"tasks/" + "a".repeat(300) + ".md"` → length cap (per-segment)
  - `"tasks/CON.md"`, `"daily/nul.md"`, `"tasks/com1.md"` → reserved device name (case-insensitive)
- **Symlink escape — file (LocalFileRepository, temp dir):**
  - Setup: vault at `$tmp/vault`, secret at `$tmp/secret.md`, `fs.symlink($tmp/secret.md, $tmp/vault/tasks/escape.md)`.
  - `repo.read("tasks/escape.md")` throws `InvalidPathError { reason: "symlink escapes vault root" }`.
- **Symlink escape — directory:**
  - `fs.symlink($tmp, $tmp/vault/tasks/escape-dir)`, then `repo.read("tasks/escape-dir/secret.md")` throws.
- **Symlink escape — write to non-existent file under symlinked parent:**
  - With the directory symlink above, `repo.write("tasks/escape-dir/new.md", "...", "x")` throws (parent realpath check fires before the write).
- **In-vault symlinks stay legal** (smoke test, drop if it overcomplicates the contract): a symlink whose target stays inside the vault resolves cleanly. Not a current use case — included only to prove the check isn't over-eager.

### Key Locations

- `packages/core/src/file-repository.ts` (+ static checks #9–#12 in `validateFilePath`)
- `packages/core/src/local-file-repository.ts` (+ `resolveSafe`, route I/O through it)
- `packages/core/src/__tests__/file-repository.contract.ts` (+ parametrized rejection table for #1–#12)
- `packages/core/src/__tests__/local-file-repository.test.ts` (+ symlink-escape scenarios)
- `docs/task-log/task-3.7-path-safety.md`

### Key Discoveries

- **Symlink escape is the one vector with real teeth on a personal-vault CLI.** The others are defense-in-depth. Without #13, the LLM could write through a symlink it doesn't know exists — write-amplification through an attacker-controlled link is low probability but high blast radius on a system that holds the user's `~/.ssh/`.
- **Static + runtime split.** #9–#12 are syntactic and live in the shared validator (`InMemoryFileRepository` inherits them via the contract test for free). #13 needs filesystem state and lives in `LocalFileRepository` only.
- **No URL-decoding anywhere.** We never `decodeURIComponent` paths, so `%2e%2e/etc` is opaque text and treated as an unknown filename, not traversal. Worth documenting as an explicit non-vector to prevent future "should we add this?" reopening.
- **Trailing-dot rejection > trailing-dot normalization.** Stripping trailing dots silently would let two LLM messages addressing `foo.md` and `foo.md.` accidentally collide. Rejection makes the LLM see the structured error and adjust the next message.

---

## Task 4: System prompt R1-R13 + request builder + tool-result pruning + model router + session persistence + input heuristic + prompt caching

### Instructions

The "productization pass" over Task 3. The inline code from Task 3 gets refactored into clean core modules, and everything that's missing for MVP quality gets added.

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
- Keep prompt length in mind (~1K tokens target, hard <2K)

**`packages/core/src/request-builder.ts`:**
- Export `buildRequest(opts: { repo, today, profile, messages, userMessage })` → `{ system, messages, tools, ... }`
- Loads active files synchronously: `tasks/*.md` + `daily/YYYY-MM-DD.md` (if present)
- Builds either a single "active state" system addendum message or injects the files as initial-context prefix in `system` — decision based on prompt caching (see below)
- Calls `buildSystemPrompt` + appends profile + active files
- Calls `pruneToolResults` on the `messages` history
- Appends the new user message

**`packages/core/src/tool-result-pruning.ts`:**
- Export `pruneToolResults(messages: ModelMessage[], k: number): ModelMessage[]`
- Iterate `messages` backwards. The last K `tool`-role messages stay untouched. All older `tool` messages are transformed as follows:
  - For each `tool-result` content part: `output` is replaced by the stub string: `[Previous ${toolName} result — superseded by current state; re-read if needed]`. `toolCallId` and `toolName` are preserved.
  - `tool-error` parts stay untouched (error info may remain relevant for the LLM).
- `user` and `assistant` messages (incl. `tool-call` parts!) are **never** modified.
- K from MVP spec: 5.

**`packages/core/src/model-router.ts`:**
- Export `routeModel(userMessage: string): 'haiku' | 'sonnet'`
- Keyword/regex-based for MVP:
  - Sonnet keywords: "plan", "clean up", "review", "prioritize", "important", "plan tomorrow"
  - Everything else → Haiku
- No throw on uncertainty — default is Haiku
- Tests cover edge cases

**Session persistence:**
- `packages/core/src/sessions.ts`: `loadOrCreateSession(repo, today)` / `appendMessages(session, new)` / `saveSession(repo, session)`
- Session storage: `basePath/.keppt/sessions/YYYY-MM-DD.json` with `{ date, messages: ModelMessage[] }`
- CLI loads today's session at startup, writes after each turn
- Session switching (continuing a past session) is **not** MVP — it's not in Phase 1

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
- `apps/cli/src/index.ts` now uses `buildRequest` + `routeModel` + session persistence + input validation
- The minimal stub prompt from Task 3 is removed

### Acceptance

Vitest suite green:
- `buildSystemPrompt({ today: new Date('2026-04-24') })` contains `"Today is Friday, 24. April 2026"` and all R1-R13 marker strings (each rule gets a unique anchor in the prompt — the test checks all 13 anchors)
- `pruneToolResults`:
  - K=5, 10 tool messages → oldest 5 become stubs, newest 5 stay identical
  - user/assistant messages untouched (incl. assistant messages that contain `tool-call` parts)
  - A message with mixed parts (text + tool-call in assistant): unchanged
  - tool-error parts preserved
- `routeModel`:
  - "Plan my day" → sonnet, "New task: milk" → haiku, "Clean up the inbox" → sonnet, "Check off X" → haiku
- Session roundtrip:
  - `loadOrCreateSession` in an empty vault → new session file
  - Append + save → load returns identical messages
  - New day → new session file (old one stays)
- Input validation:
  - 2001 chars → reject
  - 2000 chars of normal language → accept
  - `function foo() { return 1; }` paste with 50 lines → reject
  - Normal task "New task: write VW quote" → accept

**Manual smoke test** (documented in the PR): 3 turns against the real vault — the first produces cache writes, the second cache reads (observable in the debug log), the third cache reads as well. A "Plan my day" message routes to Sonnet (visible in the debug log).

### Key Locations

- `packages/core/src/system-prompt.ts` (+ possibly `system-prompt.template.md` as a file imported at compile time)
- `packages/core/src/request-builder.ts`
- `packages/core/src/tool-result-pruning.ts`
- `packages/core/src/model-router.ts`
- `packages/core/src/sessions.ts`
- `packages/core/src/input-validation.ts`
- `packages/core/src/__tests__/` — one test file per module
- `apps/cli/src/index.ts` (refactored)

### Key Discoveries

- **Prompt caching is manual.** The SDK caches nothing automatically. The `cacheControl` marker defines the end of the cached block. Phase 1 strategy: a single marker on the `streamText` call that flags everything up to that point (system + tool definitions) as cacheable. End-of-message markers via `prepareStep` (for message-history caching) is a Phase 2 topic.
- **Tool-result pruning only transforms `role: 'tool'` messages.** Assistant messages with `tool-call` parts stay untouched (they show "a call happened", which matters for context — only the concrete result is stubbed).
- **A `tool-result` part has the fields `type: 'tool-result'`, `toolCallId`, `toolName`, `output`** (see SDK research §8). Pruning replaces `output` with a string, not the whole part.
- **K=5** per the architecture spec. Tunable, but fixed for MVP.
- **R12 session-start suggestion** is a text response in Phase 1 (no generative UI). The system prompt contains the state table from R12; the LLM decides which suggestion to make on the first turn of a new session.
- **The input heuristic must not be too aggressive.** A task like "Write code review for PR #42" contains special chars but not in the proportions the heuristic rejects. Test cases cover honest edge cases.
- **Session switching is explicitly not an MVP feature.** Today's session file is loaded; past sessions just sit on disk and are not touched by the CLI. Phase 2a brings the UI for that.

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

- **Scenario A — yesterday's note exists, today's missing:**
  - Before: `daily/2026-04-23.md` with mixed open `[ ]` + `[x]`
  - `runDailyLifecycle(repo, new Date('2026-04-24T09:00Z'))`
  - After: `daily/2026-04-23.md` is gone, `archive/daily/2026-04-23.md` contains content with `[ ]` lines removed + log note, `[x]` lines preserved, new empty `daily/2026-04-24.md` exists
  - History has 2 new entries
- **Scenario B — multiple old notes (user away for 3 days):**
  - Before: `daily/2026-04-21.md`, `daily/2026-04-22.md`, `daily/2026-04-23.md`
  - After: all three moved to `archive/daily/`, `daily/2026-04-24.md` is new
- **Scenario C — today's note already exists:**
  - Before: `daily/2026-04-24.md` with content
  - After: unchanged, no history entry, return `{ archivedPaths: [], createdTodayPath: null }`
- **Scenario D — idempotency:**
  - Second call with the same `today` → no mutation, no new history entries
- **Scenario E — open checkboxes with nested indentation:**
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

- **Fresh vault:** `ensureVaultReady(repo, '2026-05-08')` on an empty repo → 5 `tasks/*.md` files exist as empty strings, `daily/2026-05-08.md` does **not** exist, `archive/daily/` empty. Five history entries, all `changedBy: 'system'`.
- **Existing task files preserved:** seed `tasks/inbox.md` with `"- [ ] keep me\n"`, run readiness → file content unchanged, no history entry for it. Other 4 task files created.
- **Day rollover from yesterday:** seed `daily/2026-05-07.md` with mixed `[ ]`/`[x]`, run readiness with `today='2026-05-08'` → `daily/2026-05-07.md` gone, `archive/daily/2026-05-07.md` exists with `[ ]` lines removed + log line, `daily/2026-05-08.md` does **not** exist.
- **Multiple stale dailies:** seed `daily/2026-05-05.md`, `daily/2026-05-06.md`, `daily/2026-05-07.md` → all three moved, `daily/` empty afterwards, `daily/2026-05-08.md` not pre-created.
- **Today's daily already exists:** seed `daily/2026-05-08.md` with content → unchanged, not archived, no history entry.
- **Non-date file in `daily/`:** seed `daily/notes.md` → left in place, not archived, not treated as today's note.
- **Idempotency:** call twice with the same `today` → second call produces no history entries, no mutations.
- **System actor:** all mutations the readiness step performs log with `changedBy: 'system'`, never `'llm'`.

Plus one `LocalFileRepository` happy-path test against a temp directory to confirm parity with `InMemoryFileRepository`.

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
- All turns use Haiku (hardcoded in CLI for this test mode, or because `routeModel` decides so)
- Budget check: a full run should stay under 2 minutes and under ~$0.05
- On failure: **no automatic cleanup** of the test vault — `console.log` prints the path so the developer can inspect manually. Cleanup in `afterEach` only on success.

**Harness details:**
- CLI subprocess via `execa` with `PATH`, `VAULT_PATH`, `ANTHROPIC_API_KEY`, optionally `GTD_NOW_OVERRIDE`
- Input stream: per scenario write one line to stdin, then read stdout until the prompt `> ` reappears (ready indicator)
- Per-turn timeout: 30s (the agentic loop may need several tool calls)
- After all scenarios: `SIGINT` + `SIGINT` to terminate

### Acceptance

- `pnpm --filter cli test:e2e` green when `ANTHROPIC_API_KEY` is set
- Skip message clearly visible when the key is missing ("skipped — set ANTHROPIC_API_KEY to run e2e")
- One documentation line in `README.md`: how to run the test locally and how expensive it is

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

_Plan created: 2026-04-24. Based on architecture spec v1 + Vercel SDK research v1._
