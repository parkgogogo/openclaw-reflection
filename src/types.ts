export interface ReflectionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sessionKey: string;
  channelId: string;
  metadata?: {
    from?: string;
    to?: string;
    messageId?: string;
    success?: boolean;
  };
}

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  sessionKey?: string;
  event: string;
  details?: Record<string, unknown>;
}

export interface PluginConfig {
  bufferSize: number;
  sessionTTL: number;
  logLevel: string;
}

export interface SessionData {
  buffer: ReflectionMessage[];
  lastAccessed: number;
}
