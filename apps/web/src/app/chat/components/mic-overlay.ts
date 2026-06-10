import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from "@angular/core";
import { LucideCheck, LucideMic, LucideX } from "@lucide/angular";

import { micOverlayStatus, type MicCaptureState } from "../chat-ui-state";
import { KepptMonogramComponent } from "../../ui/keppt-monogram";
import { StatusDotComponent } from "../../ui/status-dot";

@Component({
  selector: "keppt-mic-overlay",
  imports: [
    KepptMonogramComponent,
    LucideCheck,
    LucideMic,
    LucideX,
    StatusDotComponent,
  ],
  templateUrl: "./mic-overlay.html",
  styleUrl: "./mic-overlay.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // The component only exists while the overlay is open, and the cancel
    // action is available in every capture state — Escape always cancels.
    "(document:keydown.escape)": "cancel.emit()",
  },
})
export class MicOverlayComponent {
  readonly state = input.required<MicCaptureState>();

  readonly cancel = output<void>();
  readonly stop = output<void>();
  readonly retry = output<void>();

  private readonly overlayRoot =
    viewChild.required<ElementRef<HTMLElement>>("overlayRoot");

  constructor() {
    // Move focus onto the dialog container itself so screen readers announce
    // it via aria-labelledby. Deliberately no button autofocus and no focus
    // trap here — a full trap (CDK Dialog) is deferred to a later task.
    afterNextRender(() => this.overlayRoot().nativeElement.focus());
  }

  protected readonly status = computed(() => micOverlayStatus(this.state()));
  protected readonly recording = computed(() => this.state() === "recording");
  protected readonly transcribing = computed(() => this.state() === "transcribing");
  protected readonly errored = computed(() => this.state() === "error");

  protected readonly hintLabel = computed(() => {
    switch (this.state()) {
      case "recording":
        return "Tippe ✓, wenn du fertig bist";
      case "transcribing":
        return "Wird verarbeitet …";
      default:
        return "";
    }
  });

  protected readonly waveformBars = [12, 24, 16, 30, 20, 28, 14];
}
