import type {
  ModelMessage,
  ToolCallPart,
  ToolResultPart,
} from "ai";

export interface PruneToolResultsOptions {
  /**
   * Age cap. A tool message that sits before the last `k` tool-role messages
   * has all its tool-result parts stubbed unconditionally. K=5 is the MVP
   * value (`docs/specs/architecture.md` → "Context Management: Tool-Result
   * Pruning").
   */
  k: number;
  /**
   * Returns the current version of the file at `filePath` (mtime in ms epoch
   * for local repos, `files.updated_at` for the Supabase repo). `undefined`
   * means "not applicable / unknown" — the per-part drift check then falls
   * back to the K-only rule.
   */
  fileVersionAt: (filePath: string) => number | undefined;
  /**
   * Returns the ms-epoch timestamp at which `msg` was appended to the session
   * history. The pruner asks for this only on tool-role messages within the
   * K-window, where it is compared against `fileVersionAt(file_path)`.
   */
  messageCreatedAt: (msg: ModelMessage) => number;
}

export interface PruneToolResultsResult {
  /** The conversation with stale or aged-out tool-results stubbed. */
  messages: ModelMessage[];
  /**
   * File paths whose tool-results were stubbed due to drift inside the
   * K-window — i.e. files the LLM still expects to "remember" but whose
   * content has changed since. The caller turns these into a
   * `<context-note>` reminding the LLM to re-read and not paraphrase its
   * own earlier summaries (see Task 4.2 addendum).
   *
   * Age-stubbed tool-results are NOT included here: K-aged context is
   * gone from the LLM's view anyway, and there is no meaningful
   * "the user just asked about this file" affordance to surface.
   *
   * Paths are deduped and appear in the order their tool-result first
   * appeared in the history.
   */
  staleFilesInWindow: string[];
}

/**
 * Stub aged-out or drift-invalidated tool results in a conversation history.
 *
 * A tool-result part is stubbed (its `output` replaced with a "result
 * superseded" marker) when either condition holds:
 *
 *   1. Age — its containing tool message sits before the last `k` tool-role
 *      messages.
 *   2. Drift — it references a single file (joined via `toolCallId` against
 *      the previous assistant `tool-call`'s `input.file_path`) and the file's
 *      current version is newer than the tool message's createdAt.
 *
 * `tool-result` parts whose `output.type` is `error-text` or `error-json` are
 * never stubbed — an error tells the LLM something it should not forget
 * (e.g. that an `edit_file` match-failure already returned `currentContent`).
 *
 * `user` and `assistant` messages — including assistant messages with
 * `tool-call` parts — are returned as-is.
 *
 * The function is pure: it allocates new message and part objects for the
 * stubbed branches but never mutates its inputs.
 */
export function pruneToolResults(
  messages: readonly ModelMessage[],
  opts: PruneToolResultsOptions,
): PruneToolResultsResult {
  const { k, fileVersionAt, messageCreatedAt } = opts;

  // Pre-pass: index every tool-call's file_path by toolCallId. tool-call
  // parts live on assistant messages and always precede their matching
  // tool-result on a tool message. Index size is bounded by the conversation
  // length; we accept the O(messages × parts) build for the O(1) per-part
  // lookup in the main pass.
  const filePathByCallId = new Map<string, string | undefined>();
  for (const msg of messages) {
    if (msg.role !== "assistant" || typeof msg.content === "string") continue;
    for (const part of msg.content) {
      if (part.type !== "tool-call") continue;
      filePathByCallId.set(part.toolCallId, extractFilePath(part));
    }
  }

  // Determine the index of the (N - k)th tool-role message from the end; tool
  // messages with an index strictly less than this cutoff are aged-out. If
  // there are at most k tool messages, the cutoff is -1 (nothing aged-out).
  const toolMessageIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === "tool") toolMessageIndices.push(i);
  }
  const ageCutoffIndex =
    toolMessageIndices.length > k
      ? toolMessageIndices[toolMessageIndices.length - k]!
      : Number.NEGATIVE_INFINITY;

  const staleFilesInWindow: string[] = [];
  const staleSeen = new Set<string>();

  const next = messages.map((msg, idx) => {
    if (msg.role !== "tool") return msg;

    const isAgedOut = idx < ageCutoffIndex;
    const createdAt = isAgedOut ? 0 : messageCreatedAt(msg);

    let mutated = false;
    const nextContent = msg.content.map((part) => {
      if (part.type !== "tool-result") return part;
      const decision = classify(
        part,
        isAgedOut,
        createdAt,
        filePathByCallId,
        fileVersionAt,
      );
      if (decision.kind === "keep") return part;
      mutated = true;
      if (decision.kind === "drift") {
        if (!staleSeen.has(decision.filePath)) {
          staleSeen.add(decision.filePath);
          staleFilesInWindow.push(decision.filePath);
        }
        return stubDriftPart(part, decision.filePath);
      }
      return stubAgePart(part);
    });

    if (!mutated) return msg;
    return { ...msg, content: nextContent };
  });

  return { messages: next, staleFilesInWindow };
}

type StubDecision =
  | { kind: "keep" }
  | { kind: "age" }
  | { kind: "drift"; filePath: string };

function classify(
  part: ToolResultPart,
  isAgedOut: boolean,
  createdAt: number,
  filePathByCallId: Map<string, string | undefined>,
  fileVersionAt: (filePath: string) => number | undefined,
): StubDecision {
  // Errors carry information the LLM needs (e.g. match-failure currentContent
  // payloads). They are never stubbed.
  if (part.output.type === "error-text" || part.output.type === "error-json") {
    return { kind: "keep" };
  }
  if (isAgedOut) return { kind: "age" };
  // Drift only fires on read_file: that tool's result IS a snapshot of the
  // file content, which a later write can invalidate. edit_file and
  // write_file return acks; their content does not go stale, and the
  // model just performed the write — treating its own write as "drift"
  // forces a needless re-read on the next turn and pollutes the
  // context-note channel for several turns until the write-result ages
  // out of K. (Session 2026-05-19 turns 4–6 surfaced this.)
  if (part.toolName !== "read_file") return { kind: "keep" };
  const filePath = filePathByCallId.get(part.toolCallId);
  if (filePath === undefined) return { kind: "keep" };
  const version = fileVersionAt(filePath);
  if (version === undefined) return { kind: "keep" }; // file missing or stat failed
  if (version > createdAt) return { kind: "drift", filePath };
  return { kind: "keep" };
}

// Drift stub: imperative. The file has CHANGED since this read, so a
// re-read is the only correct path. Naming the file and explicitly
// disabling self-citation closes the Haiku-style failure mode where the
// model paraphrases its own earlier summary instead of re-calling the
// tool (see Task 4.2 addendum, session 2026-05-19).
function stubDriftPart(part: ToolResultPart, filePath: string): ToolResultPart {
  return {
    ...part,
    output: {
      type: "text",
      value: `[Previous ${part.toolName} result for ${filePath} — file has changed since. Call read_file before answering about its current state; do not paraphrase your own earlier summaries of this file in this conversation.]`,
    },
  };
}

// Age stub: looser. The content is gone from the window; the model
// decides whether re-fetching is worth it for the current intent.
function stubAgePart(part: ToolResultPart): ToolResultPart {
  return {
    ...part,
    output: {
      type: "text",
      value: `[Previous ${part.toolName} result — superseded by current state; re-call if needed]`,
    },
  };
}

function extractFilePath(part: ToolCallPart): string | undefined {
  const input = part.input;
  if (input === null || typeof input !== "object") return undefined;
  const value = (input as Record<string, unknown>).file_path;
  return typeof value === "string" ? value : undefined;
}
