import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "@gtd/core";

// The one way for a route to produce a client-facing error with a stable
// code. Anything else that reaches the error handler is an `internal_error`
// with a generic message.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ErrorBody {
  error: { code: string; message: string; requestId: string };
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, "not_found", "Route not found"));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const requestId = req.requestId;
    if (err instanceof ApiError) {
      const body: ErrorBody = {
        error: { code: err.code, message: err.message, requestId },
      };
      res.status(err.status).json(body);
      return;
    }
    (req.log ?? logger).error({
      code: "http.unhandled_error",
      message: "Unhandled error while handling request",
      err,
      meta: { method: req.method, path: req.path, status: 500 },
    });
    const body: ErrorBody = {
      error: {
        code: "internal_error",
        message: "Internal server error",
        requestId,
      },
    };
    res.status(500).json(body);
  };
}
