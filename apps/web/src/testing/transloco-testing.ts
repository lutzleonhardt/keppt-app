import { importProvidersFrom, type EnvironmentProviders } from "@angular/core";
import { TranslocoTestingModule } from "@jsverse/transloco";

import de from "../../public/i18n/de.json";
import en from "../../public/i18n/en.json";

/**
 * Provides Transloco for component specs with the real catalogs loaded
 * statically — the app's HTTP loader cannot run under test. Specs assert the
 * translated German strings (the default language), i.e. what the user sees,
 * so a missing catalog key fails the test instead of rendering a raw key.
 */
export function provideTranslocoTesting(): EnvironmentProviders {
  return importProvidersFrom(
    TranslocoTestingModule.forRoot({
      langs: { de, en },
      translocoConfig: {
        availableLangs: ["de", "en"],
        defaultLang: "de",
        fallbackLang: "de",
      },
      preloadLangs: true,
    }),
  );
}
