import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MemoryTurnLogger,
  NoopTurnLogger,
  type TurnLogRecord,
} from "../turn-log.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function makeRecord(turnId: string): TurnLogRecord {
  return {
    turnId,
    startedAt: "2026-05-19T10:00:00.000Z",
    endedAt: "2026-05-19T10:00:01.000Z",
    durationMs: 1_000,
    model: "claude-haiku-4-5",
    outcome: "ok",
    initialRequest: {
      system: "system prompt",
      messages: [{ role: "user", content: "hi" }],
      providerOptions: { anthropic: { disableParallelToolUse: true } },
    },
  };
}

describe("turn-log", () => {
  it("T4.2-AC-12: NoopTurnLogger.writeTurn resolves without side effects", async () => {
    const logger = new NoopTurnLogger();
    await expect(logger.writeTurn(makeRecord("turn-001"))).resolves.toBeUndefined();
  });

  it("T4.2-AC-12: MemoryTurnLogger records appended in call order", async () => {
    const logger = new MemoryTurnLogger();
    await logger.writeTurn(makeRecord("turn-001"));
    await logger.writeTurn(makeRecord("turn-002"));
    await logger.writeTurn(makeRecord("turn-003"));

    expect(logger.records).toHaveLength(3);
    expect(logger.records.map((r) => r.turnId)).toEqual([
      "turn-001",
      "turn-002",
      "turn-003",
    ]);
    expect(logger.records[0]?.initialRequest.system).toBe("system prompt");
  });

  it("T4.2-AC-13: turn-log.ts imports no node:fs and uses no console.*", async () => {
    const source = await readFile(
      path.resolve(here, "../turn-log.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']node:fs["']/);
    expect(source).not.toMatch(/from\s+["']node:fs\/promises["']/);
    expect(source).not.toMatch(/\bconsole\.\w+\s*\(/);
  });
});
