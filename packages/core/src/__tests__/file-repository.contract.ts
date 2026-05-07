import { describe, expect, it } from "vitest";

import type { FileRepository } from "../file-repository.js";
import { FileNotFoundError, InvalidPathError } from "../file-repository.js";

export interface ContractHarness {
  repo: FileRepository;
  /** Access the history log after a write (path for Local, array for InMemory). */
  readHistory(): Promise<string[]>;
}

export function runFileRepositoryContract(
  label: string,
  makeHarness: () => Promise<ContractHarness>,
): void {
  describe(`${label} — FileRepository contract`, () => {
    it("write + read round-trips UTF-8 content", async () => {
      const { repo } = await makeHarness();
      await repo.write("tasks/inbox.md", "# Inbox\n- eggs\n", "create inbox");
      expect(await repo.read("tasks/inbox.md")).toBe("# Inbox\n- eggs\n");
    });

    it("read on missing file throws FileNotFoundError with the requested path", async () => {
      const { repo } = await makeHarness();
      await expect(repo.read("tasks/does-not-exist.md")).rejects.toBeInstanceOf(
        FileNotFoundError,
      );
      await expect(repo.read("tasks/does-not-exist.md")).rejects.toMatchObject({
        filePath: "tasks/does-not-exist.md",
      });
    });

    it("list is recursive, POSIX-styled, and prefix-filterable", async () => {
      const { repo } = await makeHarness();
      await repo.write("tasks/inbox.md", "a", "");
      await repo.write("tasks/focus.md", "b", "");
      await repo.write("daily/2026-04-24.md", "c", "");
      await repo.write("archive/daily/2026-04-01.md", "d", "");

      const all = await repo.list();
      expect(all).toEqual(
        expect.arrayContaining([
          "tasks/inbox.md",
          "tasks/focus.md",
          "daily/2026-04-24.md",
          "archive/daily/2026-04-01.md",
        ]),
      );

      const tasksOnly = await repo.list("tasks/");
      expect(tasksOnly.sort()).toEqual(["tasks/focus.md", "tasks/inbox.md"]);
    });

    it("list returns paths in lexicographic order", async () => {
      const { repo } = await makeHarness();
      await repo.write("z/last.md", "", "");
      await repo.write("a/first.md", "", "");
      await repo.write("m/middle.md", "", "");

      const all = await repo.list();
      expect(all).toEqual(["a/first.md", "m/middle.md", "z/last.md"]);
    });

    it("write appends a well-formed history entry", async () => {
      const { repo, readHistory } = await makeHarness();
      await repo.write("tasks/inbox.md", "first", "create");
      await repo.write("tasks/inbox.md", "second", "update");

      const lines = await readHistory();
      expect(lines).toHaveLength(2);
      const [first, second] = lines.map((l) => JSON.parse(l));
      expect(first).toMatchObject({
        filePath: "tasks/inbox.md",
        contentBefore: "",
        contentAfter: "first",
        changeSummary: "create",
        changedBy: "llm",
      });
      expect(second).toMatchObject({
        filePath: "tasks/inbox.md",
        contentBefore: "first",
        contentAfter: "second",
        changeSummary: "update",
      });
      expect(typeof first.id).toBe("string");
      expect(first.id.length).toBeGreaterThan(0);
      expect(() => new Date(first.changedAt).toISOString()).not.toThrow();
    });

    it("search respects active/archive/all scope and today's daily note", async () => {
      const { repo } = await makeHarness();
      // "today" is injected by the harness via a fixed clock (see factories).
      await repo.write("tasks/inbox.md", "call vet about cat\nbuy milk", "");
      await repo.write("daily/2026-04-24.md", "cat nap at 15:00", "");
      await repo.write("daily/2026-04-23.md", "yesterday cat visit", "");
      await repo.write("archive/daily/2026-04-01.md", "cat grooming", "");

      const active = await repo.search("cat", "active");
      expect(active.map((r) => r.filePath).sort()).toEqual([
        "daily/2026-04-24.md",
        "tasks/inbox.md",
      ]);

      const archive = await repo.search("cat", "archive");
      expect(archive.map((r) => r.filePath)).toEqual(["archive/daily/2026-04-01.md"]);

      const all = await repo.search("cat", "all");
      expect(all.map((r) => r.filePath).sort()).toEqual([
        "archive/daily/2026-04-01.md",
        "daily/2026-04-24.md",
        "tasks/inbox.md",
      ]);

      // yesterday's daily note is not "active"
      expect(active.find((r) => r.filePath === "daily/2026-04-23.md")).toBeUndefined();
    });

    it("search returns 1-based line numbers and snippet around the match", async () => {
      const { repo } = await makeHarness();
      await repo.write(
        "tasks/inbox.md",
        "line one\nhere is the needle in the haystack\nline three",
        "",
      );
      const hits = await repo.search("needle", "active");
      expect(hits).toHaveLength(1);
      expect(hits[0]!.line).toBe(2);
      expect(hits[0]!.snippet).toContain("needle");
    });

    it("search is case-insensitive", async () => {
      const { repo } = await makeHarness();
      await repo.write("tasks/inbox.md", "Buy MILK", "");
      const hits = await repo.search("milk", "active");
      expect(hits).toHaveLength(1);
    });

    describe("edit", () => {
      it("applies a single unique edit and appends one history entry", async () => {
        const { repo, readHistory } = await makeHarness();
        await repo.write("tasks/inbox.md", "hello world", "create");
        const result = await repo.edit(
          "tasks/inbox.md",
          [{ search: "world", replace: "there" }],
          "greet",
        );
        expect(result).toEqual({ ok: true });
        expect(await repo.read("tasks/inbox.md")).toBe("hello there");

        const lines = await readHistory();
        expect(lines).toHaveLength(2); // initial write + edit
        const last = JSON.parse(lines[1]!);
        expect(last).toMatchObject({
          filePath: "tasks/inbox.md",
          contentBefore: "hello world",
          contentAfter: "hello there",
          changeSummary: "greet",
        });
      });

      it("applies three edits in one call as a single history entry", async () => {
        const { repo, readHistory } = await makeHarness();
        await repo.write("tasks/inbox.md", "alpha\nbeta\ngamma\n", "create");
        const result = await repo.edit(
          "tasks/inbox.md",
          [
            { search: "alpha", replace: "ALPHA" },
            { search: "beta", replace: "BETA" },
            { search: "gamma", replace: "GAMMA" },
          ],
          "upcase",
        );
        expect(result).toEqual({ ok: true });
        expect(await repo.read("tasks/inbox.md")).toBe("ALPHA\nBETA\nGAMMA\n");

        const lines = await readHistory();
        expect(lines).toHaveLength(2); // initial write + one batch edit
      });

      it("returns structured error and writes no history when the file is missing", async () => {
        const { repo, readHistory } = await makeHarness();
        const result = await repo.edit(
          "tasks/missing.md",
          [{ search: "anything", replace: "x" }],
          "noop",
        );
        expect(result).toEqual({
          ok: false,
          error: { failedSearch: "anything", matchCount: 0, currentContent: "" },
        });
        expect(await readHistory()).toHaveLength(0);
      });

      it("returns matchCount:0 and leaves file + history untouched when search is absent", async () => {
        const { repo, readHistory } = await makeHarness();
        await repo.write("tasks/inbox.md", "hello world", "create");
        const result = await repo.edit(
          "tasks/inbox.md",
          [{ search: "xyzzy", replace: "x" }],
          "noop",
        );
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({
          failedSearch: "xyzzy",
          matchCount: 0,
          currentContent: "hello world",
        });
        expect(await repo.read("tasks/inbox.md")).toBe("hello world");
        expect(await readHistory()).toHaveLength(1); // only the initial write
      });

      it("returns matchCount:2 and leaves file + history untouched when search is ambiguous", async () => {
        const { repo, readHistory } = await makeHarness();
        await repo.write("tasks/inbox.md", "foo foo", "create");
        const result = await repo.edit(
          "tasks/inbox.md",
          [{ search: "foo", replace: "bar" }],
          "noop",
        );
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({
          failedSearch: "foo",
          matchCount: 2,
          currentContent: "foo foo",
        });
        expect(await repo.read("tasks/inbox.md")).toBe("foo foo");
        expect(await readHistory()).toHaveLength(1);
      });

      it("is atomic across edits: mid-sequence ambiguity aborts the whole batch", async () => {
        const { repo, readHistory } = await makeHarness();
        await repo.write("tasks/inbox.md", "one\ndup\ntwo\ndup\nthree\n", "create");
        const result = await repo.edit(
          "tasks/inbox.md",
          [
            { search: "one", replace: "ONE" },
            { search: "dup", replace: "DUP" },
            { search: "three", replace: "THREE" },
          ],
          "noop",
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatchObject({ failedSearch: "dup", matchCount: 2 });
        expect(await repo.read("tasks/inbox.md")).toBe("one\ndup\ntwo\ndup\nthree\n");
        expect(await readHistory()).toHaveLength(1);
      });

      it("rejects overlapping edits and leaves the file unchanged", async () => {
        const { repo, readHistory } = await makeHarness();
        await repo.write("tasks/inbox.md", "the quick brown fox", "create");
        const result = await repo.edit(
          "tasks/inbox.md",
          [
            { search: "quick brown", replace: "slow red" },
            { search: "brown fox", replace: "green cat" },
          ],
          "noop",
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatchObject({
          failedSearch: "brown fox",
          matchCount: 0,
        });
        expect(await repo.read("tasks/inbox.md")).toBe("the quick brown fox");
        expect(await readHistory()).toHaveLength(1);
      });

      it("translates InvalidPathError into a structured EditResult (no throw, no history)", async () => {
        const { repo, readHistory } = await makeHarness();
        const result = await repo.edit(
          "../escape.md",
          [{ search: "x", replace: "y" }],
          "noop",
        );
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({
          failedSearch: "x",
          matchCount: 0,
          currentContent: "",
        });
        expect(await readHistory()).toHaveLength(0);
      });
    });

    describe("path validation", () => {
      const bad: Array<[string, string]> = [
        ["absolute path", "/etc/passwd"],
        ["parent traversal", "../outside.md"],
        ["nested parent traversal", "tasks/../../outside.md"],
        ["current-dir segment", "./tasks/inbox.md"],
        ["backslash separator", "tasks\\inbox.md"],
        ["empty string", ""],
        ["leading slash segment", "//tasks/inbox.md"],
        ["reserved history dir", ".gtd-companion/file-history.jsonl"],
        ["null byte", "tasks/\0bad.md"],
      ];

      for (const [name, input] of bad) {
        it(`write rejects ${name}`, async () => {
          const { repo } = await makeHarness();
          await expect(repo.write(input, "x", "")).rejects.toBeInstanceOf(InvalidPathError);
        });

        it(`read rejects ${name}`, async () => {
          const { repo } = await makeHarness();
          await expect(repo.read(input)).rejects.toBeInstanceOf(InvalidPathError);
        });
      }

      it("rejected writes leave no history entry", async () => {
        const { repo, readHistory } = await makeHarness();
        await expect(repo.write("../escape.md", "x", "")).rejects.toBeInstanceOf(
          InvalidPathError,
        );
        expect(await readHistory()).toHaveLength(0);
      });
    });
  });
}
