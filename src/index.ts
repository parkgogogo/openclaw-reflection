import { parseConfig } from './config.js';
import { SessionBufferManager } from './session-manager.js';
import { handleMessageReceived, handleMessageSent, handleSessionEnd } from './message-handler.js';
import type { PluginConfig, LogLevel, Logger } from './types.js';

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
  registerHook: (event: string, handler: (event: unknown) => void) => void;
}

let bufferManager: SessionBufferManager | null = null;
let pluginLogger: PluginLogger | null = null;
let isRegistered = false;

// Create a leveled logger wrapper that respects config
function createLeveledLogger(baseLogger: PluginLogger, level: LogLevel): Logger {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const minLevel = levels[level] ?? 1;
  
  return {
    debug: (component: string, event: string, details?: Record<string, unknown>, sessionKey?: string) => {
      if (levels.debug >= minLevel) {
        baseLogger.debug(`[Reflection:${component}] ${event}`, { ...details, sessionKey });
      }
    },
    info: (component: string, event: string, details?: Record<string, unknown>, sessionKey?: string) => {
      if (levels.info >= minLevel) {
        baseLogger.info(`[Reflection:${component}] ${event}`, { ...details, sessionKey });
      }
    },
    warn: (component: string, event: string, details?: Record<string, unknown>, sessionKey?: string) => {
      if (levels.warn >= minLevel) {
        baseLogger.warn(`[Reflection:${component}] ${event}`, { ...details, sessionKey });
      }
    },
    error: (component: string, event: string, details?: Record<string, unknown>, sessionKey?: string) => {
      if (levels.error >= minLevel) {
        baseLogger.error(`[Reflection:${component}] ${event}`, { ...details, sessionKey });
      }
    },
  };
}

export function register(api: PluginAPI): void {
  if (isRegistered) {
    pluginLogger?.warn('[Reflection] register called more than once, skipping duplicate registration');
    return;
  }

  // Use gateway's logger
  pluginLogger = api.logger;
  
  pluginLogger.info('[Reflection] Plugin starting...');

  const config: PluginConfig = parseConfig(api);
  
  pluginLogger.info('[Reflection] Configuration loaded', { 
    bufferSize: config.bufferSize, 
    logLevel: config.logLevel 
  });

  // Create a wrapper that respects log level from config
  const logger = createLeveledLogger(pluginLogger, config.logLevel);
  
  bufferManager = new SessionBufferManager(config.bufferSize, logger);

  pluginLogger.info('[Reflection] SessionBufferManager initialized');

  // Register hooks
  api.registerHook('message:received', (event: unknown) => {
    if (bufferManager) {
      handleMessageReceived(event, bufferManager, logger);
    }
  });

  api.registerHook('message:sent', (event: unknown) => {
    if (bufferManager) {
      handleMessageSent(event, bufferManager, logger);
    }
  });

  api.registerHook('session:end', (event: unknown) => {
    if (bufferManager) {
      handleSessionEnd(event, bufferManager, logger);
    }
  });

  isRegistered = true;
  pluginLogger.info('[Reflection] Plugin registered successfully, all hooks active');
}
