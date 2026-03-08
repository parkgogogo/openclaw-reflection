import path from "node:path";
import type { LogLevel, PluginConfig } from "./types.js";

interface PluginAPI {
  pluginConfig?: unknown;
  config?: {
    get?: (key: string) => unknown;
  };
}

const DEFAULT_CONFIG: PluginConfig = {
  bufferSize: 50,
  logLevel: "info",
  llm: {
    baseURL: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4.1-mini",
  },
  memoryGate: {
    enabled: true,
    windowSize: 10,
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

function readConfigValue(
  config: PluginAPI["config"],
  key: string
): unknown {
  const directValue = config?.get?.(key);
  if (directValue !== undefined) {
    return directValue;
  }

  const segments = key.split(".");
  if (segments.length === 1) {
    return undefined;
  }

  const [rootKey, ...nestedSegments] = segments;
  let currentValue = config?.get?.(rootKey);

  for (const segment of nestedSegments) {
    if (!isRecord(currentValue) || !(segment in currentValue)) {
      return undefined;
    }

    currentValue = currentValue[segment];
  }

  return currentValue;
}

function readRecordValue(
  value: unknown,
  key: string
): unknown {
  const segments = key.split(".");
  let currentValue: unknown = value;

  for (const segment of segments) {
    if (!isRecord(currentValue) || !(segment in currentValue)) {
      return undefined;
    }

    currentValue = currentValue[segment];
  }

  return currentValue;
}

function readPluginConfigValue(api: PluginAPI, key: string): unknown {
  const pluginConfigValue = readRecordValue(api.pluginConfig, key);
  if (pluginConfigValue !== undefined) {
    return pluginConfigValue;
  }

  return readConfigValue(api.config, key);
}

export type ConfigLogSnapshot = Record<string, unknown> & {
  bufferSize: number;
  logLevel: LogLevel;
  llm: {
    baseURL: string;
    apiKeyConfigured: boolean;
    model: string;
  };
  memoryGate: {
    enabled: boolean;
    windowSize: number;
  };
  consolidation: {
    enabled: boolean;
    schedule: string;
  };
};

export interface WorkspaceResolution {
  workspaceDir?: string;
  source: string;
  reason?: string;
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isFilesystemRoot(dirPath: string): boolean {
  const resolved = path.resolve(dirPath);
  return resolved === path.parse(resolved).root;
}

export function createConfigLogSnapshot(
  config: PluginConfig
): ConfigLogSnapshot {
  return {
    bufferSize: config.bufferSize,
    logLevel: config.logLevel,
    llm: {
      baseURL: config.llm.baseURL,
      apiKeyConfigured: config.llm.apiKey.trim().length > 0,
      model: config.llm.model,
    },
    memoryGate: {
      enabled: config.memoryGate.enabled,
      windowSize: config.memoryGate.windowSize,
    },
    consolidation: {
      enabled: config.consolidation.enabled,
      schedule: config.consolidation.schedule,
    },
  };
}

export function resolveWorkspaceDir(
  api: PluginAPI,
  cwd: string = process.cwd()
): WorkspaceResolution {
  const configuredWorkspaceDir = getNonEmptyString(
    readPluginConfigValue(api, "workspaceDir")
  );

  if (configuredWorkspaceDir) {
    return {
      workspaceDir: path.resolve(configuredWorkspaceDir),
      source: "plugin config workspaceDir",
    };
  }

  const normalizedCwd = getNonEmptyString(cwd);
  if (normalizedCwd && !isFilesystemRoot(normalizedCwd)) {
    return {
      workspaceDir: path.resolve(normalizedCwd),
      source: "process.cwd() fallback",
    };
  }

  return {
    source: "unresolved",
    reason:
      'Missing plugin config "workspaceDir" and process.cwd() resolved to the filesystem root',
  };
}

export function parseConfig(api: PluginAPI): PluginConfig {
  return {
    bufferSize: getPositiveInteger(
      readPluginConfigValue(api, "bufferSize"),
      DEFAULT_CONFIG.bufferSize
    ),
    logLevel: getLogLevel(readPluginConfigValue(api, "logLevel")),
    llm: {
      baseURL: getString(
        readPluginConfigValue(api, "llm.baseURL"),
        DEFAULT_CONFIG.llm.baseURL
      ),
      apiKey: getString(
        readPluginConfigValue(api, "llm.apiKey"),
        DEFAULT_CONFIG.llm.apiKey
      ),
      model: getString(
        readPluginConfigValue(api, "llm.model"),
        DEFAULT_CONFIG.llm.model
      ),
    },
    memoryGate: {
      enabled: getBoolean(
        readPluginConfigValue(api, "memoryGate.enabled"),
        DEFAULT_CONFIG.memoryGate.enabled
      ),
      windowSize: getPositiveInteger(
        readPluginConfigValue(api, "memoryGate.windowSize"),
        DEFAULT_CONFIG.memoryGate.windowSize
      ),
    },
    consolidation: {
      enabled: getBoolean(
        readPluginConfigValue(api, "consolidation.enabled"),
        DEFAULT_CONFIG.consolidation.enabled
      ),
      schedule: getString(
        readPluginConfigValue(api, "consolidation.schedule"),
        DEFAULT_CONFIG.consolidation.schedule
      ),
    },
  };
}
