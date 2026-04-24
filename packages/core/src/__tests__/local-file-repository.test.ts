import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";

import { historyFilePath } from "../history-log.js";
import { LocalFileRepository } from "../local-file-repository.js";
import { runFileRepositoryContract } from "./file-repository.contract.js";

const FIXED_NOW = new Date("2026-04-24T10:00:00Z");

const tempDirs: string[] = [];

beforeEach(() => {
  tempDirs.length = 0;
});

afterEach(async () => {
  await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
});

runFileRepositoryContract("LocalFileRepository", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "gtd-local-"));
  tempDirs.push(base);
  const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
  return {
    repo,
    async readHistory() {
      const raw = await readFile(historyFilePath(base), "utf8");
      return raw.split("\n").filter((l) => l.length > 0);
    },
  };
});
