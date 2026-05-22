import { createEnvironmentInjector, runInInjectionContext } from "@angular/core";
import { describe, expect, it } from "vitest";

import { ChatService } from "./chat.service";
import { ChatStore } from "./chat.store";
import { MockChatService } from "../mock/mock-chat.service";

describe("ChatStore", () => {
  it("exposes service signals and actions for presentational components", async () => {
    const injector = createEnvironmentInjector([
      {
        provide: ChatService,
        useValue: new MockChatService(),
      },
    ]);
    const store = runInInjectionContext(injector, () => new ChatStore());

    expect(store.messages().at(0)).toMatchObject({
      role: "assistant",
      kind: "tool",
    });
    expect(store.quickReplies().map((reply) => reply.label)).toEqual([
      "Tag planen",
      "Warten auf zeigen",
      "Erstmal nur erfassen",
    ]);

    store.updateDraft("Plan morgen — 4 h");
    expect(store.canSubmit()).toBe(true);

    await store.submitDraft();

    expect(store.draft()).toBe("");
    expect(store.quickReplies().map((reply) => reply.label)).toContain("Ja, eintragen");

    injector.destroy();
  });
});
