import type { Signal } from "@angular/core";

import type { AppScreen, ChatMessage, ChatStatus } from "./chat.types";

export abstract class ChatService {
  abstract readonly messages: Signal<readonly ChatMessage[]>;
  abstract readonly status: Signal<ChatStatus>;
  abstract readonly currentScreen: Signal<AppScreen>;
  abstract sendMessage(content: string): Promise<void>;
  abstract chooseQuickReply(label: string): Promise<void>;
  abstract startVoiceCapture(): void;
  abstract cancelVoiceCapture(): void;
  abstract navigate(screen: AppScreen): void;
}
