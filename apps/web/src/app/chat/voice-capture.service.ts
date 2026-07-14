/**
 * Captures microphone audio and turns it into text. Deliberately separate from
 * {@link ChatService}: since voice now only fills the composer draft (it does not
 * send a message), it has no dependency on the conversation.
 */
export abstract class VoiceCaptureService {
  /**
   * Starts capturing microphone audio.
   *
   * Real impl: `navigator.mediaDevices.getUserMedia(...)` + `MediaRecorder.start()`.
   */
  abstract startRecording(): void;

  /**
   * Stops recording and resolves with the transcribed text.
   *
   * CONTRACT — this is what keeps the store simple: if {@link cancelRecording} is
   * called while this is in flight, the returned promise MUST settle promptly by
   * **rejecting** (e.g. an `AbortError`). It must never resolve with a transcript
   * after a cancel. The store closes the overlay synchronously on cancel, so a
   * late resolve would otherwise land in the wrong capture session.
   *
   * Real impl: stop the recorder, POST the audio to the STT backend (Whisper),
   * resolve with the transcript. Pass an `AbortSignal` (fetch) or compose
   * `takeUntil` / hold the `Subscription` (HttpClient) so the request can be
   * aborted from {@link cancelRecording}.
   */
  abstract stopRecording(): Promise<string>;

  /**
   * Aborts an in-flight recording/transcription and releases the device.
   *
   * Real impl: `controller.abort()` on the STT request (or `unsubscribe()` from
   * the HttpClient Observable) AND stop the `MediaRecorder` tracks. Aborting the
   * request is what makes the {@link stopRecording} promise reject — see contract.
   */
  abstract cancelRecording(): void;
}
