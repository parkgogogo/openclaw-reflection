import type { SessionBufferManager } from './session-manager.js';
import type { Logger, ReflectionMessage } from './types.js';
import { ulid } from 'ulid';

interface MessageEvent {
  message?: {
    id?: string;
    content?: string;
    text?: string;
    channelId?: string;
  };
  content?: string;
  text?: string;
  sessionKey?: string;
  channelId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMessageEvent(event: unknown): MessageEvent {
  if (!isRecord(event)) {
    return {};
  }

  const rawMessage = isRecord(event.message) ? event.message : undefined;
  
  // Get content from either message.content, message.text, event.content, or event.text
  const content = rawMessage 
    ? (typeof rawMessage.content === 'string' ? rawMessage.content : typeof rawMessage.text === 'string' ? rawMessage.text : undefined)
    : (typeof event.content === 'string' ? event.content : typeof event.text === 'string' ? event.text : undefined);

  return {
    sessionKey: typeof event.sessionKey === 'string' && event.sessionKey.trim() !== '' ? event.sessionKey : undefined,
    channelId: typeof event.channelId === 'string' && event.channelId.trim() !== '' ? event.channelId : undefined,
    message: content !== undefined
      ? {
          id: rawMessage && typeof rawMessage.id === 'string' ? rawMessage.id : undefined,
          content,
          channelId: rawMessage && typeof rawMessage.channelId === 'string' ? rawMessage.channelId : undefined,
        }
      : undefined,
  };
}

function resolveSessionKey(event: MessageEvent, logger: Logger, hookName: string): string | null {
  if (event.sessionKey) {
    return event.sessionKey;
  }

  logger.warn('MessageHandler', 'Skip event without sessionKey', { hookName });
  return null;
}

function resolveChannelId(event: MessageEvent): string {
  return event.channelId ?? event.message?.channelId ?? 'unknown';
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

export function handleMessageReceived(event: unknown, bufferManager: SessionBufferManager, logger: Logger): void {
  const normalizedEvent = normalizeMessageEvent(event);
  const sessionKey = resolveSessionKey(normalizedEvent, logger, 'message:received');

  if (!sessionKey) {
    return;
  }

  const channelId = resolveChannelId(normalizedEvent);

  logger.debug(
    'MessageHandler',
    'Message received',
    {
      sessionKey,
      channelId,
      hasContent: !!normalizedEvent.message?.content,
    },
    sessionKey
  );

  const message = createReflectionMessage(normalizedEvent, 'user', sessionKey, channelId);
  bufferManager.push(sessionKey, message);

  logger.debug('MessageHandler', 'User message stored', { messageId: message.id }, sessionKey);
}

export function handleMessageSent(event: unknown, bufferManager: SessionBufferManager, logger: Logger): void {
  const normalizedEvent = normalizeMessageEvent(event);
  const sessionKey = resolveSessionKey(normalizedEvent, logger, 'message:sent');

  if (!sessionKey) {
    return;
  }

  const channelId = resolveChannelId(normalizedEvent);

  logger.debug(
    'MessageHandler',
    'Message sent',
    {
      sessionKey,
      channelId,
      hasContent: !!normalizedEvent.message?.content,
    },
    sessionKey
  );

  const message = createReflectionMessage(normalizedEvent, 'assistant', sessionKey, channelId);
  bufferManager.push(sessionKey, message);

  logger.debug('MessageHandler', 'Assistant message stored', { messageId: message.id }, sessionKey);
}

export function handleSessionEnd(event: unknown, bufferManager: SessionBufferManager, logger: Logger): void {
  const normalizedEvent = normalizeMessageEvent(event);
  const sessionKey = resolveSessionKey(normalizedEvent, logger, 'session:end');

  if (!sessionKey) {
    return;
  }

  logger.info('MessageHandler', 'Session ended, clearing buffer', { sessionKey }, sessionKey);
  bufferManager.clearSession(sessionKey);
}
