import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FileRepository, SearchResult, SearchScope } from "./file-repository.js";
import { FileNotFoundError, InvalidPathError, validateFilePath } from "./file-repository.js";
import { appendHistoryEntry, type ChangeActor } from "./history-log.js";
import { findMatches, formatToday, isInScope } from "./search.js";

export interface LocalFileRepositoryOptions {
  now?: () => Date;
  changedBy?: ChangeActor;
}

export class LocalFileRepository implements FileRepository {
  private readonly basePath: string;
  private readonly now: () => Date;
  private readonly changedBy: ChangeActor;

  constructor(basePath: string, options: LocalFileRepositoryOptions = {}) {
    this.basePath = basePath;
    this.now = options.now ?? (() => new Date());
    this.changedBy = options.changedBy ?? "llm";
  }

  private resolve(filePath: string): string {
    validateFilePath(filePath);
    const normalized = filePath.split("/").join(path.sep);
    const abs = path.resolve(this.basePath, normalized);
    const rel = path.relative(this.basePath, abs);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new InvalidPathError(filePath, "resolves outside the repository base path");
    }
    return abs;
  }

  async read(filePath: string): Promise<string> {
    const abs = this.resolve(filePath);
    try {
      return await readFile(abs, "utf8");
    } catch (err) {
      if (isNodeEnoent(err)) throw new FileNotFoundError(filePath);
      throw err;
    }
  }

  async write(filePath: string, content: string, changeSummary: string): Promise<void> {
    const abs = this.resolve(filePath);
    const before = await readIfExists(abs);
    await mkdir(path.dirname(abs), { recursive: true });
    // Persist history before touching the file so that contentBefore (the
    // rollback snapshot) is always durable before any on-disk mutation. The
    // reverse order would risk an unlogged write if the history append fails,
    // permanently losing the old content.
    //
    // Tradeoff: if writeFile or rename below fails after this append succeeds,
    // the log keeps a "phantom" entry describing a change that never landed.
    // That is acceptable because contentBefore still matches the real disk
    // state at log time, retries simply append another entry with the same
    // contentBefore, and rolling back a phantom entry is a no-op. A two-phase
    // pending/committed log would remove the noise but is deferred until we
    // build a rollback UI that actually consumes it.
    await appendHistoryEntry(this.basePath, {
      filePath,
      contentBefore: before,
      contentAfter: content,
      changeSummary,
      changedBy: this.changedBy,
      now: this.now,
    });
    const tempPath = `${abs}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, content, "utf8");
      await rename(tempPath, abs);
    } catch (err) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw err;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    const paths: string[] = [];
    await walk(this.basePath, this.basePath, paths);
    paths.sort();
    return prefix ? paths.filter((p) => p.startsWith(prefix)) : paths;
  }

  async search(query: string, scope: SearchScope = "active"): Promise<SearchResult[]> {
    const today = formatToday(this.now());
    const all = await this.list();
    const results: SearchResult[] = [];
    for (const filePath of all) {
      if (!isInScope(filePath, scope, today)) continue;
      const content = await readFile(this.resolve(filePath), "utf8");
      results.push(...findMatches(filePath, content, query));
    }
    return results;
  }
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isNodeEnoent(err)) return;
    throw err;
  }
  for (const entry of entries) {
    // Skip dot-directories (.git, .obsidian, .gtd-companion, ...). Keeps
    // Obsidian config, git metadata, and our own audit trail out of list().
    if (entry.isDirectory() && entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, abs, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      const rel = path.relative(root, abs).split(path.sep).join("/");
      out.push(rel);
    }
  }
}

async function readIfExists(abs: string): Promise<string> {
  try {
    return await readFile(abs, "utf8");
  } catch (err) {
    if (isNodeEnoent(err)) return "";
    throw err;
  }
}

function isNodeEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "ENOENT"
  );
}
