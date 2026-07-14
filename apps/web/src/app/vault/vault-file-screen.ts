import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from "@angular/core";
import { TranslocoPipe } from "@jsverse/transloco";
import { MarkdownComponent } from "ngx-markdown";

import { NavigationService } from "../navigation/navigation.service";
import type { AskInChatFlow } from "../navigation/screen-registry";
import { VaultPageHeaderComponent } from "./vault-page-header";
import { VaultRepository } from "./vault.repository";
import type { VaultTaskFile } from "./vault.types";

/**
 * One routed component serves Inbox, Focus, Next Actions, Waiting, and
 * Someday/Maybe: the screens differ only in route data (`file`, `i18nPrefix`,
 * optional `ask`), bound to the inputs below via `withComponentInputBinding`.
 * The body is the vault file's markdown, rendered as-is — no typed row models.
 */
@Component({
  selector: "keppt-vault-file-screen",
  imports: [MarkdownComponent, TranslocoPipe, VaultPageHeaderComponent],
  templateUrl: "./vault-file-screen.html",
  styleUrl: "./vault-file-screen.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VaultFileScreenComponent {
  protected readonly nav = inject(NavigationService);
  private readonly repository = inject(VaultRepository);

  readonly file = input.required<VaultTaskFile>();
  readonly i18nPrefix = input.required<string>();
  readonly ask = input<AskInChatFlow>();

  protected readonly titleKey = computed(() => `${this.i18nPrefix()}.title`);
  protected readonly subtitleKey = computed(
    () => `${this.i18nPrefix()}.subtitle`,
  );
  protected readonly hintKey = computed(() => `${this.i18nPrefix()}.hint`);

  protected readonly content = resource({
    params: () => this.file(),
    loader: ({ params: file }) => this.repository.readFile(file),
  });

  protected retryContent(): void {
    this.content.reload();
  }
}
