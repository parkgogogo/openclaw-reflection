import * as path from "path";
import type { MemoryGateOutput } from "../memory-gate/types.js";
import type { Logger } from "../types.js";
import { appendFile, ensureDir, getTodayFilename } from "../utils/file-utils.js";

interface DailyWriterConfig {
  memoryDir: string;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export class DailyWriter {
  private config: DailyWriterConfig;
  private logger: Logger;

  constructor(config: DailyWriterConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async write(output: MemoryGateOutput): Promise<void> {
    if (output.decision !== "WRITE_DAILY") {
      return;
    }

    const now = new Date();
    const dailyFilePath = path.join(this.config.memoryDir, getTodayFilename());
    const candidateFact = output.candidateFact ?? "No candidate fact provided";
    const entry =
      `## [${formatTime(now)}]\n` +
      `Context:\n` +
      `- ${output.reason}\n\n` +
      `Decisions:\n` +
      `- ${candidateFact}\n\n`;

    try {
      await ensureDir(this.config.memoryDir);
      await appendFile(dailyFilePath, entry);

      this.logger.info("DailyWriter", "Wrote daily memory entry", {
        filePath: dailyFilePath,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error("DailyWriter", "Failed to write daily memory entry", {
        reason,
        filePath: dailyFilePath,
      });
      throw error;
    }
  }
}
