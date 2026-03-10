import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const debugLogPath = path.join(process.cwd(), 'logs', 'debug.json');

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
  ]);
});

test('activate prefers api.on for before_message_write and message_received', async () => {
  const indexUrl = pathToFileURL(path.join(process.cwd(), 'dist/index.js')).href;
  const mod = await import(`${indexUrl}?t=${Date.now()}-legacy`);
  const activate = mod.default;

  const registered = [];
  const observed = [];
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
    on(event, handler) {
      observed.push({ event, handler });
    },
  };

  activate(api);

  assert.deepEqual(
    observed.map((entry) => entry.event),
    ['before_message_write', 'message_received']
  );
  assert.deepEqual(
    registered.map((entry) => entry.event),
    []
  );
});

test('activate registers /reflections command when registerCommand is available', async () => {
  const indexUrl = pathToFileURL(path.join(process.cwd(), 'dist/index.js')).href;
  const mod = await import(`${indexUrl}?t=${Date.now()}-command`);
  const activate = mod.default;

  const commands = [];
  const api = {
    logger: createPluginLogger(),
    config: {
      get(key) {
        if (key === 'memoryGate') return { enabled: false };
        if (key === 'consolidation') return { enabled: false };
        return undefined;
      },
    },
    registerHook() {},
    registerCommand(command, handler) {
      commands.push({ command, handler });
    },
  };

  activate(api);

  assert.equal(commands.length, 1);
  assert.equal(commands[0].command, '/reflections');

  const result = await commands[0].handler();
  assert.match(result, /No write_guardian records found|audit log unavailable/);
});

test('activate writes the latest message_received payload to logs/debug.json in debug mode', async () => {
  await fs.rm(debugLogPath, { force: true });

  const indexUrl = pathToFileURL(path.join(process.cwd(), 'dist/index.js')).href;
  const mod = await import(`${indexUrl}?t=${Date.now()}-debug-payload`);
  const activate = mod.default;

  const observed = [];
  const api = {
    logger: createPluginLogger(),
    config: {
      get(key) {
        if (key === 'logLevel') return 'debug';
        if (key === 'memoryGate') return { enabled: false };
        if (key === 'consolidation') return { enabled: false };
        return undefined;
      },
    },
    registerHook() {},
    on(event, handler) {
      observed.push({ event, handler });
    },
  };

  try {
    activate(api);

    const receivedHandler = observed.find((entry) => entry.event === 'message_received')?.handler;
    assert.ok(receivedHandler);

    receivedHandler(
      {
        from: 'discord:channel:first-room',
        content: 'first payload',
        metadata: { to: 'channel:first-room', messageId: 'm1' },
      },
      {
        channelId: 'discord',
        accountId: 'acct-1',
        conversationId: 'first-room',
      }
    );

    receivedHandler(
      {
        from: 'discord:channel:second-room',
        content: 'second payload',
        metadata: { to: 'channel:second-room', messageId: 'm2' },
      },
      {
        channelId: 'discord',
        accountId: 'acct-2',
        conversationId: 'second-room',
      }
    );

    const debugContent = JSON.parse(await fs.readFile(debugLogPath, 'utf8'));
    assert.deepEqual(debugContent, {
      timestamp: debugContent.timestamp,
      hookName: 'message_received',
      event: {
        from: 'discord:channel:second-room',
        content: 'second payload',
        metadata: { to: 'channel:second-room', messageId: 'm2' },
      },
      hookContext: {
        channelId: 'discord',
        accountId: 'acct-2',
        conversationId: 'second-room',
      },
    });
    assert.equal(typeof debugContent.timestamp, 'string');
  } finally {
    await fs.rm(debugLogPath, { force: true });
  }
});

test('activate does not write logs/debug.json outside debug mode', async () => {
  await fs.rm(debugLogPath, { force: true });

  const indexUrl = pathToFileURL(path.join(process.cwd(), 'dist/index.js')).href;
  const mod = await import(`${indexUrl}?t=${Date.now()}-no-debug-payload`);
  const activate = mod.default;

  const observed = [];
  const api = {
    logger: createPluginLogger(),
    config: {
      get(key) {
        if (key === 'logLevel') return 'info';
        if (key === 'memoryGate') return { enabled: false };
        if (key === 'consolidation') return { enabled: false };
        return undefined;
      },
    },
    registerHook() {},
    on(event, handler) {
      observed.push({ event, handler });
    },
  };

  activate(api);

  const receivedHandler = observed.find((entry) => entry.event === 'message_received')?.handler;
  assert.ok(receivedHandler);

  receivedHandler(
    {
      from: 'discord:channel:room',
      content: 'payload',
      metadata: { to: 'channel:room', messageId: 'm1' },
    },
    {
      channelId: 'discord',
      accountId: 'acct-1',
      conversationId: 'room',
    }
  );

  await assert.rejects(fs.readFile(debugLogPath, 'utf8'), /ENOENT/);
});
