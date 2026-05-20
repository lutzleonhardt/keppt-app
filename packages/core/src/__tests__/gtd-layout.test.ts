import { describe, expect, it } from "vitest";

import { InvalidPathError } from "../file-repository.js";
import {
  canRead,
  canWrite,
  isCanonicalTaskFile,
  isInActiveScope,
  isInArchiveScope,
  isPastDaily,
} from "../gtd-layout.js";

const TODAY = "2026-05-08";

describe("gtd-layout — canRead (T5-AC-01)", () => {
  it("allows each of the 5 GTD task files", () => {
    for (const f of [
      "tasks/inbox.md",
      "tasks/focus.md",
      "tasks/next-actions.md",
      "tasks/waiting.md",
      "tasks/someday-maybe.md",
    ]) {
      expect(canRead(f, TODAY)).toBe(true);
    }
  });

  it("allows past, today, and future date-formatted daily notes", () => {
    // Task 5 redesign: the gate no longer filters daily notes by date.
    expect(canRead("daily/2026-05-09.md", TODAY)).toBe(true); // past
    expect(canRead(`daily/${TODAY}.md`, TODAY)).toBe(true); // today
    expect(canRead("daily/2026-06-01.md", TODAY)).toBe(true); // future
  });

  it("denies non-date daily files (out-of-scope by format)", () => {
    expect(canRead("daily/notes.md", TODAY)).toBe(false);
    expect(canRead("daily/2026-05-08.txt", TODAY)).toBe(false);
  });

  it("denies legacy archive/daily paths after the redesign", () => {
    // Pre-redesign archive/daily/*.md files (if any persist in older vaults)
    // are no longer routinely surfaced. The directory is dead surface; the
    // LLM gate returns out_of_scope and search post-filtering drops snippets.
    expect(canRead("archive/daily/2025-01-01.md", TODAY)).toBe(false);
    expect(canRead("archive/daily/2026-04-30.md", TODAY)).toBe(false);
  });

  it("denies non-allowlisted task files and root files", () => {
    expect(canRead("tasks/random.md", TODAY)).toBe(false);
    expect(canRead("tasks/projects/work.md", TODAY)).toBe(false);
    expect(canRead("notes.md", TODAY)).toBe(false);
    expect(canRead("README.md", TODAY)).toBe(false);
  });

  it("denies arbitrary directories outside the layout", () => {
    expect(canRead(".obsidian/workspace.json", TODAY)).toBe(false);
    expect(canRead("archive/tasks/old.md", TODAY)).toBe(false);
    expect(canRead("archive/daily/not-a-date.md", TODAY)).toBe(false);
  });

  it("throws InvalidPathError on traversal, .keppt, or absolute paths", () => {
    expect(() => canRead("../escape.md", TODAY)).toThrow(InvalidPathError);
    expect(() => canRead(".keppt/foo.md", TODAY)).toThrow(InvalidPathError);
    expect(() => canRead("/abs/path.md", TODAY)).toThrow(InvalidPathError);
    expect(() => canRead("a\\b.md", TODAY)).toThrow(InvalidPathError);
  });
});

describe("gtd-layout — canWrite (T5-AC-02)", () => {
  it("allows the 5 GTD task files", () => {
    expect(canWrite("tasks/inbox.md", TODAY)).toBe(true);
    expect(canWrite("tasks/focus.md", TODAY)).toBe(true);
    expect(canWrite("tasks/next-actions.md", TODAY)).toBe(true);
    expect(canWrite("tasks/waiting.md", TODAY)).toBe(true);
    expect(canWrite("tasks/someday-maybe.md", TODAY)).toBe(true);
  });

  it("allows past, today, and future date-formatted daily notes", () => {
    // The past-daily read-only stance is a prompt rule (R6 correction
    // carve-out), not a gate. The gate accepts any valid daily date.
    expect(canWrite("daily/2026-05-09.md", TODAY)).toBe(true); // past
    expect(canWrite(`daily/${TODAY}.md`, TODAY)).toBe(true); // today
    expect(canWrite("daily/2026-06-01.md", TODAY)).toBe(true); // future
  });

  it("denies legacy archive paths (no longer the daily-archive surface)", () => {
    expect(canWrite("archive/daily/2025-01-01.md", TODAY)).toBe(false);
    expect(canWrite("archive/daily/2026-04-30.md", TODAY)).toBe(false);
  });

  it("denies non-date daily files and arbitrary task files", () => {
    expect(canWrite("daily/notes.md", TODAY)).toBe(false);
    expect(canWrite("notes.md", TODAY)).toBe(false);
    expect(canWrite("tasks/random.md", TODAY)).toBe(false);
  });

  it("throws InvalidPathError on traversal, .keppt, or absolute paths", () => {
    expect(() => canWrite("../escape.md", TODAY)).toThrow(InvalidPathError);
    expect(() => canWrite(".keppt/foo.md", TODAY)).toThrow(InvalidPathError);
    expect(() => canWrite("/abs/path.md", TODAY)).toThrow(InvalidPathError);
  });
});

describe("gtd-layout — isPastDaily (R6 write_file carve-out)", () => {
  // The predicate isolates strictly-past dailies for the write_file hard
  // guard. edit_file does not consult it — narrow corrections per R6 still
  // need to land — so the predicate is intentionally write-only.

  it("returns true only for date-formatted dailies strictly before today", () => {
    expect(isPastDaily("daily/2026-05-07.md", TODAY)).toBe(true);
    expect(isPastDaily("daily/2025-12-31.md", TODAY)).toBe(true);
  });

  it("returns false for today's and future dailies", () => {
    expect(isPastDaily(`daily/${TODAY}.md`, TODAY)).toBe(false);
    expect(isPastDaily("daily/2026-05-09.md", TODAY)).toBe(false);
    expect(isPastDaily("daily/2026-06-01.md", TODAY)).toBe(false);
  });

  it("returns false for non-daily paths (task files, archive, non-date)", () => {
    expect(isPastDaily("tasks/inbox.md", TODAY)).toBe(false);
    expect(isPastDaily("archive/daily/2025-01-01.md", TODAY)).toBe(false);
    expect(isPastDaily("daily/notes.md", TODAY)).toBe(false);
  });
});

describe("gtd-layout — isInActiveScope / isInArchiveScope (T5-AC-03)", () => {
  // Search predicates mirror canRead exactly: any path search returns must
  // also be readable, otherwise search snippets are an exfiltration channel.

  it("active scope covers the 5 task files plus any date-formatted daily", () => {
    expect(isInActiveScope("tasks/inbox.md", TODAY)).toBe(true);
    expect(isInActiveScope("tasks/focus.md", TODAY)).toBe(true);
    expect(isInActiveScope("tasks/next-actions.md", TODAY)).toBe(true);
    expect(isInActiveScope("tasks/waiting.md", TODAY)).toBe(true);
    expect(isInActiveScope("tasks/someday-maybe.md", TODAY)).toBe(true);
    expect(isInActiveScope("daily/2026-05-09.md", TODAY)).toBe(true); // past
    expect(isInActiveScope(`daily/${TODAY}.md`, TODAY)).toBe(true); // today
    expect(isInActiveScope("daily/2026-06-01.md", TODAY)).toBe(true); // future
  });

  it("active scope rejects non-allowlisted task files and non-date daily", () => {
    expect(isInActiveScope("tasks/random.md", TODAY)).toBe(false);
    expect(isInActiveScope("tasks/projects/work.md", TODAY)).toBe(false);
    expect(isInActiveScope("daily/notes.md", TODAY)).toBe(false);
    expect(isInActiveScope("archive/daily/2026-05-01.md", TODAY)).toBe(false);
    expect(isInActiveScope("notes.md", TODAY)).toBe(false);
    expect(isInActiveScope("tasks/inbox.txt", TODAY)).toBe(false);
  });

  it("isInArchiveScope returns false for daily/* (past dailies are not relocated)", () => {
    expect(isInArchiveScope("daily/2026-05-09.md")).toBe(false);
    expect(isInArchiveScope("daily/2026-05-08.md")).toBe(false);
    expect(isInArchiveScope("daily/2026-06-01.md")).toBe(false);
  });

  it("archive scope shape preserved for legacy archive/daily paths", () => {
    // The predicate keeps its shape so the search-scope plumbing stays
    // intact for future non-daily archive subpaths. Legacy archive/daily
    // files would still match here — but the LLM gate (canRead) rejects
    // them, so search post-filtering drops the snippets regardless.
    expect(isInArchiveScope("archive/daily/2025-01-01.md")).toBe(true);
    expect(isInArchiveScope("archive/daily/2026-04-30.md")).toBe(true);
  });

  it("archive scope rejects non-date archive entries and other paths", () => {
    expect(isInArchiveScope("archive/daily/note.md")).toBe(false);
    expect(isInArchiveScope("archive/daily/2025-01-01.txt")).toBe(false);
    expect(isInArchiveScope("archive/tasks/old.md")).toBe(false);
    expect(isInArchiveScope("tasks/inbox.md")).toBe(false);
  });
});

describe("gtd-layout — isCanonicalTaskFile", () => {
  // Pure predicate: the five task files plus today's daily note. Shape
  // mirrors canWrite's decision without throwing on invalid input — the
  // tool layer only calls it after canWrite/canRead has already validated.

  it("returns true for each of the 5 GTD task files", () => {
    for (const f of [
      "tasks/inbox.md",
      "tasks/focus.md",
      "tasks/next-actions.md",
      "tasks/waiting.md",
      "tasks/someday-maybe.md",
    ]) {
      expect(isCanonicalTaskFile(f, TODAY)).toBe(true);
    }
  });

  it("returns true for today's daily note only", () => {
    expect(isCanonicalTaskFile(`daily/${TODAY}.md`, TODAY)).toBe(true);
    expect(isCanonicalTaskFile("daily/2026-05-07.md", TODAY)).toBe(false);
    expect(isCanonicalTaskFile("daily/2026-05-09.md", TODAY)).toBe(false);
  });

  it("returns false for archive paths and non-allowlisted files", () => {
    expect(isCanonicalTaskFile("archive/daily/2026-05-01.md", TODAY)).toBe(false);
    expect(isCanonicalTaskFile("archive/tasks/old.md", TODAY)).toBe(false);
    expect(isCanonicalTaskFile("tasks/random.md", TODAY)).toBe(false);
    expect(isCanonicalTaskFile("tasks/projects/work.md", TODAY)).toBe(false);
    expect(isCanonicalTaskFile("notes.md", TODAY)).toBe(false);
    expect(isCanonicalTaskFile("README.md", TODAY)).toBe(false);
  });

  it("does not throw on inputs canRead/canWrite would reject", () => {
    // canRead/canWrite would throw InvalidPathError on these. The canonical
    // helper is tolerant by design — its callers never pass such paths, but
    // the predicate must remain non-throwing so the tool-layer error shape
    // stays under outer-catch control. AC-07.
    expect(() => isCanonicalTaskFile("../escape.md", TODAY)).not.toThrow();
    expect(isCanonicalTaskFile("../escape.md", TODAY)).toBe(false);
    expect(() => isCanonicalTaskFile(".keppt/foo.md", TODAY)).not.toThrow();
    expect(isCanonicalTaskFile(".keppt/foo.md", TODAY)).toBe(false);
    expect(() => isCanonicalTaskFile("/abs/path.md", TODAY)).not.toThrow();
    expect(isCanonicalTaskFile("/abs/path.md", TODAY)).toBe(false);
  });
});
