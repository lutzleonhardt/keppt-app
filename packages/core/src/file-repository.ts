export type SearchScope = "active" | "archive" | "all";

export interface SearchResult {
  filePath: string;
  snippet: string;
  line: number;
}

export interface FileRepository {
  read(filePath: string): Promise<string>;
  write(filePath: string, content: string, changeSummary: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  search(query: string, scope?: SearchScope): Promise<SearchResult[]>;
}

export class FileNotFoundError extends Error {
  readonly filePath: string;
  constructor(filePath: string) {
    super(`File not found: ${filePath}`);
    this.name = "FileNotFoundError";
    this.filePath = filePath;
  }
}
