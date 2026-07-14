import { Injectable } from "@angular/core";

import { VoiceCaptureService } from "../chat/voice-capture.service";
import { voiceTranscript } from "./chat-mock-data";

const MOCK_TRANSCRIBE_DELAY_MS = 600;

@Injectable()
export class MockVoiceCaptureService extends VoiceCaptureService {
  /**
   * Holds the in-flight "transcription" so a cancel can settle it. In the real
   * service this would be an `AbortController` (fetch) or the HttpClient
   * `Subscription` instead of a timer + reject handle.
   */
  private pending: {
    timer: ReturnType<typeof setTimeout>;
    reject: (reason: unknown) => void;
  } | null = null;

  startRecording(): void {
    // Real impl: navigator.mediaDevices.getUserMedia(...) + new MediaRecorder(...).start()
  }

  stopRecording(): Promise<string> {
    // Real impl: stop the recorder, POST the audio blob to Whisper with an
    // AbortSignal, resolve with the returned transcript.
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        resolve(voiceTranscript);
      }, MOCK_TRANSCRIBE_DELAY_MS);

      this.pending = { timer, reject };
    });
  }

  cancelRecording(): void {
    // Real impl: controller.abort() / subscription.unsubscribe() + stop tracks.
    //
    // The contract that keeps the store simple lives HERE: the pending
    // stopRecording() promise must SETTLE on cancel. We reject it (mirroring the
    // AbortError a real aborted fetch produces) so no transcript can land after
    // the user cancelled.
    if (!this.pending) {
      return;
    }

    clearTimeout(this.pending.timer);
    const abortError = new Error("Recording cancelled");
    abortError.name = "AbortError";
    this.pending.reject(abortError);
    this.pending = null;
  }
}
