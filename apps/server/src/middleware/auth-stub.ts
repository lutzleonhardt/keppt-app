import type { RequestHandler } from "express";
import { bindLogger } from "../bind-logger.js";

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

// Dev-path authentication: every request belongs to the configured user.
// This is the single place a JWT branch replaces later; routes only ever
// see `req.userId`. Requires `requestIdMiddleware` to have run (uses
// `req.log`).
export function authStubMiddleware(devUserId: string): RequestHandler {
  return (req, _res, next) => {
    req.userId = devUserId;
    req.log = bindLogger(req.log, { userId: devUserId });
    next();
  };
}
