import {
  createEnvironmentInjector,
  EnvironmentInjector,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatService } from "./chat.service";
import { ChatStore } from "./chat.store";
import { isAssistantTypingMessage, isUserChatMessage } from "./chat.types";
import { VoiceCaptureService } from "./voice-capture.service";
import { voiceTranscript } from "../mock/chat-mock-data";
import { MockChatService } from "../mock/mock-chat.service";
import { MockVoiceCaptureService } from "../mock/mock-voice-capture.service";

class SilentVoiceCaptureService extends MockVoiceCaptureService {
  override stopRecording(): Promise<string> {
    return Promise.resolve("");
  }
}

/** Raw Whisper output routinely carries leading/trailing whitespace. */
class PaddedVoiceCaptureService extends MockVoiceCaptureService {
  override stopRecording(): Promise<string> {
    return Promise.resolve(`  ${voiceTranscript} \n`);
  }
}

function createStore(
  chat: ChatService = new MockChatService(),
  voice: VoiceCaptureService = new MockVoiceCaptureService(),
): {
  store: ChatStore;
  destroy: () => void;
} {
  const parentInjector = Injector.create({ providers: [] });
  const injector = createEnvironmentInjector(
    [
      { provide: ChatService, useValue: chat },
      { provide: VoiceCaptureService, useValue: voice },
    ],
    parentInjector as EnvironmentInjector,
  );
  const store = runInInjectionContext(injector, () => new ChatStore());

  return {
    store,
    destroy: () => {
      injector.destroy();
      parentInjector.destroy();
    },
  };
}

describe("ChatStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes service signals for presentational components", () => {
    const { store, destroy } = createStore();

    expect(store.messages().at(0)).toMatchObject({
      role: "assistant",
      kind: "tool",
    });
    expect(store.activeQuickReplies().map((reply) => reply.label)).toEqual([
      "Tag planen",
      "Warten auf zeigen",
      "Erstmal nur erfassen",
    ]);
    expect(store.micState()).toBe("closed");
    expect(store.micOverlayVisible()).toBe(false);

    destroy();
  });

  it("records, transcribes, and drops the result into the composer draft", async () => {
    const { store, destroy } = createStore();

    store.openMicOverlay();
    expect(store.micState()).toBe("recording");
    expect(store.micOverlayVisible()).toBe(true);

    const pending = store.finishRecording();
    expect(store.micState()).toBe("transcribing");

    await vi.runAllTimersAsync();
    await pending;

    expect(store.micState()).toBe("closed");
    expect(store.micOverlayVisible()).toBe(false);
    expect(store.draft()).toBe(voiceTranscript);
    expect(store.canSubmit()).toBe(true);

    destroy();
  });

  it("appends the transcript to text already typed in the composer", async () => {
    const { store, destroy } = createStore();

    store.updateDraft("Noch tippen");
    store.openMicOverlay();
    const pending = store.finishRecording();
    await vi.runAllTimersAsync();
    await pending;

    expect(store.draft()).toBe(`Noch tippen ${voiceTranscript}`);

    destroy();
  });

  it("trims a padded transcript before appending it to an existing draft", async () => {
    const { store, destroy } = createStore(
      new MockChatService(),
      new PaddedVoiceCaptureService(),
    );

    store.updateDraft("Noch tippen");
    store.openMicOverlay();
    const pending = store.finishRecording();
    await vi.runAllTimersAsync();
    await pending;

    expect(store.draft()).toBe(`Noch tippen ${voiceTranscript}`);

    destroy();
  });

  it("trims a padded transcript before dropping it into an empty draft", async () => {
    const { store, destroy } = createStore(
      new MockChatService(),
      new PaddedVoiceCaptureService(),
    );

    store.openMicOverlay();
    const pending = store.finishRecording();
    await vi.runAllTimersAsync();
    await pending;

    expect(store.draft()).toBe(voiceTranscript);

    destroy();
  });

  it("discards the capture when cancelled while recording", () => {
    const { store, destroy } = createStore();

    store.openMicOverlay();
    expect(store.micState()).toBe("recording");

    store.cancelMicOverlay();
    expect(store.micState()).toBe("closed");
    expect(store.draft()).toBe("");

    destroy();
  });

  it("discards a cancelled transcription and never leaks it into a later capture", async () => {
    const { store, destroy } = createStore();

    // Session A: start → stop (transcribing) → cancel mid-flight.
    store.openMicOverlay();
    const captureA = store.finishRecording();
    expect(store.micState()).toBe("transcribing");

    store.cancelMicOverlay(); // aborts A → stopRecording rejects
    await captureA; // A handled: no error, no append

    expect(store.micState()).toBe("closed");
    expect(store.draft()).toBe("");

    // Session B: a fresh capture must not be polluted by A's stale result.
    store.openMicOverlay();
    const captureB = store.finishRecording();
    await vi.runAllTimersAsync();
    await captureB;

    expect(store.micState()).toBe("closed");
    expect(store.draft()).toBe(voiceTranscript);

    destroy();
  });

  it("enters the error state when nothing could be transcribed", async () => {
    const { store, destroy } = createStore(
      new MockChatService(),
      new SilentVoiceCaptureService(),
    );

    store.openMicOverlay();
    const pending = store.finishRecording();
    await vi.runAllTimersAsync();
    await pending;

    expect(store.micState()).toBe("error");
    expect(store.draft()).toBe("");

    store.retryRecording();
    expect(store.micState()).toBe("recording");

    destroy();
  });

  it("sends the composer draft and clears it", async () => {
    const { store, destroy } = createStore();

    store.updateDraft("Plan morgen — 4 h");
    expect(store.canSubmit()).toBe(true);

    const pending = store.submitDraft();
    await vi.runAllTimersAsync();
    await pending;

    expect(store.draft()).toBe("");

    destroy();
  });

  it("ignores a second quick reply while the first response is in flight", async () => {
    const { store, destroy } = createStore();

    const first = store.chooseQuickReply("Tag planen");
    expect(store.busy()).toBe(true);
    expect(store.activeQuickReplies()).toEqual([]);

    const userCount = () => store.messages().filter(isUserChatMessage).length;
    expect(userCount()).toBe(1);

    await store.chooseQuickReply("Warten auf zeigen");
    expect(userCount()).toBe(1);

    await vi.runAllTimersAsync();
    await first;

    destroy();
  });

  it("ignores a submit while busy and keeps the unsent draft", async () => {
    const { store, destroy } = createStore();

    store.updateDraft("Erste Nachricht");
    const first = store.submitDraft();
    expect(store.busy()).toBe(true);
    expect(store.draft()).toBe("");

    // Typing during the in-flight window: the send button is disabled and a
    // forced submit must neither send nor swallow the freshly typed draft.
    store.updateDraft("Zweite Nachricht");
    expect(store.canSubmit()).toBe(false);

    await store.submitDraft();
    expect(store.draft()).toBe("Zweite Nachricht");
    expect(
      store.messages().filter(isUserChatMessage).map((message) => message.text),
    ).toEqual(["Erste Nachricht"]);

    await vi.runAllTimersAsync();
    await first;

    destroy();
  });

  it("cancels an in-flight turn and keeps the user message", async () => {
    const { store, destroy } = createStore();
    const beforeSend = store.messages().length;

    store.updateDraft("Brot kaufen");
    const pending = store.submitDraft();
    expect(store.busy()).toBe(true);

    store.cancel();
    await pending;

    expect(store.busy()).toBe(false);
    expect(store.messages()).toHaveLength(beforeSend + 1);
    expect(store.messages().at(-1)).toMatchObject({
      kind: "user",
      text: "Brot kaufen",
    });
    expect(store.messages().some(isAssistantTypingMessage)).toBe(false);

    destroy();
  });

  it("drops quick replies once the latest turn offers none", async () => {
    const { store, destroy } = createStore();

    expect(store.activeQuickReplies().length).toBeGreaterThan(0);

    // "Erstmal nur erfassen" routes to a response without quick replies, so no
    // stale chips from an earlier turn may be resurrected.
    const pending = store.chooseQuickReply("Erstmal nur erfassen");
    await vi.runAllTimersAsync();
    await pending;

    expect(store.activeQuickReplies()).toEqual([]);

    destroy();
  });
});
