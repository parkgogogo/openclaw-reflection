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
    success?: boolean;
  };
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
