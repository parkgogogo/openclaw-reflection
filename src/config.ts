import type { LogLevel, PluginConfig } from "./types.js";

interface PluginAPI {
  config?: {
    get?: (key: string) => unknown;
  };
}

const DEFAULT_CONFIG: PluginConfig = {
  bufferSize: 50,
  logLevel: "info",
  memoryGate: {
    enabled: true,
    windowSize: 10,
    model: "kimi-coding/k2p5",
  },
  consolidation: {
    enabled: true,
    schedule: "0 2 * * *",
  },
};

const VALID_LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

function getPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "boolean") {
    return fallback;
  }

  return value;
}

function getString(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getLogLevel(value: unknown): LogLevel {
  if (typeof value === "string" && VALID_LOG_LEVELS.has(value as LogLevel)) {
    return value as LogLevel;
  }

  return DEFAULT_CONFIG.logLevel;
}

export function parseConfig(api: PluginAPI): PluginConfig {
  const config = api.config ?? {};
  const memoryGateRaw = config.get?.("memoryGate");
  const consolidationRaw = config.get?.("consolidation");

  const memoryGateConfig = isRecord(memoryGateRaw) ? memoryGateRaw : {};
  const consolidationConfig = isRecord(consolidationRaw) ? consolidationRaw : {};

  return {
    bufferSize: getPositiveInteger(
      config.get?.("bufferSize"),
      DEFAULT_CONFIG.bufferSize
    ),
    logLevel: getLogLevel(config.get?.("logLevel")),
    memoryGate: {
      enabled: getBoolean(
        memoryGateConfig.enabled,
        DEFAULT_CONFIG.memoryGate.enabled
      ),
      windowSize: getPositiveInteger(
        memoryGateConfig.windowSize,
        DEFAULT_CONFIG.memoryGate.windowSize
      ),
      model: getString(memoryGateConfig.model, DEFAULT_CONFIG.memoryGate.model),
    },
    consolidation: {
      enabled: getBoolean(
        consolidationConfig.enabled,
        DEFAULT_CONFIG.consolidation.enabled
      ),
      schedule: getString(
        consolidationConfig.schedule,
        DEFAULT_CONFIG.consolidation.schedule
      ),
    },
  };
}
