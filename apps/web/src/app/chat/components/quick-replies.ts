import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { TranslocoPipe } from "@jsverse/transloco";

import type { QuickReply } from "../chat.types";

@Component({
  selector: "keppt-quick-replies",
  imports: [TranslocoPipe],
  templateUrl: "./quick-replies.html",
  styleUrl: "./quick-replies.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickRepliesComponent {
  readonly replies = input.required<readonly QuickReply[]>();
  readonly replySelected = output<string>();
}
