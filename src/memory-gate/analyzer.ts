import type { Logger } from "../types.js";
import { MEMORY_GATE_SYSTEM_PROMPT } from "./prompt.js";
import type {
  LLMClient,
  MemoryDecision,
  MemoryGateInput,
  MemoryGateOutput,
} from "./types.js";

const VALID_DECISIONS: ReadonlySet<MemoryDecision> = new Set([
  "NO_WRITE",
  "UPDATE_MEMORY",
  "UPDATE_USER",
  "UPDATE_SOUL",
  "UPDATE_IDENTITY",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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

export class MemoryGateAnalyzer {
  private llmClient: LLMClient;
  private logger: Logger;

  constructor(llmClient: LLMClient, logger: Logger) {
    this.llmClient = llmClient;
    this.logger = logger;
  }

  async analyze(input: MemoryGateInput): Promise<MemoryGateOutput> {
    const prompt = this.buildPrompt(input);

    this.logger.debug("MemoryGateAnalyzer", "Starting memory gate analysis", {
      recentMessages: input.recentMessages.length,
      hasCurrentUserMessage: input.currentUserMessage.trim() !== "",
      hasCurrentAgentReply: input.currentAgentReply.trim() !== "",
    });

    let response: string;

    try {
      response = await this.llmClient.complete(prompt, MEMORY_GATE_SYSTEM_PROMPT);
    } catch (error) {
      const reason = `LLM request failed: ${getErrorMessage(error)}`;
      this.logger.error("MemoryGateAnalyzer", "Memory gate LLM request failed", {
        reason,
      });
      return {
        decision: "NO_WRITE",
        reason,
      };
    }

    const output = this.parseResponse(response);

    this.logger.info("MemoryGateAnalyzer", "Memory gate decision generated", {
      decision: output.decision,
      reason: output.reason,
      hasCandidateFact: Boolean(output.candidateFact),
    });

    return output;
  }

  buildPrompt(input: MemoryGateInput): string {
    const recentMessagesBlock =
      input.recentMessages.length === 0
        ? "(none)"
        : input.recentMessages
            .map((item, index) => {
              const isoTimestamp = new Date(item.timestamp).toISOString();
              return `${index + 1}. [${isoTimestamp}] ${item.role}: ${item.message}`;
            })
            .join("\n");

    return [
      "Evaluate whether this turn should update memory files.",
      "",
      "Recent messages (oldest to newest):",
      recentMessagesBlock,
      "",
      "Current user message:",
      input.currentUserMessage,
      "",
      "Current agent reply:",
      input.currentAgentReply,
      "",
      "Return JSON only as specified in the system prompt.",
    ].join("\n");
  }

  parseResponse(response: string): MemoryGateOutput {
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

    const dedupedCandidates = Array.from(new Set(candidateTexts));

    for (const candidate of dedupedCandidates) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        const normalized = this.normalizeOutput(parsed);
        if (normalized) {
          return normalized;
        }
      } catch {
        continue;
      }
    }

    this.logger.warn("MemoryGateAnalyzer", "Failed to parse memory gate response", {
      response: trimmedResponse,
    });

    return {
      decision: "NO_WRITE",
      reason: "Failed to parse memory gate response as JSON",
    };
  }

  private normalizeOutput(parsed: unknown): MemoryGateOutput | null {
    if (!isRecord(parsed)) {
      return null;
    }

    const decision = parsed.decision;
    if (typeof decision !== "string" || !VALID_DECISIONS.has(decision as MemoryDecision)) {
      return {
        decision: "NO_WRITE",
        reason: "Invalid decision returned by memory gate",
      };
    }

    const reason = getNonEmptyString(parsed.reason) ?? "No reason provided";
    const candidateFact =
      getNonEmptyString(parsed.candidate_fact) ??
      getNonEmptyString(parsed.candidateFact);
    const normalizedDecision = decision as MemoryDecision;

    if (normalizedDecision !== "NO_WRITE" && !candidateFact) {
      return {
        decision: "NO_WRITE",
        reason: "Missing candidate_fact for non-NO_WRITE decision",
      };
    }

    if (candidateFact) {
      return {
        decision: normalizedDecision,
        reason,
        candidateFact,
      };
    }

    return {
      decision: normalizedDecision,
      reason,
    };
  }
}
