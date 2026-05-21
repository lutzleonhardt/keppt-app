import { describe, expect, it } from "vitest";

import {
  createUserMessage,
  initialMessages,
  quickActions,
} from "./shell-content";

describe("chat shell content", () => {
  it("opens with assistant context instead of a welcome page", () => {
    expect(initialMessages[0]?.sender).toBe("assistant");
    expect(initialMessages[0]?.text).toContain("DB-Follow-up");
  });

  it("keeps quick actions available for the shell", () => {
    expect(quickActions).toContain("Tag planen");
    expect(quickActions).toContain("Erstmal nur erfassen");
  });

  it("creates user messages without mutating seed messages", () => {
    const message = createUserMessage(10, "Heute Fokus planen");

    expect(message).toEqual({
      id: 10,
      sender: "user",
      text: "Heute Fokus planen",
    });
    expect(initialMessages).toHaveLength(3);
  });
});
