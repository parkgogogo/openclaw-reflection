import { CircularBuffer } from './buffer.js';
import type { Logger, ReflectionMessage } from './types.js';

interface SessionData {
  buffer: CircularBuffer<ReflectionMessage>;
  lastAccessed: number;
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

  push(sessionKey: string, message: ReflectionMessage): void {
    let sessionData = this.sessions.get(sessionKey);

    if (!sessionData) {
      this.logger.info('SessionBufferManager', 'Creating new session buffer', { sessionKey }, sessionKey);
      sessionData = {
        buffer: new CircularBuffer<ReflectionMessage>(this.capacity),
        lastAccessed: Date.now(),
      };
      this.sessions.set(sessionKey, sessionData);
    }

    const evicted = sessionData.buffer.push(message);
    if (evicted) {
      this.logger.info('SessionBufferManager', 'Evicted oldest message', { evictedId: evicted.id }, sessionKey);
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

  clearSession(sessionKey: string): void {
    const existed = this.sessions.has(sessionKey);
    this.sessions.delete(sessionKey);

    if (existed) {
      this.logger.info('SessionBufferManager', 'Session cleared', { sessionKey }, sessionKey);
    }
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}
