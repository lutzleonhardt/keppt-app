// The turn pipeline shared by every entrypoint: persist typed input (Phase
// 1, user turns only), stream the model with the per-turn tool set, report
// progress to a `TurnSink`, persist the response (Phase 2), write the
// optional debug artifact. Entrypoints own everything around it — the turn
// clock, day rollover, error rendering, and the concrete repository, store
// and model.

import {
  hasToolCall,
  isStepCount,
  streamText,
  type JSONValue,
  type LanguageModel,
  type ModelMessage,
  type SystemModelMessage,
} from "ai";
import type { FileRepository } from "./file-repository.js";
import type { Logger } from "./logging.js";
import { buildRequest, type BuildRequestResult } from "./request-builder.js";
import type { Session, SessionStore } from "./sessions.js";
import { buildTools, type QuickRepliesResult } from "./tools.js";
import { writeTurnArtifact, type TurnLogContext } from "./turn-artifact.js";
import type { TurnLogger } from "./turn-log.js";
import type { TurnResult, TurnSink } from "./turn-sink.js";

const MAX_STEPS = 10;

/** The shape `streamText` accepts as `providerOptions`; `ai` does not re-export it. */
export type ProviderOptions = Record<string, Record<string, JSONValue>>;

export interface TurnEngineDeps {
  repo: FileRepository;
  sessionStore: SessionStore;
  logger: Logger;
  model: LanguageModel;
  /**
   * Must make the provider dispatch tool calls sequentially (Anthropic
   * `disableParallelToolUse`, OpenAI `parallelToolCalls: false`): the
   * `edit_file` retry budget inside `buildTools` assumes it.
   */
  providerOptions: ProviderOptions;
  /** The turn's "today" — shared by the system prompt and the tool gates. */
  now: () => Date;
  /**
   * Current version of a vault file (mtime locally, `updated_at` on a
   * backend), compared by the pruner against message stamps. Synchronous
   * because `buildRequest` is a pure transform.
   */
  fileVersionAt: (filePath: string) => number | undefined;
  /** Per-turn debug artifact; omitted means none is written. */
  turnLogger?: TurnLogger;
  sink: TurnSink;
}

export interface UserTurnInput {
  kind: "user";
  session: Session;
  userText: string;
  abortSignal: AbortSignal;
}

/**
 * The Auto-Replan opener. `openerMessages` (see `buildAutoReplanOpener`)
 * exist only in the request until the response arrives, then land in the
 * session together with it in one save. Not abortable.
 */
export interface OpenerTurnInput {
  kind: "opener";
  session: Session;
  openerMessages: ModelMessage[];
}

export type TurnInput = UserTurnInput | OpenerTurnInput;

type StreamHandle = ReturnType<
  typeof streamText<ReturnType<typeof buildTools>>
>;

export async function runTurn(
  deps: TurnEngineDeps,
  turn: TurnInput,
): Promise<TurnResult> {
  const result = await executeTurn(deps, turn);
  deps.sink.turnEnd(result);
  return result;
}

async function executeTurn(
  deps: TurnEngineDeps,
  turn: TurnInput,
): Promise<TurnResult> {
  // Wall clock, not `now()`: stamps are compared against file mtimes.
  const turnStartedAt = Date.now();
  const opened = await openTurn(deps, turn, turnStartedAt);
  if (!opened.ok) {
    return { outcome: "error", phase: "session_save_phase1", err: opened.err };
  }
  return streamTurn(deps, turn, opened.unsaved, turnStartedAt);
}

// Build the request, stream, report to the sink, persist the turn in one
// save, write the artifact. `unsaved` are the turn's messages the session
// does not hold yet (see `openTurn`).
async function streamTurn(
  deps: TurnEngineDeps,
  turn: TurnInput,
  unsaved: ModelMessage[],
  turnStartedAt: number,
): Promise<TurnResult> {
  const { session } = turn;
  const abortSignal = turn.kind === "user" ? turn.abortSignal : undefined;

  // Rebuilt per turn: the edit_file retry budget lives in this closure and
  // must not leak into the next turn.
  const tools = buildTools(deps.repo, { now: deps.now, logger: deps.logger });
  const recorder = createTurnRecorder(deps, turnStartedAt);
  try {
    const { system, messages } = buildTurnRequest(
      deps,
      session,
      unsaved,
      turnStartedAt,
    );
    recorder.requestBuilt(system, messages);

    const result = streamText({
      model: deps.model,
      // The SystemModelMessage object and the trailing user message carry
      // the Anthropic cache markers on their `providerOptions`; passing
      // `system` as a string would silently disable prompt caching.
      system,
      messages,
      tools,
      stopWhen: [hasToolCall("suggest_quick_replies"), isStepCount(MAX_STEPS)],
      abortSignal,
      providerOptions: deps.providerOptions,
      // The SDK default logs raw stream errors to stderr; the error part is
      // rethrown below and reported through the structured result instead.
      onError: () => {},
    });

    const { quickReplies, aborted } = await consumeStream(result, deps, turn);
    if (aborted) {
      await recorder.aborted();
      return { outcome: "aborted" };
    }
    if (quickReplies) deps.sink.quickReplies(quickReplies);

    const response = await result.response;
    const phase2 = await saveAtomically(deps.sessionStore, session, () =>
      session.appendTurn(
        [...unsaved, ...response.messages],
        turnStartedAt,
        turn.kind,
      ),
    );

    await recorder.completed(result, response.messages);

    return phase2.ok
      ? { outcome: "ok" }
      : { outcome: "error", phase: "session_save_phase2", err: phase2.err };
  } catch (err) {
    if (abortSignal?.aborted) {
      await recorder.aborted();
      return { outcome: "aborted" };
    }
    await recorder.failed(err);
    return { outcome: "error", phase: "stream", err };
  }
}

type SaveOutcome = { ok: true } | { ok: false; err: unknown };

// `session.messages` flows in as-is: the pruner looks stamps up by object
// identity (`createdAtOf`), so nothing may rebuild the messages between the
// session and the request. `unsaved` messages are not in the session yet and
// carry this turn's stamp.
function buildTurnRequest(
  deps: TurnEngineDeps,
  session: Session,
  unsaved: readonly ModelMessage[],
  turnStartedAt: number,
): BuildRequestResult {
  return buildRequest({
    today: deps.now(),
    messages: [...session.messages, ...unsaved],
    fileVersionAt: deps.fileVersionAt,
    messageCreatedAt: (msg) =>
      unsaved.includes(msg)
        ? turnStartedAt
        : (session.createdAtOf(msg) ?? Date.now()),
  });
}

// What a turn adds to the request before the session holds it. A user turn
// saves its message first (Phase 1) so typed input survives a crash
// mid-stream and `unsaved` is empty afterwards; the opener has nothing to
// protect and must leave nothing behind on failure, so its prefix stays
// unsaved until the final save.
async function openTurn(
  deps: TurnEngineDeps,
  turn: TurnInput,
  turnStartedAt: number,
): Promise<
  { ok: true; unsaved: ModelMessage[] } | { ok: false; err: unknown }
> {
  if (turn.kind === "opener") return { ok: true, unsaved: turn.openerMessages };
  const userMessage: ModelMessage = { role: "user", content: turn.userText };
  const phase1 = await saveAtomically(deps.sessionStore, turn.session, () =>
    turn.session.appendTurn([userMessage], turnStartedAt, turn.kind),
  );
  return phase1.ok ? { ok: true, unsaved: [] } : phase1;
}

// Every message of a turn carries the same stamp, `turnStartedAt`: it is
// strictly less than any file mtime the turn produces, so a same-turn read →
// edit of one file leaves the read looking older than the edit and the
// pruner's drift check fires next turn. On a failed save the in-memory
// mutation is rolled back so no later prompt is built from messages that
// never reached the store.
async function saveAtomically(
  store: SessionStore,
  session: Session,
  mutate: () => void,
): Promise<SaveOutcome> {
  const restore = session.snapshot();
  mutate();
  try {
    await store.save(session);
    return { ok: true };
  } catch (err) {
    restore();
    return { ok: false, err };
  }
}

interface TurnRecorder {
  requestBuilt(system: SystemModelMessage, messages: ModelMessage[]): void;
  completed(
    result: StreamHandle,
    responseMessages: ModelMessage[],
  ): Promise<void>;
  aborted(): Promise<void>;
  failed(err: unknown): Promise<void>;
}

// Debug-artifact lifecycle of one turn. Without a `turnLogger` every method
// is a no-op, which also keeps the `prompt.cache_usage` debug event out of
// non-debug runs. The context exists only once the request is built, so a
// Phase-1 failure never produces an artifact.
function createTurnRecorder(
  deps: TurnEngineDeps,
  turnStartedAt: number,
): TurnRecorder {
  let ctx: TurnLogContext | null = null;
  return {
    requestBuilt: (system, messages) => {
      if (!deps.turnLogger) return;
      ctx = {
        turnLogger: deps.turnLogger,
        turnId: deps.turnLogger.nextTurnId(),
        startedAtMs: turnStartedAt,
        model: modelIdOf(deps.model),
        system: typeof system.content === "string" ? system.content : "",
        messages,
        providerOptions: deps.providerOptions,
        logger: deps.logger,
      };
    },
    completed: async (result, responseMessages) => {
      if (!ctx) return;
      // `totalUsage` resolves once per stream; share it between the
      // artifact and the cache-usage debug event.
      const usage = await result.totalUsage;
      await writeTurnArtifact(ctx, {
        outcome: "ok",
        steps: await result.steps,
        totalUsage: usage,
        responseMessages,
      });
      deps.logger.debug({
        message: "prompt cache usage",
        code: "prompt.cache_usage",
        meta: {
          cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
          cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
          noCacheTokens: usage.inputTokenDetails?.noCacheTokens,
          outputTokens: usage.outputTokens,
        },
      });
    },
    aborted: async () => {
      if (ctx) await writeTurnArtifact(ctx, { outcome: "aborted" });
    },
    failed: async (err) => {
      if (ctx) await writeTurnArtifact(ctx, { outcome: "stream_error", err });
    },
  };
}

async function consumeStream(
  result: StreamHandle,
  { sink, logger }: TurnEngineDeps,
  turn: TurnInput,
): Promise<{ quickReplies: QuickRepliesResult | null; aborted: boolean }> {
  // Quick replies come only from the validated tool result. The SDK also
  // emits an `invalid: true` tool-call before a validation tool-error, and
  // raw call input would render and persist rejected labels.
  let quickReplies: QuickRepliesResult | null = null;
  let aborted = false;
  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        sink.assistantText(part.text);
        break;
      case "tool-call":
        if (part.toolName !== "suggest_quick_replies") {
          sink.toolStart(part.toolCallId, part.toolName, part.input);
        }
        break;
      case "tool-result":
        if (part.toolName !== "suggest_quick_replies") {
          sink.toolEnd(part.toolCallId, part.toolName);
        } else if (part.dynamic !== true) {
          // Static results come from our validated local tool execution;
          // excluding the SDK's dynamic variant keeps `output` typed.
          quickReplies = part.output;
        }
        break;
      case "tool-error":
        if (part.toolName === "suggest_quick_replies") {
          quickReplies = null;
        } else {
          sink.toolError(part.toolCallId, part.toolName, part.error);
        }
        logger.warn({
          message: `tool ${part.toolName} returned an error`,
          code: "stream.tool_error",
          err: part.error,
          meta: { toolName: part.toolName, origin: turn.kind },
        });
        break;
      case "error":
        throw part.error;
      case "abort":
        // After a completed step the SDK ends an aborted stream with this
        // part instead of an error, and `result.response` would resolve
        // with the partial turn — which must never reach Phase 2.
        aborted = true;
        break;
    }
  }
  return { quickReplies, aborted };
}

function modelIdOf(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}
