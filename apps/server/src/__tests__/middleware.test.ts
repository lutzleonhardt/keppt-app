import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { MemoryLogger } from "@gtd/core";

import { authStubMiddleware } from "../middleware/auth-stub.js";
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
} from "../middleware/request-id.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("requestIdMiddleware + authStubMiddleware", () => {
  it("mints a UUID per request, exposes it as header, and binds requestId + userId into req.log", async () => {
    const logger = new MemoryLogger();
    const app = express();
    app.use(requestIdMiddleware(logger));
    app.use(authStubMiddleware("lutz"));
    app.get("/echo", (req, res) => {
      req.log.info({ message: "handled", code: "test.echo" });
      res.json({ requestId: req.requestId, userId: req.userId });
    });

    const first = await request(app).get("/echo");
    const second = await request(app).get("/echo");

    const headerId = first.headers[REQUEST_ID_HEADER.toLowerCase()];
    expect(headerId).toMatch(UUID);
    expect(first.body).toEqual({ requestId: headerId, userId: "lutz" });
    expect(second.body.requestId).not.toBe(headerId);

    expect(logger.byCode("test.echo")).toHaveLength(2);
    expect(logger.byCode("test.echo")[0]).toMatchObject({
      requestId: headerId,
      userId: "lutz",
    });
  });

  it("lets an event's own correlation field win over the bound one", async () => {
    const logger = new MemoryLogger();
    const app = express();
    app.use(requestIdMiddleware(logger));
    app.use(authStubMiddleware("lutz"));
    app.get("/other", (req, res) => {
      req.log.warn({
        message: "x",
        code: "test.other",
        userId: "someone-else",
      });
      res.end();
    });

    await request(app).get("/other");
    expect(logger.byCode("test.other")[0]?.userId).toBe("someone-else");
  });
});
