import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import type { InlineText } from "../chat.types";

@Component({
  selector: "keppt-inline-text",
  styleUrl: "./chat-inline-text.scss",
  template: `
    @switch (mark()) {
      @case ("strong") {
        <strong>{{ part().text }}</strong>
      }
      @case ("emphasis") {
        <em>{{ part().text }}</em>
      }
      @case ("muted") {
        <span class="muted">{{ part().text }}</span>
      }
      @case ("code") {
        <code>{{ part().text }}</code>
      }
      @default {
        <span>{{ part().text }}</span>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatInlineTextComponent {
  readonly part = input.required<InlineText>();

  protected readonly mark = computed(() => {
    const part = this.part();
    return "mark" in part ? part.mark : undefined;
  });
}
