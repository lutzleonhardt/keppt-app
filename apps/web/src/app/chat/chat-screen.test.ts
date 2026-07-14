import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { render, screen } from "@testing-library/angular/zoneless";
import userEvent from "@testing-library/user-event";
import { TranslocoService } from "@jsverse/transloco";
import { provideMarkdown } from "ngx-markdown";
import { describe, expect, it, vi } from "vitest";

import { ChatScreenComponent } from "./chat-screen";
import { ChatService } from "./chat.service";
import { ChatStore } from "./chat.store";
import { VoiceCaptureService } from "./voice-capture.service";
import type { ChatMessage, ChatStatus, QuickReply } from "./chat.types";
import { provideTranslocoTesting } from "../../testing/transloco-testing";
import { APP_TODAY } from "../i18n/local-date";
import { MOCK_TODAY } from "../mock/mock-app-context";

// The template spec for Angular component tests in this app: ATL `render`
// (zoneless entry), real child components (no shallow rendering, no component
// mocks), services stubbed at the DI boundary, assertions through Testing
// Library DOM queries — what the user sees, not component internals.

class StubChatService extends ChatService {
  readonly messages = signal<readonly ChatMessage[]>([]);
  readonly status = signal<ChatStatus>("idle");

  sendMessage = vi.fn(async (_content: string) => {});
  chooseQuickReply = vi.fn(async (_label: string) => {});
  cancel = vi.fn();
}

class StubVoiceCaptureService extends VoiceCaptureService {
  startRecording = vi.fn();
  stopRecording = vi.fn(() => Promise.resolve(""));
  cancelRecording = vi.fn();
}

async function renderChatScreen(messages: readonly ChatMessage[] = []) {
  const chat = new StubChatService();
  chat.messages.set(messages);
  const voice = new StubVoiceCaptureService();

  const view = await render(ChatScreenComponent, {
    // Since the Task-4 provider hoist the services live in app.config.ts, not
    // on the component — plain test-level providers bind the stubs directly
    // (nothing shadows them anymore); ChatStore stays real.
    providers: [
      provideMarkdown(),
      provideTranslocoTesting(),
      { provide: APP_TODAY, useValue: MOCK_TODAY },
      { provide: ChatService, useValue: chat },
      { provide: VoiceCaptureService, useValue: voice },
      ChatStore,
    ],
  });

  return { ...view, chat, voice };
}

function userMessage(text: string, id = "u-1"): ChatMessage {
  return {
    id,
    role: "user",
    kind: "user",
    text,
    createdAt: "2026-05-06T09:00:00.000Z",
  };
}

function assistantMessage(
  markdown: string,
  {
    id = "a-1",
    quickReplies,
  }: { id?: string; quickReplies?: QuickReply[] } = {},
): ChatMessage {
  return {
    id,
    role: "assistant",
    kind: "content",
    markdown,
    quickReplies,
    createdAt: "2026-05-06T09:00:05.000Z",
  };
}

describe("ChatScreenComponent", () => {
  it("shows the translated empty state and composer chrome", async () => {
    await renderChatScreen();

    expect(screen.getByText("Was liegt dir im Kopf?")).toBeTruthy();
    expect(
      screen.getByText("Tippe auf das Mikrofon — oder schreib einfach."),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("Frag Keppt …")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Spracheingabe öffnen" }),
    ).toBeTruthy();
    // No draft yet, so the additive send button is absent.
    expect(
      screen.queryByRole("button", { name: "Nachricht senden" }),
    ).toBeNull();
  });

  it("renders a conversation through the real child tree, including Markdown prose", async () => {
    await renderChatScreen([
      userMessage("Plane meinen Tag"),
      assistantMessage("Hier ist dein **Fokus** für heute."),
    ]);

    expect(screen.getByText("Plane meinen Tag")).toBeTruthy();
    expect(screen.getByText("Heute · Mittwoch, 6. Mai")).toBeTruthy();

    const emphasis = await screen.findByText("Fokus");
    expect(emphasis.tagName).toBe("STRONG");
  });

  it("reformats the session date when Transloco changes language", async () => {
    const { fixture } = await renderChatScreen([
      userMessage("Plane meinen Tag"),
    ]);

    expect(screen.getByText("Heute · Mittwoch, 6. Mai")).toBeTruthy();
    TestBed.inject(TranslocoService).setActiveLang("en");
    await fixture.whenStable();

    expect(await screen.findByText("Today · Wednesday, May 6")).toBeTruthy();
    expect(screen.queryByText("Heute · Mittwoch, 6. Mai")).toBeNull();
  });

  it("sends the typed draft through the ChatService boundary", async () => {
    const user = userEvent.setup();
    const { chat } = await renderChatScreen();

    await user.type(
      screen.getByPlaceholderText("Frag Keppt …"),
      "Was steht heute an?",
    );
    await user.click(
      await screen.findByRole("button", { name: "Nachricht senden" }),
    );

    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "Was steht heute an?",
    );
  });

  it("offers the latest quick replies and routes the choice through the ChatService boundary", async () => {
    const user = userEvent.setup();
    const { chat } = await renderChatScreen([
      assistantMessage("Womit starten wir?", {
        quickReplies: [{ id: "q-1", label: "Inbox aufräumen" }],
      }),
    ]);

    await user.click(screen.getByRole("button", { name: "Inbox aufräumen" }));

    expect(chat.chooseQuickReply).toHaveBeenCalledExactlyOnceWith(
      "Inbox aufräumen",
    );
  });

  it("swaps the composer to a stop button while busy and cancels through the ChatService boundary", async () => {
    const user = userEvent.setup();
    const { chat } = await renderChatScreen([
      userMessage("Räum die Inbox auf"),
    ]);

    chat.status.set("thinking");

    const stop = await screen.findByRole("button", {
      name: "Antwort abbrechen",
    });
    expect(
      screen.queryByRole("button", { name: "Spracheingabe öffnen" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Nachricht senden" }),
    ).toBeNull();

    await user.click(stop);

    expect(chat.cancel).toHaveBeenCalledOnce();
  });
});
