import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quickReplyPhrases, voiceTranscript } from "./chat-mock-data";
import { MockChatService } from "./mock-chat.service";
import { groupMessagesForRender } from "../chat/chat-message-groups";
import { toolGroupSummary } from "../chat/chat-tool-registry";
import {
  isAssistantContentMessage,
  isAssistantToolMessage,
  isAssistantTypingMessage,
  isUserChatMessage,
} from "../chat/chat.types";
import type {
  AssistantContentMessage,
  AssistantToolMessage,
  ChatMessage,
} from "../chat/chat.types";

describe("MockChatService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens with the greeting reads already done plus quick replies", () => {
    const service = new MockChatService();
    const tools = allTools(service.messages());

    expect(tools).toHaveLength(4);
    expect(
      tools.every((tool) => tool.tool === "read_file" && tool.state === "done"),
    ).toBe(true);
    expect(tools.map((tool) => tool.target)).toEqual([
      "tasks/inbox.md",
      "tasks/focus.md",
      "tasks/waiting.md",
      "daily/2026-05-06.md",
    ]);
    expect(lastContent(service.messages()).markdown).toContain(
      "Guten Morgen, Lutz.",
    );
    expect(
      lastContent(service.messages()).quickReplies?.map((reply) => reply.label),
    ).toEqual(["Tag planen", "Warten auf zeigen", "Erstmal nur erfassen"]);
    expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
  });

  it("plays a turn in order: typing → tool runs → typing → content", async () => {
    const service = new MockChatService();

    const pending = service.sendMessage("Brot kaufen");

    // 1. Deciding — the indicator shows first, before any tool of this turn runs.
    expect(service.status()).toBe("thinking");
    expect(isAssistantTypingMessage(last(service.messages()))).toBe(true);
    expect(runningTools(service.messages())).toHaveLength(0);
    expect(
      service
        .messages()
        .some((m) => isUserChatMessage(m) && m.text === "Brot kaufen"),
    ).toBe(true);

    // 2. Working — typing is gone and the tool row is present and running.
    await vi.advanceTimersToNextTimerAsync();
    expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
    const running = runningTools(service.messages());
    expect(running).toHaveLength(1);
    expect(running[0].tool).toBe("edit_file");

    // 3. Composing — the tool settled and the indicator returns before the answer.
    await vi.advanceTimersToNextTimerAsync();
    expect(runningTools(service.messages())).toHaveLength(0);
    expect(isAssistantTypingMessage(last(service.messages()))).toBe(true);
    expect(lastContent(service.messages()).markdown).not.toContain(
      "liegt jetzt in deiner Inbox",
    );

    // 4. Answer — content plus chips, indicator gone, idle again.
    await vi.advanceTimersToNextTimerAsync();
    await pending;
    expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
    expect(lastTool(service.messages()).state).toBe("done");
    expect(lastContent(service.messages()).markdown).toContain(
      "liegt jetzt in deiner Inbox",
    );
    expect(
      lastContent(service.messages()).quickReplies?.map((reply) => reply.label),
    ).toEqual(["Räum die Inbox auf", "Was steht heute an?"]);
    expect(service.status()).toBe("idle");
  });

  it("runs a mixed tool run as one continuous group with no typing flicker between tools", async () => {
    const service = new MockChatService();

    // planEntered is [read, read, find, write, edit, prose, chips] — five
    // consecutive tools spanning the read, search, and write families.
    const pending = service.chooseQuickReply(quickReplyPhrases.planConfirm);

    // Deciding: exactly one indicator before the FIRST tool, nothing running yet.
    expect(isAssistantTypingMessage(last(service.messages()))).toBe(true);
    expect(runningTools(service.messages())).toHaveLength(0);

    // First tool runs: indicator gone, exactly one running tool.
    await vi.advanceTimersToNextTimerAsync();
    expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
    expect(runningTools(service.messages())).toHaveLength(1);
    expect(runningTools(service.messages())[0].tool).toBe("read_file");

    // read → read boundary: no typing indicator between consecutive tools.
    await vi.advanceTimersToNextTimerAsync();
    expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
    expect(runningTools(service.messages())).toHaveLength(1);

    // read → search boundary: still no flicker, now the search runs.
    await vi.advanceTimersToNextTimerAsync();
    expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
    expect(runningTools(service.messages())[0].tool).toBe("find_task_occurrences");

    // search → write boundary (cross-family): still no flicker.
    await vi.advanceTimersToNextTimerAsync();
    expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
    expect(runningTools(service.messages())[0].tool).toBe("write_file");

    // Finish: answer lands, indicator gone, idle.
    await vi.runAllTimersAsync();
    await pending;
    expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
    expect(lastContent(service.messages()).markdown).toContain("2026-05-07.md");
    expect(service.status()).toBe("idle");

    // The whole run renders as one mixed group whose header is the neutral count.
    const groups = groupMessagesForRender(service.messages()).filter(
      (item) => item.kind === "tool-group",
    );
    const lastGroup = groups.at(-1);
    expect(lastGroup?.kind).toBe("tool-group");
    if (lastGroup?.kind === "tool-group") {
      expect(lastGroup.tools).toHaveLength(5);
      expect(toolGroupSummary(lastGroup.tools)).toBe("5 Schritte");
    }
  });

  it("routes planning, today, waiting, inbox, and fallback text", async () => {
    const cases = [
      {
        text: "Ich habe morgen nur 4 Stunden. Was ist realistisch?",
        marker: "Morgen — Plan für 4 Stunden",
        reply: "Ja, eintragen",
      },
      {
        text: "Was ist heute wichtig im Fokus?",
        marker: "## Heute",
        reply: "An Max pingen",
      },
      {
        text: "Was wartet bei Max und DB?",
        marker: "offene Rückmeldungen liegen bei dir",
        reply: "DB jetzt nachhaken",
      },
      {
        text: "Räum die Inbox auf und sortier alles",
        marker: "In deiner Inbox liegen aktuell",
        reply: "So übernehmen",
      },
      {
        text: "Brot kaufen",
        marker: "liegt jetzt in deiner Inbox",
        reply: "Was steht heute an?",
      },
    ];

    for (const entry of cases) {
      const service = new MockChatService();
      const pending = service.sendMessage(entry.text);

      expect(service.status()).toBe("thinking");
      await completeResponse(pending);

      expect(lastContent(service.messages()).markdown).toContain(entry.marker);
      expect(
        lastContent(service.messages()).quickReplies?.map(
          (reply) => reply.label,
        ),
      ).toContain(entry.reply);
      expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
    }
  });

  it("maps known quick replies to their dedicated mock behaviors", async () => {
    const service = new MockChatService();

    await completeResponse(
      service.chooseQuickReply(quickReplyPhrases.planConfirm),
    );
    expect(
      allTools(service.messages()).some(
        (tool) =>
          tool.tool === "write_file" &&
          tool.summary === "Plan für morgen eingetragen",
      ),
    ).toBe(true);
    expect(lastContent(service.messages()).markdown).toContain("2026-05-07.md");

    await completeResponse(
      service.chooseQuickReply(quickReplyPhrases.annaFirst),
    );
    expect(lastTool(service.messages())).toMatchObject({
      tool: "edit_file",
      summary: "Anna für morgen vorgemerkt",
      state: "done",
    });

    await completeResponse(
      service.chooseQuickReply(quickReplyPhrases.captureOnly),
    );
    expect(lastContent(service.messages()).markdown).toBe(
      "Klar. Tipp auf das Mikrofon oder schreib einfach — ich höre zu, ohne zu sortieren.",
    );

    await completeResponse(
      service.chooseQuickReply(quickReplyPhrases.laterDecide),
    );
    expect(lastContent(service.messages()).markdown).toBe(
      "Alles gut. Ich frage später nochmal nach.",
    );
  });

  it("routes the demo dictation to the capture confirmation (not the inbox cleanup)", async () => {
    const service = new MockChatService();

    // The transcript contains "sortieren", which the generic inbox pattern also
    // matches — the content-specific captureConfirm route must win.
    const pending = service.sendMessage(voiceTranscript);

    expect(service.status()).toBe("thinking");
    await completeResponse(pending);

    const markdown = lastContent(service.messages()).markdown;
    expect(markdown).toContain("Ich habe drei Dinge mitgenommen");
    expect(markdown).not.toContain("In deiner Inbox liegen aktuell");
    expect(
      lastContent(service.messages()).quickReplies?.map((reply) => reply.label),
    ).toContain("Ja, Anna zuerst");
  });

  it("routes the waiting quick reply to the waiting list (not the inbox acknowledgement)", async () => {
    const service = new MockChatService();

    const pending = service.chooseQuickReply(quickReplyPhrases.showWaiting);
    await vi.runAllTimersAsync();
    await pending;

    const markdown = lastContent(service.messages()).markdown;
    expect(markdown).toContain("Zwei offene Rückmeldungen liegen bei dir");
    expect(markdown).not.toContain("liegt jetzt in deiner Inbox");
    expect(markdown).not.toContain("## Heute");

    expect(
      allTools(service.messages()).some(
        (tool) => tool.tool === "read_file" && tool.target === "tasks/waiting.md",
      ),
    ).toBe(true);

    expect(
      service
        .messages()
        .some((m) => isUserChatMessage(m) && m.text === "Warten auf zeigen"),
    ).toBe(true);
  });

  it("routes the 'Tagesplan starten' quick reply to today (not tomorrow's plan)", async () => {
    const service = new MockChatService();

    const pending = service.chooseQuickReply(quickReplyPhrases.startToday);
    await vi.runAllTimersAsync();
    await pending;

    const markdown = lastContent(service.messages()).markdown;
    expect(markdown).toContain("## Heute");
    expect(markdown).not.toContain("## Morgen — Plan für 4 Stunden");
  });

  it("ignores a concurrent message while a response is in flight", async () => {
    const service = new MockChatService();

    const first = service.sendMessage("Erste Nachricht");
    expect(service.status()).toBe("thinking");

    const userCount = () =>
      service.messages().filter(isUserChatMessage).length;
    expect(userCount()).toBe(1);

    // Second send arrives before the first turn settles → no-op, so the shared
    // typing/tool state of the in-flight response stays intact.
    await service.sendMessage("Zweite Nachricht");
    expect(userCount()).toBe(1);

    await vi.runAllTimersAsync();
    await first;

    expect(service.status()).toBe("idle");
    expect(userCount()).toBe(1);
  });

  it("ignores a concurrent quick reply on the direct-respondWith path", async () => {
    const service = new MockChatService();

    const userCount = () =>
      service.messages().filter(isUserChatMessage).length;

    // planConfirm/annaFirst take the direct appendUserMessage + respondWith path
    // (not the sendMessage delegation), so guard them at that entry point too.
    const first = service.chooseQuickReply(quickReplyPhrases.planConfirm);
    expect(service.status()).toBe("thinking");
    expect(userCount()).toBe(1);

    await service.chooseQuickReply(quickReplyPhrases.annaFirst);
    expect(userCount()).toBe(1);

    await vi.runAllTimersAsync();
    await first;

    expect(service.status()).toBe("idle");
    expect(userCount()).toBe(1);
  });

  it("cancels an in-flight turn: keeps the user message, discards the whole response", async () => {
    const service = new MockChatService();
    const beforeSend = service.messages().length; // boot greeting only

    const pending = service.sendMessage("Brot kaufen");
    expect(service.status()).toBe("thinking");

    // Let the turn play partway — the first tool of the run is now running.
    await vi.advanceTimersToNextTimerAsync();
    expect(runningTools(service.messages())).toHaveLength(1);

    service.cancel();
    await pending;

    // The user message survives at the live edge; every assistant artifact from
    // the turn (tool row, typing) is rolled back and the service is idle again.
    expect(service.messages()).toHaveLength(beforeSend + 1);
    expect(last(service.messages())).toMatchObject({
      kind: "user",
      text: "Brot kaufen",
    });
    expect(service.messages().some(isAssistantTypingMessage)).toBe(false);
    expect(runningTools(service.messages())).toHaveLength(0);
    expect(service.status()).toBe("idle");
    expect(service.busy()).toBe(false);
  });

  it("never reuses a message id after removals (typing indicator, cancel rollback)", async () => {
    const service = new MockChatService();
    const seenIds = new Set<string>();
    const recordIds = (): void => {
      for (const message of service.messages()) {
        seenIds.add(message.id);
      }
    };
    recordIds();

    // Play a turn partway (typing indicator + first tool get ids), then cancel.
    const cancelled = service.sendMessage("Brot kaufen");
    recordIds();
    await vi.advanceTimersToNextTimerAsync();
    recordIds();
    service.cancel();
    await cancelled;

    // With length-based ids, the rollback shrinks the list and every id issued
    // for the discarded artifacts gets re-issued here, breaking `track item.id`.
    const surviving = new Set(service.messages().map((message) => message.id));
    await completeResponse(service.sendMessage("Milch kaufen"));

    const fresh = service
      .messages()
      .filter((message) => !surviving.has(message.id));
    expect(fresh.length).toBeGreaterThan(0);
    for (const message of fresh) {
      expect(seenIds.has(message.id)).toBe(false);
    }
  });

  it("treats cancel as a no-op when no turn is in flight", () => {
    const service = new MockChatService();
    const before = service.messages();

    service.cancel();

    expect(service.status()).toBe("idle");
    expect(service.messages()).toBe(before);
  });

  it("keeps navigation state on the service boundary", () => {
    const service = new MockChatService();

    service.navigate("waiting");

    expect(service.currentScreen()).toBe("waiting");
  });
});

async function completeResponse(pending: Promise<void>): Promise<void> {
  await vi.runAllTimersAsync();
  await pending;
}

function last(messages: readonly ChatMessage[]): ChatMessage {
  const message = messages.at(-1);

  if (!message) {
    throw new Error("Expected at least one message");
  }

  return message;
}

function allTools(messages: readonly ChatMessage[]): AssistantToolMessage[] {
  return messages.filter(isAssistantToolMessage);
}

function runningTools(messages: readonly ChatMessage[]): AssistantToolMessage[] {
  return allTools(messages).filter((tool) => tool.state === "running");
}

function lastContent(
  messages: readonly ChatMessage[],
): AssistantContentMessage {
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
