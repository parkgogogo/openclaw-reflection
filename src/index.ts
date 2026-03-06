import * as path from "path";
import * as url from "url";
import { parseConfig } from "./config.js";
import { ConsolidationScheduler } from "./consolidation/index.js";
import { DailyWriter } from "./daily-writer/index.js";
import { FileCurator } from "./file-curator/index.js";
import { FileLogger } from "./logger.js";
import {
  MemoryGateAnalyzer,
  type LLMClient,
  type MemoryGateInput,
} from "./memory-gate/index.js";
import {
  handleMessageReceived,
  handleMessageSent,
  handleSessionEnd,
} from "./message-handler.js";
import { SessionBufferManager } from "./session-manager.js";
import type { LogLevel, PluginConfig } from "./types.js";

type LoggerMethod = (message: string, ...args: unknown[]) => void;

export interface PluginLogger {
  debug: LoggerMethod;
  info: LoggerMethod;
  warn: LoggerMethod;
  error: LoggerMethod;
}

export interface RuntimeCompletionAPI {
  complete?: (input: {
    model: string;
    prompt: string;
    systemPrompt: string;
  }) => Promise<unknown>;
}

export interface PluginAPI {
  config?: {
    get?: (key: string) => unknown;
  };
  logger: PluginLogger;
  runtime?: RuntimeCompletionAPI;
  registerHook: (
    event: string,
    handler: (event: unknown, context?: unknown) => void,
    options?: { name?: string }
  ) => void;
  on?: (
    hookName: string,
    handler: (event: unknown, context?: unknown) => void,
    options?: { priority?: number }
  ) => void;
}

let bufferManager: SessionBufferManager | null = null;
let gatewayLogger: PluginLogger | null = null;
let fileLogger: FileLogger | null = null;
let isRegistered = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getCompletionText(result: unknown): string | null {
  if (typeof result === "string") {
    return result;
  }

  if (!isRecord(result)) {
    return null;
  }

  if (typeof result.text === "string") {
    return result.text;
  }

  if (typeof result.output_text === "string") {
    return result.output_text;
  }

  return null;
}

function createLLMClient(
  api: PluginAPI,
  model: string,
  logger: FileLogger
): LLMClient {
  const runtimeComplete = api.runtime?.complete;

  if (typeof runtimeComplete === "function") {
    return {
      async complete(prompt: string, systemPrompt: string): Promise<string> {
        try {
          const response = await runtimeComplete({
            model,
            prompt,
            systemPrompt,
          });
          const completionText = getCompletionText(response);

          if (completionText === null) {
            throw new Error("runtime.complete returned non-text response");
          }

          return completionText;
        } catch (error) {
          throw new Error(
            `runtime.complete call failed: ${getErrorMessage(error)}`
          );
        }
      },
    };
  }

  logger.warn(
    "PluginLifecycle",
    "No runtime completion API found, using mock memory-gate LLM client",
    { model }
  );

  return {
    async complete(
      _prompt: string,
      _systemPrompt: string
    ): Promise<string> {
      return JSON.stringify({
        decision: "NO_WRITE",
        reason: "Mock LLM client in use (runtime.complete unavailable)",
      });
    },
  };
}

function runHookSafely(
  logger: FileLogger,
  hookName: string,
  handler: () => void
): void {
  try {
    handler();
  } catch (error) {
    logger.error("PluginLifecycle", "Hook handler execution failed", {
      hookName,
      reason: getErrorMessage(error),
    });
  }
}

export default function activate(api: PluginAPI): void {
  if (isRegistered) {
    gatewayLogger?.warn(
      "[Reflection] register called more than once, skipping duplicate registration"
    );
    fileLogger?.warn(
      "PluginLifecycle",
      "Register called more than once, skipping duplicate registration"
    );
    return;
  }

  gatewayLogger = api.logger;

  try {
    const config: PluginConfig = parseConfig(api);

    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pluginRootDir = path.resolve(__dirname, "..");

    const logger = new FileLogger(pluginRootDir, config.logLevel);
    fileLogger = logger;

    gatewayLogger.info("[Reflection] Plugin starting...");
    logger.info("PluginLifecycle", "Plugin starting");

    gatewayLogger.info("[Reflection] Configuration loaded", {
      bufferSize: config.bufferSize,
      logLevel: config.logLevel,
    });
    logger.info("PluginLifecycle", "Configuration loaded", {
      bufferSize: config.bufferSize,
      logLevel: config.logLevel,
    });

    gatewayLogger.info("[Reflection] File logger initialized");
    logger.info("PluginLifecycle", "File logger initialized");

    bufferManager = new SessionBufferManager(config.bufferSize, logger);

    gatewayLogger.info("[Reflection] SessionBufferManager initialized");
    logger.info("PluginLifecycle", "SessionBufferManager initialized", {
      bufferSize: config.bufferSize,
    });

    const workspaceDir = process.cwd();
    const memoryDir = path.resolve(workspaceDir, config.dailyWriter.memoryDir);

    let memoryGate: MemoryGateAnalyzer | undefined;
    let dailyWriter: DailyWriter | undefined;
    let fileCurator: FileCurator | undefined;

    if (config.memoryGate.enabled) {
      const llmClient = createLLMClient(
        api,
        config.memoryGate.model,
        logger
      );
      memoryGate = new MemoryGateAnalyzer(llmClient, logger);
      logger.info("PluginLifecycle", "MemoryGateAnalyzer initialized", {
        model: config.memoryGate.model,
      });
    } else {
      logger.info("PluginLifecycle", "MemoryGateAnalyzer disabled");
    }

    if (config.dailyWriter.enabled) {
      dailyWriter = new DailyWriter({ memoryDir }, logger);
      logger.info("PluginLifecycle", "DailyWriter initialized", {
        memoryDir,
      });
    } else {
      logger.info("PluginLifecycle", "DailyWriter disabled");
    }

    fileCurator = new FileCurator({ workspaceDir }, logger);
    logger.info("PluginLifecycle", "FileCurator initialized", {
      workspaceDir,
    });

    if (config.consolidation.enabled) {
      const consolidationScheduler = new ConsolidationScheduler(
        {
          memoryDir,
          workspaceDir,
          schedule: config.consolidation.schedule,
          minDailyEntries: config.consolidation.minDailyEntries,
        },
        logger
      );

      consolidationScheduler.start();

      logger.info(
        "PluginLifecycle",
        "ConsolidationScheduler initialized and started",
        {
          schedule: config.consolidation.schedule,
          minDailyEntries: config.consolidation.minDailyEntries,
        }
      );
    } else {
      logger.info("PluginLifecycle", "ConsolidationScheduler disabled");
    }

    if (typeof api.on === "function") {
      api.on("message_received", (event: unknown, context?: unknown) => {
        runHookSafely(logger, "message_received", () => {
          if (bufferManager) {
            handleMessageReceived(event, bufferManager, logger, context);
          }
        });
      });

      api.on("message_sent", (event: unknown, context?: unknown) => {
        runHookSafely(logger, "message_sent", () => {
          if (bufferManager) {
            handleMessageSent(
              event,
              bufferManager,
              logger,
              context,
              memoryGate,
              dailyWriter,
              fileCurator,
              config.memoryGate.windowSize
            );
          }
        });
      });

      gatewayLogger.info("[Reflection] Typed message hooks registered");
      logger.info("PluginLifecycle", "Typed message hooks registered");
    }

    api.registerHook(
      "command:new",
      (event: unknown, context?: unknown) => {
        runHookSafely(logger, "command:new", () => {
          if (bufferManager) {
            handleSessionEnd(
              event,
              bufferManager,
              logger,
              "command:new",
              context
            );
          }
        });
      },
      { name: "reflection-command-new" }
    );

    api.registerHook(
      "command:reset",
      (event: unknown, context?: unknown) => {
        runHookSafely(logger, "command:reset", () => {
          if (bufferManager) {
            handleSessionEnd(
              event,
              bufferManager,
              logger,
              "command:reset",
              context
            );
          }
        });
      },
      { name: "reflection-command-reset" }
    );

    isRegistered = true;
    gatewayLogger.info(
      "[Reflection] Plugin registered successfully, all hooks active"
    );
    logger.info(
      "PluginLifecycle",
      "Plugin registered successfully, all hooks active"
    );
  } catch (error) {
    const reason = getErrorMessage(error);
    gatewayLogger.error("[Reflection] Plugin activation failed", { reason });
    fileLogger?.error("PluginLifecycle", "Plugin activation failed", { reason });
    throw error;
  }
}

export { parseConfig } from "./config.js";
export { FileLogger } from "./logger.js";
export { SessionBufferManager } from "./session-manager.js";
export { DailyWriter } from "./daily-writer/index.js";
export { FileCurator } from "./file-curator/index.js";
export { MemoryGateAnalyzer, MEMORY_GATE_SYSTEM_PROMPT } from "./memory-gate/index.js";
export { Consolidator, ConsolidationScheduler } from "./consolidation/index.js";
export {
  handleMessageReceived,
  handleMessageSent,
  handleSessionEnd,
} from "./message-handler.js";
export type {
  DailyEntry,
  ConsolidationResult,
  LLMClient,
  MemoryGateInput,
  MemoryGateOutput,
  PluginConfig,
  ReflectionMessage,
  Logger,
  LogLevel,
} from "./types.js";
