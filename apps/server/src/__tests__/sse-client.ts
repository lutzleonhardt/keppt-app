import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { startServer } from "../start-server.js";

// supertest buffers the whole response, so a stream can only be observed
// against a real listener: `listen(0)` + `fetch` with a frame parser.

export interface SseFrame {
  id?: string;
  event: string;
  data: string;
}

export interface SseConnection {
  readonly status: number;
  readonly headers: Headers;
  readonly frames: SseFrame[];
  /** Comment lines (`: …`), i.e. the keep-alive ticks. */
  readonly comments: string[];
  /** Resolves once the server ended the stream. */
  readonly ended: Promise<void>;
  /** The first frame matching `predicate`, waiting for it to arrive. */
  waitFor(predicate: (frame: SseFrame) => boolean): Promise<SseFrame>;
  abort(): void;
}

export async function listen(
  app: Express,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = await startServer(app, 0);
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export async function openSse(
  baseUrl: string,
  cursor?: number,
): Promise<SseConnection> {
  const controller = new AbortController();
  const query = cursor === undefined ? "" : `?cursor=${cursor}`;
  const res = await fetch(`${baseUrl}/api/chat/stream${query}`, {
    signal: controller.signal,
  });
  const frames: SseFrame[] = [];
  const comments: string[] = [];
  const waiters = new Set<() => void>();
  const notify = (): void => {
    for (const waiter of waiters) waiter();
    waiters.clear();
  };
  let done = false;

  const ended = (async () => {
    try {
      if (res.body) {
        await readBlocks(res.body, (block) => {
          parseBlock(block, frames, comments);
          notify();
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) throw err;
    } finally {
      done = true;
      notify();
    }
  })();

  return {
    status: res.status,
    headers: res.headers,
    frames,
    comments,
    ended,
    waitFor: async (predicate) => {
      for (;;) {
        const hit = frames.find(predicate);
        if (hit) return hit;
        if (done) throw new Error("stream ended before the expected frame");
        await new Promise<void>((resolve) => waiters.add(resolve));
      }
    },
    abort: () => controller.abort(),
  };
}

// Splits the body into SSE blocks (`\n\n`-terminated) and hands each one
// over as it completes; resolves when the server ends the stream.
async function readBlocks(
  body: ReadableStream<Uint8Array>,
  onBlock: (block: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      onBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function parseBlock(
  block: string,
  frames: SseFrame[],
  comments: string[],
): void {
  const frame: SseFrame = { event: "message", data: "" };
  let sawField = false;
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) {
      comments.push(line);
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon);
    const value = line.slice(colon + 1).replace(/^ /, "");
    sawField = true;
    if (field === "id") frame.id = value;
    else if (field === "event") frame.event = value;
    else if (field === "data") frame.data = value;
  }
  if (sawField) frames.push(frame);
}
