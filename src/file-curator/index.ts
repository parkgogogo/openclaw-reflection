import * as path from "path";
import type { AgentTool, LLMService, MemoryGateOutput, Logger } from "../types.js";
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

const FILE_CURATOR_SYSTEM_PROMPT = `You are the assistant's Writer Guardian.

Your job:
- Decide whether the candidate fact should update the target memory file
- Use the read tool if you need the current file content
- Use the write tool only if the target file truly should change
- If the target file should not change, finish without calling write
- If you write, preserve the candidate fact explicitly unless the exact wording is already present

You are a guardian, not an eager writer.
When in doubt, refuse.

File meanings:
- MEMORY.md: curated long-term memory. Keep durable decisions, lessons learned, shared context, and important private context. Reject fleeting chatter, short-lived project chatter, user profile facts, identity metadata, and assistant principles.
- USER.md: about your human. Keep stable preferences, collaboration style, and helpful personal context. Do not turn this into a dossier. Reject project chatter in USER.md, one-off tactics, temporary moods, and surveillance-style detail.
- SOUL.md: the assistant's enduring principles, boundaries, continuity rules, and general voice. General write-policy or disclosure-policy rules can belong here. Reject temporary tone shifts, project tactics, user profile facts, and identity metadata.
- IDENTITY.md: Identity metadata only. Keep name, creature, vibe, emoji, avatar, or equivalent identity metadata. If the candidate fact is an explicit metadata change, write it and replace existing metadata when needed. Reject anything that is not identity metadata.

Hard constraints:
- Only reason about the target file you were given
- Do not route to another file
- Do not read or infer from other files
- If you refuse, finish without calling write
- If you write, overwrite the full target file content
- Preserve useful existing structure unless there is a strong reason to reorganize`;

const TARGET_FILES: Record<UpdateDecision, CuratedFilename> = {
  UPDATE_MEMORY: "MEMORY.md",
  UPDATE_USER: "USER.md",
  UPDATE_SOUL: "SOUL.md",
  UPDATE_IDENTITY: "IDENTITY.md",
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
  private llmService: LLMService;

  constructor(config: FileCuratorConfig, logger: Logger, llmService: LLMService) {
    this.config = config;
    this.logger = logger;
    this.llmService = llmService;
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

    const tools = this.createTools(filePath, targetFile);

    try {
      const result = await this.llmService.runAgent({
        systemPrompt: FILE_CURATOR_SYSTEM_PROMPT,
        userPrompt: [
          `Memory Gate decision: ${output.decision}`,
          `Reason from gate: ${output.reason}`,
          `Candidate fact: ${candidateFact}`,
          `Target file: ${targetFile}`,
          "",
          "Decide whether this target file should change. Use read first if you need current content. If the file should change, call write with the full next file content. Otherwise finish without write.",
        ].join("\n"),
        tools,
        maxSteps: 4,
      });

      if (!result.didWrite) {
        this.logger.info("FileCurator", "Guardian refused update", {
          decision: output.decision,
          filePath,
          reason: result.finalMessage ?? "Writer guardian finished without write",
        });
        return;
      }

      this.logger.info("FileCurator", "Writer guardian rewrote target file", {
        decision: output.decision,
        filePath,
      });
    } catch (error) {
      this.logger.error("FileCurator", "Writer guardian execution failed", {
        decision: output.decision,
        filePath,
        reason: getErrorMessage(error),
      });
    }
  }

  private createTools(filePath: string, targetFile: CuratedFilename): AgentTool[] {
    return [
      {
        name: "read",
        description: `Read the current raw content of ${targetFile}`,
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => (await readFile(filePath)) ?? getDefaultContent(targetFile),
      },
      {
        name: "write",
        description: `Overwrite ${targetFile} with the provided full content`,
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string" },
          },
          required: ["content"],
          additionalProperties: false,
        },
        execute: async (input) => {
          if (
            typeof input !== "object" ||
            input === null ||
            typeof (input as { content?: unknown }).content !== "string"
          ) {
            throw new Error("write tool requires string content");
          }

          await writeFileWithLock(
            filePath,
            normalizeFileContent((input as { content: string }).content)
          );
          return "ok";
        },
      },
    ];
  }
}
