import type { Server } from "node:http";
import type { Express } from "express";

// Express 5 hands listen errors (EADDRINUSE and friends) to the listen
// callback as its first argument and swallows the event. A callback that
// ignores that argument reports success and lets the process exit 0, so
// success is only signalled once the server is actually listening.
export function startServer(app: Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, (err?: Error) => {
      if (err) reject(err);
      else resolve(server);
    });
  });
}
