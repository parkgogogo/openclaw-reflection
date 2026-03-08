import test from 'node:test';
import assert from 'node:assert/strict';

import { SessionBufferManager } from '../dist/session-manager.js';
import {
  handleBeforeMessageWrite,
  handleMessageReceived,
} from '../dist/message-handler.js';

function createLogger() {
  const entries = [];
  return {
    entries,
    debug(component, event, details, sessionKey) {
      entries.push({ level: 'debug', component, event, details, sessionKey });
    },
    info(component, event, details, sessionKey) {
      entries.push({ level: 'info', component, event, details, sessionKey });
    },
    warn(component, event, details, sessionKey) {
      entries.push({ level: 'warn', component, event, details, sessionKey });
    },
    error(component, event, details, sessionKey) {
      entries.push({ level: 'error', component, event, details, sessionKey });
    },
  };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('handleBeforeMessageWrite still runs memory gate when fileCurator is unavailable', async () => {
  const logger = createLogger();
  const bufferManager = new SessionBufferManager(10, logger);
  let analyzeCalls = 0;

  const memoryGate = {
    async analyze() {
      analyzeCalls += 1;
      return {
        decision: 'UPDATE_USER',
        reason: 'stable preference',
        candidateFact: 'prefers direct technical feedback',
      };
    },
  };

  handleMessageReceived({
    from: 'discord:channel:room-1',
    content: '请直接指出问题',
    metadata: {
      to: 'channel:room-1',
      messageId: 'u1',
    },
  }, bufferManager, logger, {
    channelId: 'discord',
    accountId: 'default',
    conversationId: 'room-1',
  });

  handleBeforeMessageWrite({
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '后续我会直接指出问题' }],
    },
  }, bufferManager, logger, {
    sessionKey: 's1',
    agentId: 'main',
  }, memoryGate, undefined, 10);

  await flush();

  assert.equal(analyzeCalls, 1);
  assert.ok(
    logger.entries.some((entry) => entry.level === 'warn' && entry.event.includes('UPDATE_* skipped')),
    'expected missing file curator warning after gateway analysis'
  );
});

test('handleBeforeMessageWrite does not duplicate assistant writes for a single event', async () => {
  const logger = createLogger();
  const bufferManager = new SessionBufferManager(10, logger);
  let analyzeCalls = 0;

  const memoryGate = {
    async analyze() {
      analyzeCalls += 1;
      return {
        decision: 'NO_WRITE',
        reason: 'nothing durable',
      };
    },
  };

  const fileCurator = {
    async write() {},
  };

  handleMessageReceived({
    from: 'discord:channel:room-2',
    content: 'hello',
    metadata: {
      to: 'channel:room-2',
      messageId: 'u1',
    },
  }, bufferManager, logger, {
    channelId: 'discord',
    accountId: 'default',
    conversationId: 'room-2',
  });

  handleBeforeMessageWrite({
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'world' }],
    },
  }, bufferManager, logger, {
    sessionKey: 's2',
    agentId: 'main',
  }, memoryGate, fileCurator, 10);

  await flush();

  assert.equal(analyzeCalls, 1);
  assert.equal(bufferManager.getMessages('s2').filter((entry) => entry.role === 'agent').length, 1);
});

test('handleBeforeMessageWrite serializes gateway and guardian work per session', async () => {
  const logger = createLogger();
  const bufferManager = new SessionBufferManager(10, logger);
  let activeWrites = 0;
  let sawConcurrentWrite = false;
  let releaseFirst;
  const firstWrite = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let writeCount = 0;

  const memoryGate = {
    async analyze() {
      return {
        decision: 'UPDATE_USER',
        reason: 'stable preference',
        candidateFact: 'prefers direct technical feedback',
      };
    },
  };

  const fileCurator = {
    async write() {
      writeCount += 1;
      activeWrites += 1;
      if (activeWrites > 1) {
        sawConcurrentWrite = true;
      }
      if (writeCount === 1) {
        await firstWrite;
      }
      activeWrites -= 1;
    },
  };

  handleMessageReceived({
    from: 'discord:channel:room-3',
    content: 'hello',
    metadata: {
      to: 'channel:room-3',
      messageId: 'u1',
    },
  }, bufferManager, logger, {
    channelId: 'discord',
    accountId: 'default',
    conversationId: 'room-3',
  });

  handleBeforeMessageWrite({
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'reply 1' }],
    },
  }, bufferManager, logger, {
    sessionKey: 's3',
    agentId: 'main',
  }, memoryGate, fileCurator, 10);

  handleBeforeMessageWrite({
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'reply 2' }],
    },
  }, bufferManager, logger, {
    sessionKey: 's3',
    agentId: 'main',
  }, memoryGate, fileCurator, 10);

  await flush();
  releaseFirst();
  await flush();
  await flush();

  assert.equal(sawConcurrentWrite, false);
  assert.equal(writeCount, 2);
});

test('handleBeforeMessageWrite ignores non-assistant messages', async () => {
  const logger = createLogger();
  const bufferManager = new SessionBufferManager(10, logger);

  handleBeforeMessageWrite({
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
    },
  }, bufferManager, logger, {
    sessionKey: 's4',
    agentId: 'main',
  });

  await flush();

  assert.equal(bufferManager.getMessages('s4').length, 0);
});

test('handleMessageReceived and handleBeforeMessageWrite converge on the same channel session key', async () => {
  const logger = createLogger();
  const bufferManager = new SessionBufferManager(10, logger);

  handleMessageReceived({
    from: 'discord:channel:room-5',
    content: 'hello from user',
    metadata: {
      to: 'channel:room-5',
      messageId: 'u5',
    },
  }, bufferManager, logger, {
    channelId: 'discord',
    accountId: 'default',
    conversationId: 'room-5',
  });

  handleBeforeMessageWrite({
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'hello from agent' }],
    },
  }, bufferManager, logger, {
    sessionKey: 'agent:main:discord:channel:room-5',
    agentId: 'main',
  });

  await flush();

  const canonicalSessionKey = 'channel:discord:channel:room-5';
  assert.deepEqual(
    bufferManager.getMessages(canonicalSessionKey).map((entry) => ({
      role: entry.role,
      message: entry.message,
    })),
    [
      { role: 'user', message: 'hello from user' },
      { role: 'agent', message: 'hello from agent' },
    ]
  );
  assert.equal(bufferManager.getMessages('agent:main:discord:channel:room-5').length, 0);
  assert.equal(bufferManager.getMessages('conv:discord:default:room-5').length, 0);
});

test('handleMessageReceived logs raw payload and normalized event when debug mode is enabled', () => {
  process.env.OPENCLAW_REFLECTION_DEBUG_EVENTS = '1';

  try {
    const logger = createLogger();
    const bufferManager = new SessionBufferManager(10, logger);

    handleMessageReceived({
      from: 'discord:channel:room-4',
      content: 'hello from payload',
      metadata: {
        to: 'channel:room-4',
        provider: 'discord',
        messageId: 'u4',
      },
    }, bufferManager, logger, {
      channelId: 'discord',
      accountId: 'acct-1',
      conversationId: 'conv-1',
    });

    const debugEntry = logger.entries.find((entry) => entry.event === 'Hook payload debug');
    assert.ok(debugEntry);
    assert.deepEqual(debugEntry.details, {
      hookName: 'message:received',
      rawEvent: {
        from: 'discord:channel:room-4',
        content: 'hello from payload',
        metadata: {
          to: 'channel:room-4',
          provider: 'discord',
          messageId: 'u4',
        },
      },
      hookContext: {
        channelId: 'discord',
        accountId: 'acct-1',
        conversationId: 'conv-1',
      },
      normalizedEvent: {
        accountId: 'acct-1',
        conversationId: 'conv-1',
        from: 'discord:channel:room-4',
        to: 'channel:room-4',
        channelId: 'discord',
        message: {
          id: 'u4',
          content: 'hello from payload',
          channelId: 'discord',
        },
      },
    });
  } finally {
    delete process.env.OPENCLAW_REFLECTION_DEBUG_EVENTS;
  }
});
