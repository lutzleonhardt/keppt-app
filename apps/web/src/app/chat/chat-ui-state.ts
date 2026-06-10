export type MicCaptureState = "closed" | "recording" | "transcribing" | "error";

export function hasComposerText(value: string): boolean {
  return value.trim().length > 0;
}

export function isMicOverlayVisible(state: MicCaptureState): boolean {
  return state !== "closed";
}

export function micOverlayStatus(state: MicCaptureState): string {
  switch (state) {
    case "recording":
      return "Höre zu …";
    case "transcribing":
      return "Verarbeite …";
    case "error":
      return "Nichts gehört";
    default:
      return "Bereit";
  }
}
