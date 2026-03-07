export type JsonSchema =
  | {
      type: "string";
      description?: string;
      enum?: string[];
    }
  | {
      type: "boolean";
      description?: string;
    }
  | {
      type: "array";
      description?: string;
      items: JsonSchema;
    }
  | {
      type: "object";
      description?: string;
      properties: Record<string, JsonSchema>;
      required?: string[];
      additionalProperties?: boolean;
    };

export interface GenerateObjectParams<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: JsonSchema;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute(input: unknown): Promise<string>;
}

export interface RunAgentParams {
  systemPrompt: string;
  userPrompt: string;
  tools: AgentTool[];
  maxSteps: number;
}

export interface AgentStep {
  type: "assistant" | "tool";
  response?: unknown;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
}

export interface AgentRunResult {
  steps: AgentStep[];
  didWrite: boolean;
  finalMessage?: string;
}

export interface CompletionResponseFormat {
  type: "json_schema";
  jsonSchema: JsonSchema;
}

export interface LLMCompleteParams {
  prompt: string;
  systemPrompt: string;
  responseFormat?: CompletionResponseFormat;
}

export interface LLMProvider {
  complete(input: LLMCompleteParams): Promise<unknown>;
}

export interface LLMService {
  generateObject<T>(params: GenerateObjectParams<T>): Promise<T>;
  runAgent(params: RunAgentParams): Promise<AgentRunResult>;
}
