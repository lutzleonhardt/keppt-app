import type {
  ModelMessage,
  SystemModelMessage,
  UserModelMessage,
} from "ai";
import { buildSystemPrompt } from "./system-prompt.js";
import { pruneToolResults } from "./tool-result-pruning.js";

// Anthropic prompt-cache marker. Per the AI SDK Anthropic provider docs
// (ai-sdk.dev/providers/ai-sdk-providers/anthropic), cacheControl belongs
// on a message's `providerOptions`, not on the top-level streamText call —
// the latter is undocumented and was silently failing in session 2026-05-20
// (cacheRead collapsed to 0 from turn 9 onward; see "Cache-stability
// invariant" in docs/specs/architecture.md). Two breakpoints fit our shape:
//   - one on the system message: the system prompt + tool definitions are
//     byte-identical across the entire session, so this hit lasts as long
//     as Anthropic's ephemeral TTL allows.
//   - one on the trailing user message: every turn re-marks here so the
//     prefix up to this turn is written into the cache for the next turn
//     to consume.
// For non-Anthropic providers (e.g. DeepSeek) the `anthropic`-scoped
// providerOptions are silently ignored — these markers are no-ops there,
// not errors. DeepSeek does its own automatic prefix caching server-side.
const CACHE_MARKER: { anthropic: { cacheControl: { type: "ephemeral" } } } = {
  anthropic: { cacheControl: { type: "ephemeral" } },
};

// K=10 (raised from 5) — the K-sliding window has a direct cost on Anthropic
// prompt-cache stability: each time a tool-result rolls out of the window the
// pruner replaces its full content with a short stub, mutating a mid-prefix
// byte and forcing a cache rewrite. A larger window means fewer rolls per
// session and longer stretches of byte-identical prefix between turns.
// Session 2026-05-20 (11 turns, ~5 tool messages per turn after turn 5)
// showed K=5 causing a roll-out almost every turn; K=10 should reduce that
// to once every ~2 turns at the same activity level. Token-budget cost of
// each extra slot is bounded by the per-result content (typically 100–500
// tk for read/list results, 30–80 tk for edit/write acks).
const PRUNE_K = 10;

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
  /**
   * Cached system block. Returned as a `SystemModelMessage` (not a raw
   * string) so the Anthropic cache-marker on its `providerOptions` actually
   * reaches the API. Pass straight to `streamText({ system: result.system })`.
   * `streamText` accepts `string | SystemModelMessage | SystemModelMessage[]`
   * here (see `ai@7` `streamText` typedef).
   */
  system: SystemModelMessage;
  messages: ModelMessage[];
}

/**
 * Assemble the per-turn request payload for `streamText`.
 *
 * - `system` is the cacheable block: R1–R17 + tool conventions + (optional)
 *   profile. It stays byte-identical across turns within a session.
 *   Returned as a `SystemModelMessage` (NOT a plain string) so the
 *   Anthropic cache-marker on its `providerOptions` actually rides along to
 *   the API. Pass to `streamText({ system: result.system })` — `streamText`
 *   accepts the object form here.
 * - `messages` is the pruned conversation history. It does NOT contain a
 *   role:"system" message — the AI SDK rejects those with "System messages
 *   are not allowed in the prompt or messages fields" (default
 *   `allowMessagesInSystemRole: false`). The system block lives on the
 *   `system` parameter, the messages list stays user/assistant/tool only.
 *   The trailing user message carries the second cache marker (the
 *   request-anchor breakpoint).
 *   The K=10 + per-file version-drift contract still applies (architecture
 *   amendment 2026-05-19: no active-state pre-load). Stub idempotency in
 *   the pruner (added after session 2026-05-20 cache diagnosis) ensures a
 *   once-stubbed result's text is not rewritten on later turns, keeping
 *   the prefix between the two cache markers stable for Anthropic.
 *
 * Pure synchronous transform — closures are injected by the caller, no I/O.
 */
export function buildRequest(input: BuildRequestInput): BuildRequestResult {
  const { today, profile, messages, fileVersionAt, messageCreatedAt } = input;

  const systemParts: string[] = [buildSystemPrompt({ today })];
  if (profile && profile.trim().length > 0) {
    systemParts.push("", "## User profile", profile.trim());
  }
  const systemText = systemParts.join("\n");

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

  const system: SystemModelMessage = {
    role: "system",
    content: systemText,
    providerOptions: CACHE_MARKER,
  };

  return {
    system,
    messages: attachTailingCacheMarker(withNotes),
  };
}

// Add the second cache breakpoint to the trailing user message. The
// system-message marker is the first; this is the second of Anthropic's
// up-to-4 breakpoints. Any further breakpoints (e.g. a marker at the
// boundary between frozen-stub history and the K-window) would slot in
// between — left out for now to keep blast-radius small.
function attachTailingCacheMarker(messages: ModelMessage[]): ModelMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== "user") continue;
    const merged: UserModelMessage = {
      ...msg,
      providerOptions: {
        ...(msg.providerOptions ?? {}),
        ...CACHE_MARKER,
      },
    };
    const out = messages.slice();
    out[i] = merged;
    return out;
  }
  // No user message — Phase-1 two-phase save guarantees one exists, so
  // this only fires if a future caller violates the precondition. Fall
  // through without a tail marker rather than throw; the system marker
  // still gives partial caching.
  return messages;
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
