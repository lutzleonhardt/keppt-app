import { validateFilePath } from "./file-repository.js";

const TASK_FILES: ReadonlySet<string> = new Set([
  "tasks/inbox.md",
  "tasks/focus.md",
  "tasks/next-actions.md",
  "tasks/waiting.md",
  "tasks/someday-maybe.md",
]);

const DAILY_RE = /^daily\/\d{4}-\d{2}-\d{2}\.md$/;
const ARCHIVE_DAILY_RE = /^archive\/daily\/\d{4}-\d{2}-\d{2}\.md$/;

// LLM-facing read allowlist: the 5 GTD task files, today's daily note, and any
// archived daily note. Throws InvalidPathError on traversal/.keppt/etc so the
// tools layer can distinguish "invalid_path" from "out_of_scope".
export function canRead(filePath: string, today: string): boolean {
  validateFilePath(filePath);
  if (TASK_FILES.has(filePath)) return true;
  if (filePath === `daily/${today}.md`) return true;
  if (DAILY_RE.test(filePath)) return false;
  if (ARCHIVE_DAILY_RE.test(filePath)) return true;
  return false;
}

// LLM-facing write allowlist: the 5 GTD task files and today's daily note.
// Archive is system-managed (day-rollover) and intentionally excluded.
export function canWrite(filePath: string, today: string): boolean {
  validateFilePath(filePath);
  if (TASK_FILES.has(filePath)) return true;
  if (filePath === `daily/${today}.md`) return true;
  return false;
}

// Search-scope predicates mirror the canRead allowlist exactly. Search is a
// read surface (snippets are returned to the LLM), so it must not surface
// content from any path read_file would deny — otherwise the gate is an
// exfiltration channel via search_files. The only divergence from canRead
// is shape: these are pure predicates with no validateFilePath side effect,
// because search iterates over already-listed paths.
export function isInActiveScope(filePath: string, today: string): boolean {
  if (TASK_FILES.has(filePath)) return true;
  if (filePath === `daily/${today}.md`) return true;
  return false;
}

export function isInArchiveScope(filePath: string): boolean {
  return ARCHIVE_DAILY_RE.test(filePath);
}

// Canonical task-file predicate. Shape mirrors canWrite's decision (five task
// files + today's daily note) but without throwing on invalid paths — this
// helper runs on already-validated paths from the tool layer and must not
// alter the tool's error surface. Single source of truth so writeFileTool
// and editFileTool cannot drift from each other or from canWrite.
export function isCanonicalTaskFile(filePath: string, today: string): boolean {
  if (TASK_FILES.has(filePath)) return true;
  if (filePath === `daily/${today}.md`) return true;
  return false;
}
