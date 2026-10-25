import { vi } from "vitest";
import { FileNotFoundError, type FileRepository } from "@gtd/core";

// FileRepository for the read endpoints: `list` serves the given paths,
// `read` rejects as missing unless a test overrides it, and both are spies so
// a test can prove the repository was (not) consulted.
export function spyFileRepository(paths: readonly string[] = []) {
  const read = vi.fn(async (filePath: string): Promise<string> => {
    throw new FileNotFoundError(filePath);
  });
  const list = vi.fn(
    async (prefix = ""): Promise<string[]> =>
      paths.filter((p) => p.startsWith(prefix)),
  );
  const unsupported = () =>
    Promise.reject(new Error("not used by the read endpoints"));
  const repo: FileRepository = {
    read,
    list,
    write: unsupported,
    edit: unsupported,
    search: unsupported,
  };
  return { repo, read, list };
}
