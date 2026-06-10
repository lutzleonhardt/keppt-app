/**
 * The single source of truth for the chat's agent tools: their identity, the
 * family they belong to, the glyph they render with, and how their line reads.
 *
 * Adding a tool is one edit here — append a `ToolName` and its `TOOL_REGISTRY`
 * entry. Because `TOOL_REGISTRY` is a `Record<ToolName, …>`, the compiler refuses
 * to build until the new tool has a family, an icon, and a label. No template
 * `@switch` to update, no per-component icon import to remember.
 *
 * This module stays framework-agnostic on purpose: icons are stable string
 * tokens (`ToolIconName`), never Angular component classes. The token → Lucide
 * component resolution lives in the view layer (`chat-tool-icons.ts`), so this
 * file — and its pure unit tests — never pull in the Angular runtime. Everything
 * here is synthesized client-side from the structured tool call (name + target +
 * optional change_summary); the backend sends no human-facing label, which is
 * exactly why this stays LLM- and provider-agnostic.
 */

/**
 * The agent tools that render as tool rows. Mirrors the backend's work tools
 * (see keppt-app `buildTools`). `suggest_quick_replies` is deliberately absent:
 * at the protocol level it is a tool call too, but it never becomes a tool row —
 * the real ChatService adapter maps it to a content message's quick replies (and
 * question). Excluding it here lets the compiler guarantee it can never leak into
 * `groupMessagesForRender`, so the grouping/header logic needs no special case.
 */
export type ToolName =
  | "read_file"
  | "list_files"
  | "search_files"
  | "find_task_occurrences"
  | "edit_file"
  | "write_file";

export type ToolState = "running" | "done";

/** Coarse bucket a tool belongs to — drives collapsed group copy and header icon. */
export type ToolFamily = "read" | "search" | "write";

/**
 * Stable glyph tokens (Lucide kebab names). The view layer maps each to a Lucide
 * component in `chat-tool-icons.ts`; that `Record<ToolIconName, …>` makes the
 * compiler demand a component for every token added here.
 */
export type ToolIconName =
  | "file-text"
  | "folder-open"
  | "search"
  | "file-pen"
  | "file-plus"
  | "list-tree";

/** The minimal shape the display functions read; `AssistantToolMessage` satisfies it. */
export interface ToolDisplay {
  tool: ToolName;
  target: string;
  summary?: string;
  state: ToolState;
}

interface ToolMeta {
  family: ToolFamily;
  /** Per-line glyph — finer-grained than the family icon used in group headers. */
  icon: ToolIconName;
  /** What the single tool call acted on, as one line. */
  label: (tool: Pick<ToolDisplay, "tool" | "target" | "summary">) => string;
}

const TOOL_REGISTRY: Record<ToolName, ToolMeta> = {
  read_file: {
    family: "read",
    icon: "file-text",
    label: (t) => t.target,
  },
  list_files: {
    family: "read",
    icon: "folder-open",
    label: (t) => (t.target.length > 0 ? t.target : "alle Dateien"),
  },
  search_files: {
    family: "search",
    icon: "search",
    label: (t) => `„${t.target}“`,
  },
  find_task_occurrences: {
    family: "search",
    icon: "search",
    label: (t) => `„${t.target}“`,
  },
  edit_file: {
    family: "write",
    icon: "file-pen",
    // change_summary is the model-authored description of the mutation; fall
    // back to the path only if a turn ever omits it.
    label: (t) => t.summary ?? t.target,
  },
  write_file: {
    family: "write",
    icon: "file-plus",
    label: (t) => t.summary ?? t.target,
  },
};

/** Coarser header glyph for a group; `mixed` runs borrow the neutral steps icon. */
const FAMILY_ICON: Record<ToolFamily, ToolIconName> = {
  read: "file-text",
  search: "search",
  write: "file-plus",
};
const MIXED_ICON: ToolIconName = "list-tree";

/** Collapsed header copy per family, parameterised by count and run state. */
const FAMILY_COPY: Record<
  ToolFamily | "mixed",
  { running: (count: number) => string; done: (count: number) => string }
> = {
  read: {
    running: (n) => `Liest ${n} Dateien …`,
    done: (n) => `${n} Dateien gelesen`,
  },
  search: {
    running: (n) => `Sucht (${n}) …`,
    done: (n) => `${n} Suchen`,
  },
  write: {
    running: (n) => `Schreibt ${n} Änderungen …`,
    done: (n) => `${n} Änderungen`,
  },
  mixed: {
    running: (n) => `${n} Schritte …`,
    done: (n) => `${n} Schritte`,
  },
};

/** One line inside a tool group: what the single tool call acted on. */
export function toolLineLabel(
  tool: Pick<ToolDisplay, "tool" | "target" | "summary">,
): string {
  return TOOL_REGISTRY[tool.tool].label(tool);
}

/** Per-line glyph token for a single tool call. */
export function toolLineIcon(tool: Pick<ToolDisplay, "tool">): ToolIconName {
  return TOOL_REGISTRY[tool.tool].icon;
}

/**
 * Collapsed header for a run of consecutive tool calls. Run-length grouping is a
 * client render decision, so the header is synthesized from the contained tools,
 * never sent by the backend. A single-tool group reads as its own line; larger
 * groups collapse to a count keyed off the dominant tool family.
 */
export function toolGroupSummary(tools: readonly ToolDisplay[]): string {
  const [first] = tools;
  if (!first) {
    // Unreachable in-app: groupMessagesForRender never emits an empty group.
    // Fail soft rather than render "0 Schritte" if a future caller reuses this.
    return "";
  }
  if (tools.length === 1) {
    return toolLineLabel(first);
  }

  const copy = FAMILY_COPY[groupFamily(tools)];
  const running = tools.some((tool) => tool.state === "running");
  return running ? copy.running(tools.length) : copy.done(tools.length);
}

/**
 * Header glyph token for a group — coarser than per-line icons. A mixed run gets
 * the neutral steps icon so it matches the neutral "N Schritte" copy rather than
 * borrowing the read glyph. The spinner shown while a group runs is a render
 * concern, owned by the component, not this resolver.
 */
export function toolGroupIcon(
  tools: readonly Pick<ToolDisplay, "tool">[],
): ToolIconName {
  const family = groupFamily(tools);
  return family === "mixed" ? MIXED_ICON : FAMILY_ICON[family];
}

function groupFamily(
  tools: readonly Pick<ToolDisplay, "tool">[],
): ToolFamily | "mixed" {
  const families = new Set(tools.map((tool) => TOOL_REGISTRY[tool.tool].family));
  if (families.size === 1) {
    const [only] = families;
    return only ?? "mixed";
  }
  return "mixed";
}
