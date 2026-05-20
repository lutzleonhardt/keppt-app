import { describe, expect, it } from "vitest";

import type { FileRepository } from "../file-repository.js";
import { FileNotFoundError, InvalidPathError } from "../file-repository.js";
import { canRead } from "../gtd-layout.js";

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

    it("search respects active/archive/all scope across any date-formatted daily", async () => {
      const { repo } = await makeHarness();
      // Task 5 redesign: active scope covers any `daily/YYYY-MM-DD.md`,
      // regardless of date. archive/daily/* is preserved at the
      // isInArchiveScope predicate so the scope plumbing still has a shape
      // for future non-daily archive subpaths.
      await repo.write("tasks/inbox.md", "call vet about cat\nbuy milk", "");
      await repo.write("daily/2026-04-24.md", "cat nap at 15:00", "");
      await repo.write("daily/2026-04-23.md", "yesterday cat visit", "");
      await repo.write("archive/daily/2026-04-01.md", "cat grooming", "");

      const active = await repo.search("cat", "active");
      expect(active.map((r) => r.filePath).sort()).toEqual([
        "daily/2026-04-23.md",
        "daily/2026-04-24.md",
        "tasks/inbox.md",
      ]);

      const archive = await repo.search("cat", "archive");
      expect(archive.map((r) => r.filePath)).toEqual(["archive/daily/2026-04-01.md"]);

      const all = await repo.search("cat", "all");
      expect(all.map((r) => r.filePath).sort()).toEqual([
        "archive/daily/2026-04-01.md",
        "daily/2026-04-23.md",
        "daily/2026-04-24.md",
        "tasks/inbox.md",
      ]);
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

    // Regression for the Codex review of Task 3.5: search must not surface
    // content from paths read_file would deny. The previous broader scope
    // predicates were an exfiltration channel via snippets.
    it("search does not surface content from paths denied by canRead", async () => {
      const { repo } = await makeHarness();
      const today = "2026-04-24"; // matches the harness clock
      const denied = [
        "tasks/projects/work.md",
        "tasks/random.md",
        "archive/daily/note.md", // non-date archive entry
        "archive/tasks/old.md",
      ];
      // Note: this is a *repo-level* contract test. After the Task 5 redesign
      // archive/daily/<date>.md still falls inside the repo's archive scope
      // (isInArchiveScope still matches by regex), but canRead now denies it.
      // The repo-level guarantee covered here is "the repo's scope filter
      // matches canRead for the paths it claims" — paths where the two
      // diverge are deliberately handled by the tool-layer postfilter
      // (`searchFilesTool > allowedByCanRead`). The tools.test.ts
      // "search_files filters hits from paths denied by canRead" suite is
      // the contract test for the cross-layer leak guarantee.
      for (const p of denied) {
        await repo.write(p, "secret-token-xyz", "seed");
        // sanity: each seeded path must indeed be denied by canRead
        expect(canRead(p, today)).toBe(false);
      }
      // also seed an allowed path so the assertion is not vacuously zero
      await repo.write("tasks/inbox.md", "secret-token-xyz", "seed");

      for (const scope of ["active", "archive", "all"] as const) {
        const hits = await repo.search("secret-token-xyz", scope);
        for (const h of hits) {
          expect(canRead(h.filePath, today)).toBe(true);
        }
      }
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
      // Each row: [label, input, expected reason from InvalidPathError].
      // Reasons are asserted so a refactor of the validator's strings
      // surfaces here instead of silently shifting the LLM-visible
      // tool-error shape.
      const bad: Array<[string, string, string]> = [
        // #1 empty / non-string
        ["empty string", "", "path must be a non-empty string"],
        // #2 null byte
        ["null byte", "tasks/\0bad.md", "path may not contain null bytes"],
        // #3 backslash
        [
          "backslash separator",
          "tasks\\inbox.md",
          "backslash is not allowed; use POSIX '/' separators",
        ],
        // #4 absolute path
        ["absolute path", "/etc/passwd", "absolute paths are not allowed"],
        // #5 empty segment
        [
          "double slash inside path",
          "tasks//inbox.md",
          "empty path segment (leading/trailing/double slash)",
        ],
        [
          "trailing slash",
          "tasks/inbox.md/",
          "empty path segment (leading/trailing/double slash)",
        ],
        // #6 .. segment
        [
          "parent traversal",
          "../outside.md",
          "parent-directory traversal is not allowed",
        ],
        [
          "nested parent traversal",
          "tasks/../../outside.md",
          "parent-directory traversal is not allowed",
        ],
        // #7 . segment
        [
          "current-dir segment",
          "./tasks/inbox.md",
          "current-directory segment is not allowed",
        ],
        // #8 reserved .keppt prefix
        [
          "reserved history dir",
          ".keppt/file-history.jsonl",
          "'.keppt/' is reserved for internal state",
        ],
        // #9 windows drive letter
        ["windows drive letter (slash)", "C:foo.md", "windows drive letter is not allowed"],
        ["windows drive letter (lower)", "c:foo/bar.md", "windows drive letter is not allowed"],
        // #10 trailing whitespace / trailing dot
        [
          "trailing whitespace in segment",
          "tasks/foo.md ",
          "segment has leading or trailing whitespace",
        ],
        [
          "leading whitespace in segment",
          " tasks/foo.md",
          "segment has leading or trailing whitespace",
        ],
        ["trailing dot in segment", "tasks/foo.md.", "segment has a trailing dot"],
        // #11 length caps
        [
          "path exceeds total length cap",
          "a".repeat(5000) + ".md",
          "path exceeds maximum length",
        ],
        [
          "segment exceeds per-segment length cap",
          "tasks/" + "a".repeat(300) + ".md",
          "segment exceeds maximum length",
        ],
        // #12 reserved Windows device names (case-insensitive, base before extension)
        [
          "reserved device name CON",
          "tasks/CON.md",
          "segment is a reserved Windows device name",
        ],
        [
          "reserved device name nul (lowercase)",
          "daily/nul.md",
          "segment is a reserved Windows device name",
        ],
        [
          "reserved device name com1",
          "tasks/com1.md",
          "segment is a reserved Windows device name",
        ],
        [
          "reserved device name LPT9",
          "tasks/LPT9",
          "segment is a reserved Windows device name",
        ],
      ];

      for (const [name, input, reason] of bad) {
        it(`write rejects ${name} with reason "${reason}"`, async () => {
          const { repo } = await makeHarness();
          await expect(repo.write(input, "x", "")).rejects.toBeInstanceOf(InvalidPathError);
          await expect(repo.write(input, "x", "")).rejects.toMatchObject({ reason });
        });

        it(`read rejects ${name} with reason "${reason}"`, async () => {
          const { repo } = await makeHarness();
          await expect(repo.read(input)).rejects.toBeInstanceOf(InvalidPathError);
          await expect(repo.read(input)).rejects.toMatchObject({ reason });
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
