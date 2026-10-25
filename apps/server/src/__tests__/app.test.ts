import request from "supertest";
import { describe, expect, it } from "vitest";
import { InMemoryFileRepository, MemoryLogger } from "@gtd/core";

import { createApp } from "../app.js";

describe("createApp", () => {
  it("GET /api/health → 200 { status: ok } with a request id header", async () => {
    const app = createApp({
      logger: new MemoryLogger(),
      devUserId: "lutz",
      fileRepository: new InMemoryFileRepository(),
    });
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("unknown /api routes get the JSON error shape, not an HTML page", async () => {
    const app = createApp({
      logger: new MemoryLogger(),
      devUserId: "lutz",
      fileRepository: new InMemoryFileRepository(),
    });
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toMatchObject({
      code: "not_found",
      requestId: res.headers["x-request-id"],
    });
  });
});
