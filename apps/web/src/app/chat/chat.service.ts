import { computed, type Signal } from "@angular/core";

import type { AppScreen, ChatMessage, ChatStatus } from "./chat.types";

export abstract class ChatService {
  abstract readonly messages: Signal<readonly ChatMessage[]>;
  abstract readonly status: Signal<ChatStatus>;
  abstract readonly currentScreen: Signal<AppScreen>;

  /**
   * A turn is in flight; consumers must not start a new one until it settles.
   * Defined on the contract so the lifecycle owner decides what "busy" means
   * (e.g. a streaming backend stays busy through "streaming"), and the
   * store/UI plus the implementation's own re-entrancy guards all read one
   * definition rather than re-deriving `status !== "idle"` everywhere.
   */
  readonly busy: Signal<boolean> = computed(() => this.status() !== "idle");

  abstract sendMessage(content: string): Promise<void>;
  abstract chooseQuickReply(label: string): Promise<void>;

  /**
   * Aborts the in-flight turn, if any. The user message that started the turn
   * stays; everything the assistant produced for it (tool rows, typing, partial
   * prose, quick replies) is discarded — a turn is all-or-nothing, never left
   * half-finished. Implementations must also stop the underlying work so a real
   * backend can release the stream rather than keep billing. A no-op when idle,
   * so callers may fire it without first checking `busy()`.
   */
  abstract cancel(): void;
  abstract navigate(screen: AppScreen): void;
}
