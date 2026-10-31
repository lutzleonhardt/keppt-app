import type { GtdTaskFilePath, IsoDate } from "@gtd/core/layout";

/** One of the five fixed GTD task files; the layout rule lives in core. */
export type VaultTaskFile = GtdTaskFilePath;

/** ISO date (`YYYY-MM-DD`) → the vault path of that day's note. */
export function dailyFilePath(date: string): VaultDailyFile {
  return `daily/${date}.md`;
}

export type VaultDailyFile = `daily/${string}.md`;

export type VaultFile = VaultTaskFile | VaultDailyFile;

/** Minimal transport entry for one existing Daily note. */
export interface DailyNoteRef {
  /** ISO date; keys the day's vault file (see {@link dailyFilePath}) and the route param. */
  readonly date: IsoDate;
  /** Backend-owned user-calendar classification; all visible copy stays client-side. */
  readonly isToday: boolean;
}
