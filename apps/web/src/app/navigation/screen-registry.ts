import type { VaultTaskFile } from "../vault/vault.types";

export type AskInChatFlow =
  | "today"
  | "inboxCleanup"
  | "waiting"
  | "nextContext";

type ScreenDefinition =
  | { readonly kind: "chat"; readonly path: "" }
  | {
      readonly kind: "vault";
      readonly path: string;
      readonly file: VaultTaskFile;
      readonly i18nPrefix: string;
      readonly ask?: AskInChatFlow;
    }
  | { readonly kind: "daily"; readonly path: "daily" }
  | { readonly kind: "daily-detail"; readonly path: "daily/:date" };

export const SCREEN_REGISTRY = {
  chat: { kind: "chat", path: "" },
  inbox: {
    kind: "vault",
    path: "inbox",
    file: "tasks/inbox.md",
    i18nPrefix: "vault.inbox",
    ask: "inboxCleanup",
  },
  focus: {
    kind: "vault",
    path: "focus",
    file: "tasks/focus.md",
    i18nPrefix: "vault.focus",
  },
  next: {
    kind: "vault",
    path: "next",
    file: "tasks/next-actions.md",
    i18nPrefix: "vault.next",
    ask: "nextContext",
  },
  waiting: {
    kind: "vault",
    path: "waiting",
    file: "tasks/waiting.md",
    i18nPrefix: "vault.waiting",
    ask: "waiting",
  },
  someday: {
    kind: "vault",
    path: "someday",
    file: "tasks/someday-maybe.md",
    i18nPrefix: "vault.someday",
  },
  daily: { kind: "daily", path: "daily" },
  "daily-detail": { kind: "daily-detail", path: "daily/:date" },
} as const satisfies Record<string, ScreenDefinition>;

export type AppScreen = keyof typeof SCREEN_REGISTRY;
type ScreenKind = ScreenDefinition["kind"];
type ScreenOfKind<K extends ScreenKind> = {
  [S in AppScreen]: (typeof SCREEN_REGISTRY)[S]["kind"] extends K ? S : never;
}[AppScreen];
export type NavigableScreen = ScreenOfKind<"chat" | "vault" | "daily">;
export type VaultScreen = ScreenOfKind<"vault">;

// This intentionally declares UI order; screen metadata remains registry-owned.
export const VAULT_SCREEN_ORDER = [
  "inbox",
  "focus",
  "next",
  "waiting",
  "someday",
] as const satisfies readonly VaultScreen[];

export function isAppScreen(value: unknown): value is AppScreen {
  return typeof value === "string" && Object.hasOwn(SCREEN_REGISTRY, value);
}

export function isNavigableScreen(value: unknown): value is NavigableScreen {
  return isAppScreen(value) && SCREEN_REGISTRY[value].kind !== "daily-detail";
}

export function screenUrl(screen: NavigableScreen): string {
  if (!isNavigableScreen(screen)) {
    throw new Error(`Unsupported navigation target: ${String(screen)}`);
  }

  return `/${SCREEN_REGISTRY[screen].path}`;
}
