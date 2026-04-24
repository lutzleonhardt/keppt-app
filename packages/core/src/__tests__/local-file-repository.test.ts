import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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

  it("leaves no .tmp residue after a successful write", async () => {
    const base = await makeTempBase();
    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
    await repo.write("tasks/inbox.md", "hello", "create");
    const entries = await readdir(path.join(base, "tasks"));
    expect(entries).toEqual(["inbox.md"]);
  });
});

describe("LocalFileRepository — list filters", () => {
  it("skips dot-directories and non-markdown files", async () => {
    const base = await makeTempBase();
    // Externally planted junk that should NOT appear in list().
    await mkdir(path.join(base, ".obsidian"), { recursive: true });
    await mkdir(path.join(base, ".git", "objects"), { recursive: true });
    const { writeFile } = await import("node:fs/promises");
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
