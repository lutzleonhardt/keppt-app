import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EditResult, SearchReplaceEdit } from "./edit.js";
import { planAndApplyEdits } from "./edit.js";
import type { FileRepository, SearchResult, SearchScope } from "./file-repository.js";
import {
  FileNotFoundError,
  InvalidPathError,
  RESERVED_PREFIX,
  validateFilePath,
} from "./file-repository.js";
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
  private canonicalBasePromise?: Promise<string>;

  constructor(basePath: string, options: LocalFileRepositoryOptions = {}) {
    this.basePath = basePath;
    this.now = options.now ?? (() => new Date());
    this.changedBy = options.changedBy ?? "llm";
  }

  // Static checks #1–#12 (sync, shared with InMemoryFileRepository) plus the
  // runtime symlink-escape check #13. `validateFilePath` rejects every
  // syntactic vector; the realpath comparison below catches the one shape
  // a sync string check cannot see — a path that lexically stays inside
  // basePath but resolves through a symlink to somewhere outside the vault.
  // For non-existent targets (first write/edit creating a new file) we walk
  // up to the deepest existing ancestor and realpath that, then re-attach
  // the validated leaf segments. Those tail segments are syntactic and
  // cannot themselves be symlinks since the filesystem hasn't created them.
  private async resolveSafe(filePath: string): Promise<string> {
    validateFilePath(filePath);
    const normalized = filePath.split("/").join(path.sep);
    const abs = path.resolve(this.basePath, normalized);
    const canonicalBase = await this.canonicalBase();
    const canonicalTarget = await canonicalizeDeepest(abs);
    if (!isWithin(canonicalBase, canonicalTarget)) {
      throw new InvalidPathError(filePath, "symlink escapes vault root");
    }
    // validateFilePath rejects `.keppt/...` syntactically, but a user-placed
    // symlink at an LLM-allowed path (e.g. `tasks/inbox.md → .keppt/file-history.jsonl`)
    // canonicalizes into the vault and would otherwise leak internal audit
    // state — including contentBefore snapshots of files already deleted or
    // archived from the LLM's view. Re-apply the reserved-prefix check
    // against the canonical-relative path to close that gap.
    const relative = path.relative(canonicalBase, canonicalTarget);
    if (relative.split(path.sep)[0] === RESERVED_PREFIX) {
      throw new InvalidPathError(filePath, "symlink resolves into reserved internal namespace");
    }
    // KNOWN LIMITATIONS — accepted for Phase 1, do not re-flag.
    //   (a) TOCTOU between this check and the syscall: we realpath once
    //       and then hand back the lexical `abs`, which the caller uses
    //       for read/write/rename later. A concurrent local writer with
    //       access to a vault ancestor could swap a directory for an
    //       escaping symlink inside that window.
    //   (b) Other filesystem aliases (hard links, bind mounts, reflinks)
    //       are not detected. A vault path that is hard-linked to an
    //       inode also reachable outside the vault would pass realpath
    //       containment because both names resolve to the same canonical
    //       location inside the vault.
    // Both are out of scope for Phase 1: the CLI runs single-user against
    // a vault the user already owns. Anyone with write access to the
    // vault directory has already won — and creating a hard link requires
    // read access to the source file, so it grants no privilege the user
    // doesn't already hold. An `nlink > 1` reject would also false-block
    // legitimate tooling (dedup utilities, snapshot backups, Obsidian
    // plugins). Production persistence moves to Supabase (see commit()),
    // where row transactions replace this whole boundary anyway.
    return abs;
  }

  private canonicalBase(): Promise<string> {
    if (!this.canonicalBasePromise) {
      this.canonicalBasePromise = realpath(this.basePath);
    }
    return this.canonicalBasePromise;
  }

  async read(filePath: string): Promise<string> {
    const abs = await this.resolveSafe(filePath);
    try {
      return await readFile(abs, "utf8");
    } catch (err) {
      if (isNodeEnoent(err)) throw new FileNotFoundError(filePath);
      throw err;
    }
  }

  async write(filePath: string, content: string, changeSummary: string): Promise<void> {
    const abs = await this.resolveSafe(filePath);
    const before = await readIfExists(abs);
    await this.commit(filePath, abs, before, content, changeSummary);
  }

  async edit(
    filePath: string,
    edits: readonly SearchReplaceEdit[],
    changeSummary: string,
  ): Promise<EditResult> {
    let abs: string;
    try {
      abs = await this.resolveSafe(filePath);
    } catch (err) {
      if (err instanceof InvalidPathError) return missingFileError(edits);
      throw err;
    }

    let original: string;
    try {
      original = await this.fsReadUtf8(abs);
    } catch (err) {
      if (isNodeEnoent(err)) return missingFileError(edits);
      throw err;
    }

    const result = planAndApplyEdits(original, edits);
    if (!result.ok) return { ok: false, error: result.error };

    // CAS-style recheck: the plan was computed against `original`. If the
    // file changed between the planning read and now (concurrent edit, an
    // Obsidian save, another tool call), committing `result.next` would
    // silently overwrite that change AND log it with a contentBefore that
    // never existed. Re-read and abort if the bytes have shifted, surfacing
    // the current content so the caller can re-plan against truth.
    //
    // KNOWN LIMITATION: a small race window remains between this recheck
    // and the rename inside commit() (history append + temp write + rename,
    // ~tens of ms). A perfectly-timed concurrent writer in that window will
    // still be overwritten. We accept it for now because LocalFileRepository
    // is a stepping-stone for CLI development — production persistence will
    // move to Supabase, where row-level transactions replace this guard.
    // Revisit (per-path mutex + lockfile) only if a real collision shows up.
    let current: string;
    try {
      current = await this.fsReadUtf8(abs);
    } catch (err) {
      if (isNodeEnoent(err)) return missingFileError(edits);
      throw err;
    }
    if (current !== original) {
      return {
        ok: false,
        error: {
          failedSearch: edits[0]?.search ?? "",
          matchCount: 0,
          currentContent: current,
        },
      };
    }

    await this.commit(filePath, abs, original, result.next, changeSummary);
    return { ok: true };
  }

  // Test seam: lets a subclass simulate a concurrent file mutation between
  // the planning read and the CAS recheck above. Production code always
  // dispatches to fs.readFile.
  protected async fsReadUtf8(abs: string): Promise<string> {
    return readFile(abs, "utf8");
  }

  // Shared commit path for write() and edit(). Persist history before
  // touching the file so that contentBefore (the rollback snapshot) is
  // always durable before any on-disk mutation. The reverse order would
  // risk an unlogged write if the history append fails, permanently losing
  // the old content.
  //
  // Tradeoff: if writeFile or rename below fails after the append succeeds,
  // the log keeps a "phantom" entry describing a change that never landed.
  // That is acceptable because contentBefore still matches the real disk
  // state at log time, retries simply append another entry with the same
  // contentBefore, and rolling back a phantom entry is a no-op. A two-phase
  // pending/committed log would remove the noise but is deferred until we
  // build a rollback UI that actually consumes it.
  private async commit(
    filePath: string,
    abs: string,
    contentBefore: string,
    contentAfter: string,
    changeSummary: string,
  ): Promise<void> {
    await mkdir(path.dirname(abs), { recursive: true });
    await appendHistoryEntry(this.basePath, {
      filePath,
      contentBefore,
      contentAfter,
      changeSummary,
      changedBy: this.changedBy,
      now: this.now,
    });
    const tempPath = `${abs}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, contentAfter, "utf8");
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

  async search(
    query: string,
    scope: SearchScope = "active",
    today?: string,
  ): Promise<SearchResult[]> {
    const t = today ?? formatToday(this.now());
    const all = await this.list();
    const results: SearchResult[] = [];
    for (const filePath of all) {
      if (!isInScope(filePath, scope, t)) continue;
      let abs: string;
      try {
        abs = await this.resolveSafe(filePath);
      } catch (err) {
        // A pre-existing file whose name violates a static rule (e.g. a
        // legitimate `CON.md` on a non-Windows host) or that resolves
        // through a symlink outside the vault is silently skipped rather
        // than aborting the whole search. The same path will reject if
        // read/write/edit is called on it directly — that's where the
        // user-visible error belongs.
        if (err instanceof InvalidPathError) continue;
        throw err;
      }
      const content = await readFile(abs, "utf8");
      results.push(...findMatches(filePath, content, query));
    }
    return results;
  }
}

function canonicalizeDeepest(abs: string): Promise<string> {
  return walkUpForRealpath(abs, []);
}

async function walkUpForRealpath(current: string, tail: string[]): Promise<string> {
  try {
    const real = await realpath(current);
    if (tail.length === 0) return real;
    const reattach = tail.slice().reverse();
    return path.join(real, ...reattach);
  } catch (err) {
    if (!isNodeEnoent(err)) throw err;
    const parent = path.dirname(current);
    if (parent === current) throw err;
    return walkUpForRealpath(parent, [...tail, path.basename(current)]);
  }
}

function isWithin(base: string, target: string): boolean {
  if (target === base) return true;
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  return target.startsWith(prefix);
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
    // Skip dot-directories (.git, .obsidian, .keppt, ...). Keeps
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

function missingFileError(edits: readonly SearchReplaceEdit[]): EditResult {
  return {
    ok: false,
    error: {
      failedSearch: edits[0]?.search ?? "",
      matchCount: 0,
      currentContent: "",
    },
  };
}
