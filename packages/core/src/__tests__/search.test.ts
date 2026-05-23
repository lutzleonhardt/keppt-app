import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatToday } from "../search.js";

describe("formatToday", () => {
  let savedTZ: string | undefined;

  beforeEach(() => {
    savedTZ = process.env.TZ;
    process.env.TZ = "Europe/Berlin";
  });

  afterEach(() => {
    if (savedTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = savedTZ;
    }
  });

  it("uses the local calendar day, not the UTC day", () => {
    expect(formatToday(new Date("2026-05-22T22:30:00.000Z"))).toBe(
      "2026-05-23",
    );
  });
});
