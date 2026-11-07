import type { Response } from "express";
import type { LoggedEvent } from "./event-log.js";

export interface SseStream {
  event(entry: LoggedEvent): void;
  /** Control event without an id. */
  resync(): void;
  end(): void;
}

// Opens the response as an event stream and flushes the headers at once, so
// proxies and the browser see a live connection before the first event.
// `X-Accel-Buffering: no` stops nginx-style proxies from buffering; the
// comment line every `keepAliveMs` keeps idle streams from being cut. Writes
// after the client went away are dropped: the log unsubscribes on `close`,
// but an event may already be in flight.
export function openSseStream(res: Response, keepAliveMs: number): SseStream {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (frame: string): void => {
    if (!res.writableEnded && !res.destroyed) res.write(frame);
  };
  const keepAlive = setInterval(() => write(": keep-alive\n\n"), keepAliveMs);
  keepAlive.unref();
  res.on("close", () => clearInterval(keepAlive));

  return {
    event: ({ seq, event }) => {
      write(
        `id: ${seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      );
    },
    resync: () => write("event: resync\ndata: {}\n\n"),
    end: () => {
      res.end();
    },
  };
}
