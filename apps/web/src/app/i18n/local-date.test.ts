import { describe, expect, it } from "vitest";

import { formatLocalDate } from "./local-date";

describe("formatLocalDate", () => {
  it("formats the reference day in German", () => {
    expect(formatLocalDate("2026-05-06", "de")).toEqual({
      weekdayLabel: "Mittwoch",
      dateLabel: "6. Mai",
      compactLabel: "Mittwoch · 6. Mai",
      fullLabel: "Mittwoch, 6. Mai",
    });
  });

  it("formats the reference day in US English", () => {
    expect(formatLocalDate("2026-05-06", "en")).toEqual({
      weekdayLabel: "Wednesday",
      dateLabel: "May 6",
      compactLabel: "Wednesday · May 6",
      fullLabel: "Wednesday, May 6",
    });
  });

  it("keeps a date-only value on its UTC calendar day at a year boundary", () => {
    expect(formatLocalDate("2025-12-31", "en")).toEqual({
      weekdayLabel: "Wednesday",
      dateLabel: "December 31",
      compactLabel: "Wednesday · December 31",
      fullLabel: "Wednesday, December 31",
    });
  });
});
