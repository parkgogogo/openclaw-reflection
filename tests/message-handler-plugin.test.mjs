import test from 'node:test';
import assert from 'node:assert/strict';

import { SessionBufferManager } from '../dist/session-manager.js';
import {
  handleMessageReceived,
  handleMessageSent,
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

test('handleMessageSent still runs memory gate when fileCurator is unavailable', async () => {
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
    sessionKey: 's1',
    channelId: 'c1',
    message: { id: 'u1', content: '请直接指出问题' },
  }, bufferManager, logger);

  handleMessageSent({
    sessionKey: 's1',
    channelId: 'c1',
    message: { id: 'a1', content: '后续我会直接指出问题' },
  }, bufferManager, logger, undefined, memoryGate, undefined, 10);

  await flush();

  assert.equal(analyzeCalls, 1);
  assert.ok(
    logger.entries.some((entry) => entry.level === 'warn' && entry.event.includes('UPDATE_* skipped')),
    'expected missing file curator warning after gateway analysis'
  );
});

test('handleMessageSent deduplicates repeated agent messages by message id', async () => {
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
    sessionKey: 's2',
    channelId: 'c1',
    message: { id: 'u1', content: 'hello' },
  }, bufferManager, logger);

  const event = {
    sessionKey: 's2',
    channelId: 'c1',
    message: { id: 'a1', content: 'world' },
  };

  handleMessageSent(event, bufferManager, logger, undefined, memoryGate, fileCurator, 10);
  handleMessageSent(event, bufferManager, logger, undefined, memoryGate, fileCurator, 10);

  await flush();

  assert.equal(analyzeCalls, 1);
});

test('handleMessageSent serializes gateway and guardian work per session', async () => {
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
    sessionKey: 's3',
    channelId: 'c1',
    message: { id: 'u1', content: 'hello' },
  }, bufferManager, logger);

  handleMessageSent({
    sessionKey: 's3',
    channelId: 'c1',
    message: { id: 'a1', content: 'reply 1' },
  }, bufferManager, logger, undefined, memoryGate, fileCurator, 10);

  handleMessageSent({
    sessionKey: 's3',
    channelId: 'c1',
    message: { id: 'a2', content: 'reply 2' },
  }, bufferManager, logger, undefined, memoryGate, fileCurator, 10);

  await flush();
  releaseFirst();
  await flush();
  await flush();

  assert.equal(sawConcurrentWrite, false);
  assert.equal(writeCount, 2);
});
