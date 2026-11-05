import type { ModelMessage } from "ai";

/**
 * The kind of turn a message belongs to — the engine's `TurnInput["kind"]`.
 * `opener` is the Auto-Replan opener: its kickoff and instruction messages
 * are user-role but were never typed, its read_file calls were fabricated.
 * Display surfaces hide opener user/tool content; the model always sees
 * the full history (`buildRequest` ignores the origin).
 */
export type MessageOrigin = "user" | "opener";

export interface SessionEntry {
  message: ModelMessage;
  /** ms epoch at which the turn containing the message started. */
  createdAt: number;
  origin: MessageOrigin;
}

interface SessionJSON {
  date: string;
  entries: SessionEntry[];
}

const MESSAGE_ORIGINS: readonly string[] = ["user", "opener"];

/**
 * A conversation log for one calendar day. Identity is `date` (YYYY-MM-DD).
 *
 * Each message is stored with its turn stamp and origin as one entry, so
 * the bookkeeping cannot drift apart. `messages` is a `readonly` view with
 * the same object identities, which is what `createdAtOf`/`originOf` and the
 * pruner's lookups rely on. The snapshot/restore seam lets the turn engine
 * roll back an in-memory append when the accompanying `SessionStore.save`
 * rejects.
 *
 * Persistence lives behind `SessionStore` (`FsSessionStore` for the vault on
 * disk; the hosted beta adds a Supabase-backed store).
 */
export class Session {
  readonly date: string;
  private readonly _entries: SessionEntry[];

  private constructor(date: string, entries: SessionEntry[]) {
    this.date = date;
    this._entries = entries;
  }

  static createEmpty(date: string): Session {
    return new Session(date, []);
  }

  /**
   * Rehydrate a `Session` from a parsed JSON blob. Validates the shape and
   * throws on malformed input rather than silently producing an
   * inconsistent session.
   */
  static fromJSON(raw: unknown): Session {
    if (raw === null || typeof raw !== "object") {
      throw new Error("Session.fromJSON: expected an object");
    }
    const obj = raw as Record<string, unknown>;
    const { date } = obj;
    if (typeof date !== "string" || date.length === 0) {
      throw new Error("Session.fromJSON: missing or invalid `date`");
    }
    return new Session(date, parseEntries(obj.entries));
  }

  get messages(): readonly ModelMessage[] {
    return this._entries.map((entry) => entry.message);
  }

  /** Turn stamp of `msg`, looked up by object identity; `undefined` for foreign messages. */
  createdAtOf(msg: ModelMessage): number | undefined {
    return this.entryOf(msg)?.createdAt;
  }

  originOf(msg: ModelMessage): MessageOrigin | undefined {
    return this.entryOf(msg)?.origin;
  }

  /**
   * Append a turn's worth of messages, all stamped `createdAtMs` and
   * attributed to `origin`. The two-phase save uses this once per phase;
   * the opener once for its whole turn.
   */
  appendTurn(
    messages: readonly ModelMessage[],
    createdAtMs: number,
    origin: MessageOrigin = "user",
  ): void {
    for (const message of messages) {
      this._entries.push({ message, createdAt: createdAtMs, origin });
    }
  }

  /**
   * Capture the current length and return a `restore()` closure that drops
   * every entry appended since. Used to roll back an in-memory append when
   * the accompanying `SessionStore.save` rejects, so the next turn does not
   * build prompts from messages that never reached the store.
   */
  snapshot(): () => void {
    const length = this._entries.length;
    return () => {
      this._entries.length = length;
    };
  }

  /**
   * Called implicitly by `JSON.stringify`. Returns the on-disk shape that
   * `Session.fromJSON` consumes — `Session` roundtrips through JSON without
   * a separate mapper.
   */
  toJSON(): SessionJSON {
    return { date: this.date, entries: this._entries };
  }

  private entryOf(msg: ModelMessage): SessionEntry | undefined {
    return this._entries.find((entry) => entry.message === msg);
  }
}

function parseEntries(raw: unknown): SessionEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error("Session.fromJSON: `entries` must be an array");
  }
  return raw.map(parseEntry);
}

function parseEntry(raw: unknown, index: number): SessionEntry {
  const entry = requireObject(raw, `entries[${index}]`) as Record<
    string,
    unknown
  >;
  const { createdAt } = entry;
  if (typeof createdAt !== "number") {
    throw new Error(
      `Session.fromJSON: entries[${index}].createdAt must be a number`,
    );
  }
  return {
    message: requireObject(
      entry.message,
      `entries[${index}].message`,
    ) as ModelMessage,
    createdAt,
    origin: parseOrigin(entry.origin, index),
  };
}

function requireObject(value: unknown, what: string): object {
  if (value === null || typeof value !== "object") {
    throw new Error(`Session.fromJSON: ${what} must be an object`);
  }
  return value;
}

function parseOrigin(value: unknown, index: number): MessageOrigin {
  if (typeof value !== "string" || !MESSAGE_ORIGINS.includes(value)) {
    throw new Error(
      `Session.fromJSON: entries[${index}].origin must be "user" or "opener"`,
    );
  }
  return value as MessageOrigin;
}

/**
 * Per-day persistence for `Session`. `FsSessionStore` is the filesystem-backed
 * implementation; the hosted beta adds a Supabase-backed one. The turn engine
 * sees only this interface.
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
