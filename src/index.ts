import * as path from "path";
import * as url from "url";
import {
  createConfigLogSnapshot,
  parseConfig,
  resolveWorkspaceDir,
} from "./config.js";
import { ConsolidationScheduler } from "./consolidation/index.js";
import { LLMService as SharedLLMService } from "./llm/service.js";
import { FileLogger } from "./logger.js";
import {
  MemoryGateAnalyzer,
} from "./memory-gate/index.js";
import { WriteGuardian } from "./write-guardian/index.js";
import {
  WriteGuardianAuditLog,
  type WriteGuardianAuditEntry,
} from "./write-guardian/audit-log.js";
import {
  handleBeforeMessageWrite,
  handleMessageReceived,
} from "./message-handler.js";
import { OpenClawMessageReactionService } from "./message-reaction.js";
import { SessionBufferManager } from "./session-manager.js";
import type {
  LLMService,
  PluginConfig,
} from "./types.js";

type LoggerMethod = (message: string, ...args: unknown[]) => void;

export interface PluginLogger {
  debug: LoggerMethod;
  info: LoggerMethod;
  warn: LoggerMethod;
  error: LoggerMethod;
}

export interface PluginAPI {
  pluginConfig?: unknown;
  config?: {
    get?: (key: string) => unknown;
  };
  logger: PluginLogger;
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
  registerCommand?: (
    command: {
      name: string;
      description: string;
      handler: (args?: string) => { text: string } | Promise<{ text: string }>;
    }
  ) => void;
}

let bufferManager: SessionBufferManager | null = null;
let gatewayLogger: PluginLogger | null = null;
let fileLogger: FileLogger | null = null;
let isRegistered = false;
const REFLECTION_COMMAND_NAME = "reflections";

function formatWriteGuardianAudit(entries: WriteGuardianAuditEntry[]): string {
  if (entries.length === 0) {
    return "No write_guardian records found.";
  }

  const lines = entries.map((entry, index) => {
    const summary = [
      `${index + 1}. [${entry.timestamp}] ${entry.status}`,
      `decision=${entry.decision}`,
      entry.targetFile ? `file=${entry.targetFile}` : undefined,
      entry.reason ? `reason=${entry.reason}` : undefined,
      entry.candidateFact ? `fact=${entry.candidateFact}` : undefined,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" | ");

    return summary;
  });

  return lines.join("\n");
}

function registerReflectionCommand(
  api: PluginAPI,
  logger: FileLogger,
  auditLog?: WriteGuardianAuditLog
): void {
  if (typeof api.registerCommand !== "function") {
    logger.info("PluginLifecycle", "registerCommand unavailable, skip command registration", {
      command: REFLECTION_COMMAND_NAME,
    });
    return;
  }

  api.registerCommand({
    name: REFLECTION_COMMAND_NAME,
    description: "Show recent write_guardian audit entries",
    handler: async () => {
      if (!auditLog) {
        return {
          text: "write_guardian audit log unavailable: workspace is not configured.",
        };
      }

      const entries = await auditLog.readRecent(10);
      return {
        text: formatWriteGuardianAudit(entries),
      };
    },
  });

  logger.info("PluginLifecycle", "Registered plugin command", {
    command: REFLECTION_COMMAND_NAME,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createLLMService(config: PluginConfig): LLMService {
  const { baseURL, apiKey, model } = config.llm;

  if (baseURL.trim() === "" || apiKey.trim() === "" || model.trim() === "") {
    throw new Error("LLM config requires non-empty llm.baseURL, llm.apiKey, and llm.model");
  }

  return new SharedLLMService({
    baseURL,
    apiKey,
    model,
  });
}

function isConfigOnlyModeEnabled(): boolean {
  const value = process.env.OPENCLAW_REFLECTION_CONFIG_ONLY;
  if (typeof value !== "string") {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return (
    normalizedValue === "1" ||
    normalizedValue === "true" ||
    normalizedValue === "yes" ||
    normalizedValue === "on"
  );
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

function registerMessageHook(
  api: PluginAPI,
  hookName: "message_received",
  handler: (event: unknown, context?: unknown) => unknown
): void {
  if (typeof api.on === "function") {
    api.on(hookName, handler);
    return;
  }

  api.registerHook("message:received", handler, {
    name: `reflection-${hookName}`,
  });
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
    const configSnapshot = createConfigLogSnapshot(config);
    const configOnlyMode = isConfigOnlyModeEnabled();

    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pluginRootDir = path.resolve(__dirname, "..");

    const logger = new FileLogger(pluginRootDir, config.logLevel);
    fileLogger = logger;

    gatewayLogger.info("[Reflection] Plugin starting...");
    logger.info("PluginLifecycle", "Plugin starting");

    gatewayLogger.info(
      "[Reflection] Configuration loaded",
      configSnapshot as Record<string, unknown>
    );
    logger.info(
      "PluginLifecycle",
      "Configuration loaded",
      configSnapshot as Record<string, unknown>
    );

    gatewayLogger.info("[Reflection] File logger initialized");
    logger.info("PluginLifecycle", "File logger initialized");

    if (configOnlyMode) {
      gatewayLogger.info(
        "[Reflection] Config-only mode enabled, skipping hooks and side effects",
        configSnapshot as Record<string, unknown>
      );
      logger.info(
        "PluginLifecycle",
        "Config-only mode enabled, skipping hooks and side effects",
        configSnapshot as Record<string, unknown>
      );
      isRegistered = true;
      return;
    }

    bufferManager = new SessionBufferManager(config.bufferSize, logger);

    gatewayLogger.info("[Reflection] SessionBufferManager initialized");
    logger.info("PluginLifecycle", "SessionBufferManager initialized", {
      bufferSize: config.bufferSize,
    });

    const workspaceResolution = resolveWorkspaceDir(api);
    const workspaceDir = workspaceResolution.workspaceDir;

    if (workspaceDir) {
      logger.info("PluginLifecycle", "Workspace resolved", {
        workspaceDir,
        source: workspaceResolution.source,
      });
    } else {
      logger.error("PluginLifecycle", "Workspace unavailable", {
        source: workspaceResolution.source,
        reason: workspaceResolution.reason,
      });
    }

    const llmService =
      config.memoryGate.enabled || config.consolidation.enabled
        ? createLLMService(config)
        : undefined;

    let memoryGate: MemoryGateAnalyzer | undefined;
    let writeGuardian: WriteGuardian | undefined;
    let writeGuardianAuditLog: WriteGuardianAuditLog | undefined;
    const reactionService = new OpenClawMessageReactionService(logger);

    if (config.memoryGate.enabled && llmService) {
      memoryGate = new MemoryGateAnalyzer(llmService, logger);
      logger.info("PluginLifecycle", "memory_gate initialized", {
        model: config.llm.model,
      });
    } else {
      logger.info("PluginLifecycle", "memory_gate disabled");
    }

    if (llmService && workspaceDir) {
      writeGuardianAuditLog = new WriteGuardianAuditLog(workspaceDir);
      writeGuardian = new WriteGuardian(
        { workspaceDir },
        logger,
        llmService,
        writeGuardianAuditLog
      );
      logger.info("PluginLifecycle", "write_guardian initialized", {
        workspaceDir,
      });
    } else if (llmService) {
      logger.warn("PluginLifecycle", "write_guardian disabled: workspace unavailable", {
        source: workspaceResolution.source,
        reason: workspaceResolution.reason,
      });
    }

    if (config.consolidation.enabled && llmService && workspaceDir) {
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
    } else if (config.consolidation.enabled && llmService) {
      logger.warn("PluginLifecycle", "ConsolidationScheduler disabled: workspace unavailable", {
        source: workspaceResolution.source,
        reason: workspaceResolution.reason,
      });
    } else {
      logger.info("PluginLifecycle", "ConsolidationScheduler disabled");
    }

    if (typeof api.on === "function") {
      api.on("before_message_write", (event: unknown, context?: unknown) => {
        runHookSafely(logger, "before_message_write", () => {
          if (bufferManager) {
            handleBeforeMessageWrite(
              event,
              bufferManager,
              logger,
              context,
              memoryGate,
              writeGuardian,
              config.memoryGate.windowSize,
              reactionService
            );
          } else {
            logger.warn("PluginLifecycle", "Callback skipped: buffer manager missing", {
              hook: "before_message_write",
            });
          }
        });
      });
    }

    registerMessageHook(
      api,
      "message_received",
      (event: unknown, context?: unknown) => {
        runHookSafely(logger, "message_received", () => {
          logger.writeLatestDebugPayload("message_received", event, context);

          logger.debug("PluginLifecycle", "Callback invoked", {
            hook: "message_received",
            hasContext: context !== undefined,
            hasBufferManager: Boolean(bufferManager),
          });

          if (bufferManager) {
            handleMessageReceived(event, bufferManager, logger, context);
            logger.debug("PluginLifecycle", "Callback dispatched", {
              hook: "message_received",
            });
          } else {
            logger.warn("PluginLifecycle", "Callback skipped: buffer manager missing", {
              hook: "message_received",
            });
          }
        });
      }
    );

    registerReflectionCommand(api, logger, writeGuardianAuditLog);

    gatewayLogger.info("[Reflection] Message hooks registered");
    logger.info("PluginLifecycle", "Message hooks registered");

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
