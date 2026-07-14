import { inject } from "@angular/core";
import {
  Router,
  type CanActivateFn,
  type Route,
  type Routes,
} from "@angular/router";

import { ChatScreenComponent } from "./chat/chat-screen";
import {
  SCREEN_REGISTRY,
  VAULT_SCREEN_ORDER,
  type AppScreen,
  type AskInChatFlow,
  type VaultScreen,
} from "./navigation/screen-registry";
import { DailyNoteDetailScreenComponent } from "./vault/daily-note-detail-screen";
import { DailyNotesScreenComponent } from "./vault/daily-notes-screen";
import { VaultFileScreenComponent } from "./vault/vault-file-screen";
import { VaultRepository } from "./vault/vault.repository";
import type { VaultTaskFile } from "./vault/vault.types";

// Every non-redirect route carries `data.screen` (an `AppScreen`) — the
// NavigationService's `NavigationEnd` sync reads it so `currentScreen` stays
// truthful even when the router navigates on its own (browser back/forward,
// deep link, redirect).
// `file`/`i18nPrefix`/`ask` bind to `VaultFileScreenComponent` inputs via
// `withComponentInputBinding` (see `app.config.ts`).

const knownDailyDate: CanActivateFn = async (route) => {
  const repository = inject(VaultRepository);
  const router = inject(Router);
  const date = route.paramMap.get("date");
  const dailyIndex = router.createUrlTree([
    "/",
    SCREEN_REGISTRY.daily.path,
  ]);

  if (date === null) {
    return dailyIndex;
  }

  const days = await repository.listDailyNotes();
  return days.some((day) => day.date === date) ? true : dailyIndex;
};

interface ScreenRouteData<S extends AppScreen = AppScreen> {
  readonly screen: S;
}

interface VaultRouteData extends ScreenRouteData<VaultScreen> {
  readonly file: VaultTaskFile;
  readonly i18nPrefix: string;
  readonly ask?: AskInChatFlow;
}

type NonVaultScreen = Exclude<AppScreen, VaultScreen>;

function screenRoute<S extends NonVaultScreen>(
  screen: S,
  route: Omit<Route, "path" | "data">,
): Route {
  return {
    path: SCREEN_REGISTRY[screen].path,
    ...route,
    data: { screen } satisfies ScreenRouteData<S>,
  };
}

function vaultRoute(screen: VaultScreen): Route {
  const definition = SCREEN_REGISTRY[screen];
  const data = {
    screen,
    file: definition.file,
    i18nPrefix: definition.i18nPrefix,
    ...("ask" in definition ? { ask: definition.ask } : {}),
  } satisfies VaultRouteData;

  return {
    path: definition.path,
    component: VaultFileScreenComponent,
    data,
  };
}

const vaultRoutes = VAULT_SCREEN_ORDER.map(vaultRoute);

export const routes: Routes = [
  screenRoute("chat", {
    component: ChatScreenComponent,
  }),
  ...vaultRoutes,
  screenRoute("daily", {
    component: DailyNotesScreenComponent,
  }),
  screenRoute("daily-detail", {
    component: DailyNoteDetailScreenComponent,
    canActivate: [knownDailyDate],
  }),
  {
    path: "**",
    redirectTo: SCREEN_REGISTRY.chat.path,
  },
];
