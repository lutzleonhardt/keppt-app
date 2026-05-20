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

// Task 5 redesign (2026-05-20): daily/ is unified. Past, today, and future
// `daily/YYYY-MM-DD.md` are all readable AND writable through one gate; the
// "past dailies default read-only" stance lives in the system prompt (R6),
// not here. The `today` parameter stays in the signatures because other
// layout entries may still depend on it in the future, but for `daily/*` it
// is unused. `isInArchiveScope` keeps its regex shape for future non-daily
// archive subpaths; archive/daily/* legacy files (from pre-redesign vaults)
// are no longer readable through the LLM gate — read_file on them returns
// out_of_scope. Repo-level deletion is NOT performed; the files just stop
// being routinely surfaced.

// LLM-facing read allowlist: the 5 GTD task files and any date-formatted
// `daily/YYYY-MM-DD.md`. Throws InvalidPathError on traversal/.keppt/etc so
// the tools layer can distinguish "invalid_path" from "out_of_scope".
export function canRead(filePath: string, _today: string): boolean {
  validateFilePath(filePath);
  if (TASK_FILES.has(filePath)) return true;
  if (DAILY_RE.test(filePath)) return true;
  return false;
}

// LLM-facing write allowlist: the 5 GTD task files and any date-formatted
// `daily/YYYY-MM-DD.md`. Past-daily editability is constrained at the prompt
// level (R6 correction carve-out), not at the gate — except that full
// rewrites via `write_file` are additionally blocked at the tool layer for
// past dailies (see `isPastDaily`); `edit_file` remains allowed so narrow
// corrections still go through.
export function canWrite(filePath: string, _today: string): boolean {
  validateFilePath(filePath);
  if (TASK_FILES.has(filePath)) return true;
  if (DAILY_RE.test(filePath)) return true;
  return false;
}

// Past-daily predicate for the `write_file` carve-out. Returns true only for
// date-formatted dailies strictly before `today`. The tool layer uses this
// to deny full rewrites of historical plans (R6); `edit_file` does not
// consult it, so narrow inline corrections still work.
export function isPastDaily(filePath: string, today: string): boolean {
  if (!DAILY_RE.test(filePath)) return false;
  return filePath < `daily/${today}.md`;
}

// Search-scope predicates mirror the canRead allowlist exactly. Search is a
// read surface (snippets are returned to the LLM), so it must not surface
// content from any path read_file would deny — otherwise the gate is an
// exfiltration channel via search_files. The only divergence from canRead
// is shape: these are pure predicates with no validateFilePath side effect,
// because search iterates over already-listed paths.
export function isInActiveScope(filePath: string, _today: string): boolean {
  if (TASK_FILES.has(filePath)) return true;
  if (DAILY_RE.test(filePath)) return true;
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
