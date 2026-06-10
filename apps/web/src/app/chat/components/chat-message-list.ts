import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  input,
  viewChild,
} from "@angular/core";

import { groupMessagesForRender } from "../chat-message-groups";
import { isUserChatMessage, type ChatMessage } from "../chat.types";
import { ChatMessageComponent } from "./chat-message";
import { ToolGroupComponent } from "./tool-group";

@Component({
  selector: "keppt-chat-message-list",
  imports: [ChatMessageComponent, ToolGroupComponent],
  templateUrl: "./chat-message-list.html",
  styleUrl: "./chat-message-list.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatMessageListComponent implements AfterViewInit {
  readonly messages = input.required<readonly ChatMessage[]>();

  /**
   * View projection of the raw message list: consecutive tool calls collapse
   * into one group, everything else stays its own item. Scroll bookkeeping below
   * still reads the raw `messages()` — grouping is purely presentational.
   */
  protected readonly renderItems = computed(() =>
    groupMessagesForRender(this.messages()),
  );

  private readonly scrollViewport =
    viewChild.required<ElementRef<HTMLElement>>("scrollViewport");

  private isPinnedToBottom = true;
  private lastUserMessageId?: string;

  constructor() {
    effect(() => {
      const messages = this.messages();

      // A brand-new user message means the user just sent something — re-pin to
      // the bottom regardless of where they had scrolled, so their message and
      // the assistant turn that follows it stay in view. Assistant updates on
      // their own only follow along while the user is still pinned.
      //
      // We track the latest *user* message rather than the tail: the lifecycle
      // appends a typing indicator synchronously in the same task as the user
      // message, so by the time this batched effect runs the user message no
      // longer sits at the tail. Checking only `at(-1)` would miss it entirely.
      const latestUser = messages.findLast(isUserChatMessage);
      if (latestUser && latestUser.id !== this.lastUserMessageId) {
        this.isPinnedToBottom = true;
      }
      this.lastUserMessageId = latestUser?.id;

      if (this.isPinnedToBottom) {
        this.scheduleScrollToBottom();
      }
    });
  }

  ngAfterViewInit(): void {
    this.scheduleScrollToBottom();
  }

  protected updateScrollAnchor(): void {
    this.isPinnedToBottom = this.isNearBottom(this.scrollViewport().nativeElement);
  }

  private scheduleScrollToBottom(): void {
    requestAnimationFrame(() => {
      this.scrollToBottom();
      requestAnimationFrame(() => this.scrollToBottom());
    });
  }

  private scrollToBottom(): void {
    const element = this.scrollViewport().nativeElement;
    element.scrollTop = element.scrollHeight;
    this.isPinnedToBottom = true;
  }

  private isNearBottom(element: HTMLElement): boolean {
    return element.scrollHeight - element.scrollTop - element.clientHeight <= 48;
  }
}
