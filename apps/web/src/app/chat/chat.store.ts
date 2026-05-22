import { computed, inject, Injectable, signal, type Signal } from "@angular/core";

import { ChatService } from "./chat.service";
import { isAssistantContentMessage } from "./chat.types";
import type { AppScreen, ChatMessage, ChatStatus, QuickReply } from "./chat.types";

@Injectable()
export class ChatStore {
  private readonly chat = inject(ChatService);
  private readonly draftState = signal("");

  readonly messages: Signal<readonly ChatMessage[]> = this.chat.messages;
  readonly status: Signal<ChatStatus> = this.chat.status;
  readonly currentScreen: Signal<AppScreen> = this.chat.currentScreen;
  readonly draft: Signal<string> = this.draftState.asReadonly();

  readonly quickReplies: Signal<readonly QuickReply[]> = computed(() => {
    const lastMessage = this.messages()
      .slice()
      .reverse()
      .find(isAssistantContentMessage);

    return lastMessage?.quickReplies ?? [];
  });

  readonly canSubmit: Signal<boolean> = computed(
    () => this.draft().trim().length > 0 && this.status() !== "streaming",
  );

  updateDraft(value: string): void {
    this.draftState.set(value);
  }

  async submitDraft(): Promise<void> {
    const content = this.draft().trim();

    if (content.length === 0) {
      return;
    }

    this.draftState.set("");
    await this.chat.sendMessage(content);
  }

  async chooseQuickReply(label: string): Promise<void> {
    await this.chat.chooseQuickReply(label);
  }

  startVoiceCapture(): void {
    this.chat.startVoiceCapture();
  }

  cancelVoiceCapture(): void {
    this.chat.cancelVoiceCapture();
  }

  navigate(screen: AppScreen): void {
    this.chat.navigate(screen);
  }
}
