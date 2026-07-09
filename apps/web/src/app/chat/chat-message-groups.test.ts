import { describe, expect, it } from "vitest";

import { groupMessagesForRender, type RenderItem } from "./chat-message-groups";
import type {
  AssistantContentMessage,
  AssistantToolMessage,
  AssistantTypingMessage,
  ChatMessage,
  UserChatMessage,
} from "./chat.types";

function user(id: string): UserChatMessage {
  return { id, role: "user", kind: "user", text: "hi", createdAt: "" };
}

function toolMsg(id: string): AssistantToolMessage {
  return {
    id,
    role: "assistant",
    kind: "tool",
    tool: "read_file",
    target: `${id}.md`,
    state: "done",
    createdAt: "",
  };
}

function typing(id: string): AssistantTypingMessage {
  return { id, role: "assistant", kind: "typing", createdAt: "" };
}

function content(id: string): AssistantContentMessage {
  return { id, role: "assistant", kind: "content", markdown: "ok", createdAt: "" };
}

function ids(items: RenderItem[]): string[] {
  return items.map((item) => item.id);
}

describe("groupMessagesForRender", () => {
  it("returns an empty list for no messages", () => {
    expect(groupMessagesForRender([])).toEqual([]);
  });

  it("collapses a run of consecutive tools into one group keyed by the first id", () => {
    const messages: ChatMessage[] = [
      user("u1"),
      toolMsg("t1"),
      toolMsg("t2"),
      toolMsg("t3"),
      content("c1"),
    ];

    const items = groupMessagesForRender(messages);

    expect(ids(items)).toEqual(["u1", "t1", "c1"]);
    const group = items[1];
    expect(group?.kind).toBe("tool-group");
    if (group?.kind === "tool-group") {
      expect(group.tools.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    }
  });

  it("keeps separate tool runs as separate groups when prose interleaves", () => {
    const messages: ChatMessage[] = [
      toolMsg("t1"),
      content("c1"),
      toolMsg("t2"),
      toolMsg("t3"),
      content("c2"),
    ];

    const items = groupMessagesForRender(messages);

    expect(items.map((item) => item.kind)).toEqual([
      "tool-group",
      "message",
      "tool-group",
      "message",
    ]);
    expect(ids(items)).toEqual(["t1", "c1", "t2", "c2"]);
  });

  it("breaks a tool run when a typing indicator sits between tools", () => {
    const messages: ChatMessage[] = [
      toolMsg("t1"),
      typing("y1"),
      toolMsg("t2"),
    ];

    const items = groupMessagesForRender(messages);

    expect(items.map((item) => item.kind)).toEqual([
      "tool-group",
      "message",
      "tool-group",
    ]);
  });

  it("flushes a trailing tool run with no following message", () => {
    const items = groupMessagesForRender([toolMsg("t1"), toolMsg("t2")]);

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("tool-group");
  });
});
