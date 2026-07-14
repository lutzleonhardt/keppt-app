import type { DailyNoteRef, VaultFile } from "./vault.types";

/**
 * Framework-neutral read access to a vault. Transport adapters return ordinary
 * Promises; each consumer adapts them to local Angular loading and error state.
 */
export abstract class VaultRepository {
  /** Returns `null` only when the requested file does not exist. */
  abstract readFile(file: VaultFile): Promise<string | null>;

  /** Lists the available Daily notes, newest day first. */
  abstract listDailyNotes(): Promise<readonly DailyNoteRef[]>;
}
