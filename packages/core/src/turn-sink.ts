import type { QuickRepliesResult, TurnResult } from "./turn/vocabulary.js";

/**
 * Observer of one running turn. Every method is synchronous and never
 * awaited: the engine runs to completion whether or not anyone listens,
 * which is what lets a server execute turns detached from client
 * connections. `suggest_quick_replies` never appears as a tool event — its
 * validated result arrives through `quickReplies`.
 */
export interface TurnSink {
  assistantText(text: string): void;
  toolStart(toolCallId: string, name: string, input: unknown): void;
  /** Carries no output on purpose: tool results stay in the model context. */
  toolEnd(toolCallId: string, name: string): void;
  /** Settles the same `toolCallId` as a `toolStart`; the model recovers in-loop. */
  toolError(toolCallId: string, name: string, error: unknown): void;
  quickReplies(payload: QuickRepliesResult): void;
  /** Exactly once per `runTurn`, always last. */
  turnEnd(result: TurnResult): void;
}
