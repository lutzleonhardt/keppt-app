import type { IsoLocalDate } from "../i18n/local-date";

/**
 * Copy of the vault layout in `packages/core/src/gtd-task-files.ts`
 * (`GTD_TASK_FILES`) and `packages/core/src/gtd-layout.ts` (`dailyNoteDate`):
 * the five fixed task files plus one `daily/YYYY-MM-DD.md` note per day.
 * Duplicated because `@gtd/core` is a Node package (its barrel pulls in
 * `node:fs`) and no browser-safe entry point exists yet — keep both in sync.
 */
export const VAULT_TASK_FILES = [
  "tasks/inbox.md",
  "tasks/focus.md",
  "tasks/next-actions.md",
  "tasks/waiting.md",
  "tasks/someday-maybe.md",
] as const;

export type VaultTaskFile = (typeof VAULT_TASK_FILES)[number];

/** ISO date (`YYYY-MM-DD`) → the vault path of that day's note. */
export function dailyFilePath(date: string): VaultDailyFile {
  return `daily/${date}.md`;
}

export type VaultDailyFile = `daily/${string}.md`;

export type VaultFile = VaultTaskFile | VaultDailyFile;

/** Minimal transport entry for one existing Daily note. */
export interface DailyNoteRef {
  /** ISO date; keys the day's vault file (see {@link dailyFilePath}) and the route param. */
  readonly date: IsoLocalDate;
  /** Backend-owned user-calendar classification; all visible copy stays client-side. */
  readonly isToday: boolean;
}
