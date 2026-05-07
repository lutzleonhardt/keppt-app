# Task 1 — Monorepo + FileRepository + LocalFileRepository

**Date:** 2026-04-24
**Plan:** `docs/plans/phase-1-cli.md` (Task 1)

## Task

Lay down the pnpm monorepo foundation and deliver a validated `FileRepository` abstraction (Local + InMemory) with append-only JSONL history log. No LLM, no CLI logic — just the contract everything later sits on.

## Status

**DONE** (initial landing in `b9df787`; extended with review-hardening fixes in a follow-up session — see session-2 marker below).

## Files Modified

### New
- `pnpm-workspace.yaml` — workspaces `apps/*`, `packages/*`.
- `package.json` (root) — `type: "module"`, Node ≥18, scripts (`build`, `test`, `typecheck`), dev deps (TS 5.4, vitest 1.4, prettier, @types/node).
- `tsconfig.base.json` — strict, ES2022, NodeNext, `noUncheckedIndexedAccess`, `isolatedModules`.
- `.gitignore` — scoped to `node_modules`, `dist`, `coverage`, logs, `.env*`, `.brokk` (full dir, per user edit).
- `.nvmrc` — `20`.
- `README.md` — minimal monorepo overview.
- `apps/cli/{package.json,tsconfig.json,src/index.ts}` — placeholder workspace (`@gtd/cli`, depends on `@gtd/core`, `// placeholder` entry). Populated in Task 3.
- `packages/core/package.json` — `@gtd/core`, ESM, `tsc` build, `vitest run` test.
- `packages/core/tsconfig.json` — excludes `__tests__/` from build output.
- `packages/core/vitest.config.ts` — picks up `src/**/__tests__/**/*.test.ts`.
- `packages/core/src/file-repository.ts` — `FileRepository` interface, `SearchResult`, `SearchScope`, `FileNotFoundError`.
- `packages/core/src/history-log.ts` — `buildHistoryEntry` (pure) + `appendHistoryEntry` (fs), JSONL under `.keppt/file-history.jsonl`, injectable clock + id factory.
- `packages/core/src/search.ts` — `formatToday(UTC)`, `isInScope(path, scope, today)`, `findMatches(...)` (case-insensitive, 1-based line numbers, ~80-char snippet, `.md`-only).
- `packages/core/src/in-memory-file-repository.ts` — `Map<string,string>` + in-memory history trail, `getHistory()` test accessor.
- `packages/core/src/local-file-repository.ts` — fs-backed repo, POSIX paths at the surface, native-sep only at `fs.*` boundary, recursive `walk` that skips `.keppt/`.
- `packages/core/src/index.ts` — barrel export.
- `packages/core/src/__tests__/file-repository.contract.ts` — parametrized 7-case contract suite (round-trip, missing-file, recursive+prefix list, history-on-write, scope filtering, 1-based line, case-insensitive search).
- `packages/core/src/__tests__/{in-memory,local}-file-repository.test.ts` — drive the contract against both impls with a fixed clock (`2026-04-24T10:00:00Z`).
- `packages/core/src/__tests__/history-log.test.ts` — asserts `buildHistoryEntry` defaults + JSONL append behavior.
- `pnpm-lock.yaml` — generated.

### Unexpected inclusions (see Open Issues)
- `.brokk/workspace.properties` deleted from tracking (aligns with the post-edit `.gitignore`'s `.brokk` rule).
- `docs/specs/architecture.md` — 19 lines added (Zwei-Schichten-Modell for scope enforcement). These changes were already in the working tree; got swept into the commit.

### Modified — session 2026-04-24 (post-review hardening)
- `packages/core/src/file-repository.ts` (modified) — added `InvalidPathError` and shared `validateFilePath()` (rejects absolute paths, `..`, `.`, empty segments, backslash, null bytes, and the reserved `.keppt/` prefix).
- `packages/core/src/local-file-repository.ts` (modified) — `resolve()` now validates and does belt-and-suspenders containment via `path.relative`; `write()` reordered to history-first + temp-file + atomic `rename` with temp-cleanup on failure; `walk()` now skips dot-directories and emits `.md` files only; comments hardened to document the phantom-entry tradeoff.
- `packages/core/src/in-memory-file-repository.ts` (modified) — calls `validateFilePath` on read/write; `list()` filters to `.md` for contract parity with local.
- `packages/core/src/history-log.ts` (modified) — comment rewritten as an explicit caller contract ("append BEFORE mutating the file"); acknowledges phantom entries as tolerated.
- `packages/core/src/index.ts` (modified) — exports `InvalidPathError`, `validateFilePath`.
- `packages/core/src/__tests__/file-repository.contract.ts` (modified) — added explicit list-ordering assertion and a 9×2-case path-validation suite (bad inputs × {read, write}) + "rejected writes leave no history entry".
- `packages/core/src/__tests__/local-file-repository.test.ts` (modified) — `readHistory()` now tolerates ENOENT; new local-specific suites for atomic write (history failure preserves prior content, no file on first-write failure, no `.tmp` residue) and list filters (dot-dirs + non-md skipped).
- `apps/cli/test/workspace-wiring.test.ts` (new) — smoke test that imports the public `@gtd/core` surface (`InMemoryFileRepository`, `FileNotFoundError`, `InvalidPathError`) and exercises it; catches workspace-wiring / `exports` map regressions before Task 3.
- `apps/cli/package.json` (modified) — `test` script now runs `vitest run`; `engines.node` → `>=20`.
- `packages/core/package.json`, `package.json` (modified) — `engines.node` → `>=20` (matches `.nvmrc` pin; Node 18 is EOL).
- `docs/plans/phase-1-cli.md` (modified) — Node engine references updated to `>=20`.
- `.gitignore` (modified) — added `.keppt/` with a comment explaining the dogfooding guard rail.

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — preamble + Task 1 block only (per `/start-task` contract).
- `docs/specs/architecture.md` — *not read*; Task 1 was self-contained.

## Key Decisions

1. **ESM everywhere** (`"type": "module"`, `NodeNext`) — matches the Vercel AI SDK usage coming in Task 3; avoids CJS/ESM interop pain later.
2. **Single TS config base** + per-workspace `tsconfig.json` that extends it — keeps strict options consistent without duplicating them.
3. **Case-insensitive, `.md`-only search, 1-based line numbers.** Plan was silent on case sensitivity; chose case-insensitive to match how GTD users think. Restricting to `.md` avoids accidentally matching the JSONL history log or future state files.
4. **`.keppt/` is excluded from `list()`.** Otherwise every `search` would see its own history-log file and leak internal state into LLM context.
5. **Injectable `now()` on both repos and on `buildHistoryEntry`.** Task 5 already needs clock injection; adding it now costs nothing and makes all tests deterministic.
6. **Split `history-log.ts` into `buildHistoryEntry` (pure) + `appendHistoryEntry` (fs).** Lets `InMemoryFileRepository` keep its history in RAM without touching disk, and the fs path stays a thin wrapper.
7. **Shared parametrized contract suite** (`file-repository.contract.ts`) — both impls are driven through the exact same cases, so any future repo (e.g. cloud-backed in Phase 2) drops into the same test harness.
8. **POSIX paths at the interface; native sep only at `fs.*` boundary.** Windows-safe without polluting call sites. `walk()` converts back to POSIX when emitting paths.
9. **UTC-based `YYYY-MM-DD` for "today"** in `formatToday`. Consistent across timezones; Task 5 will revisit if local-date semantics are needed.
10. **History append is documented as non-atomic** w.r.t. the preceding `fs.writeFile`. Acceptable for Phase 1 single-user; worth revisiting in Phase 2.

— session 2026-04-24 (post-review hardening)

11. **Path validation is shared**, not per-impl. Two independent reviews (local adversarial + Codex) flagged `LocalFileRepository.resolve()` as the #1 trust-boundary bug (allowed `../`, absolute, and `.keppt/` writes → audit-trail tampering). Chose a shared `validateFilePath()` in `file-repository.ts` called by both impls, so the guarantee is part of the `FileRepository` contract, not a local detail. Rejected the alternative of validating only in `LocalFileRepository` because Task 2's `edit` path and any future impl would re-derive the same rules.
12. **Belt-and-suspenders containment** in `LocalFileRepository.resolve()`: after syntactic validation, verify `path.relative(basePath, resolved)` doesn't start with `..` or go absolute. Cheap defense against a validator regression.
13. **`write()` is history-first, then temp-file + atomic `rename`.** Codex review said "persist the previous version before exposing the new one." The original flow (writeFile then append) would silently lose the pre-mutation content if the history append failed. Tradeoff accepted: if `writeFile`/`rename` fails *after* the history append succeeds, the log keeps a phantom entry. Acceptable because `contentBefore` still matches the real disk state at log time, retries just append another accurate entry, and a rollback over a phantom is a no-op. A two-phase pending/committed log is deferred to whenever a rollback UI is actually built.
14. **`walk()` skips all dot-directories and emits only `.md`.** The original `walk` leaked `.obsidian/`, `.git/`, images, and PDFs into every `list()` call, which would flood LLM context once pointed at a real vault. `InMemoryFileRepository.list()` also filters to `.md` so the contract is consistent across impls. Collapses the old `.keppt`-specific special-case into the generic dot-dir rule.
15. **Bumped `engines.node` to `>=20`** across root, `@gtd/core`, and `@gtd/cli`, and updated `phase-1-cli.md` accordingly. The drift between `engines >=18`, `.nvmrc 20`, and the plan's `>=18` was ambiguous; `20` matches `.nvmrc` and reflects Node 18 being EOL.
16. **CLI smoke test via vitest**, not `node --test`. Vitest is resolvable from `apps/cli` through the workspace; avoided adding it as a direct devDep (lock-file churn) and avoided `node --test` + `tsx` (extra dep). Trade-off: the test requires `@gtd/core` to be built first (vitest doesn't transpile across package boundaries to `dist/`). That's desirable — it forces `pnpm -r build` before `pnpm -r test` in CI, catching stale-dist regressions.
17. **Comments on the history invariant rewritten as a contract**, not a footnote. The original `history-log.ts` comment said "acceptable for Phase 1"; the new version states the call-order requirement ("Callers must append BEFORE mutating") and names phantom entries as an explicit tolerated case. Future code reading these files should not be surprised by the ordering.

## Test Evidence

```
$ pnpm -r build
packages/core build: Done
apps/cli    build: Done

$ pnpm -r test
packages/core: Test Files  3 passed (3)
               Tests       16 passed (16)
apps/cli:      (no tests in apps/cli yet)

$ pnpm -r typecheck
packages/core typecheck: Done
apps/cli    typecheck: Done
```

Test files:
- `history-log.test.ts` — 2 tests.
- `in-memory-file-repository.test.ts` — 7 tests (via contract).
- `local-file-repository.test.ts` — 7 tests (via contract, on `mkdtemp` vault).

— session 2026-04-24 (post-review hardening)

```
$ pnpm -r test
packages/core:  Test Files  3 passed (3)
                Tests      60 passed (60)
apps/cli:       Test Files  1 passed (1)
                Tests       1 passed (1)

$ pnpm -r typecheck
packages/core typecheck: Done
apps/cli    typecheck: Done
```

Delta since initial Task-1 landing (16 → 61 tests):
- `in-memory-file-repository.test.ts` — 7 → 27 (contract now includes ordering test + 9×2 path-rejection cases + 1 "rejected writes leave no history").
- `local-file-repository.test.ts` — 7 → 31 (same contract additions + 3 local-specific atomic-write tests + 1 list-filter test for dot-dirs/non-md).
- `workspace-wiring.test.ts` (new, `apps/cli`) — 1 test exercising the `@gtd/core` public surface (`InMemoryFileRepository`, `FileNotFoundError`, `InvalidPathError`).

Two independent reviews (local adversarial + Codex) both flagged critical & high issues; both have matching negative tests now.

## Open Issues

1. **Unexpected files in the commit.** `docs/specs/architecture.md` (19 lines added) and `.brokk/workspace.properties` (deleted) ended up in this commit alongside the planned scope. The `.gitignore` wasn't committed with a `git rm --cached .brokk/workspace.properties` step — instead git seems to have auto-staged the deletion on commit. The architecture.md addition (Zwei-Schichten-Modell for scope enforcement) was pre-existing unstaged work that got included. **No functional impact on Task 1**, but worth noting before starting Task 2. (→ no follow-up task needed; flag for awareness.)
2. **`pnpm install` requires disabling the sandbox** (`~/.local/share/pnpm/store` is outside the write allowlist). Either add that path via `/sandbox` or expect to confirm for every install. (→ tooling, no task.)
3. **`noUncheckedIndexedAccess` is on** — Task 2+ will need explicit `!` or `??` at array-index reads. Already accounted for in this task's code.

— session 2026-04-24 (post-review hardening)

4. **Log filename convention drift (resolved).** Originally landed as `task-1-2026-04-24-monorepo-file-repository.md`; the documented convention is `task-{N}-{slug}.md` with no date. Renamed to `task-1-monorepo-file-repository.md` after Task 2. Future task logs follow the convention strictly. (→ no task; stylistic.)
5. **Two-phase history log (pending/committed) deferred.** The current write is history-first + atomic rename, which tolerates a phantom log entry if the file write fails. Acceptable for Phase 1 single-user (see Key Decision #13). Revisit whenever a rollback UI is actually built. (→ Phase 2.)
6. **Plan Task-1 acceptance criteria should explicitly cover path containment.** The plan's Task-1 block did not list "rejects `../`, absolute, reserved paths" as acceptance. Two reviews caught the gap. Consider tightening the plan's "Verification" language for future tasks that expose paths to LLMs. (→ plan hygiene, no code task.)

## Context for Next Task (Task 2 — `edit_file`)

**Interfaces you can rely on:**

```ts
interface FileRepository {
  read(filePath: string): Promise<string>;            // throws FileNotFoundError | InvalidPathError
  write(filePath: string, content: string, changeSummary: string): Promise<void>; // throws InvalidPathError
  list(prefix?: string): Promise<string[]>;
  search(query: string, scope?: SearchScope): Promise<SearchResult[]>;
}

// Shared validator + error
export class InvalidPathError extends Error { readonly filePath: string; readonly reason: string }
export function validateFilePath(filePath: string): void;  // throws InvalidPathError
```

- Paths are POSIX. "Today" is driven by the injected `now()` (default `() => new Date()`).
- **Path validation is part of the contract.** Any new `FileRepository` method that takes a user/LLM path MUST call `validateFilePath()` before doing anything. The validator rejects: empty, null byte, backslash, absolute, `..`/`.` segments, empty segments, and any path whose first segment is `.keppt` (reserved for the audit trail). Task 2's `edit(filePath, ...)` needs the same guard.
- **`write()` is history-first + atomic rename.** When Task 2 adds `edit()`, follow the same order: compute `contentBefore`/`contentAfter`, call `appendHistoryEntry(...)` with them, *then* do the atomic file swap. Never expose the new content before the history entry is durable.
- **Phantom history entries are tolerated**, not a bug. If a file swap fails after the history append, the log keeps an entry whose `contentAfter` never landed. `contentBefore` still matches the real disk state at log time, so retries append a fresh accurate entry. Do not add rollback-on-failure logic to `write()` — the audit trail is the rollback mechanism.
- **`list()` filters to `.md` and skips dot-directories.** Both impls do this via the contract. If Task 2 or later ever wants to manage non-markdown assets, add a new method (`listAll`?) rather than widening `list()` — changing it breaks the LLM-context guarantee.
- `InMemoryFileRepository.getHistory()` is test-only; useful for Task 2 assertions.
- The shared contract suite is the canonical way to prove both impls satisfy the same behavior. Extend `file-repository.contract.ts` with edit cases; both `.test.ts` files pick them up automatically. The 9-case path-rejection suite already covers `edit()` if you route its filePath through `validateFilePath`.

**Plan reminders for Task 2:**
- `edit_file` = atomic search-and-replace, uniqueness check, structured error returns (not thrown exceptions at the tool boundary).
- Must append a history entry on success (`contentBefore` = pre-edit, `contentAfter` = post-edit).
- Reject invalid paths at the tool boundary by catching `InvalidPathError` and translating to a structured error, rather than letting the exception bubble up.

**Build/test gotcha introduced this session:** `apps/cli/test/workspace-wiring.test.ts` imports `@gtd/core`, which resolves to `packages/core/dist/index.js`. `pnpm -r test` alone will fail on a clean checkout — run `pnpm -r build` first (or wire a `pretest` hook when CI lands).

## Git State

— session 2026-04-24 (post-review hardening), pre-commit

```
$ git diff --stat
 .gitignore                                         |  4 ++
 apps/cli/package.json                              |  4 +-
 docs/plans/phase-1-cli.md                          |  4 +-
 package.json                                       |  2 +-
 packages/core/package.json                         |  2 +-
 .../core/src/__tests__/file-repository.contract.ts | 46 ++++++++++++-
 .../src/__tests__/local-file-repository.test.ts    | 80 ++++++++++++++++++++--
 packages/core/src/file-repository.ts               | 43 ++++++++++++
 packages/core/src/history-log.ts                   |  9 ++-
 packages/core/src/in-memory-file-repository.ts     |  8 ++-
 packages/core/src/index.ts                         |  6 +-
 packages/core/src/local-file-repository.ts         | 42 ++++++++++--
 12 files changed, 225 insertions(+), 25 deletions(-)

$ git status --short
 M .gitignore
 M apps/cli/package.json
 M docs/plans/phase-1-cli.md
 M package.json
 M packages/core/package.json
 M packages/core/src/__tests__/file-repository.contract.ts
 M packages/core/src/__tests__/local-file-repository.test.ts
 M packages/core/src/file-repository.ts
 M packages/core/src/history-log.ts
 M packages/core/src/in-memory-file-repository.ts
 M packages/core/src/index.ts
 M packages/core/src/local-file-repository.ts
?? apps/cli/test/
?? (sandbox device-node artifacts — ignored)
```

The 12 tracked modifications + `apps/cli/test/workspace-wiring.test.ts` are the post-review hardening set; they will land in a single follow-up commit via `/commit 1` together with this merged summary.

— session 1 (initial landing in `b9df787`)

```
$ git log --oneline -3
b9df787  task-1: Monorepo + FileRepository + LocalFileRepository
4f0208b  docs: fill in architecture and product specs
bf6ac64  plan: phase 1 CLI milestone
```
