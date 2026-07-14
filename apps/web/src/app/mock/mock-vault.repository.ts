import { Injectable } from "@angular/core";

import { VaultRepository } from "../vault/vault.repository";
import type { DailyNoteRef, VaultFile } from "../vault/vault.types";
import { mockDailyIndex, mockVaultFiles } from "./mock-vault-data";

/** Deterministic async repository used until the HTTP vault adapter lands. */
@Injectable()
export class MockVaultRepository extends VaultRepository {
  protected readonly files: Readonly<Record<string, string>> = mockVaultFiles;
  protected readonly days: readonly DailyNoteRef[] = mockDailyIndex;

  async readFile(file: VaultFile): Promise<string | null> {
    return this.files[file] ?? null;
  }

  async listDailyNotes(): Promise<readonly DailyNoteRef[]> {
    return this.days;
  }
}
