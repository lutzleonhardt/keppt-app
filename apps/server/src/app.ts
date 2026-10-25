import express, { type Express } from "express";
import type { FileRepository, Logger } from "@gtd/core";
import { authStubMiddleware } from "./middleware/auth-stub.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { dailyNotesRouter } from "./routes/daily-notes.js";
import { filesRouter } from "./routes/files.js";

export interface CreateAppOptions {
  logger: Logger;
  devUserId: string;
  fileRepository: FileRepository;
  /** Clock behind date-dependent responses (`isToday`); defaults to the system clock. */
  now?: () => Date;
}

// App factory without `listen` so endpoint tests run in-process via
// supertest. Middleware order is the contract: request-id first, health
// before auth (probes carry no credentials), routes after auth, 404 and
// error handler last.
export function createApp({
  logger,
  devUserId,
  fileRepository,
  now = () => new Date(),
}: CreateAppOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestIdMiddleware(logger));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(authStubMiddleware(devUserId));

  app.use(filesRouter(fileRepository, now));
  app.use(dailyNotesRouter(fileRepository, now));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
