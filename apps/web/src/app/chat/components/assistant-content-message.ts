import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { MarkdownComponent } from "ngx-markdown";

import type { AssistantContentMessage } from "../chat.types";

@Component({
  selector: "keppt-assistant-content-message",
  imports: [MarkdownComponent],
  templateUrl: "./assistant-content-message.html",
  styles: [":host { display: contents; }"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantContentMessageComponent {
  readonly message = input.required<AssistantContentMessage>();
}
