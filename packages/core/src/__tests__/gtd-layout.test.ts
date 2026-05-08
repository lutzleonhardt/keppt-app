import { describe, expect, it } from "vitest";

import { InvalidPathError } from "../file-repository.js";
import {
  canRead,
  canWrite,
  isInActiveScope,
  isInArchiveScope,
} from "../gtd-layout.js";

const TODAY = "2026-05-08";

describe("gtd-layout — canRead", () => {
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

  it("allows today's daily note and any archived daily note", () => {
    expect(canRead(`daily/${TODAY}.md`, TODAY)).toBe(true);
    expect(canRead("archive/daily/2025-01-01.md", TODAY)).toBe(true);
    expect(canRead("archive/daily/2026-04-30.md", TODAY)).toBe(true);
  });

  it("denies non-today daily notes", () => {
    expect(canRead("daily/2026-05-07.md", TODAY)).toBe(false);
    expect(canRead("daily/2025-12-31.md", TODAY)).toBe(false);
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

describe("gtd-layout — canWrite", () => {
  it("allows the 5 GTD task files and today's daily note", () => {
    expect(canWrite("tasks/inbox.md", TODAY)).toBe(true);
    expect(canWrite("tasks/focus.md", TODAY)).toBe(true);
    expect(canWrite("tasks/next-actions.md", TODAY)).toBe(true);
    expect(canWrite("tasks/waiting.md", TODAY)).toBe(true);
    expect(canWrite("tasks/someday-maybe.md", TODAY)).toBe(true);
    expect(canWrite(`daily/${TODAY}.md`, TODAY)).toBe(true);
  });

  it("denies all archive paths (system-managed)", () => {
    expect(canWrite("archive/daily/2025-01-01.md", TODAY)).toBe(false);
    expect(canWrite("archive/daily/2026-04-30.md", TODAY)).toBe(false);
  });

  it("denies non-today daily notes and root files", () => {
    expect(canWrite("daily/2026-05-07.md", TODAY)).toBe(false);
    expect(canWrite("notes.md", TODAY)).toBe(false);
    expect(canWrite("tasks/random.md", TODAY)).toBe(false);
  });

  it("throws InvalidPathError on traversal, .keppt, or absolute paths", () => {
    expect(() => canWrite("../escape.md", TODAY)).toThrow(InvalidPathError);
    expect(() => canWrite(".keppt/foo.md", TODAY)).toThrow(InvalidPathError);
    expect(() => canWrite("/abs/path.md", TODAY)).toThrow(InvalidPathError);
  });
});

describe("gtd-layout — isInActiveScope / isInArchiveScope", () => {
  // Search predicates mirror canRead exactly: any path search returns must
  // also be readable, otherwise search snippets are an exfiltration channel.

  it("active scope covers exactly the 5 task files plus today's daily", () => {
    expect(isInActiveScope("tasks/inbox.md", TODAY)).toBe(true);
    expect(isInActiveScope("tasks/focus.md", TODAY)).toBe(true);
    expect(isInActiveScope("tasks/next-actions.md", TODAY)).toBe(true);
    expect(isInActiveScope("tasks/waiting.md", TODAY)).toBe(true);
    expect(isInActiveScope("tasks/someday-maybe.md", TODAY)).toBe(true);
    expect(isInActiveScope(`daily/${TODAY}.md`, TODAY)).toBe(true);
  });

  it("active scope rejects non-allowlisted task files and non-today daily", () => {
    expect(isInActiveScope("tasks/random.md", TODAY)).toBe(false);
    expect(isInActiveScope("tasks/projects/work.md", TODAY)).toBe(false);
    expect(isInActiveScope("daily/2026-05-07.md", TODAY)).toBe(false);
    expect(isInActiveScope("archive/daily/2026-05-01.md", TODAY)).toBe(false);
    expect(isInActiveScope("notes.md", TODAY)).toBe(false);
    expect(isInActiveScope("tasks/inbox.txt", TODAY)).toBe(false);
  });

  it("archive scope covers exactly date-formatted archive dailies", () => {
    expect(isInArchiveScope("archive/daily/2025-01-01.md")).toBe(true);
    expect(isInArchiveScope("archive/daily/2026-04-30.md")).toBe(true);
  });

  it("archive scope rejects non-date archive entries and other paths", () => {
    expect(isInArchiveScope("archive/daily/note.md")).toBe(false);
    expect(isInArchiveScope("archive/daily/2025-01-01.txt")).toBe(false);
    expect(isInArchiveScope("archive/tasks/old.md")).toBe(false);
    expect(isInArchiveScope("tasks/inbox.md")).toBe(false);
    expect(isInArchiveScope("daily/2026-05-08.md")).toBe(false);
  });
});
