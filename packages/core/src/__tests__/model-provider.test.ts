import { describe, expect, it } from "vitest";
import type { LanguageModel } from "ai";

import {
  apiKeyEnvName,
  createModelProvider,
  DEFAULT_MODEL_BY_PROVIDER,
  isProviderKey,
  PROVIDER_KEYS,
  selectModel,
  UnknownProviderError,
} from "../model-provider.js";

function describeModel(model: LanguageModel): {
  provider: string;
  modelId: string;
} {
  return typeof model === "string"
    ? { provider: "", modelId: model }
    : { provider: model.provider, modelId: model.modelId };
}

describe("createModelProvider", () => {
  it("T6.1-AC-09: pins sequential tool dispatch for anthropic and openai and the best-effort shape for deepseek", () => {
    const options = (provider: (typeof PROVIDER_KEYS)[number]) =>
      createModelProvider({ provider, modelId: "m" }).providerOptions;
    expect(options("anthropic")).toEqual({
      anthropic: { disableParallelToolUse: true },
    });
    expect(options("openai")).toEqual({
      openai: { parallelToolCalls: false, reasoningEffort: "high" },
    });
    expect(options("deepseek")).toEqual({
      deepseek: { reasoningEffort: "high" },
    });
  });

  it("builds the model of the selected provider with the given id, without an API key present", () => {
    for (const provider of PROVIDER_KEYS) {
      const { model } = createModelProvider({
        provider,
        modelId: `${provider}-model`,
      });
      const described = describeModel(model);
      expect(described.modelId).toBe(`${provider}-model`);
      expect(described.provider).toContain(provider);
    }
  });

  it("names the API key env var and the default model per provider", () => {
    expect(apiKeyEnvName("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(apiKeyEnvName("deepseek")).toBe("DEEPSEEK_API_KEY");
    expect(apiKeyEnvName("openai")).toBe("OPENAI_API_KEY");
    expect(DEFAULT_MODEL_BY_PROVIDER).toEqual({
      anthropic: "claude-sonnet-4-6",
      deepseek: "deepseek-v4-pro",
      openai: "gpt-5.4-mini",
    });
    expect(isProviderKey("openai")).toBe(true);
    expect(isProviderKey("gemini")).toBe(false);
  });
});

describe("selectModel", () => {
  it("defaults to anthropic and the provider's default model; empty counts as unset", () => {
    const expected = { provider: "anthropic", modelId: "claude-sonnet-4-6" };
    expect(selectModel({})).toEqual(expected);
    expect(selectModel({ provider: "", model: "" })).toEqual(expected);
  });

  it("selects the provider's default model and lets the model override it", () => {
    expect(selectModel({ provider: "openai" })).toEqual({
      provider: "openai",
      modelId: "gpt-5.4-mini",
    });
    expect(
      selectModel({ provider: "deepseek", model: "deepseek-v4-flash" }),
    ).toEqual({ provider: "deepseek", modelId: "deepseek-v4-flash" });
  });

  it("rejects an unknown provider instead of falling back", () => {
    expect(() => selectModel({ provider: "gemini" })).toThrow(
      UnknownProviderError,
    );
    expect(() => selectModel({ provider: "gemini" })).toThrow(
      /anthropic, deepseek, openai/,
    );
  });
});
