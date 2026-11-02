import type { GtdTaskFilePath } from "@gtd/core/layout";

/** Wire DTO of the daily index; re-exported so vault consumers import one path. */
export type { DailyNoteRef } from "@gtd/api";

/** One of the five fixed GTD task files; the layout rule lives in core. */
export type VaultTaskFile = GtdTaskFilePath;

/** ISO date (`YYYY-MM-DD`) → the vault path of that day's note. */
export function dailyFilePath(date: string): VaultDailyFile {
  return `daily/${date}.md`;
}

export type VaultDailyFile = `daily/${string}.md`;

export type VaultFile = VaultTaskFile | VaultDailyFile;
