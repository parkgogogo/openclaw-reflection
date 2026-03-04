import { parseConfig } from './config.js';
import { Logger } from './logger.js';
import { SessionBufferManager } from './session-manager.js';
import { handleMessageReceived, handleMessageSent, handleSessionEnd } from './message-handler.js';
import type { PluginConfig } from './types.js';
import * as path from 'path';
import * as url from 'url';

interface PluginAPI {
  config?: {
    get?: (key: string) => unknown;
  };
  registerHook: (event: string, handler: (event: unknown) => void) => void;
}

let bufferManager: SessionBufferManager | null = null;
let logger: Logger | null = null;
let isRegistered = false;

export function register(api: PluginAPI): void {
  if (isRegistered) {
    logger?.warn('Plugin', 'register called more than once, skipping duplicate registration');
    return;
  }

  const config: PluginConfig = parseConfig(api);

  // Determine plugin root directory
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pluginRootDir = path.resolve(__dirname, '..');

  logger = new Logger(pluginRootDir, config.logLevel);
  bufferManager = new SessionBufferManager(config.bufferSize, logger);

  logger.info('Plugin', 'Reflection plugin registered', {
    bufferSize: config.bufferSize,
    logLevel: config.logLevel,
  });

  // Register hooks
  api.registerHook('message:received', (event: unknown) => {
    if (bufferManager && logger) {
      handleMessageReceived(event, bufferManager, logger);
    }
  });

  api.registerHook('message:sent', (event: unknown) => {
    if (bufferManager && logger) {
      handleMessageSent(event, bufferManager, logger);
    }
  });

  api.registerHook('session:end', (event: unknown) => {
    if (bufferManager && logger) {
      handleSessionEnd(event, bufferManager, logger);
    }
  });

  isRegistered = true;
  logger.info('Plugin', 'Hooks registered successfully');
}
