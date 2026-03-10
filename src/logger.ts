import * as fs from "fs";
import * as path from "path";
import type { LogEntry, LogLevel } from "./types.js";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function parseLogLevel(level: string): LogLevel {
  if (
    level === "debug" ||
    level === "info" ||
    level === "warn" ||
    level === "error"
  ) {
    return level;
  }

  return "info";
}

export class FileLogger {
  private pluginRootDir: string;
  private level: LogLevel;
  private logsDir: string;

  constructor(pluginRootDir: string, level: string) {
    this.pluginRootDir = pluginRootDir;
    this.level = parseLogLevel(level);
    this.logsDir = path.join(pluginRootDir, "logs");
    this.ensureLogsDir();
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private getLogFilePath(): string {
    const date = new Date().toISOString().split("T")[0];
    return path.join(this.logsDir, `reflection-${date}.log`);
  }

  private getDebugFilePath(): string {
    return path.join(this.logsDir, "debug.json");
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private writeLog(entry: LogEntry): void {
    const logLine = `${JSON.stringify(entry)}\n`;
    const logFile = this.getLogFilePath();

    try {
      fs.appendFileSync(logFile, logLine, "utf-8");
    } catch (error) {
      console.error("[ReflectionPlugin] Failed to write log:", error);
    }
  }

  writeLatestDebugPayload(
    hookName: string,
    event: unknown,
    hookContext?: unknown
  ): void {
    if (!this.shouldLog("debug")) {
      return;
    }

    const debugFile = this.getDebugFilePath();
    const payload = {
      timestamp: this.formatTimestamp(),
      hookName,
      event,
      hookContext,
    };

    try {
      fs.writeFileSync(debugFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    } catch (error) {
      console.error("[ReflectionPlugin] Failed to write debug payload:", error);
    }
  }

  private log(
    level: LogLevel,
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

  debug(
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ): void {
    this.log("debug", component, event, details, sessionKey);
  }

  info(
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ): void {
    this.log("info", component, event, details, sessionKey);
  }

  warn(
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ): void {
    this.log("warn", component, event, details, sessionKey);
  }

  error(
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ): void {
    this.log("error", component, event, details, sessionKey);
  }
}
