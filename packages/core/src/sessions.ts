import type { ModelMessage } from "ai";

interface SessionJSON {
  date: string;
  messages: ModelMessage[];
  createdAt: number[];
}

/**
 * A conversation log for one calendar day. Identity is `date` (YYYY-MM-DD).
 *
 * Encapsulates the invariant `messages.length === createdAt.length` and the
 * snapshot/restore seam used by the CLI to roll back an in-memory append when
 * the accompanying `SessionStore.save` rejects (Phase-1 or Phase-2 save
 * failure — see Task 4.1 plan and `apps/cli/src/index.ts`).
 *
 * Persistence lives behind `SessionStore`. Core does not import `node:fs` —
 * the CLI provides `FsSessionStore`, Phase 2a will provide a Supabase-backed
 * store implementing the same interface.
 */
export class Session {
  readonly date: string;
  // Parallel arrays kept internal so the `length === length` invariant is the
  // class's responsibility, not the caller's. `messages` is exposed as a
  // `readonly` view so `streamText({ messages: session.messages })` works
  // without translation.
  private readonly _messages: ModelMessage[];
  private readonly _createdAt: number[];

  private constructor(
    date: string,
    messages: ModelMessage[],
    createdAt: number[],
  ) {
    this.date = date;
    this._messages = messages;
    this._createdAt = createdAt;
  }

  static createEmpty(date: string): Session {
    return new Session(date, [], []);
  }

  /**
   * Rehydrate a `Session` from a parsed JSON blob. Validates the shape and
   * the `messages.length === createdAt.length` invariant; throws on
   * malformed input rather than silently producing an inconsistent session.
   */
  static fromJSON(raw: unknown): Session {
    if (raw === null || typeof raw !== "object") {
      throw new Error("Session.fromJSON: expected an object");
    }
    const obj = raw as Record<string, unknown>;
    const { date, messages, createdAt } = obj;
    if (typeof date !== "string" || date.length === 0) {
      throw new Error("Session.fromJSON: missing or invalid `date`");
    }
    if (!Array.isArray(messages)) {
      throw new Error("Session.fromJSON: `messages` must be an array");
    }
    if (
      !Array.isArray(createdAt) ||
      !createdAt.every((n) => typeof n === "number")
    ) {
      throw new Error(
        "Session.fromJSON: `createdAt` must be an array of numbers",
      );
    }
    if (messages.length !== createdAt.length) {
      throw new Error(
        `Session.fromJSON: invariant violation — messages.length (${messages.length}) !== createdAt.length (${createdAt.length})`,
      );
    }
    return new Session(
      date,
      (messages as ModelMessage[]).slice(),
      createdAt.slice(),
    );
  }

  get messages(): readonly ModelMessage[] {
    return this._messages;
  }

  /**
   * Look up the ms-epoch timestamp at which `msg` was appended. Used by the
   * pruner's drift check via the CLI closure. O(n) `indexOf`; n stays small
   * in Phase 1 (K + active context).
   */
  createdAtOf(msg: ModelMessage): number | undefined {
    const i = this._messages.indexOf(msg);
    return i >= 0 ? this._createdAt[i] : undefined;
  }

  /**
   * Append a turn's worth of messages, stamping each with the same
   * `createdAtMs`. The two-phase save uses this once per phase (Phase 1:
   * just the user message; Phase 2: assistant + tool messages).
   */
  appendTurn(messages: ModelMessage[], createdAtMs: number): void {
    for (const m of messages) {
      this._messages.push(m);
      this._createdAt.push(createdAtMs);
    }
  }

  /**
   * Capture current lengths and return a `restore()` closure that truncates
   * both internal arrays back to those lengths. Used by the CLI to roll
   * back an in-memory append when the accompanying `SessionStore.save`
   * rejects, so the next turn does not build prompts from messages that
   * never reached disk.
   */
  snapshot(): () => void {
    const mLen = this._messages.length;
    const tLen = this._createdAt.length;
    return () => {
      this._messages.length = mLen;
      this._createdAt.length = tLen;
    };
  }

  /**
   * Called implicitly by `JSON.stringify`. Returns the on-disk shape that
   * `Session.fromJSON` consumes — `Session` roundtrips through JSON without
   * a separate mapper.
   */
  toJSON(): SessionJSON {
    return {
      date: this.date,
      messages: this._messages,
      createdAt: this._createdAt,
    };
  }
}

/**
 * Per-day persistence for `Session`. CLI provides a filesystem-backed
 * implementation; Phase 2a will provide a Supabase-backed implementation
 * against the `messages` table. Core stays storage-agnostic.
 */
export interface SessionStore {
  /**
   * Load the session for `date` (YYYY-MM-DD) or return
   * `Session.createEmpty(date)` if none exists yet. Pure read — no write
   * side-effect; the file (or row) only materializes on the first `save`.
   */
  loadOrCreate(date: string): Promise<Session>;

  /**
   * Persist the session. Implementations should make this atomic against
   * partial-write failures (the CLI implementation uses tmp + rename).
   */
  save(session: Session): Promise<void>;
}
