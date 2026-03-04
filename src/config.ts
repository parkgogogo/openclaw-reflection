import type { LogLevel, PluginConfig } from "./types.js";

interface PluginAPI {
  config?: {
    get?: (key: string) => unknown;
  };
}

const DEFAULT_CONFIG: PluginConfig = {
  bufferSize: 100,
  logLevel: "info",
};

const VALID_LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

function getPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function getLogLevel(value: unknown): LogLevel {
  if (typeof value === "string" && VALID_LOG_LEVELS.has(value as LogLevel)) {
    return value as LogLevel;
  }

  return DEFAULT_CONFIG.logLevel;
}

export function parseConfig(api: PluginAPI): PluginConfig {
  const config = api.config ?? {};

  return {
    bufferSize: getPositiveInteger(
      config.get?.("bufferSize"),
      DEFAULT_CONFIG.bufferSize
    ),
    logLevel: getLogLevel(config.get?.("logLevel")),
  };
}
