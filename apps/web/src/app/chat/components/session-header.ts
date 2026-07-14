import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import {
  translateSignal,
  TranslocoPipe,
  TranslocoService,
} from "@jsverse/transloco";
import { LucideMenu, LucideMoreHorizontal } from "@lucide/angular";

import { KepptMonogramComponent } from "../../ui/keppt-monogram";
import { StatusDotComponent } from "../../ui/status-dot";
import { APP_TODAY, formatLocalDate } from "../../i18n/local-date";

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

  readonly menuPressed = output<void>();

  private readonly transloco = inject(TranslocoService);
  private readonly today = inject(APP_TODAY);
  private readonly sessionDate = computed(
    () => formatLocalDate(this.today, this.transloco.activeLang()).fullLabel,
  );
  private readonly sessionSubtitle = translateSignal(
    "chat.subtitle.session",
    computed(() => ({ date: this.sessionDate() })),
  );
  private readonly emptySubtitle = translateSignal("chat.subtitle.empty");

  protected readonly subtitle = computed(() =>
    this.hasMessages() ? this.sessionSubtitle() : this.emptySubtitle(),
  );
}
