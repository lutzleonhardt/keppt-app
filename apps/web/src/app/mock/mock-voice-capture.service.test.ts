import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { voiceTranscript } from "./chat-mock-data";
import { MockVoiceCaptureService } from "./mock-voice-capture.service";

describe("MockVoiceCaptureService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transcribes recorded audio to text after a delay", async () => {
    const service = new MockVoiceCaptureService();

    service.startRecording();
    const pending = service.stopRecording();
    await vi.runAllTimersAsync();

    expect(await pending).toBe(voiceTranscript);
  });

  it("rejects the in-flight transcription when cancelled (abort contract)", async () => {
    const service = new MockVoiceCaptureService();

    service.startRecording();
    const pending = service.stopRecording();
    service.cancelRecording();

    // The promise must settle as a rejection, never resolve with a transcript
    // after a cancel — this is what lets the store stay simple.
    await expect(pending).rejects.toThrowError();
  });

  it("treats a cancel with nothing in flight as a no-op", () => {
    const service = new MockVoiceCaptureService();

    expect(() => service.cancelRecording()).not.toThrow();
  });
});
