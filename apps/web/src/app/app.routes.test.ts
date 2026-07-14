import { describe, expect, it } from "vitest";

import { routes } from "./app.routes";
import {
  SCREEN_REGISTRY,
  VAULT_SCREEN_ORDER,
} from "./navigation/screen-registry";
import { VaultFileScreenComponent } from "./vault/vault-file-screen";

describe("app routes", () => {
  it("projects every registered path and screen ID into the route table", () => {
    const screenRoutes = routes.filter((route) => route.data?.["screen"]);
    const configuredPaths = screenRoutes.map(
      (route) => [route.data?.["screen"], route.path] as const,
    );
    const registryPaths = Object.entries(SCREEN_REGISTRY).map(
      ([screen, definition]) => [screen, definition.path] as const,
    );

    expect(configuredPaths).toHaveLength(registryPaths.length);
    expect(new Set(configuredPaths.map(([screen]) => screen)).size).toBe(
      configuredPaths.length,
    );
    expect(new Map(configuredPaths)).toEqual(new Map(registryPaths));
  });

  it("projects vault metadata without inventing an ask flow for other rows", () => {
    const vaultRoutes = routes.filter(
      (route) => route.component === VaultFileScreenComponent,
    );

    expect(vaultRoutes).toHaveLength(VAULT_SCREEN_ORDER.length);
    for (const [index, screen] of VAULT_SCREEN_ORDER.entries()) {
      const definition = SCREEN_REGISTRY[screen];
      const route = vaultRoutes[index];
      if (!route) {
        throw new Error(`Missing vault route for ${screen}`);
      }

      expect(route).toMatchObject({
        path: definition.path,
        component: VaultFileScreenComponent,
        data: {
          screen,
          file: definition.file,
          i18nPrefix: definition.i18nPrefix,
        },
      });
      expect(Object.hasOwn(route.data ?? {}, "ask")).toBe("ask" in definition);
      if ("ask" in definition) {
        expect(route.data?.["ask"]).toBe(definition.ask);
      }
    }
  });
});
