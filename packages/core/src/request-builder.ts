import type { ModelMessage } from "ai";
import { buildSystemPrompt } from "./system-prompt.js";
import { pruneToolResults } from "./tool-result-pruning.js";

const PRUNE_K = 5;

export interface BuildRequestInput {
  today: Date;
  /**
   * Optional free-form profile / preferences string about the user. Appended
   * to the (stable) system prompt — keep stable across turns to stay inside
   * the cache window. Pass `undefined` if not used.
   */
  profile?: string;
  /**
   * Conversation history including the user message of the current turn.
   * The CLI persists the user message before calling `buildRequest` (Phase 1
   * of the two-phase save, see Task 4.1 plan), so this array already ends
   * with the new user turn — `buildRequest` does not append anything.
   *
   * Accepted as `readonly` so callers can pass `Session.messages` directly
   * without a cast; the pruner returns a fresh mutable array.
   */
  messages: readonly ModelMessage[];
  /**
   * Returns the current version of the file at `filePath` (mtime in ms epoch
   * locally, `files.updated_at` on the backend). Used by the pruner to decide
   * which tool-results inside the K-window are drift-invalidated. Constructed
   * by the caller.
   */
  fileVersionAt: (filePath: string) => number | undefined;
  /**
   * Returns the ms-epoch timestamp at which `msg` was appended to the session
   * history. Used by the pruner to compare against `fileVersionAt(filePath)`.
   */
  messageCreatedAt: (msg: ModelMessage) => number;
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
 * - `messages` is the pruned conversation history. The K=5 + per-file
 *   version-drift contract is the LLM's only working snapshot of the vault
 *   (architecture amendment 2026-05-19: no active-state pre-load).
 *
 * Pure synchronous transform — closures are injected by the caller, no I/O.
 */
export function buildRequest(input: BuildRequestInput): BuildRequestResult {
  const { today, profile, messages, fileVersionAt, messageCreatedAt } = input;

  const systemParts: string[] = [buildSystemPrompt({ today })];
  if (profile && profile.trim().length > 0) {
    systemParts.push("", "## User profile", profile.trim());
  }
  const system = systemParts.join("\n");

  const prunedMessages = pruneToolResults(messages, {
    k: PRUNE_K,
    fileVersionAt,
    messageCreatedAt,
  });

  return {
    system,
    messages: prunedMessages,
  };
}
