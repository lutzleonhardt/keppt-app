import { describe, expect, it } from "vitest";

import {
  FileNotFoundError,
  InMemoryFileRepository,
  InvalidPathError,
} from "@gtd/core";

describe("@gtd/cli — workspace wiring", () => {
  it("imports public surface from @gtd/core and exercises it", async () => {
    const repo = new InMemoryFileRepository();
    expect(await repo.list()).toEqual([]);

    await repo.write("tasks/inbox.md", "hello", "smoke");
    expect(await repo.read("tasks/inbox.md")).toBe("hello");

    await expect(repo.read("missing.md")).rejects.toBeInstanceOf(FileNotFoundError);
    await expect(repo.write("../escape.md", "x", "")).rejects.toBeInstanceOf(
      InvalidPathError,
    );
  });
});
