import type { ModelMessage, UserModelMessage } from "ai";
import { buildSystemPrompt } from "./system-prompt.js";
import { pruneToolResults } from "./tool-result-pruning.js";

const PRUNE_K = 5;

/**
 * A piece of out-of-band context attached to the current user turn as a
 * `<context-note>` block on the last user message. Generic so future
 * sources can flow through the same channel (session-start hint, day
 * rollover mid-session, budget warning, …) — today only `stale-files`
 * is produced, by the pruner.
 */
type ContextNote = { kind: "stale-files"; files: string[] };

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

  const pruned = pruneToolResults(messages, {
    k: PRUNE_K,
    fileVersionAt,
    messageCreatedAt,
  });

  const notes: ContextNote[] = [];
  if (pruned.staleFilesInWindow.length > 0) {
    notes.push({ kind: "stale-files", files: pruned.staleFilesInWindow });
  }

  const withNotes =
    notes.length > 0
      ? attachContextNotes(pruned.messages, notes)
      : pruned.messages;

  return {
    system,
    messages: withNotes,
  };
}

// Render the active context notes as a single `<context-note>` block and
// append it to the trailing user message's text. Anthropic disallows two
// consecutive user messages, and the trailing user message is the one
// the model is about to answer — appending here puts the note in the
// model's recency window without changing message roles or breaking the
// alternation contract. Phase-1 of the CLI's two-phase save guarantees
// `messages.at(-1)?.role === "user"` whenever `buildRequest` runs.
function attachContextNotes(
  messages: readonly ModelMessage[],
  notes: readonly ContextNote[],
): ModelMessage[] {
  const block = renderNotes(notes);
  const out = messages.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const msg = out[i]!;
    if (msg.role !== "user") continue;
    out[i] = withAppendedText(msg, block);
    return out;
  }
  // No user message in history — extremely defensive; in practice the CLI's
  // two-phase save guarantees a trailing user turn. Fall through to a new
  // synthesized user message so the note never silently vanishes.
  out.push({ role: "user", content: block });
  return out;
}

function withAppendedText(
  msg: UserModelMessage,
  appended: string,
): UserModelMessage {
  if (typeof msg.content === "string") {
    return { ...msg, content: `${msg.content}\n\n${appended}` };
  }
  // Array content: append a fresh text part. We do not splice into an
  // existing text part because UserContent parts can be of mixed types
  // (text/image/file) and we want the note to be the last thing the
  // model sees regardless of ordering.
  return {
    ...msg,
    content: [...msg.content, { type: "text", text: appended }],
  };
}

function renderNotes(notes: readonly ContextNote[]): string {
  const lines: string[] = ["<context-note>"];
  for (const note of notes) {
    if (note.kind === "stale-files") {
      lines.push(
        "Files modified since you last read them this session:",
        ...note.files.map((f) => `- ${f}`),
        "",
        "If the user is asking about their current contents, call read_file again before answering. Do not paraphrase your own earlier summaries of these files in this conversation — those summaries reflect a stale read.",
      );
    }
  }
  lines.push("</context-note>");
  return lines.join("\n");
}
