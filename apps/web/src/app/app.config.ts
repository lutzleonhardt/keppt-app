import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { provideTransloco } from "@jsverse/transloco";
import { provideMarkdown } from "ngx-markdown";

import { routes } from "./app.routes";
import { TranslocoHttpLoader } from "./transloco-loader";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideTransloco({
      config: {
        availableLangs: ["de", "en"],
        defaultLang: "de",
        fallbackLang: "de",
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideMarkdown(),
  ],
};
