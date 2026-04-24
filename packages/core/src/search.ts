import type { SearchResult, SearchScope } from "./file-repository.js";

const SNIPPET_CONTEXT = 40; // chars either side of the match → ~80-char window

export function formatToday(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isInScope(filePath: string, scope: SearchScope, today: string): boolean {
  const p = filePath.replace(/\\/g, "/");
  if (!p.endsWith(".md")) return false;
  const inActive = p.startsWith("tasks/") || p === `daily/${today}.md`;
  const inArchive = p.startsWith("archive/daily/");
  if (scope === "active") return inActive;
  if (scope === "archive") return inArchive;
  return inActive || inArchive;
}

export function findMatches(filePath: string, content: string, query: string): SearchResult[] {
  if (query.length === 0) return [];
  const q = query.toLowerCase();
  const lines = content.split("\n");
  const results: SearchResult[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const idx = line.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    const start = Math.max(0, idx - SNIPPET_CONTEXT);
    const end = Math.min(line.length, idx + query.length + SNIPPET_CONTEXT);
    const snippet =
      (start > 0 ? "…" : "") + line.slice(start, end) + (end < line.length ? "…" : "");
    results.push({ filePath, snippet, line: i + 1 });
  }
  return results;
}
