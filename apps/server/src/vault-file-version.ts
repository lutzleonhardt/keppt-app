import { statSync } from "node:fs";
import path from "node:path";

// `TurnEngineDeps.fileVersionAt` for a vault on disk: the file's mtime, or
// `undefined` when the file is missing (the pruner then falls back to its
// K-window). Same closure as the CLI adapter's; the Supabase repository
// (Task 10) replaces it with a per-turn `updated_at` lookup.
export function vaultFileVersionAt(
  vaultPath: string,
): (filePath: string) => number | undefined {
  return (filePath) => {
    try {
      return statSync(path.join(vaultPath, filePath)).mtimeMs;
    } catch {
      return undefined;
    }
  };
}
