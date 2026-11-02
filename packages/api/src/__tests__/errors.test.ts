import { describe, expect, it } from "vitest";

import { API_ERROR_CODES, apiErrorOf } from "../errors.js";

const VALID = {
  error: { code: "file_not_found", message: "No such file", requestId: "r1" },
};

describe("apiErrorOf", () => {
  it("returns the payload of a well-formed error body", () => {
    expect(apiErrorOf(VALID)).toEqual(VALID.error);
  });

  it("accepts every code of the tuple", () => {
    for (const code of API_ERROR_CODES) {
      const body = { error: { code, message: "m", requestId: "r" } };
      expect(apiErrorOf(body)?.code).toBe(code);
    }
  });

  it("returns undefined for a code outside the tuple", () => {
    const body = {
      error: { code: "no_such_code", message: "m", requestId: "r" },
    };
    expect(apiErrorOf(body)).toBeUndefined();
  });

  it("returns undefined for a text body", () => {
    expect(apiErrorOf("<html>502 Bad Gateway</html>")).toBeUndefined();
  });

  it("returns undefined for a ProgressEvent-shaped object", () => {
    const networkError = { type: "error", target: null, loaded: 0, total: 0 };
    expect(apiErrorOf(networkError)).toBeUndefined();
  });

  it("returns undefined for null and undefined", () => {
    expect(apiErrorOf(null)).toBeUndefined();
    expect(apiErrorOf(undefined)).toBeUndefined();
  });

  it("returns undefined when message or requestId is missing", () => {
    expect(apiErrorOf({ error: { code: "not_found" } })).toBeUndefined();
    expect(
      apiErrorOf({ error: { code: "not_found", message: "m" } }),
    ).toBeUndefined();
  });
});
