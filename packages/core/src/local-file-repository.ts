import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FileRepository, SearchResult, SearchScope } from "./file-repository.js";
import { FileNotFoundError } from "./file-repository.js";
import { appendHistoryEntry, HISTORY_DIR, type ChangeActor } from "./history-log.js";
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
    const normalized = filePath.split("/").join(path.sep);
    return path.join(this.basePath, normalized);
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
    await writeFile(abs, content, "utf8");
    await appendHistoryEntry(this.basePath, {
      filePath,
      contentBefore: before,
      contentAfter: content,
      changeSummary,
      changedBy: this.changedBy,
      now: this.now,
    });
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
    if (entry.name === HISTORY_DIR) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, abs, out);
    } else if (entry.isFile()) {
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
