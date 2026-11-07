import { describe, expect, it } from "vitest";

import { describeToolCall } from "../tool-inputs.js";

describe("describeToolCall", () => {
  it("T6.1-AC-10: maps every vault tool's input to the documented target", () => {
    expect(
      describeToolCall("read_file", { file_path: "tasks/inbox.md" }),
    ).toEqual({ target: "tasks/inbox.md" });
    expect(describeToolCall("search_files", { query: "Anna" })).toEqual({
      target: "Anna",
    });
    expect(describeToolCall("list_files", { prefix: "daily/" })).toEqual({
      target: "daily/",
    });
    expect(describeToolCall("list_files", {})).toEqual({ target: "" });
    expect(
      describeToolCall("find_task_occurrences", {
        candidates: ["call Anna", "Anna"],
      }),
    ).toEqual({ target: "call Anna, Anna" });
  });

  it("T6.1-AC-10: edit and write carry the model's change_summary; reads never do", () => {
    expect(
      describeToolCall("edit_file", {
        file_path: "tasks/next-actions.md",
        edits: [],
        change_summary: "Moved the call to today",
      }),
    ).toEqual({
      target: "tasks/next-actions.md",
      summary: "Moved the call to today",
    });
    expect(
      describeToolCall("write_file", {
        file_path: "tasks/focus.md",
        content: "",
        change_summary: "Reset focus",
      }),
    ).toEqual({ target: "tasks/focus.md", summary: "Reset focus" });
    expect(
      describeToolCall("read_file", {
        file_path: "x.md",
        change_summary: "no",
      }),
    ).toEqual({ target: "x.md" });
    expect(describeToolCall("edit_file", { file_path: "x.md" })).toEqual({
      target: "x.md",
    });
    expect(
      describeToolCall("edit_file", { file_path: "x.md", change_summary: "" }),
    ).toEqual({ target: "x.md" });
  });

  it("T6.1-AC-10: a non-object or mistyped input yields an empty target instead of throwing", () => {
    expect(describeToolCall("read_file", "tasks/inbox.md")).toEqual({
      target: "",
    });
    expect(describeToolCall("read_file", { file_path: 42 })).toEqual({
      target: "",
    });
    expect(
      describeToolCall("find_task_occurrences", { candidates: "Anna" }),
    ).toEqual({ target: "" });
  });
});
