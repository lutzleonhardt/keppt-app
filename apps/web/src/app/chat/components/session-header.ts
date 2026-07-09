import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { translateSignal, TranslocoPipe } from "@jsverse/transloco";
import { LucideMenu, LucideMoreHorizontal } from "@lucide/angular";

import { KepptMonogramComponent } from "../../ui/keppt-monogram";
import { StatusDotComponent } from "../../ui/status-dot";

@Component({
  selector: "keppt-session-header",
  imports: [
    KepptMonogramComponent,
    LucideMenu,
    LucideMoreHorizontal,
    StatusDotComponent,
    TranslocoPipe,
  ],
  templateUrl: "./session-header.html",
  styleUrl: "./session-header.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionHeaderComponent {
  readonly hasMessages = input.required<boolean>();

  protected readonly subtitle = translateSignal(
    computed(() => (this.hasMessages() ? "chat.subtitle.session" : "chat.subtitle.empty")),
  );
}
