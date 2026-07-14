import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  viewChild,
} from "@angular/core";
import {
  translateSignal,
  TranslocoPipe,
  TranslocoService,
} from "@jsverse/transloco";
import { LucideSettings, LucideX } from "@lucide/angular";

import { NavigationService } from "./navigation.service";
import { VAULT_SCREEN_ORDER, type VaultScreen } from "./screen-registry";
import { APP_TODAY, formatLocalDate } from "../i18n/local-date";

interface DrawerListRow {
  readonly screen: VaultScreen;
  readonly labelKey: string;
}

@Component({
  selector: "keppt-app-drawer",
  imports: [LucideSettings, LucideX, TranslocoPipe],
  templateUrl: "./app-drawer.html",
  styleUrl: "./app-drawer.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // The drawer stays mounted for the slide transition, so unlike the mic
    // overlay the Escape listener must guard on visibility itself.
    "(document:keydown.escape)": "closeIfOpen()",
  },
})
export class AppDrawerComponent {
  protected readonly nav = inject(NavigationService);
  private readonly transloco = inject(TranslocoService);
  private readonly today = inject(APP_TODAY);

  private readonly drawerRoot =
    viewChild.required<ElementRef<HTMLElement>>("drawerRoot");

  protected readonly listRows: readonly DrawerListRow[] =
    VAULT_SCREEN_ORDER.map((screen) => ({
      screen,
      labelKey: `drawer.items.${screen}`,
    }));

  private readonly userName = translateSignal("drawer.user.name");
  protected readonly userInitial = computed(() => this.userName().charAt(0));
  protected readonly dateLabel = computed(
    () => formatLocalDate(this.today, this.transloco.activeLang()).compactLabel,
  );

  constructor() {
    // Cheap-pass a11y in line with the mic overlay: move focus onto the
    // drawer container when it opens (no focus trap — deferred).
    effect(() => {
      if (this.nav.drawerOpen()) {
        this.drawerRoot().nativeElement.focus();
      }
    });
  }

  protected closeIfOpen(): void {
    if (this.nav.drawerOpen()) {
      this.nav.closeDrawer();
    }
  }
}
