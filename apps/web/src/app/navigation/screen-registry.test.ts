import { describe, expect, it } from "vitest";

import {
  isAppScreen,
  isNavigableScreen,
  SCREEN_REGISTRY,
  screenUrl,
  VAULT_SCREEN_ORDER,
  type NavigableScreen,
} from "./screen-registry";

describe("screen registry", () => {
  it("owns the ordered vault screen metadata", () => {
    expect(
      VAULT_SCREEN_ORDER.map((screen) => ({
        screen,
        ...SCREEN_REGISTRY[screen],
      })),
    ).toEqual([
      {
        screen: "inbox",
        kind: "vault",
        path: "inbox",
        file: "tasks/inbox.md",
        i18nPrefix: "vault.inbox",
        ask: "inboxCleanup",
      },
      {
        screen: "focus",
        kind: "vault",
        path: "focus",
        file: "tasks/focus.md",
        i18nPrefix: "vault.focus",
      },
      {
        screen: "next",
        kind: "vault",
        path: "next",
        file: "tasks/next-actions.md",
        i18nPrefix: "vault.next",
        ask: "nextContext",
      },
      {
        screen: "waiting",
        kind: "vault",
        path: "waiting",
        file: "tasks/waiting.md",
        i18nPrefix: "vault.waiting",
        ask: "waiting",
      },
      {
        screen: "someday",
        kind: "vault",
        path: "someday",
        file: "tasks/someday-maybe.md",
        i18nPrefix: "vault.someday",
      },
    ]);
  });

  it("validates screen IDs at runtime without accepting inherited keys", () => {
    expect(isAppScreen("inbox")).toBe(true);
    expect(isAppScreen("daily-detail")).toBe(true);
    expect(isAppScreen("toString")).toBe(false);
    expect(isAppScreen(null)).toBe(false);
    expect(isNavigableScreen("daily")).toBe(true);
    expect(isNavigableScreen("daily-detail")).toBe(false);
  });

  it("builds concrete static URLs and rejects erased invalid values", () => {
    expect(screenUrl("chat")).toBe("/");
    expect(screenUrl("waiting")).toBe("/waiting");
    expect(() => screenUrl("daily-detail" as NavigableScreen)).toThrowError(
      "Unsupported navigation target: daily-detail",
    );
  });
});
