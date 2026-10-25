import { createApp } from "./app.js";
import { createBackendLogger } from "./backend-logger.js";
import { ConfigError, readServerConfig, type ServerConfig } from "./config.js";
import { startServer } from "./start-server.js";
import { initializeVault } from "./vault-init.js";

async function main(): Promise<void> {
  const config = readConfigOrExit();
  const logger = createBackendLogger({ level: config.logLevel });
  await initializeVault(config.vaultPath, logger);
  const app = createApp({ logger, devUserId: config.devUserId });
  await startServer(app, config.port);
  logger.info({
    code: "server.listening",
    message: `Listening on port ${config.port}`,
    meta: { port: config.port },
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
