import express, { type Express } from "express";
import type { Logger } from "@gtd/core";
import { authStubMiddleware } from "./middleware/auth-stub.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestIdMiddleware } from "./middleware/request-id.js";

export interface CreateAppOptions {
  logger: Logger;
  devUserId: string;
}

// App factory without `listen` so endpoint tests run in-process via
// supertest. Middleware order is the contract: request-id first, health
// before auth (probes carry no credentials), 404 and error handler last.
export function createApp({ logger, devUserId }: CreateAppOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestIdMiddleware(logger));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(authStubMiddleware(devUserId));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
