import { describe, expect, it } from "vitest";

import { quickReplyPhrases, voiceTranscript } from "./chat-mock-data";
import { MockChatService } from "./mock-chat.service";
import {
  isAssistantContentMessage,
  isAssistantToolMessage,
  isAssistantTypingMessage,
  isUserChatMessage,
} from "../chat/chat.types";
import type { AssistantContentMessage, AssistantToolMessage, ChatMessage } from "../chat/chat.types";

describe("MockChatService", () => {
  it("opens with the typed greeting tool row and quick replies", () => {
    const service = new MockChatService();
    const [tool, content] = service.messages();

    expect(tool).toMatchObject({
      role: "assistant",
      kind: "tool",
      text: "Keppt hat deine offenen Punkte geprüft",
      files: [
        "tasks/inbox.md",
        "tasks/focus.md",
        "tasks/waiting.md",
        "daily/2026-05-06.md",
      ],
    });
    expect(content).toMatchObject({
      role: "assistant",
      kind: "content",
    });
    expect(lastContent(service.messages()).quickReplies?.map((reply) => reply.label)).toEqual([
      "Tag planen",
      "Warten auf zeigen",
      "Erstmal nur erfassen",
    ]);
  });

  it("emits user, tool, typing, final content, and quick replies for voice capture", async () => {
    const service = new MockChatService();

    service.startVoiceCapture();
    await Promise.resolve();

    expect(
      service.messages().some((message) => isUserChatMessage(message) && message.text === voiceTranscript),
    ).toBe(true);
    expect(lastTool(service.messages()).text).toBe("3 Einträge sicher abgelegt");
    expect(service.messages().some(isAssistantTypingMessage)).toBe(true);
    expect(lastContent(service.messages()).quickReplies?.map((reply) => reply.label)).toEqual([
      "Ja, Anna zuerst",
      "Plan morgen — 4 h",
      "Später entscheiden",
    ]);
    expect(service.status()).toBe("idle");
  });

  it("routes planning, today, waiting, inbox, and fallback text", async () => {
    const cases = [
      {
        text: "Ich habe morgen nur 4 Stunden. Was ist realistisch?",
        tool: "Geprüft: Wochenfokus, offene Aufgaben und Follow-ups",
        reply: "Ja, eintragen",
      },
      {
        text: "Was ist heute wichtig im Fokus?",
        tool: "Geprüft: Wochenfokus, offene Aufgaben und heutiger Kontext",
        reply: "An Max pingen",
      },
      {
        text: "Was wartet bei Max und DB?",
        tool: "Geprüft: offene Rückmeldungen",
        reply: "DB jetzt nachhaken",
      },
      {
        text: "Räum die Inbox auf und sortier alles",
        tool: "Keppt schaut deine Inbox durch",
        reply: "So übernehmen",
      },
      {
        text: "Brot kaufen",
        tool: "Keppt it!",
        reply: "Was steht heute an?",
      },
    ];

    for (const entry of cases) {
      const service = new MockChatService();
      const pending = service.sendMessage(entry.text);

      expect(service.status()).toBe("thinking");
      await pending;

      expect(lastTool(service.messages()).text).toBe(entry.tool);
      expect(lastContent(service.messages()).quickReplies?.map((reply) => reply.label)).toContain(entry.reply);
    }
  });

  it("maps known quick replies to their dedicated mock behaviors", async () => {
    const service = new MockChatService();

    await service.chooseQuickReply(quickReplyPhrases.planConfirm);
    expect(lastTool(service.messages())).toMatchObject({
      text: "Plan für morgen festgehalten",
      files: ["daily/2026-05-07.md", "tasks/next-actions.md"],
    });

    await service.chooseQuickReply(quickReplyPhrases.annaFirst);
    expect(lastTool(service.messages()).text).toBe("Anna für morgen vorgemerkt");

    await service.chooseQuickReply(quickReplyPhrases.captureOnly);
    expect(lastContent(service.messages()).blocks).toEqual([
      {
        id: "capture-only-body",
        type: "paragraph",
        text: [{ text: "Klar. Drück den Mic-Button oder schreib einfach — ich höre zu, ohne zu sortieren." }],
      },
    ]);

    await service.chooseQuickReply(quickReplyPhrases.laterDecide);
    expect(lastContent(service.messages()).blocks).toEqual([
      {
        id: "later-body",
        type: "paragraph",
        text: [{ text: "Alles gut. Ich frage später nochmal nach." }],
      },
    ]);
  });

  it("keeps navigation state on the service boundary", () => {
    const service = new MockChatService();

    service.navigate("waiting");

    expect(service.currentScreen()).toBe("waiting");
  });
});

function lastContent(messages: readonly ChatMessage[]): AssistantContentMessage {
  const message = messages.findLast(isAssistantContentMessage);

  if (!message) {
    throw new Error("Expected a content message");
  }

  return message;
}

function lastTool(messages: readonly ChatMessage[]): AssistantToolMessage {
  const message = messages.findLast(isAssistantToolMessage);

  if (!message) {
    throw new Error("Expected a tool message");
  }

  return message;
}
