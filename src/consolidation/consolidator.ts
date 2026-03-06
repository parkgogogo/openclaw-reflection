import * as path from "path";
import type { Logger } from "../types.js";
import { listFiles, moveFile } from "../utils/file-utils.js";
import type { ConsolidationConfig, ConsolidationResult } from "./types.js";

const DAILY_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;
const ARCHIVE_AFTER_DAYS = 7;

function parseDailyFileDate(filename: string): Date | null {
  const matched = filename.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function isOlderThanDays(date: Date, days: number, now: Date): boolean {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cutoff.setDate(cutoff.getDate() - days);
  return date < cutoff;
}

export class Consolidator {
  private config: ConsolidationConfig;
  private logger: Logger;

  constructor(config: ConsolidationConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async consolidate(): Promise<ConsolidationResult> {
    const dailyFiles = await this.getDailyFiles();

    if (dailyFiles.length < this.config.minDailyEntries) {
      this.logger.info("Consolidator", "Skipped consolidation: insufficient daily entries", {
        totalDailyFiles: dailyFiles.length,
        minDailyEntries: this.config.minDailyEntries,
      });

      return {
        updates: {},
        archived: [],
      };
    }

    const archived = await this.archiveOldFiles(dailyFiles);

    // TODO(phase-6): Parse daily files into structured memory facts.
    // const parsedFacts = await this.parseDailyFiles(dailyFiles);

    // TODO(phase-6): Use parsed facts to generate updates for MEMORY.md/USER.md/SOUL.md.
    // const updates = await this.generateUpdates(parsedFacts);

    const updates: ConsolidationResult["updates"] = {};

    this.logger.info("Consolidator", "Consolidation run completed", {
      totalDailyFiles: dailyFiles.length,
      archivedCount: archived.length,
      updatedFiles: Object.keys(updates),
    });

    return {
      updates,
      archived,
    };
  }

  private async getDailyFiles(): Promise<string[]> {
    const files = await listFiles(this.config.memoryDir);

    return files.filter((file) => DAILY_FILE_PATTERN.test(file));
  }

  private async archiveOldFiles(dailyFiles: string[]): Promise<string[]> {
    const now = new Date();
    const archiveDir = path.join(this.config.memoryDir, "archive");
    const archived: string[] = [];

    for (const file of dailyFiles) {
      const dailyDate = parseDailyFileDate(file);

      if (!dailyDate || !isOlderThanDays(dailyDate, ARCHIVE_AFTER_DAYS, now)) {
        continue;
      }

      const fromPath = path.join(this.config.memoryDir, file);
      const toPath = path.join(archiveDir, file);

      await moveFile(fromPath, toPath);
      archived.push(file);

      this.logger.info("Consolidator", "Archived old daily file", {
        file,
        fromPath,
        toPath,
      });
    }

    return archived;
  }
}
