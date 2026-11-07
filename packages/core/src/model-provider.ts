// Model + provider selection for the `streamText` calls of every host (CLI
// and server), as a pure factory: the hosts read `GTD_PROVIDER`/`GTD_MODEL`
// and hand the raw values to `selectModel`; the `@ai-sdk/*` providers read
// their API key from the environment at request time, which is why the hosts
// only verify its presence (`apiKeyEnvName`).
//
// Tool-use sequencing: the `edit_file` retry budget in `buildTools` assumes
// one tool call at a time per turn. Anthropic enforces that via
// `disableParallelToolUse`, OpenAI via `parallelToolCalls: false`; the
// DeepSeek provider exposes no equivalent flag, so there the invariant is
// best-effort (worst case one extra retry attempt). `reasoningEffort:
// "high"` on OpenAI and DeepSeek carries the CLI's finding that the default
// underweights the system prompt's conditional rules.

import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { ProviderOptions } from "./turn-engine.js";

export const PROVIDER_KEYS = ["anthropic", "deepseek", "openai"] as const;

export type ProviderKey = (typeof PROVIDER_KEYS)[number];

export function isProviderKey(value: string): value is ProviderKey {
  return PROVIDER_KEYS.some((key) => key === value);
}

const API_KEY_ENV_BY_PROVIDER: Record<ProviderKey, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
};

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderKey, string> = {
  anthropic: "claude-sonnet-4-6",
  deepseek: "deepseek-v4-pro",
  openai: "gpt-5.4-mini",
};

export function apiKeyEnvName(provider: ProviderKey): string {
  return API_KEY_ENV_BY_PROVIDER[provider];
}

export interface ModelSelection {
  provider: ProviderKey;
  modelId: string;
}

export class UnknownProviderError extends Error {
  constructor(readonly value: string) {
    super(
      `unknown provider "${value}", expected one of ${PROVIDER_KEYS.join(", ")}`,
    );
    this.name = "UnknownProviderError";
  }
}

/**
 * Resolves the raw `GTD_PROVIDER`/`GTD_MODEL` values a host read from its
 * environment. Unset or empty means the default; an unknown provider throws
 * rather than falling back, so a typo never selects a model silently.
 */
export function selectModel(raw: {
  provider?: string;
  model?: string;
}): ModelSelection {
  const provider = raw.provider || "anthropic";
  if (!isProviderKey(provider)) throw new UnknownProviderError(provider);
  return {
    provider,
    modelId: raw.model || DEFAULT_MODEL_BY_PROVIDER[provider],
  };
}

export interface ModelProvider {
  model: LanguageModel;
  providerOptions: ProviderOptions;
}

export function createModelProvider({
  provider,
  modelId,
}: ModelSelection): ModelProvider {
  switch (provider) {
    case "anthropic":
      return {
        model: anthropic(modelId),
        providerOptions: { anthropic: { disableParallelToolUse: true } },
      };
    case "openai":
      return {
        model: openai(modelId),
        providerOptions: {
          openai: { parallelToolCalls: false, reasoningEffort: "high" },
        },
      };
    case "deepseek":
      return {
        model: deepseek(modelId),
        providerOptions: { deepseek: { reasoningEffort: "high" } },
      };
  }
}
