import * as path from "path";
import * as url from "url";
import { parseConfig } from "./config.js";
import { ConsolidationScheduler } from "./consolidation/index.js";
import { FileCurator } from "./file-curator/index.js";
import { LLMService as SharedLLMService } from "./llm/service.js";
import { FileLogger } from "./logger.js";
import {
  MemoryGateAnalyzer,
  type MemoryGateInput,
} from "./memory-gate/index.js";
import {
  handleMessageReceived,
  handleMessageSent,
  handleSessionEnd,
} from "./message-handler.js";
import { SessionBufferManager } from "./session-manager.js";
import type {
  LLMCompleteParams,
  LLMProvider,
  LLMService,
  LogLevel,
  PluginConfig,
} from "./types.js";

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
    responseFormat?: {
      type: "json_schema";
      jsonSchema: unknown;
    };
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createLLMService(
  api: PluginAPI,
  model: string,
  logger: FileLogger
): LLMService {
  const runtimeComplete = api.runtime?.complete;

  if (typeof runtimeComplete === "function") {
    const provider: LLMProvider = {
      async complete(input: LLMCompleteParams): Promise<unknown> {
        try {
          return await runtimeComplete({
            model,
            prompt: input.prompt,
            systemPrompt: input.systemPrompt,
            responseFormat: input.responseFormat,
          });
        } catch (error) {
          throw new Error(
            `runtime.complete call failed: ${getErrorMessage(error)}`
          );
        }
      }
    };

    return new SharedLLMService(provider);
  }

  logger.warn(
    "PluginLifecycle",
    "No runtime completion API found, using mock LLM service",
    { model }
  );

  const provider: LLMProvider = {
    async complete(input: LLMCompleteParams): Promise<string> {
      if (input.systemPrompt.includes("Writer Guardian")) {
        return JSON.stringify({
          action: "finish",
          message: "Mock LLM service in use (runtime.complete unavailable)",
        });
      }

      if (input.systemPrompt.includes("WRITE_CLEANUP")) {
        return JSON.stringify({
          decision: "NO_WRITE",
          proposed_updates: {},
        });
      }

      return JSON.stringify({
        decision: "NO_WRITE",
        reason: "Mock LLM service in use (runtime.complete unavailable)",
      });
    },
  };

  return new SharedLLMService(provider);
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
    const memoryModel = config.memoryGate.model;
    const llmService =
      config.memoryGate.enabled || config.consolidation.enabled
        ? createLLMService(api, memoryModel, logger)
        : undefined;

    let memoryGate: MemoryGateAnalyzer | undefined;
    let fileCurator: FileCurator | undefined;

    if (config.memoryGate.enabled && llmService) {
      memoryGate = new MemoryGateAnalyzer(llmService, logger);
      logger.info("PluginLifecycle", "MemoryGateAnalyzer initialized", {
        model: memoryModel,
      });
    } else {
      logger.info("PluginLifecycle", "MemoryGateAnalyzer disabled");
    }

    if (llmService) {
      fileCurator = new FileCurator({ workspaceDir }, logger, llmService);
    }
    logger.info("PluginLifecycle", "FileCurator initialized", {
      workspaceDir,
    });

    if (config.consolidation.enabled && llmService) {
      const consolidationScheduler = new ConsolidationScheduler(
        {
          workspaceDir,
          schedule: config.consolidation.schedule,
        },
        logger,
        llmService
      );

      consolidationScheduler.start();

      logger.info(
        "PluginLifecycle",
        "ConsolidationScheduler initialized and started",
        {
          schedule: config.consolidation.schedule,
        }
      );
    } else {
      logger.info("PluginLifecycle", "ConsolidationScheduler disabled");
    }

    if (typeof api.on === "function") {
      api.on("message_received", (event: unknown, context?: unknown) => {
        runHookSafely(logger, "message_received", () => {
          logger.debug("PluginLifecycle", "Callback invoked", {
            hook: "message_received",
            hasContext: context !== undefined,
            hasBufferManager: Boolean(bufferManager),
          });

          if (bufferManager) {
            handleMessageReceived(event, bufferManager, logger, context);
            logger.debug("PluginLifecycle", "Callback completed", {
              hook: "message_received",
            });
          } else {
            logger.warn("PluginLifecycle", "Callback skipped: buffer manager missing", {
              hook: "message_received",
            });
          }
        });
      });

      api.on("message_sent", (event: unknown, context?: unknown) => {
        runHookSafely(logger, "message_sent", () => {
          logger.debug("PluginLifecycle", "Callback invoked", {
            hook: "message_sent",
            hasContext: context !== undefined,
            hasBufferManager: Boolean(bufferManager),
          });

          if (bufferManager) {
            handleMessageSent(
              event,
              bufferManager,
              logger,
              context,
              memoryGate,
              fileCurator,
              config.memoryGate.windowSize
            );
            logger.debug("PluginLifecycle", "Callback completed", {
              hook: "message_sent",
            });
          } else {
            logger.warn("PluginLifecycle", "Callback skipped: buffer manager missing", {
              hook: "message_sent",
            });
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
export { LLMService } from "./llm/service.js";
export { FileCurator } from "./file-curator/index.js";
export { MemoryGateAnalyzer, MEMORY_GATE_SYSTEM_PROMPT } from "./memory-gate/index.js";
export { Consolidator, ConsolidationScheduler } from "./consolidation/index.js";
export {
  handleMessageReceived,
  handleMessageSent,
  handleSessionEnd,
} from "./message-handler.js";
export type {
  ConsolidationResult,
  LLMService as LLMServiceContract,
  MemoryGateInput,
  MemoryGateOutput,
  PluginConfig,
  ReflectionMessage,
  Logger,
  LogLevel,
} from "./types.js";
