// What the CLI prints when it crosses a session boundary — either at startup
// (the implicit "load whatever today's session is" boundary) or when a
// long-running REPL crosses UTC midnight and the day-rollover guard swaps in
// a fresh `<date>.json`. Both surfaces share: a one-line banner identifying
// the date + new/resumed state, and (for resumed sessions) a full replay of
// prior user/assistant text plus tool-call status lines.
//
// Replay deliberately mirrors what the live REPL prints during a turn:
// assistant text as-is and tool calls as `[name…]` status lines (the same
// shape `terminal.toolStatus` writes). Tool-result content and reasoning
// parts are dropped because they're never shown live — surfacing them only
// on resume would be more confusing than the gap they leave.

import type { ModelMessage } from "ai";
import type { Session } from "@gtd/core";
import type { TerminalOutput } from "./terminal-output.js";

function describeSessionBoundary(
  date: string,
  priorMessages: number,
  isRollover: boolean,
): string {
  const prefix = isRollover ? "day rollover · " : "";
  const state =
    priorMessages === 0
      ? "new session"
      : `resumed session (${priorMessages} prior messages)`;
  return `${prefix}${state} · ${date}`;
}

// Render one persisted message into the zero-or-more lines that should
// appear during replay. `tool`-role messages are skipped because their
// payload is tool-result data we never display live.
function renderMessageForReplay(msg: ModelMessage): string[] {
  if (msg.role === "tool") return [];
  const lines: string[] = [];
  const content: unknown = msg.content;
  if (typeof content === "string") {
    if (content.length > 0) {
      lines.push(msg.role === "user" ? `> ${content}` : content);
    }
    return lines;
  }
  if (!Array.isArray(content)) return lines;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const partType = (part as { type?: unknown }).type;
    if (partType === "text") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.length > 0) {
        lines.push(msg.role === "user" ? `> ${text}` : text);
      }
    } else if (partType === "tool-call" && msg.role === "assistant") {
      const toolName = (part as { toolName?: unknown }).toolName;
      if (typeof toolName === "string" && toolName.length > 0) {
        lines.push(`[${toolName}…]`);
      }
    }
  }
  return lines;
}

function replayAllMessages(
  messages: readonly ModelMessage[],
  terminal: TerminalOutput,
): void {
  let printedAny = false;
  for (const msg of messages) {
    const lines = renderMessageForReplay(msg);
    if (lines.length === 0) continue;
    // Blank separator between messages, never at the top — the session
    // banner above already opens with one.
    if (printedAny) terminal.replayLine("");
    for (const line of lines) terminal.replayLine(line);
    printedAny = true;
  }
}

/**
 * Print the boundary banner for `session` and, if the session already has
 * messages on disk, replay them so the user picks up with full visible
 * context instead of a blank prompt. Pass `isRollover=true` from the
 * day-rollover guard so the banner says `day rollover · …`.
 */
export function announceSessionBoundary(
  terminal: TerminalOutput,
  session: Session,
  isRollover: boolean,
): void {
  terminal.sessionBanner(
    describeSessionBoundary(session.date, session.messages.length, isRollover),
  );
  if (session.messages.length > 0) {
    replayAllMessages(session.messages, terminal);
  }
}
