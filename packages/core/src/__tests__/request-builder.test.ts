import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";

import { buildRequest } from "../request-builder.js";

const TODAY = new Date("2026-04-24");

describe("buildRequest", () => {
  it("returns a system prompt that carries the R-anchors plus the optional profile", () => {
    const result = buildRequest({
      today: TODAY,
      profile: "Prefers brevity. Works in Berlin time.",
      messages: [],
      userMessage: "Hello",
    });

    expect(result.system).toContain("[R1]");
    expect(result.system).toContain("[R13]");
    expect(result.system).toContain("## User profile");
    expect(result.system).toContain("Prefers brevity.");
  });

  it("omits the user-profile section when no profile is supplied", () => {
    const result = buildRequest({
      today: TODAY,
      messages: [],
      userMessage: "Hi",
    });
    expect(result.system).not.toContain("## User profile");
  });

  it("omits the user-profile section when the profile is whitespace-only", () => {
    const result = buildRequest({
      today: TODAY,
      profile: "   \n  ",
      messages: [],
      userMessage: "Hi",
    });
    expect(result.system).not.toContain("## User profile");
  });

  it("passes prior messages through verbatim and appends the new user message", () => {
    const prior: ModelMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
    ];
    const result = buildRequest({
      today: TODAY,
      messages: prior,
      userMessage: "second",
    });

    expect(result.messages[0]).toEqual({ role: "user", content: "first" });
    expect(result.messages[1]).toEqual({ role: "assistant", content: "ok" });
    expect(result.messages[2]).toEqual({ role: "user", content: "second" });
    expect(result.messages).toHaveLength(3);
  });

  it("appends only the new user message when no prior history is supplied", () => {
    const result = buildRequest({
      today: TODAY,
      messages: [],
      userMessage: "hi",
    });
    expect(result.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("does not inject any vault content into `system` or `messages` (no active-state pre-load)", () => {
    // Pruning-only contract (architecture amendment 2026-05-19): buildRequest
    // is a pure transform — it must never read the vault. The LLM gets vault
    // content via `read_file` tool calls only. Pinned by signature (no `repo`
    // parameter) AND by behavior: no system-role message appears in the
    // output, only the appended user message.
    const result = buildRequest({
      today: TODAY,
      messages: [],
      userMessage: "ping",
    });
    expect(result.messages.every((m) => m.role !== "system")).toBe(true);
    expect(result.messages).toHaveLength(1);
  });
});
