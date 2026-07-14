import { ApplicationRef, inputBinding, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { render, screen, waitFor } from "@testing-library/angular/zoneless";
import userEvent from "@testing-library/user-event";
import { MARKED_EXTENSIONS, provideMarkdown } from "ngx-markdown";
import { describe, expect, it, vi } from "vitest";

import { VaultFileScreenComponent } from "./vault-file-screen";
import { taskCheckboxExtension } from "./vault-markdown";
import { VaultRepository } from "./vault.repository";
import type { VaultTaskFile } from "./vault.types";
import { NavigationService } from "../navigation/navigation.service";
import type { AskInChatFlow } from "../navigation/screen-registry";
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

async function renderVaultScreen(
  inputs: {
    file: VaultTaskFile;
    i18nPrefix: string;
    ask?: AskInChatFlow;
  },
  repository?: VaultRepository,
) {
  const nav = new StubNavigationService();

  const view = await render(VaultFileScreenComponent, {
    // The zoneless entry binds inputs via Angular's native bindings API.
    bindings: [
      inputBinding("file", () => inputs.file),
      inputBinding("i18nPrefix", () => inputs.i18nPrefix),
      ...(inputs.ask ? [inputBinding("ask", () => inputs.ask)] : []),
    ],
    providers: [
      provideTranslocoTesting(),
      // The app's real markdown pipeline including the checkbox extension AND
      // Angular's HTML sanitizer — this is the end-to-end proof that `- [ ]`
      // rows survive sanitization as styleable spans.
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
    ],
    // Controlled tests intentionally keep a Resource loader unresolved long
    // enough to assert the loading DOM.
    waitForStableOnRender: false,
  });

  return { ...view, nav };
}

describe("VaultFileScreenComponent", () => {
  it("renders the translated Inbox chrome plus the file's checkbox rows from the vault", async () => {
    const { container } = await renderVaultScreen({
      file: "tasks/inbox.md",
      i18nPrefix: "vault.inbox",
      ask: "inboxCleanup",
    });

    expect(screen.getByRole("heading", { name: "Inbox" })).toBeTruthy();
    expect(screen.getByText("Noch nicht sortiert")).toBeTruthy();
    expect(screen.getByText(/Alles, was rein wollte/)).toBeTruthy();

    // ngx-markdown renders async — wait for the list, then check the rows.
    await screen.findByText(/Anna wegen Angebot schreiben/);
    expect(
      screen.getByText(/Geschenk für Mama recherchieren \(gestern · 21:14\)/),
    ).toBeTruthy();

    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes).toHaveLength(4);
    expect(
      checkboxes.every(
        (checkbox) =>
          checkbox.classList.contains("task-checkbox") &&
          checkbox.getAttribute("aria-checked") === "false" &&
          checkbox.getAttribute("aria-disabled") === "true",
      ),
    ).toBe(true);
    expect(container.querySelector("input[type=checkbox]")).toBeNull();
  });

  it("renders the Next-Actions `##` category headings as groups", async () => {
    await renderVaultScreen({
      file: "tasks/next-actions.md",
      i18nPrefix: "vault.next",
      ask: "nextContext",
    });

    expect(
      await screen.findByRole("heading", { level: 2, name: "Arbeit" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Haus & Garten" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Persönlich" }),
    ).toBeTruthy();
    // The screen's own title stays the H1 above the groups.
    expect(
      screen.getByRole("heading", { level: 1, name: "Nächste Schritte" }),
    ).toBeTruthy();
  });

  it("routes the ask-in-chat action through the NavigationService", async () => {
    const user = userEvent.setup();
    const { nav } = await renderVaultScreen({
      file: "tasks/next-actions.md",
      i18nPrefix: "vault.next",
      ask: "nextContext",
    });

    await user.click(screen.getByRole("button", { name: "im Chat fragen →" }));

    expect(nav.askInChat).toHaveBeenCalledExactlyOnceWith("nextContext");
  });

  it("omits the ask link on screens without an ask flow and opens the drawer from the hamburger", async () => {
    const user = userEvent.setup();
    const { nav } = await renderVaultScreen({
      file: "tasks/focus.md",
      i18nPrefix: "vault.focus",
    });

    expect(
      screen.queryByRole("button", { name: "im Chat fragen →" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Menü öffnen" }));
    expect(nav.openDrawer).toHaveBeenCalledOnce();
  });

  it("shows loading without misleading file states, then renders delayed Markdown", async () => {
    const repository = new TestVaultRepository();
    const request = deferred<string | null>();
    repository.queueFile("tasks/inbox.md", request.promise);

    const { container } = await renderVaultScreen(
      {
        file: "tasks/inbox.md",
        i18nPrefix: "vault.inbox",
      },
      repository,
    );
    TestBed.tick();

    expect(screen.getByRole("status").textContent).toContain(
      "Inhalt wird geladen",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Diese Datei wurde nicht gefunden.")).toBeNull();
    expect(screen.queryByText("Diese Datei ist leer.")).toBeNull();
    expect(container.querySelector(".vault-markdown")).toBeNull();

    request.resolve("## Später\n\n- [ ] Geladener Eintrag\n");
    await TestBed.inject(ApplicationRef).whenStable();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Später" }),
    ).toBeTruthy();
    expect(screen.getByText("Geladener Eintrag")).toBeTruthy();
    expect(repository.fileReads).toEqual(["tasks/inbox.md"]);
  });

  it("renders a failed read safely and retries it with a fresh request", async () => {
    const user = userEvent.setup();
    const repository = new TestVaultRepository();
    const first = deferred<string | null>();
    const retry = deferred<string | null>();
    repository.queueFile("tasks/focus.md", first.promise, retry.promise);

    await renderVaultScreen(
      {
        file: "tasks/focus.md",
        i18nPrefix: "vault.focus",
      },
      repository,
    );
    TestBed.tick();

    first.reject(new Error("offline"));
    await TestBed.inject(ApplicationRef).whenStable();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Inhalt konnte nicht geladen werden.");
    expect(screen.queryByRole("status")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    TestBed.tick();
    expect(repository.fileReads).toEqual(["tasks/focus.md", "tasks/focus.md"]);
    expect(screen.getByRole("status")).toBeTruthy();

    retry.resolve("Erneut geladen");
    await TestBed.inject(ApplicationRef).whenStable();
    expect(await screen.findByText("Erneut geladen")).toBeTruthy();
  });

  it.each([
    ["", "Diese Datei ist leer."],
    [null, "Diese Datei wurde nicht gefunden."],
  ] as const)("distinguishes a resolved %p file", async (value, message) => {
    const repository = new TestVaultRepository();
    repository.queueFile("tasks/waiting.md", Promise.resolve(value));

    await renderVaultScreen(
      {
        file: "tasks/waiting.md",
        i18nPrefix: "vault.waiting",
      },
      repository,
    );

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
