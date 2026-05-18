import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { EditError, EditResult } from "./edit.js";
import {
  FileNotFoundError,
  InvalidPathError,
  type FileRepository,
} from "./file-repository.js";
import { canRead, canWrite } from "./gtd-layout.js";
import { type Logger, NoopLogger, safeLog } from "./logging.js";
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
  | { reason: "invalid_path" | "out_of_scope"; message: string }
  | { reason: "retry_budget_exhausted"; currentContent: string };

export type EditFileResult =
  | { ok: true }
  | { ok: false; error: EditFileError };

// Two attempts: first round-trips currentContent, second is the legitimate
// "extend search context" retry. Third would just burn tokens.
const MAX_EDIT_FAILURES_PER_FILE = 2;

/**
 * Per-turn `match`-failure counts for `edit_file`, scoped by the
 * `buildTools` closure (CLI rebuilds per turn). Successes, `out_of_scope`,
 * and `invalid_path` do not count.
 */
type EditFailuresByFilePath = Map<string, number>;

async function readFileTool(
  repo: FileRepository,
  filePath: string,
  today: string,
  logger: Logger,
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
      logger.warn({
        message: `read_file rejected invalid path: ${err.reason}`,
        code: "tool.read_file.invalid_path",
        meta: { filePath, reason: err.reason },
      });
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
  logger: Logger,
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
      logger.warn({
        message: `write_file rejected invalid path: ${err.reason}`,
        code: "tool.write_file.invalid_path",
        meta: { filePath, reason: err.reason },
      });
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
  // Share `today` with the repo so a UTC-midnight session can't drop the
  // turn day's daily note before the tool-layer postfilter runs.
  const hits = await repo.search(query, scope, today);
  // Defense-in-depth: never surface a path read_file would deny, even if
  // a future repo implementation regresses on its in-repo scope filter.
  return hits.filter((h) => allowedByCanRead(h.filePath, today));
}

function allowedByCanRead(filePath: string, today: string): boolean {
  try {
    return canRead(filePath, today);
  } catch {
    // An invalid path leaking out of a repo method is a repo-side
    // containment bug; drop silently rather than surface to the LLM.
    return false;
  }
}

// repo.read throws FileNotFoundError; repo.edit returns missingFileError
// with currentContent: "". Mirror the latter so the exhausted edit_file
// path stays inside the EditFileResult shape for missing-but-writable files.
async function readOrEmpty(repo: FileRepository, filePath: string): Promise<string> {
  try {
    return await repo.read(filePath);
  } catch (err) {
    if (err instanceof FileNotFoundError) return "";
    throw err;
  }
}

async function editFileTool(
  repo: FileRepository,
  filePath: string,
  edits: ReadonlyArray<{ search: string; replace: string }>,
  changeSummary: string,
  today: string,
  failures: EditFailuresByFilePath,
  logger: Logger,
): Promise<EditFileResult> {
  // The outer try/catch turns InvalidPathError (thrown by canWrite ->
  // validateFilePath) into a structured invalid_path result, so a
  // malformed model-supplied path doesn't abort the turn as a stream error.
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
    // The next read-await-write sequence on `failures` is intentionally
    // unsynchronized. Concurrent dispatch into editFileTool would race the
    // counter, but the CLI sets providerOptions.anthropic.disableParallel
    // ToolUse=true on streamText so Anthropic emits at most one tool call
    // per step — calls within a buildTools instance are sequential.
    // workspace-wiring.test.ts pins that flag in place; do not add a
    // mutex here without first removing the flag (every prior in-tool
    // locking attempt introduced its own bug — slot-reservation false-
    // blocked concurrent successes, per-file queues ignored the abort
    // signal). Callers using buildTools outside the CLI must guarantee
    // the same sequential-dispatch invariant themselves.
    const count = failures.get(filePath) ?? 0;
    if (count >= MAX_EDIT_FAILURES_PER_FILE) {
      const currentContent = await readOrEmpty(repo, filePath);
      logger.warn({
        message: `edit_file retry budget exhausted on ${filePath}`,
        code: "tool.edit_file.retry_budget_exhausted",
        meta: { filePath, attempts: count },
      });
      return {
        ok: false,
        error: { reason: "retry_budget_exhausted", currentContent },
      };
    }
    const result: EditResult = await repo.edit(filePath, edits, changeSummary);
    if (result.ok) return { ok: true };
    failures.set(filePath, count + 1);
    // Bounded diagnostics only — `EditError.currentContent` is the entire
    // target file and `failedSearch` is a model-supplied verbatim slice.
    // Both are personal data (vault notes) and would persist to the
    // CLI's JSONL log unredacted; log lengths/counts instead so log size
    // stays bounded by failure count, not file size, and no note content
    // leaks outside the mutation-history path.
    const editError = result.error as EditError | undefined;
    logger.info({
      message: `edit_file match failed on ${filePath}`,
      code: "tool.edit_file.failed",
      meta: {
        filePath,
        matchCount: editError?.matchCount ?? 0,
        failedSearchLength: editError?.failedSearch.length ?? 0,
        currentContentLength: editError?.currentContent.length ?? 0,
      },
    });
    return { ok: false, error: { ...(result.error as EditError), reason: "match" } };
  } catch (err) {
    if (err instanceof InvalidPathError) {
      logger.warn({
        message: `edit_file rejected invalid path: ${err.reason}`,
        code: "tool.edit_file.invalid_path",
        meta: { filePath, reason: err.reason },
      });
      return { ok: false, error: { reason: "invalid_path", message: err.message } };
    }
    throw err;
  }
}

export interface BuildToolsOptions {
  // Caller should share this clock with the system-prompt builder so the
  // prompt's daily-note path and the GTD gate cannot disagree across a
  // UTC-midnight rollover within a long-running session.
  now?: () => Date;
  // Operational diagnostics for tool-layer events: edit retry-budget
  // exhaustion, structured edit failures, and InvalidPathError catches.
  // Defaults to NoopLogger so existing callers are untouched. Codes are
  // stable contract surface — see docs/plans/phase-1-cli.md Task 3.9.
  logger?: Logger;
}

/**
 * Build the LLM-facing tool set for one user turn.
 *
 * Two contracts the caller must honor:
 *
 * 1. **Per-turn scoping.** Rebuild `buildTools` per user turn — the
 *    `edit_file` retry budget lives in this closure and only resets
 *    when the closure is replaced. Sharing one `buildTools` result
 *    across turns leaks budget state.
 *
 * 2. **Sequential `edit_file` dispatch within one instance.** The
 *    retry budget mutates a plain `Map` without synchronization. The
 *    CLI guarantees this via Anthropic's `disableParallelToolUse=true`
 *    on `streamText`. Any other caller (server entry point, direct
 *    tests of `tools.edit_file.execute`, alternate provider) must
 *    enforce the same invariant or the budget races.
 */
export function buildTools(
  repo: FileRepository,
  options: BuildToolsOptions = {},
): ToolSet {
  const now = options.now ?? (() => new Date());
  // safeLog enforces the Logger contract's non-throwing requirement at
  // the seam: even if an external adapter (Pino transport, network sink,
  // future Sentry wrapper) throws synchronously, tool semantics are
  // preserved — `invalid_path` stays a structured `ok: false`, not a
  // stream-aborting exception.
  const logger = safeLog(options.logger ?? new NoopLogger());
  const today = (): string => formatToday(now());
  const failures: EditFailuresByFilePath = new Map();
  return {
    read_file: tool({
      description:
        "Reads the markdown content of a file relative to the vault root.",
      inputSchema: z.object({ file_path: filePathSchema }),
      execute: async ({ file_path }) =>
        readFileTool(repo, file_path, today(), logger),
    }),
    edit_file: tool({
      description:
        "Applies atomic search/replace edits. Each search must occur exactly once in the file. " +
        "On ok:false, inspect error.reason: 'match' (with matchCount/currentContent) means retry with extended context — " +
        "but if currentContent is the empty string, the file does not exist; switch to write_file to create it instead of retrying edit_file. " +
        "'out_of_scope' or 'invalid_path' means the path is not editable; " +
        "'retry_budget_exhausted' (with currentContent) means two prior 'match' attempts on this file already failed in the current turn — stop retrying and consider asking the user or trying a different file.",
      inputSchema: z.object({
        file_path: filePathSchema,
        edits: editsSchema,
        change_summary: changeSummarySchema,
      }),
      execute: async ({ file_path, edits, change_summary }) =>
        editFileTool(
          repo,
          file_path,
          edits,
          change_summary,
          today(),
          failures,
          logger,
        ),
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
        writeFileTool(repo, file_path, content, change_summary, today(), logger),
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
