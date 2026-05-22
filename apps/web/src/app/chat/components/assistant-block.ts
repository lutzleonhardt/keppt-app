import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import type { AssistantBlock } from "../chat.types";
import { ChatInlineTextComponent } from "./chat-inline-text";
import { RichListItemComponent } from "./rich-list-item";

@Component({
  selector: "keppt-assistant-block",
  imports: [ChatInlineTextComponent, RichListItemComponent],
  templateUrl: "./assistant-block.html",
  styleUrl: "./assistant-block.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantBlockComponent {
  readonly block = input.required<AssistantBlock>();

  protected readonly headingBlock = computed(() => {
    const block = this.block();
    return block.type === "heading" ? block : undefined;
  });

  protected readonly paragraphBlock = computed(() => {
    const block = this.block();
    return block.type === "paragraph" ? block : undefined;
  });

  protected readonly orderedListBlock = computed(() => {
    const block = this.block();
    return block.type === "ordered-list" ? block : undefined;
  });

  protected readonly unorderedListBlock = computed(() => {
    const block = this.block();
    return block.type === "unordered-list" ? block : undefined;
  });

  protected readonly codeBlock = computed(() => {
    const block = this.block();
    return block.type === "code" ? block : undefined;
  });
}
