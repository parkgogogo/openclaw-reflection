import { parseConfig } from './config.js';
import { FileLogger } from './logger.js';
import { SessionBufferManager } from './session-manager.js';
import { handleMessageReceived, handleMessageSent, handleSessionEnd } from './message-handler.js';
import type { PluginConfig, LogLevel, Logger } from './types.js';
import * as path from 'path';
import * as url from 'url';

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
let gatewayLogger: PluginLogger | null = null;
let isRegistered = false;

// Combine gateway logger and file logger
class CombinedLogger implements Logger {
  private gateway: PluginLogger;
  private file: FileLogger;
  private level: LogLevel;

  constructor(gateway: PluginLogger, file: FileLogger, level: LogLevel) {
    this.gateway = gateway;
    this.file = file;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.level];
  }

  debug(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void {
    if (!this.shouldLog('debug')) return;
    this.file.debug(component, event, details, sessionKey);
  }

  info(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void {
    if (!this.shouldLog('info')) return;
    this.file.info(component, event, details, sessionKey);
  }

  warn(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void {
    if (!this.shouldLog('warn')) return;
    this.file.warn(component, event, details, sessionKey);
  }

  error(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void {
    if (!this.shouldLog('error')) return;
    this.file.error(component, event, details, sessionKey);
  }
}

export function activate(api: PluginAPI): void {
  if (isRegistered) {
    gatewayLogger?.warn('[Reflection] register called more than once, skipping duplicate registration');
    return;
  }

  // Use gateway's logger for lifecycle logging
  gatewayLogger = api.logger;
  
  gatewayLogger.info('[Reflection] Plugin starting...');

  const config: PluginConfig = parseConfig(api);
  
  gatewayLogger.info('[Reflection] Configuration loaded', { 
    bufferSize: config.bufferSize, 
    logLevel: config.logLevel 
  });

  // Determine plugin root directory for file logs
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pluginRootDir = path.resolve(__dirname, '..');

  // File logger for detailed debugging
  const fileLogger = new FileLogger(pluginRootDir, config.logLevel);
  gatewayLogger.info('[Reflection] File logger initialized');

  // Combined logger: gateway for lifecycle, file for details
  const logger = new CombinedLogger(gatewayLogger, fileLogger, config.logLevel);
  
  bufferManager = new SessionBufferManager(config.bufferSize, logger);

  gatewayLogger.info('[Reflection] SessionBufferManager initialized');

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
  gatewayLogger.info('[Reflection] Plugin registered successfully, all hooks active');
}
