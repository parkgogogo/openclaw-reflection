import type { SessionBufferManager } from "./session-manager.js";
import type {
  Logger,
  ManagedFileName,
  MessageHookContext,
  MessageReactionInput,
  MessageReactionService,
  MessageReceivedHookEvent,
  ReflectionMessage,
} from "./types.js";
import { MemoryGateAnalyzer, type MemoryGateOutput } from "./memory-gate/index.js";
import { WriteGuardian } from "./write-guardian/index.js";
import { ulid } from "ulid";

const DEFAULT_MEMORY_GATE_WINDOW_SIZE = 10;

interface ManagedWriteRecorder {
  recordManagedWrite(input: {
    fileName: ManagedFileName;
    text: string;
    provenance: {
      decision: MemoryGateOutput["decision"];
      reason: string;
      recordedAt: string;
      sessionKey?: string;
      sourceMessageId?: string;
    };
  }): Promise<unknown>;
}

interface MessageEvent {
  role?: string;
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

interface BeforeMessageWriteEvent {
  message?: {
    role?: string;
    content?: unknown;
    text?: string;
    timestamp?: number;
  };
  sessionKey?: string;
}

function isEventDebugEnabled(): boolean {
  const value = process.env.OPENCLAW_REFLECTION_DEBUG_EVENTS;
  if (typeof value !== "string") {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return (
    normalizedValue === "1" ||
    normalizedValue === "true" ||
    normalizedValue === "yes" ||
    normalizedValue === "on"
  );
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

function extractTextFromMessageContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    return getNonEmptyString(content);
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const textParts = content
    .map((entry) => {
      const record = toRecord(entry);
      if (record?.type !== "text") {
        return undefined;
      }

      return getNonEmptyString(record.text);
    })
    .filter((entry): entry is string => entry !== undefined);

  if (textParts.length === 0) {
    return undefined;
  }

  return textParts.join("\n");
}

function deriveChannelIdFromSessionKey(sessionKey: string | undefined): string | undefined {
  const normalized = getNonEmptyString(sessionKey);
  if (!normalized) {
    return undefined;
  }

  const parts = normalized.split(":");
  if (parts.length >= 3 && parts[0] === "agent") {
    return getNonEmptyString(parts[2]);
  }

  return undefined;
}

function deriveChannelIdFromAddress(address: string | undefined): string | undefined {
  const normalized = getNonEmptyString(address);
  if (!normalized) {
    return undefined;
  }

  const parts = normalized.split(":");
  if (parts.length >= 2) {
    return getNonEmptyString(parts[0]);
  }

  return undefined;
}

function deriveConversationTargetFromSessionKey(sessionKey: string | undefined): string | undefined {
  const normalized = getNonEmptyString(sessionKey);
  if (!normalized) {
    return undefined;
  }

  const parts = normalized.split(":");
  if (parts.length >= 5 && parts[0] === "agent") {
    return getNonEmptyString(parts.slice(3).join(":"));
  }

  return undefined;
}

function deriveConversationTargetFromAddress(address: string | undefined): string | undefined {
  const normalized = getNonEmptyString(address);
  if (!normalized) {
    return undefined;
  }

  const parts = normalized.split(":");
  if (parts.length >= 2) {
    return getNonEmptyString(parts.slice(1).join(":"));
  }

  return undefined;
}

function sanitizeDebugValue(
  value: unknown,
  depth = 0
): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (depth >= 4) {
    return "[MaxDepth]";
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeDebugValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (isRecord(value)) {
    const sanitizedEntries = Object.entries(value)
      .slice(0, 40)
      .map(([key, nestedValue]) => [key, sanitizeDebugValue(nestedValue, depth + 1)] as const)
      .filter(([, nestedValue]) => nestedValue !== undefined);

    return Object.fromEntries(sanitizedEntries);
  }

  return String(value);
}

export function logHookPayloadDebug(
  logger: Logger,
  hookName: string,
  event: unknown,
  hookContext: unknown,
  normalizedEvent?: MessageEvent
): void {
  if (!isEventDebugEnabled()) {
    return;
  }

  const details: Record<string, unknown> = {
    hookName,
    rawEvent: sanitizeDebugValue(event),
    hookContext: sanitizeDebugValue(hookContext),
  };

  if (normalizedEvent !== undefined) {
    details.normalizedEvent = sanitizeDebugValue(normalizedEvent);
  }

  logger.info("MessageHandler", "Hook payload debug", details);
}

function buildChannelSessionKey(event: MessageEvent): string | null {
  const channelId =
    event.channelId ??
    event.message?.channelId ??
    deriveChannelIdFromSessionKey(event.sessionKey) ??
    deriveChannelIdFromAddress(event.from);

  const conversationTarget =
    event.to ??
    event.conversationId ??
    deriveConversationTargetFromAddress(event.from) ??
    deriveConversationTargetFromSessionKey(event.sessionKey);

  if (!channelId || !conversationTarget) {
    return null;
  }

  return `channel:${channelId}:${conversationTarget}`;
}

function normalizeReceivedEvent(
  event: unknown,
  hookContext?: unknown
): MessageEvent {
  if (!isRecord(event)) {
    const contextRecord = toRecord(hookContext) as MessageHookContext | undefined;
    return {
      channelId: getNonEmptyString(contextRecord?.channelId),
      conversationId: getNonEmptyString(contextRecord?.conversationId),
      accountId: getNonEmptyString(contextRecord?.accountId),
    };
  }

  const receivedEvent = event as MessageReceivedHookEvent;
  const contextRecord = toRecord(hookContext) as MessageHookContext | undefined;
  const rawMetadata = toRecord(receivedEvent.metadata);
  const content = getNonEmptyString(receivedEvent.content);
  const channelId = getNonEmptyString(contextRecord?.channelId);
  const conversationId = getNonEmptyString(contextRecord?.conversationId);
  const accountId = getNonEmptyString(contextRecord?.accountId);
  const from = getNonEmptyString(receivedEvent.from);
  const to = getNonEmptyString(rawMetadata?.to);
  const messageId = getNonEmptyString(rawMetadata?.messageId);

  return {
    conversationId,
    accountId,
    from,
    to,
    channelId,
    message:
      content !== undefined
        ? {
            id: messageId,
            content,
            channelId,
          }
        : undefined,
  };
}

function normalizeSentEvent(event: unknown, hookContext?: unknown): MessageEvent {
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
  const rawContext: Record<string, unknown> = {
    ...(rawHookContext ?? {}),
    ...(rawEventContext ?? {}),
  };
  const rawSession = toRecord(event.session);
  const rawMetadata = toRecord(event.metadata);

  const content =
    getNonEmptyString(rawMessage?.content) ??
    getNonEmptyString(rawMessage?.text) ??
    getNonEmptyString(event.content) ??
    getNonEmptyString(event.text) ??
    getNonEmptyString(event.bodyForAgent) ??
    getNonEmptyString(event.body) ??
    getNonEmptyString(rawContext.content) ??
    getNonEmptyString(rawContext.text) ??
    getNonEmptyString(event.transcript);

  const sessionKey =
    getNonEmptyString(event.sessionKey) ??
    getNonEmptyString(rawContext?.sessionKey) ??
    getNonEmptyString(rawSession?.key);

  const sessionId =
    getNonEmptyString(event.sessionId) ??
    getNonEmptyString(rawContext?.sessionId) ??
    getNonEmptyString(rawSession?.id);

  const from =
    getNonEmptyString(event.from) ??
    getNonEmptyString(rawMetadata?.from) ??
    getNonEmptyString(rawContext?.from);

  const to =
    getNonEmptyString(event.to) ??
    getNonEmptyString(rawMetadata?.to) ??
    getNonEmptyString(rawContext?.to);

  const channelId =
    getNonEmptyString(event.channelId) ??
    getNonEmptyString(rawContext?.channelId) ??
    getNonEmptyString(rawMetadata?.channelId) ??
    deriveChannelIdFromSessionKey(sessionKey) ??
    deriveChannelIdFromAddress(from);

  const conversationId =
    getNonEmptyString(event.conversationId) ??
    getNonEmptyString(rawContext?.conversationId);

  const accountId =
    getNonEmptyString(event.accountId) ??
    getNonEmptyString(rawContext?.accountId);

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
    role: getNonEmptyString(rawMessage?.role),
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

function normalizeBeforeMessageWriteEvent(
  event: unknown,
  hookContext?: unknown
): MessageEvent {
  const rawEvent = toRecord(event) as BeforeMessageWriteEvent | undefined;
  const rawMessage = toRecord(rawEvent?.message);
  const rawContext = toRecord(hookContext);
  const role = getNonEmptyString(rawMessage?.role);
  const sessionKey =
    getNonEmptyString(rawEvent?.sessionKey) ??
    getNonEmptyString(rawContext?.sessionKey);
  const content =
    extractTextFromMessageContent(rawMessage?.content) ??
    getNonEmptyString(rawMessage?.text);
  const channelId =
    getNonEmptyString(rawContext?.channelId) ??
    deriveChannelIdFromSessionKey(sessionKey);

  return {
    role,
    sessionKey,
    channelId,
    message:
      content !== undefined
        ? {
            content,
            channelId,
          }
        : undefined,
  };
}

function resolveSessionKey(
  event: MessageEvent,
  logger: Logger,
  hookName: string
): string | null {
  const canonicalSessionKey = buildChannelSessionKey(event);
  if (canonicalSessionKey) {
    if (event.sessionKey && event.sessionKey !== canonicalSessionKey) {
      logger.info("MessageHandler", "Canonicalized session key to channel scope", {
        hookName,
        originalSessionKey: event.sessionKey,
        canonicalSessionKey,
      });
    }

    return canonicalSessionKey;
  }

  if (event.sessionId) {
    logger.warn("MessageHandler", "SessionKey missing, fallback to sessionId", {
      hookName,
      sessionId: event.sessionId,
    });
    return event.sessionId;
  }

  if (event.sessionKey) {
    logger.warn("MessageHandler", "Using non-canonical session key fallback", {
      hookName,
      sessionKey: event.sessionKey,
      channelId: event.channelId,
    });
    return event.sessionKey;
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
    accountId: event.accountId,
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

function findLatestMessageByRole(
  messages: ReflectionMessage[],
  role: ReflectionMessage["role"]
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) {
      return messages[index].message;
    }
  }

  return "";
}

function findLatestBufferMessageByRole(
  messages: ReflectionMessage[],
  role: ReflectionMessage["role"]
): ReflectionMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) {
      return messages[index];
    }
  }

  return undefined;
}

function findLatestUserReactionTarget(
  messages: ReflectionMessage[]
): MessageReactionInput | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const messageId = getNonEmptyString(message.metadata?.messageId);
    const target = getNonEmptyString(message.metadata?.to);
    const channelId = getNonEmptyString(message.channelId);

    if (!messageId || !target || !channelId) {
      continue;
    }

    return {
      channelId,
      accountId: getNonEmptyString(message.metadata?.accountId),
      target,
      messageId,
      emoji: "📝",
    };
  }

  return null;
}

function isReactionService(
  value: unknown
): value is MessageReactionService {
  return (
    typeof value === "object" &&
    value !== null &&
    "reactToMessage" in value &&
    typeof (value as { reactToMessage?: unknown }).reactToMessage === "function"
  );
}

function resolveHandlerOptions(
  memoryGateWindowSizeOrReactionService: number | MessageReactionService | undefined,
  reactionServiceOrWindowSize: MessageReactionService | number | undefined
): {
  memoryGateWindowSize: number;
  reactionService?: MessageReactionService;
} {
  const defaultOptions = {
    memoryGateWindowSize: DEFAULT_MEMORY_GATE_WINDOW_SIZE,
    reactionService: undefined,
  } as const;

  if (typeof memoryGateWindowSizeOrReactionService === "number") {
    return {
      memoryGateWindowSize: memoryGateWindowSizeOrReactionService,
      reactionService: isReactionService(reactionServiceOrWindowSize)
        ? reactionServiceOrWindowSize
        : undefined,
    };
  }

  if (isReactionService(memoryGateWindowSizeOrReactionService)) {
    return {
      memoryGateWindowSize:
        typeof reactionServiceOrWindowSize === "number"
          ? reactionServiceOrWindowSize
          : DEFAULT_MEMORY_GATE_WINDOW_SIZE,
      reactionService: memoryGateWindowSizeOrReactionService,
    };
  }

  return defaultOptions;
}

function isUpdateDecision(
  decision: MemoryGateOutput["decision"]
): decision is
  | "UPDATE_MEMORY"
  | "UPDATE_USER"
  | "UPDATE_SOUL"
  | "UPDATE_IDENTITY"
  | "UPDATE_TOOLS" {
  return (
    decision === "UPDATE_MEMORY" ||
    decision === "UPDATE_USER" ||
    decision === "UPDATE_SOUL" ||
    decision === "UPDATE_IDENTITY" ||
    decision === "UPDATE_TOOLS"
  );
}

function resolveManagedFileName(
  decision: Extract<
    MemoryGateOutput["decision"],
    "UPDATE_MEMORY" | "UPDATE_USER" | "UPDATE_SOUL" | "UPDATE_IDENTITY" | "UPDATE_TOOLS"
  >
): ManagedFileName {
  switch (decision) {
    case "UPDATE_MEMORY":
      return "MEMORY.md";
    case "UPDATE_USER":
      return "USER.md";
    case "UPDATE_SOUL":
      return "SOUL.md";
    case "UPDATE_IDENTITY":
      return "IDENTITY.md";
    case "UPDATE_TOOLS":
      return "TOOLS.md";
  }
}

async function triggerMemoryGate(
  sessionKey: string,
  bufferManager: SessionBufferManager,
  memoryGate: MemoryGateAnalyzer,
  writeGuardian: WriteGuardian | undefined,
  logger: Logger,
  memoryGateWindowSize: number,
  reactionService?: MessageReactionService,
  managedWriteRecorder?: ManagedWriteRecorder
): Promise<void> {
  const normalizedWindowSize = Number.isInteger(memoryGateWindowSize)
    ? Math.max(memoryGateWindowSize, 1)
    : DEFAULT_MEMORY_GATE_WINDOW_SIZE;

  const sessionMessages = bufferManager.getMessages(sessionKey);
  const recentMessages = sessionMessages
    .slice(-normalizedWindowSize)
    .map((message) => ({
      role: message.role,
      message: message.message,
      timestamp: message.timestamp,
    }));

  const currentUserMessage = findLatestMessageByRole(sessionMessages, "user");
  const currentAgentReply = findLatestMessageByRole(sessionMessages, "agent");
  const currentUserBufferMessage = findLatestBufferMessageByRole(sessionMessages, "user");

  try {
    const output: MemoryGateOutput = await memoryGate.analyze({
      recentMessages,
      currentUserMessage,
      currentAgentReply,
    });

    logger.info(
      "MessageHandler",
      "memory_gate decision evaluated",
      {
        decision: output.decision,
        reason: output.reason,
        hasCandidateFact: Boolean(output.candidateFact),
      },
      sessionKey
      );

    if (isUpdateDecision(output.decision)) {
      if (writeGuardian) {
        const writeResult = await writeGuardian.write(output);
        if (writeResult.status === "written") {
          logger.info(
            "MessageHandler",
            "write_guardian applied update",
            {
              decision: output.decision,
            },
            sessionKey
          );

          const reactionTarget = findLatestUserReactionTarget(sessionMessages);
          if (reactionService && reactionTarget) {
            await reactionService.reactToMessage(reactionTarget);
          }

          if (managedWriteRecorder && output.candidateFact) {
            await managedWriteRecorder.recordManagedWrite({
              fileName: resolveManagedFileName(output.decision),
              text: output.candidateFact,
              provenance: {
                decision: output.decision,
                reason: output.reason,
                recordedAt: new Date().toISOString(),
                sessionKey,
                sourceMessageId: currentUserBufferMessage?.metadata?.messageId,
              },
            });
          }
        } else if (writeResult.status === "refused") {
          logger.info(
            "MessageHandler",
            "write_guardian refused update",
            {
              decision: output.decision,
              reason: writeResult.reason,
            },
            sessionKey
          );
        } else if (writeResult.status === "failed") {
          logger.error(
            "MessageHandler",
            "write_guardian failed",
            {
              decision: output.decision,
              reason: writeResult.reason,
            },
            sessionKey
          );
        } else {
          logger.warn(
            "MessageHandler",
            "write_guardian skipped update",
            {
              decision: output.decision,
              reason: writeResult.reason,
            },
            sessionKey
          );
        }
      } else {
        logger.warn(
          "MessageHandler",
          "UPDATE_* skipped because write_guardian is unavailable",
          {
            decision: output.decision,
          },
          sessionKey
        );
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(
      "MessageHandler",
      "memory_gate trigger failed",
      { reason },
      sessionKey
    );
  }
}

// index.ts passes FileLogger here; handlers should only use this injected logger.
export function handleMessageReceived(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookContext?: unknown,
  onHandled?: () => void
): void {
  const normalizedEvent = normalizeReceivedEvent(event, hookContext);
  logHookPayloadDebug(
    logger,
    "message:received",
    event,
    hookContext,
    normalizedEvent
  );
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

  if (message.message.trim() === "") {
    logger.debug(
      "MessageHandler",
      "Skipped empty user message",
      {
        hookName: "message:received",
      },
      sessionKey
    );
    return;
  }

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
  onHandled?.();
}

function handleAgentMessage(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookName: string,
  hookContext?: unknown,
  memoryGate?: MemoryGateAnalyzer,
  writeGuardian?: WriteGuardian,
  memoryGateWindowSizeOrReactionService?: number | MessageReactionService,
  reactionServiceOrWindowSize?: MessageReactionService | number,
  managedWriteRecorder?: ManagedWriteRecorder
): void {
  const { memoryGateWindowSize, reactionService } = resolveHandlerOptions(
    memoryGateWindowSizeOrReactionService,
    reactionServiceOrWindowSize
  );

  const normalizedEvent = normalizeSentEvent(event, hookContext);
  logHookPayloadDebug(
    logger,
    hookName,
    event,
    hookContext,
    normalizedEvent
  );
  const sessionKey = resolveSessionKey(normalizedEvent, logger, hookName);

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

  if (message.message.trim() === "") {
    logger.debug(
      "MessageHandler",
      "Skipped empty agent message",
      {
        hookName,
      },
      sessionKey
    );
    return;
  }

  logger.info(
    "MessageHandler",
    "Buffer message snapshot",
    {
      hookName,
      bufferMessage: message,
    },
    sessionKey
  );

  const messageId = message.metadata?.messageId;
  if (messageId && bufferManager.hasProcessedAgentMessage(sessionKey, messageId)) {
    logger.info(
      "MessageHandler",
      "Skipped duplicate agent message event",
      {
        hookName,
        messageId,
      },
      sessionKey
    );
    return;
  }

  bufferManager.push(sessionKey, message);

  if (memoryGate) {
    if (messageId) {
      bufferManager.markProcessedAgentMessage(sessionKey, messageId);
    }

    void bufferManager.runExclusive(sessionKey, () =>
      triggerMemoryGate(
        sessionKey,
        bufferManager,
        memoryGate,
        writeGuardian,
        logger,
        memoryGateWindowSize,
        reactionService,
        managedWriteRecorder
      )
    );
  }
}

export function handleMessageSent(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookContext?: unknown,
  memoryGate?: MemoryGateAnalyzer,
  writeGuardian?: WriteGuardian,
  memoryGateWindowSizeOrReactionService?: number | MessageReactionService,
  reactionServiceOrWindowSize?: MessageReactionService | number,
  managedWriteRecorder?: ManagedWriteRecorder
): void {
  handleAgentMessage(
    event,
    bufferManager,
    logger,
    "message:sent",
    hookContext,
    memoryGate,
    writeGuardian,
    memoryGateWindowSizeOrReactionService,
    reactionServiceOrWindowSize,
    managedWriteRecorder
  );
}

export function handleBeforeMessageWrite(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookContext?: unknown,
  memoryGate?: MemoryGateAnalyzer,
  writeGuardian?: WriteGuardian,
  memoryGateWindowSizeOrReactionService?: number | MessageReactionService,
  reactionServiceOrWindowSize?: MessageReactionService | number,
  onHandled?: () => void,
  managedWriteRecorder?: ManagedWriteRecorder
): void {
  const normalizedEvent = normalizeBeforeMessageWriteEvent(event, hookContext);
  logHookPayloadDebug(
    logger,
    "before_message_write",
    event,
    hookContext,
    normalizedEvent
  );

  if (normalizedEvent.role !== "assistant") {
    logger.debug("MessageHandler", "Skipped non-assistant before_message_write event", {
      hookName: "before_message_write",
      role: normalizedEvent.role ?? "unknown",
    });
    return;
  }

  handleAgentMessage(
    normalizedEvent,
    bufferManager,
    logger,
    "before_message_write",
    hookContext,
    memoryGate,
    writeGuardian,
    memoryGateWindowSizeOrReactionService,
    reactionServiceOrWindowSize,
    managedWriteRecorder
  );
  onHandled?.();
}

export function handleSessionEnd(
  event: unknown,
  bufferManager: SessionBufferManager,
  logger: Logger,
  hookName = "session:end",
  hookContext?: unknown
): void {
  const normalizedEvent = normalizeSentEvent(event, hookContext);
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
