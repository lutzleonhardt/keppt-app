import { describe, expect, it } from "vitest";

import {
  buildAutoReplanOpener,
  gatherAutoReplanContext,
} from "../auto-replan.js";
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

  it("T9-AC-03: isEmpty is true only when dailies, Next Actions, Waiting, and Focus have no content", async () => {
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

    const focusRepo = new InMemoryFileRepository();
    await focusRepo.write("tasks/focus.md", "- [ ] Lina zum Tierarzt", "seed");
    await expect(
      gatherAutoReplanContext(focusRepo, "2026-05-20", 5),
    ).resolves.toMatchObject({ isEmpty: false });
  });
});

describe("buildAutoReplanOpener", () => {
  it("builds kickoff, one read_file call per window date and task file (missing dailies as not_found), and a trailing instruction", async () => {
    const repo = new InMemoryFileRepository();
    await repo.write("daily/2026-05-16.md", "present 16", "seed");
    await repo.write("daily/2026-05-20.md", "- [ ] heute", "seed");
    await repo.write("tasks/next-actions.md", "- [ ] Steuer", "seed");
    const context = await gatherAutoReplanContext(repo, "2026-05-20");

    const opener = buildAutoReplanOpener(context, "2026-05-20");

    expect(opener.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "user",
    ]);
    expect(opener[0]!.content).toContain("Day rollover for 2026-05-20");

    const calls = opener[1]!.content as Array<{
      type: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
    }>;
    // Every window date gets a call, present or not; then the task files.
    expect(calls.map((c) => c.input)).toEqual([
      { file_path: "daily/2026-05-15.md" },
      { file_path: "daily/2026-05-16.md" },
      { file_path: "daily/2026-05-17.md" },
      { file_path: "daily/2026-05-18.md" },
      { file_path: "daily/2026-05-19.md" },
      { file_path: "daily/2026-05-20.md" },
      { file_path: "tasks/next-actions.md" },
      { file_path: "tasks/waiting.md" },
      { file_path: "tasks/focus.md" },
    ]);
    expect(
      calls.every((c) => c.type === "tool-call" && c.toolName === "read_file"),
    ).toBe(true);

    const results = opener[2]!.content as Array<{
      type: string;
      toolCallId: string;
      toolName: string;
      output: unknown;
    }>;
    const ok = (content: string) => ({
      type: "json",
      value: { ok: true, content },
    });
    const notFound = (path: string) => ({
      type: "json",
      value: {
        ok: false,
        error: { reason: "not_found", message: `File not found: ${path}` },
      },
    });
    expect(results.map((r) => r.toolCallId)).toEqual(
      calls.map((c) => c.toolCallId),
    );
    expect(results.map((r) => r.output)).toEqual([
      notFound("daily/2026-05-15.md"),
      ok("present 16"),
      notFound("daily/2026-05-17.md"),
      notFound("daily/2026-05-18.md"),
      notFound("daily/2026-05-19.md"),
      ok("- [ ] heute"),
      ok("- [ ] Steuer"),
      ok(""),
      ok(""),
    ]);

    const instruction = opener[3]!.content as string;
    expect(instruction).toContain(
      "Use daily/2026-05-20.md as today's current plan context",
    );
    expect(instruction).toContain("suggest_quick_replies");
    expect(instruction).toContain(
      'Later chip examples: "später/verschieben/ignorieren" -> source Plan box [-]',
    );
    expect(instruction).toContain('"erledigt" -> source [x]');
  });
});
