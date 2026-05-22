# Task 7 - `find_task_occurrences` tool

### Task

Implement a bounded raw-evidence occurrence-search helper and expose it through `buildTools` as `find_task_occurrences`.

### Status

DONE

### Files Modified

- `docs/work/main/plan.md` (modified) - amended the Task 7 contract after implementation review so occurrence blocks no longer return matched-candidate metadata and empty-normalized candidate calls do not read the vault.
- `packages/core/src/gtd-task-files.ts` (new) - centralized the five GTD task-file paths plus the occurrence-search ordering so production code does not duplicate the same path list.
- `packages/core/src/gtd-layout.ts` (modified) - switched the GTD gate to use the centralized task-file constants.
- `packages/core/src/vault-readiness.ts` (modified) - reused and re-exported the centralized `GTD_TASK_FILES` constant for first-run task-file init.
- `packages/core/src/task-occurrences.ts` (new) - added `findTaskOccurrences`, bounded surface discovery, normalized literal matching, raw context block generation, and near-adjacent block merging.
- `packages/core/src/tools.ts` (modified) - registered `find_task_occurrences` in `buildTools` with Zod validation and a description that documents the search horizon and negative-result meaning.
- `packages/core/src/index.ts` (modified) - exported the occurrence helper/types and centralized GTD task-file constants.
- `packages/core/src/__tests__/task-occurrences.test.ts` (new) - covered normalization, bounded surfaces, missing files, raw-only output shape, CRLF/CR line handling, block merging, and the real Rasen eval-vault regression.
- `packages/core/src/__tests__/tools.test.ts` (modified) - added `MockLanguageModelV4` integration coverage for the new tool schema, validation, injected clock, and tool description.
- `docs/work/main/task-log/task-7-find-task-occurrences.md` (new) - task wrap-up summary.

### Files Read (Context Only)

- `docs/work/main/plan.md` - preamble, Task 7 block, and Task 8 block to keep Task 7's tool contract aligned with the upcoming prompt rewrite.
- `docs/work/main/task-log/task-6-quick-replies.md` - direct predecessor; current pattern for adding side-effect-free tools through `buildTools` and testing them through `MockLanguageModelV4`.
- `docs/work/main/task-log/task-5-daily-gate-unification.md` - daily-note gate and task-file initialization context.
- `docs/work/main/task-log/task-3.5-gtd-layout-policy.md` - original `buildTools({ now })` and GTD gate boundary context.
- `packages/core/src/file-repository.ts` - `FileRepository`, `FileNotFoundError`, and `InvalidPathError` shapes used by the helper.
- `packages/core/src/local-file-repository.ts` - list/read/search behavior and local-file test seams.
- `packages/core/src/search.ts` - existing `formatToday` and search-scope helpers.
- `packages/core/src/__tests__/tools.test.ts` - existing tool integration patterns.
- `docs/evals/scenario-01-rasen-double-schedule/vault/tasks/focus.md` - real duplicated Rasen fixture content.
- `docs/evals/scenario-01-rasen-double-schedule/vault/tasks/next-actions.md` - real canonical Rasen fixture content.
- `docs/evals/scenario-01-rasen-double-schedule/vault/daily/2026-05-22.md` - real future Daily Plan Rasen fixture content.

### Key Decisions

1. **Occurrence search stays as core domain logic, not repository logic.** The helper encodes product-specific semantics - the five task files, daily horizon, future dailies, and raw Markdown evidence. Repository optimizations can come later through bulk reads without moving the task identity semantics into storage.
2. **No matched-candidate metadata in output.** The first draft returned `candidates` per block, but review concluded that it repeats noisy metadata and can over-prime the model toward "string match equals same task." The output is now raw evidence only: `file`, `line`, and `rawBlock`.
3. **Tool input remains `candidates: string[]`.** The model still supplies literal wording plus close variants, but those variants are only a search mechanism, not part of the evidence returned to the model.
4. **Normalize enough for Markdown/German tolerance, but do not add fuzzy search.** Matching lowercases, strips combining marks through NFKD normalization, and turns punctuation/Markdown markers into whitespace. No ranking, stemming library, or fuzzy distance was added.
5. **Empty-normalized candidates short-circuit without reading.** If every candidate becomes empty after normalization, the helper returns `{ searchedFiles: [], blocks: [] }` and does not list or read the vault.
6. **The search surface is bounded and deterministic.** It reads the five task files, date-formatted dailies from `today - 30 days` onward, and all future date-formatted dailies. Missing files are skipped.
7. **Task-file paths are centralized for production code only.** `gtd-task-files.ts` now holds the path constants. Tests and prompt strings intentionally keep literals where the exact file path is part of the scenario or product wording.
8. **Line splitting accepts LF, CRLF, and CR.** `rawBlock` is still line text without separators, but CRLF/CR files no longer leak `\r` into output.
9. **No parallel read/cache optimization yet.** Current CLI use and bounded surfaces do not justify the extra complexity. The future performance path is bulk fetch/readMany or database-side selection before any cache or search-index work.

### Test Evidence

- `pnpm test` - passed for the workspace:

```text
> keppt-app@0.0.0 test /home/lutz/projects/keppt-app
> pnpm -r test

Scope: 2 of 3 workspace projects
packages/core test$ vitest run
packages/core test: Done
apps/cli test$ vitest run
apps/cli test: Done
```

- `pnpm typecheck` - passed for core and CLI:

```text
> keppt-app@0.0.0 typecheck /home/lutz/projects/keppt-app
> pnpm -r typecheck

Scope: 2 of 3 workspace projects
packages/core typecheck$ tsc -p tsconfig.json --noEmit
packages/core typecheck: Done
apps/cli typecheck$ tsc -p tsconfig.json --noEmit
apps/cli typecheck: Done
```

- `pnpm exec prettier --check packages/core/src/task-occurrences.ts packages/core/src/__tests__/task-occurrences.test.ts packages/core/src/tools.ts packages/core/src/__tests__/tools.test.ts packages/core/src/gtd-task-files.ts packages/core/src/gtd-layout.ts packages/core/src/vault-readiness.ts packages/core/src/index.ts` - passed:

```text
Checking formatting...
All matched files use Prettier code style!
```

- `pnpm --filter @gtd/core test -- --run packages/core/src/__tests__/task-occurrences.test.ts` - passed after the line-ending regression was added. Because of Vitest argument forwarding in this workspace, this ran the full core suite: 16 files, 289 tests.

### Acceptance Coverage

- **T7-AC-01:** passed - `task-occurrences.test.ts > matches literal candidates through Markdown markers, case, whitespace, and punctuation drift`.
- **T7-AC-02:** passed - `task-occurrences.test.ts > matches umlaut candidates against decomposed and plain-letter content`.
- **T7-AC-03:** passed - `task-occurrences.test.ts > reads exactly the bounded task and daily surfaces` and `tools.test.ts > uses the buildTools injected clock for the 30-day daily horizon`.
- **T7-AC-04:** passed - `task-occurrences.test.ts > skips missing files but still reports files it actually read`.
- **T7-AC-05:** passed - `task-occurrences.test.ts > merges overlapping and near-adjacent context windows with candidate union`; the approved plan amendment removed returned matched-candidate metadata.
- **T7-AC-06:** passed - `task-occurrences.test.ts > returns only raw-evidence fields` asserts `searchedFiles` and block fields `file`, `line`, `rawBlock` only.
- **T7-AC-07:** passed - `tools.test.ts > exposes exactly the candidates input property` and validation tests reject missing/empty candidates.
- **T7-AC-08:** passed - `tools.test.ts > uses the buildTools injected clock for the 30-day daily horizon`.
- **T7-AC-09:** passed - `task-occurrences.test.ts > finds the real Rasen double-schedule evidence in the eval vault` uses `docs/evals/scenario-01-rasen-double-schedule/vault` and verifies the future Daily Plan evidence is returned.

### Open Issues

None for Task 7.

### Context for Next Task

- `findTaskOccurrences(repo, today, candidates)` returns:

```ts
{
  searchedFiles: string[];
  blocks: Array<{
    file: string;
    line: number;
    rawBlock: string[];
  }>;
}
```

- `buildTools` exposes `find_task_occurrences` with exactly one input property: `candidates: string[]`.
- The tool description already tells the model the bounded horizon and that negative results mean "not found in this bounded placement horizon," not "never existed."
- `TASK_FILE_REMINDER` still carries the old broad routine-read wording. Task 8 is expected to shrink or replace it so placement evidence comes from `find_task_occurrences` plus targeted `read_file`.
- Central task-file constants now live in `packages/core/src/gtd-task-files.ts`: `GTD_TASK_FILE_PATHS`, `GTD_TASK_FILES`, and `TASK_OCCURRENCE_TASK_FILES`.
- Task 8 should teach the model when to call `find_task_occurrences`, how to interpret raw blocks, and when to read matched files before writing.

### Git State

`git diff --stat`:

```text
docs/work/main/plan.md                    | 12 ++--
packages/core/src/__tests__/tools.test.ts | 95 +++++++++++++++++++++++++++++++
packages/core/src/gtd-layout.ts           | 17 ++----
packages/core/src/index.ts                | 12 +++-
packages/core/src/tools.ts                | 21 +++++--
packages/core/src/vault-readiness.ts      | 14 ++---
6 files changed, 139 insertions(+), 32 deletions(-)
```

`git status --short`:

```text
M docs/work/main/plan.md
M packages/core/src/__tests__/tools.test.ts
M packages/core/src/gtd-layout.ts
M packages/core/src/index.ts
M packages/core/src/tools.ts
M packages/core/src/vault-readiness.ts
?? docs/work/main/task-log/task-7-find-task-occurrences.md
?? packages/core/src/__tests__/task-occurrences.test.ts
?? packages/core/src/gtd-task-files.ts
?? packages/core/src/task-occurrences.ts
```
