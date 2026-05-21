# Task 3.8 — Path-safety expansion (8 → 13 attack vectors)

**Date:** 2026-05-10
**Plan:** `docs/plans/phase-1-cli.md` — Task 3.8

## Task

Extend `validateFilePath` from 8 to 12 sync vectors (Windows drive letter,
segment whitespace/trailing-dot, total + per-segment length caps, reserved
Windows device names) and add a runtime symlink-escape check (#13) inside
`LocalFileRepository`. Replace `LocalFileRepository.resolve` with an async
`resolveSafe` that runs the static validator, then `realpath`s the deepest
existing ancestor and verifies the canonical path stays inside the canonical
`basePath`. `InMemoryFileRepository` inherits the static checks for free
through the existing contract test.

## Status

**DONE**

## Files Modified

- `packages/core/src/file-repository.ts` (modified) — extended
  `validateFilePath` with checks #9–#12 and surfaced stable
  `reason` strings: `"windows drive letter is not allowed"`,
  `"segment has leading or trailing whitespace"`, `"segment has a
  trailing dot"`, `"path exceeds maximum length"`, `"segment
  exceeds maximum length"`, `"segment is a reserved Windows
  device name"`. Added `MAX_PATH_LENGTH = 4096` and
  `MAX_SEGMENT_LENGTH = 255`, plus regexes for the drive-letter
  prefix and the device-name set
  (`/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`). Reserved-name
  match runs against the segment's *base* (`seg.split(".")[0]`)
  so `CON.md`, `daily/nul.md`, `tasks/com1.md`, and bare `LPT9`
  all reject case-insensitively while `console.md` does not.
  Order of checks preserves predecessor reasons — backslash still
  fires before drive letter for `C:\foo.md`, absolute-path still
  fires before empty-segment for `//tasks/foo.md`.
  Promoted `RESERVED_PREFIX = ".keppt"` to a named export so
  `LocalFileRepository.resolveSafe` can re-apply the same check
  at the canonical-target level (Decision 10).
- `packages/core/src/local-file-repository.ts` (modified) —
  replaced the sync `private resolve` (whose `path.relative`
  post-check was redundant once realpath is in play) with
  `private async resolveSafe(filePath)`. New module-scope helpers
  `canonicalizeDeepest` (walks up to the nearest existing
  ancestor, `realpath`s it, then re-attaches the validated tail
  segments) and `isWithin` (canonical-prefix check using
  `path.sep`). The constructor caches a memoized
  `canonicalBase()` promise so `realpath(basePath)` runs once per
  repo instance instead of once per I/O call. Routed `read`,
  `write`, `edit`, and `search` through `resolveSafe`. `search`
  now swallows `InvalidPathError` per file so a single
  vault-resident filename that violates a static rule (e.g. a
  legitimate `CON.md` on a non-Windows host) does not abort the
  whole search; the same path will reject normally on direct
  `read`/`write`/`edit`. The pre-existing `edit()`-level
  `InvalidPathError`-→-`missingFileError` translation still
  applies, so symlink-escape on `edit` surfaces as
  `{ ok: false, error: { failedSearch, matchCount: 0,
  currentContent: "" } }` (consistent with the existing
  syntactic-rejection behavior; `read`/`write` still throw).
  Post-Codex-review hardening (Decision 10): `resolveSafe` now
  also computes `path.relative(canonicalBase, canonicalTarget)`
  and rejects with reason `"symlink resolves into reserved
  internal namespace"` if the first segment is `.keppt`. Closes
  the asymmetry where `validateFilePath` reserved `.keppt/`
  syntactically but a user-placed in-vault symlink could still
  canonicalize into the audit log. Added `KNOWN LIMITATIONS`
  block (Decision 11) documenting two accepted Phase-1
  trade-offs: (a) TOCTOU between realpath and the actual
  syscall, (b) other filesystem aliases (hard links, bind
  mounts, reflinks) not detected — both out of scope for the
  single-user-CLI threat model and superseded by Supabase row
  transactions in production.
- `packages/core/src/__tests__/file-repository.contract.ts`
  (modified) — extended the `path validation` describe with a
  parametrized `[label, input, reason]` table covering all 12
  static vectors. Asserts both `InvalidPathError` and the exact
  `reason` via `toMatchObject`, locking the strings against
  silent refactors. Replaced the original `"leading slash
  segment"` row (which was actually testing #4 absolute-path
  precedence, not #5 empty-segment) with a real empty-segment
  case (`tasks//inbox.md`) plus a trailing-slash case to
  exercise the inner-empty-segment path explicitly.
- `packages/core/src/__tests__/local-file-repository.test.ts`
  (modified) — added a `LocalFileRepository — symlink safety`
  describe with four tests, gated by
  `describe.skipIf(!symlinkable)` so the suite remains green on
  Windows where `fs.symlink` requires elevation. Tests cover
  T3.8-AC-02 (file symlink escape), AC-03 (directory symlink
  escape), AC-04 (write to non-existent file under an escaping
  directory symlink — verifies no file lands at the escape
  target), and AC-05 (in-vault symlinks resolve cleanly, proving
  the gate is not over-eager). Imports `symlink` from
  `node:fs/promises` and `InvalidPathError` from
  `../file-repository.js`. Post-Codex-review hardening: added a
  fifth test in the same describe — *rejects an in-vault symlink
  whose canonical target lands under .keppt/* — that creates
  `tasks/leak.md → .keppt/file-history.jsonl`, asserts the read
  throws `InvalidPathError { reason: "symlink resolves into
  reserved internal namespace" }`, and is the regression gate
  for Decision 10.

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — Task 3.8 block (lines 455–527)
  and preamble (`## SDK fixed points` + `## Flexibility Clause`).
- `docs/task-log/task-3.7-retry-budget.md` — direct predecessor;
  confirmed the budget is orthogonal (no overlap with path
  validation), and that `editFileTool`'s outer
  `InvalidPathError` catch (T3.7-AC-10) already routes the new
  static rejections to `invalid_path` tool-results without
  further plumbing.
- `docs/task-log/task-1-monorepo-file-repository.md` (referenced
  via `git log -- packages/core/src/file-repository.ts`) —
  baseline for the original 8-vector validator and the
  superseded `path.relative` post-check inside the old `resolve`.
- `packages/core/src/in-memory-file-repository.ts` — confirmed
  it calls `validateFilePath` at every entry point and inherits
  the new checks for free; no symlink surface to worry about.
- `packages/core/src/tools.ts` (read indirectly via the Task 3.7
  log) — confirmed the existing `InvalidPathError` catch on the
  edit tool already handles new reasons, so symlink-escape on
  `repo.edit` flows through `missingFileError` without a tool-
  layer change.

## Key Decisions

1. **Static + runtime split, kept literal.** The spec carves
   #9–#12 (syntactic) from #13 (filesystem-aware) and that
   carving is also the cleanest for testing: #9–#12 run against
   both repos through the contract test for free; #13 lives in
   `LocalFileRepository` and only exercises against a temp dir.
   No abstraction was added to bridge the two — the contract
   test's `runFileRepositoryContract` already exists, and the
   symlink describe sits next to the existing concurrency tests
   in the local-only file.

2. **Walk-up-to-realpath instead of realpath-or-fail.** The naive
   `await realpath(abs)` fails ENOENT on the common path of
   "writing a file that doesn't exist yet". Spec calls out that
   AC-04's escape-dir target file does not exist when the write
   fires; the resolver must walk up to the *symlink itself*
   (which does exist), realpath that, and reject. The
   `canonicalizeDeepest` helper recurses upward, accumulating
   un-resolved tail segments, and re-joins them onto the
   canonical existing ancestor. validateFilePath's 4096-char cap
   bounds the recursion depth.

3. **Memoized `canonicalBase`.** `realpath(basePath)` is the
   same answer for every I/O call on a given repo instance, and
   on macOS it's not free (`/var → /private/var`). Cached as a
   single `Promise<string>` field — first call kicks it off, all
   subsequent calls await the same promise. Avoids both repeated
   syscalls and a TOCTOU window between two queries.

4. **`search` swallows per-file `InvalidPathError` instead of
   filtering `list()` upstream.** The new device-name and
   length-cap checks are defense-in-depth, but a non-Windows
   user could legitimately have `CON.md` in their vault.
   Filtering at `list()` would silently drop it; a tool-level
   thrown error from `search` would abort the whole search on
   the first such file. The middle path — log-skip per file in
   `search` — keeps `list()` honest about what's on disk while
   making search robust. Direct `read`/`write`/`edit` on the
   same path still throws normally, so the user does see the
   error if they target the file directly. Documented inline
   on the `continue`.

5. **Reasons asserted in tests, not just the error class.** The
   parametrized contract table now has a `reason` column and a
   `toMatchObject({ reason })` assertion. The reasons are part
   of the LLM-visible tool-error shape (Task 3.7's tool-layer
   surfaces `error.reason` to the model in the `invalid_path`
   case). Locking them at the test level prevents a copy-edit
   on the validator from silently shifting the model's
   diagnostic vocabulary.

6. **Reserved-name regex matches the segment's *base*, not the
   whole segment.** Spec says "case-insensitive, before any
   extension". Implemented as `seg.split(".")[0]`. `CON.md`,
   `nul.md`, `daily/com1.md` all match; `console.md`,
   `tasks/connections.md` do not. Bare `LPT9` (no extension)
   has base `LPT9` and matches. `.gitignore`-style segments
   produce an empty base, which the regex correctly fails to
   match against `^(con|prn|...)$`.

7. **`edit()` keeps `InvalidPathError`-→-`missingFileError` for
   #13.** The pre-3.8 design translates path errors to a
   structured `EditResult`. Symlink-escape on `edit` flows
   through this same translation rather than surfacing a new
   shape. Rationale: the tool layer already validates the path
   *before* `repo.edit`, so syntactic rejections (#1–#12) hit
   `invalid_path` at the tool boundary and never reach this
   catch; only #13 reaches it, and a "missing file" tool-result
   is acceptable for a symlink — the security check has already
   prevented the write, the LLM moves on, no damage. Kept the
   existing catch unchanged. `read`/`write` still throw the
   real `InvalidPathError` (no in-method translation), so
   AC-02..04 assert against the throw directly.

8. **Test data fix on the original "leading slash segment"
   row.** The original row in the contract used `//tasks/...`
   to assert empty-segment rejection. Adding a `reason` column
   exposed that the path actually starts with `/` and trips
   #4 (absolute path) first. Replaced with `tasks//inbox.md`
   (real inner double-slash) plus a trailing-slash sibling.
   Pure test-data correction; validator order was already
   correct.

9. **Removed `private resolve` entirely.** Once `resolveSafe`'s
   realpath check is in place, the old method's
   `path.relative` post-check is redundant — a path that
   lexically escapes `basePath` would have been blocked by
   `validateFilePath`'s `..`/absolute checks, and a path that
   resolves through a symlink would be caught by realpath. No
   backwards-compat shim. All four call sites
   (`read`/`write`/`edit`/`search`) migrated atomically;
   confirmed via `grep 'this\.resolve\b'`.

10. **Re-apply `.keppt` reservation at canonical-target level.**
    Codex adversarial review surfaced an asymmetry: the
    syntactic `.keppt/` reservation in `validateFilePath` does
    not cover a user-placed in-vault symlink whose canonical
    target lands under `.keppt/`. Such a symlink at an
    LLM-allowed path (e.g. `tasks/inbox.md →
    .keppt/file-history.jsonl`) would canonicalize *into* the
    vault, pass the existing `isWithin` containment check, and
    leak audit-log content — including `contentBefore`
    snapshots of files the LLM is no longer supposed to see
    (archived or deleted). Fix is small and exact: after the
    realpath containment check, compute
    `path.relative(canonicalBase, canonicalTarget)` and reject
    if the first segment is `RESERVED_PREFIX`. New `reason`
    string: `"symlink resolves into reserved internal
    namespace"`. Promoted `RESERVED_PREFIX` to a named export
    so the constant has one source of truth. Write-direction
    is harmless (`rename(temp, abs)` replaces the symlink, the
    target inode is untouched), but the read leak alone
    justifies the close.

11. **Document TOCTOU + filesystem-alias trade-offs in code.**
    Two follow-up Codex findings (medium TOCTOU between
    `realpath` and the actual syscall; medium hard-link bypass
    of the runtime boundary) are **explicitly accepted** for
    Phase 1 rather than fixed. Rationale captured inline in
    `resolveSafe` as a `KNOWN LIMITATIONS` block so future
    review passes don't re-flag them: (a) TOCTOU is moot when
    the threat model is single-user CLI on a user-owned vault
    — anyone who can swap an ancestor symlink already has
    write access, which is checkmate; (b) hard links require
    read access to the source file, so they grant no privilege
    the user doesn't already hold, and an `nlink > 1` reject
    would false-block legitimate tooling (dedup utilities,
    snapshot backups, Obsidian plugins). Both concerns are
    superseded by Supabase row transactions in production
    persistence (per `commit()`'s existing comment). Hardening
    (per-component `O_NOFOLLOW` walk, `openat` handles, inode
    guards) is deferred until the threat model changes.

## Test Evidence

```text
$ pnpm --filter @gtd/core build
> tsc -p tsconfig.json
[clean]

$ pnpm --filter @gtd/core test
 ✓ src/__tests__/edit.test.ts             (11 tests)
 ✓ src/__tests__/gtd-layout.test.ts       (14 tests)
 ✓ src/__tests__/history-log.test.ts       (2 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts  (60 tests)
 ✓ src/__tests__/retry-budget.test.ts      (8 tests)
 ✓ src/__tests__/local-file-repository.test.ts      (71 tests)
 ✓ src/__tests__/tools.test.ts             (9 tests)

 Test Files  7 passed (7)
      Tests  175 passed (175)

$ pnpm --filter @gtd/cli typecheck
> tsc -p tsconfig.json --noEmit
[clean]

$ pnpm --filter @gtd/cli test
 ✓ test/cli-errors.test.ts        (2 tests)
 ✓ test/cli-error-log.test.ts     (1 test)
 ✓ test/workspace-wiring.test.ts  (2 tests)

 Test Files  3 passed (3)
      Tests  5 passed (5)
```

Test growth: 122 → 175 in core (+53). Mostly the parametrized
rejection table running 22 inputs × 2 ops × 2 repos minus the
pre-existing 9-row baseline that was already in both repos,
plus the 4 original symlink scenarios on `LocalFileRepository`,
plus the 5th symlink test added during the post-Codex-review
hardening pass (`tasks/leak.md → .keppt/file-history.jsonl`,
gating Decision 10). CLI suite: 4 → 5 (the existing
`workspace-wiring` describe gained a sibling test — unrelated
to 3.8 but already on disk; verified green).

No manual smoke run this session — Task 6 is the real-API
acceptance gate. The only LLM-visible change is the new
`reason` strings on `invalid_path` tool-results; those are
exercised by the existing T3.7-AC-10 path indirectly (it
asserts the tool returns a structured `invalid_path` for
syntactic rejections, which still passes against the new
reasons because that AC asserts on `error.reason ===
"invalid_path"` — the *tool-layer* reason, not the validator
reason). No regression there.

## Acceptance Coverage

- **T3.8-AC-01:** passed — parametrized rejection table in
  `file-repository.contract.ts` covers vectors #1–#12 with
  one or more rows each. Examples for the new five all
  present: `"C:foo.md"` and `"c:foo/bar.md"` (drive letter),
  `"tasks/foo.md "` (trailing whitespace), `" tasks/foo.md"`
  (leading whitespace), `"tasks/foo.md."` (trailing dot),
  `"a".repeat(5000) + ".md"` (total length cap),
  `"tasks/" + "a".repeat(300) + ".md"` (per-segment cap),
  `"tasks/CON.md"`/`"daily/nul.md"`/`"tasks/com1.md"`/
  `"tasks/LPT9"` (reserved device names, mixed case, with
  and without extension). Each row asserts both the error
  class and the `reason` string. Runs against InMemory and
  Local automatically.
- **T3.8-AC-02:** passed — `local-file-repository.test.ts`
  *rejects reading a file symlink that points outside the
  vault*. Vault under `$tmp/<rand>/vault`, secret at
  `$tmp/<rand>/secret.md`, `fs.symlink(secret, $vault/tasks/
  escape.md)`. `repo.read("tasks/escape.md")` throws
  `InvalidPathError { reason: "symlink escapes vault root" }`.
- **T3.8-AC-03:** passed — *rejects reading through a
  directory symlink that escapes the vault*. Same shape with
  a directory symlink and a child file inside the symlinked
  target.
- **T3.8-AC-04:** passed — *rejects writing a non-existent
  file under an escaping directory symlink*. Verifies that
  `canonicalizeDeepest`'s walk-up logic reaches the symlink
  itself when the leaf doesn't exist, and asserts that no
  file appears at the escape target after the throw.
- **T3.8-AC-05:** passed — *allows in-vault symlinks (target
  stays inside the vault root)*. `links/alias.md` →
  `tasks/inbox.md`, both inside the vault; `repo.read` returns
  the target's content. Kept in the suite because it costs
  nothing and proves the realpath check is not over-eager.
- **Post-review hardening (no plan AC, gates Decision 10):**
  passed — *rejects an in-vault symlink whose canonical target
  lands under .keppt/*. `tasks/leak.md` symlinked to
  `.keppt/file-history.jsonl` (both inside the vault, so the
  containment check passes); `repo.read("tasks/leak.md")`
  throws `InvalidPathError { reason: "symlink resolves into
  reserved internal namespace" }`. Sits next to AC-05 in the
  symlink-safety describe.

## Open Issues

1. **Per-file granularity in `search` is silent.** When a
   pre-existing file fails the new static validator
   (e.g. a legit `CON.md` on Linux), `search` skips it
   without surfacing anything to the caller. Acceptable for
   Phase 1; revisit if Task 6 surfaces user reports of
   "search misses my file". Mitigation if needed: collect
   skipped paths into a separate return field, or log via
   the upcoming Task 3.9 `Logger` adapter.

2. **Listing surfaces no symlinks at all.** `walk` already
   relies on `Dirent.isDirectory()`/`isFile()`, which return
   false for symlink Dirents on Linux (`d_type === DT_LNK`).
   Pre-existing behavior; not a 3.8 change. AC-05 still
   passes because direct `repo.read("links/alias.md")` works
   even though `list()` doesn't surface `links/alias.md`.
   Worth documenting if a future feature needs symlink-aware
   listing.

3. **`edit()` translates symlink-escape to `missingFileError`.**
   Decision 7 above. The LLM sees the same shape as a
   missing file rather than a path-rejection. Acceptable
   trade-off, but if a future audit wants the
   `invalid_path` reason to leak through, the translation
   would need to special-case `reason === "symlink escapes
   vault root"` (and now also `"symlink resolves into
   reserved internal namespace"`).

4. **TOCTOU between `realpath` and the syscall.** Codex
   adversarial review flagged this as medium. Accepted as a
   Phase-1 trade-off — single-user CLI on a user-owned
   vault, anyone with write access to ancestor directories
   has already won. Documented inline in `resolveSafe`'s
   `KNOWN LIMITATIONS` block so future review passes don't
   re-flag it. Hardening (per-component `O_NOFOLLOW` walk
   or `openat` handles) deferred until threat model
   changes; superseded by Supabase row transactions in
   production persistence.

5. **Hard links / bind mounts / reflinks bypass the
   runtime boundary.** Codex follow-up finding (also
   medium). Same disposition as #4 — accepted, documented
   inline. Rationale: `link(2)` requires read access to the
   source file, so a hard link grants no privilege the user
   doesn't already hold; an `nlink > 1` reject would
   false-block legitimate tooling (dedup utilities,
   snapshot backups, Obsidian plugins). Inode-aware
   guarding deferred to the same horizon as #4.

## Context for Next Task

- **Task 3.9 (shared logging):** every `FileRepository`
  entry point now validates and (for Local) realpath-checks
  before any I/O. The logging adapter does not need to
  re-validate paths it receives from repo callers — they
  are already inside the vault by construction. The
  `Open Issue 1` (silent search skip) is the natural place
  for the new `Logger` to plug in: a `logger.debug({ event:
  "search.skipped", filePath, reason })` line would make
  the skip observable without changing the search contract.
- **`InvalidPathError` reasons are now part of the contract
  surface.** Tests assert exact strings. Any future change
  to a reason string is a breaking change and must update
  both the validator and the contract test in the same
  commit. The runtime layer adds two more reason strings on
  top of the static set: `"symlink escapes vault root"` and
  `"symlink resolves into reserved internal namespace"`.
- **`RESERVED_PREFIX` is now an exported constant** from
  `file-repository.ts`. Both the syntactic check
  (`validateFilePath`) and the runtime canonical-target check
  (`LocalFileRepository.resolveSafe`) read from it. If the
  reserved internal namespace ever changes (`.keppt → .gtd`
  or similar), update the constant and grep for any inline
  string literals.
- **`LocalFileRepository` now has one cached
  `Promise<string>` field (`canonicalBasePromise`).** If a
  future test or use case rebuilds the repo per request
  (e.g. a long-running server), the cache is per-instance
  and doesn't leak across repos. The CLI rebuilds nothing
  here — `LocalFileRepository` stays a process-singleton
  on the CLI path.
- **No `URL`-decoding anywhere.** Spec calls out
  `decodeURIComponent` paths as an explicit non-vector. If
  Task 6 surfaces the LLM trying URL-encoded escape
  sequences, this is the documentation pointer.
- **`edit()`-level `InvalidPathError` catch keeps existing
  shape.** Any future tool-layer change that wants to
  surface `symlink escapes vault root` distinctly to the
  LLM must either (a) plumb the reason through
  `missingFileError`, or (b) move the catch out of
  `edit()` and let the tool layer's outer
  `InvalidPathError` catch handle it (would need to verify
  T3.7-AC-10 still passes).

## Git State

```text
$ git diff --stat
 .../core/src/__tests__/file-repository.contract.ts | 116 ++++++++++++++++++---
 .../src/__tests__/local-file-repository.test.ts    | 112 +++++++++++++++++++-
 packages/core/src/file-repository.ts               |  27 ++++-
 packages/core/src/local-file-repository.ts         | 109 +++++++++++++++++--
 4 files changed, 339 insertions(+), 25 deletions(-)

$ git status --short
 M packages/core/src/__tests__/file-repository.contract.ts
 M packages/core/src/__tests__/local-file-repository.test.ts
 M packages/core/src/file-repository.ts
 M packages/core/src/local-file-repository.ts
?? .idea/
?? docs/task-log/task-3.8-path-safety.md
```

(The home-directory dotfiles surfaced earlier — `.bashrc`,
`.zshrc`, `.gitconfig`, `.bash_profile`, `.profile`,
`.zprofile`, `.gitmodules`, `.mcp.json`, `.ripgreprc`,
`.vscode/` — are not part of this repo's working set;
omitted from the status snapshot above. `.idea/` is
JetBrains workspace metadata and is intentionally untracked.)
