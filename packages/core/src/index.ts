export type { EditError, EditResult, SearchReplaceEdit } from "./edit.js";
export { planAndApplyEdits } from "./edit.js";
export type {
  FileRepository,
  SearchResult,
  SearchScope,
} from "./file-repository.js";
export {
  FileNotFoundError,
  InvalidPathError,
  validateFilePath,
} from "./file-repository.js";
export {
  InMemoryFileRepository,
  type InMemoryFileRepositoryOptions,
} from "./in-memory-file-repository.js";
export {
  LocalFileRepository,
  type LocalFileRepositoryOptions,
} from "./local-file-repository.js";
export {
  appendHistoryEntry,
  buildHistoryEntry,
  historyFilePath,
  HISTORY_DIR,
  HISTORY_FILE,
  type ChangeActor,
  type HistoryEntry,
  type BuildHistoryInput,
} from "./history-log.js";
export {
  buildTools,
  TASK_FILE_REMINDER,
  type BuildToolsOptions,
  type EditFileError,
  type EditFileResult,
  type QuickRepliesResult,
  type ReadFileResult,
  type WriteFileResult,
} from "./tools.js";
export { QUICK_REPLY_LABEL_MAX_LENGTH } from "./quick-replies.js";
export * from "./layout/index.js";
export {
  canRead,
  canWrite,
  isCanonicalTaskFile,
  isInActiveScope,
  isInArchiveScope,
} from "./access-policy.js";
export {
  ensureGtdTaskFiles,
  type EnsureGtdTaskFilesResult,
} from "./vault-readiness.js";
export {
  MemoryLogger,
  NoopLogger,
  redactSensitiveHeaders,
  safeLog,
  type LogEvent,
  type LogLevel,
  type Logger,
  type MemoryLogEntry,
} from "./logging.js";
export {
  buildSystemPrompt,
  type BuildSystemPromptContext,
} from "./system-prompt.js";
export {
  findTaskOccurrences,
  type TaskOccurrenceBlock,
  type TaskOccurrenceSearchResult,
} from "./task-occurrences.js";
export {
  AUTO_REPLAN_DAYS_BACK,
  buildAutoReplanOpener,
  gatherAutoReplanContext,
  type AutoReplanContext,
} from "./auto-replan.js";
export {
  buildRequest,
  type BuildRequestInput,
  type BuildRequestResult,
} from "./request-builder.js";
export {
  pruneToolResults,
  type PruneToolResultsOptions,
  type PruneToolResultsResult,
} from "./tool-result-pruning.js";
export {
  Session,
  type MessageOrigin,
  type SessionEntry,
  type SessionStore,
} from "./sessions.js";
export { FsSessionStore, type FsSessionStoreOps } from "./fs-session-store.js";
export {
  MemoryTurnLogger,
  NoopTurnLogger,
  type TurnLogRecord,
  type TurnLogger,
} from "./turn-log.js";
export { formatToday } from "./search.js";
export {
  runTurn,
  type OpenerTurnInput,
  type ProviderOptions,
  type TurnEngineDeps,
  type TurnInput,
  type UserTurnInput,
} from "./turn-engine.js";
export type { TurnErrorPhase, TurnResult, TurnSink } from "./turn-sink.js";
export { writeTurnArtifact, type TurnLogContext } from "./turn-artifact.js";
export {
  MAX_INPUT_CHARS,
  REJECTION_MESSAGE,
  validateUserInput,
  type InputValidationResult,
} from "./input-validation.js";
