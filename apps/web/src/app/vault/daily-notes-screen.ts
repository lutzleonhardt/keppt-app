import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
} from "@angular/core";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { LucideChevronRight } from "@lucide/angular";

import { NavigationService } from "../navigation/navigation.service";
import { formatLocalDate } from "../i18n/local-date";
import { VaultPageHeaderComponent } from "./vault-page-header";
import { VaultRepository } from "./vault.repository";

@Component({
  selector: "keppt-daily-notes-screen",
  imports: [LucideChevronRight, TranslocoPipe, VaultPageHeaderComponent],
  templateUrl: "./daily-notes-screen.html",
  styleUrl: "./daily-notes-screen.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyNotesScreenComponent {
  protected readonly nav = inject(NavigationService);
  private readonly repository = inject(VaultRepository);
  private readonly transloco = inject(TranslocoService);

  protected readonly days = resource({
    loader: () => this.repository.listDailyNotes(),
  });

  protected readonly dayCards = computed(() => {
    const language = this.transloco.activeLang();

    return this.days.hasValue()
      ? this.days.value().map((day) => ({
          ...day,
          ...formatLocalDate(day.date, language),
        }))
      : [];
  });

  protected retryDailyIndex(): void {
    this.days.reload();
  }
}
