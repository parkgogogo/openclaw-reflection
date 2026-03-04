import type { PluginConfig } from './types.js';

interface PluginAPI {
  config?: {
    get?: (key: string) => unknown;
  };
}

export function parseConfig(api: PluginAPI): PluginConfig {
  const config = api.config ?? {};

  const bufferSize = config.get?.('bufferSize');
  const sessionTTL = config.get?.('sessionTTL');
  const logLevel = config.get?.('logLevel');

  return {
    bufferSize: typeof bufferSize === 'number' ? bufferSize : 100,
    sessionTTL: typeof sessionTTL === 'number' ? sessionTTL : 3600000,
    logLevel: typeof logLevel === 'string' ? logLevel : 'info',
  };
}
