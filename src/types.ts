export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void;
  info(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void;
  warn(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void;
  error(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void;
}

export interface ReflectionMessage {
  id: string;
  role: 'user' | 'agent';
  message: string;
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
  level: LogLevel;
  component: string;
  sessionKey?: string;
  event: string;
  details?: Record<string, unknown>;
}

export interface PluginConfig {
  bufferSize: number;
  logLevel: LogLevel;
}
