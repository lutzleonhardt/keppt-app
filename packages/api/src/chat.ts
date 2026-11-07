// Wire contract of the chat surface: `POST /api/chat`, `POST /api/chat/cancel`
// and the session event stream `GET /api/chat/stream`. The event log is one
// per user-day, not per turn: `seq` (the SSE `id:`) is a single monotonic
// axis across turns, so a client remembers only the last id it saw.
//
// The turn vocabulary (`TurnKind`, `TurnOutcome`, `TurnErrorPhase`,
// `VaultToolName`) is the engine's own, re-exported from the browser-safe
// `@gtd/core/turn` entry — the wire and the engine cannot disagree.

import type {
  TurnErrorPhase,
  TurnKind,
  TurnOutcome,
  VaultToolName,
} from "@gtd/core/turn";
import type { ApiErrorPayload } from "./errors.js";

export {
  TURN_KINDS,
  VAULT_TOOL_NAMES,
  type TurnErrorPhase,
  type TurnKind,
  type TurnOutcome,
  type VaultToolName,
} from "@gtd/core/turn";

/** Request body of `POST /api/chat`. */
export interface ChatRequestBody {
  readonly message: string;
}

/** 202 body of `POST /api/chat`: the turn runs on, detached from this request. */
export interface ChatAcceptedBody {
  readonly turnId: string;
}

export interface TurnStartEvent {
  readonly type: "turn-start";
  readonly turnId: string;
  readonly kind: TurnKind;
  /** The user's text for `kind: "user"`, so every client can render it; opener turns carry none. */
  readonly message?: string;
}

export interface TextDeltaEvent {
  readonly type: "text-delta";
  readonly turnId: string;
  readonly text: string;
}

export interface ToolStartEvent {
  readonly type: "tool-start";
  readonly turnId: string;
  readonly toolCallId: string;
  readonly tool: VaultToolName;
  /** Primary argument: file path, search query, list prefix, or the joined candidates. */
  readonly target: string;
  /** Model-authored `change_summary`; only `edit_file` / `write_file` carry it. */
  readonly summary?: string;
}

/** Settles the row of the same `toolCallId`; also emitted when the tool errored. */
export interface ToolEndEvent {
  readonly type: "tool-end";
  readonly turnId: string;
  readonly toolCallId: string;
}

export interface QuickRepliesEvent {
  readonly type: "quick-replies";
  readonly turnId: string;
  readonly question: string;
  readonly options: readonly string[];
}

/** Last event of every turn. `phase` is set on `outcome: "error"` when the engine reported one. */
export interface TurnEndEvent {
  readonly type: "turn-end";
  readonly turnId: string;
  readonly outcome: TurnOutcome;
  readonly phase?: TurnErrorPhase;
}

export interface TurnFailedPayload extends ApiErrorPayload {
  readonly code: "turn_failed";
}

/** Precedes `turn-end` on a failed turn; `requestId` is that of the `POST /api/chat` which started it. */
export interface TurnErrorEvent {
  readonly type: "error";
  readonly turnId: string;
  readonly error: TurnFailedPayload;
}

/** Everything the event log holds. On the wire `event:` is `type` and `data:` the whole object. */
export type SessionEvent =
  | TurnStartEvent
  | TextDeltaEvent
  | ToolStartEvent
  | ToolEndEvent
  | QuickRepliesEvent
  | TurnEndEvent
  | TurnErrorEvent;

/**
 * Control event without an id: the cursor could not be served. The client
 * reloads the session and attaches again.
 */
export interface ResyncEvent {
  readonly type: "resync";
}
