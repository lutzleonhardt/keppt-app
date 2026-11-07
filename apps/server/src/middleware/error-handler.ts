import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApiErrorCode, ErrorBody } from "@gtd/api";
import type { Logger } from "@gtd/core";

// The one way for a route to produce a client-facing error with a stable
// code. Anything else that reaches the error handler is an `internal_error`
// with a generic message.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
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
    const apiError = err instanceof ApiError ? err : asInvalidRequest(err);
    if (apiError) {
      const body: ErrorBody = {
        error: { code: apiError.code, message: apiError.message, requestId },
      };
      res.status(apiError.status).json(body);
      return;
    }
    // Errors the router raises with their own `status` (e.g. `URIError` 400 on
    // malformed percent-encoding in `/api/files/%zz`) deliberately land here
    // as 500: clients send fixed vault paths, so such a request is a client
    // bug worth an error log line.
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

// Body-parser rejections (malformed JSON, oversized or mis-encoded bodies)
// carry a dotted `type` such as `entity.parse.failed` and a 4xx status. They
// are the client's fault and get one stable code; the parser's own wording
// stays out of the response.
function asInvalidRequest(err: unknown): ApiError | undefined {
  if (!(err instanceof Error)) return undefined;
  const { type, status } = err as Error & { type?: unknown; status?: unknown };
  const isClientError =
    typeof status === "number" && status >= 400 && status < 500;
  return typeof type === "string" && isClientError
    ? new ApiError(400, "invalid_request", "Malformed request body")
    : undefined;
}
