import { ChangeDetectionStrategy, Component, input } from "@angular/core";

import type { UserChatMessage } from "../chat.types";

@Component({
  selector: "keppt-user-message",
  templateUrl: "./user-message.html",
  styleUrl: "./user-message.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMessageComponent {
  readonly message = input.required<UserChatMessage>();
}
