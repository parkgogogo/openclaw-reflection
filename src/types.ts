export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ): void;
  info(
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ): void;
  warn(
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ): void;
  error(
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ): void;
}

export interface ReflectionMessage {
  id: string;
  role: "user" | "agent";
  message: string;
  timestamp: number;
  sessionKey: string;
  channelId: string;
  metadata?: {
    from?: string;
    to?: string;
    messageId?: string;
    accountId?: string;
    success?: boolean;
  };
}

export interface MessageHookContext {
  channelId?: string;
  accountId?: string;
  conversationId?: string;
}

export interface MessageReceivedHookMetadata {
  to?: string;
  provider?: string;
  surface?: string;
  originatingChannel?: string;
  originatingTo?: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
  guildId?: string;
}

export interface MessageReceivedHookEvent {
  from?: string;
  content?: string;
  timestamp?: number;
  metadata?: MessageReceivedHookMetadata;
}

export interface MessageReactionInput {
  channelId: string;
  target: string;
  messageId: string;
  emoji: string;
  accountId?: string;
}

export interface MessageReactionService {
  reactToMessage(input: MessageReactionInput): Promise<boolean>;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  sessionKey?: string;
  event: string;
  details?: Record<string, unknown>;
}

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

export interface MemoryGateConfig {
  enabled: boolean;
  windowSize: number;
}

export interface ConsolidationConfig {
  enabled: boolean;
  schedule: string;
}

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface PluginConfig {
  bufferSize: number;
  logLevel: LogLevel;
  llm: LLMConfig;
  memoryGate: MemoryGateConfig;
  consolidation: ConsolidationConfig;
}

export type ManagedFileName =
  | "MEMORY.md"
  | "USER.md"
  | "SOUL.md"
  | "IDENTITY.md"
  | "TOOLS.md";

export type ManagedFactId = string;

export type ReflectionProposalId = string;

export type ReflectionProposalAction = "delete" | "edit" | "move";

export type ReflectionProposalStatus = "pending" | "applied" | "discarded";

export type ManagedFileHealth = "healthy" | "drifted" | "has_pending_proposal";

export interface FactProvenanceSummary {
  sourceMessageId?: string;
  sessionKey?: string;
  decision: MemoryDecision;
  reason: string;
  recordedAt: string;
}

export interface ProposalSummary {
  id: ReflectionProposalId;
  action: ReflectionProposalAction;
  status: ReflectionProposalStatus;
  factId: ManagedFactId;
  fileName: ManagedFileName;
  createdAt: string;
}

export interface ProposalDetail extends ProposalSummary {
  proposedText?: string;
  targetFileName?: ManagedFileName;
  diff: string;
}

export type { MemoryGateInput } from "./memory-gate/types.js";
export type {
  AgentRunResult,
  AgentStep,
  AgentTool,
  GenerateObjectParams,
  JsonSchema,
  LLMService,
  LLMServiceConfig,
  LLMServiceOptions,
  RunAgentParams,
} from "./llm/types.js";
export type {
  ConsolidatedFilename,
  ConsolidationPatch,
  ConsolidationProposal,
  ConsolidationResult,
} from "./consolidation/types.js";
