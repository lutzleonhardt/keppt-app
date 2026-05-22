import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import {
  isAssistantContentMessage,
  isAssistantToolMessage,
  isAssistantTypingMessage,
  isUserChatMessage,
} from "../chat.types";
import type { ChatMessage } from "../chat.types";
import { AssistantContentMessageComponent } from "./assistant-content-message";

@Component({
  selector: "keppt-chat-message",
  imports: [AssistantContentMessageComponent],
  templateUrl: "./chat-message.html",
  styleUrl: "./chat-message.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageComponent {
  readonly message = input.required<ChatMessage>();

  protected readonly userMessage = computed(() => {
    const message = this.message();
    return isUserChatMessage(message) ? message : undefined;
  });

  protected readonly toolMessage = computed(() => {
    const message = this.message();
    return isAssistantToolMessage(message) ? message : undefined;
  });

  protected readonly typingMessage = computed(() => {
    const message = this.message();
    return isAssistantTypingMessage(message) ? message : undefined;
  });

  protected readonly contentMessage = computed(() => {
    const message = this.message();
    return isAssistantContentMessage(message) ? message : undefined;
  });
}
