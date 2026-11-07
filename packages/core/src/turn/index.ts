// Browser-safe entry (`@gtd/core/turn`): the turn vocabulary without any
// Node dependency, so `@gtd/api` and the web app share the engine's own
// types. The `TurnSink` observer stays in the barrel: only the engine and
// its hosts observe a turn. Nothing in this folder may import from outside
// it; `tsconfig.turn.json` enforces Node-freedom. See docs/development.md.
export {
  QUICK_REPLIES_TOOL_NAME,
  TURN_KINDS,
  VAULT_TOOL_NAMES,
  type QuickRepliesResult,
  type ToolName,
  type TurnErrorPhase,
  type TurnKind,
  type TurnOutcome,
  type TurnResult,
  type VaultToolName,
} from "./vocabulary.js";
