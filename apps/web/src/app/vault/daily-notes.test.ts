import { ApplicationRef, inputBinding, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { render, screen, waitFor } from "@testing-library/angular/zoneless";
import userEvent from "@testing-library/user-event";
import { TranslocoService } from "@jsverse/transloco";
import { MARKED_EXTENSIONS, provideMarkdown } from "ngx-markdown";
import { describe, expect, it, vi } from "vitest";

import { DailyNoteDetailScreenComponent } from "./daily-note-detail-screen";
import { DailyNotesScreenComponent } from "./daily-notes-screen";
import { taskCheckboxExtension } from "./vault-markdown";
import { VaultRepository } from "./vault.repository";
import type { DailyNoteRef } from "./vault.types";
import { NavigationService } from "../navigation/navigation.service";
import { mockDailyIndex } from "../mock/mock-vault-data";
import { MockVaultRepository } from "../mock/mock-vault.repository";
import { provideTranslocoTesting } from "../../testing/transloco-testing";
import { deferred, TestVaultRepository } from "../../testing/vault-testing";

class StubNavigationService {
  private readonly drawerOpenState = signal(false);
  readonly drawerOpen = this.drawerOpenState.asReadonly();

  openDrawer = vi.fn();
  closeDrawer = vi.fn();
  go = vi.fn();
  openDailyNote = vi.fn();
  askInChat = vi.fn();
}

function vaultProviders(
  nav: StubNavigationService,
  repository?: VaultRepository,
) {
  return [
    provideTranslocoTesting(),
    provideMarkdown({
      markedExtensions: [
        {
          provide: MARKED_EXTENSIONS,
          useValue: taskCheckboxExtension,
          multi: true,
        },
      ],
    }),
    { provide: NavigationService, useValue: nav },
    ...(repository
      ? [{ provide: VaultRepository, useValue: repository }]
      : [{ provide: VaultRepository, useClass: MockVaultRepository }]),
  ];
}

describe("DailyNotesScreenComponent", () => {
  it("renders the four day cards from the vault index, today first and badged", async () => {
    const nav = new StubNavigationService();
    await render(DailyNotesScreenComponent, { providers: vaultProviders(nav) });

    expect(screen.getByRole("heading", { name: "Daily Notes" })).toBeTruthy();
    expect(screen.getByText("Tagesplan & Protokoll")).toBeTruthy();

    const cards = await screen.findAllByRole("button", { name: /Mai/ });
    expect(cards).toHaveLength(4);
    expect(cards[0]?.textContent).toContain("Mittwoch");
    expect(cards[0]?.textContent).toContain("6. Mai");
    expect(cards[0]?.textContent).toContain("Heute");
    expect(cards[3]?.textContent).toContain("Sonntag");
    expect(cards[3]?.textContent).toContain("3. Mai");
    // Only today's card carries the badge.
    expect(screen.getAllByText("Heute")).toHaveLength(1);
    expect(document.querySelector(".day-summary")).toBeNull();
  });

  it("reformats the index when Transloco changes language without reloading it", async () => {
    const nav = new StubNavigationService();
    const repository = new TestVaultRepository();
    const { fixture } = await render(DailyNotesScreenComponent, {
      providers: vaultProviders(nav, repository),
    });

    expect(await screen.findByText("Mittwoch")).toBeTruthy();
    expect(repository.dailyReads).toHaveLength(1);

    TestBed.inject(TranslocoService).setActiveLang("en");
    await fixture.whenStable();

    expect(await screen.findByText("Wednesday")).toBeTruthy();
    expect(screen.getByText("May 6")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.queryByText("Mittwoch")).toBeNull();
    expect(repository.dailyReads).toHaveLength(1);
  });

  it("opens a day through the NavigationService", async () => {
    const user = userEvent.setup();
    const nav = new StubNavigationService();
    await render(DailyNotesScreenComponent, { providers: vaultProviders(nav) });

    await user.click(
      await screen.findByRole("button", { name: /Sonntag.*3\. Mai/ }),
    );

    expect(nav.openDailyNote).toHaveBeenCalledExactlyOnceWith("2026-05-03");
  });

  it("shows an honest loading state and then the resolved empty index", async () => {
    const nav = new StubNavigationService();
    const repository = new TestVaultRepository();
    const request = deferred<readonly []>();
    repository.queueDaily(request.promise);

    await render(DailyNotesScreenComponent, {
      providers: vaultProviders(nav, repository),
      waitForStableOnRender: false,
    });
    TestBed.tick();

    expect(screen.getByRole("status").textContent).toContain(
      "Inhalt wird geladen",
    );
    expect(screen.queryByRole("button", { name: /Mai/ })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    request.resolve([]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(await screen.findByText("Noch keine Daily Notes.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(repository.dailyReads).toHaveLength(1);
  });

  it("renders an index failure and reloads all four cards on retry", async () => {
    const user = userEvent.setup();
    const nav = new StubNavigationService();
    const repository = new TestVaultRepository();
    const first = deferred<readonly DailyNoteRef[]>();
    const retry = deferred<readonly DailyNoteRef[]>();
    repository.queueDaily(first.promise, retry.promise);

    await render(DailyNotesScreenComponent, {
      providers: vaultProviders(nav, repository),
      waitForStableOnRender: false,
    });
    TestBed.tick();

    first.reject(new Error("index offline"));
    await TestBed.inject(ApplicationRef).whenStable();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Inhalt konnte nicht geladen werden.",
    );

    await user.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    TestBed.tick();
    expect(repository.dailyReads).toHaveLength(2);
    expect(screen.getByRole("status")).toBeTruthy();

    retry.resolve(mockDailyIndex);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(await screen.findAllByRole("button", { name: /Mai/ })).toHaveLength(
      4,
    );
  });
});

describe("DailyNoteDetailScreenComponent", () => {
  it("renders today's note with Plan, Log, and Notizen sections from the vault file", async () => {
    const nav = new StubNavigationService();
    const { container } = await render(DailyNoteDetailScreenComponent, {
      bindings: [inputBinding("date", () => "2026-05-06")],
      providers: vaultProviders(nav),
    });

    // Header labels are formatted client-side from the route's ISO date.
    expect(
      await screen.findByRole("heading", { level: 1, name: "6. Mai" }),
    ).toBeTruthy();
    expect(screen.getByText("Mittwoch")).toBeTruthy();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Plan" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Log" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Notizen" }),
    ).toBeTruthy();

    expect(
      screen.getByText(/Tagesplan erstellt: 3 Tasks geplant/),
    ).toBeTruthy();
    await waitFor(() =>
      expect(container.querySelectorAll(".task-checkbox")).toHaveLength(3),
    );
  });

  it("reformats the detail header when Transloco changes language", async () => {
    const nav = new StubNavigationService();
    const repository = new TestVaultRepository();
    const { fixture } = await render(DailyNoteDetailScreenComponent, {
      bindings: [inputBinding("date", () => "2026-05-06")],
      providers: vaultProviders(nav, repository),
    });

    await screen.findByRole("heading", { level: 1, name: "6. Mai" });
    expect(repository.fileReads).toEqual(["daily/2026-05-06.md"]);

    TestBed.inject(TranslocoService).setActiveLang("en");
    await fixture.whenStable();

    expect(
      await screen.findByRole("heading", { level: 1, name: "May 6" }),
    ).toBeTruthy();
    expect(screen.getByText("Wednesday")).toBeTruthy();
    expect(repository.dailyReads).toHaveLength(0);
    expect(repository.fileReads).toEqual(["daily/2026-05-06.md"]);
  });

  it("omits Notizen where the day has none and renders done tasks as checked", async () => {
    const nav = new StubNavigationService();
    const { container } = await render(DailyNoteDetailScreenComponent, {
      bindings: [inputBinding("date", () => "2026-05-05")],
      providers: vaultProviders(nav),
    });

    await screen.findByRole("heading", { level: 2, name: "Plan" });
    expect(
      screen.queryByRole("heading", { level: 2, name: "Notizen" }),
    ).toBeNull();

    // The log confirms two closed plan items → two done checkboxes (R10),
    // exposed semantically after Angular's sanitizer has run.
    await waitFor(() =>
      expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(
        2,
      ),
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getAllByRole("checkbox", { checked: false })).toHaveLength(1);
    expect(container.querySelectorAll(".task-checkbox--done")).toHaveLength(2);
  });

  it("returns to the day list via the back button", async () => {
    const user = userEvent.setup();
    const nav = new StubNavigationService();
    await render(DailyNoteDetailScreenComponent, {
      bindings: [inputBinding("date", () => "2026-05-03")],
      providers: vaultProviders(nav),
    });

    await user.click(screen.getByRole("button", { name: "Zurück" }));

    expect(nav.go).toHaveBeenCalledExactlyOnceWith("daily");
  });

  it("shows loading before delayed Daily Markdown arrives", async () => {
    const nav = new StubNavigationService();
    const repository = new TestVaultRepository();
    const request = deferred<string | null>();
    repository.queueFile("daily/2026-05-06.md", request.promise);

    await render(DailyNoteDetailScreenComponent, {
      bindings: [inputBinding("date", () => "2026-05-06")],
      providers: vaultProviders(nav, repository),
      waitForStableOnRender: false,
    });
    TestBed.tick();

    expect(screen.getByRole("status").textContent).toContain(
      "Inhalt wird geladen",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();

    request.resolve("## Plan\n\n- [ ] Später geladen\n");
    await TestBed.inject(ApplicationRef).whenStable();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Plan" }),
    ).toBeTruthy();
    expect(screen.getByText("Später geladen")).toBeTruthy();
  });

  it("renders a Daily-file failure safely and retries it", async () => {
    const user = userEvent.setup();
    const nav = new StubNavigationService();
    const repository = new TestVaultRepository();
    const first = deferred<string | null>();
    const retry = deferred<string | null>();
    repository.queueFile("daily/2026-05-04.md", first.promise, retry.promise);

    await render(DailyNoteDetailScreenComponent, {
      bindings: [inputBinding("date", () => "2026-05-04")],
      providers: vaultProviders(nav, repository),
      waitForStableOnRender: false,
    });
    TestBed.tick();

    first.reject(new Error("file offline"));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(await screen.findByRole("alert")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    TestBed.tick();
    expect(repository.fileReads).toEqual([
      "daily/2026-05-04.md",
      "daily/2026-05-04.md",
    ]);

    retry.resolve("## Log\n\nWieder da.\n");
    await TestBed.inject(ApplicationRef).whenStable();
    expect(await screen.findByText("Wieder da.")).toBeTruthy();
  });

  it.each([
    ["", "Diese Datei ist leer."],
    [null, "Diese Datei wurde nicht gefunden."],
  ] as const)(
    "distinguishes a resolved Daily file value of %p",
    async (value, message) => {
      const nav = new StubNavigationService();
      const repository = new TestVaultRepository();
      repository.queueFile("daily/2026-05-03.md", Promise.resolve(value));

      await render(DailyNoteDetailScreenComponent, {
        bindings: [inputBinding("date", () => "2026-05-03")],
        providers: vaultProviders(nav, repository),
      });

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );
});
