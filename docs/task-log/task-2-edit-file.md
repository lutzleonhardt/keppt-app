# Task 2 — `edit_file` mit atomarem Search/Replace

**Date:** 2026-04-24 (initial), 2026-05-07 (adversarial-review fixes)
**Plan:** `docs/plans/phase-1-cli.md` (Task 2)

## Task

Add an atomic multi-edit Search/Replace `edit()` method to the `FileRepository`
contract. Structured `EditResult` on both success and failure (never throws at
the tool boundary), uniqueness checked against the **original** content,
all-or-nothing apply, single history entry on success.

## Status

**DONE**

## Files Modified

### New
- `packages/core/src/edit.ts` — `SearchReplaceEdit`, `EditError`, `EditResult`
  types plus the pure `planAndApplyEdits(original, edits)` planner. Reusable by
  both repository impls; no I/O. `countOccurrences` advances by 1 (not
  needle.length) so self-overlapping searches like `aa` in `aaa` are correctly
  reported as ambiguous.
- `packages/core/src/__tests__/edit.test.ts` — 11 unit tests against the pure
  planner: single/multi-edit happy paths, missing/ambiguous search,
  mid-sequence abort (atomicity), span-overlap detection, `$&`/`$1`/`$$`
  literal handling, empty edits array, empty search, out-of-order inputs,
  self-overlapping start offsets.

### Modified
- `packages/core/src/file-repository.ts` — `edit()` added to the
  `FileRepository` interface; imports + re-use of `EditResult` /
  `SearchReplaceEdit` from `./edit.js`.
- `packages/core/src/in-memory-file-repository.ts` — `edit()` impl; shared
  `missingFileError(edits)` helper translates `InvalidPathError` and missing
  files into the same `matchCount: 0, currentContent: ""` shape; single
  history entry on success.
- `packages/core/src/local-file-repository.ts` — `edit()` impl with own
  CAS-style recheck (re-read just before commit, abort with current bytes if
  the file changed since planning). `write()` and `edit()` share a private
  `commit()` helper that owns the history-first / temp-write / atomic-rename
  invariant. New `protected fsReadUtf8` seam exists only so a test subclass
  can simulate a concurrent writer between the two reads. Comment block
  flags the residual recheck-vs-rename race window as a known limitation.
- `packages/core/src/index.ts` — exports `SearchReplaceEdit`, `EditResult`,
  `EditError`, `planAndApplyEdits`.
- `packages/core/src/__tests__/file-repository.contract.ts` — 8 contract
  cases for both impls: happy single edit, happy multi-edit (one history
  entry, not three), missing file, 0 matches, >1 matches, mid-sequence
  ambiguity atomic abort, overlap rejection, invalid-path translation.
- `packages/core/src/__tests__/local-file-repository.test.ts` — `edit()`
  preserves prior content when history append fails (atomic-write mirror of
  Task 1) plus a concurrency regression test that subclasses
  `LocalFileRepository`, mutates the file between the planning read and CAS
  recheck via the `fsReadUtf8` seam, and verifies the stale plan is not
  committed and no history entry is written.
- `docs/specs/architecture.md` — `edit_file`-Tool-Definition erweitert um
  **Retry-Budget**-Bullet (max. 2 Nachbesserungen pro Datei pro User-Message,
  danach Abbruch + User-Rückfrage; Phase 1 prompt-seitig, Handler-Counter als
  Eskalationspfad). Build Milestone 1.2 bekam eine einzeilige
  Cross-Reference, damit Task 4 den Bullet beim Prompt-Schreiben findet.
  Zusätzlich: "Bekannte Einschränkung"-Bullet zu `edit_file` über das
  Recheck-vs-Rename-Race-Fenster im `LocalFileRepository` (Phase 1 only,
  Supabase ersetzt es in Prod).

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — preamble + Task 2 block only (per `/start-task`
  contract).
- `docs/task-log/task-1-2026-04-24-monorepo-file-repository.md` — previous
  task's "Context for Next Task" section.
- `packages/core/src/history-log.ts`, `file-repository.ts`,
  `local-file-repository.ts`, `in-memory-file-repository.ts`,
  `__tests__/{contract,local,in-memory}.ts` — needed surface for integration.
- `docs/specs/architecture.md` — only the `edit_file` tool section (~line
  981) and the `R1`–`R13` / Build Milestone `1.2` sections (~line 1343) to
  choose where the retry-budget paragraph should live.

## Key Decisions

1. **Apply in reverse position order, not input order.** Plan said
   "sequentially". Applying in input order + `indexOf` has an edge case: if
   edit 1's replacement text happens to contain edit 2's search, `indexOf`
   would hit the newly-introduced copy before edit 2's real (shifted)
   position and corrupt the file. Reverse-position order (largest original
   `pos` first) sidesteps this entirely — each edit lands at its planned
   original location, and later edits don't disturb earlier positions.
   Still "sequential" as the plan specifies; just deterministic.

2. **Span-overlap detection runs pre-apply in original coordinates.** Plan
   described overlap in terms of post-apply detection ("edit N+1's search is
   no longer present after edit N"). Same outcome, caught earlier: sort the
   planned edits by `pos`, check consecutive pairs for range intersection.
   Reports the later-in-input edit as `failedSearch` with `matchCount: 0`.

3. **`indexOf` + slice, not `String.prototype.replace`.** Plan literally said
   `String.replace`. I deviated because `String.replace(literal, replacement)`
   treats `$&`, `$1`, `$$` etc. in the replacement as backreferences —
   silently corrupts content the LLM writes with dollar signs. `indexOf` +
   slice has zero substitution semantics. Added a regression test
   (`$& $1 $$`) to lock this in.

4. **`InvalidPathError` and "file missing" collapse to the same `EditResult`
   shape.** Plan was silent on invalid paths. Uniform `matchCount: 0,
   currentContent: ""` output means the LLM handles all three
   (bad-path / missing-file / no-match) through one tool-result pattern
   instead of two. Trade-off: the LLM can't distinguish "bad path" from
   "file doesn't exist" from the error alone — acceptable because both
   situations imply "try a different path" and the change-summary /
   prior-message context disambiguates.

5. **`LocalFileRepository.edit()` delegates to `write()`** once edits are
   computed. The history-first + temp-file + atomic `rename` dance stays
   single-sourced. Cost: one redundant `readFile` inside `write()` (we
   already have `original`). Worth it — any future tweak to atomic-write
   semantics updates one place.

6. **Empty edits array + empty search string both return the same
   `matchCount: 0, failedSearch: ""` error.** Defensive; Task 3's tool
   schema will enforce `min(1)` + `search: z.string().min(1)` at the Zod
   boundary so the LLM never sees these paths in normal operation. Keeping
   them as defined-behavior returns (not throws) means the tool-handler
   stays a thin pass-through.

7. **Plan acceptance `changeSummary: "overlapping edits"` read as
   descriptive shorthand, not a schema field.** The plan's `EditResult.error`
   type has no `changeSummary` field. Overlap errors carry `matchCount: 0` +
   the `failedSearch` of the edit whose target was destroyed. Asked the user
   pre-implementation, got the green light.

8. **Retry-Budget lives in the spec, not in the code (yet).** User surfaced
   the "give up after N failed edits" question mid-session. Decision: in
   Phase 1, enforce rein prompt-seitig via System Prompt (Task 4). Doc-added
   the policy to `architecture.md` §`edit_file` so Task 4 has a concrete
   contract to implement. Handler-Counter (Map `filePath → failedAttempts`
   per User-Message) is documented as the escalation path — added to the
   handler layer, not the repository, so the repository stays zero-state
   per call. No code in this task.

— session 2026-05-07 (post-adversarial-review)

9. **`countOccurrences` must count overlapping starts.** Codex flagged that
   the original `from = idx + needle.length` advance only counted
   non-overlapping matches: `aa` in `aaa` returned 1, so the planner
   silently applied the first replacement instead of aborting on ambiguity.
   Fix: advance by 1. The "exactly one match" contract is about start
   offsets, not about non-overlapping spans. Added a regression test.

10. **`LocalFileRepository.edit()` no longer delegates to `write()`** —
    revises Decision 5. Codex flagged that `write()`'s internal re-read
    means `edit()` could log `contentBefore` from a *concurrently mutated*
    file while writing the *stale planned* content. Fix: `edit()` does its
    own read → plan → CAS-recheck → commit, where `commit()` is a private
    helper now shared with `write()`. The history-first + atomic-rename
    invariant still lives in exactly one place (`commit()`), and `edit()`
    uses the planning-read snapshot as `contentBefore`, consistent with the
    planned `contentAfter`.

11. **`protected fsReadUtf8` test seam, accepted.** The CAS guard's only
    deterministic test path is to inject a different return value on the
    second read inside `edit()`. Module-level mocks (`vi.mock("node:fs/...")`)
    work but bleed across tests; a thin `protected` indirection lets a
    `StaleReadRepo` subclass override exactly one call site. Production code
    always dispatches to `fs.readFile`. Comment makes the intent explicit.

12. **Residual recheck-vs-rename race window: documented, not fixed.** The
    new CAS guard closes the *large* plan-vs-commit window (potentially
    seconds in an LLM-driven flow). A small window remains between the CAS
    recheck and the final `rename()` (history append + temp write + rename,
    ~10s of ms). User decision: don't fix now. `LocalFileRepository` is a
    stepping-stone for CLI dev and Dogfooding-Server gegen das Vault;
    Produktion läuft gegen `SupabaseFileRepository`, wo Row-Level-
    Transaktionen das Problem eliminieren. Documented as "known limitation"
    in `local-file-repository.ts:CAS-recheck` comment block and in
    `architecture.md` §`edit_file`. Revisit (per-path mutex + lockfile) only
    if a real collision shows up.

## Test Evidence

```
$ pnpm -r build
packages/core build: Done
apps/cli build: Done

$ pnpm -r test
packages/core:
  ✓ src/__tests__/history-log.test.ts  (2 tests)
  ✓ src/__tests__/edit.test.ts  (10 tests)
  ✓ src/__tests__/in-memory-file-repository.test.ts  (35 tests)
  ✓ src/__tests__/local-file-repository.test.ts  (40 tests)
  Test Files  4 passed (4)
       Tests  87 passed (87)
apps/cli:
  ✓ test/workspace-wiring.test.ts  (1 test)
  Test Files  1 passed (1)
       Tests  1 passed (1)

$ pnpm -r typecheck
packages/core typecheck: Done
apps/cli typecheck: Done
```

Delta since Task 1: 61 → 87 tests in `packages/core` (+26).
- `edit.test.ts` (new) — 10 pure-planner tests.
- `in-memory-file-repository.test.ts` — 27 → 35 (+8 from the contract's new
  `describe("edit")` block).
- `local-file-repository.test.ts` — 31 → 40 (+8 contract + 1 local atomic-write
  test for `edit()`).

— session 2026-05-07 (post-adversarial-review)

```
$ cd packages/core && pnpm test
 ✓ src/__tests__/edit.test.ts  (11 tests) 4ms
 ✓ src/__tests__/history-log.test.ts  (2 tests) 5ms
 ✓ src/__tests__/in-memory-file-repository.test.ts  (35 tests) 13ms
 ✓ src/__tests__/local-file-repository.test.ts  (41 tests) 57ms

 Test Files  4 passed (4)
      Tests  89 passed (89)

$ pnpm typecheck
packages/core typecheck: Done (no diagnostics)
```

Delta from this session: 87 → 89 tests in `packages/core` (+2).
- `edit.test.ts`: +1 self-overlapping-search regression test.
- `local-file-repository.test.ts`: +1 concurrency test (`StaleReadRepo` subclass
  mutates the file between planning read and CAS recheck; asserts ok:false,
  current bytes survive, no history entry).

Adversarial review verdict shifted `needs-attention → needs-attention (residual
race accepted as known limitation, see Decision 12)`.

## Open Issues

1. **Retry-Budget is spec-only, no test coverage yet.** The policy (max. 2
   nachbesserungen, then abort + Rückfrage) lives in
   `architecture.md` §`edit_file` but is only enforceable once Task 4 builds
   the System Prompt. Task 6 (E2E Acceptance) should verify the prompt
   actually holds; if it doesn't, add the Handler-Counter. (→ Task 4 / Task 6.)
2. **Invalid-path and file-missing error cases are indistinguishable to the
   LLM.** Both return `matchCount: 0, currentContent: ""`. Accepted in Key
   Decision #4. If real usage shows the LLM loops on bad paths, add a
   discriminant (e.g. `reason?: "invalid_path" | "not_found"`) to
   `EditError`. Not a blocker for Phase 1. (→ no task; revisit in Task 6.)
3. **No CLI / tool-handler wiring.** Planned — that's Task 3 scope. The
   current `edit()` surface is internal to `@gtd/core`.
4. **Recheck-vs-rename race in `LocalFileRepository.edit()`.** Accepted as
   known limitation per Decision 12 (Phase 1 only; Supabase replaces it in
   Prod). If Phase-2a Dogfooding-Server-against-Vault surfaces a real
   collision, add a per-path in-process mutex first (cheap, ~15 lines) and
   only then evaluate cross-process locking. (→ no task; revisit during
   Phase-2a Dogfooding if observed.)
5. **Untracked sandbox artifacts in working tree** (`.bash_profile`,
   `.bashrc`, `.idea/`, etc.) are unrelated to Task 2 and will not be
   staged. Same issue as Task 1; no action needed. (→ tooling, no task.)

## Context for Next Task (Task 3 — CLI + Vercel AI SDK + Tool Handlers)

**Interfaces you can rely on:**

```ts
interface SearchReplaceEdit { search: string; replace: string; }

interface EditError {
  failedSearch: string;   // exact string the LLM supplied; "" for invalid input
  matchCount: number;     // 0 = not found / invalid / concurrent change; >1 = ambiguous
  currentContent: string; // full current file content; "" if file missing
}

interface EditResult {
  ok: boolean;
  error?: EditError;
}

interface FileRepository {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string, changeSummary: string): Promise<void>;
  edit(
    filePath: string,
    edits: readonly SearchReplaceEdit[],
    changeSummary: string,
  ): Promise<EditResult>;
  list(prefix?: string): Promise<string[]>;
  search(query: string, scope?: SearchScope): Promise<SearchResult[]>;
}
```

**Tool-handler shape (for Task 3's `edit_file` tool):**
- The handler is a thin adapter: validate input with Zod (`search: min(1)`,
  `edits: min(1)`), call `repo.edit(filePath, edits, changeSummary)`, return
  the `EditResult` verbatim as the tool output. **No try/catch** — `edit()`
  never throws for the "LLM gave bad input" path. The only time `edit()`
  would throw is a genuine I/O error (disk full, permission denied), which
  the SDK will wrap into a `tool-error` part automatically.
- Translate `read_file` on a missing file the same way: return a structured
  error object, not a throw. (Applies to all tool handlers in Task 3.)
- A `matchCount: 0` with non-empty `currentContent` can also indicate a
  concurrent-modification abort (CAS guard fired). The LLM treatment is the
  same as for "search not found": re-plan against `currentContent`.

**Retry-Budget (prompt-side, not code):**
- Task 4 writes the System Prompt. Include a rule that says: "Bei `ok:
  false` von `edit_file` darfst du **max. 2 Nachbesserungen** pro Datei pro
  User-Message versuchen; nach dem 3. Fehlschlag frag den User mit dem
  aktuellen File-Content als Kontext nach, und greife **nicht** auf
  `write_file` zurück." Full wording: `docs/specs/architecture.md`
  §`edit_file` / Bullet „Retry-Budget".
- If Task 6 shows the prompt alone doesn't hold, introduce a per-user-message
  counter in the tool-handler. Place it in the handler layer, not the
  repository — the repository stays stateless per call.

**Planner detail Task 3 might care about:**
- `planAndApplyEdits` is exported from `@gtd/core`. Useful if a future
  non-LLM caller (tests, scripts) needs dry-run semantics without touching
  the repo. Not needed for the `edit_file` tool handler itself.
- Apply order is **reverse-position**. If the tool response ever needs to
  report "edit N landed at line X", the correct position is
  `indexOf(search)` on the **pre-edit** content, not post-edit. No caller
  needs this today.
- `countOccurrences` counts overlapping starts. `aa` in `aaa` is reported as
  ambiguous (matchCount:2), not as "one match at position 0".

**Gotchas:**
- `$&`, `$1`, `$$` in `replace` are **literal** (not regex backreferences).
  Noted here because Task 3's Zod schema should not trim/normalize
  `search`/`replace` — the planner relies on exact-literal matching
  including whitespace and tabs.
- `edit()` emits exactly **one** history entry per successful call,
  regardless of how many edits were in the array. Task 3's change-summary
  rendering (chat echo, diff view later) should treat a single `edit_file`
  call as one user-facing action.
- `LocalFileRepository` has a `protected fsReadUtf8(abs)` method used as a
  test seam for the CAS guard. Don't override it in production subclasses;
  it exists solely so a test subclass can simulate a concurrent writer.

## Git State

```
$ git diff --stat HEAD
 docs/specs/architecture.md                         |   4 +-
 docs/task-log/task-2-edit-file.md                  | 274 +++++++++++++++++++++
 packages/core/src/__tests__/edit.test.ts           | 109 ++++++++
 .../core/src/__tests__/file-repository.contract.ts | 147 +++++++++++
 .../src/__tests__/local-file-repository.test.ts    |  73 +++++-
 packages/core/src/edit.ts                          |  98 ++++++++
 packages/core/src/file-repository.ts               |   7 +
 packages/core/src/in-memory-file-repository.ts     |  46 +++-
 packages/core/src/index.ts                         |   6 +
 packages/core/src/local-file-repository.ts         | 121 +++++++--
 10 files changed, 866 insertions(+), 19 deletions(-)

$ git status --short
 M docs/specs/architecture.md
A  docs/task-log/task-2-edit-file.md
AM packages/core/src/__tests__/edit.test.ts
 M packages/core/src/__tests__/file-repository.contract.ts
 M packages/core/src/__tests__/local-file-repository.test.ts
AM packages/core/src/edit.ts
 M packages/core/src/file-repository.ts
 M packages/core/src/in-memory-file-repository.ts
 M packages/core/src/index.ts
 M packages/core/src/local-file-repository.ts
(unrelated sandbox/IDE files — .bash_profile, .bashrc, .idea/, .mcp.json,
 .vscode, .zshrc, etc. — present in `git status` but will not be staged)
```
