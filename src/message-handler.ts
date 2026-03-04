import type { SessionBufferManager } from "./session-manager.js";
import type { Logger, ReflectionMessage } from "./types.js";
import { ulid } from "ulid";

interface MessageEvent {
  message?: {
    id?: string;
    content?: string;
    text?: string;
    channelId?: string;
  };
  content?: string;
  text?: string;
  from?: string;
  to?: string;
  success?: boolean;
  sessionKey?: string;
  sessionId?: string;
  conversationId?: string;
  accountId?: string;
  channelId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed !== "" ? trimmed : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function buildConversationSessionKey(event: MessageEvent): string | null {
  if (!event.conversationId) {
    return null;
  }

  const channelId = event.channelId ?? "unknown";
  const accountId = event.accountId ?? "default";
  return `conv:${channelId}:${accountId}:${event.conversationId}`;
}

function normalizeMessageEvent(event: unknown, hookContext?: unknown): MessageEvent {
  if (!isRecord(event)) {
    const contextRecord = toRecord(hookContext);
    return {
      sessionKey: getNonEmptyString(contextRecord?.sessionKey),
      sessionId: getNonEmptyString(contextRecord?.sessionId),
      channelId: getNonEmptyString(contextRecord?.channelId),
      conversationId: getNonEmptyString(contextRecord?.conversationId),
      accountId: getNonEmptyString(contextRecord?.accountId),
    };
  }

  const rawMessage = toRecord(event.message);
  const rawEventContext = toRecord(event.context);
  const rawHookContext = toRecord(hookContext);
  const rawContext = rawEventContext ?? rawHookContext;
  const rawSession = toRecord(event.session);
  const rawMetadata = toRecord(event.metadata);

  // Get content from either message.content, message.text, event.content, or event.text
  const content = rawMessage
    ? getNonEmptyString(rawMessage.content) ??
      getNonEmptyString(rawMessage.text)
    : getNonEmptyString(event.content) ??
      getNonEmptyString(event.text) ??
      getNonEmptyString(event.bodyForAgent) ??
      getNonEmptyString(event.body) ??
      getNonEmptyString(rawContext?.content) ??
      getNonEmptyString(rawContext?.text) ??
      getNonEmptyString(event.transcript);

  const sessionKey =
    getNonEmptyString(event.sessionKey) ??
    getNonEmptyString(rawContext?.sessionKey) ??
    getNonEmptyString(rawSession?.key);

  const sessionId =
    getNonEmptyString(event.sessionId) ??
    getNonEmptyString(rawContext?.sessionId) ??
    getNonEmptyString(rawSession?.id);

  const channelId =
    getNonEmptyString(event.channelId) ??
    getNonEmptyString(rawContext?.channelId) ??
    getNonEmptyString(rawMetadata?.channelId);

  const conversationId =
    getNonEmptyString(event.conversationId) ??
    getNonEmptyString(rawContext?.conversationId);

  const accountId =
    getNonEmptyString(event.accountId) ??
    getNonEmptyString(rawContext?.accountId);

  const from =
    getNonEmptyString(event.from) ??
    getNonEmptyString(rawMetadata?.from) ??
    getNonEmptyString(rawContext?.from);

  const to =
    getNonEmptyString(event.to) ??
    getNonEmptyString(rawMetadata?.to) ??
    getNonEmptyString(rawContext?.to);

  const success =
    typeof event.success === "boolean"
      ? event.success
      : typeof rawMetadata?.success === "boolean"
      ? rawMetadata.success
      : undefined;

  const messageId =
    getNonEmptyString(rawMessage?.id) ??
    getNonEmptyString(rawContext?.messageId) ??
    getNonEmptyString(rawMetadata?.messageId);

  const messageChannelId =
    getNonEmptyString(rawMessage?.channelId) ??
    getNonEmptyString(rawContext?.channelId) ??
    getNonEmptyString(rawMetadata?.channelId);

  return {
    sessionKey,
    sessionId,
    conversationId,
    accountId,
    from,
    to,
    success,
    channelId,
    message:
      content !== undefined
        ? {
            id: messageId,
            content,
            channelId: messageChannelId,
          }
        : undefined,
  };
}

function resolveSessionKey(
  event: MessageEvent,
  logger: Logger,
  hookName: string
): string | null {
  if (event.sessionKey) {
    return event.sessionKey;
  }

  if (event.sessionId) {
    logger.warn("MessageHandler", "SessionKey missing, fallback to sessionId", {
      hookName,
      sessionId: event.sessionId,
    });
    return event.sessionId;
  }

  const conversationSessionKey = buildConversationSessionKey(event);
  if (conversationSessionKey) {
    logger.info("MessageHandler", "SessionKey missing, fallback to conversationId", {
      hookName,
      conversationId: event.conversationId,
      channelId: event.channelId,
      accountId: event.accountId,
      derivedSessionKey: conversationSessionKey,
    });
    return conversationSessionKey;
  }

  logger.warn("MessageHandler", "Skip event without sessionKey", { hookName });
  return null;
}

function resolveChannelId(event: MessageEvent): string {
  return event.channelId ?? event.message?.channelId ?? "unknown";
}

function createReflectionMessage(
  event: MessageEvent,
  role: "user" | "agent",
  sessionKey: string,
  channelId: string
): ReflectionMessage {
  const metadata: ReflectionMessage["metadata"] = {
    messageId: event.message?.id,
    from: event.from,
    to: event.to,
    success: event.success,
  };

  return {
    id: ulid(),
    role,
    message: event.message?.content ?? "",
    timestamp: Date.now(),
    sessionKey,
    channelId,
    metadata,
  };
}

// index.ts passes FileLogger here; handlers should only use this injected logger.
export function handleMessageReceived(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookContext?: unknown
): void {
  const normalizedEvent = normalizeMessageEvent(event, hookContext);
  const sessionKey = resolveSessionKey(
    normalizedEvent,
    logger,
    "message:received"
  );

  if (!sessionKey) {
    return;
  }

  const channelId = resolveChannelId(normalizedEvent);

  const message = createReflectionMessage(
    normalizedEvent,
    "user",
    sessionKey,
    channelId
  );

  logger.info(
    "MessageHandler",
    "Buffer message snapshot",
    {
      hookName: "message:received",
      bufferMessage: message,
    },
    sessionKey
  );

  bufferManager.push(sessionKey, message);
}

export function handleMessageSent(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookContext?: unknown
): void {
  const normalizedEvent = normalizeMessageEvent(event, hookContext);
  const sessionKey = resolveSessionKey(normalizedEvent, logger, "message:sent");

  if (!sessionKey) {
    return;
  }

  const channelId = resolveChannelId(normalizedEvent);

  const message = createReflectionMessage(
    normalizedEvent,
    "agent",
    sessionKey,
    channelId
  );

  logger.info(
    "MessageHandler",
    "Buffer message snapshot",
    {
      hookName: "message:sent",
      bufferMessage: message,
    },
    sessionKey
  );

  bufferManager.push(sessionKey, message);
}

export function handleSessionEnd(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookName = "session:end",
  hookContext?: unknown
): void {
  const normalizedEvent = normalizeMessageEvent(event, hookContext);
  const sessionKey = resolveSessionKey(normalizedEvent, logger, hookName);

  if (!sessionKey) {
    return;
  }

  logger.info(
    "MessageHandler",
    "Session cleared by lifecycle command/hook",
    { sessionKey, hookName },
    sessionKey
  );
  bufferManager.clearSession(sessionKey);
}
