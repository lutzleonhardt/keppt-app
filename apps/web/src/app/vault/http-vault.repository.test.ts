import { HttpErrorResponse, provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HttpVaultRepository } from "./http-vault.repository";
import type { DailyNoteRef } from "./vault.types";

function apiError(code: string) {
  return { error: { code, message: `error ${code}`, requestId: "req-1" } };
}

/** Captures a rejection before the request is answered. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

describe("HttpVaultRepository", () => {
  let repository: HttpVaultRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        HttpVaultRepository,
      ],
    });
    repository = TestBed.inject(HttpVaultRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  describe("readFile", () => {
    it("GETs the vault path under /api/files and resolves the content", async () => {
      const read = repository.readFile("tasks/inbox.md");

      const request = http.expectOne("/api/files/tasks/inbox.md");
      expect(request.request.method).toBe("GET");
      request.flush({ content: "# Inbox\n\n- [ ] Anna anrufen\n" });

      await expect(read).resolves.toBe("# Inbox\n\n- [ ] Anna anrufen\n");
    });

    it("addresses a Daily note by its date path", async () => {
      const read = repository.readFile("daily/2026-07-14.md");

      http
        .expectOne("/api/files/daily/2026-07-14.md")
        .flush({ content: "# 2026-07-14" });

      await expect(read).resolves.toBe("# 2026-07-14");
    });

    it("keeps an existing empty file as an empty string, not null", async () => {
      const read = repository.readFile("tasks/waiting.md");

      http.expectOne("/api/files/tasks/waiting.md").flush({ content: "" });

      await expect(read).resolves.toBe("");
    });

    it("resolves null for a 404 file_not_found", async () => {
      const read = repository.readFile("daily/2020-01-01.md");

      http
        .expectOne("/api/files/daily/2020-01-01.md")
        .flush(apiError("file_not_found"), {
          status: 404,
          statusText: "Not Found",
        });

      await expect(read).resolves.toBeNull();
    });

    it("rejects a 404 that does not name a missing vault file", async () => {
      const outcome = rejectionOf(repository.readFile("tasks/focus.md"));

      http
        .expectOne("/api/files/tasks/focus.md")
        .flush(apiError("not_found"), { status: 404, statusText: "Not Found" });

      const error = await outcome;
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(404);
    });

    it("rejects a path the server refuses instead of reporting it missing", async () => {
      const outcome = rejectionOf(repository.readFile("daily/2026-13-45.md"));

      http
        .expectOne("/api/files/daily/2026-13-45.md")
        .flush(apiError("path_out_of_scope"), {
          status: 403,
          statusText: "Forbidden",
        });

      const error = await outcome;
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(403);
    });

    it("rejects when the server is unreachable", async () => {
      const outcome = rejectionOf(repository.readFile("tasks/inbox.md"));

      http
        .expectOne("/api/files/tasks/inbox.md")
        .error(new ProgressEvent("error"));

      const error = await outcome;
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(0);
    });
  });

  describe("listDailyNotes", () => {
    it("GETs /api/daily-notes and resolves the index in server order", async () => {
      const index: DailyNoteRef[] = [
        { date: "2026-10-31", isToday: true },
        { date: "2026-07-14", isToday: false },
      ];
      const list = repository.listDailyNotes();

      const request = http.expectOne("/api/daily-notes");
      expect(request.request.method).toBe("GET");
      request.flush(index);

      await expect(list).resolves.toEqual(index);
    });

    it("rejects a transport failure instead of resolving an empty index", async () => {
      const outcome = rejectionOf(repository.listDailyNotes());

      http.expectOne("/api/daily-notes").error(new ProgressEvent("error"));

      const error = await outcome;
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(0);
    });

    it("rejects a server error instead of resolving an empty index", async () => {
      const outcome = rejectionOf(repository.listDailyNotes());

      http.expectOne("/api/daily-notes").flush(apiError("internal_error"), {
        status: 500,
        statusText: "Internal Server Error",
      });

      const error = await outcome;
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).status).toBe(500);
    });
  });
});
