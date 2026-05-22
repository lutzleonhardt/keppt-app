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
  text: string;
  files?: string[];
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

export type AppScreen =
  | "chat"
  | "inbox"
  | "focus"
  | "next"
  | "waiting"
  | "someday"
  | "daily"
  | "daily-detail";
