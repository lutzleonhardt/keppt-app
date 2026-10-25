import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  InvalidPathError,
  LocalFileRepository,
  MemoryLogger,
  type FileRepository,
} from "@gtd/core";

import { createApp } from "../app.js";
import { spyFileRepository } from "./spy-file-repository.js";

const vaults: string[] = [];

async function makeVault(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "keppt-server-files-"));
  vaults.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(vaults.splice(0).map((d) => rm(d, { recursive: true })));
});

function appWith(fileRepository: FileRepository) {
  return createApp({
    logger: new MemoryLogger(),
    devUserId: "lutz",
    fileRepository,
  });
}

describe("GET /api/files/{path} against a vault on disk", () => {
  it("returns the content of a task file and of a daily note", async () => {
    const vault = await makeVault({
      "tasks/inbox.md": "# Inbox\n\n- [ ] call Anna\n",
      "daily/2026-07-14.md": "# 2026-07-14\n\n## Plan\n",
    });
    const app = appWith(new LocalFileRepository(vault));

    const inbox = await request(app).get("/api/files/tasks/inbox.md");
    const daily = await request(app).get("/api/files/daily/2026-07-14.md");

    expect(inbox.status).toBe(200);
    expect(inbox.body).toEqual({ content: "# Inbox\n\n- [ ] call Anna\n" });
    expect(daily.status).toBe(200);
    expect(daily.body).toEqual({ content: "# 2026-07-14\n\n## Plan\n" });
  });

  it("distinguishes an empty file (200 with empty content) from a missing one (404)", async () => {
    const vault = await makeVault({ "tasks/focus.md": "" });
    const app = appWith(new LocalFileRepository(vault));

    const empty = await request(app).get("/api/files/tasks/focus.md");
    const missingTask = await request(app).get("/api/files/tasks/waiting.md");
    const missingDaily = await request(app).get(
      "/api/files/daily/2020-01-01.md",
    );

    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ content: "" });
    expect(missingTask.status).toBe(404);
    expect(missingTask.body.error).toMatchObject({
      code: "file_not_found",
      requestId: missingTask.headers["x-request-id"],
    });
    expect(missingDaily.status).toBe(404);
    expect(missingDaily.body.error.code).toBe("file_not_found");
  });
});

describe("GET /api/files/{path} validation", () => {
  it.each([
    ["%2E%2E%2Fx", "parent-directory traversal"],
    [".keppt/file-history.jsonl", "reserved internal namespace"],
    ["tasks%2F%2Finbox.md", "empty segment"],
  ])(
    "rejects the unsafe path %s with 400 invalid_path before touching the repository",
    async (encoded) => {
      const { repo, read } = spyFileRepository();
      const res = await request(appWith(repo)).get(`/api/files/${encoded}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({
        code: "invalid_path",
        requestId: res.headers["x-request-id"],
      });
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each([
    "random.md",
    "tasks/other.md",
    "archive/daily/2026-01-01.md",
    "daily/notes.md",
    "daily/2026-13-45.md",
  ])(
    "rejects the out-of-layout path %s with 403 path_out_of_scope before touching the repository",
    async (file) => {
      const { repo, read } = spyFileRepository();
      const res = await request(appWith(repo)).get(`/api/files/${file}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({
        code: "path_out_of_scope",
        requestId: res.headers["x-request-id"],
      });
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("maps a runtime path rejection from the repository (symlink escape) to 400 invalid_path", async () => {
    const { repo, read } = spyFileRepository();
    read.mockRejectedValueOnce(
      new InvalidPathError("tasks/inbox.md", "symlink escapes vault root"),
    );

    const res = await request(appWith(repo)).get("/api/files/tasks/inbox.md");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_path");
    expect(read).toHaveBeenCalledWith("tasks/inbox.md");
  });

  it("reports a repository failure other than 'missing' as 500 internal_error, never as 404", async () => {
    const { repo, read } = spyFileRepository();
    read.mockRejectedValueOnce(
      Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" }),
    );

    const res = await request(appWith(repo)).get("/api/files/tasks/inbox.md");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({
      code: "internal_error",
      requestId: res.headers["x-request-id"],
    });
    expect(res.text).not.toContain("EIO");
  });

  it("leaves the bare prefix to the 404 route handler", async () => {
    const { repo } = spyFileRepository();
    const res = await request(appWith(repo)).get("/api/files/");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
