import type { SessionBufferManager } from './session-manager.js';
import type { Logger } from './logger.js';
import type { ReflectionMessage } from './types.js';
import { ulid } from 'ulid';

interface MessageEvent {
  message?: {
    id?: string;
    content?: string;
    channelId?: string;
  };
  sessionKey?: string;
  channelId?: string;
}

function createReflectionMessage(
  event: MessageEvent,
  role: 'user' | 'assistant',
  sessionKey: string,
  channelId: string
): ReflectionMessage {
  return {
    id: ulid(),
    role,
    content: event.message?.content ?? '',
    timestamp: Date.now(),
    sessionKey,
    channelId,
    metadata: {
      messageId: event.message?.id,
    },
  };
}

export function handleMessageReceived(
  event: MessageEvent,
  bufferManager: SessionBufferManager,
  logger: Logger
): void {
  const sessionKey = event.sessionKey ?? 'unknown';
  const channelId = event.channelId ?? event.message?.channelId ?? 'unknown';

  logger.debug('MessageHandler', 'Message received', { 
    sessionKey, 
    channelId,
    hasContent: !!event.message?.content 
  }, sessionKey);

  const message = createReflectionMessage(event, 'user', sessionKey, channelId);
  bufferManager.push(sessionKey, message);

  logger.debug('MessageHandler', 'User message stored', { messageId: message.id }, sessionKey);
}

export function handleMessageSent(
  event: MessageEvent,
  bufferManager: SessionBufferManager,
  logger: Logger
): void {
  const sessionKey = event.sessionKey ?? 'unknown';
  const channelId = event.channelId ?? event.message?.channelId ?? 'unknown';

  logger.debug('MessageHandler', 'Message sent', { 
    sessionKey, 
    channelId,
    hasContent: !!event.message?.content 
  }, sessionKey);

  const message = createReflectionMessage(event, 'assistant', sessionKey, channelId);
  bufferManager.push(sessionKey, message);

  logger.debug('MessageHandler', 'Assistant message stored', { messageId: message.id }, sessionKey);
}

export function handleSessionEnd(
  event: { sessionKey?: string },
  bufferManager: SessionBufferManager,
  logger: Logger
): void {
  const sessionKey = event.sessionKey ?? 'unknown';

  logger.info('MessageHandler', 'Session ended, clearing buffer', { sessionKey }, sessionKey);
  bufferManager.clearSession(sessionKey);
}
