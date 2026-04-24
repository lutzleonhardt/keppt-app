import { describe, expect, it } from "vitest";

import type { FileRepository } from "../file-repository.js";
import { FileNotFoundError } from "../file-repository.js";

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
  });
}
