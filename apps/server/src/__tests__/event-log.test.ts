import { describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "@gtd/api";

import { EventLog, type Replay } from "../chat/event-log.js";

const delta = (text: string): SessionEvent => ({
  type: "text-delta",
  turnId: "t1",
  text,
});

function seqsOf(replay: Replay): number[] {
  if (replay === "resync") throw new Error("expected a replay, got resync");
  return replay.map((entry) => entry.seq);
}

function logWith(seed: number, texts: string[]): EventLog {
  const log = new EventLog(seed);
  for (const text of texts) log.append(delta(text));
  return log;
}

describe("EventLog", () => {
  it("numbers events from the seed, one up per append, and reports the tip", () => {
    const log = new EventLog(500);
    expect(log.tip).toBe(499);
    expect(log.append(delta("a")).seq).toBe(500);
    expect(log.append(delta("b")).seq).toBe(501);
    expect(log.tip).toBe(501);
  });

  it("T6.1-AC-03: since() serves the whole log without a cursor and only later events with one", () => {
    const log = logWith(100, ["a", "b", "c"]);
    expect(log.since()).toEqual([
      { seq: 100, event: delta("a") },
      { seq: 101, event: delta("b") },
      { seq: 102, event: delta("c") },
    ]);
    expect(seqsOf(log.since(100))).toEqual([101, 102]);
    expect(seqsOf(log.since(99))).toEqual([100, 101, 102]);
    expect(log.since(102)).toEqual([]);
  });

  it("T6.1-AC-03: since() answers resync for a cursor before the oldest retained event or beyond the tip", () => {
    const log = logWith(100, ["a", "b", "c"]);
    expect(log.since(98)).toBe("resync");
    expect(log.since(103)).toBe("resync");
    expect(new EventLog(100).since(50)).toBe("resync");
  });

  it("keeps counting across clear(): the old tip stays servable, anything older resyncs", () => {
    const log = logWith(100, ["a", "b"]);
    log.clear();
    expect(log.since()).toEqual([]);
    expect(log.since(101)).toEqual([]);
    expect(log.since(100)).toBe("resync");
    expect(log.append(delta("c")).seq).toBe(102);
    expect(seqsOf(log.since(101))).toEqual([102]);
  });

  it("fans out synchronously to subscribers until they unsubscribe", () => {
    const log = new EventLog(1);
    const seen: number[] = [];
    const unsubscribe = log.subscribe((entry) => seen.push(entry.seq));
    log.append(delta("a"));
    expect(seen).toEqual([1]);
    unsubscribe();
    log.append(delta("b"));
    expect(seen).toEqual([1]);
  });

  it("drops a throwing subscriber instead of failing the append", () => {
    const log = new EventLog(1);
    const broken = vi.fn(() => {
      throw new Error("socket gone");
    });
    const healthy = vi.fn();
    log.subscribe(broken);
    log.subscribe(healthy);
    expect(() => log.append(delta("a"))).not.toThrow();
    log.append(delta("b"));
    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(2);
  });
});
