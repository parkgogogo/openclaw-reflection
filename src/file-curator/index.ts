import * as path from "path";
import type { MemoryGateOutput } from "../memory-gate/types.js";
import type { Logger } from "../types.js";
import { readFile, writeFileWithLock } from "../utils/file-utils.js";

const MANAGED_START = "<!-- reflection-plugin:file-curator:start -->";
const MANAGED_END = "<!-- reflection-plugin:file-curator:end -->";

type UpdateDecision =
  | "UPDATE_MEMORY"
  | "UPDATE_USER"
  | "UPDATE_SOUL"
  | "UPDATE_IDENTITY";

interface CuratorTarget {
  filename: "MEMORY.md" | "USER.md" | "SOUL.md" | "IDENTITY.md";
  title: string;
  maxLines: number;
}

interface FileCuratorConfig {
  workspaceDir: string;
}

const TARGETS: Record<UpdateDecision, CuratorTarget> = {
  UPDATE_MEMORY: {
    filename: "MEMORY.md",
    title: "Curated Memory Updates",
    maxLines: 50,
  },
  UPDATE_USER: {
    filename: "USER.md",
    title: "Curated User Updates",
    maxLines: 30,
  },
  UPDATE_SOUL: {
    filename: "SOUL.md",
    title: "Curated Soul Updates",
    maxLines: 20,
  },
  UPDATE_IDENTITY: {
    filename: "IDENTITY.md",
    title: "Curated Identity Updates",
    maxLines: 20,
  },
};

function isUpdateDecision(
  decision: MemoryGateOutput["decision"]
): decision is UpdateDecision {
  return (
    decision === "UPDATE_MEMORY" ||
    decision === "UPDATE_USER" ||
    decision === "UPDATE_SOUL" ||
    decision === "UPDATE_IDENTITY"
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function stripMdExtension(filename: string): string {
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}

function normalizeFact(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeManagedLine(line: string): string {
  return normalizeFact(
    line
      .replace(/^-+\s*/, "")
      .replace(/^\[[^\]]+\]\s*/, "")
  );
}

function extractManagedLines(content: string): string[] {
  const managedPattern = new RegExp(
    `${MANAGED_START}[\\s\\S]*?${MANAGED_END}`,
    "m"
  );
  const managedMatch = content.match(managedPattern);
  if (!managedMatch) {
    return [];
  }

  return managedMatch[0]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function upsertManagedSection(existingContent: string, section: string): string {
  const managedPattern = new RegExp(
    `${MANAGED_START}[\\s\\S]*?${MANAGED_END}`,
    "m"
  );

  if (managedPattern.test(existingContent)) {
    return existingContent.replace(managedPattern, section).trimEnd() + "\n";
  }

  const trimmed = existingContent.trimEnd();
  if (trimmed === "") {
    return `${section}\n`;
  }

  return `${trimmed}\n\n${section}\n`;
}

export class FileCurator {
  private config: FileCuratorConfig;
  private logger: Logger;

  constructor(config: FileCuratorConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async write(output: MemoryGateOutput): Promise<void> {
    if (!isUpdateDecision(output.decision)) {
      return;
    }

    const candidateFact = output.candidateFact?.trim();
    if (!candidateFact) {
      this.logger.warn("FileCurator", "Skip UPDATE_* without candidate fact", {
        decision: output.decision,
        reason: output.reason,
      });
      return;
    }

    const target = TARGETS[output.decision];
    const filePath = path.join(this.config.workspaceDir, target.filename);
    const existingContent =
      (await readFile(filePath)) ?? `# ${stripMdExtension(target.filename)}\n`;

    const existingLines = extractManagedLines(existingContent);
    const existingFactKeys = new Set(
      existingLines.map((line) => normalizeManagedLine(line))
    );
    const newFactKey = normalizeFact(candidateFact);

    if (existingFactKeys.has(newFactKey)) {
      this.logger.info("FileCurator", "Skipped duplicate curated fact", {
        decision: output.decision,
        filePath,
      });
      return;
    }

    const nextLines = [
      ...existingLines,
      `- [${new Date().toISOString()}] ${candidateFact}`,
    ].slice(-target.maxLines);

    const section = [
      MANAGED_START,
      `## ${target.title}`,
      `Updated: ${new Date().toISOString()}`,
      "",
      ...nextLines,
      MANAGED_END,
    ].join("\n");

    const nextContent = upsertManagedSection(existingContent, section);

    try {
      await writeFileWithLock(filePath, nextContent);
      this.logger.info("FileCurator", "Applied curated memory update", {
        decision: output.decision,
        filePath,
      });
    } catch (error) {
      this.logger.error("FileCurator", "Failed to apply curated memory update", {
        decision: output.decision,
        filePath,
        reason: getErrorMessage(error),
      });
    }
  }
}
