import type { ToolName, ToolState } from "./chat-tool-registry";

// The tool vocabulary lives in chat-tool-registry.ts (the single source of truth
// for tools); re-exported here so chat.types stays the chat domain's type barrel.
export type { ToolName, ToolState } from "./chat-tool-registry";

export type ChatStatus = "idle" | "thinking" | "streaming" | "error";
export type ChatMessageRole = "user" | "assistant";
export type ChatMessageKind = "user" | "tool" | "typing" | "content";

export type ChatMessage =
  | UserChatMessage
  | AssistantToolMessage
  | AssistantTypingMessage
  | AssistantContentMessage;

export interface BaseChatMessage {
  id: string;
  role: ChatMessageRole;
  kind: ChatMessageKind;
  createdAt: string;
}

export interface UserChatMessage extends BaseChatMessage {
  role: "user";
  kind: "user";
  text: string;
}

export interface AssistantToolMessage extends BaseChatMessage {
  role: "assistant";
  kind: "tool";
  /** Structured tool name — drives the displayed verb and icon. */
  tool: ToolName;
  /** Primary argument: file_path, search query, list prefix, or joined candidates. */
  target: string;
  /** Model-authored change_summary — only `edit_file` / `write_file` carry it. */
  summary?: string;
  state: ToolState;
}

export interface AssistantTypingMessage extends BaseChatMessage {
  role: "assistant";
  kind: "typing";
}

export interface AssistantContentMessage extends BaseChatMessage {
  role: "assistant";
  kind: "content";
  markdown: string;
  quickReplies?: QuickReply[];
}

export function isUserChatMessage(message: ChatMessage): message is UserChatMessage {
  return message.kind === "user";
}

export function isAssistantToolMessage(message: ChatMessage): message is AssistantToolMessage {
  return message.kind === "tool";
}

export function isAssistantTypingMessage(message: ChatMessage): message is AssistantTypingMessage {
  return message.kind === "typing";
}

export function isAssistantContentMessage(message: ChatMessage): message is AssistantContentMessage {
  return message.kind === "content";
}

export interface QuickReply {
  id: string;
  label: string;
  action?: string;
}
