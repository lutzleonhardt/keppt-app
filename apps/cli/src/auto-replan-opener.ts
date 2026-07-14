import { statSync } from "node:fs";
import path from "node:path";
import { hasToolCall, isStepCount, streamText, type ModelMessage } from "ai";
import {
  buildRequest,
  buildTools,
  formatToday,
  gatherAutoReplanContext,
  type AutoReplanContext,
  type QuickRepliesResult,
} from "@gtd/core";
import type { TurnDeps, TurnRefs } from "./turn-loop.js";
import { MODEL_ID, model, providerOptions } from "./model-provider.js";
import { appendCliErrorLog } from "./cli-error-log.js";
import { formatCliError } from "./cli-errors.js";
import { writeTurnArtifact, type TurnLogContext } from "./turn-artifact.js";

const AUTO_REPLAN_DAYS_BACK = 5;
const MAX_STEPS = 10;
const AUTO_REPLAN_BANNER =
  "[Auto-Replan] Tagesstart-Check über letzte 5 Dailies + Next-Actions/Waiting…";

type StreamHandle = ReturnType<
  typeof streamText<ReturnType<typeof buildTools>>
>;

export async function maybeRunAutoReplanOpener(
  deps: TurnDeps,
  refs: TurnRefs,
): Promise<void> {
  const today = formatToday(refs.turnNow);
  if (refs.session.autoReplanRanFor === today) return;
  await runAutoReplanOpener(deps, refs);
}

export async function runAutoReplanOpener(
  deps: TurnDeps,
  refs: TurnRefs,
): Promise<void> {
  const today = formatToday(refs.turnNow);
  const context = await gatherAutoReplanContext(
    deps.repo,
    today,
    AUTO_REPLAN_DAYS_BACK,
  );
  if (context.isEmpty) return;

  deps.terminal.autoReplanBanner(AUTO_REPLAN_BANNER);

  const turnStartedAt = Date.now();
  const syntheticUser: ModelMessage = {
    role: "user",
    content: buildSyntheticUserMessage(context, today),
  };
  const tools = buildTools(deps.repo, {
    now: () => refs.turnNow,
    logger: deps.cliLogger,
  });
  let turnCtx: TurnLogContext | null = null;

  try {
    const { system, messages: requestMessages } = buildRequest({
      today: refs.turnNow,
      messages: [...refs.session.messages, syntheticUser],
      fileVersionAt: makeFileVersionAt(deps.vaultPath),
      messageCreatedAt: (msg) =>
        msg === syntheticUser
          ? turnStartedAt
          : (refs.session.createdAtOf(msg) ?? Date.now()),
    });
    const systemText = typeof system.content === "string" ? system.content : "";
    if (refs.turnLogger) {
      turnCtx = {
        turnLogger: refs.turnLogger,
        turnId: refs.turnLogger.nextTurnId(),
        startedAtMs: turnStartedAt,
        model: MODEL_ID,
        system: systemText,
        messages: requestMessages,
        providerOptions: providerOptions(),
        cliLogger: deps.cliLogger,
      };
    }

    const result = streamText({
      model: model(),
      system,
      messages: requestMessages,
      tools,
      stopWhen: [hasToolCall("suggest_quick_replies"), isStepCount(MAX_STEPS)],
      providerOptions: providerOptions(),
      onError: () => {},
    });

    const { quickReplyPayload } = await consumeAutoReplanStream(
      result,
      deps,
      refs,
    );
    deps.terminal.endStream();
    if (quickReplyPayload) deps.terminal.quickReplies(quickReplyPayload);

    const response = await result.response;
    const debugTail = turnCtx
      ? {
          steps: await result.steps,
          totalUsage: await result.totalUsage,
          responseMessages: response.messages,
        }
      : null;

    const persisted = await persistAutoReplanTurn(
      deps,
      refs,
      today,
      [syntheticUser, ...response.messages],
      turnStartedAt,
    );
    if (!persisted) refs.lastQuickReplies = null;

    if (turnCtx && debugTail) {
      await writeTurnArtifact(turnCtx, {
        outcome: "ok",
        ...debugTail,
      });
    }
  } catch (err) {
    refs.lastQuickReplies = null;
    const log = await appendCliErrorLog(deps.vaultPath, err, {
      phase: "auto_replan_stream",
    });
    const logSuffix = log.ok
      ? `\nDetails logged to: ${log.path}`
      : `\nCould not write error log (${log.path}): ${log.error}`;
    deps.terminal.errorSummary(
      `\nStream error: ${formatCliError(err)}${logSuffix}`,
    );
    if (turnCtx) {
      await writeTurnArtifact(turnCtx, { outcome: "stream_error", err });
    }
  }
}

function buildSyntheticUserMessage(
  context: AutoReplanContext,
  today: string,
): string {
  const dailyByDate = new Map(
    context.dailies.map((daily) => [daily.date, daily.content]),
  );
  const sections = [
    ...dailyWindow(today, AUTO_REPLAN_DAYS_BACK).map(
      (date) =>
        `## daily/${date}.md\n${contentOrPlaceholder(dailyByDate.get(date), "(missing)")}`,
    ),
    `## tasks/next-actions.md\n${contentOrPlaceholder(context.nextActions, "(empty)")}`,
    `## tasks/waiting.md\n${contentOrPlaceholder(context.waiting, "(empty)")}`,
  ];

  return `[Day rollover for ${today}. Recent context:

${sections.join("\n")}

Use daily/${today}.md as today's current plan context, not as stale carry-over. Briefly greet the user, identify stale pending items with date/source, and offer concrete next-step options via suggest_quick_replies with a complete question field. Later chip examples: "später/verschieben/ignorieren" -> source Plan box [-] + today's Log with source date; "erledigt" -> source [x]. Keep it under ~120 words and answer in the user's language.]`;
}

function contentOrPlaceholder(
  value: string | undefined,
  placeholder: string,
): string {
  return value !== undefined && value.trim() !== "" ? value : placeholder;
}

async function consumeAutoReplanStream(
  result: StreamHandle,
  deps: TurnDeps,
  refs: TurnRefs,
): Promise<{
  quickReplyPayload: QuickRepliesResult | null;
}> {
  let quickReplyPayload: QuickRepliesResult | null = null;
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        deps.terminal.assistantText(part.text);
        break;
      case "tool-call":
        if (part.toolName !== "suggest_quick_replies") {
          deps.terminal.toolStatus(part.toolName, part.input);
        }
        break;
      case "tool-result":
        if (
          part.dynamic !== true &&
          part.toolName === "suggest_quick_replies"
        ) {
          quickReplyPayload = part.output;
          refs.lastQuickReplies = part.output.options;
        }
        break;
      case "tool-error":
        if (part.toolName === "suggest_quick_replies") {
          quickReplyPayload = null;
          refs.lastQuickReplies = null;
        } else {
          deps.terminal.toolError(part.toolName, part.error);
        }
        deps.cliLogger.warn({
          message: `tool ${part.toolName} returned an error`,
          code: "stream.tool_error",
          err: part.error,
          meta: { toolName: part.toolName, autoReplan: true },
        });
        break;
      case "error":
        throw part.error;
    }
  }
  return { quickReplyPayload };
}

async function persistAutoReplanTurn(
  deps: TurnDeps,
  refs: TurnRefs,
  today: string,
  messages: ModelMessage[],
  turnStartedAt: number,
): Promise<boolean> {
  const restore = refs.session.snapshot();
  refs.session.appendTurn(messages, turnStartedAt);
  refs.session.setAutoReplanRanFor(today);
  try {
    await deps.sessionStore.save(refs.session);
    return true;
  } catch (err) {
    restore();
    const log = await appendCliErrorLog(deps.vaultPath, err, {
      phase: "auto_replan_session_save",
    });
    const logSuffix = log.ok
      ? `\nDetails logged to: ${log.path}`
      : `\nCould not write error log (${log.path}): ${log.error}`;
    deps.terminal.errorSummary(
      `\nSession save failed after Auto-Replan stream: ${formatCliError(err)}${logSuffix}`,
    );
    return false;
  }
}

function makeFileVersionAt(
  vaultPath: string,
): (filePath: string) => number | undefined {
  return (filePath) => {
    try {
      return statSync(path.join(vaultPath, filePath)).mtimeMs;
    } catch {
      return undefined;
    }
  };
}

function dailyWindow(today: string, daysBack: number): string[] {
  const dates: string[] = [];
  for (let offset = -daysBack; offset <= 0; offset++) {
    dates.push(offsetDate(today, offset));
  }
  return dates;
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
