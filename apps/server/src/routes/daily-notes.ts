import express, { type Router } from "express";
import { dailyNoteDate, formatToday, type FileRepository } from "@gtd/core";

export interface DailyNoteRef {
  date: string;
  isToday: boolean;
}

// Index of existing daily notes from filenames alone — no content is read.
// `isToday` is decided here because the client contract treats the
// classification as backend-owned.
export function dailyNotesRouter(
  repo: FileRepository,
  now: () => Date,
): Router {
  const router = express.Router();
  router.get("/api/daily-notes", async (_req, res) => {
    const paths = await repo.list("daily/");
    res.json(toDailyNoteRefs(paths, formatToday(now())));
  });
  return router;
}

export function toDailyNoteRefs(
  paths: readonly string[],
  today: string,
): DailyNoteRef[] {
  return paths
    .flatMap((filePath) => dailyNoteDate(filePath) ?? [])
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({ date, isToday: date === today }));
}
