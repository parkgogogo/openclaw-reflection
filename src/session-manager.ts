import { CircularBuffer } from "./buffer.js";
import type { Logger, ReflectionMessage } from "./types.js";

interface SessionData {
  buffer: CircularBuffer<ReflectionMessage>;
  lastAccessed: number;
  processedAgentMessageIds: Set<string>;
  pendingTask: Promise<void>;
}

export class SessionBufferManager {
  private sessions: Map<string, SessionData>;
  private capacity: number;
  private logger: Logger;

  constructor(capacity: number, logger: Logger) {
    this.capacity = capacity;
    this.logger = logger;
    this.sessions = new Map();
  }

  private getOrCreateSessionData(sessionKey: string): SessionData {
    let sessionData = this.sessions.get(sessionKey);

    if (!sessionData) {
      this.logger.info(
        "SessionBufferManager",
        "Creating new session buffer",
        { sessionKey },
        sessionKey
      );
      sessionData = {
        buffer: new CircularBuffer<ReflectionMessage>(this.capacity),
        lastAccessed: Date.now(),
        processedAgentMessageIds: new Set<string>(),
        pendingTask: Promise.resolve(),
      };
      this.sessions.set(sessionKey, sessionData);
    }

    sessionData.lastAccessed = Date.now();
    return sessionData;
  }

  push(sessionKey: string, message: ReflectionMessage): void {
    const sessionData = this.getOrCreateSessionData(sessionKey);

    const evicted = sessionData.buffer.push(message);
    if (evicted) {
      this.logger.info(
        "SessionBufferManager",
        "Evicted oldest message",
        { evictedId: evicted.id },
        sessionKey
      );
    }

    sessionData.lastAccessed = Date.now();
  }

  getMessages(sessionKey: string): ReflectionMessage[] {
    const sessionData = this.sessions.get(sessionKey);

    if (!sessionData) {
      return [];
    }

    sessionData.lastAccessed = Date.now();
    return sessionData.buffer.toArray();
  }

  hasProcessedAgentMessage(sessionKey: string, messageId: string): boolean {
    const sessionData = this.sessions.get(sessionKey);
    if (!sessionData) {
      return false;
    }

    sessionData.lastAccessed = Date.now();
    return sessionData.processedAgentMessageIds.has(messageId);
  }

  markProcessedAgentMessage(sessionKey: string, messageId: string): void {
    const sessionData = this.getOrCreateSessionData(sessionKey);
    sessionData.processedAgentMessageIds.add(messageId);
  }

  runExclusive(sessionKey: string, task: () => Promise<void>): Promise<void> {
    const sessionData = this.getOrCreateSessionData(sessionKey);
    const nextTask = sessionData.pendingTask
      .catch(() => undefined)
      .then(task);

    sessionData.pendingTask = nextTask.catch(() => undefined);
    return nextTask;
  }

  clearSession(sessionKey: string): void {
    const existed = this.sessions.has(sessionKey);
    this.sessions.delete(sessionKey);

    if (existed) {
      this.logger.info(
        "SessionBufferManager",
        "Session cleared",
        { sessionKey },
        sessionKey
      );
    }
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}
