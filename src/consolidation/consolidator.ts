import * as path from "path";
import type { Logger } from "../types.js";
import {
  listFiles,
  moveFile,
  readFile,
  writeFileWithLock,
} from "../utils/file-utils.js";
import type {
  ConsolidationConfig,
  ConsolidationResult,
  DailyEntry,
} from "./types.js";

const DAILY_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;
const ARCHIVE_AFTER_DAYS = 7;
const RECENT_DAILY_FILES = 2;
const MANAGED_START = "<!-- reflection-plugin:consolidated:start -->";
const MANAGED_END = "<!-- reflection-plugin:consolidated:end -->";
const MAX_MEMORY_FACTS = 50;
const MAX_USER_FACTS = 20;
const MAX_SOUL_FACTS = 20;
const MIN_STABLE_OCCURRENCES = 2;

interface ParsedDailyEntry extends DailyEntry {
  date: string;
}

interface FactRecord {
  date: string;
  time: string;
  fact: string;
}

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function stripMdExtension(filename: string): string {
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeFact(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function isUserFact(value: string): boolean {
  return /(preference|habit|timezone|language|work style|red line|dislike|偏好|习惯|时区|语言|工作风格|红线|反感|喜欢|不喜欢)/i.test(
    value
  );
}

function isSoulFact(value: string): boolean {
  return /(principle|boundary|value|tone|style|constraint|policy|人格|独立|原则|边界|价值排序|语气|风格|约束|关系模型|回复方式)/i.test(
    value
  );
}

function formatFactLine(record: FactRecord): string {
  const timePart = record.time ? ` ${record.time}` : "";
  return `- [${record.date}${timePart}] ${record.fact}`;
}

function upsertManagedSection(existingContent: string, section: string): string {
  const managedPattern = new RegExp(`${MANAGED_START}[\\s\\S]*?${MANAGED_END}`, "m");

  if (managedPattern.test(existingContent)) {
    return existingContent.replace(managedPattern, section).trimEnd() + "\n";
  }

  const trimmed = existingContent.trimEnd();
  if (trimmed === "") {
    return `${section}\n`;
  }

  return `${trimmed}\n\n${section}\n`;
}

function parseDailyEntries(content: string): DailyEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: DailyEntry[] = [];

  let currentEntry: DailyEntry | null = null;
  let activeSection: "context" | "decisions" | "next" | null = null;

  const flushCurrentEntry = (): void => {
    if (!currentEntry) {
      return;
    }

    if (
      currentEntry.context !== "" ||
      currentEntry.decisions.length > 0 ||
      currentEntry.next.length > 0
    ) {
      entries.push(currentEntry);
    }

    currentEntry = null;
    activeSection = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^##\s+\[(.+?)\]\s*$/);

    if (headingMatch) {
      flushCurrentEntry();
      currentEntry = {
        time: headingMatch[1],
        context: "",
        decisions: [],
        next: [],
      };
      continue;
    }

    if (!currentEntry) {
      continue;
    }

    if (trimmed === "Context:") {
      activeSection = "context";
      continue;
    }

    if (trimmed === "Decisions:") {
      activeSection = "decisions";
      continue;
    }

    if (trimmed === "Next:") {
      activeSection = "next";
      continue;
    }

    if (trimmed === "") {
      continue;
    }

    const bulletValue = trimmed.startsWith("- ")
      ? normalizeWhitespace(trimmed.slice(2))
      : normalizeWhitespace(trimmed);

    if (bulletValue === "") {
      continue;
    }

    if (activeSection === "context") {
      currentEntry.context =
        currentEntry.context === ""
          ? bulletValue
          : `${currentEntry.context} ${bulletValue}`;
      continue;
    }

    if (activeSection === "decisions") {
      currentEntry.decisions.push(bulletValue);
      continue;
    }

    if (activeSection === "next") {
      currentEntry.next.push(bulletValue);
    }
  }

  flushCurrentEntry();

  return entries;
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
    const archived = await this.archiveOldFiles(dailyFiles);
    const activeDailyFiles = dailyFiles
      .filter((file) => !archived.includes(file))
      .sort();
    const scopedDailyFiles = activeDailyFiles.slice(-RECENT_DAILY_FILES);
    const parsedEntries = await this.parseDailyFiles(scopedDailyFiles);

    if (parsedEntries.length < this.config.minDailyEntries) {
      this.logger.info(
        "Consolidator",
        "Skipped updates: insufficient recent daily entries",
        {
          totalDailyFiles: dailyFiles.length,
          activeDailyFiles: activeDailyFiles.length,
          scopedDailyFiles: scopedDailyFiles.length,
          archivedCount: archived.length,
          parsedEntries: parsedEntries.length,
          minDailyEntries: this.config.minDailyEntries,
        }
      );

      return {
        updates: {},
        archived,
      };
    }

    const updates = await this.generateUpdates(parsedEntries);
    await this.writeUpdates(updates);

    this.logger.info("Consolidator", "Consolidation run completed", {
      totalDailyFiles: dailyFiles.length,
      activeDailyFiles: activeDailyFiles.length,
      scopedDailyFiles: scopedDailyFiles.length,
      archivedCount: archived.length,
      parsedEntries: parsedEntries.length,
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

      try {
        await moveFile(fromPath, toPath);
        archived.push(file);

        this.logger.info("Consolidator", "Archived old daily file", {
          file,
          fromPath,
          toPath,
        });
      } catch (error) {
        this.logger.error("Consolidator", "Failed to archive daily file", {
          file,
          fromPath,
          toPath,
          reason: getErrorMessage(error),
        });
      }
    }

    return archived;
  }

  private async parseDailyFiles(dailyFiles: string[]): Promise<ParsedDailyEntry[]> {
    const parsed: ParsedDailyEntry[] = [];

    for (const file of dailyFiles) {
      const filePath = path.join(this.config.memoryDir, file);

      try {
        const content = await readFile(filePath);
        if (content === null) {
          continue;
        }

        const date = stripMdExtension(file);
        const entries = parseDailyEntries(content);

        for (const entry of entries) {
          parsed.push({
            date,
            time: normalizeWhitespace(entry.time),
            context: normalizeWhitespace(entry.context),
            decisions: entry.decisions.map((decision) => normalizeWhitespace(decision)),
            next: entry.next.map((item) => normalizeWhitespace(item)),
          });
        }
      } catch (error) {
        this.logger.warn("Consolidator", "Failed to parse daily file", {
          file,
          filePath,
          reason: getErrorMessage(error),
        });
      }
    }

    return parsed;
  }

  private collectChronologicalFacts(entries: ParsedDailyEntry[]): FactRecord[] {
    const chronologicalFacts: FactRecord[] = [];

    for (const entry of entries) {
      for (const decision of entry.decisions) {
        if (decision === "") {
          continue;
        }

        chronologicalFacts.push({
          date: entry.date,
          time: entry.time,
          fact: decision,
        });
      }

      for (const nextItem of entry.next) {
        if (nextItem === "") {
          continue;
        }

        chronologicalFacts.push({
          date: entry.date,
          time: entry.time,
          fact: nextItem,
        });
      }
    }

    return chronologicalFacts;
  }

  private dedupeByLatest(records: FactRecord[]): FactRecord[] {
    const seenFacts = new Set<string>();
    const dedupedReversed: FactRecord[] = [];

    for (let index = records.length - 1; index >= 0; index -= 1) {
      const fact = records[index];
      const normalized = normalizeFact(fact.fact);

      if (normalized === "" || seenFacts.has(normalized)) {
        continue;
      }

      seenFacts.add(normalized);
      dedupedReversed.push(fact);
    }

    dedupedReversed.reverse();
    return dedupedReversed;
  }

  private collectFactRecords(entries: ParsedDailyEntry[]): FactRecord[] {
    return this.dedupeByLatest(this.collectChronologicalFacts(entries));
  }

  private collectStableFactRecords(
    entries: ParsedDailyEntry[],
    predicate: (value: string) => boolean
  ): FactRecord[] {
    const allFacts = this.collectChronologicalFacts(entries).filter(
      (record) => record.fact !== "" && predicate(record.fact)
    );
    const occurrences = new Map<string, number>();

    for (const record of allFacts) {
      const key = normalizeFact(record.fact);
      if (key === "") {
        continue;
      }

      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    }

    const stableFacts = allFacts.filter((record) => {
      const key = normalizeFact(record.fact);
      return (occurrences.get(key) ?? 0) >= MIN_STABLE_OCCURRENCES;
    });

    return this.dedupeByLatest(stableFacts);
  }

  private async generateUpdates(
    entries: ParsedDailyEntry[]
  ): Promise<ConsolidationResult["updates"]> {
    const updates: ConsolidationResult["updates"] = {};
    const facts = this.collectFactRecords(entries);

    if (facts.length === 0) {
      return updates;
    }

    const memoryLines = facts.slice(-MAX_MEMORY_FACTS).map(formatFactLine);
    const userLines = this.collectStableFactRecords(entries, isUserFact)
      .slice(-MAX_USER_FACTS)
      .map(formatFactLine);
    const soulLines = this.collectStableFactRecords(entries, isSoulFact)
      .slice(-MAX_SOUL_FACTS)
      .map(formatFactLine);

    if (memoryLines.length > 0) {
      updates["MEMORY.md"] = await this.buildUpdatedFile(
        "MEMORY.md",
        "Consolidated Memory Facts",
        memoryLines
      );
    }

    if (userLines.length > 0) {
      updates["USER.md"] = await this.buildUpdatedFile(
        "USER.md",
        "Consolidated User Facts",
        userLines
      );
    }

    if (soulLines.length > 0) {
      updates["SOUL.md"] = await this.buildUpdatedFile(
        "SOUL.md",
        "Consolidated Soul Facts",
        soulLines
      );
    }

    return updates;
  }

  private async buildUpdatedFile(
    filename: "MEMORY.md" | "USER.md" | "SOUL.md",
    title: string,
    lines: string[]
  ): Promise<string> {
    const filePath = path.join(this.config.workspaceDir, filename);
    const existingContent = (await readFile(filePath)) ?? `# ${stripMdExtension(filename)}\n`;

    const section = [
      MANAGED_START,
      `## ${title}`,
      `Updated: ${new Date().toISOString()}`,
      "",
      ...lines,
      MANAGED_END,
    ].join("\n");

    return upsertManagedSection(existingContent, section);
  }

  private async writeUpdates(
    updates: ConsolidationResult["updates"]
  ): Promise<void> {
    const updateEntries = Object.entries(updates) as Array<
      ["MEMORY.md" | "USER.md" | "SOUL.md", string | undefined]
    >;

    for (const [filename, content] of updateEntries) {
      if (typeof content !== "string") {
        continue;
      }

      const filePath = path.join(this.config.workspaceDir, filename);

      try {
        await writeFileWithLock(filePath, content);
      } catch (error) {
        this.logger.error("Consolidator", "Failed to write consolidated file", {
          filename,
          filePath,
          reason: getErrorMessage(error),
        });
      }
    }
  }
}
