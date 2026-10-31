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
