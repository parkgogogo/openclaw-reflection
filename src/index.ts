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
  hooks: {
    on: (event: string, handler: (event: unknown) => void) => void;
  };
}

let bufferManager: SessionBufferManager | null = null;
let logger: Logger | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;
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
  bufferManager = new SessionBufferManager(config.bufferSize, config.sessionTTL, logger);

  logger.info('Plugin', 'Reflection plugin registered', {
    bufferSize: config.bufferSize,
    sessionTTL: config.sessionTTL,
    logLevel: config.logLevel,
  });

  // Register hooks
  api.hooks.on('message:received', (event: unknown) => {
    if (bufferManager && logger) {
      handleMessageReceived(event, bufferManager, logger);
    }
  });

  api.hooks.on('message:sent', (event: unknown) => {
    if (bufferManager && logger) {
      handleMessageSent(event, bufferManager, logger);
    }
  });

  api.hooks.on('session:end', (event: unknown) => {
    if (bufferManager && logger) {
      handleSessionEnd(event, bufferManager, logger);
    }
  });

  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }

  // Setup periodic cleanup
  const CLEANUP_INTERVAL = 60000; // 1 minute
  cleanupTimer = setInterval(() => {
    bufferManager?.cleanup();
  }, CLEANUP_INTERVAL);

  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }

  isRegistered = true;
  logger.info('Plugin', 'Hooks registered successfully');
}
