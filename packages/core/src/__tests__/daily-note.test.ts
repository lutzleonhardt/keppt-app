import { describe, expect, it } from "vitest";

import { offsetDate } from "../layout/daily-note.js";

describe("offsetDate", () => {
  it("shifts across month and year boundaries in both directions", () => {
    expect(offsetDate("2026-05-20", -5)).toBe("2026-05-15");
    expect(offsetDate("2026-05-31", 1)).toBe("2026-06-01");
    expect(offsetDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(offsetDate("2024-02-28", 1)).toBe("2024-02-29");
    expect(offsetDate("2026-05-20", 0)).toBe("2026-05-20");
  });
});
