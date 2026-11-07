// The closed literal sets of the turn pipeline — kinds, tool names, outcomes
// — shared by the engine, the session file, the wire contract (`@gtd/api`)
// and every client. One declaration each, so no two packages can disagree.

/**
 * What started a turn. Persisted per session entry as `origin` and carried
 * by the engine's `TurnInput["kind"]`: `opener` is the Auto-Replan opener,
 * whose user-role messages were never typed and whose tool calls were
 * fabricated.
 */
export const TURN_KINDS = ["user", "opener"] as const;

export type TurnKind = (typeof TURN_KINDS)[number];

/**
 * The tools that act on the vault and render as tool rows. The seventh tool
 * of `buildTools`, `suggest_quick_replies`, is protocol, not a row: its
 * validated result arrives as quick replies.
 */
export const VAULT_TOOL_NAMES = [
  "read_file",
  "list_files",
  "search_files",
  "find_task_occurrences",
  "edit_file",
  "write_file",
] as const;

export type VaultToolName = (typeof VAULT_TOOL_NAMES)[number];

export function isVaultToolName(name: string): name is VaultToolName {
  return VAULT_TOOL_NAMES.some((tool) => tool === name);
}

/** The protocol tool: its validated result arrives as quick replies, never as a tool row. */
export const QUICK_REPLIES_TOOL_NAME = "suggest_quick_replies";

/** Every tool `buildTools` hands to the model: the vault tools plus the protocol tool. */
export type ToolName = VaultToolName | typeof QUICK_REPLIES_TOOL_NAME;

/** Validated result of `suggest_quick_replies`: the question and the normalized labels. */
export type QuickRepliesResult = { question: string; options: string[] };

export type TurnErrorPhase =
  | "session_save_phase1"
  | "stream"
  | "session_save_phase2";

/**
 * How a turn ended. `runTurn` resolves with it and hands the same object to
 * `TurnSink.turnEnd`, so the caller and the observers see one truth.
 * `aborted` means the abort signal fired mid-stream: the user message stays
 * persisted, no response messages were appended.
 */
export type TurnResult =
  | { outcome: "ok" }
  | { outcome: "aborted" }
  | { outcome: "error"; phase: TurnErrorPhase; err: unknown };

/** Derived from `TurnResult` so the wire can never name an outcome the engine does not produce. */
export type TurnOutcome = TurnResult["outcome"];
