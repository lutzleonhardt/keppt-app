# Task 3.5 — GTD layout policy gate

**Date:** 2026-05-08
**Plan:** `docs/plans/phase-1-cli.md` — listed as item `3.5` in
the Tasks-at-a-glance bullet list. Closes Codex
adversarial-review finding #1 against Task 3 (see
`docs/task-log/task-3-cli-vercel-ai-sdk.md` Open Issue 4 +
Decision 10), plus five further Codex findings raised across
three rounds of review against this task's drafts (see Decisions
1, 7, 8, 9, and 10 below — search bypass via the broader scope
predicate, ungated `list_files`, search bypass at the *tool*
boundary even after the predicates were tightened,
prompt-vs-gate date drift across UTC midnight, and
repo-vs-tool-clock drift in `repo.search` where the repo could
drop the turn day's daily note before the tool postfilter ever
ran). One additional medium finding from the third round —
stale `daily/<yesterday>.md` becoming unreachable until a
rollover step exists — was deliberately deferred to Task 5.5
(`Vault readiness on turn start`); see Open Issues for the
verbatim text and the sequencing rationale. Slotted as `3.5`
rather than renumbering 4→5 / 5→6 / 6→7 to preserve external
references (commit messages, filenames). The next task remains
Task 4.

## Task

Land a single source-of-truth GTD layout policy module
(`packages/core/src/gtd-layout.ts`) and wire its `canRead` /
`canWrite` predicates into `buildTools(repo)` so every LLM-facing
tool — `read_file`, `write_file`, `edit_file`, `list_files`, and
`search_files` — observes the same allowlist. Refactor `search.ts`
to share the same predicates so search scope, list output, and the
read/write gate cannot drift. `FileRepository` itself stays
storage-only; the system-managed day-rollover routine still writes
`archive/daily/*` directly via `repo.write`, bypassing the LLM gate
by design.

## Status

**DONE** — `pnpm -r typecheck` clean; `pnpm -r test` green
(114 core + 1 CLI test passing). New tests since Task 3:
14 in `gtd-layout.test.ts`, 7 added to `tools.test.ts`, 1 added
to the shared `file-repository.contract.ts` (which runs against
both repo impls, so +2 in the per-impl counts).

## Files Modified

### New
- `packages/core/src/gtd-layout.ts` — `canRead(filePath, today)` and
  `canWrite(filePath, today)` enforce the strict architecture
  allowlist (5 task files + `daily/<today>.md` + (read-only)
  `archive/daily/YYYY-MM-DD.md`). Both delegate path containment
  checks to `validateFilePath`, so `InvalidPathError` propagates
  and the tools layer can keep the `invalid_path` discriminant
  separate from `out_of_scope`. `isInActiveScope(p, today)` and
  `isInArchiveScope(p)` are pure (no side effect) predicates that
  mirror `canRead`'s active and archive subsets exactly — search
  is a read surface (snippets are returned to the LLM), so any
  divergence would re-open exactly the exfiltration channel
  Codex's review of the first draft flagged.
- `packages/core/src/__tests__/gtd-layout.test.ts` — 14 unit tests
  covering: each of the 5 task files allowed for read/write; today's
  daily allowed; archive readable but not writable; non-today daily
  denied for both; `tasks/projects/...`, `tasks/random.md`,
  `.obsidian/`, root `.md` files all denied; `validateFilePath`
  propagation for `..`, `.keppt/`, absolute paths, backslash;
  search-scope predicates align exactly with `canRead` (including
  rejection of `tasks/random.md`, non-date archive entries, and
  non-`.md` extensions).

### Modified
- `packages/core/src/search.ts` — `isInScope` now delegates to
  `isInActiveScope` / `isInArchiveScope`. The backslash-normalization
  step (`p.replace(/\\/g, "/")`) is preserved in `isInScope` itself
  so the predicates can stay POSIX-only — search-time normalization
  is a Windows-path concession that does not belong inside the
  policy module. Pure refactor; existing contract tests in
  `file-repository.contract.ts` continue to pass.
- `packages/core/src/file-repository.ts` — `FileRepository.search`
  signature widened from `(query, scope?)` to
  `(query, scope?, today?)`. The new optional `today` lets the
  tool layer impose the per-turn date on the repo's scope filter
  instead of letting the repo read its own clock. Default
  behavior (omitted `today`) is unchanged for non-tool callers
  and existing contract tests. (Decision 10.)
- `packages/core/src/in-memory-file-repository.ts` and
  `packages/core/src/local-file-repository.ts` — both `search`
  implementations accept and use the new `today` parameter, with
  `formatToday(this.now())` as the fallback.
- `packages/core/src/tools.ts` — gate wired into all five tools:
  `read_file`, `write_file`, `edit_file` (deny → `{ ok: false,
  error: { reason: "out_of_scope", message } }`), `list_files`
  (postfilter via `canRead`, swallowing `InvalidPathError`), and
  `search_files` (postfilter every `SearchResult.filePath` via
  `canRead` at the tool boundary — defense-in-depth, see
  Decision 8). Today-string derivation went through three iterations:
  (1) per-call `formatToday(new Date())` — drift-free *within* the
  tools but disagreed with the once-at-startup system prompt across
  UTC midnight; (2) `BuildToolsOptions { now?: () => Date }` — the
  CLI passes a closure that reads `turnNow`, refreshed at the start
  of every turn alongside the rebuilt prompt, so prompt and gate
  share one source of truth (Decision 9). `ReadFileResult` widened
  with `out_of_scope` discriminant. Brand-new `WriteFileResult =
  { ok: true } | { ok: false; error: { reason: "invalid_path" |
  "out_of_scope"; message } }` replaces the old `{ ok: true as
  const }`. New `EditFileResult` / `EditFileError` collapse the
  old `EditError` plus the gate errors into a discriminated union
  with `reason: "match" | "out_of_scope" | "invalid_path"`;
  `failedSearch` / `matchCount` / `currentContent` only present
  when `reason === "match"`. Tool descriptions updated to point
  the LLM at the new discriminants and to note that both
  `list_files` and `search_files` are restricted to the GTD layout.
- `packages/core/src/index.ts` — exports `canRead`, `canWrite`,
  `isInActiveScope`, `isInArchiveScope`, plus the new
  `BuildToolsOptions`, `WriteFileResult`, `EditFileResult`,
  `EditFileError` types. `ReadFileResult` was already exported;
  kept as is.
- `packages/core/src/__tests__/tools.test.ts` — added a
  `TrapRepository` (read/write/edit throw; list/search are no-ops)
  plus seven gate tests: one per gated tool returning
  `out_of_scope` without touching the trap (read/write/edit), a
  `list_files` regression seeding seven markdown files (allowed
  + denied) and asserting only the three allowed paths come back
  (no prefix and `prefix: "archive/"`), a `search_files`
  regression using a `LeakySearchRepository` that returns hits
  regardless of scope — asserting the tool postfilter is the
  load-bearing one — a clock-injection regression that drives a
  `read_file` with two different injected dates against the same
  repo (asserting `{ ok: true }` for 2026-05-08 then
  `out_of_scope` after rollover to 2026-05-09), and a
  midnight-rollover regression for `search_files` that wires the
  repo and the tool to *different* clocks straddling UTC
  midnight, asserting the search still returns the turn day's
  daily note (Decision 10).
- `packages/core/src/__tests__/file-repository.contract.ts` — one
  added contract case ("search does not surface content from paths
  denied by canRead") that seeds `tasks/projects/work.md`,
  `tasks/random.md`, `archive/daily/note.md`, `archive/tasks/old.md`
  with the same secret string as `tasks/inbox.md`, then asserts
  that across all three search scopes every returned hit's path
  satisfies `canRead`. Runs against both `InMemoryFileRepository`
  and `LocalFileRepository`.
- `docs/plans/phase-1-cli.md` — added the `3.5` bullet to
  Tasks-at-a-glance, pointing at this log.
- `apps/cli/src/index.ts` — replaced the once-at-startup
  `system = buildMinimalSystemPrompt(new Date())` with a per-turn
  `turnNow = new Date()` snapshot; the system prompt is rebuilt
  from `turnNow` at the start of every turn, `LocalFileRepository`
  is constructed with `{ now: () => turnNow }`, and `buildTools`
  is given the same `() => turnNow`. Three consumers — prompt,
  repo (history timestamps + the in-repo search-scope filter),
  and tool gate — share one `Date` value per turn, so the
  gate's `today`, the repo's `today`, and the prompt's
  `Today is …` line cannot disagree across a UTC midnight
  rollover. `tools` and `repo` are still constructed once at
  startup; the closures do the per-turn refresh. (Decisions 9
  and 10.)

## Files Read (Context Only)

- `docs/specs/architecture.md:790-826` — the canonical allowlist
  (file layout + day-rollover semantics) the gate encodes. The
  spec is explicit that `tasks/` contains exactly the 5 files
  and `archive/daily/` contains date-named markdown — no
  user-created sidecars, which is the spec basis for tightening
  the search predicates.
- `packages/core/src/file-repository.ts` — `validateFilePath` +
  `InvalidPathError` shape that `gtd-layout.ts` delegates to.
- `packages/core/src/edit.ts` — `EditError` shape that the new
  `EditFileError` discriminated union absorbs.
- `packages/core/src/in-memory-file-repository.ts` and
  `local-file-repository.ts` — confirm both repo impls reach
  `isInScope` only via `findMatches`, so the search refactor has
  exactly two callers and contract tests guard the boundary.
- `docs/task-log/task-3-cli-vercel-ai-sdk.md` (Open Issue 4 +
  Decision 10) and `task-2-edit-file.md` (Open Issue 2 +
  Decision 4) — context for *why* this is its own task and for
  the long-deferred `EditError` discriminant question.

## Key Decisions

1. **Single allowlist, two evaluation modes.** First draft of
   this task shipped a *broader* search predicate (`tasks/...`
   prefix, `archive/daily/...` prefix) than the read allowlist,
   on the rationale that "search may surface user-created
   sidecars." Codex's adversarial review of that draft pointed
   out — correctly — that snippets are a read surface, so any
   path search returns must also satisfy `canRead`, otherwise
   the gate is an exfiltration channel. The architecture spec
   also does not provide for sidecars; it is explicit that
   `tasks/` contains exactly the 5 files. `isInActiveScope`
   and `isInArchiveScope` were tightened to mirror the
   `canRead` allowlist exactly. They remain separate functions
   only because search predicates do not throw on bad paths
   (they iterate already-listed paths) while `canRead` does
   (it gates LLM-supplied paths).

2. **`canRead` / `canWrite` *throw* `InvalidPathError`, return
   `false` on out-of-scope.** Recommended in the handoff and kept
   as written. Lets the tools layer keep `invalid_path`
   (containment violation — traversal, `.keppt/`, absolute,
   backslash) and `out_of_scope` (well-formed path but not in
   the GTD layout) as distinct discriminants in the structured
   tool output. The LLM can reasonably retry on `out_of_scope`
   (pick a different path); on `invalid_path` it cannot, so the
   prompt can teach it that distinction later.

3. **Clock injection via `BuildToolsOptions { now? }`, with the
   CLI sharing one `turnNow` between the prompt and the gate.**
   First draft of this task picked option (b) from the handoff —
   per-call `formatToday(new Date())` inside each tool — on the
   theory that the gate just needs "today as of this invocation"
   and that re-evaluating per call avoided day-boundary drift
   inside a long REPL session. Codex's second-round review
   pointed out the bug in *that* reasoning: the system prompt is
   built once at startup, so a session that crosses UTC midnight
   ends up with a prompt that says "today is 2026-05-08" while
   the gate enforces "today is 2026-05-09," turning ordinary
   reads of `daily/2026-05-08.md` into `out_of_scope` failures
   and hiding the file the prompt just told the model to use.
   The fix: `buildTools(repo, { now })` accepts an optional clock
   thunk (defaults to `() => new Date()`); the CLI declares
   `let turnNow = new Date()`, refreshes it at the top of every
   turn just before calling `buildMinimalSystemPrompt(turnNow)`,
   and passes `() => turnNow` to `buildTools` once at startup.
   That guarantees the prompt date and the gate date come from
   the same `Date` value within each turn, while still
   refreshing automatically as the session advances day-to-day.
   Drift across turns is fine — both sources are real-time. (See
   Decision 9 for the regression test.)

4. **Discriminate `EditFileResult` instead of returning a
   parallel shape.** Task 2 Decision 4 collapsed all edit errors
   into a single `EditError` shape; Task 2 Open Issue 2 flagged
   that adding a `reason` discriminant was the right move "once
   a real signal needed it." `out_of_scope` is that signal. The
   new `EditFileError` is a discriminated union: `reason: "match"`
   carries `failedSearch / matchCount / currentContent` (the
   retry payload), `reason: "out_of_scope" | "invalid_path"`
   carries only `message`. Existing test assertions that read
   `error.matchCount` keep working because the field is still
   present on the `match` variant.

5. **Gate sits at `buildTools`, not in `FileRepository`.** Per
   the architecture sketch in the handoff: `FileRepository` is
   a pure storage contract, deliberately reused by the
   day-rollover routine to write `archive/daily/*` paths the
   LLM cannot reach. Putting the gate in the repo would either
   break that system-side write or require a "trusted" bypass
   flag — both worse than keeping the trust boundary at the
   single `buildTools(repo)` entry point.

6. **Backslash normalization stays in `search.ts`, not in the
   policy module.** `isInScope` historically called
   `p.replace(/\\/g, "/")` on its input. That is a Windows-path
   concession for search results, not part of the policy. Kept
   it inline in `isInScope`; the new `isInActiveScope` /
   `isInArchiveScope` and `canRead` / `canWrite` are POSIX-only.
   `validateFilePath` already rejects backslashes for the gate
   paths, so the LLM cannot smuggle a `tasks\\inbox.md` past
   `canRead`.

7. **`list_files` gates by *postfilter*, not by prefix
   validation.** Codex's review of the first draft pointed out
   that `list_files` was completely ungated — an LLM could
   enumerate `.obsidian/`, root markdown, or any non-GTD
   directory by passing a matching prefix (or no prefix at
   all). Two fixes were possible: (a) reject prefixes that do
   not start with `tasks/`, `daily/`, or `archive/daily/`, or
   (b) postfilter `repo.list(prefix)` results through
   `canRead`. (b) was chosen because it is uniform with the
   read/write/edit gate (one source of truth — `canRead`),
   degrades gracefully on weird prefixes (returns `[]` instead
   of an error the LLM has to recover from), and catches the
   case where a benign prefix happens to include sibling
   files that should not be exposed. The filter swallows
   `InvalidPathError` from `canRead` — any traversal-shaped
   path leaking out of `repo.list` is a containment bug in the
   repo, not something the LLM should see; better to drop it
   silently than to expose it via an error message.

8. **`search_files` postfilters at the *tool* boundary, not
   trusting `repo.search`.** Codex's second-round review noted
   that even after `isInActiveScope` / `isInArchiveScope` were
   tightened to mirror `canRead`, `search_files` still returned
   `repo.search(...)` directly. Snippets are a read surface;
   the tool layer must not trust a future `FileRepository`
   implementation (Supabase, remote, anything) to preserve the
   GTD predicates byte-for-byte. The fix mirrors Decision 7:
   postfilter every `SearchResult.filePath` through `canRead`
   inside the `search_files` execute, swallowing
   `InvalidPathError` the same way. The architecture says GTD
   scope belongs in the LLM tool layer, and after this change
   it does — `repo.search`'s in-repo `isInScope` filter is now
   a performance optimization, not a correctness boundary. The
   `LeakySearchRepository` regression test proves this: a stub
   that returns out-of-scope hits regardless of scope still
   produces a clean tool output.

9. **Day-boundary regression covered by an injected-clock test,
   not a wall-clock test.** A truly-spanning-midnight test
   would need to run for >24 h or stub Date globally (flaky in
   either direction). Instead, the regression in `tools.test.ts`
   drives two `read_file` tool calls against the same
   `daily/2026-05-08.md` file with two different `now: () =>
   ...` thunks — one pointing at 2026-05-08T23:59:00Z (gate
   says ok), one at 2026-05-09T00:01:00Z (gate says
   out_of_scope). That demonstrates the *fix*: when the prompt
   and the tools share an injected clock, they agree by
   construction; when the clock advances, they advance
   together. The CLI's per-turn `turnNow` snapshot is the
   production manifestation of the same pattern — the test
   doesn't need to reach into the CLI to prove the
   architectural invariant.

10. **`today` threaded through `repo.search`, not just the tool
    layer.** Codex's third-round review pointed out that even
    after `BuildToolsOptions { now }` made the prompt and the
    tool gate share one clock per turn, the repository's own
    `search` implementation still computed `today` from its own
    `this.now()`. With the CLI constructing
    `LocalFileRepository(vaultPath)` (default wall clock) and
    `buildTools(repo, { now: () => turnNow })`, a turn that
    started before UTC midnight and called `search_files` after
    midnight would see the repo scope to the *next* day — and
    the tool's postfilter (with the turn's `today`) had no way
    to recover the dropped hit. Silent false negative on
    exactly the daily note the prompt is pointing at.
    Two fixes were available: (a) move scope evaluation entirely
    into the tool layer (let `repo.search` return all hits and
    have the tool apply scope + canRead), or (b) thread the
    tool's `today` into `repo.search` so the repo and the tool
    agree by construction. (b) was chosen because it is a
    minimal additive change: `FileRepository.search` gains an
    optional `today?: string` parameter, both impls fall back
    to their own clock when the parameter is omitted, and
    existing contract tests / non-tool callers are unaffected.
    The CLI is also updated to pass `() => turnNow` to
    `LocalFileRepository` itself — defense-in-depth, so even
    code paths that don't go through the tool layer (history
    timestamps, future system-side searches) stay on the same
    clock. The `search_files` midnight regression in
    `tools.test.ts` constructs the repo with one clock
    (post-midnight) and the tools with another (pre-midnight);
    without the threading the test fails (zero hits) because
    repo scope and tool postfilter disagree.

## Test Evidence

```
$ pnpm -r typecheck
packages/core typecheck: Done
apps/cli typecheck: Done

$ pnpm -r test
packages/core test:  ✓ src/__tests__/edit.test.ts  (11 tests)
packages/core test:  ✓ src/__tests__/history-log.test.ts  (2 tests)
packages/core test:  ✓ src/__tests__/gtd-layout.test.ts  (14 tests)
packages/core test:  ✓ src/__tests__/in-memory-file-repository.test.ts  (36 tests)
packages/core test:  ✓ src/__tests__/local-file-repository.test.ts  (42 tests)
packages/core test:  ✓ src/__tests__/tools.test.ts  (9 tests)
packages/core test:       Tests  114 passed (114)
apps/cli test:       Tests  1 passed (1)
```

Manual checks:
- The three `tools.test.ts` gate tests for read/write/edit
  pass with a `TrapRepository` whose `read` / `write` / `edit`
  throw on call. Trap counters stay at zero in all three —
  proof the gate short-circuits before any repo method is
  invoked. The `list_files` regression uses an
  `InMemoryFileRepository` (because it has to seed files first)
  and asserts the postfiltered output equals the exact
  allowed-set, both with no prefix and with
  `prefix: "archive/"`.
- The `search_files` regression uses a stub
  `LeakySearchRepository` whose `search()` returns five hits
  ignoring scope — three out-of-scope, two allowed. The tool
  postfilter is asserted to drop the three out-of-scope hits
  and return only the two allowed paths (`tasks/inbox.md`,
  `archive/daily/2026-04-30.md`).
- The clock-injection regression drives a `read_file` tool
  call twice against the same `daily/2026-05-08.md` file: once
  with `now: () => 2026-05-08T23:59:00Z` (asserts
  `{ ok: true, content: ... }`) and once with `now: () =>
  2026-05-09T00:01:00Z` (asserts `{ ok: false, error: { reason:
  "out_of_scope" } }`). That proves the `BuildToolsOptions
  { now }` API actually controls the gate, which is what makes
  the CLI's per-turn `turnNow` pattern correct.
- The `search_files` midnight-rollover regression seeds
  `daily/2026-05-08.md` and `daily/2026-05-09.md` in an
  `InMemoryFileRepository` whose internal clock points at
  `2026-05-09T00:01:00Z`, then runs `search_files(query: "sushi",
  scope: "active")` through `buildTools` with
  `now: () => 2026-05-08T23:59:00Z`. Asserts the result is
  exactly `["daily/2026-05-08.md"]` — the turn day's note. Without
  Decision 10's threading, the repo's scope filter would have
  dropped 2026-05-08 (it's not its "today") and the tool
  postfilter would have rejected 2026-05-09 (not the turn's
  today), producing zero hits.
- The new contract case ("search does not surface content
  from paths denied by canRead") seeds four out-of-scope
  paths plus one allowed path with the same secret string,
  searches in `active` / `archive` / `all`, and asserts every
  hit's path satisfies `canRead`. Runs against both repo
  impls — both pass.
- Existing `tools.test.ts` integration tests (happy
  `list_files → read_file → text` chain and the `edit_file`
  ambiguity-retry) still pass unchanged — the new
  `EditFileError` discriminated union is structurally
  compatible with the previous assertion that read
  `error.matchCount`.

## Open Issues

- **Stale daily notes are unreachable until the readiness/rollover
  step lands.** Codex's third-round review surfaced a fourth
  finding (medium) that was deliberately *deferred* rather than
  fixed in this task — see `docs/plans/phase-1-cli.md` Task 5.5
  ("Vault readiness on turn start"), which quotes the finding
  verbatim and exists specifically to close it. Verbatim:
  > The turn setup now only snapshots `turnNow` and builds the
  > prompt from it; there is still no lifecycle/readiness call
  > before the LLM tools run. At the same time, the new gate
  > only allows `daily/${today}.md` and archived dailies, so an
  > existing `daily/2026-05-07.md` left behind when the user
  > opens the CLI on 2026-05-08 is filtered from `list_files`,
  > excluded from active search, and rejected by `read_file` as
  > `out_of_scope`.
  Sequencing decision (user): ship Task 3.5 now and address this
  in Task 5.5. The dev-only blast radius (single-user CLI, manual
  recovery available — the user can rename the file or run the
  rollover manually) does not justify holding the gate. The
  acceptance test in Task 5.5 labelled "Day rollover from
  yesterday" is the regression Codex asked for. (→ Task 5.5.)
- The new `WriteFileResult` is exported but `apps/cli/src/index.ts`
  does not destructure it (the REPL just streams tool results
  back to the model). No type churn in CLI was needed; if a
  future consumer wants to branch on `error.reason` at compile
  time, the type is ready.
- The system prompt does not yet mention the new discriminants.
  Task 4's R1–R13 prompt rewrite should teach the LLM that:
  `out_of_scope` means "stop, pick a different path";
  `invalid_path` means "stop, the path is malformed";
  `not_found` means "consider `list_files` or `write_file`";
  `match` (edit only) means "retry with extended context."
  (→ Task 4.)

## Context for Next Task

Task 4 (full R1–R13 system prompt + model router + session
persistence) inherits a tools layer where:

- Every `read_file` / `write_file` / `edit_file` result carries
  a `reason` discriminant on its error variant. The prompt
  should teach the four classes listed in the last Open Issue.
- `list_files` and `search_files` silently filter out-of-scope
  paths instead of erroring — the LLM never sees them. So a
  stale `read_file("tasks/projects/work.md")` request after
  the prompt rewrite would return `not_found` (the file is
  not enumerable) or `out_of_scope` (depending on whether the
  vault actually contains it). The prompt should instruct the
  model to trust `list_files` output as the canonical universe
  of files it may touch.
- `buildTools(repo, { now })` accepts an optional clock thunk.
  `LocalFileRepository(basePath, { now })` and
  `InMemoryFileRepository({ now })` accept the same. The
  invariant the CLI enforces is that all three (prompt, repo,
  tools) read from the same `turnNow` per turn. Task 4's
  prompt builder must keep that invariant — otherwise the
  prompt and the gate (or the gate and the repo's search
  scope) can disagree at UTC midnight (Codex findings #3 and
  #5, Decisions 3 / 9 / 10). The current pattern in
  `apps/cli/src/index.ts` is the reference: declare a
  module-scope `let turnNow = new Date();`, refresh it at the
  top of every turn just before
  `buildMinimalSystemPrompt(turnNow)`, and pass `() => turnNow`
  to *both* `LocalFileRepository` and `buildTools` once at
  startup. Task 4's richer prompt builder should extend the
  same `turnNow` pattern, not introduce a parallel clock.
- `repo.search(query, scope, today?)` accepts an optional
  per-call `today` for the scope filter. The tool layer always
  passes its turn `today` so the repo and the tool gate agree
  by construction; non-tool callers can omit it and fall back
  to the repo's own clock.
- `formatToday(new Date())` (or `formatToday(turnNow)` in
  practice) is the canonical "today UTC" string used by both
  the gate and the search-scope filter.

Key types to import from `@keppt/core`:

```
canRead, canWrite, isInActiveScope, isInArchiveScope,
BuildToolsOptions, ReadFileResult, WriteFileResult,
EditFileResult, EditFileError
```

## Git State

```
$ git diff --stat
 apps/cli/src/index.ts                              |  18 +-
 docs/plans/phase-1-cli.md                          |  86 +++++++
 docs/specs/architecture.md                         |  24 +-
 docs/task-log/task-3.5-gtd-layout-policy.md        | 163 +++++++++----
 .../core/src/__tests__/file-repository.contract.ts |  29 +++
 packages/core/src/__tests__/tools.test.ts          | 261 +++++++++++++++++++++
 packages/core/src/file-repository.ts               |  11 +-
 packages/core/src/in-memory-file-repository.ts     |  10 +-
 packages/core/src/index.ts                         |  15 +-
 packages/core/src/local-file-repository.ts         |  10 +-
 packages/core/src/search.ts                        |   6 +-
 packages/core/src/tools.ts                         | 178 +++++++++++++-
 12 files changed, ~735 insertions(+), ~76 deletions(-)

$ git status --short
 M apps/cli/src/index.ts
 M docs/plans/phase-1-cli.md
 M docs/specs/architecture.md
AM docs/task-log/task-3.5-gtd-layout-policy.md
 M packages/core/src/__tests__/file-repository.contract.ts
A  packages/core/src/__tests__/gtd-layout.test.ts
 M packages/core/src/__tests__/tools.test.ts
 M packages/core/src/file-repository.ts
A  packages/core/src/gtd-layout.ts
 M packages/core/src/in-memory-file-repository.ts
 M packages/core/src/index.ts
 M packages/core/src/local-file-repository.ts
 M packages/core/src/search.ts
 M packages/core/src/tools.ts
```

The `docs/plans/phase-1-cli.md` and `docs/specs/architecture.md`
changes were authored by the user between session turns: a new
Task 5.5 entry (vault readiness, with the deferred Codex finding
quoted verbatim) was added to the plan, and the architecture's
"Automatic Day Rollover" section was rewritten as "Vault Readiness
on Turn Start." Both close out the deferred finding listed in
Open Issues — they are part of *this* commit's narrative
(decision to ship 3.5 with a known followed-up gap), so they
ship together.

(`handoff.md` was the briefing document for this task and has
already been removed locally; it was always out of scope for the
commit.)
