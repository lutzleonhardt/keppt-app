import { Injectable, signal } from "@angular/core";

import {
  createContentMessage,
  createToolMessage,
  getMockResponse,
  planningQuestion,
  quickReplyPhrases,
  routePatterns,
  toQuickReplies,
  type MockFlow,
  type MockToolBlock,
  type MockTurn,
} from "./chat-mock-data";
import { ChatService } from "../chat/chat.service";
import {
  isAssistantContentMessage,
  isAssistantTypingMessage,
} from "../chat/chat.types";
import type {
  AssistantTypingMessage,
  ChatMessage,
  ChatStatus,
  ToolState,
  UserChatMessage,
} from "../chat/chat.types";

const MOCK_THINK_DELAY_MS = 500; // ••• before the first tool of a run / deciding
const MOCK_TOOL_DELAY_MS = 750; // one tool call running — slow enough to perceive
const MOCK_COMPOSE_DELAY_MS = 700; // ••• before a prose block lands

@Injectable()
export class MockChatService extends ChatService {
  private readonly messagesState = signal<readonly ChatMessage[]>([]);
  private readonly statusState = signal<ChatStatus>("idle");

  readonly messages = this.messagesState.asReadonly();
  readonly status = this.statusState.asReadonly();

  /** Aborts the turn currently playing in `respondWith`; null while idle. */
  private inFlight: AbortController | null = null;

  constructor() {
    super();
    this.seedTurn(getMockResponse("greeting"));
  }

  async sendMessage(content: string): Promise<void> {
    const trimmed = content.trim();

    // Re-entrancy guard: a turn already in flight must not spawn a parallel
    // response. Without it, two overlapping `respondWith` runs corrupt shared
    // state (e.g. `removeTypingMessages` clears the other run's indicator).
    if (trimmed.length === 0 || this.busy()) {
      return;
    }

    this.appendUserMessage(trimmed);
    await this.respondWith(this.routeUserText(trimmed), trimmed);
  }

  async chooseQuickReply(label: string): Promise<void> {
    if (this.busy()) {
      return;
    }

    const flow = this.routeQuickReply(label);

    if (flow === "planning") {
      await this.sendMessage(planningQuestion);
      return;
    }

    if (flow === "today") {
      await this.sendMessage(quickReplyPhrases.todayQ);
      return;
    }

    if (flow === "inbox") {
      await this.sendMessage(quickReplyPhrases.inboxCleanup);
      return;
    }

    const userText = this.userTextForQuickReply(label, flow);
    this.appendUserMessage(userText);
    await this.respondWith(flow, userText);
  }

  cancel(): void {
    // Abort the pending `wait` in `playTurn`; the rejection unwinds into
    // `respondWith`, which rolls the turn back to its checkpoint. Stopping the
    // timer here is the mock's stand-in for telling a real backend to halt the
    // stream. A no-op when idle (`inFlight` is null).
    this.inFlight?.abort();
  }

  private async respondWith(
    flow: MockFlow,
    capturedText?: string,
  ): Promise<void> {
    // INVARIANT: flip to a non-idle (busy) status SYNCHRONOUSLY here, before any
    // `await`. The first block committed in `playTurn` is also synchronous, so a
    // rapid second (double-)click is dequeued only after status is already
    // "thinking" and its re-entrancy guard returns. Never move an `await` ahead
    // of this line, or fast double-clicks spawn parallel responses again.
    this.statusState.set("thinking");

    // Snapshot taken with the user message already committed but no assistant
    // artifacts yet, so a cancel restores exactly this: keep the user message,
    // drop the whole half-played response.
    const checkpoint = this.messagesState();
    const controller = new AbortController();
    this.inFlight = controller;

    try {
      await this.playTurn(getMockResponse(flow, capturedText), controller.signal);
    } catch (error) {
      // A cancel rolls the turn back; any other failure propagates unchanged.
      if (!controller.signal.aborted) {
        throw error;
      }
      this.messagesState.set(checkpoint);
    } finally {
      this.inFlight = null;
      // Safety net: the re-entrancy guard is load-bearing, so a throw mid-turn
      // must never wedge `busy()` true forever or strand a typing indicator.
      // `removeTypingMessages` is idempotent (and a no-op after a checkpoint
      // restore), so the happy path pays nothing.
      this.removeTypingMessages();
      this.statusState.set("idle");
    }
  }

  /**
   * Replays a turn block by block in generation order. The typing indicator is a
   * single live-edge cue: it shows while the assistant "decides" before a tool
   * run and while it "composes" before prose, but never alongside a running tool
   * — there, the tool row's own spinner is the indicator.
   */
  private async playTurn(turn: MockTurn, signal: AbortSignal): Promise<void> {
    for (const [i, block] of turn.entries()) {
      if (block.kind === "tool") {
        // A brief deciding indicator only before the first tool of a run; tools
        // that follow tools continue the run without a typing flicker.
        const continuesRun = i > 0 && turn[i - 1]?.kind === "tool";
        if (!continuesRun) {
          this.appendTypingMessage();
          await this.wait(MOCK_THINK_DELAY_MS, signal);
          this.removeTypingMessages();
        }
        const id = this.appendToolMessage(block, "running");
        await this.wait(block.durationMs ?? MOCK_TOOL_DELAY_MS, signal);
        this.markToolDone(id);
      } else if (block.kind === "prose") {
        this.appendTypingMessage();
        await this.wait(MOCK_COMPOSE_DELAY_MS, signal);
        this.removeTypingMessages();
        this.appendContentMessage(block.markdown);
      } else {
        this.attachQuickReplies(block.labels);
      }
    }
  }

  /** Commits a turn instantly with every tool already done (used for boot). */
  private seedTurn(turn: MockTurn): void {
    for (const block of turn) {
      if (block.kind === "tool") {
        this.appendToolMessage(block, "done");
      } else if (block.kind === "prose") {
        this.appendContentMessage(block.markdown);
      } else {
        this.attachQuickReplies(block.labels);
      }
    }
  }

  private appendToolMessage(block: MockToolBlock, state: ToolState): string {
    const id = this.nextId();
    this.messagesState.update((messages) => [
      ...messages,
      createToolMessage(id, this.now(), block, state),
    ]);
    return id;
  }

  private markToolDone(id: string): void {
    this.messagesState.update((messages) =>
      messages.map((message): ChatMessage =>
        message.kind === "tool" && message.id === id
          ? { ...message, state: "done" }
          : message,
      ),
    );
  }

  private appendContentMessage(markdown: string): void {
    const id = this.nextId();
    this.messagesState.update((messages) => [
      ...messages,
      createContentMessage(id, this.now(), markdown),
    ]);
  }

  /**
   * Attaches quick replies to the most recent content message — the mock's
   * minimal stand-in for `suggest_quick_replies`. The store derives the active
   * chips from the last content message, so they render above the composer.
   */
  private attachQuickReplies(labels: readonly string[]): void {
    this.messagesState.update((messages) => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message && isAssistantContentMessage(message)) {
          const next = [...messages];
          next[i] = { ...message, quickReplies: toQuickReplies(labels) };
          return next;
        }
      }
      return messages;
    });
  }

  private appendTypingMessage(): void {
    this.messagesState.update((messages) => [
      ...messages,
      {
        id: this.nextId(),
        role: "assistant",
        kind: "typing",
        createdAt: this.now(),
      } satisfies AssistantTypingMessage,
    ]);
  }

  private removeTypingMessages(): void {
    // Idempotent: return the same reference when there is nothing to remove, so
    // the signal does not emit (Object.is) and the finally-path stays free.
    this.messagesState.update((messages) =>
      messages.some(isAssistantTypingMessage)
        ? messages.filter((message) => !isAssistantTypingMessage(message))
        : messages,
    );
  }

  private appendUserMessage(text: string): void {
    this.messagesState.update((messages) => [
      ...messages,
      {
        id: this.nextId(),
        role: "user",
        kind: "user",
        text,
        createdAt: this.now(),
      } satisfies UserChatMessage,
    ]);
  }

  private wait(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      return Promise.reject(new DOMException("Turn cancelled", "AbortError"));
    }

    if (ms <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(new DOMException("Turn cancelled", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private routeUserText(text: string): MockFlow {
    // Most specific first: the demo dictation also contains "sortieren", so it
    // would otherwise be swallowed by the generic inbox pattern below.
    if (routePatterns.captureConfirm.test(text)) {
      return "captureConfirm";
    }

    if (routePatterns.planning.test(text)) {
      return "planning";
    }

    // Before `today` — "Was passt heute zu mir?" is the what-fits-me intent
    // even though it contains "heute".
    if (routePatterns.nextContext.test(text)) {
      return "nextContext";
    }

    if (routePatterns.today.test(text)) {
      return "today";
    }

    if (routePatterns.waiting.test(text)) {
      return "waiting";
    }

    if (routePatterns.inbox.test(text)) {
      return "inbox";
    }

    return "acknowledge";
  }

  private routeQuickReply(label: string): MockFlow {
    const planRelated =
      label === quickReplyPhrases.planTomorrow ||
      label === quickReplyPhrases.plan4h ||
      label === quickReplyPhrases.planNext;

    if (planRelated) {
      return "planning";
    }

    if (
      label === quickReplyPhrases.todayQ ||
      label === quickReplyPhrases.startToday
    ) {
      return "today";
    }

    if (
      label === quickReplyPhrases.waitingQ ||
      label === quickReplyPhrases.showWaiting ||
      label === quickReplyPhrases.pingMax ||
      /max|db/i.test(label)
    ) {
      return "waiting";
    }

    if (label === quickReplyPhrases.inboxCleanup) {
      return "inbox";
    }

    if (label === quickReplyPhrases.planConfirm) {
      return "planEntered";
    }

    if (label === quickReplyPhrases.annaFirst) {
      return "annaPriority";
    }

    if (label === quickReplyPhrases.captureOnly) {
      return "captureOnly";
    }

    if (
      label === quickReplyPhrases.laterDecide ||
      label === quickReplyPhrases.doNothing ||
      label === quickReplyPhrases.later
    ) {
      return "later";
    }

    return "acknowledge";
  }

  private userTextForQuickReply(label: string, flow: MockFlow): string {
    if (flow === "planEntered") {
      return "Ja, trag den Plan ein.";
    }

    if (flow === "annaPriority") {
      return "Ja, Anna soll Priorität haben.";
    }

    return label;
  }

  /**
   * Monotonic per-instance counter — never derived from the list length, so an
   * id is never reused after removals (typing indicator, cancel rollback) and
   * `track item.id` stays stable in the template.
   */
  private idCounter = 0;

  private nextId(): string {
    return `m-${++this.idCounter}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
