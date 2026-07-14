import { computed, inject, Injectable, signal, type Signal } from "@angular/core";

import { ChatService } from "./chat.service";
import {
  hasComposerText,
  isMicOverlayVisible,
  type MicCaptureState,
} from "./chat-ui-state";
import { VoiceCaptureService } from "./voice-capture.service";
import { isAssistantContentMessage } from "./chat.types";
import type { ChatMessage, ChatStatus, QuickReply } from "./chat.types";

@Injectable()
export class ChatStore {
  private readonly chat = inject(ChatService);
  private readonly voice = inject(VoiceCaptureService);
  private readonly draftState = signal("");
  private readonly capture = signal<MicCaptureState>("closed");

  readonly messages: Signal<readonly ChatMessage[]> = this.chat.messages;
  readonly status: Signal<ChatStatus> = this.chat.status;
  readonly draft: Signal<string> = this.draftState.asReadonly();
  readonly micState: Signal<MicCaptureState> = this.capture.asReadonly();
  readonly micOverlayVisible: Signal<boolean> = computed(() => isMicOverlayVisible(this.micState()));

  /** A turn is in flight; new turns must not start until it settles. */
  readonly busy: Signal<boolean> = this.chat.busy;

  /**
   * Quick replies are the suggested follow-ups to the most recent assistant
   * turn, so they belong to the very last message. As soon as anything else
   * (a user message, a tool row, the typing indicator) becomes the last
   * message they disappear — which also hides them for the whole in-flight
   * window without having to consult `busy`.
   */
  readonly activeQuickReplies: Signal<readonly QuickReply[]> = computed(() => {
    const last = this.messages().at(-1);

    return last && isAssistantContentMessage(last) ? last.quickReplies ?? [] : [];
  });

  readonly canSubmit: Signal<boolean> = computed(
    () => this.draft().trim().length > 0 && !this.busy(),
  );

  updateDraft(value: string): void {
    this.draftState.set(value);
  }

  async submitDraft(): Promise<void> {
    const content = this.draft().trim();

    if (content.length === 0 || this.busy()) {
      return;
    }

    this.draftState.set("");
    await this.chat.sendMessage(content);
  }

  async chooseQuickReply(label: string): Promise<void> {
    if (this.busy()) {
      return;
    }

    await this.chat.chooseQuickReply(label);
  }

  /**
   * Aborts the in-flight turn. The user message stays, the discarded response
   * disappears, and the composer returns to idle so the (possibly already
   * typed) draft can be sent. A no-op when idle.
   */
  cancel(): void {
    if (!this.busy()) {
      return;
    }

    this.chat.cancel();
  }

  openMicOverlay(): void {
    this.startCapture();
  }

  retryRecording(): void {
    this.startCapture();
  }

  async finishRecording(): Promise<void> {
    if (this.capture() !== "recording") {
      return;
    }

    this.capture.set("transcribing");

    let transcript: string;
    try {
      transcript = await this.voice.stopRecording();
    } catch {
      // A cancel already set the state to "closed" (the service rejects
      // stopRecording on abort), so only a genuine transcription failure is
      // still "transcribing" here.
      if (this.capture() === "transcribing") {
        this.capture.set("error");
      }
      return;
    }

    // Belt-and-suspenders: a well-behaved service rejects on cancel (→ catch
    // above), so this only guards against ever appending into a session that is
    // no longer transcribing.
    if (this.capture() !== "transcribing") {
      return;
    }

    if (hasComposerText(transcript)) {
      this.appendTranscript(transcript);
      this.capture.set("closed");
    } else {
      this.capture.set("error");
    }
  }

  cancelMicOverlay(): void {
    this.voice.cancelRecording();
    this.capture.set("closed");
  }

  private startCapture(): void {
    this.voice.startRecording();
    this.capture.set("recording");
  }

  private appendTranscript(text: string): void {
    // Raw Whisper output routinely carries leading/trailing whitespace; trim
    // once at this seam so the draft never picks up double spaces or padding.
    const incoming = text.trim();

    if (incoming.length === 0) {
      return;
    }

    const base = this.draftState().trimEnd();
    this.draftState.set(base.length > 0 ? `${base} ${incoming}` : incoming);
  }
}
