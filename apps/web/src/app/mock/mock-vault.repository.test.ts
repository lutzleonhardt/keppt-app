import { describe, expect, it } from "vitest";

import { dailyFilePath, type VaultFile } from "../vault/vault.types";
import { mockVaultFiles } from "./mock-vault-data";
import { MockVaultRepository } from "./mock-vault.repository";

describe("MockVaultRepository", () => {
  it("returns every seeded file verbatim", async () => {
    const repository = new MockVaultRepository();

    for (const [file, content] of Object.entries(mockVaultFiles)) {
      await expect(repository.readFile(file as VaultFile)).resolves.toBe(
        content,
      );
    }
  });

  it("keeps the three R7 next-action category headings", async () => {
    const repository = new MockVaultRepository();

    const content = await repository.readFile("tasks/next-actions.md");

    expect(content).toContain("## Arbeit");
    expect(content).toContain("## Haus & Garten");
    expect(content).toContain("## Persönlich");
  });

  it("lists four days newest first and makes every indexed Daily note readable", async () => {
    const repository = new MockVaultRepository();

    const index = await repository.listDailyNotes();

    expect(index).toEqual([
      { date: "2026-05-06", isToday: true },
      { date: "2026-05-05", isToday: false },
      { date: "2026-05-04", isToday: false },
      { date: "2026-05-03", isToday: false },
    ]);

    for (const day of index) {
      const content = await repository.readFile(dailyFilePath(day.date));
      expect(content).not.toBeNull();
      expect(content).toContain("## Plan");
      expect(content).toContain("## Log");
    }
  });

  it("returns null for an unknown path", async () => {
    const repository = new MockVaultRepository();

    await expect(
      repository.readFile(dailyFilePath("1999-01-01")),
    ).resolves.toBeNull();
  });

  it("does not normalize an existing empty file to null", async () => {
    const emptyFile = dailyFilePath("2000-01-01");

    class EmptyFileRepository extends MockVaultRepository {
      protected override readonly files = {
        ...mockVaultFiles,
        [emptyFile]: "",
      };
    }

    const repository = new EmptyFileRepository();

    await expect(repository.readFile(emptyFile)).resolves.toBe("");
  });
});
