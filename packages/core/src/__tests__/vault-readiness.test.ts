import { describe, expect, it } from "vitest";

import { InMemoryFileRepository } from "../in-memory-file-repository.js";
import { ensureGtdTaskFiles, GTD_TASK_FILES } from "../vault-readiness.js";

const FIRST_RUN_SUMMARY = "first-run task-file init";

function systemRepo(): InMemoryFileRepository {
  return new InMemoryFileRepository({ changedBy: "system" });
}

describe("ensureGtdTaskFiles", () => {
  it("creates exactly the 5 GTD task files as empty strings (T5-AC-06)", async () => {
    const repo = systemRepo();
    const result = await ensureGtdTaskFiles(repo);

    expect(result.created.sort()).toEqual([...GTD_TASK_FILES].sort());
    for (const f of GTD_TASK_FILES) {
      expect(await repo.read(f)).toBe("");
    }

    const history = repo.getHistory();
    expect(history).toHaveLength(GTD_TASK_FILES.length);
    for (const entry of history) {
      expect(entry.changedBy).toBe("system");
      expect(entry.changeSummary).toBe(FIRST_RUN_SUMMARY);
      expect(entry.contentBefore).toBe("");
      expect(entry.contentAfter).toBe("");
    }
  });

  it("second call is a full no-op — no new history, no mutations (T5-AC-07)", async () => {
    const repo = systemRepo();
    await ensureGtdTaskFiles(repo);
    const historyAfterFirst = repo.getHistory().length;

    const second = await ensureGtdTaskFiles(repo);

    expect(second.created).toEqual([]);
    expect(repo.getHistory().length).toBe(historyAfterFirst);
  });

  it("preserves existing file content; only creates the missing ones (T5-AC-08)", async () => {
    const repo = systemRepo();
    await repo.write("tasks/inbox.md", "- [ ] keep me", "seed");
    const historyAfterSeed = repo.getHistory().length;

    const result = await ensureGtdTaskFiles(repo);

    expect(result.created).not.toContain("tasks/inbox.md");
    expect(result.created.sort()).toEqual(
      GTD_TASK_FILES.filter((f) => f !== "tasks/inbox.md").sort(),
    );
    expect(await repo.read("tasks/inbox.md")).toBe("- [ ] keep me");
    // Seed entry plus 4 init entries (one per file that needed creating).
    expect(repo.getHistory().length).toBe(historyAfterSeed + 4);
  });
});
