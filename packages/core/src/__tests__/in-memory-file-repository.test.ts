import { InMemoryFileRepository } from "../in-memory-file-repository.js";
import { runFileRepositoryContract } from "./file-repository.contract.js";

const FIXED_NOW = new Date("2026-04-24T10:00:00Z");

runFileRepositoryContract("InMemoryFileRepository", async () => {
  const repo = new InMemoryFileRepository({ now: () => FIXED_NOW });
  return {
    repo,
    async readHistory() {
      return repo.getHistory().map((e) => JSON.stringify(e));
    },
  };
});
