import * as path from "path";
import type { LLMClient, MemoryGateOutput, Logger } from "../types.js";
import { readFile, writeFileWithLock } from "../utils/file-utils.js";

type UpdateDecision =
  | "UPDATE_MEMORY"
  | "UPDATE_USER"
  | "UPDATE_SOUL"
  | "UPDATE_IDENTITY";

type CuratedFilename = "MEMORY.md" | "USER.md" | "SOUL.md" | "IDENTITY.md";

interface FileCuratorConfig {
  workspaceDir: string;
}

interface CuratorResponse {
  shouldUpdate: boolean;
  file: CuratedFilename;
  reason: string;
  nextContent?: string;
}

const FILE_CURATOR_SYSTEM_PROMPT = `You are Lia's Writer Guardian.

Your job:
- Read the current raw content of exactly one target memory file
- Understand that file's OpenClaw meaning
- Decide whether the candidate fact should update that file
- If yes, rewrite the entire target file content
- If no, refuse the write

You are a guardian, not an eager writer.
When in doubt, refuse.

File meanings:
- MEMORY.md: Long-term memory. Keep durable facts, important decisions, stable preferences, ongoing projects, and active threads that will matter later. Avoid fleeting chatter, one-off moods, or duplicated noise.
- USER.md: about your human. Keep stable preferences, working style, recurring goals, projects, red lines, and collaboration patterns. Do not turn this into a dossier. Avoid one-time emotions, transient context, or surveillance-style detail.
- SOUL.md: Lia's core self. Keep enduring behavioral principles, boundaries, voice, continuity, and identity-level style. Updates should be rare. Reject temporary tone shifts, moods, or tactical choices that do not reflect the core self.
- IDENTITY.md: Identity metadata only. Keep name, creature, vibe, emoji, avatar, or equivalent identity metadata. Updates should be extremely rare. Reject anything that is not identity metadata.

Hard constraints:
- Only reason about the target file you were given
- Do not route to another file
- Do not read or infer from other files
- If you refuse, do not propose an alternative destination
- If you write, preserve the useful existing structure unless there is a strong reason to reorganize
- Output JSON only

Output schema:
{
  "should_update": true,
  "file": "MEMORY.md|USER.md|SOUL.md|IDENTITY.md",
  "reason": "why write or refuse",
  "next_content": "# FULL FILE CONTENT..."
}`;

const TARGET_FILES: Record<UpdateDecision, CuratedFilename> = {
  UPDATE_MEMORY: "MEMORY.md",
  UPDATE_USER: "USER.md",
  UPDATE_SOUL: "SOUL.md",
  UPDATE_IDENTITY: "IDENTITY.md",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

function getDefaultContent(targetFile: CuratedFilename): string {
  return `# ${targetFile.replace(/\.md$/, "")}\n`;
}

function normalizeFileContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export class FileCurator {
  private config: FileCuratorConfig;
  private logger: Logger;
  private llmClient: LLMClient;

  constructor(config: FileCuratorConfig, logger: Logger, llmClient: LLMClient) {
    this.config = config;
    this.logger = logger;
    this.llmClient = llmClient;
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

    const targetFile = TARGET_FILES[output.decision];
    const filePath = path.join(this.config.workspaceDir, targetFile);
    const existingContent =
      (await readFile(filePath)) ?? getDefaultContent(targetFile);

    const response = await this.generateRewrite(
      output,
      targetFile,
      existingContent
    );

    if (!response.shouldUpdate) {
      this.logger.info("FileCurator", "Guardian refused update", {
        decision: output.decision,
        filePath,
        reason: response.reason,
      });
      return;
    }

    if (!response.nextContent) {
      this.logger.warn("FileCurator", "Guardian approved update without content", {
        decision: output.decision,
        filePath,
        reason: response.reason,
      });
      return;
    }

    const nextContent = normalizeFileContent(response.nextContent);

    try {
      await writeFileWithLock(filePath, nextContent);
      this.logger.info("FileCurator", "Writer guardian rewrote target file", {
        decision: output.decision,
        filePath,
      });
    } catch (error) {
      this.logger.error("FileCurator", "Failed to rewrite target file", {
        decision: output.decision,
        filePath,
        reason: getErrorMessage(error),
      });
    }
  }

  private async generateRewrite(
    output: MemoryGateOutput,
    targetFile: CuratedFilename,
    existingContent: string
  ): Promise<CuratorResponse> {
    const prompt = [
      `Memory Gate decision: ${output.decision}`,
      `Candidate fact: ${output.candidateFact ?? "(none)"}`,
      `Reason from gate: ${output.reason}`,
      `Target file: ${targetFile}`,
      "",
      "Current file content:",
      existingContent.trim() || "(empty)",
      "",
      "Return JSON only as specified in the system prompt.",
    ].join("\n");

    try {
      const response = await this.llmClient.complete(
        prompt,
        FILE_CURATOR_SYSTEM_PROMPT
      );
      return this.parseResponse(response, targetFile);
    } catch (error) {
      const reason = getErrorMessage(error);
      this.logger.error("FileCurator", "Writer guardian LLM request failed", {
        decision: output.decision,
        file: targetFile,
        reason,
      });
      return {
        shouldUpdate: false,
        file: targetFile,
        reason,
      };
    }
  }

  private parseResponse(
    response: string,
    targetFile: CuratedFilename
  ): CuratorResponse {
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
        const normalized = this.normalizeResponse(parsed, targetFile);
        if (normalized) {
          return normalized;
        }
      } catch {
        continue;
      }
    }

    this.logger.warn("FileCurator", "Failed to parse writer guardian response", {
      file: targetFile,
      response: trimmedResponse,
    });

    return {
      shouldUpdate: false,
      file: targetFile,
      reason: "Failed to parse writer guardian response",
    };
  }

  private normalizeResponse(
    parsed: unknown,
    targetFile: CuratedFilename
  ): CuratorResponse | undefined {
    if (!isRecord(parsed)) {
      return undefined;
    }

    const shouldUpdate =
      typeof parsed.should_update === "boolean"
        ? parsed.should_update
        : typeof parsed.shouldUpdate === "boolean"
        ? parsed.shouldUpdate
        : false;

    const file = getNonEmptyString(parsed.file) === targetFile ? targetFile : targetFile;
    const reason = getNonEmptyString(parsed.reason) ?? "No reason provided";
    const nextContent =
      getNonEmptyString(parsed.next_content) ?? getNonEmptyString(parsed.nextContent);

    return {
      shouldUpdate,
      file,
      reason,
      nextContent,
    };
  }
}
