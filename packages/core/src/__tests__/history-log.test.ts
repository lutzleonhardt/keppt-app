import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { appendHistoryEntry, buildHistoryEntry, historyFilePath } from "../history-log.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeBase(): Promise<string> {
  const d = await mkdtemp(path.join(tmpdir(), "gtd-history-"));
  tempDirs.push(d);
  return d;
}

describe("history-log", () => {
  it("buildHistoryEntry fills defaults and respects injected clock/id", () => {
    const entry = buildHistoryEntry({
      filePath: "tasks/inbox.md",
      contentBefore: "",
      contentAfter: "x",
      changeSummary: "create",
      now: () => new Date("2026-04-24T12:00:00Z"),
      idFactory: () => "fixed-id",
    });
    expect(entry).toEqual({
      id: "fixed-id",
      filePath: "tasks/inbox.md",
      contentBefore: "",
      contentAfter: "x",
      changeSummary: "create",
      changedAt: "2026-04-24T12:00:00.000Z",
      changedBy: "llm",
    });
  });

  it("appendHistoryEntry creates .gtd-companion dir and appends JSONL", async () => {
    const base = await makeBase();
    await appendHistoryEntry(base, {
      filePath: "tasks/inbox.md",
      contentBefore: "",
      contentAfter: "a",
      changeSummary: "create",
    });
    await appendHistoryEntry(base, {
      filePath: "tasks/inbox.md",
      contentBefore: "a",
      contentAfter: "b",
      changeSummary: "update",
      changedBy: "user",
    });

    const raw = await readFile(historyFilePath(base), "utf8");
    const lines = raw.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!);
    const second = JSON.parse(lines[1]!);
    expect(first.changedBy).toBe("llm");
    expect(second.changedBy).toBe("user");
    expect(second.contentBefore).toBe("a");
    expect(second.contentAfter).toBe("b");
  });
});
