// The vault tools' input contracts and how a call is described to a human.
// `buildTools` wires these schemas into the model-facing tools; the CLI
// status label and the server's tool-row event read `describeToolCall`, so
// a renamed field fails the build here instead of silently emptying a row.

import { z } from "zod";
import type { VaultToolName } from "./turn/vocabulary.js";

const filePathSchema = z.string();
const changeSummarySchema = z.string();

export const readFileInput = z.object({ file_path: filePathSchema });

export const editFileInput = z.object({
  file_path: filePathSchema,
  edits: z
    .array(z.object({ search: z.string().min(1), replace: z.string() }))
    .min(1),
  change_summary: changeSummarySchema,
});

export const writeFileInput = z.object({
  file_path: filePathSchema,
  content: z.string(),
  change_summary: changeSummarySchema,
});

export const listFilesInput = z.object({ prefix: z.string().optional() });

export const searchFilesInput = z.object({
  query: z.string(),
  scope: z.enum(["active", "archive", "all"]).optional(),
});

export const findTaskOccurrencesInput = z.object({
  candidates: z.array(z.string().min(1)).min(1),
});

type ReadFileInput = z.infer<typeof readFileInput>;
type EditFileInput = z.infer<typeof editFileInput>;
type WriteFileInput = z.infer<typeof writeFileInput>;
type ListFilesInput = z.infer<typeof listFilesInput>;
type SearchFilesInput = z.infer<typeof searchFilesInput>;
type FindTaskOccurrencesInput = z.infer<typeof findTaskOccurrencesInput>;

/** The tool row of a call: its primary argument and, for edits and writes, the model's change summary. */
export interface ToolCallDescription {
  target: string;
  summary?: string;
}

/**
 * `target` is the file of the file tools, the search query, the list prefix
 * (empty when absent) or the candidates joined with ", "; `summary` is a
 * non-empty `change_summary` of edit_file/write_file. Reads the input by the
 * schemas' field names without validating it, so a malformed call still
 * gets a row.
 */
export function describeToolCall(
  name: VaultToolName,
  input: unknown,
): ToolCallDescription {
  const args: Record<string, unknown> = isRecord(input) ? input : {};
  switch (name) {
    case "read_file":
      return { target: text((args as Partial<ReadFileInput>).file_path) };
    case "edit_file": {
      const { file_path, change_summary } = args as Partial<EditFileInput>;
      return withSummary(text(file_path), change_summary);
    }
    case "write_file": {
      const { file_path, change_summary } = args as Partial<WriteFileInput>;
      return withSummary(text(file_path), change_summary);
    }
    case "list_files":
      return { target: text((args as Partial<ListFilesInput>).prefix) };
    case "search_files":
      return { target: text((args as Partial<SearchFilesInput>).query) };
    case "find_task_occurrences": {
      const { candidates } = args as Partial<FindTaskOccurrencesInput>;
      return {
        target: Array.isArray(candidates)
          ? candidates.filter(isString).join(", ")
          : "",
      };
    }
  }
}

function withSummary(
  target: string,
  changeSummary: unknown,
): ToolCallDescription {
  const summary = text(changeSummary);
  return summary ? { target, summary } : { target };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** The string itself; "" for anything that is not a string. */
function text(value: unknown): string {
  return isString(value) ? value : "";
}
