import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  viewChild,
} from "@angular/core";

import { ChatService } from "./chat.service";
import { ChatStore } from "./chat.store";
import { VoiceCaptureService } from "./voice-capture.service";
import { ChatInputComponent } from "./components/chat-input";
import { ChatMessageListComponent } from "./components/chat-message-list";
import { MicOverlayComponent } from "./components/mic-overlay";
import { QuickRepliesComponent } from "./components/quick-replies";
import { SessionHeaderComponent } from "./components/session-header";
import { MockChatService } from "../mock/mock-chat.service";
import { MockVoiceCaptureService } from "../mock/mock-voice-capture.service";

@Component({
  selector: "keppt-chat-screen",
  imports: [
    ChatInputComponent,
    ChatMessageListComponent,
    MicOverlayComponent,
    QuickRepliesComponent,
    SessionHeaderComponent,
  ],
  templateUrl: "./chat-screen.html",
  styleUrl: "./chat-screen.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: ChatService, useClass: MockChatService },
    { provide: VoiceCaptureService, useClass: MockVoiceCaptureService },
    ChatStore,
  ],
})
export class ChatScreenComponent {
  protected readonly store = inject(ChatStore);
  private readonly injector = inject(Injector);
  private readonly composer = viewChild.required(ChatInputComponent);

  protected readonly hasMessages = computed(
    () => this.store.messages().length > 0,
  );

  protected updateDraft(value: string): void {
    this.store.updateDraft(value);
  }

  protected async submitDraft(): Promise<void> {
    await this.store.submitDraft();
  }

  protected cancelResponse(): void {
    this.store.cancel();
  }

  protected async submitQuickReply(text: string): Promise<void> {
    await this.store.chooseQuickReply(text);
  }

  protected openMicOverlay(): void {
    this.store.openMicOverlay();
  }

  protected async finishRecording(): Promise<void> {
    await this.store.finishRecording();

    // Only return focus once the capture actually closed — an empty/failed
    // transcription keeps the overlay open in its error state.
    if (this.store.micState() === "closed") {
      this.focusComposer();
    }
  }

  protected retryRecording(): void {
    this.store.retryRecording();
  }

  protected cancelMicOverlay(): void {
    this.store.cancelMicOverlay();
    this.focusComposer();
  }

  private focusComposer(): void {
    // Defer until after the overlay teardown and any appended transcript have
    // been rendered, so the caret lands at the end of the up-to-date value.
    afterNextRender(() => this.composer().focusEnd(), {
      injector: this.injector,
    });
  }
}
