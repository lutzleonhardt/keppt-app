import { ChangeDetectionStrategy, Component, computed, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { scan, startWith, Subject } from "rxjs";

import {
  createUserMessage,
  initialMessages,
  quickActions,
  type ChatShellMessage,
} from "./shell-content";

interface ChatShellState {
  readonly messages: readonly ChatShellMessage[];
  readonly nextId: number;
}

const initialState: ChatShellState = {
  messages: initialMessages,
  nextId: initialMessages.length + 1,
};

@Component({
  selector: "keppt-chat-shell",
  templateUrl: "./chat-shell.html",
  styleUrl: "./chat-shell.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatShellComponent {
  private readonly submittedText$ = new Subject<string>();

  protected readonly draft = signal("");
  protected readonly quickActions = quickActions;
  protected readonly today = "Mittwoch, 6. Mai";

  private readonly chatState = toSignal(
    this.submittedText$.pipe(
      scan<string, ChatShellState>(
        (state, text) => ({
          messages: [...state.messages, createUserMessage(state.nextId, text)],
          nextId: state.nextId + 1,
        }),
        initialState,
      ),
      startWith(initialState),
    ),
    { initialValue: initialState },
  );

  protected readonly messages = computed(() => this.chatState().messages);
  protected readonly canSubmit = computed(() => this.draft().trim().length > 0);

  protected updateDraft(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.draft.set(target.value);
  }

  protected submitDraft(): void {
    const text = this.draft().trim();

    if (text.length === 0) {
      return;
    }

    this.submittedText$.next(text);
    this.draft.set("");
  }

  protected submitQuickAction(text: string): void {
    this.submittedText$.next(text);
  }
}
