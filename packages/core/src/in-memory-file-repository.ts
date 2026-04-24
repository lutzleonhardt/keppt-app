import type { FileRepository, SearchResult, SearchScope } from "./file-repository.js";
import { FileNotFoundError, validateFilePath } from "./file-repository.js";
import { buildHistoryEntry, type ChangeActor, type HistoryEntry } from "./history-log.js";
import { findMatches, formatToday, isInScope } from "./search.js";

export interface InMemoryFileRepositoryOptions {
  now?: () => Date;
  changedBy?: ChangeActor;
}

export class InMemoryFileRepository implements FileRepository {
  private readonly files = new Map<string, string>();
  private readonly historyEntries: HistoryEntry[] = [];
  private readonly now: () => Date;
  private readonly changedBy: ChangeActor;

  constructor(options: InMemoryFileRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.changedBy = options.changedBy ?? "llm";
  }

  async read(filePath: string): Promise<string> {
    validateFilePath(filePath);
    const existing = this.files.get(filePath);
    if (existing === undefined) throw new FileNotFoundError(filePath);
    return existing;
  }

  async write(filePath: string, content: string, changeSummary: string): Promise<void> {
    validateFilePath(filePath);
    const before = this.files.get(filePath) ?? "";
    this.files.set(filePath, content);
    this.historyEntries.push(
      buildHistoryEntry({
        filePath,
        contentBefore: before,
        contentAfter: content,
        changeSummary,
        changedBy: this.changedBy,
        now: this.now,
      }),
    );
  }

  async list(prefix?: string): Promise<string[]> {
    const paths = [...this.files.keys()]
      .filter((p) => p.toLowerCase().endsWith(".md"))
      .sort();
    return prefix ? paths.filter((p) => p.startsWith(prefix)) : paths;
  }

  async search(query: string, scope: SearchScope = "active"): Promise<SearchResult[]> {
    const today = formatToday(this.now());
    const results: SearchResult[] = [];
    for (const [filePath, content] of this.files) {
      if (!isInScope(filePath, scope, today)) continue;
      results.push(...findMatches(filePath, content, query));
    }
    return results;
  }

  /** Test-only accessor: returns the in-memory history trail. */
  getHistory(): readonly HistoryEntry[] {
    return this.historyEntries;
  }
}
