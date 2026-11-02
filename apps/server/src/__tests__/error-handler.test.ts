import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ErrorBody } from "@gtd/api";
import { MemoryLogger } from "@gtd/core";

import {
  ApiError,
  errorHandler,
  notFoundHandler,
} from "../middleware/error-handler.js";
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
} from "../middleware/request-id.js";

const PROVIDER_SECRET = "provider body: sk-live-secret";

function appWithFailingRoutes(logger: MemoryLogger) {
  const app = express();
  app.use(requestIdMiddleware(logger));
  app.get("/boom", () => {
    throw Object.assign(new Error(PROVIDER_SECRET), {
      responseBody: PROVIDER_SECRET,
    });
  });
  app.get("/boom-async", async () => {
    await Promise.resolve();
    throw new Error(PROVIDER_SECRET);
  });
  app.get("/conflict", (_req, _res, next) => {
    next(new ApiError(409, "turn_in_flight", "A turn is already running"));
  });
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}

describe("errorHandler", () => {
  it("maps a sync throw to the stable internal_error shape without leaking details", async () => {
    const logger = new MemoryLogger();
    const res = await request(appWithFailingRoutes(logger)).get("/boom");

    expect(res.status).toBe(500);
    const body = res.body as ErrorBody;
    expect(body).toEqual({
      error: {
        code: "internal_error",
        message: "Internal server error",
        requestId: res.headers[REQUEST_ID_HEADER.toLowerCase()],
      },
    });
    expect(res.text).not.toContain(PROVIDER_SECRET);
    expect(res.text).not.toMatch(/stack|\n\s+at /);
  });

  it("maps an async rejection the same way (Express 5 promise handling)", async () => {
    const logger = new MemoryLogger();
    const res = await request(appWithFailingRoutes(logger)).get("/boom-async");
    expect(res.status).toBe(500);
    expect((res.body as ErrorBody).error.code).toBe("internal_error");
    expect(res.text).not.toContain(PROVIDER_SECRET);
  });

  it("logs the unhandled error once with requestId, err, and route metadata", async () => {
    const logger = new MemoryLogger();
    const res = await request(appWithFailingRoutes(logger)).get("/boom");

    const events = logger.byCode("http.unhandled_error");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: "error",
      requestId: (res.body as ErrorBody).error.requestId,
      meta: { method: "GET", path: "/boom", status: 500 },
    });
    expect(events[0]?.err).toBeInstanceOf(Error);
  });

  it("passes an ApiError through with its status, code and message, unlogged", async () => {
    const logger = new MemoryLogger();
    const res = await request(appWithFailingRoutes(logger)).get("/conflict");

    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error).toMatchObject({
      code: "turn_in_flight",
      message: "A turn is already running",
    });
    expect((res.body as ErrorBody).error.requestId).toBeTruthy();
    expect(logger.events).toHaveLength(0);
  });

  it("answers unknown routes with a not_found error in the same shape", async () => {
    const logger = new MemoryLogger();
    const res = await request(appWithFailingRoutes(logger)).get("/nope");

    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error).toMatchObject({
      code: "not_found",
      requestId: res.headers[REQUEST_ID_HEADER.toLowerCase()],
    });
  });

  it("rejects a code outside API_ERROR_CODES at compile time", () => {
    // @ts-expect-error — `code` is the closed `ApiErrorCode` union, not string
    const error = new ApiError(409, "no_such_code", "typo in the code");
    expect(error).toBeInstanceOf(ApiError);
  });
});
