import { describe, expect, it } from "vitest";

import {
  hasComposerText,
  isMicOverlayVisible,
  micOverlayStatus,
  type MicCaptureState,
} from "./chat-ui-state";

describe("chat UI state helpers", () => {
  it("detects the composer send state from non-empty draft text", () => {
    expect(hasComposerText("")).toBe(false);
    expect(hasComposerText("   ")).toBe(false);
    expect(hasComposerText("Frag Keppt")).toBe(true);
  });

  it("maps mic capture states to overlay visibility and status", () => {
    const states: MicCaptureState[] = ["closed", "recording", "transcribing", "error"];

    expect(states.map(isMicOverlayVisible)).toEqual([false, true, true, true]);
    expect(micOverlayStatus("recording")).toBe("mic.status.recording");
    expect(micOverlayStatus("transcribing")).toBe("mic.status.transcribing");
    expect(micOverlayStatus("error")).toBe("mic.status.error");
    expect(micOverlayStatus("closed")).toBe("mic.status.ready");
  });
});
