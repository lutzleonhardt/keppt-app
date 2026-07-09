export type MicCaptureState = "closed" | "recording" | "transcribing" | "error";

export function hasComposerText(value: string): boolean {
  return value.trim().length > 0;
}

export function isMicOverlayVisible(state: MicCaptureState): boolean {
  return state !== "closed";
}

// Returns a translation key, not display text: this module is pure (no
// injection context), so translation happens at the component/template edge.
export function micOverlayStatus(state: MicCaptureState): string {
  switch (state) {
    case "recording":
      return "mic.status.recording";
    case "transcribing":
      return "mic.status.transcribing";
    case "error":
      return "mic.status.error";
    default:
      return "mic.status.ready";
  }
}
