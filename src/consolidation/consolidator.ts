import * as path from "path";
import type { LLMClient, Logger } from "../types.js";
import { readFile, writeFileWithLock } from "../utils/file-utils.js";
import { CONSOLIDATION_SYSTEM_PROMPT } from "./prompt.js";
import type {
  ConsolidatedFilename,
  ConsolidationConfig,
  ConsolidationPatch,
  ConsolidationProposal,
  ConsolidationResult,
} from "./types.js";

const MANAGED_FILES: ConsolidatedFilename[] = ["MEMORY.md", "USER.md", "SOUL.md"];
const VALID_PATCH_ACTIONS = new Set<ConsolidationPatch["action"]>([
  "add",
  "replace",
  "remove",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function extractFirstJSONObject(rawText: string): string | null {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];

    if (startIndex === -1) {
      if (char === "{") {
        startIndex = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return rawText.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function splitContentLines(content: string): string[] {
  const trimmed = content.trim();
  return trimmed === "" ? [] : trimmed.split(/\r?\n/);
}

function findSectionRange(
  lines: string[],
  section: string
): { start: number; end: number } | null {
  const sectionHeader = `## ${section}`;
  const start = lines.findIndex((line) => line.trim() === sectionHeader);

  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index].trim())) {
      end = index;
      break;
    }
  }

  return { start, end };
}

function applyPatchToContent(
  existingContent: string,
  patch: ConsolidationPatch
): string {
  const lines = existingContent.replace(/\r\n/g, "\n").split("\n");
  const sectionHeader = `## ${patch.section}`;
  const contentLines = splitContentLines(patch.content);
  const range = findSectionRange(lines, patch.section);

  if (!range) {
    if (patch.action === "remove") {
      return `${existingContent.trimEnd()}\n`;
    }

    const appended = [existingContent.trimEnd(), "", sectionHeader, ...contentLines]
      .join("\n")
      .trimEnd();
    return `${appended}\n`;
  }

  const before = lines.slice(0, range.start);
  const currentBody = lines.slice(range.start + 1, range.end);
  const after = lines.slice(range.end);
  let nextBody = currentBody;

  if (patch.action === "replace") {
    nextBody = contentLines;
  } else if (patch.action === "add") {
    const existing = new Set(
      currentBody.map((line) => line.trim()).filter((line) => line !== "")
    );
    nextBody = [
      ...currentBody,
      ...contentLines.filter((line) => !existing.has(line.trim())),
    ];
  } else if (patch.action === "remove") {
    const removed = new Set(contentLines.map((line) => line.trim()));
    nextBody = currentBody.filter((line) => !removed.has(line.trim()));
  }

  return `${[...before, sectionHeader, ...nextBody, ...after].join("\n").trimEnd()}\n`;
}

function normalizePatch(value: unknown): ConsolidationPatch | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const section = getNonEmptyString(value.section);
  const action = getNonEmptyString(value.action) as ConsolidationPatch["action"] | undefined;
  const content =
    typeof value.content === "string" ? value.content : "";

  if (!section || !action || !VALID_PATCH_ACTIONS.has(action)) {
    return undefined;
  }

  return {
    section,
    action,
    content,
  };
}

export class Consolidator {
  private config: ConsolidationConfig;
  private logger: Logger;
  private llmClient: LLMClient;

  constructor(config: ConsolidationConfig, logger: Logger, llmClient: LLMClient) {
    this.config = config;
    this.logger = logger;
    this.llmClient = llmClient;
  }

  async consolidate(): Promise<ConsolidationResult> {
    const currentFiles = await this.readManagedFiles();
    const proposal = await this.generateProposal(currentFiles);

    if (proposal.decision === "NO_WRITE") {
      this.logger.info("Consolidator", "Skipped consolidation cleanup", {
        decision: proposal.decision,
      });
      return { updates: {} };
    }

    const updates = this.applyProposalToFiles(currentFiles, proposal);
    await this.writeUpdates(updates);

    this.logger.info("Consolidator", "Consolidation cleanup completed", {
      updatedFiles: Object.keys(updates),
    });

    return { updates };
  }

  private async readManagedFiles(): Promise<Record<ConsolidatedFilename, string>> {
    const files = {} as Record<ConsolidatedFilename, string>;

    for (const filename of MANAGED_FILES) {
      const filePath = path.join(this.config.workspaceDir, filename);
      files[filename] =
        (await readFile(filePath)) ?? `# ${stripMdExtension(filename)}\n`;
    }

    return files;
  }

  private buildPrompt(
    currentFiles: Record<ConsolidatedFilename, string>
  ): string {
    return [
      "Current MEMORY.md:",
      currentFiles["MEMORY.md"].trim() || "(empty)",
      "",
      "Current USER.md:",
      currentFiles["USER.md"].trim() || "(empty)",
      "",
      "Current SOUL.md:",
      currentFiles["SOUL.md"].trim() || "(empty)",
      "",
      "Return JSON only as specified in the system prompt.",
    ].join("\n");
  }

  private async generateProposal(
    currentFiles: Record<ConsolidatedFilename, string>
  ): Promise<ConsolidationProposal> {
    try {
      const response = await this.llmClient.complete(
        this.buildPrompt(currentFiles),
        CONSOLIDATION_SYSTEM_PROMPT
      );
      return this.parseResponse(response);
    } catch (error) {
      const reason = getErrorMessage(error);
      this.logger.error("Consolidator", "Consolidation LLM request failed", {
        reason,
      });
      return {
        decision: "NO_WRITE",
        proposedUpdates: {},
      };
    }
  }

  private parseResponse(response: string): ConsolidationProposal {
    const trimmedResponse = response.trim();
    const codeFenceMatch = trimmedResponse.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidateTexts: string[] = [];

    if (trimmedResponse !== "") {
      candidateTexts.push(trimmedResponse);
    }

    if (codeFenceMatch?.[1]) {
      candidateTexts.push(codeFenceMatch[1].trim());
    }

    const firstJsonObject = extractFirstJSONObject(trimmedResponse);
    if (firstJsonObject) {
      candidateTexts.push(firstJsonObject.trim());
    }

    for (const candidate of Array.from(new Set(candidateTexts))) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        const normalized = this.normalizeProposal(parsed);
        if (normalized) {
          return normalized;
        }
      } catch {
        continue;
      }
    }

    this.logger.warn("Consolidator", "Failed to parse consolidation response", {
      response: trimmedResponse,
    });

    return {
      decision: "NO_WRITE",
      proposedUpdates: {},
    };
  }

  private normalizeProposal(parsed: unknown): ConsolidationProposal | undefined {
    if (!isRecord(parsed)) {
      return undefined;
    }

    const decision =
      getNonEmptyString(parsed.decision) === "WRITE_CLEANUP"
        ? "WRITE_CLEANUP"
        : "NO_WRITE";
    const proposedRaw = isRecord(parsed.proposed_updates)
      ? parsed.proposed_updates
      : isRecord(parsed.proposedUpdates)
      ? parsed.proposedUpdates
      : {};
    const proposedUpdates: ConsolidationProposal["proposedUpdates"] = {};

    for (const filename of MANAGED_FILES) {
      const rawPatches = proposedRaw[filename];
      const patches = Array.isArray(rawPatches)
        ? rawPatches
            .map((item: unknown) => normalizePatch(item))
            .filter((item): item is ConsolidationPatch => item !== undefined)
        : [];

      if (patches.length > 0) {
        proposedUpdates[filename] = patches;
      }
    }

    return {
      decision,
      proposedUpdates,
    };
  }

  private applyProposalToFiles(
    currentFiles: Record<ConsolidatedFilename, string>,
    proposal: ConsolidationProposal
  ): ConsolidationResult["updates"] {
    const updates: ConsolidationResult["updates"] = {};

    for (const filename of MANAGED_FILES) {
      const patches = proposal.proposedUpdates[filename];
      if (!patches || patches.length === 0) {
        continue;
      }

      let nextContent = currentFiles[filename];
      for (const patch of patches) {
        nextContent = applyPatchToContent(nextContent, patch);
      }

      updates[filename] = nextContent;
    }

    return updates;
  }

  private async writeUpdates(
    updates: ConsolidationResult["updates"]
  ): Promise<void> {
    const entries = Object.entries(updates) as Array<
      [ConsolidatedFilename, string | undefined]
    >;

    for (const [filename, content] of entries) {
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
