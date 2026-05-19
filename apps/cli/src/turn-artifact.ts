import type { ModelMessage, StepResult, ToolSet } from "ai";
import type { Logger, TurnLogRecord, TurnLogger } from "@gtd/core";

/**
 * Per-turn context the artifact writer needs across all three exit paths
 * (ok / stream_error / aborted). Built once after `buildRequest` returns,
 * captured by the streamText try-block and its catch arm so each exit
 * path can hand the writer one object instead of repeating the same field
 * literals.
 */
export interface TurnLogContext {
  turnLogger: TurnLogger;
  turnId: string;
  startedAtMs: number;
  model: string;
  system: string;
  messages: readonly ModelMessage[];
  providerOptions: unknown;
  cliLogger: Logger;
}

/**
 * Tail data for one turn keyed by outcome. The shape matches the
 * outcome-specific fields on `TurnLogRecord`.
 */
export type TurnOutcomeInput =
  | {
      outcome: "ok";
      steps: ReadonlyArray<StepResult<ToolSet>>;
      // `unknown` matches the on-disk shape on `TurnLogRecord.totalUsage`
      // and lets tests substitute a minimal usage shape without committing
      // to whichever variant of `LanguageModelUsage` the SDK version exposes.
      totalUsage: unknown;
      responseMessages: ModelMessage[];
    }
  | { outcome: "aborted" }
  | { outcome: "stream_error"; err: unknown };

/**
 * Assemble the per-turn artifact and dispatch it to the logger. Logs the
 * common stream-time fields plus the outcome-specific tail. Failures from
 * the underlying `writeTurn` are caught and surfaced via the CLI logger
 * (`code: "turn_log.write_failed"`) — debug logging must not bubble into
 * the REPL.
 */
export async function writeTurnArtifact(
  ctx: TurnLogContext,
  outcome: TurnOutcomeInput,
): Promise<void> {
  const endedAt = Date.now();
  const base = {
    turnId: ctx.turnId,
    startedAt: new Date(ctx.startedAtMs).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationMs: endedAt - ctx.startedAtMs,
    model: ctx.model,
    initialRequest: {
      system: ctx.system,
      messages: [...ctx.messages],
      providerOptions: ctx.providerOptions,
    },
  };
  let record: TurnLogRecord;
  switch (outcome.outcome) {
    case "ok":
      record = {
        ...base,
        outcome: "ok",
        steps: outcome.steps.map((s, i) => ({
          stepIndex: i,
          finishReason: s.finishReason,
          text: s.text,
          toolCalls: s.toolCalls as unknown[],
          toolResults: s.toolResults as unknown[],
          usage: s.usage,
          warnings: s.warnings as unknown[] | undefined,
        })),
        totalUsage: outcome.totalUsage,
        responseMessages: outcome.responseMessages,
      };
      break;
    case "aborted":
      record = { ...base, outcome: "aborted" };
      break;
    case "stream_error": {
      const errObj = outcome.err as Error | undefined;
      record = {
        ...base,
        outcome: "stream_error",
        error: {
          name: errObj?.name ?? "Error",
          message: errObj?.message ?? String(outcome.err),
        },
      };
      break;
    }
  }
  try {
    await ctx.turnLogger.writeTurn(record);
  } catch (writeErr) {
    ctx.cliLogger.warn({
      message: "turn log write failed",
      code: "turn_log.write_failed",
      err: writeErr,
      meta: { turnId: ctx.turnId },
    });
  }
}
