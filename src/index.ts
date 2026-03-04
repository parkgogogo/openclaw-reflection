import { parseConfig } from "./config.js";
import { FileLogger } from "./logger.js";
import { SessionBufferManager } from "./session-manager.js";
import {
  handleMessageReceived,
  handleMessageSent,
  handleSessionEnd,
} from "./message-handler.js";
import type { PluginConfig } from "./types.js";
import * as path from "path";
import * as url from "url";

type LoggerMethod = (message: string, ...args: unknown[]) => void;

interface PluginLogger {
  debug: LoggerMethod;
  info: LoggerMethod;
  warn: LoggerMethod;
  error: LoggerMethod;
}

interface PluginAPI {
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
}

let bufferManager: SessionBufferManager | null = null;
let gatewayLogger: PluginLogger | null = null;
let fileLogger: FileLogger | null = null;
let isRegistered = false;

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

  // Use gateway logger for plugin lifecycle events.
  gatewayLogger = api.logger;

  const config: PluginConfig = parseConfig(api);

  // Determine plugin root directory for file logs.
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pluginRootDir = path.resolve(__dirname, "..");

  // Use file logger for detailed runtime events and lifecycle parity with gateway logs.
  const runtimeFileLogger = new FileLogger(pluginRootDir, config.logLevel);
  fileLogger = runtimeFileLogger;

  gatewayLogger.info("[Reflection] Plugin starting...");
  runtimeFileLogger.info("PluginLifecycle", "Plugin starting");

  gatewayLogger.info("[Reflection] Configuration loaded", {
    bufferSize: config.bufferSize,
    logLevel: config.logLevel,
  });
  runtimeFileLogger.info("PluginLifecycle", "Configuration loaded", {
    bufferSize: config.bufferSize,
    logLevel: config.logLevel,
  });

  gatewayLogger.info("[Reflection] File logger initialized");
  runtimeFileLogger.info("PluginLifecycle", "File logger initialized");

  bufferManager = new SessionBufferManager(
    config.bufferSize,
    runtimeFileLogger
  );

  gatewayLogger.info("[Reflection] SessionBufferManager initialized");
  runtimeFileLogger.info(
    "PluginLifecycle",
    "SessionBufferManager initialized",
    {
      bufferSize: config.bufferSize,
    }
  );

  // Register message hooks via typed hook runner first.
  // This path does not depend on internal hook sessionKey gating.
  if (typeof api.on === "function") {
    api.on("message_received", (event: unknown, context?: unknown) => {
      if (bufferManager) {
        handleMessageReceived(event, bufferManager, runtimeFileLogger, context);
      }
    });

    api.on("message_sent", (event: unknown, context?: unknown) => {
      if (bufferManager) {
        handleMessageSent(event, bufferManager, runtimeFileLogger, context);
      }
    });

    gatewayLogger.info("[Reflection] Typed message hooks registered");
    runtimeFileLogger.info("PluginLifecycle", "Typed message hooks registered");
  }

  api.registerHook(
    "command:new",
    (event: unknown, context?: unknown) => {
      if (bufferManager) {
        handleSessionEnd(
          event,
          bufferManager,
          runtimeFileLogger,
          "command:new",
          context
        );
      }
    },
    { name: "reflection-command-new" }
  );

  api.registerHook(
    "command:reset",
    (event: unknown, context?: unknown) => {
      if (bufferManager) {
        handleSessionEnd(
          event,
          bufferManager,
          runtimeFileLogger,
          "command:reset",
          context
        );
      }
    },
    { name: "reflection-command-reset" }
  );

  isRegistered = true;
  gatewayLogger.info(
    "[Reflection] Plugin registered successfully, all hooks active"
  );
  runtimeFileLogger.info(
    "PluginLifecycle",
    "Plugin registered successfully, all hooks active"
  );
}
