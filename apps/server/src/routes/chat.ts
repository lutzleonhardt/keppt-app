import express, { type Router } from "express";
import type { ChatAcceptedBody } from "@gtd/api";
import { validateUserInput } from "@gtd/core";
import { ApiError } from "../middleware/error-handler.js";
import { openSseStream } from "../chat/sse.js";
import type { TurnRegistry } from "../chat/turn-registry.js";

export interface ChatRouterOptions {
  /** Interval of the SSE comment line that keeps idle streams alive. */
  keepAliveMs?: number;
}

const DEFAULT_KEEP_ALIVE_MS = 15_000;

// `POST /api/chat` is a command answered with 202; everything the turn
// produces reaches clients through the event stream. A client dropping the
// stream only unsubscribes — the turn runs on, and only `/cancel` aborts.
export function chatRouter(
  registry: TurnRegistry,
  { keepAliveMs = DEFAULT_KEEP_ALIVE_MS }: ChatRouterOptions = {},
): Router {
  const router = express.Router();

  router.post("/api/chat", express.json(), async (req, res) => {
    const message = messageOf(req.body);
    if (message === undefined) {
      throw new ApiError(400, "invalid_request", "`message` must be a string");
    }
    // Core's pre-model gate (length cap + code-paste heuristic) sees the
    // whole submission here, which is what it was written for.
    const validation = validateUserInput(message);
    if (!validation.ok) {
      throw new ApiError(400, "input_rejected", validation.message);
    }
    const started = await registry.startTurn({
      userId: req.userId,
      message,
      requestId: req.requestId,
    });
    if (started.status === "in_flight") {
      throw new ApiError(409, "turn_in_flight", "A turn is already running");
    }
    const body: ChatAcceptedBody = { turnId: started.turnId };
    res.status(202).json(body);
  });

  router.post("/api/chat/cancel", (req, res) => {
    registry.cancel(req.userId);
    res.status(204).end();
  });

  router.get("/api/chat/stream", (req, res) => {
    const cursor = parseCursor(req.query.cursor);
    const stream = openSseStream(res, keepAliveMs);
    const attached = registry.attach(req.userId, cursor, stream.event);
    if (attached.replay === "resync") {
      stream.resync();
      stream.end();
      return;
    }
    for (const entry of attached.replay) stream.event(entry);
    res.on("close", attached.unsubscribe);
  });

  return router;
}

function messageOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { message } = body as Record<string, unknown>;
  return typeof message === "string" ? message : undefined;
}

// A missing cursor means "the whole log"; a syntactically broken one is a
// client bug and gets 400, unlike a stale one, which the log answers with
// `resync`.
function parseCursor(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    const cursor = Number(raw);
    if (Number.isSafeInteger(cursor)) return cursor;
  }
  throw new ApiError(400, "invalid_request", "`cursor` must be an integer");
}
