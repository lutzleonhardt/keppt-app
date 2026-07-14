import { ChangeDetectionStrategy, Component, input } from "@angular/core";

import type { AssistantContentMessage } from "../chat.types";
import { AssistantContentMessageComponent } from "./assistant-content-message";

@Component({
  selector: "keppt-assistant-message",
  imports: [AssistantContentMessageComponent],
  templateUrl: "./assistant-message.html",
  styleUrl: "./assistant-message.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantMessageComponent {
  readonly message = input.required<AssistantContentMessage>();
}
