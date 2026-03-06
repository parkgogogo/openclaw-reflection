import type { Logger } from "../types.js";
import { Consolidator } from "./consolidator.js";
import type { ConsolidationConfig } from "./types.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface DailySchedule {
  minute: number;
  hour: number;
}

function parseNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseDailySchedule(schedule: string): DailySchedule {
  const parts = schedule.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Invalid schedule format: "${schedule}"`);
  }

  const [minutePart, hourPart, dayOfMonthPart, monthPart, dayOfWeekPart] = parts;

  if (dayOfMonthPart !== "*" || monthPart !== "*" || dayOfWeekPart !== "*") {
    throw new Error(`Only daily schedule is supported: "${schedule}"`);
  }

  const minute = parseNumber(minutePart);
  const hour = parseNumber(hourPart);

  if (minute === null || minute < 0 || minute > 59) {
    throw new Error(`Invalid minute in schedule: "${schedule}"`);
  }

  if (hour === null || hour < 0 || hour > 23) {
    throw new Error(`Invalid hour in schedule: "${schedule}"`);
  }

  return { minute, hour };
}

function getNextRunTime(schedule: DailySchedule, now: Date = new Date()): Date {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(schedule.hour, schedule.minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

export class ConsolidationScheduler {
  private config: ConsolidationConfig;
  private logger: Logger;
  private consolidator: Consolidator;
  private timeoutId: ReturnType<typeof setTimeout> | null;
  private intervalId: ReturnType<typeof setInterval> | null;

  constructor(config: ConsolidationConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.consolidator = new Consolidator(config, logger);
    this.timeoutId = null;
    this.intervalId = null;
  }

  start(): void {
    if (this.timeoutId !== null || this.intervalId !== null) {
      this.logger.warn("ConsolidationScheduler", "Scheduler is already running", {
        schedule: this.config.schedule,
      });
      return;
    }

    const parsedSchedule = parseDailySchedule(this.config.schedule);
    const nextRunAt = getNextRunTime(parsedSchedule);
    const delayMs = Math.max(nextRunAt.getTime() - Date.now(), 0);

    this.logger.info("ConsolidationScheduler", "Scheduler started", {
      schedule: this.config.schedule,
      nextRunAt: nextRunAt.toISOString(),
      delayMs,
    });

    this.timeoutId = setTimeout(() => {
      void this.runConsolidation();

      this.intervalId = setInterval(() => {
        void this.runConsolidation();
      }, DAY_IN_MS);

      this.timeoutId = null;
    }, delayMs);
  }

  stop(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.logger.info("ConsolidationScheduler", "Scheduler stopped", {
      schedule: this.config.schedule,
    });
  }

  private async runConsolidation(): Promise<void> {
    this.logger.info("ConsolidationScheduler", "Starting scheduled consolidation run", {
      schedule: this.config.schedule,
    });

    try {
      const result = await this.consolidator.consolidate();
      this.logger.info("ConsolidationScheduler", "Scheduled consolidation run completed", {
        archivedCount: result.archived.length,
        updatedFiles: Object.keys(result.updates),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error("ConsolidationScheduler", "Scheduled consolidation run failed", {
        reason,
      });
    }
  }
}
