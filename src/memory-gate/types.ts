export type MemoryDecision =
  | "NO_WRITE"
  | "WRITE_DAILY"
  | "UPDATE_MEMORY"
  | "UPDATE_USER"
  | "UPDATE_SOUL"
  | "UPDATE_IDENTITY";

export interface MemoryGateOutput {
  decision: MemoryDecision;
  reason: string;
  candidateFact?: string;
}

export interface MemoryGateInput {
  recentMessages: Array<{
    role: "user" | "agent";
    message: string;
    timestamp: number;
  }>;
  currentUserMessage: string;
  currentAgentReply: string;
}

export interface LLMClient {
  complete(prompt: string, systemPrompt: string): Promise<string>;
}
