import { ChangeDetectionStrategy, Component, inject } from "@angular/core";

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
  protected readonly store = inject(ChatStore);
  protected readonly today = "Mittwoch, 6. Mai";

  protected updateDraft(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.store.updateDraft(target.value);
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
}
