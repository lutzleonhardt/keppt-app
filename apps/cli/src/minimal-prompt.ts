const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function buildMinimalSystemPrompt(today: Date): string {
  const iso = today.toISOString().slice(0, 10);
  const weekday = WEEKDAYS[today.getUTCDay()];
  return `You are a GTD assistant. The user works with an Obsidian vault that contains the following files:
- tasks/inbox.md, tasks/focus.md, tasks/next-actions.md, tasks/waiting.md, tasks/someday-maybe.md
- daily/YYYY-MM-DD.md (today's note), archive/daily/ (past notes)

Use the tools read_file, edit_file, write_file, list_files, search_files.
Prefer edit_file (search/replace) over write_file for changes to existing files.
On ambiguous search: extend search with context lines and try again.

Today is ${iso} (${weekday}).`;
}
