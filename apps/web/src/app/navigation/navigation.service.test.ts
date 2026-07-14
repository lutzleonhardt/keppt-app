import { ApplicationRef, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  NavigationError,
  provideRouter,
  Router,
  type Routes,
} from "@angular/router";
import { TranslocoService } from "@jsverse/transloco";
import { describe, expect, it, vi } from "vitest";

import { NavigationService } from "./navigation.service";
import type { NavigableScreen } from "./screen-registry";
import { ChatScreenComponent } from "../chat/chat-screen";
import { ChatService } from "../chat/chat.service";
import type { ChatMessage, ChatStatus } from "../chat/chat.types";
import { MockVaultRepository } from "../mock/mock-vault.repository";
import { VaultRepository } from "../vault/vault.repository";
import type { DailyNoteRef, VaultFile } from "../vault/vault.types";
import { routes } from "../app.routes";
import { provideTranslocoTesting } from "../../testing/transloco-testing";

// A service spec, not a component spec: the router seam needs the real Router
// against the real route table, so this is the one place TestBed appears
// directly. Routed components are never instantiated — no outlet is rendered.

class StubChatService extends ChatService {
  readonly messages = signal<readonly ChatMessage[]>([]);
  readonly status = signal<ChatStatus>("idle");

  sendMessage = vi.fn(async (_content: string) => {});
  chooseQuickReply = vi.fn(async (_label: string) => {});
  cancel = vi.fn();
}

class StubVaultRepository extends VaultRepository {
  readonly readFile = vi.fn(
    (_file: VaultFile): Promise<string | null> => Promise.resolve(null),
  );
  readonly listDailyNotes = vi.fn(
    (): Promise<readonly DailyNoteRef[]> => Promise.resolve([]),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(
  testRoutes: Routes = routes,
  vault: VaultRepository = new MockVaultRepository(),
) {
  const chat = new StubChatService();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(testRoutes),
      provideTranslocoTesting(),
      { provide: ChatService, useValue: chat },
      { provide: VaultRepository, useValue: vault },
    ],
  });

  const nav = TestBed.inject(NavigationService);
  const router = TestBed.inject(Router);
  const transloco = TestBed.inject(TranslocoService);
  const applicationRef = TestBed.inject(ApplicationRef);
  return { nav, router, chat, transloco, applicationRef };
}

describe("NavigationService", () => {
  it("go() navigates the router, records the activated screen, and closes the drawer", async () => {
    const { nav, router } = setup();
    nav.openDrawer();

    await nav.go("inbox");

    expect(nav.drawerOpen()).toBe(false);
    expect(router.url).toBe("/inbox");
    expect(nav.currentScreen()).toBe("inbox");
  });

  it("keeps currentScreen truthful when the router navigates on its own (browser back / deep link)", async () => {
    const { nav, router } = setup();

    await router.navigateByUrl("/waiting");

    expect(nav.currentScreen()).toBe("waiting");
  });

  it("ignores unregistered leaf-route data instead of publishing it as a screen", async () => {
    const { nav, router } = setup([
      {
        path: "valid",
        component: ChatScreenComponent,
        data: { screen: "waiting" },
      },
      {
        path: "invalid",
        component: ChatScreenComponent,
        data: { screen: "not-registered" },
      },
    ]);

    await router.navigateByUrl("/valid");
    expect(nav.currentScreen()).toBe("waiting");

    await router.navigateByUrl("/invalid");
    expect(nav.currentScreen()).toBe("waiting");
  });

  it("openDailyNote() targets the day's detail route and records daily-detail after activation", async () => {
    const { nav, router } = setup();

    await nav.openDailyNote("2026-05-04");

    expect(router.url).toBe("/daily/2026-05-04");
    expect(nav.currentScreen()).toBe("daily-detail");
  });

  it("keeps a valid Daily deep link pending until the index resolves", async () => {
    const request = deferred<readonly DailyNoteRef[]>();
    const vault = new StubVaultRepository();
    vault.listDailyNotes.mockReturnValue(request.promise);
    const { nav, router, applicationRef } = setup(routes, vault);

    const navigation = nav.openDailyNote("2026-05-04");
    TestBed.tick();
    await vi.waitFor(() => {
      expect(vault.listDailyNotes).toHaveBeenCalledTimes(1);
    });

    expect(router.url).toBe("/");
    expect(nav.currentScreen()).toBe("chat");

    request.resolve([
      {
        date: "2026-05-04",
        isToday: false,
      },
    ]);
    await expect(navigation).resolves.toBe(true);
    await applicationRef.whenStable();

    expect(router.url).toBe("/daily/2026-05-04");
    expect(nav.currentScreen()).toBe("daily-detail");
  });

  it("redirects an unknown Daily date only after the index resolves", async () => {
    const request = deferred<readonly DailyNoteRef[]>();
    const vault = new StubVaultRepository();
    vault.listDailyNotes.mockReturnValue(request.promise);
    const { nav, router } = setup(routes, vault);

    const navigation = nav.openDailyNote("1999-01-01");
    TestBed.tick();
    await vi.waitFor(() => {
      expect(vault.listDailyNotes).toHaveBeenCalledTimes(1);
    });

    // The attempted detail route must never be published optimistically; its
    // guard cannot decide until a successfully loaded index proves it absent.
    expect(nav.currentScreen()).toBe("chat");
    expect(router.url).toBe("/");

    request.resolve([]);
    await expect(navigation).resolves.toBe(true);

    expect(router.url).toBe("/daily");
    expect(nav.currentScreen()).toBe("daily");
  });

  it("surfaces a rejected Daily index as NavigationError without redirecting", async () => {
    const request = deferred<readonly DailyNoteRef[]>();
    const failure = new Error("daily index unavailable");
    const vault = new StubVaultRepository();
    vault.listDailyNotes.mockReturnValue(request.promise);
    const { nav, router } = setup(routes, vault);
    const navigationErrors: NavigationError[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationError) {
        navigationErrors.push(event);
      }
    });

    // Pin the failure semantics against the last successfully activated route.
    await nav.go("waiting");
    const navigation = nav.openDailyNote("2026-05-04");
    TestBed.tick();
    await vi.waitFor(() => {
      expect(vault.listDailyNotes).toHaveBeenCalledTimes(1);
    });
    expect(nav.currentScreen()).toBe("waiting");

    request.reject(failure);
    await expect(navigation).rejects.toBe(failure);

    expect(router.url).toBe("/waiting");
    expect(nav.currentScreen()).toBe("waiting");
    expect(navigationErrors).toHaveLength(1);
    expect(navigationErrors[0]?.error).toBe(failure);
  });

  it("askInChat() returns to chat and sends the flow's question as a user message", async () => {
    const { nav, router, chat } = setup();

    await nav.go("next");
    await nav.askInChat("nextContext");

    expect(router.url).toBe("/");
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "Was passt jetzt zu mir?",
    );

    // Already being on `/` is success, even though Angular would report an
    // ignored same-URL navigation as `false`.
    await nav.askInChat("today");
    expect(chat.sendMessage).toHaveBeenLastCalledWith("Was steht heute an?");
    await nav.askInChat("inboxCleanup");
    expect(chat.sendMessage).toHaveBeenLastCalledWith("Räum die Inbox auf");
    await nav.askInChat("waiting");
    expect(chat.sendMessage).toHaveBeenLastCalledWith("Worauf warte ich?");
  });

  it("resolves ask-in-chat phrases in the active language at send time", async () => {
    const { nav, chat, transloco } = setup();

    // NavigationService already exists here: switching afterwards proves the
    // phrase is not translated once and cached at construction time.
    transloco.setActiveLang("en");

    await nav.askInChat("today");
    expect(chat.sendMessage).toHaveBeenLastCalledWith("What's on today?");
    await nav.askInChat("inboxCleanup");
    expect(chat.sendMessage).toHaveBeenLastCalledWith("Clean up the inbox");
    await nav.askInChat("waiting");
    expect(chat.sendMessage).toHaveBeenLastCalledWith("What am I waiting for?");
    await nav.askInChat("nextContext");
    expect(chat.sendMessage).toHaveBeenLastCalledWith(
      "What fits me right now?",
    );
  });

  it("does not send an ask-in-chat message when navigation is cancelled", async () => {
    const { nav, router, chat } = setup();
    await nav.go("waiting");
    vi.spyOn(router, "navigateByUrl").mockResolvedValue(false);

    await nav.askInChat("today");

    expect(nav.currentScreen()).toBe("waiting");
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects a non-navigable runtime target before asking the Router to navigate", async () => {
    const { nav, router } = setup();
    const navigateByUrl = vi.spyOn(router, "navigateByUrl");

    await expect(
      nav.go("daily-detail" as unknown as NavigableScreen),
    ).rejects.toThrowError("Unsupported navigation target: daily-detail");
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
