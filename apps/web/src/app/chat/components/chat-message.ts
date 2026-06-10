import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import {
  isAssistantContentMessage,
  isAssistantTypingMessage,
  isUserChatMessage,
} from "../chat.types";
import type { ChatMessage } from "../chat.types";
import { AssistantMessageComponent } from "./assistant-message";
import { UserMessageComponent } from "./user-message";

/**
 * Renders a single non-tool message. Tool calls never reach here — the list
 * groups them into `keppt-tool-group` before this component sees them.
 */
@Component({
  selector: "keppt-chat-message",
  imports: [AssistantMessageComponent, UserMessageComponent],
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

  protected readonly typingMessage = computed(() => {
    const message = this.message();
    return isAssistantTypingMessage(message) ? message : undefined;
  });

  protected readonly contentMessage = computed(() => {
    const message = this.message();
    return isAssistantContentMessage(message) ? message : undefined;
  });
}
