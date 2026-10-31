import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { VaultRepository } from "./vault.repository";
import type { DailyNoteRef, VaultFile } from "./vault.types";

/** Response body of `GET /api/files/{path}`. */
interface FileContentBody {
  readonly content: string;
}

/** Error body of every API error response; read defensively, never trusted. */
interface ApiErrorBody {
  readonly error?: { readonly code?: unknown };
}

/**
 * Reads the vault through the server's `/api` endpoints. URLs are relative:
 * in development the proxy (`proxy.conf.json`) forwards them to the server.
 */
@Injectable()
export class HttpVaultRepository extends VaultRepository {
  private readonly http = inject(HttpClient);

  async readFile(file: VaultFile): Promise<string | null> {
    try {
      const body = await firstValueFrom(
        this.http.get<FileContentBody>(`/api/files/${file}`),
      );
      return body.content;
    } catch (error) {
      // Only a confirmed missing file is `null`; a transport failure or a
      // refused path (400/403) must surface as an error, never as "missing".
      if (isFileNotFound(error)) return null;
      throw error;
    }
  }

  listDailyNotes(): Promise<readonly DailyNoteRef[]> {
    return firstValueFrom(this.http.get<DailyNoteRef[]>("/api/daily-notes"));
  }
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 404 &&
    apiErrorCode(error.error) === "file_not_found"
  );
}

function apiErrorCode(body: unknown): string | undefined {
  const code = (body as ApiErrorBody | null)?.error?.code;
  return typeof code === "string" ? code : undefined;
}
