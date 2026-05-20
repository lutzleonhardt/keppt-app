// Model + provider selection for the per-turn `streamText` call. The CLI
// supports two providers today; the active one is picked via the
// `GTD_PROVIDER` env var at process start. Default is `"anthropic"` so
// callers without the env set behave exactly as before.
//
// Why a factory instead of conditional `import`s at the call site: the
// per-turn debug artifact (turn-loop.ts) needs to stamp the model id, the
// stream call needs the model factory, and the workspace-wiring invariant
// test (apps/cli/test/workspace-wiring.test.ts) needs to inspect the
// per-provider `providerOptions` shape. Centralizing all three here keeps
// them in sync and gives the test one runtime target instead of a brittle
// static regex against turn-loop.ts.
//
// Tool-use sequencing: the `edit_file` retry budget in
// packages/core/src/tools.ts assumes one tool call at a time per turn.
// Anthropic enforces that via `disableParallelToolUse: true`. The AI SDK
// DeepSeek provider exposes no equivalent flag (only `thinking` and
// `reasoningEffort`), so on DeepSeek the invariant is best-effort: the
// budget's read-then-write on `failures` can race under exactly
// concurrent same-file edits, and the worst case is one extra retry
// attempt burned before the budget catches up. Documented as an open
// question — see packages/core/src/tools.ts buildTools doc comment.

import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";

// Mirror of the AI SDK's `SharedV4ProviderOptions` shape
// (`Record<string, Record<string, JSONValue>>`) narrowed to the value
// types we actually use today — boolean flags. Avoids a direct dep on
// `@ai-sdk/provider-utils` (only a transitive dep here) for one type
// import; widen the value union when a new provider option needs strings
// or nested objects.
type LocalProviderOptions = { [provider: string]: { [key: string]: boolean } };

export type ProviderKey = "anthropic" | "deepseek";

function readProvider(): ProviderKey {
  const raw = process.env.GTD_PROVIDER;
  if (raw === "deepseek") return "deepseek";
  if (raw === "anthropic" || raw === undefined || raw === "") return "anthropic";
  // Unknown value: fail closed to anthropic and let the operator notice via
  // the per-turn debug artifact's `model` field rather than crashing the REPL.
  return "anthropic";
}

export const PROVIDER: ProviderKey = readProvider();

// Single source of truth for the model identifier — used both as the
// `streamText` model wiring and as the `model` field on per-turn debug
// artifacts. The DeepSeek default is V4 Pro (released 2026-04-24, 1M
// context). Override via env: `GTD_MODEL=deepseek-v4-flash` etc.
export const MODEL_ID: string =
  process.env.GTD_MODEL ??
  (PROVIDER === "deepseek" ? "deepseek-v4-pro" : "claude-sonnet-4-6");

export function model(): LanguageModel {
  return PROVIDER === "deepseek" ? deepseek(MODEL_ID) : anthropic(MODEL_ID);
}

// Per-provider `streamText` providerOptions. The Anthropic branch carries
// the `disableParallelToolUse` flag that makes the edit_file retry budget
// race-free (see the workspace-wiring test). The DeepSeek branch is empty
// because the provider exposes no equivalent flag — kept as `{ deepseek: {} }`
// rather than `{}` so the shape is uniform and the test can assert on it.
//
// Returned shape is compatible with `streamText({ providerOptions: ... })`
// because `LocalProviderOptions` is a structural subtype of the SDK's
// `SharedV4ProviderOptions` (`Record<string, JSONObject>`).
export function providerOptions(): LocalProviderOptions {
  if (PROVIDER === "deepseek") {
    return { deepseek: {} };
  }
  return { anthropic: { disableParallelToolUse: true } };
}
