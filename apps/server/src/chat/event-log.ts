import type { SessionEvent } from "@gtd/api";

export interface LoggedEvent {
  readonly seq: number;
  readonly event: SessionEvent;
}

export type Replay = LoggedEvent[] | "resync";

export type EventListener = (entry: LoggedEvent) => void;

/**
 * Append-only log of one user-day's session events, held in memory; the
 * persisted truth is the session file. `seq` is monotonic for the lifetime
 * of the log, across `clear()` included, and seeded from the wall clock so
 * a cursor from an earlier process is always older than the oldest retained
 * event and yields `resync` instead of silently skipping events.
 */
export class EventLog {
  private readonly events: LoggedEvent[] = [];
  private readonly listeners = new Set<EventListener>();
  private nextSeq: number;

  constructor(seed: number) {
    this.nextSeq = seed;
  }

  /** seq of the newest event (`seed − 1` while empty); a cursor equal to it is up to date. */
  get tip(): number {
    return this.nextSeq - 1;
  }

  // Fans out synchronously: the engine calls the sink from its stream loop,
  // so an observer must never fail the turn — a throwing listener is dropped.
  append(event: SessionEvent): LoggedEvent {
    const entry: LoggedEvent = { seq: this.nextSeq, event };
    this.nextSeq += 1;
    this.events.push(entry);
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        this.listeners.delete(listener);
      }
    }
    return entry;
  }

  /**
   * Events after `cursor`, the whole log without one. `"resync"` when the
   * cursor lies before the oldest retained event or beyond the tip.
   */
  since(cursor?: number): Replay {
    if (cursor === undefined) return [...this.events];
    const oldest = this.events[0]?.seq ?? this.nextSeq;
    if (cursor < oldest - 1 || cursor > this.tip) return "resync";
    return this.events.filter((entry) => entry.seq > cursor);
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Day rollover: drop the events, keep counting. */
  clear(): void {
    this.events.length = 0;
  }
}
