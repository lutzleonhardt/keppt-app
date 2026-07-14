import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { within } from "@testing-library/dom";
import { render, screen } from "@testing-library/angular/zoneless";
import userEvent from "@testing-library/user-event";
import { TranslocoService } from "@jsverse/transloco";
import { describe, expect, it, vi } from "vitest";

import { provideTranslocoTesting } from "../../testing/transloco-testing";
import { AppDrawerComponent } from "./app-drawer";
import { NavigationService } from "./navigation.service";
import type { AppScreen } from "./screen-registry";
import { APP_TODAY } from "../i18n/local-date";
import { MOCK_TODAY } from "../mock/mock-app-context";

// NavigationService is a concrete class, so the drawer spec stubs it shallowly
// and asserts the drawer's calls; the service's own routing behavior is
// covered by navigation.service.test.ts.
class StubNavigationService {
  private readonly drawerOpenState = signal(true);
  readonly drawerOpen = this.drawerOpenState.asReadonly();
  readonly currentScreen = signal<AppScreen>("chat");

  openDrawer = vi.fn(() => this.drawerOpenState.set(true));
  closeDrawer = vi.fn(() => this.drawerOpenState.set(false));
  go = vi.fn();
  openDailyNote = vi.fn();
  askInChat = vi.fn();
}

async function renderDrawer() {
  const nav = new StubNavigationService();

  const view = await render(AppDrawerComponent, {
    providers: [
      provideTranslocoTesting(),
      { provide: APP_TODAY, useValue: MOCK_TODAY },
      { provide: NavigationService, useValue: nav },
    ],
    waitForStableOnRender: false,
  });

  return { ...view, nav };
}

describe("AppDrawerComponent", () => {
  it("shows all eight navigation items without metrics", async () => {
    await renderDrawer();

    expect(screen.getByRole("button", { name: "Chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Heute fragen" })).toBeTruthy();

    const navigation = screen.getByRole("navigation");
    expect(within(navigation).getAllByRole("button")).toEqual([
      screen.getByRole("button", { name: "Chat" }),
      screen.getByRole("button", { name: "Heute fragen" }),
      screen.getByRole("button", { name: "Inbox" }),
      screen.getByRole("button", { name: "Fokus" }),
      screen.getByRole("button", { name: "Nächste Schritte" }),
      screen.getByRole("button", { name: "Warten auf" }),
      screen.getByRole("button", { name: "Vielleicht irgendwann" }),
      screen.getByRole("button", { name: "Daily Notes" }),
    ]);
    expect(navigation.querySelector(".count")).toBeNull();
  });

  it("renders the brand block and the user/trial footer", async () => {
    await renderDrawer();

    expect(screen.getByText("Mittwoch · 6. Mai")).toBeTruthy();
    expect(screen.getByText("Keppt.")).toBeTruthy();
    expect(screen.getByText("Capture everything.")).toBeTruthy();
    expect(screen.getByText("Manage nothing.")).toBeTruthy();
    expect(screen.getByText("Lutz")).toBeTruthy();
    expect(screen.getByText("Trial · noch 11 Tage")).toBeTruthy();
  });

  it("reformats the date when Transloco changes language", async () => {
    const { fixture } = await renderDrawer();

    expect(screen.getByText("Mittwoch · 6. Mai")).toBeTruthy();
    TestBed.inject(TranslocoService).setActiveLang("en");
    await fixture.whenStable();

    expect(await screen.findByText("Wednesday · May 6")).toBeTruthy();
    expect(screen.queryByText("Mittwoch · 6. Mai")).toBeNull();
  });

  it("marks the screen activated by the NavigationService as active", async () => {
    const { nav, fixture } = await renderDrawer();
    const chat = screen.getByRole("button", { name: "Chat" });
    const inbox = screen.getByRole("button", { name: "Inbox" });

    expect(chat.classList.contains("active")).toBe(true);
    expect(inbox.classList.contains("active")).toBe(false);

    nav.currentScreen.set("inbox");
    await fixture.whenStable();

    expect(chat.classList.contains("active")).toBe(false);
    expect(inbox.classList.contains("active")).toBe(true);
  });

  it("navigates on selection through the NavigationService", async () => {
    const user = userEvent.setup();
    const { nav } = await renderDrawer();

    await user.click(screen.getByRole("button", { name: "Inbox" }));
    expect(nav.go).toHaveBeenCalledExactlyOnceWith("inbox");

    await user.click(screen.getByRole("button", { name: "Daily Notes" }));
    expect(nav.go).toHaveBeenLastCalledWith("daily");
  });

  it("treats 'Heute fragen' as a chat action, not a screen", async () => {
    const user = userEvent.setup();
    const { nav } = await renderDrawer();

    await user.click(screen.getByRole("button", { name: "Heute fragen" }));

    expect(nav.askInChat).toHaveBeenCalledExactlyOnceWith("today");
    expect(nav.go).not.toHaveBeenCalled();
  });

  it("closes via the close button and via Escape", async () => {
    const user = userEvent.setup();
    const { nav } = await renderDrawer();

    await user.click(screen.getByRole("button", { name: "Menü schließen" }));
    expect(nav.closeDrawer).toHaveBeenCalledOnce();

    nav.openDrawer();
    await user.keyboard("{Escape}");
    expect(nav.closeDrawer).toHaveBeenCalledTimes(2);
  });
});
