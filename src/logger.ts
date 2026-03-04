import * as fs from 'fs';
import * as path from 'path';
import type { LogEntry } from './types.js';

const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private pluginRootDir: string;
  private level: string;
  private logsDir: string;

  constructor(pluginRootDir: string, level: string) {
    this.pluginRootDir = pluginRootDir;
    this.level = level;
    this.logsDir = path.join(pluginRootDir, 'logs');
    this.ensureLogsDir();
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logsDir, `reflection-${date}.log`);
  }

  private shouldLog(level: string): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private writeLog(entry: LogEntry): void {
    const logLine = JSON.stringify(entry) + '\n';
    const logFile = this.getLogFilePath();
    
    try {
      fs.appendFileSync(logFile, logLine, 'utf-8');
    } catch (err) {
      console.error('[ReflectionPlugin] Failed to write log:', err);
    }
  }

  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      component,
      event,
      details,
      sessionKey,
    };

    this.writeLog(entry);
  }

  debug(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void {
    this.log('debug', component, event, details, sessionKey);
  }

  info(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void {
    this.log('info', component, event, details, sessionKey);
  }

  warn(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void {
    this.log('warn', component, event, details, sessionKey);
  }

  error(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string): void {
    this.log('error', component, event, details, sessionKey);
  }
}
