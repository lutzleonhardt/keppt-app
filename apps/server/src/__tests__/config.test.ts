import { describe, expect, it } from "vitest";

import { ConfigError, DEFAULT_PORT, readServerConfig } from "../config.js";

const complete = { VAULT_PATH: "/vault", DEV_USER_ID: "lutz" };

describe("readServerConfig", () => {
  it("applies defaults for PORT and LOG_LEVEL", () => {
    expect(readServerConfig(complete)).toEqual({
      vaultPath: "/vault",
      devUserId: "lutz",
      port: DEFAULT_PORT,
      logLevel: "info",
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

  it("names a missing VAULT_PATH", () => {
    expect(() => readServerConfig({ DEV_USER_ID: "lutz" })).toThrow(
      /VAULT_PATH/,
    );
  });

  it("names a missing DEV_USER_ID and treats empty strings as missing", () => {
    expect(() =>
      readServerConfig({ VAULT_PATH: "/vault", DEV_USER_ID: "" }),
    ).toThrow(/DEV_USER_ID/);
  });

  it("names every missing variable in one ConfigError", () => {
    let caught: unknown;
    try {
      readServerConfig({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as Error).message).toMatch(/VAULT_PATH/);
    expect((caught as Error).message).toMatch(/DEV_USER_ID/);
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
