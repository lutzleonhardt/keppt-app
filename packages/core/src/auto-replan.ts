import {
  FileNotFoundError,
  InvalidPathError,
  type FileRepository,
} from "./file-repository.js";

export interface AutoReplanContext {
  dailies: Array<{ date: string; content: string }>;
  nextActions: string;
  waiting: string;
  isEmpty: boolean;
}

export async function gatherAutoReplanContext(
  repo: FileRepository,
  today: string,
  daysBack = 5,
): Promise<AutoReplanContext> {
  const dailies: Array<{ date: string; content: string }> = [];
  for (const date of dailyWindow(today, daysBack)) {
    const content = await readOptional(repo, `daily/${date}.md`);
    if (content !== null) dailies.push({ date, content });
  }

  const nextActions = (await readOptional(repo, "tasks/next-actions.md")) ?? "";
  const waiting = (await readOptional(repo, "tasks/waiting.md")) ?? "";
  const hasDailyContent = dailies.some((daily) => daily.content.trim() !== "");

  return {
    dailies,
    nextActions,
    waiting,
    isEmpty:
      !hasDailyContent && nextActions.trim() === "" && waiting.trim() === "",
  };
}

async function readOptional(
  repo: FileRepository,
  filePath: string,
): Promise<string | null> {
  try {
    return await repo.read(filePath);
  } catch (err) {
    if (err instanceof FileNotFoundError || err instanceof InvalidPathError) {
      return null;
    }
    throw err;
  }
}

function dailyWindow(today: string, daysBack: number): string[] {
  const dates: string[] = [];
  const count = Math.max(0, Math.trunc(daysBack));
  for (let offset = -count; offset <= 0; offset++) {
    dates.push(offsetDate(today, offset));
  }
  return dates;
}

function offsetDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const timestamp = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const shifted = new Date(timestamp + days * 24 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
