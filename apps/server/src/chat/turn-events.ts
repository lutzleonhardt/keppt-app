// Bridges the core `TurnSink` to the event log: every engine callback
// becomes one wire event of the running turn. The tool-row fields
// (`target`, `summary`) come from core's `describeToolCall`, the same rule
// the CLI status label uses, so clients render tool rows from structure,
// never from server-authored text.

import type { ToolStartEvent } from "@gtd/api";
import {
  describeToolCall,
  isVaultToolName,
  type Logger,
  type TurnResult,
  type TurnSink,
} from "@gtd/core";
import type { EventLog } from "./event-log.js";

export interface TurnEventSinkOptions {
  log: EventLog;
  turnId: string;
  /** Of the `POST /api/chat` that started the turn; quoted by the `error` event. */
  requestId: string;
  logger: Logger;
  /** Runs after the turn's `turn-end` event is appended. */
  onTurnEnd: (result: TurnResult) => void;
}

export function createTurnEventSink({
  log,
  turnId,
  requestId,
  logger,
  onTurnEnd,
}: TurnEventSinkOptions): TurnSink {
  const settle = (toolCallId: string, name: string): void => {
    if (isVaultToolName(name))
      log.append({ type: "tool-end", turnId, toolCallId });
  };
  return {
    assistantText: (text) => {
      log.append({ type: "text-delta", turnId, text });
    },
    toolStart: (toolCallId, name, input) => {
      const event = toolStartEvent(turnId, toolCallId, name, input);
      if (event) log.append(event);
    },
    toolEnd: settle,
    toolError: settle,
    quickReplies: ({ question, options }) => {
      log.append({ type: "quick-replies", turnId, question, options });
    },
    turnEnd: (result) => {
      if (result.outcome === "error") {
        // The cause stays in the server log; clients get a generic message
        // and the request id to quote.
        logger.error({
          code: "chat.turn_failed",
          message: "Chat turn failed",
          phase: result.phase,
          err: result.err,
          meta: { turnId },
        });
        log.append({
          type: "error",
          turnId,
          error: { code: "turn_failed", message: "The turn failed", requestId },
        });
        log.append({
          type: "turn-end",
          turnId,
          outcome: "error",
          phase: result.phase,
        });
      } else {
        log.append({ type: "turn-end", turnId, outcome: result.outcome });
      }
      onTurnEnd(result);
    },
  };
}

/** `undefined` for a name outside the tool-row vocabulary (the engine already filters `suggest_quick_replies`). */
export function toolStartEvent(
  turnId: string,
  toolCallId: string,
  name: string,
  input: unknown,
): ToolStartEvent | undefined {
  if (!isVaultToolName(name)) return undefined;
  const { target, summary } = describeToolCall(name, input);
  const event: ToolStartEvent = {
    type: "tool-start",
    turnId,
    toolCallId,
    tool: name,
    target,
  };
  return summary === undefined ? event : { ...event, summary };
}
