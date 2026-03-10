import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OpenClawMessageReactionService,
} from '../dist/message-reaction.js';

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

test('OpenClawMessageReactionService executes openclaw message react with expected arguments', async () => {
  const logger = createLogger();
  let receivedCommand = null;

  const service = new OpenClawMessageReactionService(
    logger,
    async (command, args) => {
      receivedCommand = { command, args };
    }
  );

  const result = await service.reactToMessage({
    channelId: 'discord',
    accountId: 'default',
    target: 'channel:123',
    messageId: '456',
    emoji: '📝',
  });

  assert.equal(result, true);
  assert.deepEqual(receivedCommand, {
    command: 'openclaw',
    args: [
      'message',
      'react',
      '--channel',
      'discord',
      '--account',
      'default',
      '--target',
      'channel:123',
      '--message-id',
      '456',
      '--emoji',
      '📝',
    ],
  });
});

test('OpenClawMessageReactionService skips incomplete reaction targets', async () => {
  const logger = createLogger();
  let called = false;

  const service = new OpenClawMessageReactionService(
    logger,
    async () => {
      called = true;
    }
  );

  const result = await service.reactToMessage({
    channelId: 'discord',
    target: '',
    messageId: '456',
    emoji: '📝',
  });

  assert.equal(result, false);
  assert.equal(called, false);
});
