import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

export interface WriteGuardianAuditEntry {
  timestamp: string;
  decision: string;
  targetFile?: string;
  status: "written" | "refused" | "failed" | "skipped";
  reason?: string;
  candidateFact?: string;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class WriteGuardianAuditLog {
  private readonly filePath: string;

  constructor(workspaceDir: string) {
    const logDir = path.join(workspaceDir, ".openclaw-reflection");
    this.filePath = path.join(logDir, "write-guardian.log.jsonl");

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  async append(entry: Omit<WriteGuardianAuditEntry, "timestamp">): Promise<void> {
    const serialized = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    });

    await fsp.appendFile(this.filePath, `${serialized}\n`, "utf8");
  }

  async readRecent(limit: number): Promise<WriteGuardianAuditEntry[]> {
    try {
      const content = await fsp.readFile(this.filePath, "utf8");
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const parsed = lines
        .map((line) => {
          try {
            return JSON.parse(line) as WriteGuardianAuditEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is WriteGuardianAuditEntry => entry !== null);

      return parsed.slice(-limit).reverse();
    } catch (error) {
      const errorMessage = normalizeError(error);
      if (errorMessage.includes("ENOENT")) {
        return [];
      }

      throw error;
    }
  }
}
