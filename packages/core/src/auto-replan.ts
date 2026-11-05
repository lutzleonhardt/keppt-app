import type { ModelMessage } from "ai";
import {
  FileNotFoundError,
  InvalidPathError,
  type FileRepository,
} from "./file-repository.js";
import { offsetDate } from "./layout/daily-note.js";
import type { ReadFileResult } from "./tools.js";

/** Dailies before today the opener surveys; today's daily is always included. */
export const AUTO_REPLAN_DAYS_BACK = 5;

export interface AutoReplanContext {
  dailies: Array<{ date: string; content: string }>;
  nextActions: string;
  waiting: string;
  focus: string;
  isEmpty: boolean;
}

export async function gatherAutoReplanContext(
  repo: FileRepository,
  today: string,
  daysBack = AUTO_REPLAN_DAYS_BACK,
): Promise<AutoReplanContext> {
  const dailies: Array<{ date: string; content: string }> = [];
  for (const date of dailyWindow(today, daysBack)) {
    const content = await readOptional(repo, `daily/${date}.md`);
    if (content !== null) dailies.push({ date, content });
  }

  const nextActions = (await readOptional(repo, "tasks/next-actions.md")) ?? "";
  const waiting = (await readOptional(repo, "tasks/waiting.md")) ?? "";
  const focus = (await readOptional(repo, "tasks/focus.md")) ?? "";
  const hasDailyContent = dailies.some((daily) => daily.content.trim() !== "");
  const hasTaskContent = [nextActions, waiting, focus].some(
    (text) => text.trim() !== "",
  );

  return {
    dailies,
    nextActions,
    waiting,
    focus,
    isEmpty: !hasDailyContent && !hasTaskContent,
  };
}

/**
 * The opener turn's prefix: what the history would hold had the model read
 * the context files itself — kickoff, one assistant message with a
 * `read_file` call per window date and task file, the matching results,
 * and the instruction. The fabricated results take the real `read_file`
 * output shape so tool-result pruning ages and drift-stubs them per file;
 * a missing daily gets the `not_found` result a real read returns, because
 * a model told in prose that a file is missing reads it anyway (live run
 * 2026-11-05). Ending with a user message keeps `buildRequest`'s
 * trailing-user invariant (cache marker, context notes).
 */
export function buildAutoReplanOpener(
  context: AutoReplanContext,
  today: string,
): ModelMessage[] {
  const reads = contextReads(context, today).map((read, i) => ({
    ...read,
    toolCallId: `auto-replan-${i + 1}`,
  }));
  return [
    { role: "user", content: kickoffText(today) },
    {
      role: "assistant",
      content: reads.map((read) => ({
        type: "tool-call",
        toolCallId: read.toolCallId,
        toolName: "read_file",
        input: { file_path: read.path },
      })),
    },
    {
      role: "tool",
      content: reads.map((read) => ({
        type: "tool-result",
        toolCallId: read.toolCallId,
        toolName: "read_file",
        output: { type: "json", value: read.result },
      })),
    },
    { role: "user", content: instructionText(today) },
  ];
}

interface ContextRead {
  path: string;
  result: ReadFileResult;
}

function contextReads(
  context: AutoReplanContext,
  today: string,
): ContextRead[] {
  const dailyByDate = new Map(
    context.dailies.map((daily) => [daily.date, daily.content]),
  );
  const dailies = dailyWindow(today, AUTO_REPLAN_DAYS_BACK).map((date) => {
    const path = `daily/${date}.md`;
    const content = dailyByDate.get(date);
    return content === undefined ? notFound(path) : found(path, content);
  });
  return [
    ...dailies,
    found("tasks/next-actions.md", context.nextActions),
    found("tasks/waiting.md", context.waiting),
    found("tasks/focus.md", context.focus),
  ];
}

function found(path: string, content: string): ContextRead {
  return { path, result: { ok: true, content } };
}

// `not_found` is a plain json result of read_file, so it ages out of the
// K-window like any other result.
function notFound(path: string): ContextRead {
  return {
    path,
    result: {
      ok: false,
      error: {
        reason: "not_found",
        message: new FileNotFoundError(path).message,
      },
    },
  };
}

function kickoffText(today: string): string {
  return `[Day rollover for ${today}. The recent context follows as read_file results: the last ${AUTO_REPLAN_DAYS_BACK} dailies, today's daily, tasks/next-actions.md, tasks/waiting.md and tasks/focus.md.]`;
}

function instructionText(today: string): string {
  return `[Use daily/${today}.md as today's current plan context, not as stale carry-over. Briefly greet the user, identify stale pending items with date/source, and offer concrete next-step options via suggest_quick_replies with a complete question field. Later chip examples: "später/verschieben/ignorieren" -> source Plan box [-] + today's Log with source date; "erledigt" -> source [x]. Keep it under ~120 words and answer in the user's language.]`;
}

async function readOptional(
  repo: FileRepository,
  filePath: string,
): Promise<string | null> {
  try {
    return await repo.read(filePath);
  } catch (err) {
    if (err instanceof FileNotFoundError || err instanceof InvalidPathError) {
      return null;
    }
    throw err;
  }
}

function dailyWindow(today: string, daysBack: number): string[] {
  const dates: string[] = [];
  const count = Math.max(0, Math.trunc(daysBack));
  for (let offset = -count; offset <= 0; offset++) {
    dates.push(offsetDate(today, offset));
  }
  return dates;
}
