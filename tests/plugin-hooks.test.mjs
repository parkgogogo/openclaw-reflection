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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

test('activate registers reflections command with OpenClaw command object signature', async () => {
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
    registerCommand(command) {
      commands.push(command);
    },
  };

  activate(api);

  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, 'reflections');
  assert.equal(typeof commands[0].description, 'string');
  assert.equal(typeof commands[0].handler, 'function');

  const result = await commands[0].handler();
  assert.match(result.text, /No write_guardian records found|audit log unavailable/);
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

test('activate starts heartbeat logging and tracks hook activity timestamps', async () => {
  const previousInterval = process.env.OPENCLAW_REFLECTION_HEARTBEAT_INTERVAL_MS;
  process.env.OPENCLAW_REFLECTION_HEARTBEAT_INTERVAL_MS = '5';

  const loggerUrl = pathToFileURL(path.join(process.cwd(), 'dist/logger.js')).href;
  const loggerMod = await import(loggerUrl);
  const originalInfo = loggerMod.FileLogger.prototype.info;
  const entries = [];

  loggerMod.FileLogger.prototype.info = function patchedInfo(component, event, details, sessionKey) {
    entries.push({ component, event, details, sessionKey });
    return originalInfo.call(this, component, event, details, sessionKey);
  };

  try {
    const indexUrl = pathToFileURL(path.join(process.cwd(), 'dist/index.js')).href;
    const mod = await import(`${indexUrl}?t=${Date.now()}-heartbeat`);
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

    activate(api);
    await sleep(20);

    const startedEntry = entries.find(
      (entry) => entry.component === 'Heartbeat' && entry.event === 'heartbeat started'
    );
    assert.ok(startedEntry);

    const firstTickEntry = entries.find(
      (entry) => entry.component === 'Heartbeat' && entry.event === 'heartbeat tick'
    );
    assert.ok(firstTickEntry);
    assert.equal(firstTickEntry.details.lastMessageReceivedAt, null);
    assert.equal(firstTickEntry.details.lastBeforeMessageWriteAt, null);

    const receivedHandler = observed.find((entry) => entry.event === 'message_received')?.handler;
    const beforeWriteHandler = observed.find(
      (entry) => entry.event === 'before_message_write'
    )?.handler;

    assert.ok(receivedHandler);
    assert.ok(beforeWriteHandler);

    receivedHandler(
      {
        from: 'discord:channel:heartbeat-room',
        content: 'user message',
        metadata: { to: 'channel:heartbeat-room', messageId: 'hb-u1' },
      },
      {
        channelId: 'discord',
        accountId: 'acct-heartbeat',
        conversationId: 'heartbeat-room',
      }
    );

    beforeWriteHandler(
      {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'assistant reply' }],
        },
      },
      {
        sessionKey: 'agent:main:discord:channel:heartbeat-room',
        agentId: 'main',
      }
    );

    await sleep(20);

    const heartbeatTicks = entries.filter(
      (entry) => entry.component === 'Heartbeat' && entry.event === 'heartbeat tick'
    );
    const updatedTick = heartbeatTicks.find(
      (entry) =>
        typeof entry.details?.lastMessageReceivedAt === 'string' &&
        typeof entry.details?.lastBeforeMessageWriteAt === 'string'
    );

    assert.ok(updatedTick);
  } finally {
    loggerMod.FileLogger.prototype.info = originalInfo;
    if (previousInterval === undefined) {
      delete process.env.OPENCLAW_REFLECTION_HEARTBEAT_INTERVAL_MS;
    } else {
      process.env.OPENCLAW_REFLECTION_HEARTBEAT_INTERVAL_MS = previousInterval;
    }
  }
});
