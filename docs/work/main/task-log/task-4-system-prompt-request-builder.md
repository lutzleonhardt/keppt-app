# Task 4 — System prompt R1-R13 + request builder + input heuristic + prompt caching

**Date:** 2026-05-19
**Plan:** `docs/plans/phase-1-cli.md` — Task 4

## Amendment 2026-05-19: Active-state pre-load removed

Post-implementation Codex adversarial review surfaced two no-ship findings on the leading-system-role active-state block introduced by Decision #1 below:

- **Finding 1 (high) — Mutable vault content as system-role instructions.** `buildRequest` prepended user-editable task files + daily note as `role: "system"` content, elevating any (accidentally or maliciously) instruction-shaped text inside those files to system-level authority against R1–R13 and the tool conventions.
- **Finding 2 (medium) — No size cap on the per-turn vault snapshot.** `loadActiveState` embedded every file verbatim with no character/token budget, truncation marker, or degraded path. A large daily note made every turn proportionally expensive or unsendable, with no signal to the user.

**Resolution:** the active-state block is dropped entirely. `buildRequest` becomes a pure prompt + history assembler; the LLM reads vault files on demand via `read_file`. Task 4.1's tool-result pruning already covers the "stale snapshot in history" concern that the pre-load was originally meant to address, so this is strictly less surface for the same outcome.

**Spec changes shipped in the same amendment:**

- `docs/specs/architecture.md` → "Request Architecture: How Each Message Is Built" — the request block diagram drops the "Current GTD Files" section; key insight reframed around on-demand `read_file` + pruning as working memory.
- `docs/specs/architecture.md` → "Context Management: Tool-Result Pruning" step 5 — replaced "active files are loaded fresh every request" with "no pre-loaded active-state block; first turn pays one `read_file` round-trip, subsequent turns within K reuse the cached read".
- `docs/specs/architecture.md` — new "Open question: Per-file size budget on read_file / edit_file / write_file" with explicit trigger conditions for revisit and a partial-read design sketch (offset/limit + a new `grep_file` tool, Claude-Code-style but first-class instead of bash). `edit_file` is included because its `currentContent` return path on match-failure is the same unbounded surface as `read_file`. Migrates Finding 2's underlying concern (per-tool size cap) to the open-question surface; not implemented in Phase 1 per the `phase1_pragmatism` pattern (deterministic safety net + acceptable worst-case → document, don't speculatively harden). Reviewer pointer left in `packages/core/src/tools.ts` (block comment above `buildTools` tool registrations).
- `docs/plans/phase-1-cli.md` → Task 4 instructions + Key Discoveries — updated to reflect the no-active-state contract; `buildRequest` signature loses its `repo` parameter.

**Decision #1 below is superseded** by this amendment. Decisions #2–#10 stand as written. Code, tests, and CLI wiring are updated in the same change set as the docs.

Finding 3 (CLI paste-defense in readline) is orthogonal and stays open — separate task.

---

## Task

Refactor Task 3's inline CLI bits into three clean `@gtd/core`
modules: a full R1–R13 system prompt with stable anchors and a
separate `## Tool conventions` block; a `buildRequest` assembler
that loads active vault state without invalidating the Anthropic
prompt cache; and a pre-LLM input gate that rejects oversize input
and code-paste-shaped pastes. Wire all three through the CLI plus
an ephemeral `cacheControl` marker on `streamText` and a
`DEBUG=1`-gated `prompt.cache_usage` debug event. Model stays
hardcoded at `claude-haiku-4-5` (router deferred); session
persistence + tool-result pruning stay deferred to Task 4.1.

## Status

**DONE**
(except T4-AC-14, which is a manual smoke transcript against the
real API — captured below as `partial` pending the real-vault run.)

## Files Modified

- `packages/core/src/system-prompt.ts` (new) — exports
  `buildSystemPrompt({ today })`. 13 R-rules with inline `[R1]`..
  `[R13]` anchors plus a separate `## Tool conventions` section
  carrying `[T-C1]`..`[T-C5]`. R13 renders the date as
  `Today is Friday, 24. April 2026.` (German-leaning day-period
  format the plan pins, not the spec's "April 18, 2026" example).
  Phrasing is deliberately dense — the LLM already knows what GTD
  is, so each rule states the project-specific shape, not the
  concept. Hit length budget of ~5K chars / ~1.25K tokens after
  one tightening pass (initial draft ran 8.5K chars).
- `packages/core/src/request-builder.ts` (new — superseded mid-task by Amendment 2026-05-19) — final shape: exports
  `buildRequest({ today, profile, messages, userMessage })`
  → `{ system, messages }` (synchronous, no `repo` parameter, no I/O).
  `system` carries R1–R13 + optional profile. No active-state
  pre-load — vault content reaches the LLM only via `read_file`
  tool-results in `messages`. Marked Task-4.1 pruning seam
  (`prunedMessages = messages`) so the public signature stays the
  contract. Initial implementation also loaded `tasks/*.md` +
  today's daily as a leading `SystemModelMessage`; removed after
  Codex review (see Amendment block above + Decision #1).
- `packages/core/src/input-validation.ts` (new) — exports
  `validateUserInput`, `MAX_INPUT_CHARS`, `REJECTION_MESSAGE`,
  `InputValidationResult`. Two layers: hard 2000-char cap; code-
  paste heuristic combining indentation share, code-punctuation
  density, and fenced-block count. Heuristic is intentionally
  generous on honest task text with a few special chars.
  *Session 2026-05-19 (CLI paste-defense scoping):* header
  comment rewritten to make the contract explicit — gate is for
  transport boundaries that deliver a COMPLETE submission per
  call (WebUI `<textarea>` submit, future HTTP endpoint), not for
  the readline CLI's per-line stream. Function body unchanged.
- `packages/core/src/index.ts` (modified) — re-exports the three
  new modules and their public types.
- `packages/core/src/__tests__/system-prompt.test.ts` (new) —
  T4-AC-01 (all 13 R-anchors + R13 date line on 2026-04-24),
  T4-AC-01b (`## Tool conventions` heading + 5 T-C anchors), two
  weekday/month rendering cases (2026-01-01 Thursday, 2026-12-31
  Thursday), and a `< 8000 chars` length-budget guard derived
  from the plan's `<2K tokens` hard cap.
- `packages/core/src/__tests__/input-validation.test.ts` (new) —
  T4-AC-10..T4-AC-13 plus one honest-edge-case accept
  (`Write code review for PR #42 (auth flow); covers login() and
  signup().`) to pin the "don't be too aggressive" requirement.
- `packages/core/src/__tests__/request-builder.test.ts` (new — test mix rewritten by Amendment 2026-05-19) — six tests:
  R-anchors + profile in `system`, profile-absent case,
  profile-whitespace-only edge case, message pass-through,
  empty-history → only-new-user-message case, and a
  **no-active-state-pre-load** structural pin (asserts no
  `system`-role message and exactly one output message — the new
  user one). Replaces the prior three tests that asserted active-
  state injection / no-prefix-when-empty / UNIQUE_FOCUS_TOKEN_42
  cache discipline; the new pin enforces the same invariant
  structurally instead of via token presence.
- `apps/cli/src/index.ts` (modified) — replaced
  `buildMinimalSystemPrompt` + inline 2000-char check with
  `buildRequest` + `validateUserInput`. Pushed the assistant turn
  with `messages.push({ role: "user", content: line },
  ...response.messages)` instead of using the local `pendingUser`
  binding (one fewer intermediate). Added
  `providerOptions.anthropic.cacheControl: { type: "ephemeral" }`
  alongside the existing `disableParallelToolUse: true`; kept
  `disableParallelToolUse` as the **first** key inside `anthropic`
  to satisfy the `workspace-wiring.test.ts` static regex pin.
  Added `DEBUG=1`-gated `cliLogger.debug({ code:
  "prompt.cache_usage", ... })` after `await result.totalUsage`
  — uses the Logger contract (not `console.debug`) to preserve
  the Task-3.9 zero-`console.*` invariant.
  Post-amendment: `buildRequest` is synchronous (no `await`, no
  `repo` argument); cacheControl comment updated to note vault
  content arrives only via tool-results, not an active-state block.
  *Session 2026-05-19 (CLI paste-defense scoping):* dropped the
  `validateUserInput(line)` call from the input loop; replaced
  with an inline `MAX_INPUT_CHARS` length check + multi-line
  comment explaining the testballoon scoping (no untrusted-user
  threat model applies here) and pointing future contributors at
  the WebUI/HTTP boundary as the real call site for the full
  gate. Import changed from `validateUserInput` →
  `MAX_INPUT_CHARS`.
- `apps/cli/src/minimal-prompt.ts` (deleted) — replaced by
  `buildSystemPrompt` inside `buildRequest`.
- `packages/core/src/tools.ts` (modified — Amendment 2026-05-19) —
  added a reviewer comment block above the `return { read_file: ... }`
  tool registrations documenting the deliberately-unbounded size
  surfaces (read_file/edit_file/write_file) and pointing at the
  spec's "Open question: Per-file size budget" with trigger
  conditions. Explicit "do not speculatively add a cap here".
- `docs/specs/architecture.md` (modified — Amendment 2026-05-19) —
  Request-architecture block diagram drops "Current GTD Files";
  key-insight reframed around on-demand `read_file` + pruning as
  working memory; pruning-mechanics step 5 rewritten; new
  "Open question: Per-file size budget on read_file / edit_file /
  write_file" with trigger conditions and a partial-read design
  sketch (`read_file({ offset, limit })` + `grep_file({ pattern,
  context })` as Claude-Code-style first-class tools).
- `docs/plans/phase-1-cli.md` (modified — Amendment 2026-05-19) —
  Task 4 `buildRequest` description updated (no `repo` parameter,
  no active-state pre-load); Key Discoveries gain an
  active-state-removal entry; reference to the new spec open
  question.

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — Task 4 block (lines 729–821) +
  preamble; the Router-removal and Split notes were the binding
  constraints.
- `docs/specs/architecture.md` §1877–2050 — canonical R1–R13
  text. Used as the source for the rule bodies; phrasing was
  compressed to fit the token budget. Plan referenced the spec
  explicitly for R1–R13, so this read was sanctioned.
- `docs/task-log/task-3.9-shared-logging-abstraction.md` —
  direct predecessor; established the `cliLogger` pattern and
  the zero-`console.*` invariant Task 4's debug emission has to
  respect.
- `docs/task-log/task-3-cli-vercel-ai-sdk.md` (skimmed during
  briefing) — confirmed the per-turn `turnNow` clock + tools
  rebuild pattern Task 4 preserves.
- `apps/cli/src/index.ts` (pre-Task-4 version) — to identify
  every surface that needed replacement (`buildMinimalSystemPrompt`,
  the inline 2000-char check, the `pendingUser` binding).
- `apps/cli/src/minimal-prompt.ts` — confirmed the date format
  and weekday array; reused the same `WEEKDAYS` shape in
  `system-prompt.ts`.
- `apps/cli/test/workspace-wiring.test.ts` — the static regex
  for `disableParallelToolUse: true` requires it to be the
  first key in `anthropic: {`. Drove the ordering decision when
  adding `cacheControl`.
- `node_modules/.../@ai-sdk/provider-utils/dist/index.d.ts` —
  confirmed `SystemModelMessage = { role: "system"; content:
  string; providerOptions?: ProviderOptions }` so active state
  could legally ship as a system-role `ModelMessage`.
- `node_modules/.../ai/dist/index.d.ts` — confirmed
  `LanguageModelUsage.inputTokenDetails.{cacheReadTokens,
  cacheWriteTokens, noCacheTokens}` shape for the debug payload.
- `packages/core/src/gtd-layout.ts` — confirmed the canonical
  task-file list to mirror in `request-builder.ts`'s
  `TASK_FILES` constant.
- `packages/core/src/file-repository.ts` — confirmed
  `FileNotFoundError` is the right swallow target for missing
  active-state files.
- `packages/core/src/__tests__/logging.test.ts` — testing-style
  baseline (vitest patterns, `MemoryLogger` usage).

— session 2026-05-19 (amendment)

- `docs/specs/architecture.md` §1318–1404 — re-read the
  "Request Architecture" + "Context Management: Tool-Result
  Pruning" blocks to plan the no-pre-load rewrite and to
  position the new open-question section.
- `packages/core/src/edit.ts` — confirmed
  `planAndApplyEdits`'s `countOccurrences === 1` contract: it
  validates against current file content, so external edits
  that touch the search block produce a `match` failure with
  the actual `currentContent`. Establishes the "edit_file has
  natural drift detection without an active-state pre-load"
  argument that motivated the removal.
- `packages/core/src/tools.ts` (full) — re-read to identify
  the three unbounded size surfaces (`read_file` return,
  `edit_file` `edits[]` + `currentContent`, `write_file`
  payload) for the reviewer comment block and the spec open
  question.
- `packages/core/src/system-prompt.ts` — confirmed T-C4
  ("write_file is for create or full rewrite only") so the
  `write_file` drift gap is at least documented at the
  prompt surface.

## Key Decisions

1. **Active state lives in `messages`, NOT `system`.** *(SUPERSEDED — see Amendment 2026-05-19 at the top of this file. The active-state pre-load is removed entirely; `buildRequest` no longer loads any files and no longer takes a `repo` parameter. The cache-discipline reasoning below is preserved because it explains why Decisions #2–#10 — particularly the `cacheControl` placement and the `disableParallelToolUse` first-key pin — are still correct.)*
   The plan allowed either "active-state addendum in `system`" or "leading
   message in `messages`". Picked the second because the cached
   block ends at `system + tools`; putting per-turn-mutating
   content there would invalidate the cache on every edit to the
   daily note or any task file. Cache discipline is pinned by an
   explicit regression test ("UNIQUE_FOCUS_TOKEN_42" stays out of
   `system`, lands in `messages`). The leading message uses
   `role: "system"` (Vercel SDK's `SystemModelMessage` supports
   in-messages systems) so the LLM treats it as authoritative
   context, not user input.

2. **Stable inline anchors `[R1]..[R13]` + `[T-C1]..[T-C5]`.**
   T4-AC-01 + T4-AC-01b need a unique greppable token per rule.
   Picked square-bracket sigils because they survive Markdown
   rendering, don't collide with rule heading text, and are
   trivial for `expect(prompt).toContain("[R7]")` to assert
   without false matches against headings like `R7` inside body
   prose. The anchors are part of the prompt-surface contract.

3. **R13 date format follows the plan, not the spec.** The spec
   shows `Today is Friday, April 18, 2026.` (US comma format).
   The plan pins `Today is {weekday}, {dd. month yyyy}.` and
   T4-AC-01 asserts the literal `"Today is Friday, 24. April
   2026"`. Plan wins — it's the executing contract. The
   `{dd. month yyyy}` format renders without a leading zero on
   day-of-month (`1. January` not `01. January`), matching
   common German style for what is, after all, a Berlin-based
   user.

4. **Prompt density over completeness.** Initial draft of
   `system-prompt.ts` ran 8.5K chars (~2.1K tokens), busting the
   plan's `<2K tokens` hard cap. Compressed by: collapsing
   bullet lists into single-line summaries, dropping example
   block lists where one example suffices, replacing R1's prose
   list with a Markdown table (`| File | Role | Crosscheck |`).
   Final draft ~5K chars (~1.25K tokens), under the cap and
   close to the ~1K target. The compression preserved every
   rule's *project-specific shape* (paths, marker formats, flow
   transitions) and dropped only GTD concept restating that the
   LLM already knows.

5. **Pruning seam is a labeled comment + identity assignment, no
   import.** `buildRequest` does `const prunedMessages =
   messages;` with a `[Task 4.1 seam]` comment. No
   `pruneToolResults` import — that would be a half-finished
   abstraction in tree. The Task-4.1 diff replaces the identity
   with a real `pruneToolResults(messages)` call and adds the
   import in the same commit. Public signature stays unchanged.

6. **Profile is optional; trimmed and gated by non-empty.**
   `buildRequest` accepts `profile?: string` and emits the
   `## User profile` section only when the trimmed value is
   non-empty. Avoids a leading empty section in the system
   prompt when the CLI doesn't have a profile to inject (Phase 1
   has no profile source yet — this is forward-compatibility for
   Phase 2 backend).

7. **DEBUG-gated cache usage via Logger, not `console.debug`.**
   The plan literally said `console.debug` for the cache-usage
   trace, but Task 3.9 made `console.*` a hard zero in
   `apps/cli/src/`. Routed through `cliLogger.debug({ code:
   "prompt.cache_usage", meta: { cacheReadTokens,
   cacheWriteTokens, noCacheTokens, outputTokens } })`. The
   event lands in `cli-errors.jsonl` alongside the other
   diagnostic codes. New code name follows the Task-3.9
   `<surface>.<verb_or_noun>` convention; would be added to the
   `logging.ts` registry comment block if T4-AC-14 confirms it
   fires meaningfully under real load.

8. **Ordering inside `providerOptions.anthropic` is load-bearing.**
   `workspace-wiring.test.ts` has a static regex that requires
   `disableParallelToolUse: true` to be the *first* key inside
   `anthropic: {` (`/anthropic:\s*\{\s*disableParallelToolUse/`).
   First attempt put `cacheControl` first with a long comment
   between the brace and `disableParallelToolUse` — both broke
   the regex. Final layout keeps `disableParallelToolUse` first
   with no intervening comments; explanatory text moved outside
   the object literal. The static check is intentionally rigid
   (it's a safety net for Task 3.7's retry-budget race
   assumption) — not weakened.

9. **`InMemoryFileRepository` drives the request-builder tests.**
   No need to spin up `LocalFileRepository` + a tmp dir for a
   pure transform test. The `request-builder.test.ts` uses
   in-memory throughout and `repo.write(path, content, "seed")`
   to populate active state — fast and deterministic.

10. **Honest-edge-case test added.** Beyond the four AC-pinned
    inputs, added an explicit accept-case for `Write code review
    for PR #42 (auth flow); covers login() and signup().` to pin
    the plan's "must not be too aggressive" requirement against
    future regressions to the heuristic.

— session 2026-05-19 (amendment — active-state removal)

11. **Active-state pre-load removed entirely; pruning-only is the
    contract going forward.** Codex review surfaced two no-ship
    findings against the leading `SystemModelMessage` shape from
    Decision #1: (a) elevation of user-editable vault content to
    system-role authority opens a prompt-injection path against
    R1–R13 and the tool conventions; (b) no per-turn size cap on
    the vault snapshot. Resolution: drop the pre-load, let the
    LLM read on demand via `read_file`, and trust Task-4.1's
    tool-result pruning to keep recent reads alive as working
    memory while stubbing out drift or aged-out snapshots.
    Rationale chain: `edit_file`'s `countOccurrences === 1`
    contract already gives natural drift detection on
    LLM-side edits — a stale snapshot in working memory plus
    an external edit produces `matchCount: 0` plus the current
    `currentContent`, forcing a re-read. `write_file` is the one
    remaining gap (no drift check on full rewrite); mitigated for
    Phase 1 by the prompt's T-C4 ("write_file for create or full
    rewrite only"). Net: less attack surface, strictly cleaner
    cache discipline (the active-state block was outside the
    cache window anyway), and the only cost is one extra
    `read_file` round-trip on turn 1 — acceptable for Haiku
    latency. Captured as Amendment 2026-05-19 at the top of this
    file with `Decision #1` marked superseded.

12. **`buildRequest` becomes a pure synchronous transform.**
    Without `loadActiveState`, `buildRequest` does no I/O. Dropped
    the `repo` parameter, dropped `async`, dropped the
    `Promise<...>` return. Smaller surface, trivially testable
    without a `FileRepository` instance. CLI updates `buildRequest(...)`
    call to drop the `await`. Public type re-exports
    (`BuildRequestInput`, `BuildRequestResult`) stay; consumers
    only see the parameter list shrink.

13. **No-active-state pin replaces the UNIQUE_FOCUS_TOKEN_42
    cache-discipline test.** The original test asserted a unique
    vault-side token landed in `messages` but never in `system` —
    a behavioral pin that the active-state block sat outside the
    cache window. With no active-state block at all, that test
    has nothing to assert. Replaced with a **structural pin**:
    every output `ModelMessage` has `role !== "system"` and the
    output array contains exactly one message (the new user one).
    Same protective intent — catches regressions to either
    re-adding an active-state block or wiring vault content
    through `buildRequest` again — without depending on a magic
    token.

14. **Per-file size budget deferred to a spec open question, not
    implemented now.** Finding 2's underlying concern (per-tool
    size cap) is real but Phase-1 single-user + local-vault makes
    the worst case "one expensive turn", not data loss. Followed
    the `phase1_pragmatism` memory pattern: document with explicit
    trigger conditions and a design sketch (partial-reads à la
    Claude Code's grep/head/tail but as first-class tools —
    `read_file({ offset, limit })` + a new `grep_file` —
    plus structured `payload_too_large` rejection on writes)
    rather than speculatively hardening now. Reviewer comment in
    `tools.ts` references the spec section so the next reviewer
    or Codex run sees the deliberate gap.

15. **`edit_file` drift detection is the load-bearing reason this
    is safe.** Without an active-state pre-load, the LLM's working
    snapshot for vault state is the in-context `read_file`
    tool-results (within K=5 once pruning lands). For
    LLM-issued edits: `planAndApplyEdits` validates against
    `original` content (the current file), so a stale snapshot in
    the LLM's working memory plus an external concurrent edit
    that touches the search block produces `matchCount: 0`,
    returns the actual `currentContent`, and the LLM retries with
    truth. Retry budget = 2; the `retry_budget_exhausted` path
    also surfaces `currentContent`. The one residual hazard is
    `write_file` on a stale snapshot (silent clobber); held back
    by T-C4 in the prompt today, slated for the spec's
    `mtime`/optimistic-check open question if it ever bites.

— session 2026-05-19 (CLI paste-defense scoping)

16. **Pre-LLM input gate is a transport-boundary concern, scoped
    explicitly out of the CLI.** Codex Finding 3 (Open Issue 7)
    noted that the readline CLI calls `validateUserInput` per
    line, so a real multi-line paste arrives pre-split and the
    code-paste heuristic cannot see the paste as a paste. User
    clarified the threat model: CLI is a single-user internal
    testballoon — no "untrusted user repurposes the LLM" risk
    applies. Resolution: keep `validateUserInput` in `@gtd/core`
    as policy (unchanged behavior on a complete submission), but
    make its contract explicit in the header comment — it expects
    one full payload per call (WebUI `<textarea>` submit, future
    HTTP endpoint), not a readline line stream. CLI drops the
    call entirely; keeps a one-line `MAX_INPUT_CHARS` length cap
    as a cheap accidental-paste guard with a "not load-bearing"
    comment. `buildRequest` is intentionally NOT the validator's
    home (assembly vs. policy separation; would force a validator
    stub in every `buildRequest` test, and would re-run the gate
    on resumed/replayed conversations). This resolves Open Issue
    7 without adding bracketed-paste handling to the CLI — the
    real fix lives at the next frontend that ships a complete
    submission per call.

## Test Evidence

```text
$ pnpm --filter @gtd/core build
> tsc -p tsconfig.json
[clean]

$ pnpm --filter @gtd/core test
 ✓ src/__tests__/edit.test.ts                       (11 tests)
 ✓ src/__tests__/system-prompt.test.ts               (4 tests)
 ✓ src/__tests__/history-log.test.ts                 (2 tests)
 ✓ src/__tests__/input-validation.test.ts            (5 tests)
 ✓ src/__tests__/logging.test.ts                    (10 tests)
 ✓ src/__tests__/gtd-layout.test.ts                 (14 tests)
 ✓ src/__tests__/request-builder.test.ts             (6 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts  (60 tests)
 ✓ src/__tests__/retry-budget.test.ts                (8 tests)
 ✓ src/__tests__/local-file-repository.test.ts      (73 tests)
 ✓ src/__tests__/tools.test.ts                      (13 tests)

 Test Files  11 passed (11)
      Tests  206 passed (206)

$ pnpm --filter @gtd/cli typecheck
> tsc -p tsconfig.json --noEmit
[clean]

$ pnpm --filter @gtd/cli test
 ✓ test/cli-errors.test.ts        (3 tests)
 ✓ test/cli-error-log.test.ts     (1 test)
 ✓ test/workspace-wiring.test.ts  (2 tests)
 ✓ test/cli-logger.test.ts        (3 tests)

 Test Files  4 passed (4)
      Tests  9 passed (9)
```

Core test growth: 191 → 206 (+15). Breakdown: +4 system-prompt,
+5 input-validation, +6 request-builder. CLI: 9 unchanged
(refactor only — no new CLI-side test surface; the existing
`workspace-wiring.test.ts` static regex still passes after the
`cacheControl` addition).

Invariants re-checked:

```text
$ grep -rn 'console\.' packages/core/src/ apps/cli/src/ | grep -v __tests__ | wc -l
0
```

Manual smoke (T4-AC-14): **NOT YET RUN.** Requires real-vault +
real-API session with `DEBUG=1`. Deferred to the next interactive
session against the user's Obsidian vault; recorded as `partial`
below.

— session 2026-05-19 (amendment)

Re-ran the full suite after stripping `loadActiveState`,
dropping the `repo` parameter from `buildRequest`, and updating
the request-builder test mix:

```text
$ pnpm --filter @gtd/core build
[clean]

$ pnpm --filter @gtd/core test
 ✓ src/__tests__/input-validation.test.ts            (5 tests)
 ✓ src/__tests__/system-prompt.test.ts               (4 tests)
 ✓ src/__tests__/request-builder.test.ts             (6 tests)
 ✓ src/__tests__/logging.test.ts                    (10 tests)
 ✓ src/__tests__/gtd-layout.test.ts                 (14 tests)
 ✓ src/__tests__/edit.test.ts                       (11 tests)
 ✓ src/__tests__/history-log.test.ts                 (2 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts  (60 tests)
 ✓ src/__tests__/local-file-repository.test.ts      (73 tests)
 ✓ src/__tests__/retry-budget.test.ts                (8 tests)
 ✓ src/__tests__/tools.test.ts                      (13 tests)

 Test Files  11 passed (11)
      Tests  206 passed (206)

$ pnpm --filter @gtd/cli typecheck
[clean]

$ pnpm --filter @gtd/cli test
 ✓ test/cli-errors.test.ts        (3 tests)
 ✓ test/cli-error-log.test.ts     (1 test)
 ✓ test/workspace-wiring.test.ts  (2 tests)
 ✓ test/cli-logger.test.ts        (3 tests)

 Test Files  4 passed (4)
      Tests  9 passed (9)

$ grep -rn 'console\.' packages/core/src/ apps/cli/src/ | grep -v __tests__ | wc -l
0
```

Total core test count stays at 206 — the request-builder file
shed three active-state tests and gained three pruning-only
pins (profile-whitespace edge, empty-history shape,
no-active-state structural pin). The `workspace-wiring`
static regex (`disableParallelToolUse` first key inside
`anthropic: {`) still passes after the `cacheControl` reorder
in the CLI's amended comment block. Zero `console.*` invariant
preserved.

— session 2026-05-19 (CLI paste-defense scoping)

Re-ran typecheck + core suite after dropping `validateUserInput`
from the CLI and rewriting the `input-validation.ts` header
comment. No behavioral change to the validator itself, no test
changes:

```text
$ pnpm -r typecheck
packages/core typecheck: Done
apps/cli   typecheck: Done

$ pnpm --filter @gtd/core test -- --run
 ✓ src/__tests__/edit.test.ts                       (11 tests)
 ✓ src/__tests__/system-prompt.test.ts               (4 tests)
 ✓ src/__tests__/input-validation.test.ts            (5 tests)
 ✓ src/__tests__/logging.test.ts                    (10 tests)
 ✓ src/__tests__/request-builder.test.ts             (6 tests)
 ✓ src/__tests__/history-log.test.ts                 (2 tests)
 ✓ src/__tests__/gtd-layout.test.ts                 (14 tests)
 ✓ src/__tests__/in-memory-file-repository.test.ts  (60 tests)
 ✓ src/__tests__/local-file-repository.test.ts      (73 tests)
 ✓ src/__tests__/retry-budget.test.ts                (8 tests)
 ✓ src/__tests__/tools.test.ts                      (13 tests)

 Test Files  11 passed (11)
      Tests  206 passed (206)
```

`input-validation.test.ts` already exercised the validator on
complete submissions (one string per call), so the
just-clarified contract is what it has been testing all along —
no test churn needed.

## Acceptance Coverage

- **T4-AC-01:** passed — `system-prompt.test.ts > contains all
  13 R-rule anchors and the R13 date line` asserts each
  `[R1]..[R13]` plus the literal `"Today is Friday, 24. April
  2026."` line for `new Date("2026-04-24")`.
- **T4-AC-01b:** passed — `system-prompt.test.ts > contains a
  '## Tool conventions' section with five T-C anchors` asserts
  the heading plus `[T-C1]..[T-C5]`.
- **T4-AC-06:** N/A — router deferred (see plan Router-removal
  note, Task 4 block). The AC ID is preserved as an explicit gap
  in the plan; no test surface in Task 4.
- **T4-AC-10:** passed — `input-validation.test.ts > rejects
  input longer than MAX_INPUT_CHARS` asserts `{ok:false, reason:
  "too_long"}` and that the message mentions the actual length.
- **T4-AC-11:** passed — `input-validation.test.ts > accepts
  MAX_INPUT_CHARS of plain prose` builds a 2000-char prose
  string and asserts `{ok:true}`. Boundary covered.
- **T4-AC-12:** passed — `input-validation.test.ts > rejects a
  50-line function-body paste as a code paste` asserts
  `{ok:false, reason:"code_paste"}` and `REJECTION_MESSAGE`.
- **T4-AC-13:** passed — `input-validation.test.ts > accepts a
  plain task request` asserts `validateUserInput("New task:
  write VW quote")` returns `{ok:true}`.
- **T4-AC-14:** partial — automated check stops at the CLI
  refactor and the `cacheControl` provider option. The actual
  cache-write-then-cache-read transcript needs a real-API run
  against the user's vault with `DEBUG=1`; debug emission code
  is in place and verified by typecheck. Plan to run during the
  next interactive session; if cache reads don't appear, falls
  back to investigating whether the ephemeral marker needs to
  move from `streamText`-level `providerOptions` to
  per-message-block `cacheControl`. Captured as Open Issue 1.

## Open Issues

1. **T4-AC-14 manual smoke is unrun.** Cache-write on turn 1 +
   cache-read on turns 2/3 against real Claude Haiku 4.5 + the
   user's vault, observable via `DEBUG=1` and the
   `prompt.cache_usage` JSONL entries. If the ephemeral marker
   at `streamText`-level `providerOptions.anthropic.cacheControl`
   doesn't produce reads (Anthropic occasionally requires the
   marker to be attached to the specific block, not globally),
   the next-best move is moving the marker onto the last system
   message via `SystemModelMessage.providerOptions`. Track in
   the wrap-up of the smoke run, not as a separate task.

2. **`cli-errors.jsonl` filename now also carries
   `prompt.cache_usage` debug entries.** Same misnomer Task 3.9
   already flagged (Open Issue 1 there). One more code piling
   into a file named `*-errors.jsonl`. Rename to
   `cli-events.jsonl` remains the right move; still deferred to
   a deliberate later decision since it's a vault-layout change.

3. **`prompt.cache_usage` code not yet in the `logging.ts`
   registry block.** The convention from Task 3.9 says
   "update the registry block in the same commit when adding a
   new emitter". Skipped here because the code only fires under
   `DEBUG=1` and T4-AC-14 hasn't confirmed it's load-bearing.
   Add to the registry as part of the T4-AC-14 follow-up if the
   smoke confirms it produces useful signal, otherwise drop the
   emitter. (→ T4-AC-14 follow-up)

4. ~~**Active-state cache strategy is suboptimal...**~~ —
   **Resolved by Amendment 2026-05-19.** Active state is no
   longer in the request at all, so the marker covers system +
   tools and there is no second-tier marker to consider for
   Phase 1. The "second marker for growing history" thought
   may resurface in Task 4.1 if pruned-history caching becomes
   worth its complexity.

5. ~~**`buildRequest` reads active state synchronously per turn.**~~
   — **Resolved by Amendment 2026-05-19.** `buildRequest` no
   longer reads anything; latency-floor concern disappears with
   the active-state pre-load itself.

6. **Per-file size budget on `read_file` / `edit_file` /
   `write_file` is unbounded by design (Phase 1).** Captured as
   an open question in `docs/specs/architecture.md` with explicit
   trigger conditions (real-vault read over ~8K tokens; Phase 2
   backend lands; write payload over ~16K chars) and a
   partial-read design sketch (`read_file({ offset, limit })` +
   new `grep_file` tool + `payload_too_large` rejection on writes).
   Reviewer pointer is in `packages/core/src/tools.ts` above the
   tool registrations. Natural execution slot: Task 6 hardening,
   or earlier if a trigger fires.

7. ~~**Codex Finding 3 — paste defense in readline.**~~ —
   **Resolved by session 2026-05-19 (CLI paste-defense scoping).**
   The threat model the finding assumed (untrusted user pastes
   to repurpose the LLM) does not apply to a single-user internal
   testballoon CLI; the real fix lives at the next frontend that
   delivers a complete submission per call (WebUI `<textarea>` /
   future HTTP endpoint), where `validateUserInput` works as
   designed. CLI now uses an inline `MAX_INPUT_CHARS` length cap
   only, with the testballoon scoping documented inline. See
   Decision #16 and the updated `input-validation.ts` header.

8. **`write_file` drift hazard documented but not enforced.**
   A stale in-context snapshot plus a `write_file` full-rewrite
   silently overwrites concurrent external edits. `edit_file`
   has natural drift detection via the unique-match requirement;
   `write_file` has none. Today's mitigation is the prompt's
   T-C4 ("write_file for create or full rewrite only"). Stronger
   options (optimistic `mtime` check in the repo, structured
   `concurrent_change` rejection) are worth considering if the
   prompt-level rule isn't enough — captured in the spec's
   per-file size budget open question alongside the related
   bounding concerns.

## Context for Next Task

- **`buildRequest` signature is the contract surface Task 4.1
  extends.** Post-amendment: `({ today, profile, messages,
  userMessage }) → { system, messages }` (synchronous, no I/O,
  no `repo`). Task 4.1's job is to (a) populate `messages` from
  disk before the call and (b) replace the
  `prunedMessages = messages` identity inside `buildRequest`
  with `pruneToolResults(messages)`. The seam comment
  `[Task 4.1 seam]` marks the exact insertion line. The input
  type may need to gain `fileVersionAt` and `messageCreatedAt`
  closures (the function would stay synchronous — closures are
  injected, not awaited); the output shape stays
  `{ system, messages }`.

- **No active-state pre-load — pruning IS the working-memory
  mechanism.** Task 4.1's `pruneToolResults` operates on the
  conversation `messages` array. The "recent reads within K"
  window is now structurally what the LLM uses as its current
  vault snapshot, since there is no other source. That
  raises the criticality of getting the K=5 + version-drift
  combination right: a too-aggressive prune leaves the LLM with
  no working state and forces re-reads every turn; a too-lax
  prune ships stale content. The spec's both-conditions
  rationale (K alone leaves drift gaps; drift alone breaks
  multi-step flows) becomes the load-bearing argument, not just
  a nice-to-have.

- **`cacheControl` marker is on `streamText`-level
  `providerOptions.anthropic`.** If T4-AC-14 surfaces that the
  marker needs to be per-block (on the last system message), the
  fix is to attach `providerOptions: { anthropic: { cacheControl
  : { type: "ephemeral" } } }` to a specific `ModelMessage` —
  but with the active-state block gone, the marker-at-streamText-
  level position cleanly covers `system + tools` with nothing
  per-turn-mutating in between. Cache-hit rate over a session
  should be better than the pre-amendment design predicted.

- **`prompt.cache_usage` debug code is in flight but unregistered.**
  Until T4-AC-14 confirms it produces useful signal under real
  load, treat it as provisional. If kept, add it to the
  `logging.ts` registry block in the same commit as the smoke-run
  wrap-up; if dropped, remove the emitter and the constant. The
  Logger convention from Task 3.9 (`<surface>.<verb_or_noun>`,
  snake_case, pinned by `MemoryLogger.byCode(...)` tests in
  core) applies if Task 4.1 or Task 6 adds new emitters.

- **The Task 3.9 invariants still hold.** Zero `console.*` in
  `packages/core/src/` and `apps/cli/src/`; `redactSensitiveHeaders`
  remains the single source of truth for header redaction;
  `cliLogger` is wired into `LocalFileRepository` and
  `buildTools` (Task 4 didn't touch that wiring). Task 4.1 + 5
  must continue to respect these.

- **The `disableParallelToolUse: true` first-key ordering inside
  `providerOptions.anthropic` is load-bearing.** Future edits
  that add Anthropic provider options (e.g. a thinking budget,
  a different cache strategy) must keep `disableParallelToolUse`
  as the first key — the `workspace-wiring.test.ts` static regex
  is intentionally rigid because it guards Task 3.7's
  retry-budget race assumption.

- **The plan's `<2K tokens` hard cap is binding.** Future
  prompt-edit tasks (Phase 2 backend, new R-rules, expanded T-C
  bullets) need to budget against ~1.25K tokens of headroom.
  The `< 8000 chars` guard test (`system-prompt.test.ts > stays
  under the 2K-char hard cap`) catches overshoots early. If a
  legitimate addition pushes past 8000, the right move is to
  compress existing rules (R1's table format is the model)
  before raising the guard.

## Git State

```text
$ git diff --stat
 apps/cli/src/index.ts          | 72 ++++++++++++++++++++++++++++++++----------
 apps/cli/src/minimal-prompt.ts | 23 --------------
 docs/plans/phase-1-cli.md      |  8 ++---
 docs/specs/architecture.md     | 52 +++++++++++++++++++++---------
 packages/core/src/index.ts     | 15 +++++++++
 packages/core/src/tools.ts     | 14 ++++++++
 6 files changed, 126 insertions(+), 58 deletions(-)

$ git status --short
 M apps/cli/src/index.ts
 D apps/cli/src/minimal-prompt.ts
 M docs/plans/phase-1-cli.md
 M docs/specs/architecture.md
 M packages/core/src/index.ts
 M packages/core/src/tools.ts
?? docs/task-log/task-4-system-prompt-request-builder.md
?? packages/core/src/__tests__/input-validation.test.ts
?? packages/core/src/__tests__/request-builder.test.ts
?? packages/core/src/__tests__/system-prompt.test.ts
?? packages/core/src/input-validation.ts
?? packages/core/src/request-builder.ts
?? packages/core/src/system-prompt.ts
```

(Home-directory dotfiles `.bashrc`, `.zshrc`, `.gitconfig`, etc.
and `.idea/`/`.vscode/` workspace metadata are surfaced by
`git status` but are not part of this repo's working set;
omitted from the snapshot above.)
