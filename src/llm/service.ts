import type {
  AgentRunResult,
  AgentStep,
  AgentTool,
  GenerateObjectParams,
  JsonSchema,
  LLMService as LLMServiceContract,
  LLMServiceConfig,
  LLMServiceOptions,
  FetchLike,
  RunAgentParams,
} from "./types.js";

type ObjectSchema = Extract<JsonSchema, { type: "object" }>;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
      tool_calls?: unknown;
      function_call?: unknown;
    };
  }>;
}

interface AgentToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ObjectSchema;
    strict: true;
  };
}

interface AgentToolCallResponse {
  id: string;
  name: string;
  input: unknown;
}

interface AgentToolCallRequest {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

type AgentRequestMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string | null;
      tool_calls: AgentToolCallRequest[];
    }
  | {
      role: "tool";
      tool_call_id: string;
      content: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  path = "$"
): string[] {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") {
        return [`${path} should be a string`];
      }

      if (schema.enum && !schema.enum.includes(value)) {
        return [`${path} should be one of: ${schema.enum.join(", ")}`];
      }

      return [];
    }
    case "boolean": {
      return typeof value === "boolean" ? [] : [`${path} should be a boolean`];
    }
    case "array": {
      if (!Array.isArray(value)) {
        return [`${path} should be an array`];
      }

      return value.flatMap((item, index) =>
        validateAgainstSchema(item, schema.items, `${path}[${index}]`)
      );
    }
    case "object": {
      if (!isRecord(value) || Array.isArray(value)) {
        return [`${path} should be an object`];
      }

      const errors: string[] = [];
      const required = new Set(schema.required ?? []);

      for (const key of required) {
        if (!(key in value)) {
          errors.push(`${path}.${key} is required`);
        }
      }

      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (key in value) {
          errors.push(
            ...validateAgainstSchema(value[key], propertySchema, `${path}.${key}`)
          );
        }
      }

      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in schema.properties)) {
            errors.push(`${path}.${key} is not allowed`);
          }
        }
      }

      return errors;
    }
  }
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
}

function extractAssistantMessage(response: unknown): {
  content?: unknown;
  tool_calls?: unknown;
} {
  if (!isRecord(response)) {
    throw new Error("Provider returned non-object response");
  }

  const parsed = response as ChatCompletionResponse;
  const message = parsed.choices?.[0]?.message;

  if (!isRecord(message)) {
    throw new Error("Provider returned empty assistant message");
  }

  if (message.function_call !== undefined) {
    throw new Error(
      "Provider returned legacy function_call payload; expected tool_calls"
    );
  }

  return message;
}

function extractMessageContent(response: unknown): string {
  const content = extractAssistantMessage(response).content;

  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Provider returned empty message content");
  }

  return content;
}

function parseStrictJSONObject(text: string, context = "content"): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Provider returned invalid JSON ${context}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function getToolInputSchema(tool: AgentTool): ObjectSchema {
  if (tool.inputSchema.type !== "object") {
    throw new Error(`Tool ${tool.name} input schema must be an object schema`);
  }

  return tool.inputSchema;
}

function parseAssistantToolCalls(rawToolCalls: unknown): AgentToolCallResponse[] {
  if (rawToolCalls === undefined) {
    return [];
  }

  if (!Array.isArray(rawToolCalls)) {
    throw new Error("Provider returned invalid tool_calls payload");
  }

  return rawToolCalls.map((rawToolCall, index) => {
    if (!isRecord(rawToolCall)) {
      throw new Error("Provider returned invalid tool call entry");
    }

    const type = rawToolCall.type;
    if (typeof type === "string" && type !== "function") {
      throw new Error(`Unsupported tool call type: ${type}`);
    }

    if (!isRecord(rawToolCall.function)) {
      throw new Error("Provider returned tool call without function payload");
    }

    const name = rawToolCall.function.name;
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error("Provider returned tool call without function name");
    }

    const argumentsText = rawToolCall.function.arguments;
    if (typeof argumentsText !== "string") {
      throw new Error(`Provider returned non-string arguments for tool ${name}`);
    }

    const id =
      typeof rawToolCall.id === "string" && rawToolCall.id.trim() !== ""
        ? rawToolCall.id
        : `tool_call_${index + 1}`;

    return {
      id,
      name,
      input: parseToolInputArguments(argumentsText, name),
    };
  });
}

function normalizeAssistantMessage(content: unknown): string | undefined {
  if (typeof content !== "string") {
    return undefined;
  }

  const text = content.trim();
  return text === "" ? undefined : text;
}

function parseToolInputArguments(argumentsText: string, toolName: string): unknown {
  if (argumentsText.trim() === "") {
    return {};
  }

  return parseStrictJSONObject(argumentsText, `arguments for tool ${toolName}`);
}

export class LLMService implements LLMServiceContract {
  private config: LLMServiceConfig;
  private fetchImpl: FetchLike;

  constructor(config: LLMServiceConfig, options: LLMServiceOptions = {}) {
    this.config = config;
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const resolvedFetch = options.fetch ?? globalFetch;

    if (typeof resolvedFetch !== "function") {
      throw new Error("Global fetch is unavailable");
    }

    this.fetchImpl = resolvedFetch;
  }

  async generateObject<T>(params: GenerateObjectParams<T>): Promise<T> {
    const parsed = await this.requestJSON({
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      schema: params.schema,
      schemaName: "structured_output",
    });
    const errors = validateAgainstSchema(parsed, params.schema);

    if (errors.length > 0) {
      throw new Error(`Schema validation failed: ${errors.join("; ")}`);
    }

    return parsed as T;
  }

  async runAgent(params: RunAgentParams): Promise<AgentRunResult> {
    const steps: AgentStep[] = [];
    let didWrite = false;
    const tools = new Map(params.tools.map((tool) => [tool.name, tool]));
    const toolDefinitions: AgentToolDefinition[] = params.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: getToolInputSchema(tool),
        strict: true,
      },
    }));
    const messages: AgentRequestMessage[] = [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ];

    for (let stepIndex = 0; stepIndex < params.maxSteps; stepIndex += 1) {
      const responsePayload = await this.requestChatCompletion({
        messages,
        tools: toolDefinitions,
        tool_choice: "auto",
      });
      const assistantMessage = extractAssistantMessage(responsePayload);
      const toolCalls = parseAssistantToolCalls(assistantMessage.tool_calls);

      if (toolCalls.length === 0) {
        const finalMessage = normalizeAssistantMessage(assistantMessage.content);
        steps.push({
          type: "assistant",
          response: { action: "finish", message: finalMessage },
        });
        return {
          steps,
          didWrite,
          finalMessage,
        };
      }

      const assistantToolCalls: AgentToolCallRequest[] = toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.input),
        },
      }));

      steps.push({
        type: "assistant",
        response: {
          action: "tool",
          tool_calls: toolCalls.map((toolCall) => ({
            tool_name: toolCall.name,
            tool_input: toolCall.input,
          })),
        },
      });
      messages.push({
        role: "assistant",
        content: typeof assistantMessage.content === "string" ? assistantMessage.content : null,
        tool_calls: assistantToolCalls,
      });

      for (const toolCall of toolCalls) {
        const tool = tools.get(toolCall.name);
        if (!tool) {
          throw new Error(`Agent requested unknown tool: ${toolCall.name}`);
        }

        const toolErrors = validateAgainstSchema(toolCall.input, tool.inputSchema);
        if (toolErrors.length > 0) {
          throw new Error(
            `Tool input schema validation failed for ${tool.name}: ${toolErrors.join("; ")}`
          );
        }

        const toolOutput = await tool.execute(toolCall.input);
        steps.push({
          type: "tool",
          toolName: tool.name,
          toolInput: toolCall.input,
          toolOutput,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolOutput,
        });

        if (tool.name === "write") {
          didWrite = true;
        }
      }
    }

    return {
      steps,
      didWrite,
      finalMessage: "Agent stopped after reaching max steps",
    };
  }

  private async requestJSON(params: {
    systemPrompt: string;
    userPrompt: string;
    schema: JsonSchema;
    schemaName: string;
  }): Promise<unknown> {
    const payload = await this.requestChatCompletion({
      messages: [
        {
          role: "system",
          content: params.systemPrompt,
        },
        {
          role: "user",
          content: params.userPrompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: params.schemaName,
          strict: true,
          schema: params.schema,
        },
      },
    });
    const content = extractMessageContent(payload);
    return parseStrictJSONObject(content);
  }

  private async requestChatCompletion(body: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(
      `${normalizeBaseURL(this.config.baseURL)}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          ...body,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Provider request failed with status ${response.status}: ${errorText}`
      );
    }

    return (await response.json()) as unknown;
  }
}
