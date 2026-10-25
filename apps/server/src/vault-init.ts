import {
  ensureGtdTaskFiles,
  LocalFileRepository,
  type EnsureGtdTaskFilesResult,
  type Logger,
} from "@gtd/core";

// Once per boot, mirroring the CLI startup: a dedicated repository handle
// with `changedBy: "system"` so first-run file creations are attributed to
// the server, not to a user or the LLM. Idempotent on an initialized vault.
export async function initializeVault(
  vaultPath: string,
  logger: Logger,
): Promise<EnsureGtdTaskFilesResult> {
  const systemRepo = new LocalFileRepository(vaultPath, {
    changedBy: "system",
    logger,
  });
  const result = await ensureGtdTaskFiles(systemRepo);
  logger.info({
    code: "server.vault_ready",
    message: "Vault task files verified",
    meta: { createdCount: result.created.length, created: result.created },
  });
  return result;
}
