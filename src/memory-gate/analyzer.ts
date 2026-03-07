import type { JsonSchema, LLMService, Logger } from "../types.js";
import { MEMORY_GATE_SYSTEM_PROMPT } from "./prompt.js";
import type {
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

const MEMORY_GATE_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "reason"],
  properties: {
    decision: {
      type: "string",
      enum: [
        "NO_WRITE",
        "UPDATE_MEMORY",
        "UPDATE_USER",
        "UPDATE_SOUL",
        "UPDATE_IDENTITY",
      ],
    },
    reason: { type: "string" },
    candidate_fact: { type: "string" },
  },
};

export class MemoryGateAnalyzer {
  private llmService: LLMService;
  private logger: Logger;

  constructor(llmService: LLMService, logger: Logger) {
    this.llmService = llmService;
    this.logger = logger;
  }

  async analyze(input: MemoryGateInput): Promise<MemoryGateOutput> {
    const prompt = this.buildPrompt(input);

    this.logger.debug("MemoryGateAnalyzer", "Starting memory gate analysis", {
      recentMessages: input.recentMessages.length,
      hasCurrentUserMessage: input.currentUserMessage.trim() !== "",
      hasCurrentAgentReply: input.currentAgentReply.trim() !== "",
    });

    let response: {
      decision: MemoryDecision;
      reason: string;
      candidate_fact?: string;
    };

    try {
      response = await this.llmService.generateObject({
        systemPrompt: MEMORY_GATE_SYSTEM_PROMPT,
        userPrompt: prompt,
        schema: MEMORY_GATE_RESPONSE_SCHEMA,
      });
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

    const output = this.normalizeOutput(response);

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

  private normalizeOutput(parsed: {
    decision: MemoryDecision;
    reason: string;
    candidate_fact?: string;
  }): MemoryGateOutput {
    const decision = parsed.decision;
    if (!VALID_DECISIONS.has(decision)) {
      return {
        decision: "NO_WRITE",
        reason: "Invalid decision returned by memory gate",
      };
    }

    const reason = getNonEmptyString(parsed.reason) ?? "No reason provided";
    const candidateFact = getNonEmptyString(parsed.candidate_fact);
    const normalizedDecision = decision;

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
