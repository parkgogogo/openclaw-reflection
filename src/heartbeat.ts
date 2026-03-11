import type { Logger } from "./types.js";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;

export interface HeartbeatSnapshot extends Record<string, unknown> {
  intervalMs: number;
  uptimeMs: number;
  lastMessageReceivedAt: string | null;
  lastBeforeMessageWriteAt: string | null;
  bufferedSessions: number;
  workspaceDir: string | null;
}

interface HeartbeatServiceOptions {
  logger: Logger;
  workspaceDir?: string;
  getBufferedSessions: () => number;
  intervalMs?: number;
}

export function resolveHeartbeatIntervalMs(): number {
  const rawValue = process.env.OPENCLAW_REFLECTION_HEARTBEAT_INTERVAL_MS;
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

  return Math.floor(parsed);
}

export class HeartbeatService {
  private readonly logger: Logger;
  private readonly workspaceDir: string | null;
  private readonly getBufferedSessions: () => number;
  private readonly intervalMs: number;
  private readonly startedAt: number;
  private lastMessageReceivedAt: string | null;
  private lastBeforeMessageWriteAt: string | null;
  private timerId: ReturnType<typeof setInterval> | null;

  constructor(options: HeartbeatServiceOptions) {
    this.logger = options.logger;
    this.workspaceDir = options.workspaceDir ?? null;
    this.getBufferedSessions = options.getBufferedSessions;
    this.intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.startedAt = Date.now();
    this.lastMessageReceivedAt = null;
    this.lastBeforeMessageWriteAt = null;
    this.timerId = null;
  }

  start(): void {
    if (this.timerId) {
      return;
    }

    this.logger.info("Heartbeat", "heartbeat started", this.getSnapshot());
    this.timerId = setInterval(() => {
      this.logger.info("Heartbeat", "heartbeat tick", this.getSnapshot());
    }, this.intervalMs);

    if (typeof this.timerId.unref === "function") {
      this.timerId.unref();
    }
  }

  stop(): void {
    if (!this.timerId) {
      return;
    }

    clearInterval(this.timerId);
    this.timerId = null;
    this.logger.info("Heartbeat", "heartbeat stopped", this.getSnapshot());
  }

  markMessageReceived(): void {
    this.lastMessageReceivedAt = new Date().toISOString();
  }

  markBeforeMessageWrite(): void {
    this.lastBeforeMessageWriteAt = new Date().toISOString();
  }

  private getSnapshot(): HeartbeatSnapshot {
    return {
      intervalMs: this.intervalMs,
      uptimeMs: Date.now() - this.startedAt,
      lastMessageReceivedAt: this.lastMessageReceivedAt,
      lastBeforeMessageWriteAt: this.lastBeforeMessageWriteAt,
      bufferedSessions: this.getBufferedSessions(),
      workspaceDir: this.workspaceDir,
    };
  }
}
