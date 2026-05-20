// First-run task-file initialization. The five canonical GTD task files
// (`tasks/*.md`) need to exist for the LLM to read+edit them on demand —
// otherwise the very first turn paying attention to Focus or Next Actions
// produces `edit_file` failures against not-yet-existing files and the
// model has to fall back to `write_file`, padding the turn with avoidable
// retries.
//
// Task 5 redesign (2026-05-20): scope is once-per-CLI-startup, not
// once-per-turn. Original Task 5.5 had a richer `ensureVaultReady` running
// every turn (day rollover + readiness check); the daily-archive split
// went away in the redesign, leaving only this idempotent init step.
// Putting it at CLI startup (not in `handleTurn`) makes the trigger
// explicit and saves one repo call per turn forever.
//
// Caller contract: pass a repo handle whose `changedBy` is set to "system"
// so the per-file history reflects "created on first run by the CLI", not
// "by the LLM on a turn". The helper itself is repo-agnostic — it doesn't
// know about `changedBy` and won't second-guess what the caller built.

import { FileNotFoundError, type FileRepository } from "./file-repository.js";

export const GTD_TASK_FILES: readonly string[] = [
  "tasks/inbox.md",
  "tasks/focus.md",
  "tasks/next-actions.md",
  "tasks/waiting.md",
  "tasks/someday-maybe.md",
];

const FIRST_RUN_SUMMARY = "first-run task-file init";

export interface EnsureGtdTaskFilesResult {
  /** Paths newly created on this call. Empty on the idempotent second call. */
  created: string[];
}

/**
 * Create each missing `tasks/*.md` as an empty file. Existing files are
 * untouched — their content is read but not rewritten, so the per-file
 * history is undisturbed and the LLM's drafted structure stays intact.
 *
 * Idempotent: a second call on a fully-initialized vault is a complete
 * no-op (no new history entries, no writes).
 */
export async function ensureGtdTaskFiles(
  repo: FileRepository,
): Promise<EnsureGtdTaskFilesResult> {
  const created: string[] = [];
  for (const filePath of GTD_TASK_FILES) {
    if (await exists(repo, filePath)) continue;
    await repo.write(filePath, "", FIRST_RUN_SUMMARY);
    created.push(filePath);
  }
  return { created };
}

async function exists(repo: FileRepository, filePath: string): Promise<boolean> {
  try {
    await repo.read(filePath);
    return true;
  } catch (err) {
    if (err instanceof FileNotFoundError) return false;
    throw err;
  }
}
