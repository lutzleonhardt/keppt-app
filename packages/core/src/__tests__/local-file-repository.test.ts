import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { historyFilePath } from "../history-log.js";
import { LocalFileRepository } from "../local-file-repository.js";
import { runFileRepositoryContract } from "./file-repository.contract.js";

const FIXED_NOW = new Date("2026-04-24T10:00:00Z");

const tempDirs: string[] = [];

async function makeTempBase(): Promise<string> {
  const base = await mkdtemp(path.join(tmpdir(), "gtd-local-"));
  tempDirs.push(base);
  return base;
}

beforeEach(() => {
  tempDirs.length = 0;
});

afterEach(async () => {
  await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
});

runFileRepositoryContract("LocalFileRepository", async () => {
  const base = await makeTempBase();
  const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
  return {
    repo,
    async readHistory() {
      let raw: string;
      try {
        raw = await readFile(historyFilePath(base), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
      return raw.split("\n").filter((l) => l.length > 0);
    },
  };
});

describe("LocalFileRepository — atomic write", () => {
  it("preserves prior file content when history append fails", async () => {
    const base = await makeTempBase();
    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });

    await repo.write("tasks/inbox.md", "first", "create");
    const target = path.join(base, "tasks/inbox.md");
    expect(await readFile(target, "utf8")).toBe("first");

    // Break the history file: replace it with a directory so appendFile fails.
    await rm(historyFilePath(base));
    await mkdir(historyFilePath(base));

    await expect(repo.write("tasks/inbox.md", "second", "update")).rejects.toBeDefined();
    expect(await readFile(target, "utf8")).toBe("first");
  });

  it("does not create the file when history append fails on first write", async () => {
    const base = await makeTempBase();
    // Pre-create the history path as a directory to force appendFile failure.
    await mkdir(path.dirname(historyFilePath(base)), { recursive: true });
    await mkdir(historyFilePath(base));

    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
    await expect(repo.write("tasks/inbox.md", "hello", "create")).rejects.toBeDefined();
    await expect(readFile(path.join(base, "tasks/inbox.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("edit() preserves prior file content when history append fails", async () => {
    const base = await makeTempBase();
    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });

    await repo.write("tasks/inbox.md", "hello world", "create");
    const target = path.join(base, "tasks/inbox.md");
    expect(await readFile(target, "utf8")).toBe("hello world");

    // Break the history file so the atomic write inside edit() throws.
    await rm(historyFilePath(base));
    await mkdir(historyFilePath(base));

    await expect(
      repo.edit("tasks/inbox.md", [{ search: "world", replace: "there" }], "greet"),
    ).rejects.toBeDefined();
    expect(await readFile(target, "utf8")).toBe("hello world");
  });

  it("leaves no .tmp residue after a successful write", async () => {
    const base = await makeTempBase();
    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
    await repo.write("tasks/inbox.md", "hello", "create");
    const entries = await readdir(path.join(base, "tasks"));
    expect(entries).toEqual(["inbox.md"]);
  });
});

describe("LocalFileRepository — edit concurrency", () => {
  it("aborts and surfaces current content when the file changes between plan and commit", async () => {
    const base = await makeTempBase();
    const target = path.join(base, "tasks/inbox.md");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "hello world", "utf8");

    // The protected fsReadUtf8 hook is the only seam needed to deterministically
    // simulate a concurrent writer: on the second read inside edit() (the CAS
    // recheck), mutate the file out-of-band and return the new bytes. If the
    // CAS guard is missing, edit() will overwrite "concurrent change" with
    // the stale planned output ("hello there") and log a corrupt history entry.
    class StaleReadRepo extends LocalFileRepository {
      public reads = 0;
      protected async fsReadUtf8(abs: string): Promise<string> {
        this.reads++;
        if (this.reads === 2) {
          await writeFile(abs, "concurrent change", "utf8");
          return "concurrent change";
        }
        return super.fsReadUtf8(abs);
      }
    }

    const repo = new StaleReadRepo(base, { now: () => FIXED_NOW });
    const result = await repo.edit(
      "tasks/inbox.md",
      [{ search: "world", replace: "there" }],
      "greet",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({
      failedSearch: "world",
      matchCount: 0,
      currentContent: "concurrent change",
    });
    // The concurrent writer's bytes survive — the stale plan is not committed.
    expect(await readFile(target, "utf8")).toBe("concurrent change");

    // No history entry was appended for the aborted edit.
    let historyLines: string[] = [];
    try {
      const raw = await readFile(historyFilePath(base), "utf8");
      historyLines = raw.split("\n").filter((l) => l.length > 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    expect(historyLines).toHaveLength(0);
  });
});

describe("LocalFileRepository — list filters", () => {
  it("skips dot-directories and non-markdown files", async () => {
    const base = await makeTempBase();
    // Externally planted junk that should NOT appear in list().
    await mkdir(path.join(base, ".obsidian"), { recursive: true });
    await mkdir(path.join(base, ".git", "objects"), { recursive: true });
    await writeFile(path.join(base, ".obsidian", "config.json"), "{}");
    await writeFile(path.join(base, ".git", "HEAD"), "ref: refs/heads/main");
    await writeFile(path.join(base, "image.png"), "PNGDATA");
    await writeFile(path.join(base, ".DS_Store"), "junk");

    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
    await repo.write("tasks/inbox.md", "keep me", "create");

    const all = await repo.list();
    expect(all).toEqual(["tasks/inbox.md"]);
  });
});
