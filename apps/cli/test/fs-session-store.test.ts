import * as nodeFs from "node:fs/promises";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ModelMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FsSessionStore,
  type FsSessionStoreOps,
} from "../src/fs-session-store.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tempDirs.map((d) => rm(d, { recursive: true, force: true })),
  );
  tempDirs.length = 0;
  vi.restoreAllMocks();
});

async function makeVault(): Promise<string> {
  const d = await mkdtemp(path.join(tmpdir(), "gtd-fs-session-store-"));
  tempDirs.push(d);
  return d;
}

describe("FsSessionStore", () => {
  it("T4.1-AC-08: loadOrCreate in an empty vault returns an empty Session and does NOT yet write the file", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const s = await store.loadOrCreate("2026-05-19");
    expect(s.date).toBe("2026-05-19");
    expect(s.messages).toEqual([]);

    await expect(stat(store.sessionFilePath("2026-05-19"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
  });

  it("T4.1-AC-09: appendTurn + save → loadOrCreate returns equivalent state", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);

    const s1 = await store.loadOrCreate("2026-05-19");
    const u: ModelMessage = { role: "user", content: "what's in inbox?" };
    const a: ModelMessage = { role: "assistant", content: "I'll check." };
    s1.appendTurn([u], 1_000);
    s1.appendTurn([a], 2_000);
    await store.save(s1);

    const s2 = await store.loadOrCreate("2026-05-19");
    expect(s2.date).toBe("2026-05-19");
    expect(s2.messages).toHaveLength(2);
    expect(s2.messages[0]).toEqual(u);
    expect(s2.messages[1]).toEqual(a);
    expect(s2.createdAtOf(s2.messages[0]!)).toBe(1_000);
    expect(s2.createdAtOf(s2.messages[1]!)).toBe(2_000);
  });

  it("T4.1-AC-10: a new day creates a new session file alongside the previous day's", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);

    const s1 = await store.loadOrCreate("2026-05-19");
    s1.appendTurn([{ role: "user", content: "yesterday" }], 1_000);
    await store.save(s1);

    const s2 = await store.loadOrCreate("2026-05-20");
    expect(s2.messages).toEqual([]);
    s2.appendTurn([{ role: "user", content: "today" }], 2_000);
    await store.save(s2);

    const file1 = store.sessionFilePath("2026-05-19");
    const file2 = store.sessionFilePath("2026-05-20");
    const raw1 = JSON.parse(await readFile(file1, "utf8"));
    const raw2 = JSON.parse(await readFile(file2, "utf8"));
    expect(raw1.messages).toEqual([{ role: "user", content: "yesterday" }]);
    expect(raw2.messages).toEqual([{ role: "user", content: "today" }]);
  });

  it("creates the .keppt/sessions directory on first save", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const s = await store.loadOrCreate("2026-05-19");
    s.appendTurn([{ role: "user", content: "hi" }], 1);
    await store.save(s);

    const file = store.sessionFilePath("2026-05-19");
    expect(file).toBe(
      path.join(vault, ".keppt", "sessions", "2026-05-19.json"),
    );
    const raw = JSON.parse(await readFile(file, "utf8"));
    expect(raw.messages).toHaveLength(1);
  });

  it("T4.1-AC-15: save writes via a same-directory tmp file + rename (atomic against partial writes)", async () => {
    const vault = await makeVault();
    const renameCalls: Array<[string, string]> = [];
    const recordingFs: FsSessionStoreOps = {
      mkdir: nodeFs.mkdir,
      readFile: nodeFs.readFile,
      writeFile: nodeFs.writeFile,
      rename: async (from, to) => {
        renameCalls.push([from as string, to as string]);
        return nodeFs.rename(from, to);
      },
    };
    const store = new FsSessionStore(vault, recordingFs);
    const s = await store.loadOrCreate("2026-05-19");
    s.appendTurn([{ role: "user", content: "hi" }], 1_000);
    await store.save(s);

    expect(renameCalls).toHaveLength(1);
    const [from, to] = renameCalls[0]!;
    const finalPath = store.sessionFilePath("2026-05-19");
    expect(to).toBe(finalPath);
    // Tmp file lives in the same directory as the final (POSIX rename
    // atomicity is only guaranteed within the same filesystem; same dir is
    // the simple way to enforce that).
    expect(path.dirname(from)).toBe(path.dirname(finalPath));
    expect(from).not.toBe(finalPath);
    // Tmp filename starts with the final basename so a crash leaves a
    // discoverable orphan rather than an unrelated file.
    expect(path.basename(from)).toMatch(/^2026-05-19\.json\.tmp\./);
  });

  it("save leaves the previous good file intact when an interrupted rename fails", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const finalPath = store.sessionFilePath("2026-05-19");

    // Establish a known-good prior session on disk via a normal save.
    const s = await store.loadOrCreate("2026-05-19");
    s.appendTurn([{ role: "user", content: "prior good" }], 1_000);
    await store.save(s);
    const goodContent = await readFile(finalPath, "utf8");

    // Simulate an interrupted save: writeFile resolves (the tmp file lands on
    // disk), but rename throws as if the OS were killed before the atomic
    // replace. The previous good file must still be intact.
    const failingRenameFs: FsSessionStoreOps = {
      mkdir: nodeFs.mkdir,
      readFile: nodeFs.readFile,
      writeFile: nodeFs.writeFile,
      rename: vi.fn(async () => {
        throw new Error("simulated interrupt");
      }),
    };
    const flakyStore = new FsSessionStore(vault, failingRenameFs);
    s.appendTurn([{ role: "assistant", content: "would-be new state" }], 2_000);
    await expect(flakyStore.save(s)).rejects.toThrow("simulated interrupt");

    expect(await readFile(finalPath, "utf8")).toBe(goodContent);

    // Tmp orphan may still exist in the sessions dir; that is acceptable for
    // Phase 1 (next successful save replaces it via rename; manual cleanup is
    // a cosmetic concern, not a correctness one).
    const dirContents = await readdir(path.dirname(finalPath));
    expect(dirContents).toContain("2026-05-19.json");
  });

  it("loadOrCreate rethrows on a corrupted on-disk session (e.g. truncated JSON)", async () => {
    const vault = await makeVault();
    const store = new FsSessionStore(vault);
    const finalPath = store.sessionFilePath("2026-05-19");

    // Create the directory structure via a normal save, then corrupt the file.
    const s = await store.loadOrCreate("2026-05-19");
    s.appendTurn([{ role: "user", content: "hi" }], 1_000);
    await store.save(s);
    await writeFile(finalPath, "{ not valid json", "utf8");

    await expect(store.loadOrCreate("2026-05-19")).rejects.toThrow();
  });
});
