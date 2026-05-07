import { describe, expect, it } from "vitest";

import { planAndApplyEdits } from "../edit.js";

describe("planAndApplyEdits", () => {
  it("applies a single unique edit", () => {
    const result = planAndApplyEdits("hello world", [{ search: "world", replace: "there" }]);
    expect(result).toEqual({ ok: true, next: "hello there" });
  });

  it("applies three unique edits atomically", () => {
    const original = "alpha\nbeta\ngamma\n";
    const result = planAndApplyEdits(original, [
      { search: "alpha", replace: "ALPHA" },
      { search: "beta", replace: "BETA" },
      { search: "gamma", replace: "GAMMA" },
    ]);
    expect(result).toEqual({ ok: true, next: "ALPHA\nBETA\nGAMMA\n" });
  });

  it("returns matchCount:0 when search is absent", () => {
    const original = "hello world";
    const result = planAndApplyEdits(original, [{ search: "xyzzy", replace: "X" }]);
    expect(result).toEqual({
      ok: false,
      error: { failedSearch: "xyzzy", matchCount: 0, currentContent: original },
    });
  });

  it("returns matchCount>1 when search is ambiguous", () => {
    const original = "foo foo";
    const result = planAndApplyEdits(original, [{ search: "foo", replace: "bar" }]);
    expect(result).toEqual({
      ok: false,
      error: { failedSearch: "foo", matchCount: 2, currentContent: original },
    });
  });

  it("aborts atomically when a mid-sequence edit is ambiguous", () => {
    const original = "one\ndup\ntwo\ndup\nthree\n";
    const result = planAndApplyEdits(original, [
      { search: "one", replace: "ONE" },
      { search: "dup", replace: "DUP" }, // appears twice → abort
      { search: "three", replace: "THREE" },
    ]);
    expect(result).toEqual({
      ok: false,
      error: { failedSearch: "dup", matchCount: 2, currentContent: original },
    });
  });

  it("detects overlapping edits (span intersection in original)", () => {
    const original = "the quick brown fox";
    // "quick brown" and "brown fox" overlap on "brown".
    const result = planAndApplyEdits(original, [
      { search: "quick brown", replace: "slow red" },
      { search: "brown fox", replace: "green cat" },
    ]);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: { failedSearch: "brown fox", matchCount: 0, currentContent: original },
    });
  });

  it("treats '$&' and other regex-like sequences in replace as literal", () => {
    const original = "keep needle here";
    const result = planAndApplyEdits(original, [
      { search: "needle", replace: "$& $1 $$" },
    ]);
    expect(result).toEqual({ ok: true, next: "keep $& $1 $$ here" });
  });

  it("rejects an empty edits array", () => {
    const result = planAndApplyEdits("hello", []);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: { failedSearch: "", matchCount: 0, currentContent: "hello" },
    });
  });

  it("rejects an edit with an empty search string", () => {
    const result = planAndApplyEdits("hello", [{ search: "", replace: "X" }]);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: { failedSearch: "", matchCount: 0, currentContent: "hello" },
    });
  });

  it("treats self-overlapping search occurrences as ambiguous", () => {
    // "aa" has two valid start offsets in "aaa" (positions 0 and 1).
    // The planner must report matchCount:2 rather than picking the first.
    const result = planAndApplyEdits("aaa", [{ search: "aa", replace: "X" }]);
    expect(result).toEqual({
      ok: false,
      error: { failedSearch: "aa", matchCount: 2, currentContent: "aaa" },
    });
  });

  it("applies non-overlapping edits in any input order correctly", () => {
    const original = "A B C D E";
    // List the later-positioned edit first; planner must still place each at
    // its original position.
    const result = planAndApplyEdits(original, [
      { search: "D", replace: "d" },
      { search: "B", replace: "b" },
    ]);
    expect(result).toEqual({ ok: true, next: "A b C d E" });
  });
});
