/** A calendar date without a time or timezone, serialized as `YYYY-MM-DD`. */
export type IsoDate = `${number}-${number}-${number}`;

const DAILY_NOTE_PATH = /^daily\/((\d{4})-(\d{2})-(\d{2}))\.md$/;

// Single definition of the daily-note path shape, shared by the gates, the
// occurrence search, the HTTP vault API and the web app. Requires a real
// calendar date so `daily/2026-02-30.md` is out of scope everywhere instead
// of a nonsense file.
export function dailyNoteDate(filePath: string): IsoDate | undefined {
  const match = DAILY_NOTE_PATH.exec(filePath);
  if (match === null) return undefined;
  const year = Number(match[2]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  const isCalendarDate =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  // Group 1 is `\d{4}-\d{2}-\d{2}` by construction; the regex is the proof
  // behind this one narrowing.
  return isCalendarDate ? (match[1] as IsoDate) : undefined;
}

/**
 * Shift a `YYYY-MM-DD` key by whole days. Calendar arithmetic in UTC, so the
 * result never depends on the host time zone or DST.
 */
export function offsetDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const timestamp = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const shifted = new Date(timestamp + days * 24 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
