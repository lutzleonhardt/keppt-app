import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
} from "@angular/core";

import { ChatService } from "../chat/chat.service";
import { ChatStore } from "../chat/chat.store";
import { ChatMessageComponent } from "../chat/components/chat-message";
import { MockChatService } from "../mock/mock-chat.service";

@Component({
  selector: "keppt-chat-shell",
  imports: [ChatMessageComponent],
  templateUrl: "./chat-shell.html",
  styleUrl: "./chat-shell.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: ChatService, useClass: MockChatService }, ChatStore],
})
export class ChatShellComponent {
  @ViewChild("conversation")
  private conversation?: ElementRef<HTMLElement>;

  protected readonly store = inject(ChatStore);
  protected readonly today = "Mittwoch, 6. Mai";

  private isPinnedToBottom = true;

  constructor() {
    effect(() => {
      this.store.messages().length;

      if (this.isPinnedToBottom) {
        this.scheduleScrollToBottom();
      }
    });
  }

  protected updateDraft(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.store.updateDraft(target.value);
  }

  protected updateScrollAnchor(): void {
    const element = this.conversation?.nativeElement;

    if (!element) {
      return;
    }

    this.isPinnedToBottom = this.isNearBottom(element);
  }

  protected async submitDraft(): Promise<void> {
    await this.store.submitDraft();
  }

  protected async submitQuickAction(text: string): Promise<void> {
    await this.store.chooseQuickReply(text);
  }

  protected startVoiceCapture(): void {
    this.store.startVoiceCapture();
  }

  private scheduleScrollToBottom(): void {
    requestAnimationFrame(() => {
      this.scrollConversationToBottom();
      // ngx-markdown can grow the message height after the first scroll, which
      // previously left the list slightly above the bottom after new messages.
      requestAnimationFrame(() => this.scrollConversationToBottom());
    });
  }

  private scrollConversationToBottom(): void {
    const element = this.conversation?.nativeElement;

    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
    this.isPinnedToBottom = true;
  }

  private isNearBottom(element: HTMLElement): boolean {
    return element.scrollHeight - element.scrollTop - element.clientHeight <= 48;
  }
}
