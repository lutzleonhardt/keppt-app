// The server entrypoint is the only place that reads environment variables.
// Core and the Express app receive plain values; nothing below `index.ts`
// touches `process.env`. The `@ai-sdk/*` providers read their API key from
// the environment themselves, which is why its presence is verified here.

import {
  apiKeyEnvName,
  selectModel,
  UnknownProviderError,
  type LogLevel,
  type ModelSelection,
  type ProviderKey,
} from "@gtd/core";

export interface ServerConfig {
  vaultPath: string;
  devUserId: string;
  port: number;
  logLevel: LogLevel;
  provider: ProviderKey;
  modelId: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export const DEFAULT_PORT = 3333;
const DEFAULT_LOG_LEVEL: LogLevel = "info";
const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export function readServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const { provider, modelId } = readModelSelection(env);
  const missing = ["VAULT_PATH", "DEV_USER_ID", apiKeyEnvName(provider)].filter(
    (name) => !env[name],
  );
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required environment variable(s): ${missing.join(", ")}`,
    );
  }
  return {
    vaultPath: env.VAULT_PATH as string,
    devUserId: env.DEV_USER_ID as string,
    port: readPort(env.PORT),
    logLevel: readLogLevel(env.LOG_LEVEL),
    provider,
    modelId,
  };
}

function readModelSelection(env: NodeJS.ProcessEnv): ModelSelection {
  try {
    return selectModel({ provider: env.GTD_PROVIDER, model: env.GTD_MODEL });
  } catch (err) {
    if (err instanceof UnknownProviderError) {
      throw new ConfigError(`GTD_PROVIDER: ${err.message}`);
    }
    throw err;
  }
}

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(
      `PORT must be an integer between 1 and 65535, got "${raw}"`,
    );
  }
  return port;
}

function readLogLevel(raw: string | undefined): LogLevel {
  if (raw === undefined || raw === "") return DEFAULT_LOG_LEVEL;
  if (!LOG_LEVELS.includes(raw as LogLevel)) {
    throw new ConfigError(
      `LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}, got "${raw}"`,
    );
  }
  return raw as LogLevel;
}
