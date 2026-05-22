import { ChangeDetectionStrategy, Component, input } from "@angular/core";

import type { AssistantContentMessage } from "../chat.types";
import { AssistantBlockComponent } from "./assistant-block";

@Component({
  selector: "keppt-assistant-content-message",
  imports: [AssistantBlockComponent],
  template: `
    @for (block of message().blocks; track block.id) {
      <keppt-assistant-block [block]="block" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantContentMessageComponent {
  readonly message = input.required<AssistantContentMessage>();
}
