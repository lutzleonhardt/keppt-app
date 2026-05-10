import type { EditResult, SearchReplaceEdit } from "./edit.js";

export type SearchScope = "active" | "archive" | "all";

export interface SearchResult {
  filePath: string;
  snippet: string;
  line: number;
}

export interface FileRepository {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string, changeSummary: string): Promise<void>;
  edit(
    filePath: string,
    edits: readonly SearchReplaceEdit[],
    changeSummary: string,
  ): Promise<EditResult>;
  list(prefix?: string): Promise<string[]>;
  // `today` lets callers (the LLM tool layer) impose the turn's date on
  // search-scope filtering instead of letting the repository read its own
  // clock. Required to keep search consistent with the canRead gate when a
  // session crosses UTC midnight: the prompt and gate already share one
  // `today` per turn (see `BuildToolsOptions { now }`), and search must use
  // the same value or the repo can drop the turn day's daily note before
  // the tool-layer postfilter runs. When omitted, the repo falls back to
  // its own clock — kept for non-tool callers and for backwards-compatible
  // contract tests.
  search(query: string, scope?: SearchScope, today?: string): Promise<SearchResult[]>;
}

export class FileNotFoundError extends Error {
  readonly filePath: string;
  constructor(filePath: string) {
    super(`File not found: ${filePath}`);
    this.name = "FileNotFoundError";
    this.filePath = filePath;
  }
}

export class InvalidPathError extends Error {
  readonly filePath: string;
  readonly reason: string;
  constructor(filePath: string, reason: string) {
    super(`Invalid file path '${filePath}': ${reason}`);
    this.name = "InvalidPathError";
    this.filePath = filePath;
    this.reason = reason;
  }
}

export const RESERVED_PREFIX = ".keppt";

const MAX_PATH_LENGTH = 4096;
const MAX_SEGMENT_LENGTH = 255;

const WINDOWS_DRIVE_LETTER = /^[A-Za-z]:/;
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function validateFilePath(filePath: string): void {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new InvalidPathError(String(filePath), "path must be a non-empty string");
  }
  if (filePath.includes("\0")) {
    throw new InvalidPathError(filePath, "path may not contain null bytes");
  }
  if (filePath.includes("\\")) {
    throw new InvalidPathError(filePath, "backslash is not allowed; use POSIX '/' separators");
  }
  if (filePath.startsWith("/")) {
    throw new InvalidPathError(filePath, "absolute paths are not allowed");
  }
  if (WINDOWS_DRIVE_LETTER.test(filePath)) {
    throw new InvalidPathError(filePath, "windows drive letter is not allowed");
  }
  if (filePath.length > MAX_PATH_LENGTH) {
    throw new InvalidPathError(filePath, "path exceeds maximum length");
  }
  const segments = filePath.split("/");
  for (const seg of segments) {
    if (seg === "") {
      throw new InvalidPathError(filePath, "empty path segment (leading/trailing/double slash)");
    }
    if (seg === "..") {
      throw new InvalidPathError(filePath, "parent-directory traversal is not allowed");
    }
    if (seg === ".") {
      throw new InvalidPathError(filePath, "current-directory segment is not allowed");
    }
    if (seg.length > MAX_SEGMENT_LENGTH) {
      throw new InvalidPathError(filePath, "segment exceeds maximum length");
    }
    if (seg !== seg.trim()) {
      throw new InvalidPathError(filePath, "segment has leading or trailing whitespace");
    }
    if (seg.endsWith(".")) {
      throw new InvalidPathError(filePath, "segment has a trailing dot");
    }
    const base = seg.split(".")[0]!;
    if (RESERVED_DEVICE_NAME.test(base)) {
      throw new InvalidPathError(filePath, "segment is a reserved Windows device name");
    }
  }
  if (segments[0] === RESERVED_PREFIX) {
    throw new InvalidPathError(filePath, `'${RESERVED_PREFIX}/' is reserved for internal state`);
  }
}
