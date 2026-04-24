import { randomUUID } from "node:crypto";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

export type ChangeActor = "llm" | "user" | "system";

export interface HistoryEntry {
  id: string;
  filePath: string;
  contentBefore: string;
  contentAfter: string;
  changeSummary: string;
  changedAt: string;
  changedBy: ChangeActor;
}

export const HISTORY_DIR = ".gtd-companion";
export const HISTORY_FILE = "file-history.jsonl";

export function historyFilePath(basePath: string): string {
  return path.join(basePath, HISTORY_DIR, HISTORY_FILE);
}

export interface BuildHistoryInput {
  filePath: string;
  contentBefore: string;
  contentAfter: string;
  changeSummary: string;
  changedBy?: ChangeActor;
  now?: () => Date;
  idFactory?: () => string;
}

export function buildHistoryEntry(input: BuildHistoryInput): HistoryEntry {
  return {
    id: (input.idFactory ?? randomUUID)(),
    filePath: input.filePath,
    contentBefore: input.contentBefore,
    contentAfter: input.contentAfter,
    changeSummary: input.changeSummary,
    changedAt: (input.now ?? (() => new Date()))().toISOString(),
    changedBy: input.changedBy ?? "llm",
  };
}

// History append is not atomic w.r.t. the preceding fs.writeFile — acceptable
// in Phase 1 (single-user, single-process). Never truncate this file; it is
// the only rollback/audit trail.
export async function appendHistoryEntry(
  basePath: string,
  input: BuildHistoryInput,
): Promise<HistoryEntry> {
  const entry = buildHistoryEntry(input);
  const target = historyFilePath(basePath);
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}
