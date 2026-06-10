import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { LucideMenu, LucideMoreHorizontal } from "@lucide/angular";

import { KepptMonogramComponent } from "../../ui/keppt-monogram";
import { StatusDotComponent } from "../../ui/status-dot";

@Component({
  selector: "keppt-session-header",
  imports: [KepptMonogramComponent, LucideMenu, LucideMoreHorizontal, StatusDotComponent],
  templateUrl: "./session-header.html",
  styleUrl: "./session-header.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionHeaderComponent {
  readonly hasMessages = input.required<boolean>();

  protected readonly subtitle = computed(() =>
    this.hasMessages() ? "Heute · Mittwoch, 6. Mai" : "Bereit zum Erfassen",
  );
}
