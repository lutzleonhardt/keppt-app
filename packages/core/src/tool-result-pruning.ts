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
): ModelMessage[] {
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

  return messages.map((msg, idx) => {
    if (msg.role !== "tool") return msg;

    const isAgedOut = idx < ageCutoffIndex;
    const createdAt = isAgedOut ? 0 : messageCreatedAt(msg);

    let mutated = false;
    const nextContent = msg.content.map((part) => {
      if (part.type !== "tool-result") return part;
      if (!shouldStub(part, isAgedOut, createdAt, filePathByCallId, fileVersionAt)) {
        return part;
      }
      mutated = true;
      return stubPart(part);
    });

    if (!mutated) return msg;
    return { ...msg, content: nextContent };
  });
}

function shouldStub(
  part: ToolResultPart,
  isAgedOut: boolean,
  createdAt: number,
  filePathByCallId: Map<string, string | undefined>,
  fileVersionAt: (filePath: string) => number | undefined,
): boolean {
  // Errors carry information the LLM needs (e.g. match-failure currentContent
  // payloads). They are never stubbed.
  if (part.output.type === "error-text" || part.output.type === "error-json") {
    return false;
  }
  if (isAgedOut) return true;
  const filePath = filePathByCallId.get(part.toolCallId);
  if (filePath === undefined) return false; // list_files / search_files / unknown
  const version = fileVersionAt(filePath);
  if (version === undefined) return false; // file missing or stat failed
  return version > createdAt;
}

function stubPart(part: ToolResultPart): ToolResultPart {
  return {
    ...part,
    output: {
      type: "text",
      value: `[Previous ${part.toolName} result — superseded by current state; re-read if needed]`,
    },
  };
}

function extractFilePath(part: ToolCallPart): string | undefined {
  const input = part.input;
  if (input === null || typeof input !== "object") return undefined;
  const value = (input as Record<string, unknown>).file_path;
  return typeof value === "string" ? value : undefined;
}
