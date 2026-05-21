# Task 6 — `suggest_quick_replies` terminal tool

## Task

Add a side-effect-free `suggest_quick_replies` tool that lets the model propose 2–5 short answer chips, renders them as numbered CLI options, and expands a valid numeric REPL pick into the selected plain user message for exactly one following turn.

## Status

DONE

## Files Modified

- `packages/core/src/tools.ts` (modified) — added `suggest_quick_replies` with Zod bounds (`options` length 2–5; each option 1–60 chars), returning `{ options }` without side effects. After dogfooding showed under-use, strengthened the tool description itself: the model must call it instead of ending with a bare yes/no or choice question.
- `packages/core/src/index.ts` (modified) — exported `QuickRepliesResult` alongside the existing tool result types.
- `packages/core/src/system-prompt.ts` (modified) — changed R11 from Task-5's forward-looking wording to active terminal-tool guidance, then sharpened it after real-session log inspection: final yes/no or 2–5-option questions should always call the terminal tool after prose; the opening line now names `suggest_quick_replies` as the UI chip tool.
- `packages/core/src/__tests__/tools.test.ts` (modified) — added schema rejection tests and a valid-call loop-stop test using `hasToolCall("suggest_quick_replies")`.
- `packages/core/src/__tests__/system-prompt.test.ts` (modified) — added T6 sentinel coverage for active terminal-tool prompt wording.
- `apps/cli/src/turn-loop.ts` (modified) — added `TurnRefs.lastQuickReplies`, clears it at the top of each turn, uses `stopWhen: [hasToolCall("suggest_quick_replies"), isStepCount(MAX_STEPS)]`, captures options from the `tool-call` stream part, suppresses the normal tool-status line for this UI tool, and renders chips after `endStream`.
- `apps/cli/src/terminal-output.ts` (modified) — added `quickReplies(options)` and exported `formatQuickReplies`, rendering `[1] option   [2] option` on one line.
- `apps/cli/src/quick-replies.ts` (new) — pure REPL-boundary helper `expandQuickReplyLine(line, options)` for numeric option expansion.
- `apps/cli/src/index.ts` (modified) — initializes `lastQuickReplies: null` and expands a numeric quick-reply pick before calling `handleTurn`.
- `apps/cli/test/quick-replies.test.ts` (new) — covers capture/render, expansion/pass-through paths, one-turn clearing, and persisted expanded user message.
- `apps/cli/test/cli-logger.test.ts` (modified) — updated the test terminal stub for the expanded `TerminalOutput` interface.

## Files Read (Context Only)

- `docs/plans/phase-1-cli.md` — preamble and Task 6 block only during `/start-task 6`.
- `docs/task-log/task-5-daily-gate-unification.md` — direct predecessor; confirmed the real prompt path is `packages/core/src/system-prompt.ts` and that Task 6 should flip `suggest_quick_replies` from forward-looking to active wording.
- `docs/task-log/task-3.9-shared-logging-abstraction.md` — relevant because it introduced `apps/cli/src/terminal-output.ts` as the typed user-facing output sink.
- `docs/task-log/task-4.2-debug-turn-logging.md` — relevant because it introduced `apps/cli/src/turn-loop.ts` as the per-turn orchestration seam.
- `apps/cli/node_modules/ai/src/generate-text/stop-condition.ts` and `apps/cli/node_modules/ai/dist/index.d.ts` — verified `hasToolCall` is available in the installed `ai@7.0.0-beta.116` package and can be combined with `isStepCount`.
- `apps/cli/src/model-provider.ts` — checked the model/provider seam before mocking it in CLI tests.
- `packages/core/src/sessions.ts` — checked `Session` construction and persistence invariants for the quick-reply persistence test.

## Key Decisions

1. **`suggest_quick_replies` is terminal via loop control, not merely another intermediate tool.** The initial plan described a side-effect-free tool but left the loop at `isStepCount(10)`. During implementation the user correctly pointed out that chips close the current turn. The final implementation uses `stopWhen: [hasToolCall("suggest_quick_replies"), isStepCount(MAX_STEPS)]`, so the SDK does not perform a follow-up LLM step after the tool result.

2. **Capture from `tool-call`, render after stream completion.** The CLI stores options when the `suggest_quick_replies` tool-call stream part appears, suppresses the normal `[tool name]` status line for this UI-only tool, then prints the numbered options after `terminal.endStream()`. This keeps the assistant prose and chips visually separate while preserving the streamed response.

3. **Number expansion stays at the REPL boundary.** `expandQuickReplyLine` lives in `apps/cli`, not core. A mobile tap handler can later produce the same plain user message without coupling UI behavior into `packages/core`.

4. **The expanded line is intentionally transparent to the model and session.** If the user types `2` and option 2 is `"Warten auf zeigen"`, `handleTurn` receives and persists `"Warten auf zeigen"` as an ordinary user message. There is no chip-pick marker in the model-visible conversation.

5. **Quick replies survive exactly one opportunity to pick.** `handleTurn` clears `refs.lastQuickReplies` at the top of every turn after the REPL has already had the chance to expand the line. If the model calls the tool again, the new options replace the old ones; if it does not, the next REPL line cannot accidentally expand against stale options.

6. **CLI tests mock the provider seam rather than the SDK.** `quick-replies.test.ts` mocks `model-provider.ts` so `handleTurn` still exercises the real `streamText`, stop-condition, tool execution, session-save, and terminal-output paths with `MockLanguageModelV4`.

7. **R11 plus the tool description both needed stronger “bare choice question” wording.** Inspection of `/home/lutz/projects/kept-vault/.keppt/logs/sessions/2026-05-20` showed two misses. In the first session DeepSeek called `suggest_quick_replies` in `turn-001` but not in later yes/no cleanup questions. After the first R11 sharpening, the second session still missed `turn-003` ("Soll ich das korrigieren?") and only called the tool in `turn-004` after the user asked "Welche Option habe ich?". Final fix: the system prompt now explicitly says not to end with a bare choice question, and the tool description says "MUST call instead of ending with a bare yes/no or choice question".

## Test Evidence

- `pnpm --filter @gtd/core test -- --run packages/core/src/__tests__/tools.test.ts packages/core/src/__tests__/system-prompt.test.ts` — passed. Because of Vitest argument forwarding in this workspace, this ran the full core suite: 15 files, 272 tests.
- `pnpm --filter @gtd/cli test -- --run apps/cli/test/quick-replies.test.ts apps/cli/test/cli-logger.test.ts apps/cli/test/turn-loop.test.ts` — passed. Because of Vitest argument forwarding in this workspace, this ran the full CLI suite: 10 files, 45 tests.
- `pnpm typecheck` — passed for `packages/core` and `apps/cli`.
- `pnpm test` — passed for `packages/core` and `apps/cli`.
- `pnpm exec prettier --check apps/cli/src/quick-replies.ts apps/cli/src/turn-loop.ts apps/cli/src/index.ts apps/cli/src/terminal-output.ts apps/cli/test/quick-replies.test.ts apps/cli/test/cli-logger.test.ts packages/core/src/tools.ts packages/core/src/index.ts packages/core/src/system-prompt.ts packages/core/src/__tests__/tools.test.ts packages/core/src/__tests__/system-prompt.test.ts` — passed.
- `pnpm --filter @gtd/core test -- --run packages/core/src/__tests__/system-prompt.test.ts packages/core/src/__tests__/tools.test.ts` — passed again after the final R11 sharpening. Because of Vitest argument forwarding in this workspace, this ran the full core suite: 15 files, 272 tests.
- `pnpm exec prettier --check packages/core/src/system-prompt.ts packages/core/src/__tests__/system-prompt.test.ts docs/task-log/task-6-quick-replies.md` — passed after the final R11 sharpening.
- Manual log inspection round 1: `/home/lutz/projects/kept-vault/.keppt/logs/sessions/2026-05-20/turn-{001..004}.json` showed `suggest_quick_replies` only in `turn-001`, which motivated the R11 "always call" sharpening.
- Manual log inspection round 2: the refreshed 2026-05-20 session showed `turn-003` ending with "Soll ich das korrigieren?" without a quick-reply call, followed by `turn-004` ("Welche Option habe ich?") finally calling `suggest_quick_replies`. This motivated adding the bare-choice-question sentence to R11 and the MUST-call sentence to the tool description.
- `pnpm --filter @gtd/core test -- --run packages/core/src/__tests__/system-prompt.test.ts packages/core/src/__tests__/tools.test.ts` — passed after the tool-description + prompt-opening sharpening. Because of Vitest argument forwarding in this workspace, this ran the full core suite: 15 files, 273 tests.
- `pnpm typecheck` — passed after the tool-description + prompt-opening sharpening.
- `pnpm exec prettier --check packages/core/src/system-prompt.ts packages/core/src/tools.ts packages/core/src/__tests__/system-prompt.test.ts packages/core/src/__tests__/tools.test.ts` — passed after the tool-description + prompt-opening sharpening.

## Acceptance Coverage

- T6-AC-01: passed — `packages/core/src/__tests__/tools.test.ts` rejects one option, six options, empty option, and a 61-char option as `tool-error` cases.
- T6-AC-02: passed — `apps/cli/test/quick-replies.test.ts` asserts a streamed `suggest_quick_replies({ options: ["a", "b", "c"] })` populates `refs.lastQuickReplies` and terminal quick-reply output includes `[1] a`, `[2] b`, and `[3] c`.
- T6-AC-03: passed — `apps/cli/test/quick-replies.test.ts` expands `"2"` to `"Warten auf zeigen"` before `handleTurn`, and the saved session user message is `"Warten auf zeigen"`.
- T6-AC-04: passed — `apps/cli/test/quick-replies.test.ts` verifies verbatim free text (`"warten auf zeigen"`) passes through unchanged.
- T6-AC-05: passed — `apps/cli/test/quick-replies.test.ts` verifies out-of-range `"4"` with three options passes through unchanged.
- T6-AC-06: passed — `apps/cli/test/quick-replies.test.ts` verifies `"2 maybe"` passes through unchanged because the integer must be the entire trimmed line.
- T6-AC-07: passed — `apps/cli/test/quick-replies.test.ts` verifies a subsequent non-quick-reply turn clears `refs.lastQuickReplies`, so the following `"2"` is not expanded.
- T6-AC-08: passed — `packages/core/src/__tests__/system-prompt.test.ts` asserts the opening line names `suggest_quick_replies` as the UI chip tool, R11 describes it as an active terminal tool, says to always call it for final 2–5-option questions, and explicitly rejects bare choice-question endings.

## Open Issues

1. **No post-tool-description-sharpening real-API smoke yet.** Real DeepSeek logs before the latest prompt/tool-description change showed under-use even for "Soll ich das korrigieren?". Automated coverage pins the stronger wording, but a new dogfooding session should verify that final yes/no questions now produce chips without the user asking "Welche Option habe ich?". Natural acceptance surface is Task 8's real-API pass. (→ Task 8)

2. **Plan text still describes the original non-terminal shape.** The Task 6 implementation intentionally amends the execution detail to terminal loop-control after user review. `docs/plans/phase-1-cli.md` should be cleaned up in the already-noted plan-cleanup pass so future readers do not reintroduce a post-chip model step. (→ plan-cleanup before Task 8)

## Context for Next Task

- `suggest_quick_replies` is now part of `buildTools(repo, options)` and returns `{ options: string[] }`. It has no side effects and is intended as a renderer signal.
- The CLI treats `suggest_quick_replies` as a terminal tool through `hasToolCall("suggest_quick_replies")`. Task 7 can rely on the current turn ending after chips are proposed.
- `TurnRefs` now includes `lastQuickReplies: string[] | null`. Any new turn-entry path must initialize it and preserve the contract: REPL/tap handler may expand once, then `handleTurn` clears it at the top.
- CLI number expansion is `expandQuickReplyLine(line, options)` in `apps/cli/src/quick-replies.ts`. It expands only an all-digit trimmed line within range; free text, out-of-range digits, and mixed text pass through unchanged.
- `TerminalOutput` now has `quickReplies(options)`. Test stubs implementing `TerminalOutput` must include this method.
- Task 7 Auto-Replan-Opener should ask the model to finish with `suggest_quick_replies` when it presents stale-task disposition choices. It should not build a separate option-rendering path.

## Git State

```text
$ git diff --stat
 apps/cli/src/index.ts                             |  10 +-
 apps/cli/src/terminal-output.ts                   |  10 ++
 apps/cli/src/turn-loop.ts                         |  39 ++++---
 apps/cli/test/cli-logger.test.ts                  |  15 ++-
 packages/core/src/__tests__/system-prompt.test.ts |  24 ++++-
 packages/core/src/__tests__/tools.test.ts         | 123 +++++++++++++++++++---
 packages/core/src/index.ts                        |   7 +-
 packages/core/src/system-prompt.ts                |   4 +-
 packages/core/src/tools.ts                        |  58 ++++++++--
 9 files changed, 245 insertions(+), 45 deletions(-)

$ git status --short
 M apps/cli/src/index.ts
 M apps/cli/src/terminal-output.ts
 M apps/cli/src/turn-loop.ts
 M apps/cli/test/cli-logger.test.ts
 M packages/core/src/__tests__/system-prompt.test.ts
 M packages/core/src/__tests__/tools.test.ts
 M packages/core/src/index.ts
 M packages/core/src/system-prompt.ts
 M packages/core/src/tools.ts
?? .claude/
?? apps/cli/src/quick-replies.ts
?? apps/cli/test/quick-replies.test.ts
?? docs/task-log/task-6-quick-replies.md
```
