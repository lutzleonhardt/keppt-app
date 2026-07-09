import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from "@angular/core";
import { TranslocoPipe } from "@jsverse/transloco";
import { LucideArrowRight, LucideMic, LucideX } from "@lucide/angular";

import { hasComposerText } from "../chat-ui-state";

@Component({
  selector: "keppt-chat-input",
  imports: [LucideArrowRight, LucideMic, LucideX, TranslocoPipe],
  templateUrl: "./chat-input.html",
  styleUrl: "./chat-input.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatInputComponent {
  readonly draft = input.required<string>();
  readonly canSubmit = input.required<boolean>();
  readonly busy = input.required<boolean>();

  readonly draftChange = output<string>();
  readonly submitMessage = output<void>();
  readonly cancelMessage = output<void>();
  readonly openMic = output<void>();

  private readonly composerInput =
    viewChild.required<ElementRef<HTMLTextAreaElement>>("composerInput");

  protected readonly hasDraft = computed(() => hasComposerText(this.draft()));

  focusEnd(): void {
    const element = this.composerInput().nativeElement;
    element.focus();
    const end = element.value.length;
    element.setSelectionRange(end, end);
  }

  protected updateDraft(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.draftChange.emit(target.value);
  }

  protected submitFromEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.shiftKey || keyboardEvent.isComposing) {
      return;
    }

    keyboardEvent.preventDefault();
    this.submitMessage.emit();
  }
}
