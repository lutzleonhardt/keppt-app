// Pre-LLM input gate — for transport boundaries that deliver a COMPLETE user
// submission as one string (WebUI <textarea> submit, future HTTP endpoint).
// The code-paste heuristic only works when it sees the whole paste in one
// call; a per-line caller (readline) cannot use it correctly.
//
// NOT for the current CLI: the CLI is a single-user internal testballoon and
// receives input one readline event per `\n`, so a multi-line paste arrives
// pre-split. The threat model ("untrusted user repurposes the LLM") does not
// apply there. See apps/cli/src/index.ts for the testballoon scoping note.
//
// Two layers:
//   1. Hard length cap — anything past MAX_INPUT_CHARS is rejected outright.
//      Cheapest defense against accidental file pastes; saves tokens and
//      keeps the cache marker stable. Bytes != chars, but at this scale
//      counting chars is good enough.
//   2. Code-paste heuristic — rejects inputs that LOOK like source code
//      (high punctuation density / many indented lines / multiple code
//      fences). The heuristic must stay generous on the "honest task with
//      a few special chars" case: `Write code review for PR #42` is task
//      text, not code.
//
// Call site contract: invoke once per submission on the full payload, BEFORE
// buildRequest / streamText. On reject, surface REJECTION_MESSAGE to the
// user and skip the model call entirely.

export const MAX_INPUT_CHARS = 2000;

export const REJECTION_MESSAGE =
  "That doesn't look like a task request. I'm your GTD assistant — what can I do for your tasks?";

export type InputValidationResult =
  | { ok: true }
  | { ok: false; reason: "too_long" | "code_paste"; message: string };

export function validateUserInput(line: string): InputValidationResult {
  if (line.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      reason: "too_long",
      message: `Input is ${line.length} characters; max ${MAX_INPUT_CHARS}. Break it up or summarize.`,
    };
  }

  if (looksLikeCodePaste(line)) {
    return { ok: false, reason: "code_paste", message: REJECTION_MESSAGE };
  }

  return { ok: true };
}

function looksLikeCodePaste(line: string): boolean {
  const lines = line.split("\n");

  // Heuristic A: > 5 lines AND (heavy indenting OR heavy code punctuation).
  if (lines.length > 5) {
    const indentedShare =
      lines.filter((l) => /^[ \t]/.test(l)).length / lines.length;
    const punctShare = countCodePunct(line) / Math.max(line.length, 1);
    if (indentedShare > 0.2 || punctShare > 0.05) return true;
  }

  // Heuristic B: long input with multiple fenced code blocks.
  if (line.length > 1500) {
    const fenceCount = (line.match(/```/g) ?? []).length;
    if (fenceCount > 3) return true;
  }

  return false;
}

function countCodePunct(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{" || c === "}" || c === ";" || c === "(" || c === ")" || c === "=") {
      n++;
    }
  }
  return n;
}
