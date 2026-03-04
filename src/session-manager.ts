import { CircularBuffer } from './buffer.js';
import { Logger } from './logger.js';
import type { ReflectionMessage, SessionData } from './types.js';

export class SessionBufferManager {
  private sessions: Map<string, SessionData>;
  private capacity: number;
  private ttlMs: number;
  private logger: Logger;

  constructor(capacity: number, ttlMs: number, logger: Logger) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.logger = logger;
    this.sessions = new Map();
  }

  push(sessionKey: string, message: ReflectionMessage): void {
    let sessionData = this.sessions.get(sessionKey);

    if (!sessionData) {
      this.logger.debug('SessionBufferManager', 'Creating new session buffer', { sessionKey }, sessionKey);
      sessionData = {
        buffer: [],
        lastAccessed: Date.now(),
      };
      this.sessions.set(sessionKey, sessionData);
    }

    // Maintain circular buffer behavior
    if (sessionData.buffer.length >= this.capacity) {
      const evicted = sessionData.buffer.shift();
      if (evicted) {
        this.logger.debug('SessionBufferManager', 'Evicted oldest message', { evictedId: evicted.id }, sessionKey);
      }
    }

    sessionData.buffer.push(message);
    sessionData.lastAccessed = Date.now();

    this.logger.debug('SessionBufferManager', 'Message pushed to buffer', { 
      messageId: message.id, 
      bufferSize: sessionData.buffer.length 
    }, sessionKey);
  }

  getMessages(sessionKey: string): ReflectionMessage[] {
    const sessionData = this.sessions.get(sessionKey);
    
    if (!sessionData) {
      return [];
    }

    sessionData.lastAccessed = Date.now();
    return [...sessionData.buffer];
  }

  clearSession(sessionKey: string): void {
    const existed = this.sessions.has(sessionKey);
    this.sessions.delete(sessionKey);
    
    if (existed) {
      this.logger.info('SessionBufferManager', 'Session cleared', { sessionKey }, sessionKey);
    }
  }

  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionKey, sessionData] of this.sessions.entries()) {
      if (now - sessionData.lastAccessed > this.ttlMs) {
        this.sessions.delete(sessionKey);
        cleanedCount++;
        this.logger.info('SessionBufferManager', 'Expired session cleaned up', { sessionKey }, sessionKey);
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('SessionBufferManager', 'Cleanup completed', { cleanedCount });
    }
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}
