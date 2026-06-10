import { describe, expect, it } from "vitest";

import {
  toolGroupIcon,
  toolGroupSummary,
  toolLineIcon,
  toolLineLabel,
} from "./chat-tool-registry";
import type { AssistantToolMessage } from "./chat.types";

function tool(
  overrides: Partial<AssistantToolMessage> & Pick<AssistantToolMessage, "tool">,
): AssistantToolMessage {
  return {
    id: overrides.id ?? "t",
    role: "assistant",
    kind: "tool",
    target: "",
    state: "done",
    ...overrides,
  };
}

describe("toolLineLabel", () => {
  it("shows the file path for reads", () => {
    expect(toolLineLabel(tool({ tool: "read_file", target: "tasks/focus.md" }))).toBe(
      "tasks/focus.md",
    );
  });

  it("quotes the query for searches with symmetric German quotes", () => {
    expect(
      toolLineLabel(tool({ tool: "search_files", target: "offene Rechnung" })),
    ).toBe("„offene Rechnung“");
    expect(
      toolLineLabel(tool({ tool: "find_task_occurrences", target: "Anna" })),
    ).toBe("„Anna“");
  });

  it("falls back to a friendly label when list_files has no prefix", () => {
    expect(toolLineLabel(tool({ tool: "list_files", target: "" }))).toBe(
      "alle Dateien",
    );
    expect(toolLineLabel(tool({ tool: "list_files", target: "daily/" }))).toBe(
      "daily/",
    );
  });

  it("prefers the change_summary for writes, falling back to the path", () => {
    expect(
      toolLineLabel(
        tool({
          tool: "write_file",
          target: "daily/2026-05-07.md",
          summary: "Plan für morgen eingetragen",
        }),
      ),
    ).toBe("Plan für morgen eingetragen");
    expect(
      toolLineLabel(tool({ tool: "edit_file", target: "tasks/next-actions.md" })),
    ).toBe("tasks/next-actions.md");
  });
});

describe("toolLineIcon", () => {
  it("maps each tool to its own glyph token, finer-grained than its family", () => {
    expect(toolLineIcon(tool({ tool: "read_file" }))).toBe("file-text");
    expect(toolLineIcon(tool({ tool: "list_files" }))).toBe("folder-open");
    expect(toolLineIcon(tool({ tool: "search_files" }))).toBe("search");
    expect(toolLineIcon(tool({ tool: "find_task_occurrences" }))).toBe("search");
    expect(toolLineIcon(tool({ tool: "edit_file" }))).toBe("file-pen");
    expect(toolLineIcon(tool({ tool: "write_file" }))).toBe("file-plus");
  });
});

describe("toolGroupSummary", () => {
  it("renders a single-tool group as its own line", () => {
    expect(
      toolGroupSummary([tool({ tool: "read_file", target: "tasks/waiting.md" })]),
    ).toBe("tasks/waiting.md");
  });

  it("counts a homogeneous read group, with running vs done copy", () => {
    const reads = [
      tool({ tool: "read_file", target: "a.md" }),
      tool({ tool: "read_file", target: "b.md" }),
      tool({ tool: "list_files", target: "" }),
    ];
    expect(toolGroupSummary(reads)).toBe("3 Dateien gelesen");

    const running = reads.map((t, i) =>
      i === 2 ? { ...t, state: "running" as const } : t,
    );
    expect(toolGroupSummary(running)).toBe("Liest 3 Dateien …");
  });

  it("counts write and search groups distinctly, running vs done", () => {
    const writes = [
      tool({ tool: "write_file", target: "a.md" }),
      tool({ tool: "edit_file", target: "b.md" }),
    ];
    expect(toolGroupSummary(writes)).toBe("2 Änderungen");
    expect(
      toolGroupSummary(writes.map((t) => ({ ...t, state: "running" as const }))),
    ).toBe("Schreibt 2 Änderungen …");

    const searches = [
      tool({ tool: "search_files", target: "x" }),
      tool({ tool: "find_task_occurrences", target: "y" }),
    ];
    expect(toolGroupSummary(searches)).toBe("2 Suchen");
    expect(
      toolGroupSummary(searches.map((t) => ({ ...t, state: "running" as const }))),
    ).toBe("Sucht (2) …");
  });

  it("falls back to a neutral step count for mixed families, running vs done", () => {
    const mixed = [
      tool({ tool: "read_file", target: "a.md" }),
      tool({ tool: "write_file", target: "b.md" }),
    ];
    expect(toolGroupSummary(mixed)).toBe("2 Schritte");
    expect(
      toolGroupSummary(mixed.map((t) => ({ ...t, state: "running" as const }))),
    ).toBe("2 Schritte …");
  });

  it("fails soft on an empty group rather than printing a zero count", () => {
    expect(toolGroupSummary([])).toBe("");
  });
});

describe("toolGroupIcon", () => {
  it("reflects the family glyph token (spinner-while-running is a component concern)", () => {
    expect(toolGroupIcon([tool({ tool: "read_file", target: "a.md" })])).toBe(
      "file-text",
    );
    expect(toolGroupIcon([tool({ tool: "search_files", target: "x" })])).toBe(
      "search",
    );
    expect(toolGroupIcon([tool({ tool: "write_file", target: "a.md" })])).toBe(
      "file-plus",
    );
    // A still-running group keeps its family glyph here; the template swaps in
    // the spinner based on state, so the resolver stays state-agnostic.
    expect(toolGroupIcon([tool({ tool: "read_file", state: "running" })])).toBe(
      "file-text",
    );
  });

  it("uses the neutral steps icon for a mixed family, matching the header copy", () => {
    expect(
      toolGroupIcon([
        tool({ tool: "read_file", target: "a.md" }),
        tool({ tool: "write_file", target: "b.md" }),
      ]),
    ).toBe("list-tree");
    expect(toolGroupIcon([])).toBe("list-tree");
  });
});
