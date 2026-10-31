import {
  FileNotFoundError,
  InvalidPathError,
  type FileRepository,
} from "./file-repository.js";
import { dailyNoteDate } from "./layout/daily-note.js";
import { TASK_OCCURRENCE_TASK_FILES } from "./layout/gtd-task-files.js";

export interface TaskOccurrenceBlock {
  file: string;
  line: number;
  rawBlock: string[];
}

export interface TaskOccurrenceSearchResult {
  searchedFiles: string[];
  blocks: TaskOccurrenceBlock[];
}

interface WorkingBlock {
  file: string;
  startLineIndex: number;
  endLineIndex: number;
  firstMatchedLineIndex: number;
}

export async function findTaskOccurrences(
  repo: FileRepository,
  today: string,
  candidates: readonly string[],
): Promise<TaskOccurrenceSearchResult> {
  const normalizedCandidates = normalizeCandidates(candidates);
  if (normalizedCandidates.length === 0) {
    return { searchedFiles: [], blocks: [] };
  }

  const files = await searchSurfaceFiles(repo, today);
  const readFiles = await readExistingFiles(repo, files);
  const searchedFiles = readFiles.map((file) => file.file);

  return {
    searchedFiles,
    blocks: readFiles.flatMap((file) =>
      findBlocks(file.file, file.content, normalizedCandidates),
    ),
  };
}

async function readExistingFiles(
  repo: FileRepository,
  files: readonly string[],
): Promise<Array<{ file: string; content: string }>> {
  const readFiles: Array<{ file: string; content: string }> = [];

  for (const file of files) {
    let content: string;
    try {
      content = await repo.read(file);
    } catch (err) {
      if (err instanceof FileNotFoundError || err instanceof InvalidPathError) {
        continue;
      }
      throw err;
    }

    readFiles.push({ file, content });
  }

  return readFiles;
}

async function searchSurfaceFiles(
  repo: FileRepository,
  today: string,
): Promise<string[]> {
  const dailyFiles = await listDailySurfaceFiles(repo, today);
  return [...TASK_OCCURRENCE_TASK_FILES, ...dailyFiles];
}

async function listDailySurfaceFiles(
  repo: FileRepository,
  today: string,
): Promise<string[]> {
  const cutoff = offsetDate(today, -30);
  const paths = await repo.list("daily/");
  return paths
    .filter((path) => {
      const date = dailyNoteDate(path);
      return date !== undefined && date >= cutoff;
    })
    .sort();
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

function normalizeCandidates(candidates: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of candidates) {
    const value = normalizeForMatch(raw);
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

// Search-normal form, not display text. NFKD splits combined glyphs into
// base letter + mark (`ä` -> `a` + umlaut mark), the mark stripper removes
// those accents, then punctuation/Markdown syntax becomes whitespace.
// Example: `- [ ] RASEN-mähen [[Garten]]` -> `rasen mahen garten`.
function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findBlocks(
  file: string,
  content: string,
  candidates: readonly string[],
): TaskOccurrenceBlock[] {
  const lines = splitMarkdownLines(content);
  const windows: WorkingBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!matchesAnyCandidate(lines[index] ?? "", candidates)) continue;
    windows.push({
      file,
      startLineIndex: Math.max(0, index - 1),
      endLineIndex: Math.min(lines.length - 1, index + 1),
      firstMatchedLineIndex: index,
    });
  }

  return mergeBlocks(windows).map((block) => ({
    file: block.file,
    line: block.firstMatchedLineIndex + 1,
    rawBlock: lines.slice(block.startLineIndex, block.endLineIndex + 1),
  }));
}

function splitMarkdownLines(content: string): string[] {
  const lines = content.split(/\r\n|\n|\r/);
  if (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function matchesAnyCandidate(
  line: string,
  candidates: readonly string[],
): boolean {
  const normalizedLine = normalizeForMatch(line);
  if (normalizedLine.length === 0) return false;
  return candidates.some((candidate) => normalizedLine.includes(candidate));
}

function mergeBlocks(blocks: readonly WorkingBlock[]): WorkingBlock[] {
  const merged: WorkingBlock[] = [];
  for (const block of blocks) {
    const current = merged.at(-1);
    // Each hit starts as a ±1-line context window. Merge overlapping windows
    // and windows with at most one raw line between them: current.end + 1 is
    // directly adjacent, current.end + 2 leaves exactly one separating line.
    if (current && block.startLineIndex <= current.endLineIndex + 2) {
      current.endLineIndex = Math.max(current.endLineIndex, block.endLineIndex);
      current.firstMatchedLineIndex = Math.min(
        current.firstMatchedLineIndex,
        block.firstMatchedLineIndex,
      );
      continue;
    }
    merged.push({ ...block });
  }
  return merged;
}
