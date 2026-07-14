import {
  isAssistantToolMessage,
  type AssistantToolMessage,
  type ChatMessage,
} from "./chat.types";

/**
 * A turn is an ordered block list in generation order (`Text → Tool → Tool →
 * Text → …`). For display, consecutive tool calls collapse into one expandable
 * box while prose, the typing indicator, and user messages each stay their own
 * item. This is a pure render transform over the message list — no domain state.
 */
export type RenderItem =
  | { kind: "tool-group"; id: string; tools: readonly AssistantToolMessage[] }
  | { kind: "message"; id: string; message: ChatMessage };

export function groupMessagesForRender(
  messages: readonly ChatMessage[],
): RenderItem[] {
  const items: RenderItem[] = [];
  let run: AssistantToolMessage[] | null = null;

  const flush = (): void => {
    const first = run?.[0];
    if (run && first) {
      // Stable id for trackBy: the first tool in the run never changes identity
      // as later tools resolve or as the run grows.
      items.push({ kind: "tool-group", id: first.id, tools: run });
      run = null;
    }
  };

  for (const message of messages) {
    if (isAssistantToolMessage(message)) {
      (run ??= []).push(message);
      continue;
    }

    flush();
    items.push({ kind: "message", id: message.id, message });
  }

  flush();
  return items;
}
