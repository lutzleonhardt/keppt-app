// Per-user chat state of this process: today's session (a cache of the
// session file, loaded once per day), the one in-flight turn, and the day's
// event log. Turns run detached — `startTurn` returns as soon as the engine
// is running — and nothing here couples a turn's `AbortController` to an
// HTTP connection: `cancel` is the only abort path.

import { randomUUID } from "node:crypto";
import type { LanguageModel } from "ai";
import {
  formatToday,
  runTurn,
  type FileRepository,
  type Logger,
  type ProviderOptions,
  type Session,
  type SessionStore,
  type TurnEngineDeps,
} from "@gtd/core";
import { bindLogger } from "../bind-logger.js";
import { EventLog, type EventListener, type LoggedEvent } from "./event-log.js";
import { createTurnEventSink } from "./turn-events.js";

export interface TurnRegistryDeps {
  repo: FileRepository;
  sessionStore: SessionStore;
  logger: Logger;
  model: LanguageModel;
  providerOptions: ProviderOptions;
  fileVersionAt: (filePath: string) => number | undefined;
  /** Clock behind the day boundary and each turn's "today"; defaults to the system clock. */
  now?: () => Date;
  /** First seq of a new event log; defaults to the wall clock (see `EventLog`). */
  seqSeed?: () => number;
}

export interface InFlightTurn {
  readonly turnId: string;
  readonly abort: AbortController;
  /**
   * Where the turn begins in log and session: the seq of its own
   * `turn-start` and the session's message count before it. A session load
   * during the turn shows only those messages and replays from that seq, so
   * the phase-1 user message never appears twice. `null` until the session
   * is loaded and `turn-start` is appended.
   */
  start: { readonly seq: number; readonly messagesBefore: number } | null;
}

interface UserChatState {
  session: Session | null;
  inFlight: InFlightTurn | null;
  readonly log: EventLog;
}

export interface StartTurnInput {
  userId: string;
  message: string;
  requestId: string;
}

export type StartTurnResult =
  | { status: "started"; turnId: string }
  | { status: "in_flight" };

export type AttachResult =
  | { replay: "resync" }
  | { replay: LoggedEvent[]; unsubscribe: () => void };

export class TurnRegistry {
  private readonly users = new Map<string, UserChatState>();
  private readonly now: () => Date;
  private readonly seqSeed: () => number;

  constructor(private readonly deps: TurnRegistryDeps) {
    this.now = deps.now ?? (() => new Date());
    this.seqSeed = deps.seqSeed ?? (() => Date.now());
  }

  async startTurn({
    userId,
    message,
    requestId,
  }: StartTurnInput): Promise<StartTurnResult> {
    const state = this.stateOf(userId);
    if (state.inFlight) return { status: "in_flight" };
    // One clock reading decides the day and is the turn's "today".
    const startedAt = this.now();
    // The slot is claimed before the first await so a concurrent POST sees
    // it, and before the day check so the session is never swapped under a
    // running turn.
    const inFlight: InFlightTurn = {
      turnId: randomUUID(),
      abort: new AbortController(),
      start: null,
    };
    state.inFlight = inFlight;
    let session: Session;
    try {
      session = await this.sessionForToday(state, startedAt);
    } catch (err) {
      state.inFlight = null;
      throw err;
    }
    const messagesBefore = session.messages.length;
    const { seq } = state.log.append({
      type: "turn-start",
      turnId: inFlight.turnId,
      kind: "user",
      message,
    });
    inFlight.start = { seq, messagesBefore };

    const deps = this.engineDeps(state, inFlight, userId, requestId, startedAt);
    void runTurn(deps, {
      kind: "user",
      session,
      userText: message,
      abortSignal: inFlight.abort.signal,
    }).catch((err: unknown) =>
      this.recover(state, inFlight, requestId, deps.logger, err),
    );
    return { status: "started", turnId: inFlight.turnId };
  }

  /** Aborts the in-flight turn; a no-op without one. */
  cancel(userId: string): void {
    this.users.get(userId)?.inFlight?.abort.abort();
  }

  /**
   * Replay since `cursor` plus a live subscription, in one synchronous step:
   * the sink appends from the engine's stream loop, so an `await` between
   * the two would be the only way for an event to fall between them.
   */
  attach(
    userId: string,
    cursor: number | undefined,
    listener: EventListener,
  ): AttachResult {
    const { log } = this.stateOf(userId);
    const replay = log.since(cursor);
    if (replay === "resync") return { replay };
    return { replay, unsubscribe: log.subscribe(listener) };
  }

  private stateOf(userId: string): UserChatState {
    let state = this.users.get(userId);
    if (!state) {
      state = {
        session: null,
        inFlight: null,
        log: new EventLog(this.seqSeed()),
      };
      this.users.set(userId, state);
    }
    return state;
  }

  // Loaded once per server-day. On a date change the day's events go while
  // the seq keeps counting, so an old cursor resyncs instead of replaying
  // yesterday.
  private async sessionForToday(
    state: UserChatState,
    now: Date,
  ): Promise<Session> {
    const today = formatToday(now);
    if (state.session?.date === today) return state.session;
    const session = await this.deps.sessionStore.loadOrCreate(today);
    state.session = session;
    state.log.clear();
    return session;
  }

  private engineDeps(
    state: UserChatState,
    inFlight: InFlightTurn,
    userId: string,
    requestId: string,
    startedAt: Date,
  ): TurnEngineDeps {
    const logger = bindLogger(this.deps.logger, { requestId, userId });
    return {
      repo: this.deps.repo,
      sessionStore: this.deps.sessionStore,
      logger,
      model: this.deps.model,
      providerOptions: this.deps.providerOptions,
      now: () => startedAt,
      fileVersionAt: this.deps.fileVersionAt,
      sink: createTurnEventSink({
        log: state.log,
        turnId: inFlight.turnId,
        requestId,
        logger,
        onTurnEnd: () => this.release(state, inFlight),
      }),
    };
  }

  private release(state: UserChatState, inFlight: InFlightTurn): void {
    if (state.inFlight === inFlight) state.inFlight = null;
  }

  // `runTurn` reports every failure through `turnEnd`; a rejection means the
  // engine broke its contract. The slot is freed and the turn closed out on
  // the stream anyway, so neither the user (409 forever) nor the clients hang.
  private recover(
    state: UserChatState,
    inFlight: InFlightTurn,
    requestId: string,
    logger: Logger,
    err: unknown,
  ): void {
    if (state.inFlight !== inFlight) return;
    const { turnId } = inFlight;
    logger.error({
      code: "chat.turn_crashed",
      message: "Chat turn ended without a result",
      err,
      meta: { turnId },
    });
    state.log.append({
      type: "error",
      turnId,
      error: { code: "turn_failed", message: "The turn failed", requestId },
    });
    state.log.append({ type: "turn-end", turnId, outcome: "error" });
    state.inFlight = null;
  }
}
