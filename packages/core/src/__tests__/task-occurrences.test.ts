import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { InMemoryFileRepository } from "../in-memory-file-repository.js";
import { LocalFileRepository } from "../local-file-repository.js";
import { findTaskOccurrences } from "../task-occurrences.js";

const FIXED_TODAY = "2026-05-22";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../");
const rasenFixtureVault = path.join(
  repoRoot,
  "docs/evals/scenario-01-rasen-double-schedule/vault",
);

describe("findTaskOccurrences", () => {
  it("matches literal candidates through Markdown markers, case, whitespace, and punctuation drift", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write(
      "tasks/inbox.md",
      "# Inbox\n\n- [ ]   RASEN-mähen,   morgen\n- [ ] Hecke schneiden\n",
      "seed",
    );

    const result = await findTaskOccurrences(repo, FIXED_TODAY, [
      "Rasen mähen",
      "rasen",
    ]);

    expect(result.searchedFiles).toEqual(["tasks/inbox.md"]);
    expect(result.blocks).toEqual([
      {
        file: "tasks/inbox.md",
        line: 3,
        rawBlock: [
          "",
          "- [ ]   RASEN-mähen,   morgen",
          "- [ ] Hecke schneiden",
        ],
      },
    ]);
  });

  it("matches umlaut candidates against decomposed and plain-letter content", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write(
      "tasks/next-actions.md",
      "- [ ] Muller anrufen\n- [ ] Garage aufra\u0308umen\n",
      "seed",
    );

    const result = await findTaskOccurrences(repo, FIXED_TODAY, [
      "Müller",
      "aufräumen",
    ]);

    expect(result.blocks.map((block) => block.line)).toEqual([1]);
    expect(result.blocks[0]?.rawBlock).toEqual([
      "- [ ] Muller anrufen",
      "- [ ] Garage aufra\u0308umen",
    ]);
  });

  it("reads exactly the bounded task and daily surfaces", async () => {
    const repo = new InMemoryFileRepository();
    for (const filePath of [
      "tasks/inbox.md",
      "tasks/next-actions.md",
      "tasks/waiting.md",
      "tasks/someday-maybe.md",
      "tasks/focus.md",
    ]) {
      await repo.write(filePath, "seed", "seed");
    }
    await repo.write("daily/2026-04-21.md", "older", "seed");
    await repo.write("daily/2026-04-22.md", "cutoff", "seed");
    await repo.write("daily/2026-05-21.md", "inside", "seed");
    await repo.write("daily/2026-05-22.md", "today", "seed");
    await repo.write("daily/2026-08-01.md", "future", "seed");
    await repo.write("daily/notes.md", "ignored", "seed");
    await repo.write("daily/2026-05.md", "ignored", "seed");

    const result = await findTaskOccurrences(repo, FIXED_TODAY, ["seed"]);

    expect(result.searchedFiles).toEqual([
      "tasks/inbox.md",
      "tasks/next-actions.md",
      "tasks/waiting.md",
      "tasks/someday-maybe.md",
      "tasks/focus.md",
      "daily/2026-04-22.md",
      "daily/2026-05-21.md",
      "daily/2026-05-22.md",
      "daily/2026-08-01.md",
    ]);
  });

  it("skips missing files but still reports files it actually read", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write("tasks/focus.md", "- [ ] Rasen mähen\n", "seed");

    const result = await findTaskOccurrences(repo, FIXED_TODAY, ["Rasen"]);

    expect(result.searchedFiles).toEqual(["tasks/focus.md"]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.file).toBe("tasks/focus.md");
  });

  it("drops candidates that normalize to empty without reading the vault", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write("tasks/inbox.md", "- [ ] Something\n", "seed");

    const result = await findTaskOccurrences(repo, FIXED_TODAY, [
      "- [ ]",
      "#",
      "[[ ]]",
    ]);

    expect(result.searchedFiles).toEqual([]);
    expect(result.blocks).toEqual([]);
  });

  it("deduplicates candidates by normalized search form", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write("tasks/inbox.md", "- [ ] Rasen-mähen\n", "seed");

    const result = await findTaskOccurrences(repo, FIXED_TODAY, [
      "Rasen mähen",
      "Rasen-mähen",
      "Rasen mähen",
    ]);

    expect(result.blocks).toEqual([
      {
        file: "tasks/inbox.md",
        line: 1,
        rawBlock: ["- [ ] Rasen-mähen"],
      },
    ]);
  });

  it("splits LF, CRLF, and CR line endings without leaking carriage returns into raw blocks", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write(
      "tasks/inbox.md",
      "before\r\n- [ ] Rasen mähen\r\nafter\rlegacy-cr-only",
      "seed",
    );

    const result = await findTaskOccurrences(repo, FIXED_TODAY, ["Rasen"]);

    expect(result.blocks).toEqual([
      {
        file: "tasks/inbox.md",
        line: 2,
        rawBlock: ["before", "- [ ] Rasen mähen", "after"],
      },
    ]);
  });

  it("merges overlapping and near-adjacent context windows with candidate union", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write(
      "tasks/waiting.md",
      [
        "before first item",
        "- [ ] Alpha erledigen",
        "after first item",
        "single raw gap",
        "before second item",
        "- [ ] Beta erledigen",
        "after second item",
      ].join("\n"),
      "seed",
    );

    const result = await findTaskOccurrences(repo, FIXED_TODAY, [
      "Alpha",
      "Beta",
    ]);

    expect(result.blocks).toEqual([
      {
        file: "tasks/waiting.md",
        line: 2,
        rawBlock: [
          "before first item",
          "- [ ] Alpha erledigen",
          "after first item",
          "single raw gap",
          "before second item",
          "- [ ] Beta erledigen",
          "after second item",
        ],
      },
    ]);
  });

  it("returns only raw-evidence fields", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write("tasks/inbox.md", "- [ ] Rasen mähen\n", "seed");

    const result = await findTaskOccurrences(repo, FIXED_TODAY, ["Rasen"]);

    expect(Object.keys(result).sort()).toEqual(["blocks", "searchedFiles"]);
    expect(Object.keys(result.blocks[0] ?? {}).sort()).toEqual([
      "file",
      "line",
      "rawBlock",
    ]);
  });

  it("finds the real Rasen double-schedule evidence in the eval vault", async () => {
    const repo = new LocalFileRepository(rasenFixtureVault);

    const result = await findTaskOccurrences(repo, "2026-05-21", [
      "Rasen sehr kurz schneiden",
      "Rasen",
      "Vertikutieren",
    ]);

    expect(result.searchedFiles).toEqual([
      "tasks/inbox.md",
      "tasks/next-actions.md",
      "tasks/waiting.md",
      "tasks/someday-maybe.md",
      "tasks/focus.md",
      "daily/2026-05-21.md",
      "daily/2026-05-22.md",
    ]);
    expect(result.blocks.map((block) => block.file).sort()).toEqual([
      "daily/2026-05-22.md",
      "tasks/focus.md",
      "tasks/next-actions.md",
    ]);
    expect(
      result.blocks.find((block) => block.file === "daily/2026-05-22.md")
        ?.rawBlock,
    ).toContain(
      "- [ ] Rasen sehr kurz schneiden + lüften (Vertikutieren mit Eisenfeder-Lüfter)",
    );
  });
});
