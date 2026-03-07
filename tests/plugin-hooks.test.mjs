import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function createPluginLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test('activate registers message hooks through registerHook when api.on is unavailable', async () => {
  const indexUrl = pathToFileURL(path.join(process.cwd(), 'dist/index.js')).href;
  const mod = await import(`${indexUrl}?t=${Date.now()}`);
  const activate = mod.default;

  const registered = [];
  const api = {
    logger: createPluginLogger(),
    config: {
      get(key) {
        if (key === 'memoryGate') return { enabled: false };
        if (key === 'consolidation') return { enabled: false };
        return undefined;
      },
    },
    registerHook(event, handler) {
      registered.push({ event, handler });
    },
  };

  activate(api);

  const events = registered.map((entry) => entry.event);
  assert.deepEqual(events, [
    'message:received',
    'message:sent',
    'command:new',
    'command:reset',
  ]);
});
