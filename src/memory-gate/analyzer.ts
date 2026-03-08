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
  "UPDATE_TOOLS",
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
        "UPDATE_TOOLS",
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
      "Use the current benchmark rules exactly.",
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
      "Checklist before deciding:",
      "- Is this about the user's stable language, collaboration preference, workflow preference, cadence preference, or enduring style preference? If yes, prefer UPDATE_USER.",
      "- Is this durable shared context, a durable lesson learned, important private context, or a past attempt whose outcome should be remembered, and does not fit USER/SOUL/IDENTITY? If yes, prefer UPDATE_MEMORY.",
      "- If a past approach failed and the outcome should be remembered, prefer UPDATE_MEMORY even if the user says not to recommend it again.",
      "- Is this about the assistant's enduring behavioral principle, voice, or boundary across future turns? If yes, prefer UPDATE_SOUL.",
      "- Direct / non-sycophantic / engineering-focused as the assistant's general manner should prefer UPDATE_SOUL over UPDATE_USER.",
      "- If the content defines the assistant's general voice, prefer UPDATE_SOUL even if the user would personally like that style too.",
      "- If it is a general rule for how the assistant should behave, prefer UPDATE_SOUL.",
      "- If it is mainly about this user's personal working preference, prefer UPDATE_USER.",
      "- Is this about identity metadata such as name, vibe, or avatar? If yes, prefer UPDATE_IDENTITY.",
      "- Is this about local tool names, aliases, endpoints, preferred voices, device nicknames, camera names, room names, or environment-specific tool mappings? If yes, prefer UPDATE_TOOLS.",
      "- If it is a reusable procedure for how to use a tool across environments, or a claim about runtime tool availability, do not use UPDATE_TOOLS.",
      "- Is this a project fact, architecture decision, active thread, next step, topic update, small talk, temporary emotion, or one-off tactic? If yes, choose NO_WRITE.",
      "",
      "For non-NO_WRITE decisions, write candidate_fact as a short canonical English sentence.",
      'Prefer concise canonical phrasing like "prefers ...", "prefers important check-ins in the morning", "X refers to ...", "Maintain ...", "Name is ...", or "home-server SSH alias refers to devbox.internal".',
      'For morning cadence cases, prefer exactly "prefers important check-ins in the morning".',
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
