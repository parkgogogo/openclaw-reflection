import { parseConfig } from './config.js';
import { FileLogger } from './logger.js';
import { SessionBufferManager } from './session-manager.js';
import { handleMessageReceived, handleMessageSent, handleSessionEnd } from './message-handler.js';
import type { PluginConfig } from './types.js';
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
  registerHook: (event: string, handler: (event: unknown) => void, options?: { name?: string }) => void;
}

let bufferManager: SessionBufferManager | null = null;
let gatewayLogger: PluginLogger | null = null;
let isRegistered = false;

export default function activate(api: PluginAPI): void {
  if (isRegistered) {
    gatewayLogger?.warn('[Reflection] register called more than once, skipping duplicate registration');
    return;
  }

  // Use gateway logger only for plugin lifecycle events.
  gatewayLogger = api.logger;

  gatewayLogger.info('[Reflection] Plugin starting...');

  const config: PluginConfig = parseConfig(api);

  gatewayLogger.info('[Reflection] Configuration loaded', {
    bufferSize: config.bufferSize,
    logLevel: config.logLevel,
  });

  // Determine plugin root directory for file logs.
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pluginRootDir = path.resolve(__dirname, '..');

  // Use file logger for detailed runtime events.
  const fileLogger = new FileLogger(pluginRootDir, config.logLevel);
  gatewayLogger.info('[Reflection] File logger initialized');

  bufferManager = new SessionBufferManager(config.bufferSize, fileLogger);

  gatewayLogger.info('[Reflection] SessionBufferManager initialized');

  // Register hooks.
  api.registerHook('message:received', (event: unknown) => {
    if (bufferManager) {
      handleMessageReceived(event, bufferManager, fileLogger);
    }
  }, { name: 'reflection-message-received' });

  api.registerHook('message:sent', (event: unknown) => {
    if (bufferManager) {
      handleMessageSent(event, bufferManager, fileLogger);
    }
  }, { name: 'reflection-message-sent' });

  api.registerHook('session:end', (event: unknown) => {
    if (bufferManager) {
      handleSessionEnd(event, bufferManager, fileLogger);
    }
  }, { name: 'reflection-session-end' });

  isRegistered = true;
  gatewayLogger.info('[Reflection] Plugin registered successfully, all hooks active');
}
