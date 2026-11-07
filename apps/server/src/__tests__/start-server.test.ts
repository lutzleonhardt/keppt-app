import { createServer, type AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { InMemoryFileRepository, MemoryLogger } from "@gtd/core";

import { createApp } from "../app.js";
import { startServer } from "../start-server.js";
import { stubTurnRegistry } from "./chat-harness.js";

function app() {
  return createApp({
    logger: new MemoryLogger(),
    devUserId: "lutz",
    fileRepository: new InMemoryFileRepository(),
    turnRegistry: stubTurnRegistry(),
  });
}

describe("startServer", () => {
  it("resolves with the listening server", async () => {
    const server = await startServer(app(), 0);
    expect((server.address() as AddressInfo).port).toBeGreaterThan(0);
    await new Promise((done) => server.close(done));
  });

  it("rejects with EADDRINUSE when the port is taken instead of reporting success", async () => {
    const blocker = createServer();
    await new Promise<void>((done) => blocker.listen(0, done));
    const port = (blocker.address() as AddressInfo).port;
    try {
      await expect(startServer(app(), port)).rejects.toMatchObject({
        code: "EADDRINUSE",
      });
    } finally {
      await new Promise((done) => blocker.close(done));
    }
  });
});
