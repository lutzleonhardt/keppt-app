import type { IsoDate } from "@gtd/core/layout";

/** One entry of `GET /api/daily-notes`: an existing daily note, by date only. */
export interface DailyNoteRef {
  /** Keys the day's vault file (`daily/{date}.md`) and the client route. */
  readonly date: IsoDate;
  /** Backend-owned calendar classification; visible copy stays client-side. */
  readonly isToday: boolean;
}
