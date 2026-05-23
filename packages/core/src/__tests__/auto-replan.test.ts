import { describe, expect, it } from "vitest";

import { gatherAutoReplanContext } from "../auto-replan.js";
import { InMemoryFileRepository } from "../in-memory-file-repository.js";

describe("gatherAutoReplanContext", () => {
  it("T9-AC-01: reads the previous 5 dailies plus today and excludes future", async () => {
    const repo = new InMemoryFileRepository();
    for (const date of [
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
      "2026-05-19",
      "2026-05-20",
      "2026-05-21",
    ]) {
      await repo.write(`daily/${date}.md`, `daily ${date}`, "seed");
    }

    const result = await gatherAutoReplanContext(repo, "2026-05-20", 5);

    expect(result.dailies.map((daily) => daily.date)).toEqual([
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
      "2026-05-19",
      "2026-05-20",
    ]);
    expect(result.dailies.map((daily) => daily.content)).toEqual([
      "daily 2026-05-15",
      "daily 2026-05-16",
      "daily 2026-05-17",
      "daily 2026-05-18",
      "daily 2026-05-19",
      "daily 2026-05-20",
    ]);
  });

  it("T9-AC-02: silently skips missing dailies in the window", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write("daily/2026-05-16.md", "present 16", "seed");
    await repo.write("daily/2026-05-19.md", "present 19", "seed");

    const result = await gatherAutoReplanContext(repo, "2026-05-20", 5);

    expect(result.dailies).toEqual([
      { date: "2026-05-16", content: "present 16" },
      { date: "2026-05-19", content: "present 19" },
    ]);
  });

  it("T9-AC-03: isEmpty is true only when dailies, Next Actions, and Waiting have no content", async () => {
    const emptyRepo = new InMemoryFileRepository();
    await emptyRepo.write("tasks/next-actions.md", "  \n", "seed");
    await emptyRepo.write("tasks/waiting.md", "", "seed");

    await expect(
      gatherAutoReplanContext(emptyRepo, "2026-05-20", 5),
    ).resolves.toMatchObject({ isEmpty: true });

    const dailyRepo = new InMemoryFileRepository();
    await dailyRepo.write("daily/2026-05-19.md", "- [ ] Anna anrufen", "seed");
    await expect(
      gatherAutoReplanContext(dailyRepo, "2026-05-20", 5),
    ).resolves.toMatchObject({ isEmpty: false });

    const nextActionsRepo = new InMemoryFileRepository();
    await nextActionsRepo.write(
      "tasks/next-actions.md",
      "- [ ] Steuer vorbereiten",
      "seed",
    );
    await expect(
      gatherAutoReplanContext(nextActionsRepo, "2026-05-20", 5),
    ).resolves.toMatchObject({ isEmpty: false });

    const waitingRepo = new InMemoryFileRepository();
    await waitingRepo.write(
      "tasks/waiting.md",
      "- [ ] Antwort von Max",
      "seed",
    );
    await expect(
      gatherAutoReplanContext(waitingRepo, "2026-05-20", 5),
    ).resolves.toMatchObject({ isEmpty: false });
  });
});
