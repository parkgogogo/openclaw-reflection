import { randomUUID } from "crypto";
import * as path from "path";
import type { MemoryGateOutput } from "../memory-gate/types.js";
import type { Logger } from "../types.js";
import { appendFile, ensureDir, getTodayFilename } from "../utils/file-utils.js";

interface DailyWriterConfig {
  memoryDir: string;
}

interface WriteTask {
  id: string;
  filePath: string;
  content: string;
  retries: number;
  maxRetries: number;
}

interface TaskHandlers {
  resolve: () => void;
  reject: (error: unknown) => void;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export class DailyWriter {
  private config: DailyWriterConfig;
  private logger: Logger;
  private writeQueue: WriteTask[] = [];
  private taskHandlers = new Map<string, TaskHandlers>();
  private isProcessing = false;

  constructor(config: DailyWriterConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  private async sleep(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private settleTaskSuccess(taskId: string): void {
    const handlers = this.taskHandlers.get(taskId);

    if (!handlers) {
      return;
    }

    handlers.resolve();
    this.taskHandlers.delete(taskId);
  }

  private settleTaskFailure(taskId: string, error: unknown): void {
    const handlers = this.taskHandlers.get(taskId);

    if (!handlers) {
      return;
    }

    handlers.reject(error);
    this.taskHandlers.delete(taskId);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.writeQueue.length > 0) {
        const task = this.writeQueue[0];

        try {
          await ensureDir(this.config.memoryDir);
          await appendFile(task.filePath, task.content);
          this.writeQueue.shift();
          this.settleTaskSuccess(task.id);

          this.logger.info("DailyWriter", "Processed daily write task", {
            taskId: task.id,
            filePath: task.filePath,
          });
        } catch (error) {
          if (task.retries >= task.maxRetries) {
            const reason = error instanceof Error ? error.message : String(error);
            this.writeQueue.shift();
            this.settleTaskFailure(task.id, error);

            this.logger.error("DailyWriter", "Failed daily write task", {
              taskId: task.id,
              filePath: task.filePath,
              reason,
              retries: task.retries,
            });
            continue;
          }

          const backoff = 2 ** task.retries * 1000;
          task.retries += 1;

          this.logger.warn("DailyWriter", "Retrying daily write task", {
            taskId: task.id,
            filePath: task.filePath,
            backoff,
            retries: task.retries,
            maxRetries: task.maxRetries,
          });

          await this.sleep(backoff);
        }
      }
    } finally {
      this.isProcessing = false;

      if (this.writeQueue.length > 0) {
        void this.processQueue();
      }
    }
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

    const task: WriteTask = {
      id: randomUUID(),
      filePath: dailyFilePath,
      content: entry,
      retries: 0,
      maxRetries: 3,
    };

    return new Promise<void>((resolve, reject) => {
      this.taskHandlers.set(task.id, { resolve, reject });
      this.writeQueue.push(task);

      this.logger.info("DailyWriter", "Queued daily write task", {
        taskId: task.id,
        filePath: dailyFilePath,
      });

      void this.processQueue();
    });
  }
}
