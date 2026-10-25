import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  LocalFileRepository,
  MemoryLogger,
  type FileRepository,
} from "@gtd/core";

import { createApp } from "../app.js";
import { toDailyNoteRefs } from "../routes/daily-notes.js";
import { spyFileRepository } from "./spy-file-repository.js";

// Local noon keeps `formatToday` (local getters) on the same calendar day in any zone.
const NOW = () => new Date(2026, 9, 25, 12, 0, 0);
const TODAY = "2026-10-25";

const vaults: string[] = [];

afterEach(async () => {
  await Promise.all(vaults.splice(0).map((d) => rm(d, { recursive: true })));
});

function appWith(fileRepository: FileRepository) {
  return createApp({
    logger: new MemoryLogger(),
    devUserId: "lutz",
    fileRepository,
    now: NOW,
  });
}

describe("GET /api/daily-notes", () => {
  it("lists daily notes newest first with isToday from the server clock, using filenames only", async () => {
    const { repo, read, list } = spyFileRepository([
      "daily/2026-07-14.md",
      "daily/2026-10-25.md",
      "daily/2026-11-02.md",
      "daily/2026-01-03.md",
    ]);

    const res = await request(appWith(repo)).get("/api/daily-notes");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { date: "2026-11-02", isToday: false },
      { date: TODAY, isToday: true },
      { date: "2026-07-14", isToday: false },
      { date: "2026-01-03", isToday: false },
    ]);
    expect(list).toHaveBeenCalledWith("daily/");
    expect(read).not.toHaveBeenCalled();
  });

  it("ignores filenames that are not valid daily notes", async () => {
    const { repo } = spyFileRepository([
      "daily/notes.md",
      "daily/2026-07-14.md.bak",
      "daily/2026-13-45.md",
      "daily/template.md",
      "daily/2026-07-14.md",
    ]);

    const res = await request(appWith(repo)).get("/api/daily-notes");

    expect(res.body).toEqual([{ date: "2026-07-14", isToday: false }]);
  });

  it("returns an empty list for a vault without daily notes", async () => {
    const { repo } = spyFileRepository(["tasks/inbox.md"]);

    const res = await request(appWith(repo)).get("/api/daily-notes");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("reports a repository failure as 500 internal_error, never as an empty list", async () => {
    const { repo, list } = spyFileRepository();
    list.mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }),
    );

    const res = await request(appWith(repo)).get("/api/daily-notes");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({
      code: "internal_error",
      requestId: res.headers["x-request-id"],
    });
    expect(res.text).not.toContain("EACCES");
  });

  it("works against a vault on disk", async () => {
    const vault = await mkdtemp(path.join(tmpdir(), "keppt-server-daily-"));
    vaults.push(vault);
    await mkdir(path.join(vault, "daily"), { recursive: true });
    await mkdir(path.join(vault, "tasks"), { recursive: true });
    await writeFile(
      path.join(vault, "daily", "2026-10-24.md"),
      "# yesterday",
      "utf8",
    );
    await writeFile(
      path.join(vault, "daily", "2026-10-25.md"),
      "# today",
      "utf8",
    );
    await writeFile(
      path.join(vault, "daily", "scratch.md"),
      "not a daily",
      "utf8",
    );
    await writeFile(path.join(vault, "tasks", "inbox.md"), "# Inbox", "utf8");

    const res = await request(appWith(new LocalFileRepository(vault))).get(
      "/api/daily-notes",
    );

    expect(res.body).toEqual([
      { date: TODAY, isToday: true },
      { date: "2026-10-24", isToday: false },
    ]);
  });
});

describe("toDailyNoteRefs", () => {
  it("sorts ISO dates descending and marks exactly the matching day", () => {
    const refs = toDailyNoteRefs(
      ["daily/2025-12-31.md", "daily/2026-01-01.md"],
      "2026-01-01",
    );

    expect(refs).toEqual([
      { date: "2026-01-01", isToday: true },
      { date: "2025-12-31", isToday: false },
    ]);
  });
});
