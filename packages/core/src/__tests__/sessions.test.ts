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

  it("createdAtOf returns undefined for messages not in the session", () => {
    const s = Session.createEmpty("2026-05-19");
    s.appendTurn([USER("hi")], 1_000);
    expect(s.createdAtOf(USER("nope"))).toBeUndefined();
  });

  it("messages getter exposes the same identities appendTurn was called with (indexOf lookups stay valid)", () => {
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

  it("snapshot() restores both messages and createdAt together (invariant preserved)", () => {
    const s = Session.createEmpty("2026-05-19");
    const restore = s.snapshot();
    const a = ASSISTANT("first");
    const b = ASSISTANT("second");
    s.appendTurn([a, b], 1_000);
    expect(s.messages).toHaveLength(2);
    restore();
    expect(s.messages).toHaveLength(0);
    expect(s.createdAtOf(a)).toBeUndefined();
    expect(s.createdAtOf(b)).toBeUndefined();
  });

  it("toJSON returns the on-disk shape and JSON.stringify uses it", () => {
    const s = Session.createEmpty("2026-05-19");
    const u = USER("hi");
    s.appendTurn([u], 1_000);
    const json = s.toJSON();
    expect(json).toEqual({
      date: "2026-05-19",
      messages: [u],
      createdAt: [1_000],
    });
    const stringified = JSON.parse(JSON.stringify(s));
    expect(stringified).toEqual(json);
  });

  it("fromJSON rehydrates a valid blob and roundtrips state", () => {
    const original = Session.createEmpty("2026-05-19");
    original.appendTurn([USER("a")], 1_000);
    original.appendTurn([ASSISTANT("b")], 2_000);

    const round = Session.fromJSON(JSON.parse(JSON.stringify(original)));
    expect(round.date).toBe("2026-05-19");
    expect(round.messages).toHaveLength(2);
    expect(round.messages[0]).toEqual(USER("a"));
    expect(round.createdAtOf(round.messages[0]!)).toBe(1_000);
    expect(round.createdAtOf(round.messages[1]!)).toBe(2_000);
  });

  it("fromJSON rejects malformed input — not an object", () => {
    expect(() => Session.fromJSON(null)).toThrow(/expected an object/);
    expect(() => Session.fromJSON("nope")).toThrow(/expected an object/);
  });

  it("fromJSON rejects malformed input — missing or invalid date", () => {
    expect(() => Session.fromJSON({ messages: [], createdAt: [] })).toThrow(
      /missing or invalid `date`/,
    );
    expect(() =>
      Session.fromJSON({ date: "", messages: [], createdAt: [] }),
    ).toThrow(/missing or invalid `date`/);
  });

  it("fromJSON rejects malformed input — non-array messages", () => {
    expect(() =>
      Session.fromJSON({ date: "2026-05-19", messages: "x", createdAt: [] }),
    ).toThrow(/`messages` must be an array/);
  });

  it("fromJSON rejects malformed input — createdAt not an array of numbers", () => {
    expect(() =>
      Session.fromJSON({
        date: "2026-05-19",
        messages: [],
        createdAt: ["nope"],
      }),
    ).toThrow(/`createdAt` must be an array of numbers/);
  });

  it("fromJSON rejects invariant violation — messages.length !== createdAt.length", () => {
    expect(() =>
      Session.fromJSON({
        date: "2026-05-19",
        messages: [USER("a")],
        createdAt: [1, 2],
      }),
    ).toThrow(/invariant violation/);
  });
});
