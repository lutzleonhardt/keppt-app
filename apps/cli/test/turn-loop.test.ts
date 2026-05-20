import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readTurnClock } from "../src/turn-loop.js";

// T5-AC-10: GTD_NOW_OVERRIDE flows through the per-turn clock seam.
//
// `readTurnClock` is the single integration point — `handleTurn` calls it
// to populate `refs.turnNow`, which fans out through every closure that
// asks for "now" (repo, tools, system-prompt). Pinning the seam directly
// is enough to validate the contract; spinning up `handleTurn` would
// require the entire repo/session/logger plumbing for a one-line branch.

describe("readTurnClock — GTD_NOW_OVERRIDE", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.GTD_NOW_OVERRIDE;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.GTD_NOW_OVERRIDE;
    } else {
      process.env.GTD_NOW_OVERRIDE = savedEnv;
    }
  });

  it("returns the ISO-parsed env value when set", () => {
    process.env.GTD_NOW_OVERRIDE = "2026-05-21T09:00:00Z";
    const now = readTurnClock();
    expect(now.toISOString()).toBe("2026-05-21T09:00:00.000Z");
  });

  it("falls back to the wall clock when unset", () => {
    delete process.env.GTD_NOW_OVERRIDE;
    const before = Date.now();
    const now = readTurnClock();
    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it("falls back to the wall clock when the env value is empty", () => {
    process.env.GTD_NOW_OVERRIDE = "";
    const before = Date.now();
    const now = readTurnClock();
    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it("falls back to the wall clock when the env value is unparsable", () => {
    process.env.GTD_NOW_OVERRIDE = "not-a-date";
    const before = Date.now();
    const now = readTurnClock();
    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it("reads the env fresh on each call (mid-session unset returns to wall clock)", () => {
    process.env.GTD_NOW_OVERRIDE = "2026-05-21T09:00:00Z";
    const pinned = readTurnClock();
    expect(pinned.toISOString()).toBe("2026-05-21T09:00:00.000Z");

    delete process.env.GTD_NOW_OVERRIDE;
    const wall = readTurnClock();
    expect(wall.getTime()).not.toBe(pinned.getTime());
  });
});
