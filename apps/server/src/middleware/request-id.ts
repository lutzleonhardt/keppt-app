import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "@gtd/core";
import { bindLogger } from "../bind-logger.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      /** Logger carrying this request's correlation fields. */
      log: Logger;
    }
  }
}

export const REQUEST_ID_HEADER = "X-Request-Id";

// First middleware in the chain: every later handler and every log line of
// the request can rely on `req.requestId` and `req.log`. The header lets a
// client-visible error be matched to the server log.
export function requestIdMiddleware(logger: Logger): RequestHandler {
  return (req, res, next) => {
    req.requestId = randomUUID();
    req.log = bindLogger(logger, { requestId: req.requestId });
    res.setHeader(REQUEST_ID_HEADER, req.requestId);
    next();
  };
}
