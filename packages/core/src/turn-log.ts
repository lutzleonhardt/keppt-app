import type { ModelMessage } from "ai";

/**
 * One LLM turn's worth of debug data. The shape is intentionally
 * runtime-neutral and is the single source of truth for both Phase 1's
 * filesystem-backed `FsTurnLogger` and Phase 2a's planned backend
 * `SupabaseTurnLogger` (support/bug-report workflow: user reports broken
 * behaviour, support pulls the matching artifact by `turnId`).
 *
 * Built field-by-field at the call site — never `JSON.stringify` the raw
 * `streamText` options object or a raw `StepResult`. The pattern guards
 * against future SDK fields silently leaking into the artifact.
 */
export interface TurnLogRecord {
  turnId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  model: string;
  outcome: "ok" | "stream_error" | "aborted";
  initialRequest: {
    system: string;
    messages: ModelMessage[];
    providerOptions: unknown;
  };
  steps?: Array<{
    stepIndex: number;
    finishReason: string;
    text: string;
    toolCalls: unknown[];
    toolResults: unknown[];
    usage: unknown;
    warnings?: unknown[];
  }>;
  totalUsage?: unknown;
  responseMessages?: ModelMessage[];
  error?: { name: string; message: string };
}

/**
 * Write-only sink for `TurnLogRecord`. No `listTurns` / `readTurn` in
 * Phase 1: Phase 2a's "user requests log" workflow is server-side
 * (backend persists for all users continuously, support pulls by
 * `turnId`), not client-export. If a client-export surface ever
 * materializes, it lands behind a separate `TurnLogReader` interface
 * added at that point — not pre-emptively.
 */
export interface TurnLogger {
  writeTurn(record: TurnLogRecord): Promise<void>;
}

export class NoopTurnLogger implements TurnLogger {
  async writeTurn(_record: TurnLogRecord): Promise<void> {
    // Intentionally empty — used by tests / non-DEBUG runs that don't
    // care about the artifact but still need to satisfy the contract.
  }
}

export class MemoryTurnLogger implements TurnLogger {
  readonly records: TurnLogRecord[] = [];
  async writeTurn(record: TurnLogRecord): Promise<void> {
    this.records.push(record);
  }
}
