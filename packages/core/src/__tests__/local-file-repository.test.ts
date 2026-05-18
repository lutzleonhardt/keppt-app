import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InvalidPathError } from "../file-repository.js";
import { historyFilePath } from "../history-log.js";
import { LocalFileRepository } from "../local-file-repository.js";
import { type Logger, MemoryLogger } from "../logging.js";
import { runFileRepositoryContract } from "./file-repository.contract.js";

// Symlink tests need POSIX symlink semantics. Windows can do it but only
// with elevated privileges or developer mode — not the surface this AC
// targets, so skip there.
const symlinkable = process.platform !== "win32";

const FIXED_NOW = new Date("2026-04-24T10:00:00Z");

const tempDirs: string[] = [];

async function makeTempBase(): Promise<string> {
  const base = await mkdtemp(path.join(tmpdir(), "gtd-local-"));
  tempDirs.push(base);
  return base;
}

beforeEach(() => {
  tempDirs.length = 0;
});

afterEach(async () => {
  await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
});

runFileRepositoryContract("LocalFileRepository", async () => {
  const base = await makeTempBase();
  const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
  return {
    repo,
    async readHistory() {
      let raw: string;
      try {
        raw = await readFile(historyFilePath(base), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
      return raw.split("\n").filter((l) => l.length > 0);
    },
  };
});

describe("LocalFileRepository — atomic write", () => {
  it("preserves prior file content when history append fails", async () => {
    const base = await makeTempBase();
    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });

    await repo.write("tasks/inbox.md", "first", "create");
    const target = path.join(base, "tasks/inbox.md");
    expect(await readFile(target, "utf8")).toBe("first");

    // Break the history file: replace it with a directory so appendFile fails.
    await rm(historyFilePath(base));
    await mkdir(historyFilePath(base));

    await expect(repo.write("tasks/inbox.md", "second", "update")).rejects.toBeDefined();
    expect(await readFile(target, "utf8")).toBe("first");
  });

  it("does not create the file when history append fails on first write", async () => {
    const base = await makeTempBase();
    // Pre-create the history path as a directory to force appendFile failure.
    await mkdir(path.dirname(historyFilePath(base)), { recursive: true });
    await mkdir(historyFilePath(base));

    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
    await expect(repo.write("tasks/inbox.md", "hello", "create")).rejects.toBeDefined();
    await expect(readFile(path.join(base, "tasks/inbox.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("edit() preserves prior file content when history append fails", async () => {
    const base = await makeTempBase();
    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });

    await repo.write("tasks/inbox.md", "hello world", "create");
    const target = path.join(base, "tasks/inbox.md");
    expect(await readFile(target, "utf8")).toBe("hello world");

    // Break the history file so the atomic write inside edit() throws.
    await rm(historyFilePath(base));
    await mkdir(historyFilePath(base));

    await expect(
      repo.edit("tasks/inbox.md", [{ search: "world", replace: "there" }], "greet"),
    ).rejects.toBeDefined();
    expect(await readFile(target, "utf8")).toBe("hello world");
  });

  it("leaves no .tmp residue after a successful write", async () => {
    const base = await makeTempBase();
    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
    await repo.write("tasks/inbox.md", "hello", "create");
    const entries = await readdir(path.join(base, "tasks"));
    expect(entries).toEqual(["inbox.md"]);
  });
});

describe("LocalFileRepository — edit concurrency", () => {
  it("aborts and surfaces current content when the file changes between plan and commit", async () => {
    const base = await makeTempBase();
    const target = path.join(base, "tasks/inbox.md");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "hello world", "utf8");

    // The protected fsReadUtf8 hook is the only seam needed to deterministically
    // simulate a concurrent writer: on the second read inside edit() (the CAS
    // recheck), mutate the file out-of-band and return the new bytes. If the
    // CAS guard is missing, edit() will overwrite "concurrent change" with
    // the stale planned output ("hello there") and log a corrupt history entry.
    class StaleReadRepo extends LocalFileRepository {
      public reads = 0;
      protected async fsReadUtf8(abs: string): Promise<string> {
        this.reads++;
        if (this.reads === 2) {
          await writeFile(abs, "concurrent change", "utf8");
          return "concurrent change";
        }
        return super.fsReadUtf8(abs);
      }
    }

    const repo = new StaleReadRepo(base, { now: () => FIXED_NOW });
    const result = await repo.edit(
      "tasks/inbox.md",
      [{ search: "world", replace: "there" }],
      "greet",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({
      failedSearch: "world",
      matchCount: 0,
      currentContent: "concurrent change",
    });
    // The concurrent writer's bytes survive — the stale plan is not committed.
    expect(await readFile(target, "utf8")).toBe("concurrent change");

    // No history entry was appended for the aborted edit.
    let historyLines: string[] = [];
    try {
      const raw = await readFile(historyFilePath(base), "utf8");
      historyLines = raw.split("\n").filter((l) => l.length > 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    expect(historyLines).toHaveLength(0);
  });
});

describe.skipIf(!symlinkable)("LocalFileRepository — symlink safety", () => {
  it("rejects reading a file symlink that points outside the vault", async () => {
    // $tmp/outside hosts the vault; $tmp/secret is the exfiltration target.
    // We use a *separate* outside dir to verify the realpath check
    // genuinely catches escape rather than tolerating in-vault links.
    const outside = await makeTempBase();
    const vault = path.join(outside, "vault");
    await mkdir(path.join(vault, "tasks"), { recursive: true });
    const secret = path.join(outside, "secret.md");
    await writeFile(secret, "TOP-SECRET", "utf8");
    await symlink(secret, path.join(vault, "tasks", "escape.md"));

    const repo = new LocalFileRepository(vault, { now: () => FIXED_NOW });
    await expect(repo.read("tasks/escape.md")).rejects.toBeInstanceOf(InvalidPathError);
    await expect(repo.read("tasks/escape.md")).rejects.toMatchObject({
      reason: "symlink escapes vault root",
    });
  });

  it("rejects reading through a directory symlink that escapes the vault", async () => {
    const outside = await makeTempBase();
    const vault = path.join(outside, "vault");
    await mkdir(path.join(vault, "tasks"), { recursive: true });
    const elsewhere = path.join(outside, "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await writeFile(path.join(elsewhere, "secret.md"), "TOP-SECRET", "utf8");
    await symlink(elsewhere, path.join(vault, "tasks", "escape-dir"));

    const repo = new LocalFileRepository(vault, { now: () => FIXED_NOW });
    await expect(repo.read("tasks/escape-dir/secret.md")).rejects.toBeInstanceOf(
      InvalidPathError,
    );
    await expect(repo.read("tasks/escape-dir/secret.md")).rejects.toMatchObject({
      reason: "symlink escapes vault root",
    });
  });

  it("rejects writing a non-existent file under an escaping directory symlink", async () => {
    // The target file does not exist yet; resolveSafe must walk up to the
    // existing ancestor (the symlink), realpath it, and reject before
    // any file is created on disk.
    const outside = await makeTempBase();
    const vault = path.join(outside, "vault");
    await mkdir(path.join(vault, "tasks"), { recursive: true });
    const elsewhere = path.join(outside, "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await symlink(elsewhere, path.join(vault, "tasks", "escape-dir"));

    const repo = new LocalFileRepository(vault, { now: () => FIXED_NOW });
    await expect(
      repo.write("tasks/escape-dir/new.md", "should not land", "x"),
    ).rejects.toBeInstanceOf(InvalidPathError);
    // No file should have been created at the escape target.
    await expect(readFile(path.join(elsewhere, "new.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects an in-vault symlink whose canonical target lands under .keppt/", async () => {
    // Defense in depth against the .keppt boundary: validateFilePath rejects
    // `.keppt/...` syntactically, but a user-placed symlink at an LLM-allowed
    // path could canonicalize into the audit log. Reading it would leak
    // contentBefore snapshots from history — including bytes of files no
    // longer in the LLM's view. resolveSafe must reject this even though
    // both endpoints are inside the vault root.
    const vault = await makeTempBase();
    await mkdir(path.join(vault, "tasks"), { recursive: true });
    await mkdir(path.dirname(historyFilePath(vault)), { recursive: true });
    await writeFile(historyFilePath(vault), '{"old":"secret"}\n', "utf8");
    await symlink(historyFilePath(vault), path.join(vault, "tasks", "leak.md"));

    const repo = new LocalFileRepository(vault, { now: () => FIXED_NOW });
    await expect(repo.read("tasks/leak.md")).rejects.toBeInstanceOf(InvalidPathError);
    await expect(repo.read("tasks/leak.md")).rejects.toMatchObject({
      reason: "symlink resolves into reserved internal namespace",
    });
  });

  it("allows in-vault symlinks (target stays inside the vault root)", async () => {
    // Smoke test that the realpath check is not over-eager: a symlink that
    // stays inside the vault must continue to read cleanly. Not a current
    // use case, but proves the gate doesn't false-block legitimate ones.
    const vault = await makeTempBase();
    await mkdir(path.join(vault, "tasks"), { recursive: true });
    await mkdir(path.join(vault, "links"), { recursive: true });
    await writeFile(path.join(vault, "tasks", "inbox.md"), "hello", "utf8");
    await symlink(
      path.join(vault, "tasks", "inbox.md"),
      path.join(vault, "links", "alias.md"),
    );

    const repo = new LocalFileRepository(vault, { now: () => FIXED_NOW });
    expect(await repo.read("links/alias.md")).toBe("hello");
  });
});

// Search emits a debug event for every in-scope path it has to skip because
// resolveSafe rejects it. The skip itself is unchanged (search keeps
// working, the rejected file is simply not searched), but backend operators
// need the signal to correlate "search misses my file" reports — that's the
// whole point of the Task 3.9 logger seam. We use an in-scope filename
// (`tasks/inbox.md`) realized on disk as a symlink escaping the vault, so
// resolveSafe throws "symlink escapes vault root" at the search-loop catch.
// `walk()` itself does not surface symlinks (DT_LNK), so we subclass the
// repository to inject the path into the search loop directly — the
// production code path under test starts at the catch, not at the listing.
describe.skipIf(!symlinkable)(
  "LocalFileRepository — search logger seam",
  () => {
    it("emits repo.search.path_skipped debug event when search swallows InvalidPathError", async () => {
      const vaultRoot = await makeTempBase();
      const vault = path.join(vaultRoot, "vault");
      await mkdir(vault, { recursive: true });
      await mkdir(path.join(vault, "tasks"), { recursive: true });

      // The escape target lives outside the vault so resolveSafe throws
      // "symlink escapes vault root" instead of any other reason.
      const secret = path.join(vaultRoot, "secret.md");
      await writeFile(secret, "hello secret", "utf8");
      await symlink(secret, path.join(vault, "tasks", "inbox.md"));

      class FixedListRepo extends LocalFileRepository {
        async list(): Promise<string[]> {
          return ["tasks/inbox.md"];
        }
      }

      const logger = new MemoryLogger();
      const repo = new FixedListRepo(vault, {
        now: () => FIXED_NOW,
        logger,
      });

      const results = await repo.search("hello", "active");
      expect(results).toEqual([]);

      const skipped = logger.byCode("repo.search.path_skipped");
      expect(skipped).toHaveLength(1);
      expect(skipped[0]).toMatchObject({
        level: "debug",
        code: "repo.search.path_skipped",
        meta: {
          filePath: "tasks/inbox.md",
          reason: "symlink escapes vault root",
        },
      });
    });

    // Regression: the InvalidPathError catch in search() is a containment
    // path — an unsafe file is silently skipped so the rest of the search
    // still completes. A throwing logger at that emission must not flip
    // the deliberately-degraded path into an aborted search. safeLog in
    // the LocalFileRepository constructor enforces this; this test pins
    // it. Without the wrap, the throw inside this.logger.debug propagates
    // out of the catch and rejects the search promise.
    it(
      "search swallows a throwing logger and still returns degraded results",
      async () => {
        const vaultRoot = await makeTempBase();
        const vault = path.join(vaultRoot, "vault");
        await mkdir(vault, { recursive: true });
        await mkdir(path.join(vault, "tasks"), { recursive: true });

        const secret = path.join(vaultRoot, "secret.md");
        await writeFile(secret, "hello secret", "utf8");
        await symlink(secret, path.join(vault, "tasks", "inbox.md"));

        class FixedListRepo extends LocalFileRepository {
          async list(): Promise<string[]> {
            return ["tasks/inbox.md"];
          }
        }

        const throwingLogger: Logger = {
          debug: () => {
            throw new Error("logger transport broken");
          },
          info: () => {
            throw new Error("logger transport broken");
          },
          warn: () => {
            throw new Error("logger transport broken");
          },
          error: () => {
            throw new Error("logger transport broken");
          },
        };
        const repo = new FixedListRepo(vault, {
          now: () => FIXED_NOW,
          logger: throwingLogger,
        });

        await expect(repo.search("hello", "active")).resolves.toEqual([]);
      },
    );
  },
);

describe("LocalFileRepository — list filters", () => {
  it("skips dot-directories and non-markdown files", async () => {
    const base = await makeTempBase();
    // Externally planted junk that should NOT appear in list().
    await mkdir(path.join(base, ".obsidian"), { recursive: true });
    await mkdir(path.join(base, ".git", "objects"), { recursive: true });
    await writeFile(path.join(base, ".obsidian", "config.json"), "{}");
    await writeFile(path.join(base, ".git", "HEAD"), "ref: refs/heads/main");
    await writeFile(path.join(base, "image.png"), "PNGDATA");
    await writeFile(path.join(base, ".DS_Store"), "junk");

    const repo = new LocalFileRepository(base, { now: () => FIXED_NOW });
    await repo.write("tasks/inbox.md", "keep me", "create");

    const all = await repo.list();
    expect(all).toEqual(["tasks/inbox.md"]);
  });
});
