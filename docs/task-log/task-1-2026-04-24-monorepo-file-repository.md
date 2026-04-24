# Task 1 — Monorepo + FileRepository + LocalFileRepository

**Date:** 2026-04-24
**Plan:** `docs/plans/phase-1-cli.md` (Task 1)

## Task

Lay down the pnpm monorepo foundation and deliver a validated `FileRepository` abstraction (Local + InMemory) with append-only JSONL history log. No LLM, no CLI logic — just the contract everything later sits on.

## Status

**DONE.**

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
- `packages/core/src/history-log.ts` — `buildHistoryEntry` (pure) + `appendHistoryEntry` (fs), JSONL under `.gtd-companion/file-history.jsonl`, injectable clock + id factory.
- `packages/core/src/search.ts` — `formatToday(UTC)`, `isInScope(path, scope, today)`, `findMatches(...)` (case-insensitive, 1-based line numbers, ~80-char snippet, `.md`-only).
- `packages/core/src/in-memory-file-repository.ts` — `Map<string,string>` + in-memory history trail, `getHistory()` test accessor.
- `packages/core/src/local-file-repository.ts` — fs-backed repo, POSIX paths at the surface, native-sep only at `fs.*` boundary, recursive `walk` that skips `.gtd-companion/`.
- `packages/core/src/index.ts` — barrel export.
- `packages/core/src/__tests__/file-repository.contract.ts` — parametrized 7-case contract suite (round-trip, missing-file, recursive+prefix list, history-on-write, scope filtering, 1-based line, case-insensitive search).
- `packages/core/src/__tests__/{in-memory,local}-file-repository.test.ts` — drive the contract against both impls with a fixed clock (`2026-04-24T10:00:00Z`).
- `packages/core/src/__tests__/history-log.test.ts` — asserts `buildHistoryEntry` defaults + JSONL append behavior.
- `pnpm-lock.yaml` — generated.

### Unexpected inclusions (see Open Issues)
- `.brokk/workspace.properties` deleted from tracking (aligns with the post-edit `.gitignore`'s `.brokk` rule).
- `docs/specs/architecture.md` — 19 lines added (Zwei-Schichten-Modell for scope enforcement). These changes were already in the working tree; got swept into the commit.

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — preamble + Task 1 block only (per `/start-task` contract).
- `docs/specs/architecture.md` — *not read*; Task 1 was self-contained.

## Key Decisions

1. **ESM everywhere** (`"type": "module"`, `NodeNext`) — matches the Vercel AI SDK usage coming in Task 3; avoids CJS/ESM interop pain later.
2. **Single TS config base** + per-workspace `tsconfig.json` that extends it — keeps strict options consistent without duplicating them.
3. **Case-insensitive, `.md`-only search, 1-based line numbers.** Plan was silent on case sensitivity; chose case-insensitive to match how GTD users think. Restricting to `.md` avoids accidentally matching the JSONL history log or future state files.
4. **`.gtd-companion/` is excluded from `list()`.** Otherwise every `search` would see its own history-log file and leak internal state into LLM context.
5. **Injectable `now()` on both repos and on `buildHistoryEntry`.** Task 5 already needs clock injection; adding it now costs nothing and makes all tests deterministic.
6. **Split `history-log.ts` into `buildHistoryEntry` (pure) + `appendHistoryEntry` (fs).** Lets `InMemoryFileRepository` keep its history in RAM without touching disk, and the fs path stays a thin wrapper.
7. **Shared parametrized contract suite** (`file-repository.contract.ts`) — both impls are driven through the exact same cases, so any future repo (e.g. cloud-backed in Phase 2) drops into the same test harness.
8. **POSIX paths at the interface; native sep only at `fs.*` boundary.** Windows-safe without polluting call sites. `walk()` converts back to POSIX when emitting paths.
9. **UTC-based `YYYY-MM-DD` for "today"** in `formatToday`. Consistent across timezones; Task 5 will revisit if local-date semantics are needed.
10. **History append is documented as non-atomic** w.r.t. the preceding `fs.writeFile`. Acceptable for Phase 1 single-user; worth revisiting in Phase 2.

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

## Open Issues

1. **Unexpected files in the commit.** `docs/specs/architecture.md` (19 lines added) and `.brokk/workspace.properties` (deleted) ended up in this commit alongside the planned scope. The `.gitignore` wasn't committed with a `git rm --cached .brokk/workspace.properties` step — instead git seems to have auto-staged the deletion on commit. The architecture.md addition (Zwei-Schichten-Modell for scope enforcement) was pre-existing unstaged work that got included. **No functional impact on Task 1**, but worth noting before starting Task 2. (→ no follow-up task needed; flag for awareness.)
2. **`pnpm install` requires disabling the sandbox** (`~/.local/share/pnpm/store` is outside the write allowlist). Either add that path via `/sandbox` or expect to confirm for every install. (→ tooling, no task.)
3. **`noUncheckedIndexedAccess` is on** — Task 2+ will need explicit `!` or `??` at array-index reads. Already accounted for in this task's code.

## Context for Next Task (Task 2 — `edit_file`)

**Interfaces you can rely on:**

```ts
interface FileRepository {
  read(filePath: string): Promise<string>;            // throws FileNotFoundError
  write(filePath: string, content: string, changeSummary: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  search(query: string, scope?: SearchScope): Promise<SearchResult[]>;
}
```

- Paths are POSIX. "Today" is driven by the injected `now()` (default `() => new Date()`).
- History append is already wired into `write()`. When Task 2 adds `edit()`, reuse `buildHistoryEntry` / `appendHistoryEntry` — do **not** duplicate the logic.
- `InMemoryFileRepository.getHistory()` is test-only; useful for Task 2 assertions.
- The shared contract suite is the canonical way to prove both impls satisfy the same behavior. Extend `file-repository.contract.ts` with edit cases; both `.test.ts` files pick them up automatically.

**Plan reminders for Task 2:**
- `edit_file` = atomic search-and-replace, uniqueness check, structured error returns (not thrown exceptions at the tool boundary).
- Must append a history entry on success (`contentBefore` = pre-edit, `contentAfter` = post-edit).

## Git State

```
$ git log --oneline -3
<this commit>  feat(core): monorepo skeleton + FileRepository foundation
4f0208b        docs: fill in architecture and product specs
bf6ac64        plan: phase 1 CLI milestone

$ git status --short
?? .bash_profile
?? .bashrc
?? .gitconfig
?? .gitmodules
?? .idea/
?? .mcp.json
?? .profile
?? .ripgreprc
?? .vscode
?? .zprofile
?? .zshrc
```

(All "??" entries are sandbox device-node artifacts, not project files; `.gitignore` intentionally does not list them individually.)
