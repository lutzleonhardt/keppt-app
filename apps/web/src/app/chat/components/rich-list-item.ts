import { ChangeDetectionStrategy, Component, input } from "@angular/core";

import type { RichListItem } from "../chat.types";
import { ChatInlineTextComponent } from "./chat-inline-text";

@Component({
  selector: "keppt-rich-list-item",
  imports: [ChatInlineTextComponent],
  templateUrl: "./rich-list-item.html",
  styleUrl: "./rich-list-item.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RichListItemComponent {
  readonly item = input.required<RichListItem>();
}
