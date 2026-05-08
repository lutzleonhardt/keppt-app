export type {
  EditError,
  EditResult,
  SearchReplaceEdit,
} from "./edit.js";
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
  type BuildToolsOptions,
  type EditFileError,
  type EditFileResult,
  type ReadFileResult,
  type WriteFileResult,
} from "./tools.js";
export {
  canRead,
  canWrite,
  isInActiveScope,
  isInArchiveScope,
} from "./gtd-layout.js";
