import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { EditError, EditResult } from "./edit.js";
import {
  FileNotFoundError,
  InvalidPathError,
  type FileRepository,
} from "./file-repository.js";
import { canRead, canWrite } from "./gtd-layout.js";
import { formatToday } from "./search.js";
import type { SearchResult } from "./file-repository.js";

const filePathSchema = z.string();
const changeSummarySchema = z.string();

const editsSchema = z
  .array(
    z.object({
      search: z.string().min(1),
      replace: z.string(),
    }),
  )
  .min(1);

const scopeSchema = z.enum(["active", "archive", "all"]).optional();

export type ReadFileResult =
  | { ok: true; content: string }
  | {
      ok: false;
      error: {
        reason: "not_found" | "invalid_path" | "out_of_scope";
        message: string;
      };
    };

export type WriteFileResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        reason: "invalid_path" | "out_of_scope";
        message: string;
      };
    };

export type EditFileError =
  | (EditError & { reason: "match" })
  | { reason: "invalid_path" | "out_of_scope"; message: string };

export type EditFileResult =
  | { ok: true }
  | { ok: false; error: EditFileError };

async function readFileTool(
  repo: FileRepository,
  filePath: string,
  today: string,
): Promise<ReadFileResult> {
  try {
    if (!canRead(filePath, today)) {
      return {
        ok: false,
        error: {
          reason: "out_of_scope",
          message: `Path '${filePath}' is not readable under the GTD layout.`,
        },
      };
    }
    const content = await repo.read(filePath);
    return { ok: true, content };
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      return { ok: false, error: { reason: "not_found", message: err.message } };
    }
    if (err instanceof InvalidPathError) {
      return { ok: false, error: { reason: "invalid_path", message: err.message } };
    }
    throw err;
  }
}

async function writeFileTool(
  repo: FileRepository,
  filePath: string,
  content: string,
  changeSummary: string,
  today: string,
): Promise<WriteFileResult> {
  try {
    if (!canWrite(filePath, today)) {
      return {
        ok: false,
        error: {
          reason: "out_of_scope",
          message: `Path '${filePath}' is not writable under the GTD layout.`,
        },
      };
    }
    await repo.write(filePath, content, changeSummary);
    return { ok: true };
  } catch (err) {
    if (err instanceof InvalidPathError) {
      return { ok: false, error: { reason: "invalid_path", message: err.message } };
    }
    throw err;
  }
}

async function listFilesTool(
  repo: FileRepository,
  prefix: string | undefined,
  today: string,
): Promise<string[]> {
  const all = await repo.list(prefix);
  return all.filter((p) => allowedByCanRead(p, today));
}

async function searchFilesTool(
  repo: FileRepository,
  query: string,
  scope: "active" | "archive" | "all",
  today: string,
): Promise<SearchResult[]> {
  // Pass `today` into the repo so its scope filter uses the same date as the
  // tool-layer postfilter — otherwise a session crossing UTC midnight can
  // have the repo (its own clock) drop the turn day's daily note before the
  // postfilter runs, producing silent false negatives exactly in the
  // rollover case the per-turn `turnNow` pattern is meant to fix.
  const hits = await repo.search(query, scope, today);
  // Postfilter at the tool boundary: snippets are a read surface, so search
  // must not return content from any path read_file would deny — even if a
  // future repository implementation regresses on the in-repo isInScope
  // filter. The architecture says GTD scope belongs in the LLM tool layer.
  return hits.filter((h) => allowedByCanRead(h.filePath, today));
}

function allowedByCanRead(filePath: string, today: string): boolean {
  try {
    return canRead(filePath, today);
  } catch {
    // canRead delegates to validateFilePath, which throws on traversal /
    // .keppt/ / absolute / backslash. Any such path leaking out of a repo
    // method is a containment bug in the repo, not something the LLM
    // should see — drop it silently rather than surface it.
    return false;
  }
}

async function editFileTool(
  repo: FileRepository,
  filePath: string,
  edits: ReadonlyArray<{ search: string; replace: string }>,
  changeSummary: string,
  today: string,
): Promise<EditFileResult> {
  try {
    if (!canWrite(filePath, today)) {
      return {
        ok: false,
        error: {
          reason: "out_of_scope",
          message: `Path '${filePath}' is not writable under the GTD layout.`,
        },
      };
    }
    const result: EditResult = await repo.edit(filePath, edits, changeSummary);
    if (result.ok) return { ok: true };
    return { ok: false, error: { ...(result.error as EditError), reason: "match" } };
  } catch (err) {
    if (err instanceof InvalidPathError) {
      return { ok: false, error: { reason: "invalid_path", message: err.message } };
    }
    throw err;
  }
}

export interface BuildToolsOptions {
  // Clock used to derive the "today" string the GTD gate enforces. The CLI
  // is expected to share this clock with the system-prompt builder so the
  // prompt's daily-note path and the gate's allowlist cannot disagree at a
  // UTC midnight rollover within a long-running session. Defaults to a
  // real-time clock.
  now?: () => Date;
}

export function buildTools(
  repo: FileRepository,
  options: BuildToolsOptions = {},
): ToolSet {
  const now = options.now ?? (() => new Date());
  const today = (): string => formatToday(now());
  return {
    read_file: tool({
      description:
        "Reads the markdown content of a file relative to the vault root.",
      inputSchema: z.object({ file_path: filePathSchema }),
      execute: async ({ file_path }) =>
        readFileTool(repo, file_path, today()),
    }),
    edit_file: tool({
      description:
        "Applies atomic search/replace edits. Each search must occur exactly once in the file. " +
        "On ok:false, inspect error.reason: 'match' (with matchCount/currentContent) means retry with extended context; " +
        "'out_of_scope' or 'invalid_path' means the path is not editable.",
      inputSchema: z.object({
        file_path: filePathSchema,
        edits: editsSchema,
        change_summary: changeSummarySchema,
      }),
      execute: async ({ file_path, edits, change_summary }) =>
        editFileTool(repo, file_path, edits, change_summary, today()),
    }),
    write_file: tool({
      description:
        "Writes the entire content. Only for create or full rewrite — otherwise use edit_file.",
      inputSchema: z.object({
        file_path: filePathSchema,
        content: z.string(),
        change_summary: changeSummarySchema,
      }),
      execute: async ({ file_path, content, change_summary }) =>
        writeFileTool(repo, file_path, content, change_summary, today()),
    }),
    list_files: tool({
      description:
        "Lists paths, optionally filtered by prefix. Results are restricted " +
        "to the GTD layout (5 task files, today's daily note, archived dailies).",
      inputSchema: z.object({ prefix: z.string().optional() }),
      execute: async ({ prefix }) => listFilesTool(repo, prefix, today()),
    }),
    search_files: tool({
      description:
        "Full-text search. scope=active (default), archive, or all. " +
        "Results are restricted to the GTD layout — snippets from out-of-scope paths are filtered out.",
      inputSchema: z.object({
        query: z.string(),
        scope: scopeSchema,
      }),
      execute: async ({ query, scope }) =>
        searchFilesTool(repo, query, scope ?? "active", today()),
    }),
  };
}
