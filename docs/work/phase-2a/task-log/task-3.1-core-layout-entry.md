# Task 3.1 — Browser-safe core layout entry (`@gtd/core/layout`)

### Task
Give `packages/core` a second, Node-free entry point `@gtd/core/layout` carrying the vault layout rule (five task files, daily-note path, `IsoDate`), guarded by a dedicated tsconfig, and make `apps/web` import it instead of keeping its `VAULT_TASK_FILES` copy; server, CLI and core internals keep importing `@gtd/core` unchanged. In the same session the remaining gate module `gtd-layout.ts` was renamed to `access-policy.ts` (user decision, decision 11).

### Status
DONE. Independent review performed: Codex `/review quick` and the CodeScene gate (both 2026-10-31) found no hotspots and no new structural issues; the one LOW finding (an overstated guard claim in this log) is fixed here, the blind spot (fresh install) stays with Lutz, CodeScene's pre-existing findings are accepted (decisions 13–15). All four suites are green on the final code state with the plan's counts (core 317 · server 85 · cli 57 · web 119); `pnpm --filter @gtd/core typecheck` runs the layout guard and the `node:fs` probe fails it (probe removed). `pnpm install --frozen-lockfile` has since passed on Lutz's machine (see Test Evidence). Background: `pnpm install` could not run inside the sandbox (the pnpm store lock lives outside its write allowlist), so the workspace link for `@gtd/core` in `apps/web` and the matching `pnpm-lock.yaml` entry were created by hand in the exact shape pnpm generates; `pnpm install --frozen-lockfile` confirmed that entry: "Lockfile is up to date, resolution step is skipped / Already up to date" (decision 14). Ready for `/commit 3.1`. Note on the index: at the second session step most of the change set appeared staged (`M `, `A `, `R `) although no `git add` was run by the agent; the later rename edits are unstaged. `git reset` (index only, working tree untouched) restores the all-unstaged review state; `/commit 3.1` stages from the log either way.

### Files Modified
- `packages/core/src/layout/gtd-task-files.ts` (moved from `packages/core/src/gtd-task-files.ts`, content unchanged) — the five task-file paths, `GtdTaskFilePath`, `GTD_TASK_FILES`, `TASK_OCCURRENCE_TASK_FILES`
- `packages/core/src/layout/daily-note.ts` (new) — `IsoDate` (`${number}-${number}-${number}`), `DAILY_NOTE_PATH` and `dailyNoteDate(filePath): IsoDate | undefined`, extracted from `gtd-layout.ts`; the regex-validated group 1 is narrowed to `IsoDate` once, with the invariant in a comment
- `packages/core/src/layout/index.ts` (new) — the browser-safe barrel: `dailyNoteDate`, `IsoDate`, `GTD_TASK_FILES`, `GTD_TASK_FILE_PATHS`, `TASK_OCCURRENCE_TASK_FILES`, `GtdTaskFilePath`; header comment states the folder's import rule
- `packages/core/tsconfig.layout.json` (new) — extends the package tsconfig with `types: []`, `lib: ["ES2022"]`, `noUncheckedSideEffectImports: true`, `noEmit: true`, `include: ["src/layout/**/*.ts"]`; the Node-freedom guard
- `packages/core/package.json` (modified) — `exports["./layout"]` → `dist/layout/index.{js,d.ts}`; `typecheck` runs `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.layout.json`
- `packages/core/src/gtd-layout.ts` (modified) — imports `dailyNoteDate` from `./layout/daily-note.js` and `GTD_TASK_FILES` from `./layout/gtd-task-files.js`; `DAILY_NOTE_PATH` and the `dailyNoteDate` function removed (moved); gates untouched
- `packages/core/src/index.ts` (modified) — `export * from "./layout/index.js"` replaces the explicit `gtd-task-files` block and the `dailyNoteDate` line in the `gtd-layout` block; the public surface of `@gtd/core` is unchanged
- `packages/core/src/task-occurrences.ts`, `packages/core/src/vault-readiness.ts` (modified) — import paths only (`./layout/…`); `vault-readiness.ts` keeps its legacy re-export of `GTD_TASK_FILES`
- `packages/core/src/__tests__/gtd-layout.test.ts` (modified) — `dailyNoteDate` now imported from `../layout/daily-note.js`; the test block itself is unchanged
- `apps/server/src/routes/daily-notes.ts` (modified) — `DailyNoteRef.date` typed `IsoDate` (imported from `@gtd/core`), no cast; `toDailyNoteRefs` unchanged
- `apps/web/package.json` (modified) — `dependencies["@gtd/core"] = "workspace:*"`
- `pnpm-lock.yaml` (modified) — `apps/web` importer gains `'@gtd/core': specifier: workspace:* / version: link:../../packages/core` (hand-written, see Status; `apps/web/node_modules/@gtd/core` symlink created alongside, not in the tree)
- `apps/web/src/app/vault/vault.types.ts` (modified) — `VAULT_TASK_FILES` and its "keep both in sync" comment removed; `VaultTaskFile = GtdTaskFilePath`, `DailyNoteRef.date: IsoDate`, both from `@gtd/core/layout`
- `apps/web/src/app/i18n/local-date.ts` (modified) — local `IsoLocalDate` type removed; `systemLocalToday` and `APP_TODAY` use `IsoDate` from `@gtd/core/layout`
- `apps/web/src/app/mock/mock-app-context.ts` (modified) — `MOCK_TODAY` satisfies `IsoDate` from `@gtd/core/layout`
- `packages/core/src/access-policy.ts` (moved from `packages/core/src/gtd-layout.ts`; content = the Task-3.1 state of that file) — the vault access rule (`canRead`/`canWrite`/`isPastDaily`/`isInActiveScope`/`isInArchiveScope`/`isCanonicalTaskFile`); rename only, decision 11
- `packages/core/src/__tests__/access-policy.test.ts` (moved from `__tests__/gtd-layout.test.ts`) — import source `../access-policy.js`, six `describe` prefixes `gtd-layout —` → `access-policy —`; assertions unchanged
- `packages/core/src/search.ts`, `packages/core/src/tools.ts`, `packages/core/src/__tests__/file-repository.contract.ts` (modified) — import path `./gtd-layout.js` → `./access-policy.js` only
- `packages/core/src/__tests__/tools.test.ts` (modified) — one comment names `access-policy.test.ts` instead of `gtd-layout.test.ts`
- `docs/specs/angular-chat-ui.md` (modified) — two references "`gtd-layout.ts` allowlist" → "`access-policy.ts` allowlist" (living spec; task logs and the plan keep the historical name)
- `README.md` (modified) — "Run it locally" gains the build-order note: `pnpm -r build|test` is topological, a direct `pnpm --filter web …` or `--filter @gtd/server …` needs `pnpm --filter @gtd/core build` first

### Files Read (Context Only)
- `packages/core/tsconfig.json`, `tsconfig.base.json` (NodeNext, `noUncheckedIndexedAccess`), `packages/core/vitest.config.ts`, `packages/core/dist/` listing (build state)
- `packages/core/src/search.ts`, `tools.ts` (grep: `gtd-layout` importers), `__tests__/vault-readiness.test.ts`, `__tests__/file-repository.contract.ts` (grep: who imports `GTD_TASK_FILES` / `canRead` and from where)
- `apps/web/tsconfig.json` (`moduleResolution: bundler`, `types: []`), `tsconfig.app.json`, `tsconfig.spec.json`, `angular.json` (build = `@angular/build:application`, test = `@angular/build:unit-test` + vitest)
- `apps/web/src/app/navigation/screen-registry.ts` (the five task-file literals typed through `VaultTaskFile`), `app.routes.ts`, `vault/vault-file-screen.ts`, `vault/daily-note-detail-screen.ts` (`date` input is `string`), `vault/http-vault.repository.ts`, `mock/mock-vault-data.ts` (grep), `testing/vault-testing.ts` (grep: `DailyNoteRef` consumers)
- `apps/server/package.json`, `apps/server/tsconfig.json` (resolution precedent through package `exports`), `apps/server/src/__tests__/daily-notes-route.test.ts` (grep: `toDailyNoteRefs` call shape), `apps/server/src/__tests__/vault-init.test.ts` (grep)
- `package.json` (root scripts), `pnpm-workspace.yaml`, `pnpm-lock.yaml` (importer format for the hand-written entry), `apps/server/node_modules/@gtd/` (symlink shape to replicate)
- `docs/work/phase-2a/task-log/task-3-http-vault-repository.md` (predecessor; decision 11 = origin of this task), `task-2-files-daily-notes-endpoints.md` (grep: decisions 10–12 — why the copy existed, `DAILY_NOTE_PATH` capture groups)

### Key Decisions
— session 2026-10-31
1. **`IsoLocalDate` renamed to core's `IsoDate`, no alias.** The plan left "re-export as `IsoLocalDate`" or "rename the three consumers" open. The three consumers (`local-date.ts`, `vault.types.ts`, `mock-app-context.ts`) now import `IsoDate` from `@gtd/core/layout`; a re-export under the old name would have been a second name for the same type, against the task's point of one definition.
2. **`GTD_TASK_FILES` is not imported in `apps/web`; only the types are.** T3.1-AC-02 names the value, but no web code consumes the array: `screen-registry.ts` lists the five paths as literals, which `VaultTaskFile = GtdTaskFilePath` now checks against core's union (a typo there is a compile error). An unused value import would have been AC cosmetics. The AC is read as "the web resolves the layout through `@gtd/core/layout`".
3. **`dailyNoteDate` lives only in `layout/daily-note.ts`; `gtd-layout.ts` imports it and does not re-export it.** One module, one import path; the `gtd-layout.test.ts` block changed only its import source (AC-03 "against the moved module"). `TASK_OCCURRENCE_TASK_FILES` moved with `gtd-task-files.ts` as-is (the plan's "move as-is") although it is a search-order concern rather than layout; splitting it would have changed a public export for no consumer.
4. **Main barrel re-exports the folder with `export *`.** The layout barrel is the single explicit list; a second explicit list in `index.ts` would drift. Everything else in `index.ts` stays named.
5. **Guard tightened with `noUncheckedSideEffectImports` (plan deviation, found by the probe).** The plan's guard (`types: []`, `lib: ["ES2022"]`) accepted a bare `import "node:fs";` — TypeScript ignores unresolvable side-effect imports unless that flag is set (TS ≥ 5.6; core runs 5.9.3). A named import (`import { readFileSync } from "node:fs"`) failed as planned. With the flag both shapes fail with TS2307. Recorded in Test Evidence.
6. **`IsoDate` narrowing is one `as IsoDate` at the regex boundary.** `match[1]` is `string | undefined` under `noUncheckedIndexedAccess`; the regex `(\d{4})-(\d{2})-(\d{2})` is the proof that group 1 has the template-literal shape, stated in a two-line comment. Rejected: a separate `isIsoDate` type guard re-testing the same string (double validation), and rebuilding the string from the numeric groups (loses zero-padding or needs its own cast). Precedent: `systemLocalToday()` in web already casts the same way.
7. **Web resolves `@gtd/core/layout` through the package `exports`, not a tsconfig `paths` mapping.** Angular's esbuild application builder, `ngc`, and the vitest unit-test builder all resolved the symlinked `dist` without configuration (`moduleResolution: bundler` honours the `types` condition). The plan's fallback (`paths` onto `src`) was not needed.
8. **`pnpm install` replaced by a hand-made link + lockfile entry (sandbox constraint, not a design choice).** `pnpm install --offline` failed with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK … Read-only file system`; the store lock lives outside the sandbox allowlist and a sandbox bypass was declined by the permission gate. The symlink `apps/web/node_modules/@gtd/core → ../../../../packages/core` mirrors `apps/server/node_modules/@gtd/core`; the lockfile entry mirrors the server importer's. Verification owed: Lutz runs `pnpm install --frozen-lockfile` once; it fails if pnpm would have generated the entry differently (decision 14). Side effect inside the sandbox: pnpm 12's `verifyDepsBeforeRun` tried to re-install before every script and failed the same way, so the per-package checks were run with `--config.verify-deps-before-run=false`; this disappears after a real install.
9. **`dailyFilePath(date: string)` and `VaultDailyFile` (`daily/${string}.md`) stay untyped by `IsoDate`.** `daily-note-detail-screen.ts` feeds the route param (`string`, validated by the guard) into it; tightening would ripple into routing and is outside this task.
10. **Stale `dist/gtd-task-files.*` removed by name.** `tsc` does not clean `dist`; the four old files (`.js`, `.d.ts`, maps) were deleted explicitly so nothing can still resolve the pre-move path. `dist/` is build output, not in the tree.

— session 2026-10-31 (after the first wrap-up; user review of the structure)
11. **`gtd-layout.ts` renamed to `access-policy.ts` (plan deviation, user decision).** Lutz flagged that `src/layout/` next to `src/gtd-layout.ts` reads as two names for one thing. They are not: `layout/` is the *shape* of the vault (which paths exist), `gtd-layout.ts` the *rule over that shape* (which access the LLM tools and the HTTP API may perform — read, write, search). Name chosen over the alternatives: `permission` is reserved for the user-level vocabulary that Supabase Auth/RLS bring in Tasks 9/10; `gate` is the code's word for the enforcement point (`buildTools` boundary, files route), not the rule; `scope` covers only the two search predicates; a `gtd-` prefix adds nothing since everything in core is GTD (it carried meaning only for the GTD folder convention itself). Mechanical consequences: two files moved (plain `mv`), five import sites, six `describe` prefixes, one test comment, two spec references. The plan block still says `gtd-layout.ts`; this log is the record. Prettier reports `search.ts` and `file-repository.contract.ts` as non-conforming — both already were at HEAD (checked with `git show HEAD:… | prettier --check`); the one-line import edits were not used as an excuse to reformat them.
12. **Archive scope checked at Lutz's request — dead since the phase-1 Task-5 redesign, left in place, decision deferred post-POC.** Finding: `isInArchiveScope` matches only `archive/daily/YYYY-MM-DD.md`, a legacy layout that `canRead` has denied since the Task-5 redesign (2026-05-20, `docs/work/main/task-log/task-5-daily-gate-unification.md` decision 2) and whose snippets the tool-layer postfilter drops; `search_files` `scope: "archive"` therefore always returns empty and `"all"` ≡ `"active"`. The spec says so explicitly (`architecture.md` "Archive Layout & Lifecycle", search tool contract: "reserved for API stability and possible future non-daily archive subpaths"), and prompt rule T-C5 still steers the model toward an empty scope. Removing the predicate alone would be safe but touches `search.ts`, the tool description and ~60 test references across three files; removing the scope parameter changes the `FileRepository` contract, both repository implementations, the tool schema, T-C5 and the spec. Both are a task of their own, and the plan preamble keeps daily-folder scaling explicitly OUT. `docs/improvements.md` already holds the competing idea (reinterpret scope by age: active = recent dailies, archive = older). No code change in this task; the user decides retire-vs-reinterpret after the POC.

— session 2026-10-31 (Codex `/review quick` + CodeScene gate triage)
13. **Codex LOW — this log overstated the guard ("folder rule enforced by the guard") — fixed, log only.** Verified in-session: a probe `import "../access-policy.js";` prepended to `layout/daily-note.ts` passes `tsc -p tsconfig.layout.json` (exit 0) because `access-policy.ts` → `file-repository.ts` → `edit.ts` is Node-free; probe removed. The guard proves Node-freedom of the reachable graph; the folder boundary is a convention stated in `layout/index.ts`. Considered and not done: `"rootDir": "src/layout"` in `tsconfig.layout.json` would make TypeScript reject any file outside the folder (TS6059), one line, unverified under `noEmit`. Deferred until a second browser consumer exists; today a stray in-package import would only enlarge the web bundle, not break it.
14. **Codex blind spot — fresh install not reproduced — acknowledged, check sharpened, stays manual.** Codex's `pnpm install --frozen-lockfile` replaces the plain `pnpm install` as the owed check: it fails if pnpm would generate the hand-written lockfile entry differently instead of silently rewriting it. Still not runnable in the sandbox (store lock, decision 8).
15. **Accepted CodeScene findings (Topf B, all unchanged vs HEAD): `tools.ts` `editFileTool` cc=11 / seven parameters, `writeFileTool` six parameters, file-wide primitive/string-parameter hints; `tools.test.ts` retry test cc=10, 98-line error-case test, six duplication hits (L575/587/601/1043/1056/1071); `file-repository.contract.ts` duplication at L234/L252.** This task touched those files by one import line each; the debt is phase-1 tool-layer structure that Tasks 4/5 (turn engine extraction) will be in anyway. No register entry: it is visible in every CodeScene run of those files.

### Review Focus
- **Behavior claims:** (1) `@gtd/core`'s public surface is unchanged: every symbol previously exported from `index.ts` (`dailyNoteDate`, `GTD_TASK_FILES`, `GTD_TASK_FILE_PATHS`, `TASK_OCCURRENCE_TASK_FILES`, `GtdTaskFilePath`) still resolves, now via `export * from "./layout/index.js"`; server and CLI compile and test without source change beyond the one server type. (2) `dailyNoteDate` accepts and rejects exactly the same strings as before (the regex and calendar check moved verbatim); only its return type narrowed to `IsoDate | undefined`. (3) `apps/web` compiles its five task-file literals against core's `GtdTaskFilePath`, and `ng build`, `ngc` and `ng test` resolve `@gtd/core/layout` from `packages/core/dist` through the package `exports`.
- **Plan deviations:** `gtd-layout.ts` → `access-policy.ts` with its test (decision 11) → the plan's "stay where they are" for the gates holds in substance, the file name does not. Guard gained `noUncheckedSideEffectImports: true` (decision 5) → without it the plan's own AC-01 probe passed silently. `GTD_TASK_FILES` not imported in web (decision 2) → type-only consumption. `pnpm install` not run → hand-written link + lockfile entry (decision 8), confirmation owed. Files beyond Key Locations: `task-occurrences.ts`, `vault-readiness.ts`, `gtd-layout.test.ts` (import paths), `mock-app-context.ts` (rename), `pnpm-lock.yaml`.
- **Assumptions / choices:** rename over alias (decision 1); single cast at the regex boundary (decision 6); `export *` for the layout sub-barrel (decision 4); `dailyFilePath` left on `string` (decision 9).
- **Scope notes:** Rename touches `search.ts`, `tools.ts`, two test files and the Angular spec by import path / name only; `isInArchiveScope` and the search scope stay as they were (decision 12). README gains the build-order paragraph. No behavior change in any gate, route, screen or test; test counts identical. The `apps/web/node_modules/@gtd/core` symlink exists only on this machine until `pnpm install` recreates it.
- **Read next:** `packages/core/tsconfig.layout.json` + `packages/core/package.json` `typecheck` — the guard is the task's safety property; confirm `types: []` and the side-effect flag are both there and that the script runs it. `packages/core/src/layout/daily-note.ts` — the one cast and its comment. `apps/web/src/app/vault/vault.types.ts` — confirm nothing layout-shaped remains besides `dailyFilePath`. `packages/core/src/access-policy.ts` vs `git show HEAD:packages/core/src/gtd-layout.ts` — the diff must be exactly: two import lines, `DAILY_NOTE_PATH` and `dailyNoteDate` removed.

### Test Evidence
— session 2026-10-31 (final code state unless noted)

```
pnpm --filter @gtd/core build      → tsc -p tsconfig.json: clean; dist/layout/{index,daily-note,gtd-task-files}.{js,d.ts} present
pnpm --filter @gtd/core typecheck  → tsc -p tsconfig.json --noEmit && tsc -p tsconfig.layout.json: clean
pnpm --filter @gtd/core test       → 18 files, 317 passed
pnpm --filter @gtd/server typecheck → clean (DailyNoteRef.date: IsoDate, no cast)
pnpm --filter @gtd/server test     → 9 files, 85 passed
pnpm --filter @gtd/cli typecheck   → clean
pnpm --filter @gtd/cli test        → 11 files, 57 passed
pnpm --filter web typecheck        → ngc -p tsconfig.app.json --noEmit: clean
pnpm --filter web test             → 17 files, 119 passed
pnpm --filter web build            → ng build (production): main 421.16 kB raw / 108.68 kB transfer, no warnings
prettier --check <14 changed ts/json files> → All matched files use Prettier code style!
```

The server/CLI/web commands ran with `--config.verify-deps-before-run=false` because pnpm's pre-run install cannot acquire the store lock inside the sandbox (decision 8). `pnpm -r test` was not run as one command for the same reason; the per-package counts above are the AC-03 numbers.

Probe for T3.1-AC-01 (`packages/core/src/layout/daily-note.ts`, line prepended, file restored from a `$TMPDIR` copy after each run; probe is gone — `head -1` shows the original doc comment):

```
import "node:fs";                          (bare side-effect import)
  guard, plan config (types:[] + lib)      → exit 0   ← hole: TS ignores unresolvable side-effect imports
  guard + noUncheckedSideEffectImports     → src/layout/daily-note.ts(1,8): error TS2307: Cannot find module 'node:fs' or its corresponding type declarations.  exit 2
import { readFileSync } from "node:fs";    (named import)
  guard, plan config                       → src/layout/daily-note.ts(1,30): error TS2307: Cannot find module 'node:fs' …  exit 2
  full tsconfig.json --noEmit (contrast)   → exit 0   (package config sees @types/node, as intended)
guard after restore                        → exit 0 (both configs)
```

Quick functional check (run in-session): `pnpm --filter @gtd/core typecheck` exits 0; with `import "node:fs";` prepended to `src/layout/daily-note.ts` the same command fails with the TS2307 above.

`pnpm install` was not runnable in the sandbox (store lock, decision 8); Lutz ran the sharpened check outside it (2026-10-31):

```
$ pnpm install --frozen-lockfile
✓ Lockfile passes supply-chain policies (739 entries in 2s)
Lockfile is up to date, resolution step is skipped
Already up to date
```

The hand-written `@gtd/core` entry for `apps/web` is therefore exactly what pnpm generates; `git diff HEAD -- pnpm-lock.yaml` still shows only the three added lines and `apps/web/node_modules/@gtd/core` remains the workspace symlink.

— session 2026-10-31 (after the rename; final code state)

```
pnpm --filter @gtd/core build      → clean; dist/access-policy.js present, stale dist/gtd-layout.* removed by name
pnpm --filter @gtd/core typecheck  → both configs clean
pnpm --filter @gtd/core test       → 18 files, 317 passed   (access-policy.test.ts replaces gtd-layout.test.ts, same tests)
pnpm --filter @gtd/server test     → 9 files, 85 passed
pnpm --filter @gtd/cli test        → 11 files, 57 passed
pnpm --filter web typecheck        → clean
pnpm --filter web test             → 17 files, 119 passed
prettier --check <7 rename-touched files> → warnings only for search.ts and file-repository.contract.ts, both non-conforming at HEAD already (decision 11)
rg 'gtd-layout' packages/core/src README.md CLAUDE.md docs/specs docs/improvements.md → no hits after the spec edit
```

The earlier evidence block (guard probe, `ng build`) predates the rename; the rename changed no behavior and no `dist/layout/*` file, so the probe result stands and `ng build` was not repeated.

— session 2026-10-31 (independent review of the state above; no code changed since)

```
Codex /review quick  → 578 tests pass, core/server/web typechecks green, node-import probes fail as expected;
                       hotspots: none; 1 LOW (log claim about the folder boundary, fixed — decision 13);
                       blind spot: fresh install not reproduced (→ pnpm install --frozen-lockfile, decision 14)
CodeScene gate (/cs) → 16 files checked, 12 scored 7.84–10.0; Topf A (current changes): no findings;
                       Topf B (pre-existing, unchanged vs HEAD): tools.ts, tools.test.ts, file-repository.contract.ts — accepted (decision 15)
verification probe   → import "../access-policy.js" prepended to src/layout/daily-note.ts:
                       tsc -p tsconfig.layout.json exit=0 (Codex's claim confirmed); file restored, guard clean again (exit=0)
```

### Acceptance Coverage
- **T3.1-AC-01:** passed — `pnpm --filter @gtd/core typecheck` runs `tsc -p tsconfig.layout.json`; probe `import "node:fs"` under `src/layout/` fails with TS2307 (both bare and named forms, see Test Evidence); probe removed.
- **T3.1-AC-02:** passed — `vault.types.ts`, `local-date.ts`, `mock-app-context.ts` import `GtdTaskFilePath` / `IsoDate` from `@gtd/core/layout`; `VAULT_TASK_FILES` is gone (`rg` finds no reference); `ng build` and `ng test` (119) succeed. Deviation: `GTD_TASK_FILES` is not imported because no web code uses the value (decision 2).
- **T3.1-AC-03:** passed — core 317 · server 85 · cli 57 · web 119, identical to the plan's counts; the "dailyNoteDate (shared daily-note definition)" block (now in `access-policy.test.ts`, decision 11) green against `../layout/daily-note.js`. Gap in form only: suites run per package rather than as one `pnpm -r test` (decision 8).
- **T3.1-AC-04:** passed — `dailyNoteDate(): IsoDate | undefined` in `layout/daily-note.ts`; `apps/server/src/routes/daily-notes.ts` `DailyNoteRef.date: IsoDate` with no cast, server typecheck clean.

### Open Issues
- Search scope `archive` is dead (decision 12): retire the scope parameter + `isInArchiveScope`, or reinterpret the scope by age — user decision after the POC. Covered by the existing `docs/improvements.md` entry "Daily-folder scaling … reinterpret the `search_files` scope by age" (from Task 2); no new register line added, the entry may want the "or retire" alternative appended when Lutz decides. (Task 3.2 builds on this entry and is already planned.)

### Context for Next Task
- **For Task 3.2 (`@gtd/api`):** import `IsoDate` and `GtdTaskFilePath` from `@gtd/core/layout` — the contract package must not touch the main `@gtd/core` barrel (Node). `DailyNoteRef` currently exists twice with identical shape: `apps/server/src/routes/daily-notes.ts` (`date: IsoDate`) and `apps/web/src/app/vault/vault.types.ts` (`readonly date: IsoDate`); both are the DTO Task 3.2 lifts into the package. Core's `package.json` `exports` map is the template for the new package's entry.
- **Naming:** `packages/core/src/layout/` = the vault's shape (browser-safe); `packages/core/src/access-policy.ts` = the rule over it (`canRead`/`canWrite`/search scope), consumed by `tools.ts`, `search.ts` and the server files route. Task-log and plan text older than this session say `gtd-layout.ts` for the same file.
- **Guard pattern:** a Node-free subpath = a folder with its own barrel + a tsconfig with `types: []`, `lib` without DOM, `noUncheckedSideEffectImports: true`, and `include` limited to that folder, run from the package's `typecheck` script. TypeScript follows imports transitively, so the guard proves Node-freedom of everything reachable from the entry. The folder rule "nothing imports from outside" stays a convention: an in-package import such as `../access-policy.js` passes the guard because that chain is Node-free too (decision 13).
- **Resolution:** Angular (`@angular/build` application + unit-test builders, `ngc`) consumes a workspace package's `dist` through `exports` with no `paths` mapping. Consequence: after editing anything under `packages/core/src/layout/`, run `pnpm --filter @gtd/core build` before `ng test`/`ng build`, or the web sees stale `dist`.
- **Gotchas:** (1) `tsc` does not clean `dist`; a moved module leaves its old output behind — delete by name. (2) pnpm 12 `verifyDepsBeforeRun` re-installs before every `pnpm --filter … <script>`; inside the sandbox that fails on the store lock, `--config.verify-deps-before-run=false` skips it. (3) `tsc` is not on PATH in the sandbox shell; use `pnpm exec tsc`. (4) The sandbox projects shell dotfiles (`.zprofile` etc.) into the working directory as untracked files; they are not part of the tree.

### Git State
```
$ git diff HEAD --stat
 README.md                                          |   5 +
 apps/server/src/routes/daily-notes.ts              |   9 +-
 apps/web/package.json                              |   1 +
 apps/web/src/app/i18n/local-date.ts                |  10 +-
 apps/web/src/app/mock/mock-app-context.ts          |   4 +-
 apps/web/src/app/vault/vault.types.ts              |  22 +-
 docs/specs/angular-chat-ui.md                      |   4 +-
 .../task-log/task-3.1-core-layout-entry.md         | 151 ++++++++++++
 packages/core/package.json                         |   6 +-
 .../core/src/__tests__/file-repository.contract.ts |   2 +-
 packages/core/src/__tests__/gtd-layout.test.ts     | 257 ---------------------
 packages/core/src/__tests__/tools.test.ts          |   2 +-
 packages/core/src/gtd-layout.ts                    |  94 --------
 packages/core/src/index.ts                         |  10 +-
 packages/core/src/layout/daily-note.ts             |  24 ++
 packages/core/src/{ => layout}/gtd-task-files.ts   |   0
 packages/core/src/layout/index.ts                  |  10 +
 packages/core/src/search.ts                        |   2 +-
 packages/core/src/task-occurrences.ts              |   4 +-
 packages/core/src/tools.ts                         |   2 +-
 packages/core/src/vault-readiness.ts               |   4 +-
 packages/core/tsconfig.layout.json                 |  10 +
 pnpm-lock.yaml                                     |   3 +
 23 files changed, 238 insertions(+), 398 deletions(-)
 (plus the untracked access-policy.ts / access-policy.test.ts, which `git diff HEAD` does not show)

$ git status --short        (index state as found, see Status — the agent staged nothing)
M  README.md
M  apps/server/src/routes/daily-notes.ts
M  apps/web/package.json
M  apps/web/src/app/i18n/local-date.ts
M  apps/web/src/app/mock/mock-app-context.ts
M  apps/web/src/app/vault/vault.types.ts
 M docs/specs/angular-chat-ui.md
A  docs/work/phase-2a/task-log/task-3.1-core-layout-entry.md
M  packages/core/package.json
 M packages/core/src/__tests__/file-repository.contract.ts
MD packages/core/src/__tests__/gtd-layout.test.ts          ← moved to access-policy.test.ts
 M packages/core/src/__tests__/tools.test.ts
MD packages/core/src/gtd-layout.ts                         ← moved to access-policy.ts
MM packages/core/src/index.ts
A  packages/core/src/layout/daily-note.ts
R  packages/core/src/gtd-task-files.ts -> packages/core/src/layout/gtd-task-files.ts
A  packages/core/src/layout/index.ts
 M packages/core/src/search.ts
M  packages/core/src/task-occurrences.ts
 M packages/core/src/tools.ts
M  packages/core/src/vault-readiness.ts
A  packages/core/tsconfig.layout.json
M  pnpm-lock.yaml
?? packages/core/src/__tests__/access-policy.test.ts
?? packages/core/src/access-policy.ts
```
(Untracked shell dotfiles the sandbox projects into the working directory are omitted; they do not exist in the real tree.)

### Sessions
- claude-code 6c9cba60-158f-449c-93a1-2ad1ee6f7c3a (2026-10-31) — transcript: ~/.claude/projects/-home-lutz-projects-keppt-app/6c9cba60-158f-449c-93a1-2ad1ee6f7c3a.jsonl
