import type { ModelMessage } from "ai";
import { buildSystemPrompt } from "./system-prompt.js";

export interface BuildRequestInput {
  today: Date;
  /**
   * Optional free-form profile / preferences string about the user. Appended
   * to the (stable) system prompt — keep stable across turns to stay inside
   * the cache window. Pass `undefined` if not used.
   */
  profile?: string;
  /**
   * Conversation history so far. Task 4 passes this through verbatim;
   * Task 4.1 will insert `pruneToolResults(messages)` at the marked seam
   * below without changing this signature.
   */
  messages: ModelMessage[];
  userMessage: string;
}

export interface BuildRequestResult {
  system: string;
  messages: ModelMessage[];
}

/**
 * Assemble the per-turn request payload for `streamText`.
 *
 * - `system` is the cacheable block: R1–R13 + tool conventions + (optional)
 *   profile. It stays byte-identical across turns within a session, so a
 *   single ephemeral cache marker on the streamText call covers it plus the
 *   tool definitions.
 * - No active-state pre-load. Per the architecture amendment 2026-05-19
 *   (see `docs/specs/architecture.md` → "Request Architecture: How Each
 *   Message Is Built" and the Task 4 task-log Amendment), vault files are
 *   read on demand via `read_file`. Task 4.1's tool-result pruning keeps
 *   recent reads alive as the LLM's working snapshot and stubs old or
 *   drift-invalidated ones. Pure pass-through of `messages` until that lands.
 */
export function buildRequest(input: BuildRequestInput): BuildRequestResult {
  const { today, profile, messages, userMessage } = input;

  const systemParts: string[] = [buildSystemPrompt({ today })];
  if (profile && profile.trim().length > 0) {
    systemParts.push("", "## User profile", profile.trim());
  }
  const system = systemParts.join("\n");

  // [Task 4.1 seam] Tool-result pruning will run on `messages` here before
  // the user message is appended. Task 4 keeps this a pure pass-through —
  // the `messages: ModelMessage[]` contract is what 4.1 extends, not modifies.
  const prunedMessages = messages;

  return {
    system,
    messages: [...prunedMessages, { role: "user", content: userMessage }],
  };
}
