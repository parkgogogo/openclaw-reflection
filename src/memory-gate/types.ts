export type MemoryDecision =
  | "NO_WRITE"
  | "UPDATE_MEMORY"
  | "UPDATE_USER"
  | "UPDATE_SOUL"
  | "UPDATE_IDENTITY"
  | "UPDATE_TOOLS";

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
