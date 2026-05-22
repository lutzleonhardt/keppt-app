import { Injectable, signal } from "@angular/core";

import {
  createContentMessage,
  createToolMessage,
  getMockResponse,
  planningQuestion,
  quickReplyPhrases,
  routePatterns,
  voiceTranscript,
  type MockAssistantResponse,
  type MockFlow,
} from "./chat-mock-data";
import { ChatService } from "../chat/chat.service";
import type {
  AppScreen,
  AssistantTypingMessage,
  ChatMessage,
  ChatStatus,
  UserChatMessage,
} from "../chat/chat.types";

@Injectable()
export class MockChatService extends ChatService {
  private readonly messagesState = signal<readonly ChatMessage[]>([]);
  private readonly statusState = signal<ChatStatus>("idle");
  private readonly currentScreenState = signal<AppScreen>("chat");

  readonly messages = this.messagesState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly currentScreen = this.currentScreenState.asReadonly();

  constructor() {
    super();
    this.appendAssistantResponse(getMockResponse("greeting"), { includeTyping: false });
  }

  async sendMessage(content: string): Promise<void> {
    const trimmed = content.trim();

    if (trimmed.length === 0) {
      return;
    }

    this.appendUserMessage(trimmed);
    await this.respondWith(this.routeUserText(trimmed), trimmed);
  }

  async chooseQuickReply(label: string): Promise<void> {
    const flow = this.routeQuickReply(label);

    if (flow === "planning") {
      await this.sendMessage(planningQuestion);
      return;
    }

    if (flow === "today") {
      await this.sendMessage(quickReplyPhrases.todayQ);
      return;
    }

    if (flow === "waiting") {
      await this.sendMessage(quickReplyPhrases.waitingQ);
      return;
    }

    if (flow === "inbox") {
      await this.sendMessage(quickReplyPhrases.inboxCleanup);
      return;
    }

    const userText = this.userTextForQuickReply(label, flow);
    this.appendUserMessage(userText);
    await this.respondWith(flow, userText);
  }

  startVoiceCapture(): void {
    void this.captureVoiceTranscript();
  }

  cancelVoiceCapture(): void {
    this.statusState.set("idle");
  }

  navigate(screen: AppScreen): void {
    this.currentScreenState.set(screen);
  }

  private async captureVoiceTranscript(): Promise<void> {
    this.statusState.set("streaming");
    this.appendUserMessage(voiceTranscript);
    await this.respondWith("captureConfirm", voiceTranscript);
  }

  private async respondWith(flow: MockFlow, capturedText?: string): Promise<void> {
    this.statusState.set("thinking");
    await Promise.resolve();
    this.appendAssistantResponse(getMockResponse(flow, capturedText));
    this.statusState.set("idle");
  }

  private appendAssistantResponse(
    response: MockAssistantResponse,
    options: { includeTyping?: boolean } = {},
  ): void {
    const includeTyping = options.includeTyping ?? true;

    this.messagesState.update((messages) => [
      ...messages,
      createToolMessage(this.nextId(messages), this.now(), response.tool),
      ...(includeTyping ? [this.createTypingMessage(this.nextId(messages, 2))] : []),
      createContentMessage(
        this.nextId(messages, includeTyping ? 3 : 2),
        this.now(),
        response,
      ),
    ]);
  }

  private appendUserMessage(text: string): void {
    this.messagesState.update((messages) => [
      ...messages,
      {
        id: this.nextId(messages),
        role: "user",
        kind: "user",
        text,
        createdAt: this.now(),
      } satisfies UserChatMessage,
    ]);
  }

  private createTypingMessage(id: string): AssistantTypingMessage {
    return {
      id,
      role: "assistant",
      kind: "typing",
      createdAt: this.now(),
    };
  }

  private routeUserText(text: string): MockFlow {
    if (routePatterns.planning.test(text)) {
      return "planning";
    }

    if (routePatterns.today.test(text)) {
      return "today";
    }

    if (routePatterns.waiting.test(text)) {
      return "waiting";
    }

    if (routePatterns.inbox.test(text)) {
      return "inbox";
    }

    return "acknowledge";
  }

  private routeQuickReply(label: string): MockFlow {
    const planRelated =
      label === quickReplyPhrases.planTomorrow ||
      label === quickReplyPhrases.plan4h ||
      label === quickReplyPhrases.planNext ||
      /plan/i.test(label);

    if (planRelated && label !== quickReplyPhrases.planConfirm) {
      return "planning";
    }

    if (label === quickReplyPhrases.todayQ || label === quickReplyPhrases.startToday) {
      return "today";
    }

    if (
      label === quickReplyPhrases.waitingQ ||
      label === quickReplyPhrases.showWaiting ||
      label === quickReplyPhrases.pingMax ||
      /max|db/i.test(label)
    ) {
      return "waiting";
    }

    if (label === quickReplyPhrases.inboxCleanup) {
      return "inbox";
    }

    if (label === quickReplyPhrases.planConfirm) {
      return "planEntered";
    }

    if (label === quickReplyPhrases.annaFirst) {
      return "annaPriority";
    }

    if (label === quickReplyPhrases.captureOnly) {
      return "captureOnly";
    }

    if (
      label === quickReplyPhrases.laterDecide ||
      label === quickReplyPhrases.doNothing ||
      label === quickReplyPhrases.later
    ) {
      return "later";
    }

    return "acknowledge";
  }

  private userTextForQuickReply(label: string, flow: MockFlow): string {
    if (flow === "planEntered") {
      return "Ja, trag den Plan ein.";
    }

    if (flow === "annaPriority") {
      return "Ja, Anna soll Priorität haben.";
    }

    return label;
  }

  private nextId(messages: readonly ChatMessage[], offset = 1): string {
    return `m-${messages.length + offset}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
