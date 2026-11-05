import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";

import { Session } from "../sessions.js";

const USER = (text: string): ModelMessage => ({ role: "user", content: text });
const ASSISTANT = (text: string): ModelMessage => ({
  role: "assistant",
  content: text,
});

describe("Session", () => {
  it("createEmpty produces an empty session for the given date", () => {
    const s = Session.createEmpty("2026-05-19");
    expect(s.date).toBe("2026-05-19");
    expect(s.messages).toEqual([]);
  });

  it("appendTurn extends messages and stamps each with the same createdAtMs", () => {
    const s = Session.createEmpty("2026-05-19");
    const msgs: ModelMessage[] = [USER("hi"), ASSISTANT("hello")];
    s.appendTurn(msgs, 1_000);
    expect(s.messages).toHaveLength(2);
    expect(s.createdAtOf(msgs[0]!)).toBe(1_000);
    expect(s.createdAtOf(msgs[1]!)).toBe(1_000);
  });

  it("appendTurn called twice records two distinct timestamps", () => {
    const s = Session.createEmpty("2026-05-19");
    const u = USER("u");
    const a = ASSISTANT("a");
    s.appendTurn([u], 1_000);
    s.appendTurn([a], 2_000);
    expect(s.createdAtOf(u)).toBe(1_000);
    expect(s.createdAtOf(a)).toBe(2_000);
  });

  it("appendTurn defaults the origin to user and records the opener origin per append", () => {
    const s = Session.createEmpty("2026-05-19");
    const typed = USER("typed");
    const kickoff = USER("[Day rollover …]");
    const greeting = ASSISTANT("Guten Morgen");
    s.appendTurn([typed], 1_000);
    s.appendTurn([kickoff, greeting], 2_000, "opener");
    expect(s.originOf(typed)).toBe("user");
    expect(s.originOf(kickoff)).toBe("opener");
    expect(s.originOf(greeting)).toBe("opener");
  });

  it("createdAtOf and originOf return undefined for messages not in the session", () => {
    const s = Session.createEmpty("2026-05-19");
    s.appendTurn([USER("hi")], 1_000);
    expect(s.createdAtOf(USER("nope"))).toBeUndefined();
    expect(s.originOf(USER("nope"))).toBeUndefined();
  });

  it("messages getter exposes the same identities appendTurn was called with (identity lookups stay valid)", () => {
    const s = Session.createEmpty("2026-05-19");
    const u = USER("hi");
    s.appendTurn([u], 1_000);
    expect(s.messages[0]).toBe(u);
  });

  it("T4.1-AC-13: snapshot() returns a restore() that rolls back appendTurn", () => {
    const s = Session.createEmpty("2026-05-19");
    s.appendTurn([USER("pre")], 1_000);
    const restore = s.snapshot();
    s.appendTurn([ASSISTANT("response from a save that will fail")], 2_000);
    expect(s.messages).toHaveLength(2);
    restore();
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]).toEqual(USER("pre"));
    expect(s.createdAtOf(s.messages[0]!)).toBe(1_000);
  });

  it("snapshot() drops stamps and origins of rolled-back messages together", () => {
    const s = Session.createEmpty("2026-05-19");
    const restore = s.snapshot();
    const a = ASSISTANT("first");
    const b = ASSISTANT("second");
    s.appendTurn([a, b], 1_000, "opener");
    expect(s.messages).toHaveLength(2);
    restore();
    expect(s.messages).toHaveLength(0);
    expect(s.createdAtOf(a)).toBeUndefined();
    expect(s.originOf(b)).toBeUndefined();
  });

  it("toJSON returns the on-disk entry shape and JSON.stringify uses it", () => {
    const s = Session.createEmpty("2026-05-19");
    const u = USER("hi");
    s.appendTurn([u], 1_000);
    const json = s.toJSON();
    expect(json).toEqual({
      date: "2026-05-19",
      entries: [{ message: u, createdAt: 1_000, origin: "user" }],
    });
    const stringified = JSON.parse(JSON.stringify(s));
    expect(stringified).toEqual(json);
  });

  it("T5-AC-03: opener origins round-trip through toJSON/fromJSON", () => {
    const original = Session.createEmpty("2026-05-19");
    original.appendTurn([USER("a")], 1_000);
    original.appendTurn([USER("[kickoff]"), ASSISTANT("b")], 2_000, "opener");

    const round = Session.fromJSON(JSON.parse(JSON.stringify(original)));
    expect(round.date).toBe("2026-05-19");
    expect(round.messages).toHaveLength(3);
    expect(round.messages[0]).toEqual(USER("a"));
    expect(round.createdAtOf(round.messages[0]!)).toBe(1_000);
    expect(round.originOf(round.messages[0]!)).toBe("user");
    expect(round.createdAtOf(round.messages[1]!)).toBe(2_000);
    expect(round.originOf(round.messages[1]!)).toBe("opener");
    expect(round.originOf(round.messages[2]!)).toBe("opener");
  });

  it("fromJSON rejects malformed input — not an object", () => {
    expect(() => Session.fromJSON(null)).toThrow(/expected an object/);
    expect(() => Session.fromJSON("nope")).toThrow(/expected an object/);
  });

  it("fromJSON rejects malformed input — missing or invalid date", () => {
    expect(() => Session.fromJSON({ entries: [] })).toThrow(
      /missing or invalid `date`/,
    );
    expect(() => Session.fromJSON({ date: "", entries: [] })).toThrow(
      /missing or invalid `date`/,
    );
  });

  it("fromJSON rejects malformed entries — not an array, bad message, bad stamp, bad origin", () => {
    expect(() =>
      Session.fromJSON({ date: "2026-05-19", entries: "x" }),
    ).toThrow(/`entries` must be an array/);
    expect(() =>
      Session.fromJSON({ date: "2026-05-19", entries: ["nope"] }),
    ).toThrow(/entries\[0\] must be an object/);
    expect(() =>
      Session.fromJSON({
        date: "2026-05-19",
        entries: [{ message: "x", createdAt: 1, origin: "user" }],
      }),
    ).toThrow(/entries\[0\]\.message must be an object/);
    expect(() =>
      Session.fromJSON({
        date: "2026-05-19",
        entries: [{ message: USER("a"), createdAt: "1", origin: "user" }],
      }),
    ).toThrow(/entries\[0\]\.createdAt must be a number/);
    expect(() =>
      Session.fromJSON({
        date: "2026-05-19",
        entries: [{ message: USER("a"), createdAt: 1, origin: "bot" }],
      }),
    ).toThrow(/entries\[0\]\.origin must be "user" or "opener"/);
  });
});
