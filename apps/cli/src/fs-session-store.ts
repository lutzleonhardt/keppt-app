import * as nodeFs from "node:fs/promises";
import path from "node:path";
import { Session, type SessionStore } from "@gtd/core";

/**
 * The subset of `node:fs/promises` `FsSessionStore` actually uses. Exposed
 * as a constructor parameter so tests can inject a wrapper that records
 * calls and conditionally fails — ESM module namespaces are frozen, so
 * `vi.spyOn(fs, "rename")` does not work on `node:fs/promises` itself.
 */
export type FsSessionStoreOps = Pick<
  typeof nodeFs,
  "mkdir" | "readFile" | "writeFile" | "rename"
>;

/**
 * Filesystem-backed `SessionStore`. Per-day JSON files at
 * `<vaultPath>/.keppt/sessions/<date>.json`.
 *
 * `save` is atomic against partial writes: serialize to a same-directory tmp
 * file, then `rename` over the final path. POSIX guarantees `rename` is
 * atomic within the same filesystem — a crash, SIGKILL, or ENOSPC mid-write
 * leaves either the previous good file or the new one in place, never a
 * truncated mix. `fsync` is deliberately omitted (same throughput vs.
 * post-crash-window trade-off as `cli-error-log.ts` JSONL appends).
 *
 * `apps/cli` owns this implementation because `packages/core` is shared with
 * the Phase-2a web/Supabase target, which has no `node:fs`. The same
 * `SessionStore` interface in core gets a Supabase-backed implementation
 * there.
 */
export class FsSessionStore implements SessionStore {
  private readonly fs: FsSessionStoreOps;
  private readonly sessionsDir: string;

  constructor(
    private readonly vaultPath: string,
    fs: FsSessionStoreOps = nodeFs,
  ) {
    this.fs = fs;
    this.sessionsDir = path.join(vaultPath, ".keppt", "sessions");
  }

  sessionFilePath(date: string): string {
    return path.join(this.sessionsDir, `${date}.json`);
  }

  async loadOrCreate(date: string): Promise<Session> {
    const file = this.sessionFilePath(date);
    try {
      const raw = await this.fs.readFile(file, "utf8");
      return Session.fromJSON(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return Session.createEmpty(date);
      }
      throw err;
    }
  }

  // Multi-instance safety is **out of scope** for this CLI. The tmp+rename
  // pattern protects against partial writes (crash, ENOSPC, SIGKILL mid-
  // write), but not against load-modify-save races between two CLI
  // processes against the same `<vault>/<date>` — last writer wins, and
  // a parallel turn from another instance would be lost. The Phase-1 CLI
  // is a single-user single-instance testballoon; the constraint is
  // documented in the plan's Open Issues. The deeper semantic problem
  // (two clients turning into one session at once produces incoherent
  // LLM context, not just a persistence race) is what Phase 2a solves
  // structurally — append-only `messages` rows plus
  // `sessions.in_flight_turn_id` with SSE-broadcast turn-locking — and
  // adding filesystem locking here would be throwaway engineering for a
  // use case that does not exist.
  async save(session: Session): Promise<void> {
    const final = this.sessionFilePath(session.date);
    await this.fs.mkdir(path.dirname(final), { recursive: true });
    const tmp = `${final}.tmp.${process.pid}.${Date.now()}`;
    await this.fs.writeFile(tmp, JSON.stringify(session), "utf8");
    await this.fs.rename(tmp, final);
  }
}
