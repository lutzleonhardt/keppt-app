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
