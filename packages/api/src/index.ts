// The HTTP wire contract shared by `apps/server` and `apps/web`. Browser-safe
// by rule: nothing here imports Node or the main `@gtd/core` barrel, only
// the browser-safe entries `@gtd/core/layout` and `@gtd/core/turn`.
// `tsconfig.json` (`types: []`) rejects a direct `node:*` import; the barrel
// rule is kept by review (a type import reaches only `.d.ts` files) and
// `ng build` fails if broken. Boundaries and rationale: docs/development.md.
export {
  API_ERROR_CODES,
  apiErrorOf,
  type ApiErrorCode,
  type ApiErrorPayload,
  type ErrorBody,
} from "./errors.js";
export type { FileContentBody } from "./files.js";
export type { DailyNoteRef } from "./daily-notes.js";
export {
  TURN_KINDS,
  VAULT_TOOL_NAMES,
  type ChatAcceptedBody,
  type ChatRequestBody,
  type QuickRepliesEvent,
  type ResyncEvent,
  type SessionEvent,
  type TextDeltaEvent,
  type ToolEndEvent,
  type ToolStartEvent,
  type TurnEndEvent,
  type TurnErrorEvent,
  type TurnErrorPhase,
  type TurnFailedPayload,
  type TurnKind,
  type TurnOutcome,
  type TurnStartEvent,
  type VaultToolName,
} from "./chat.js";
