import { inject, Injectable, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  NavigationEnd,
  Router,
  type ActivatedRouteSnapshot,
} from "@angular/router";
import { TranslocoService } from "@jsverse/transloco";
import { filter, firstValueFrom } from "rxjs";

import { ChatService } from "../chat/chat.service";
import {
  isAppScreen,
  screenUrl,
  type AppScreen,
  type AskInChatFlow,
  type NavigableScreen,
} from "./screen-registry";

// These are app-authored prompts, so each phrase lives in the locale catalog
// beside the UI that offers it. Resolve the key only when sending so a runtime
// language change is reflected in the user bubble; the observable API also
// waits for that language's catalog if it has not loaded yet.
const ASK_PHRASE_KEYS: Record<AskInChatFlow, string> = {
  today: "drawer.ask.today",
  inboxCleanup: "vault.inbox.ask",
  waiting: "vault.waiting.ask",
  nextContext: "vault.next.ask",
};

/**
 * Owns drawer visibility and screen navigation. The Angular router is the
 * source of truth: only a successful `NavigationEnd` updates `currentScreen`,
 * including browser back/forward, deep links, redirects, and calls to `go()`.
 */
@Injectable({ providedIn: "root" })
export class NavigationService {
  private readonly router = inject(Router);
  private readonly chat = inject(ChatService);
  private readonly transloco = inject(TranslocoService);

  private readonly drawerOpenState = signal(false);
  readonly drawerOpen = this.drawerOpenState.asReadonly();

  private readonly currentScreenState = signal<AppScreen>("chat");
  readonly currentScreen = this.currentScreenState.asReadonly();

  constructor() {
    // Usually the root drawer creates this service before initial navigation,
    // but syncing once also covers a future lazy instantiation after that event.
    this.syncCurrentScreen();

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.syncCurrentScreen());
  }

  openDrawer(): void {
    this.drawerOpenState.set(true);
  }

  closeDrawer(): void {
    this.drawerOpenState.set(false);
  }

  /** Navigates to a screen and closes the drawer (drawer selections must not linger). */
  async go(screen: NavigableScreen): Promise<boolean> {
    this.closeDrawer();
    const target = screenUrl(screen);

    // Angular resolves an ignored same-URL navigation with `false`. Treat
    // already being at the target as success so chat actions still run when
    // triggered from the chat screen itself.
    if (this.router.url === target) {
      return true;
    }

    return this.router.navigateByUrl(target);
  }

  /** Opens one day's note from the Daily Notes index. */
  openDailyNote(date: string): Promise<boolean> {
    this.closeDrawer();
    return this.router.navigateByUrl(`/daily/${date}`);
  }

  /**
   * Returns to chat and asks the flow's question as a user message. A cancelled
   * navigation does not leak the message onto the previous screen. While a turn
   * is already in flight the chat service's busy guard keeps the send a no-op.
   */
  async askInChat(flow: AskInChatFlow): Promise<void> {
    if (!(await this.go("chat"))) {
      return;
    }

    const phrase = await firstValueFrom(
      this.transloco.selectTranslate<string>(
        ASK_PHRASE_KEYS[flow],
        {},
        this.transloco.getActiveLang(),
      ),
    );
    await this.chat.sendMessage(phrase);
  }

  private syncCurrentScreen(): void {
    const screen = screenFromRoute(this.router.routerState.snapshot.root);
    if (screen) {
      this.currentScreenState.set(screen);
    }
  }
}

function screenFromRoute(root: ActivatedRouteSnapshot): AppScreen | null {
  let route = root;
  while (route.firstChild) {
    route = route.firstChild;
  }
  const screen: unknown = route.data["screen"];
  return isAppScreen(screen) ? screen : null;
}
