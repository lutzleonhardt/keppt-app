// Model + provider selection for the per-turn `streamText` call. The CLI
// supports three providers today; the active one is picked via the
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
// Anthropic enforces that via `disableParallelToolUse: true`; OpenAI uses
// the equivalent `parallelToolCalls: false`. The AI SDK DeepSeek provider
// exposes no equivalent flag (only `thinking` and `reasoningEffort`), so
// on DeepSeek the invariant is best-effort: the budget's read-then-write
// on `failures` can race under exactly concurrent same-file edits, and the
// worst case is one extra retry attempt burned before the budget catches up.
// Documented as an open question — see packages/core/src/tools.ts buildTools
// doc comment.

import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Mirror of the AI SDK's `SharedV4ProviderOptions` shape
// (`Record<string, Record<string, JSONValue>>`) narrowed to the value
// types we actually use today — boolean flags plus `reasoningEffort`
// strings ("low" | "medium" | "high") for OpenAI/DeepSeek. Avoids a
// direct dep on `@ai-sdk/provider-utils` (only a transitive dep here)
// for one type import; widen the value union further when a new
// provider option needs different shapes.
type LocalProviderOptions = {
  [provider: string]: { [key: string]: boolean | string };
};

export type ProviderKey = "anthropic" | "deepseek" | "openai";

const API_KEY_ENV_BY_PROVIDER = {
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
} as const satisfies Record<ProviderKey, string>;

const DEFAULT_MODEL_BY_PROVIDER = {
  anthropic: "claude-sonnet-4-6",
  deepseek: "deepseek-v4-pro",
  openai: "gpt-5.4-mini",
} as const satisfies Record<ProviderKey, string>;

function readProvider(): ProviderKey {
  const raw = process.env.GTD_PROVIDER;
  if (raw === "deepseek") return "deepseek";
  if (raw === "openai") return "openai";
  if (raw === "anthropic" || raw === undefined || raw === "")
    return "anthropic";
  // Unknown value: fail closed to anthropic and let the operator notice via
  // the per-turn debug artifact's `model` field rather than crashing the REPL.
  return "anthropic";
}

export const PROVIDER: ProviderKey = readProvider();

export function apiKeyEnvName(provider: ProviderKey = PROVIDER): string {
  return API_KEY_ENV_BY_PROVIDER[provider];
}

// Single source of truth for the model identifier — used both as the
// `streamText` model wiring and as the `model` field on per-turn debug
// artifacts. The DeepSeek default is V4 Pro (released 2026-04-24, 1M
// context). The OpenAI default is GPT 5.4 mini. Override via env:
// `GTD_MODEL=deepseek-v4-flash`, `GTD_MODEL=gpt-5.4-mini`, etc.
export const MODEL_ID: string =
  process.env.GTD_MODEL ?? DEFAULT_MODEL_BY_PROVIDER[PROVIDER];

export function model(): LanguageModel {
  switch (PROVIDER) {
    case "deepseek":
      return deepseek(MODEL_ID);
    case "openai":
      return openai(MODEL_ID);
    case "anthropic":
      return anthropic(MODEL_ID);
  }
}

// Per-provider `streamText` providerOptions. Anthropic and OpenAI carry
// provider-specific flags that disable parallel tool calls and make the
// edit_file retry budget race-free (see the workspace-wiring test).
// OpenAI and DeepSeek also carry `reasoningEffort: "high"` — empirical
// observation on the gpt-5.4-mini / deepseek-v4-pro runs was that the
// default ("medium") underweights the conditional R-rule chains in the
// task-assistant system prompt: R4 auto-mirrors get skipped, R15
// self-attestation defends wrong answers, R11 quick-replies never fire
// even on textbook 2-option choices. Raising effort buys reasoning
// tokens at no extra latency under sequential tool use, so flipping
// this is the cheap first lever before touching the prompt.
// Anthropic exposes a different surface (`thinking` budget, not
// `reasoningEffort`) — left untouched here; add separately if needed.
//
// Returned shape is compatible with `streamText({ providerOptions: ... })`
// because `LocalProviderOptions` is a structural subtype of the SDK's
// `SharedV4ProviderOptions` (`Record<string, JSONObject>`).
export function providerOptions(): LocalProviderOptions {
  if (PROVIDER === "deepseek") {
    return { deepseek: { reasoningEffort: "high" } };
  }
  if (PROVIDER === "openai") {
    return {
      openai: { parallelToolCalls: false, reasoningEffort: "high" },
    };
  }
  return { anthropic: { disableParallelToolUse: true } };
}
