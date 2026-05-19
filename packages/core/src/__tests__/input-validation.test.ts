import { describe, expect, it } from "vitest";

import {
  MAX_INPUT_CHARS,
  REJECTION_MESSAGE,
  validateUserInput,
} from "../input-validation.js";

describe("validateUserInput", () => {
  // T4-AC-10: hard length cap rejects 2001 chars.
  it("rejects input longer than MAX_INPUT_CHARS", () => {
    const line = "a".repeat(MAX_INPUT_CHARS + 1);
    const result = validateUserInput(line);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("too_long");
    expect(result.message).toContain(String(MAX_INPUT_CHARS + 1));
  });

  // T4-AC-11: 2000 chars of normal language accepted (boundary).
  it("accepts MAX_INPUT_CHARS of plain prose", () => {
    const sentence = "Plan today and review next actions before lunch. ";
    let line = "";
    while (line.length + sentence.length <= MAX_INPUT_CHARS) line += sentence;
    line = line.padEnd(MAX_INPUT_CHARS, "x");
    expect(line.length).toBe(MAX_INPUT_CHARS);

    const result = validateUserInput(line);
    expect(result).toEqual({ ok: true });
  });

  // T4-AC-12: code paste detected.
  it("rejects a 50-line function-body paste as a code paste", () => {
    const lines: string[] = ["function foo() {"];
    for (let i = 0; i < 48; i++) {
      lines.push(`  const x${i} = doSomething(x${i - 1});`);
    }
    lines.push("}");
    const paste = lines.join("\n");

    const result = validateUserInput(paste);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("code_paste");
    expect(result.message).toBe(REJECTION_MESSAGE);
  });

  // T4-AC-13: normal task text accepted.
  it("accepts a plain task request", () => {
    const result = validateUserInput("New task: write VW quote");
    expect(result).toEqual({ ok: true });
  });

  // Honest-edge-case guard from the plan: tasks with special chars in
  // moderate proportion must NOT be rejected.
  it("accepts a short task that mentions code-ish tokens", () => {
    const result = validateUserInput(
      "Write code review for PR #42 (auth flow); covers login() and signup().",
    );
    expect(result).toEqual({ ok: true });
  });
});
