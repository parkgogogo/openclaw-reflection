import { randomUUID } from "crypto";
import * as path from "path";
import type { MemoryGateOutput } from "../memory-gate/types.js";
import type { Logger } from "../types.js";
import {
  appendFileWithLock,
  ensureDir,
  getTodayFilename,
  readFile,
} from "../utils/file-utils.js";

interface DailyWriterConfig {
  memoryDir: string;
}

interface WriteTask {
  id: string;
  filePath: string;
  content: string;
  factSignature: string;
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractDecisionsFromDaily(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const decisions: string[] = [];
  let inDecisions = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^##\s+\[.+\]\s*$/.test(trimmed)) {
      inDecisions = false;
      continue;
    }

    if (trimmed === "Decisions:") {
      inDecisions = true;
      continue;
    }

    if (trimmed === "Context:" || trimmed === "Next:") {
      inDecisions = false;
      continue;
    }

    if (!inDecisions || !trimmed.startsWith("- ")) {
      continue;
    }

    const decision = normalizeText(trimmed.slice(2));
    if (decision !== "") {
      decisions.push(decision);
    }
  }

  return decisions;
}

function shouldIncludeNextSection(candidateFact: string): boolean {
  return /\b(next|todo|follow[- ]?up|tomorrow|later|after)\b/i.test(candidateFact);
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
    try {
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
    } catch (error) {
      throw new Error(`Failed during write backoff sleep: ${getErrorMessage(error)}`);
    }
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

          const existingContent = await readFile(task.filePath);
          if (typeof existingContent === "string") {
            const existingFacts = extractDecisionsFromDaily(existingContent);
            if (existingFacts.includes(task.factSignature)) {
              this.writeQueue.shift();
              this.settleTaskSuccess(task.id);

              this.logger.info("DailyWriter", "Skipped duplicate daily fact", {
                taskId: task.id,
                filePath: task.filePath,
              });
              continue;
            }
          }

          await appendFileWithLock(task.filePath, task.content);
          this.writeQueue.shift();
          this.settleTaskSuccess(task.id);

          this.logger.info("DailyWriter", "Processed daily write task", {
            taskId: task.id,
            filePath: task.filePath,
          });
        } catch (error) {
          if (task.retries >= task.maxRetries) {
            const reason = getErrorMessage(error);
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
    try {
      if (output.decision !== "WRITE_DAILY") {
        return;
      }

      const candidateFact = output.candidateFact?.trim();
      if (!candidateFact) {
        this.logger.warn("DailyWriter", "Skip WRITE_DAILY without candidate fact", {
          reason: output.reason,
        });
        return;
      }

      const now = new Date();
      const dailyFilePath = path.join(this.config.memoryDir, getTodayFilename());
      const sections: string[] = [
        `## [${formatTime(now)}]`,
        "Context:",
        `- ${output.reason.trim() || "N/A"}`,
        "",
        "Decisions:",
        `- ${candidateFact}`,
      ];

      if (shouldIncludeNextSection(candidateFact)) {
        sections.push("", "Next:", `- ${candidateFact}`);
      }

      const entry = `${sections.join("\n")}\n\n`;

      const task: WriteTask = {
        id: randomUUID(),
        filePath: dailyFilePath,
        content: entry,
        factSignature: normalizeText(candidateFact),
        retries: 0,
        maxRetries: 3,
      };

      return await new Promise<void>((resolve, reject) => {
        this.taskHandlers.set(task.id, { resolve, reject });
        this.writeQueue.push(task);

        this.logger.info("DailyWriter", "Queued daily write task", {
          taskId: task.id,
          filePath: dailyFilePath,
        });

        void this.processQueue();
      });
    } catch (error) {
      throw new Error(
        `Failed to enqueue daily write task: ${getErrorMessage(error)}`
      );
    }
  }
}
