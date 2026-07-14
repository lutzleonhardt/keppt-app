import { VaultRepository } from "../app/vault/vault.repository";
import type { DailyNoteRef, VaultFile } from "../app/vault/vault.types";
import { mockDailyIndex, mockVaultFiles } from "../app/mock/mock-vault-data";

export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

/**
 * Promise-scriptable repository for component tests. Unscripted reads use the
 * real mock fixtures, while queued Promises let a spec hold, fail, or vary one
 * request without making unrelated Resources unstable.
 */
export class TestVaultRepository extends VaultRepository {
  readonly fileReads: VaultFile[] = [];
  readonly dailyReads: number[] = [];

  private readonly fileQueue = new Map<
    VaultFile,
    Array<Promise<string | null>>
  >();
  private readonly dailyQueue: Array<Promise<readonly DailyNoteRef[]>> = [];

  queueFile(file: VaultFile, ...results: Array<Promise<string | null>>): void {
    const queue = this.fileQueue.get(file) ?? [];
    queue.push(...results);
    this.fileQueue.set(file, queue);
  }

  queueDaily(...results: Array<Promise<readonly DailyNoteRef[]>>): void {
    this.dailyQueue.push(...results);
  }

  readFile(file: VaultFile): Promise<string | null> {
    this.fileReads.push(file);
    return (
      this.fileQueue.get(file)?.shift() ??
      Promise.resolve(mockVaultFiles[file] ?? null)
    );
  }

  listDailyNotes(): Promise<readonly DailyNoteRef[]> {
    this.dailyReads.push(this.dailyReads.length);
    return this.dailyQueue.shift() ?? Promise.resolve(mockDailyIndex);
  }
}
