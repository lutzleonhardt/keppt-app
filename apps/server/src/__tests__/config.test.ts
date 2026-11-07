import { describe, expect, it } from "vitest";

import { ConfigError, DEFAULT_PORT, readServerConfig } from "../config.js";

const complete = {
  VAULT_PATH: "/vault",
  DEV_USER_ID: "lutz",
  ANTHROPIC_API_KEY: "sk-ant-test",
};

describe("readServerConfig", () => {
  it("applies defaults for PORT, LOG_LEVEL, provider and model", () => {
    expect(readServerConfig(complete)).toEqual({
      vaultPath: "/vault",
      devUserId: "lutz",
      port: DEFAULT_PORT,
      logLevel: "info",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
    });
  });

  it("reads PORT and LOG_LEVEL when set", () => {
    const config = readServerConfig({
      ...complete,
      PORT: "4000",
      LOG_LEVEL: "debug",
    });
    expect(config.port).toBe(4000);
    expect(config.logLevel).toBe("debug");
  });

  it("selects the provider's default model and requires its API key", () => {
    const config = readServerConfig({
      VAULT_PATH: "/vault",
      DEV_USER_ID: "lutz",
      GTD_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
    });
    expect(config.provider).toBe("openai");
    expect(config.modelId).toBe("gpt-5.4-mini");
    expect(() =>
      readServerConfig({ ...complete, GTD_PROVIDER: "deepseek" }),
    ).toThrow(/DEEPSEEK_API_KEY/);
  });

  it("lets GTD_MODEL override the provider default", () => {
    expect(
      readServerConfig({ ...complete, GTD_MODEL: "claude-opus-5-5" }).modelId,
    ).toBe("claude-opus-5-5");
  });

  it("rejects an unknown GTD_PROVIDER instead of falling back", () => {
    expect(() =>
      readServerConfig({ ...complete, GTD_PROVIDER: "gemini" }),
    ).toThrow(/GTD_PROVIDER/);
  });

  it("names a missing VAULT_PATH", () => {
    expect(() =>
      readServerConfig({ DEV_USER_ID: "lutz", ANTHROPIC_API_KEY: "k" }),
    ).toThrow(/VAULT_PATH/);
  });

  it("names a missing DEV_USER_ID and treats empty strings as missing", () => {
    expect(() => readServerConfig({ ...complete, DEV_USER_ID: "" })).toThrow(
      /DEV_USER_ID/,
    );
  });

  it("names every missing variable, the provider's API key included, in one ConfigError", () => {
    let caught: unknown;
    try {
      readServerConfig({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as Error).message).toMatch(/VAULT_PATH/);
    expect((caught as Error).message).toMatch(/DEV_USER_ID/);
    expect((caught as Error).message).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("rejects a PORT that is not a valid TCP port", () => {
    for (const PORT of ["abc", "0", "70000", "12.5"]) {
      expect(() => readServerConfig({ ...complete, PORT })).toThrow(/PORT/);
    }
  });

  it("rejects an unknown LOG_LEVEL", () => {
    expect(() =>
      readServerConfig({ ...complete, LOG_LEVEL: "verbose" }),
    ).toThrow(/LOG_LEVEL/);
  });
});
