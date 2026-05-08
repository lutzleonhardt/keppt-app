import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  FileNotFoundError,
  InvalidPathError,
  type FileRepository,
} from "./file-repository.js";

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
  | { ok: false; error: { reason: "not_found" | "invalid_path"; message: string } };

async function readFileTool(
  repo: FileRepository,
  filePath: string,
): Promise<ReadFileResult> {
  try {
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

export function buildTools(repo: FileRepository): ToolSet {
  return {
    read_file: tool({
      description:
        "Reads the markdown content of a file relative to the vault root.",
      inputSchema: z.object({ file_path: filePathSchema }),
      execute: async ({ file_path }) => readFileTool(repo, file_path),
    }),
    edit_file: tool({
      description:
        "Applies atomic search/replace edits. Each search must occur exactly once in the file. " +
        "On ok:false, inspect error.matchCount and error.currentContent and retry with extended context.",
      inputSchema: z.object({
        file_path: filePathSchema,
        edits: editsSchema,
        change_summary: changeSummarySchema,
      }),
      execute: async ({ file_path, edits, change_summary }) =>
        repo.edit(file_path, edits, change_summary),
    }),
    write_file: tool({
      description:
        "Writes the entire content. Only for create or full rewrite — otherwise use edit_file.",
      inputSchema: z.object({
        file_path: filePathSchema,
        content: z.string(),
        change_summary: changeSummarySchema,
      }),
      execute: async ({ file_path, content, change_summary }) => {
        await repo.write(file_path, content, change_summary);
        return { ok: true as const };
      },
    }),
    list_files: tool({
      description: "Lists paths, optionally filtered by prefix.",
      inputSchema: z.object({ prefix: z.string().optional() }),
      execute: async ({ prefix }) => repo.list(prefix),
    }),
    search_files: tool({
      description: "Full-text search. scope=active (default), archive, or all.",
      inputSchema: z.object({
        query: z.string(),
        scope: scopeSchema,
      }),
      execute: async ({ query, scope }) => repo.search(query, scope ?? "active"),
    }),
  };
}
