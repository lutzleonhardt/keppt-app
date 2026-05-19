import * as nodeFs from "node:fs/promises";
import path from "node:path";
import type { TurnLogRecord, TurnLogger } from "@gtd/core";

/**
 * The subset of `node:fs/promises` `FsTurnLogger` actually uses. Exposed
 * as a constructor parameter so tests can inject a wrapper that records
 * calls and conditionally fails — same ESM-frozen-namespace workaround
 * `FsSessionStore` uses.
 */
export type FsTurnLoggerOps = Pick<
  typeof nodeFs,
  "mkdir" | "readdir" | "writeFile" | "rename"
>;

/**
 * Filesystem-backed `TurnLogger`. One artifact per LLM turn at
 * `<vaultPath>/.keppt/logs/sessions/<sessionDate>/turn-NNN.json`.
 *
 * `writeTurn` is atomic via tmp + rename (POSIX rename is atomic within
 * the same filesystem). The counter is seeded once at construction time
 * from the existing directory listing so a CLI restart on the same day
 * resumes numbering instead of overwriting `turn-001.json`.
 *
 * Construction is async because counter seeding reads the directory.
 * After construction `nextTurnId` is sync — production callers should
 * stamp the id before the request snapshot, then `writeTurn` it.
 */
export class FsTurnLogger implements TurnLogger {
  private readonly fs: FsTurnLoggerOps;
  private readonly dir: string;
  private counter: number;

  private constructor(
    sessionDir: string,
    fs: FsTurnLoggerOps,
    counter: number,
  ) {
    this.fs = fs;
    this.dir = sessionDir;
    this.counter = counter;
  }

  /**
   * Seed the counter from the existing `turn-NNN.json` filenames in the
   * session directory. ENOENT means "first turn this day" — start at 0
   * so `nextTurnId` returns `turn-001`.
   */
  static async create(
    vaultPath: string,
    sessionDate: string,
    fs: FsTurnLoggerOps = nodeFs,
  ): Promise<FsTurnLogger> {
    const dir = path.join(
      vaultPath,
      ".keppt",
      "logs",
      "sessions",
      sessionDate,
    );
    let max = 0;
    try {
      const entries = await fs.readdir(dir);
      for (const name of entries) {
        const m = /^turn-(\d{3})\.json$/.exec(name);
        if (m) {
          const n = parseInt(m[1]!, 10);
          if (n > max) max = n;
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    return new FsTurnLogger(dir, fs, max);
  }

  /**
   * Returns the next zero-padded turn id (`turn-001`, `turn-002`, …).
   * Synchronous after construction. Callers stamp this onto the
   * `TurnLogRecord` before assembling the rest of the artifact, so the
   * filename and `record.turnId` are guaranteed consistent.
   */
  nextTurnId(): string {
    this.counter += 1;
    return `turn-${String(this.counter).padStart(3, "0")}`;
  }

  /**
   * Atomic write of one turn artifact. The filename is derived from
   * `record.turnId` — `nextTurnId()` is the authoritative stamper.
   */
  async writeTurn(record: TurnLogRecord): Promise<void> {
    const final = path.join(this.dir, `${record.turnId}.json`);
    await this.fs.mkdir(this.dir, { recursive: true });
    const tmp = `${final}.tmp.${process.pid}.${Date.now()}`;
    await this.fs.writeFile(tmp, JSON.stringify(record), "utf8");
    await this.fs.rename(tmp, final);
  }
}
