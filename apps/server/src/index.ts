import {
  createModelProvider,
  FsSessionStore,
  LocalFileRepository,
} from "@gtd/core";
import { createApp } from "./app.js";
import { createBackendLogger } from "./backend-logger.js";
import { TurnRegistry } from "./chat/turn-registry.js";
import { ConfigError, readServerConfig, type ServerConfig } from "./config.js";
import { startServer } from "./start-server.js";
import { vaultFileVersionAt } from "./vault-file-version.js";
import { initializeVault } from "./vault-init.js";

async function main(): Promise<void> {
  const config = readConfigOrExit();
  const logger = createBackendLogger({ level: config.logLevel });
  await initializeVault(config.vaultPath, logger);
  const fileRepository = new LocalFileRepository(config.vaultPath, { logger });
  const { model, providerOptions } = createModelProvider(config);
  const turnRegistry = new TurnRegistry({
    repo: fileRepository,
    sessionStore: new FsSessionStore(config.vaultPath),
    logger,
    model,
    providerOptions,
    fileVersionAt: vaultFileVersionAt(config.vaultPath),
  });
  const app = createApp({
    logger,
    devUserId: config.devUserId,
    fileRepository,
    turnRegistry,
  });
  await startServer(app, config.port);
  logger.info({
    code: "server.listening",
    message: `Listening on port ${config.port}`,
    meta: {
      port: config.port,
      provider: config.provider,
      model: config.modelId,
    },
  });
}

function readConfigOrExit(): ServerConfig {
  try {
    return readServerConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
