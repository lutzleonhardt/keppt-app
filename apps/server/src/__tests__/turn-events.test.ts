import { describe, expect, it, vi } from "vitest";
import { MemoryLogger, type TurnResult } from "@gtd/core";

import { EventLog } from "../chat/event-log.js";
import { createTurnEventSink, toolStartEvent } from "../chat/turn-events.js";

describe("toolStartEvent", () => {
  const start = (name: string, input: unknown) =>
    toolStartEvent("t1", "call-1", name, input);

  it("T6.1-AC-10: builds the tool-start event from core's description — target, and summary for edits", () => {
    expect(start("read_file", { file_path: "tasks/inbox.md" })).toEqual({
      type: "tool-start",
      turnId: "t1",
      toolCallId: "call-1",
      tool: "read_file",
      target: "tasks/inbox.md",
    });
    expect(
      start("edit_file", {
        file_path: "tasks/next-actions.md",
        edits: [],
        change_summary: "Moved the call to today",
      }),
    ).toMatchObject({
      target: "tasks/next-actions.md",
      summary: "Moved the call to today",
    });
    expect(start("edit_file", { file_path: "x.md" })).not.toHaveProperty(
      "summary",
    );
  });

  it("T6.1-AC-10: suggest_quick_replies and unknown tools produce no tool event", () => {
    expect(
      start("suggest_quick_replies", { question: "?", options: [] }),
    ).toBeUndefined();
    expect(start("not_a_tool", {})).toBeUndefined();
  });
});

describe("createTurnEventSink", () => {
  function harness() {
    const log = new EventLog(10);
    const logger = new MemoryLogger();
    const onTurnEnd = vi.fn<[TurnResult], void>();
    const sink = createTurnEventSink({
      log,
      turnId: "t1",
      requestId: "req-1",
      logger,
      onTurnEnd,
    });
    const events = () => {
      const replay = log.since();
      return replay === "resync" ? [] : replay.map((entry) => entry.event);
    };
    return { log, logger, onTurnEnd, sink, events };
  }

  it("turns engine callbacks into events of the turn", () => {
    const { sink, events } = harness();
    sink.assistantText("Hal");
    sink.toolStart("c1", "read_file", { file_path: "tasks/inbox.md" });
    sink.toolEnd("c1", "read_file");
    sink.toolStart("c2", "edit_file", { file_path: "tasks/focus.md" });
    sink.toolError("c2", "edit_file", new Error("nope"));
    sink.quickReplies({ question: "Welche?", options: ["A", "B"] });
    sink.turnEnd({ outcome: "ok" });
    expect(events()).toEqual([
      { type: "text-delta", turnId: "t1", text: "Hal" },
      {
        type: "tool-start",
        turnId: "t1",
        toolCallId: "c1",
        tool: "read_file",
        target: "tasks/inbox.md",
      },
      { type: "tool-end", turnId: "t1", toolCallId: "c1" },
      {
        type: "tool-start",
        turnId: "t1",
        toolCallId: "c2",
        tool: "edit_file",
        target: "tasks/focus.md",
      },
      { type: "tool-end", turnId: "t1", toolCallId: "c2" },
      {
        type: "quick-replies",
        turnId: "t1",
        question: "Welche?",
        options: ["A", "B"],
      },
      { type: "turn-end", turnId: "t1", outcome: "ok" },
    ]);
  });

  it("T6.1-AC-07: an error result emits error (turn_failed + requestId) before turn-end with the phase, and logs metadata only", () => {
    const { sink, events, logger, onTurnEnd } = harness();
    const result: TurnResult = {
      outcome: "error",
      phase: "session_save_phase2",
      err: new Error("disk full: /vault/.keppt"),
    };
    sink.turnEnd(result);
    expect(events()).toEqual([
      {
        type: "error",
        turnId: "t1",
        error: {
          code: "turn_failed",
          message: "The turn failed",
          requestId: "req-1",
        },
      },
      {
        type: "turn-end",
        turnId: "t1",
        outcome: "error",
        phase: "session_save_phase2",
      },
    ]);
    expect(onTurnEnd).toHaveBeenCalledWith(result);
    const [entry] = logger.byCode("chat.turn_failed");
    expect(entry).toMatchObject({
      level: "error",
      phase: "session_save_phase2",
      meta: { turnId: "t1" },
    });
    expect(entry?.err).toBe(result.err);
    expect(entry?.message).not.toContain("disk full");
  });

  it("an aborted result emits only turn-end aborted and releases the turn", () => {
    const { sink, events, onTurnEnd } = harness();
    sink.turnEnd({ outcome: "aborted" });
    expect(events()).toEqual([
      { type: "turn-end", turnId: "t1", outcome: "aborted" },
    ]);
    expect(onTurnEnd).toHaveBeenCalledTimes(1);
  });
});
