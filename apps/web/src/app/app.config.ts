import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { provideTransloco } from "@jsverse/transloco";
import { MARKED_EXTENSIONS, provideMarkdown } from "ngx-markdown";

import { routes } from "./app.routes";
import { ChatService } from "./chat/chat.service";
import { ChatStore } from "./chat/chat.store";
import { VoiceCaptureService } from "./chat/voice-capture.service";
import { MockChatService } from "./mock/mock-chat.service";
import { MockVoiceCaptureService } from "./mock/mock-voice-capture.service";
import { HttpVaultRepository } from "./vault/http-vault.repository";
import { taskCheckboxExtension } from "./vault/vault-markdown";
import { VaultRepository } from "./vault/vault.repository";
import { TranslocoHttpLoader } from "./transloco-loader";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(),
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
    // The extension renders GFM task checkboxes as sanitizer-safe spans —
    // without it Angular's HTML sanitizer would strip the vault's `- [ ]`
    // checkboxes entirely (see vault-markdown.ts).
    provideMarkdown({
      markedExtensions: [
        {
          provide: MARKED_EXTENSIONS,
          useValue: taskCheckboxExtension,
          multi: true,
        },
      ],
    }),
    // App-level service wiring: abstract contracts are the DI tokens, so a
    // transport swap is exactly one binding here.
    { provide: ChatService, useClass: MockChatService },
    { provide: VoiceCaptureService, useClass: MockVoiceCaptureService },
    { provide: VaultRepository, useClass: HttpVaultRepository },
    ChatStore,
  ],
};
