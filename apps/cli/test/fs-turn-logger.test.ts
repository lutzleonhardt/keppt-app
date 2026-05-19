import * as nodeFs from "node:fs/promises";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  FsTurnLogger,
  type FsTurnLoggerOps,
} from "../src/fs-turn-logger.js";
import type { TurnLogRecord } from "@gtd/core";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tempDirs.map((d) => rm(d, { recursive: true, force: true })),
  );
  tempDirs.length = 0;
});

async function makeVault(): Promise<string> {
  const d = await mkdtemp(path.join(tmpdir(), "gtd-fs-turn-logger-"));
  tempDirs.push(d);
  return d;
}

function sessionDir(vault: string, date: string): string {
  return path.join(vault, ".keppt", "logs", "sessions", date);
}

function makeRecord(turnId: string, extras?: Partial<TurnLogRecord>): TurnLogRecord {
  return {
    turnId,
    startedAt: "2026-05-19T10:00:00.000Z",
    endedAt: "2026-05-19T10:00:01.000Z",
    durationMs: 1_000,
    model: "claude-haiku-4-5",
    outcome: "ok",
    initialRequest: {
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      providerOptions: { anthropic: { disableParallelToolUse: true } },
    },
    ...extras,
  };
}

describe("FsTurnLogger", () => {
  it("T4.2-AC-03: writeTurn lands the artifact via a same-directory tmp file + rename", async () => {
    const vault = await makeVault();
    const renameCalls: Array<[string, string]> = [];
    const recordingFs: FsTurnLoggerOps = {
      mkdir: nodeFs.mkdir,
      readdir: nodeFs.readdir,
      writeFile: nodeFs.writeFile,
      rename: async (from, to) => {
        renameCalls.push([from as string, to as string]);
        return nodeFs.rename(from, to);
      },
    };
    const logger = await FsTurnLogger.create(vault, "2026-05-19", recordingFs);
    const id = logger.nextTurnId();
    await logger.writeTurn(makeRecord(id));

    expect(renameCalls).toHaveLength(1);
    const [from, to] = renameCalls[0]!;
    const finalPath = path.join(sessionDir(vault, "2026-05-19"), "turn-001.json");
    expect(to).toBe(finalPath);
    expect(path.dirname(from)).toBe(path.dirname(finalPath));
    expect(from).not.toBe(finalPath);
    expect(path.basename(from)).toMatch(/^turn-001\.json\.tmp\./);
  });

  it("T4.2-AC-04: counter seeds from existing turn-NNN.json so the next id is turn-(max+1)", async () => {
    const vault = await makeVault();
    const dir = sessionDir(vault, "2026-05-19");
    await mkdir(dir, { recursive: true });
    // Pre-seed turn-001 .. turn-003 plus an unrelated file to make sure
    // the regex only matches the canonical filenames.
    await writeFile(path.join(dir, "turn-001.json"), "{}", "utf8");
    await writeFile(path.join(dir, "turn-002.json"), "{}", "utf8");
    await writeFile(path.join(dir, "turn-003.json"), "{}", "utf8");
    await writeFile(path.join(dir, "notes.txt"), "ignored", "utf8");

    const logger = await FsTurnLogger.create(vault, "2026-05-19");
    expect(logger.nextTurnId()).toBe("turn-004");
    expect(logger.nextTurnId()).toBe("turn-005");

    await logger.writeTurn(makeRecord("turn-004"));
    const written = JSON.parse(
      await readFile(path.join(dir, "turn-004.json"), "utf8"),
    );
    expect(written.turnId).toBe("turn-004");
  });

  it("ENOENT on the session directory → counter starts at 0; first id is turn-001", async () => {
    const vault = await makeVault();
    const logger = await FsTurnLogger.create(vault, "2026-05-19");
    expect(logger.nextTurnId()).toBe("turn-001");

    await logger.writeTurn(makeRecord("turn-001"));
    const finalPath = path.join(sessionDir(vault, "2026-05-19"), "turn-001.json");
    const written = JSON.parse(await readFile(finalPath, "utf8"));
    expect(written.turnId).toBe("turn-001");
  });

  it("T4.2-AC-08: artifact roundtrips the documented TurnLogRecord shape — extra providerOptions keys preserved, no incidental top-level fields", async () => {
    const vault = await makeVault();
    const logger = await FsTurnLogger.create(vault, "2026-05-19");
    const id = logger.nextTurnId();
    const record = makeRecord(id, {
      initialRequest: {
        system: "sys",
        messages: [{ role: "user", content: "hi" }],
        providerOptions: {
          anthropic: {
            disableParallelToolUse: true,
            cacheControl: { type: "ephemeral" },
            // Unexpected future key — must roundtrip faithfully.
            mysteryFlag: 42,
          },
        },
      },
    });
    await logger.writeTurn(record);

    const finalPath = path.join(
      sessionDir(vault, "2026-05-19"),
      "turn-001.json",
    );
    const raw = JSON.parse(await readFile(finalPath, "utf8"));

    // Shallow allowlist of top-level fields — the artifact should never
    // accidentally pass through an unrelated SDK object.
    expect(Object.keys(raw).sort()).toEqual(
      [
        "durationMs",
        "endedAt",
        "initialRequest",
        "model",
        "outcome",
        "startedAt",
        "turnId",
      ].sort(),
    );
    expect(raw.initialRequest.providerOptions).toEqual({
      anthropic: {
        disableParallelToolUse: true,
        cacheControl: { type: "ephemeral" },
        mysteryFlag: 42,
      },
    });
  });
});
