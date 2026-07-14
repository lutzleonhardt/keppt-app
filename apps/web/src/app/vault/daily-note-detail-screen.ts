import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from "@angular/core";
import { TranslocoPipe, TranslocoService } from "@jsverse/transloco";
import { MarkdownComponent } from "ngx-markdown";

import { NavigationService } from "../navigation/navigation.service";
import { formatLocalDate } from "../i18n/local-date";
import { VaultPageHeaderComponent } from "./vault-page-header";
import { VaultRepository } from "./vault.repository";
import { dailyFilePath } from "./vault.types";

/**
 * Detail surface for one day's note, reached only from the Daily Notes list
 * (the drawer never targets it); back returns to the list. The `date` route
 * param is guaranteed valid by the `daily/:date` guard in `app.routes.ts`.
 */
@Component({
  selector: "keppt-daily-note-detail-screen",
  imports: [MarkdownComponent, TranslocoPipe, VaultPageHeaderComponent],
  templateUrl: "./daily-note-detail-screen.html",
  styleUrl: "./daily-note-detail-screen.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyNoteDetailScreenComponent {
  protected readonly nav = inject(NavigationService);
  private readonly repository = inject(VaultRepository);
  private readonly transloco = inject(TranslocoService);

  readonly date = input.required<string>();

  protected readonly localizedDate = computed(() =>
    formatLocalDate(this.date(), this.transloco.activeLang()),
  );

  protected readonly content = resource({
    params: () => dailyFilePath(this.date()),
    loader: ({ params: file }) => this.repository.readFile(file),
  });

  protected retryContent(): void {
    this.content.reload();
  }
}
