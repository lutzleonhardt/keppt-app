import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GTD_TASK_FILES,
  historyFilePath,
  MemoryLogger,
  type HistoryEntry,
} from "@gtd/core";

import { initializeVault } from "../vault-init.js";

const vaults: string[] = [];

async function makeVault(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "keppt-server-vault-"));
  vaults.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(vaults.splice(0).map((d) => rm(d, { recursive: true })));
});

async function readHistory(vaultPath: string): Promise<HistoryEntry[]> {
  const text = await readFile(historyFilePath(vaultPath), "utf8");
  return text
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as HistoryEntry);
}

describe("initializeVault", () => {
  it("creates the missing task files once, attributed to system, and is a no-op on re-boot", async () => {
    const vaultPath = await makeVault();
    const logger = new MemoryLogger();

    const first = await initializeVault(vaultPath, logger);
    const second = await initializeVault(vaultPath, logger);

    expect(first.created).toEqual([...GTD_TASK_FILES]);
    expect(second.created).toEqual([]);
    for (const file of GTD_TASK_FILES) {
      expect((await stat(path.join(vaultPath, file))).isFile()).toBe(true);
    }

    const history = await readHistory(vaultPath);
    expect(history).toHaveLength(GTD_TASK_FILES.length);
    expect(history.every((e) => e.changedBy === "system")).toBe(true);
    expect(history.map((e) => e.filePath)).toEqual([...GTD_TASK_FILES]);

    const ready = logger.byCode("server.vault_ready");
    expect(ready.map((e) => e.meta?.createdCount)).toEqual([5, 0]);
  });
});
