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

interface ChatCompletionToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ChatCompletionMessage {
  role?: string;
  content?: string | null;
  tool_calls?: ChatCompletionToolCall[];
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: ChatCompletionMessage;
  }>;
}

interface ChatCompletionToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
    strict: true;
  };
}

interface AgentChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface ParsedToolCall {
  id: string;
  name: string;
  input: unknown;
  rawArguments: string;
}

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

function extractMessageContent(response: unknown): string {
  if (!isRecord(response)) {
    throw new Error("Provider returned non-object response");
  }

  const parsed = response as ChatCompletionResponse;
  const content = parsed.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Provider returned empty message content");
  }

  return content;
}

function parseStrictJSONObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Provider returned invalid JSON content: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function toFunctionTool(tool: AgentTool): ChatCompletionToolDefinition {
  if (tool.inputSchema.type !== "object") {
    throw new Error(`Tool ${tool.name} input schema must be object type`);
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: true,
    },
  };
}

function parseToolCalls(value: unknown): ParsedToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((toolCall, index) => {
    if (!isRecord(toolCall)) {
      throw new Error(`Tool call at index ${index} is invalid`);
    }

    if (typeof toolCall.id !== "string" || toolCall.id.trim() === "") {
      throw new Error(`Tool call at index ${index} is missing id`);
    }

    if (toolCall.type !== "function") {
      throw new Error(`Tool call ${toolCall.id} has unsupported type`);
    }

    if (!isRecord(toolCall.function) || typeof toolCall.function.name !== "string") {
      throw new Error(`Tool call ${toolCall.id} is missing function name`);
    }

    const rawArguments =
      typeof toolCall.function.arguments === "string" &&
      toolCall.function.arguments.trim() !== ""
        ? toolCall.function.arguments
        : "{}";

    return {
      id: toolCall.id,
      name: toolCall.function.name,
      input: parseStrictJSONObject(rawArguments),
      rawArguments,
    };
  });
}

function extractAgentMessage(response: unknown): {
  content?: string;
  toolCalls: ParsedToolCall[];
  assistantMessage: AgentChatMessage;
} {
  if (!isRecord(response)) {
    throw new Error("Provider returned non-object response");
  }

  const parsed = response as ChatCompletionResponse;
  const message = parsed.choices?.[0]?.message;

  if (!isRecord(message)) {
    throw new Error("Provider returned empty assistant message");
  }

  const content = typeof message.content === "string" ? message.content : undefined;
  const toolCalls = parseToolCalls(message.tool_calls);

  if (toolCalls.length === 0 && (!content || content.trim() === "")) {
    throw new Error("Provider returned neither tool calls nor message content");
  }

  const assistantMessage: AgentChatMessage = {
    role: "assistant",
    content: typeof message.content === "string" ? message.content : null,
  };

  if (toolCalls.length > 0) {
    assistantMessage.tool_calls = toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: toolCall.rawArguments,
      },
    }));
  }

  return {
    content,
    toolCalls,
    assistantMessage,
  };
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
    const toolDefinitions = params.tools.map((tool) => toFunctionTool(tool));

    const messages: AgentChatMessage[] = [
      {
        role: "system",
        content: params.systemPrompt,
      },
      {
        role: "user",
        content: params.userPrompt,
      },
    ];

    for (let stepIndex = 0; stepIndex < params.maxSteps; stepIndex += 1) {
      const requestBody: Record<string, unknown> = {
        model: this.config.model,
        messages,
      };

      // Only include tools if toolChoice is not "none"
      if (params.toolChoice !== "none") {
        requestBody.tools = toolDefinitions;
        requestBody.tool_choice = params.toolChoice ?? "auto";
      }

      const payload = await this.requestCompletion(requestBody);

      const { content, toolCalls, assistantMessage } = extractAgentMessage(payload);
      steps.push({
        type: "assistant",
        response: {
          content: content ?? null,
          toolCalls: toolCalls.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
          })),
        },
      });

      messages.push(assistantMessage);

      if (toolCalls.length === 0) {
        return {
          steps,
          didWrite,
          finalMessage: content,
        };
      }

      for (const toolCall of toolCalls) {
        const tool = tools.get(toolCall.name);
        if (!tool) {
          const errorMsg = `Error: Unknown tool "${toolCall.name}"`;
          steps.push({
            type: "tool",
            toolName: toolCall.name,
            toolInput: toolCall.input,
            toolOutput: errorMsg,
          });
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: errorMsg,
          });
          continue;
        }

        const toolErrors = validateAgainstSchema(toolCall.input, tool.inputSchema);
        if (toolErrors.length > 0) {
          const errorMsg = `Error: Invalid input for tool "${tool.name}": ${toolErrors.join("; ")}`;
          steps.push({
            type: "tool",
            toolName: tool.name,
            toolInput: toolCall.input,
            toolOutput: errorMsg,
          });
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: errorMsg,
          });
          continue;
        }

        let toolOutput: string;
        try {
          toolOutput = await tool.execute(toolCall.input);
        } catch (error) {
          toolOutput = `Error executing tool "${tool.name}": ${
            error instanceof Error ? error.message : String(error)
          }`;
        }

        steps.push({
          type: "tool",
          toolName: tool.name,
          toolInput: toolCall.input,
          toolOutput,
        });

        if (tool.name === "write") {
          didWrite = true;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolOutput,
        });
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
    const payload = await this.requestCompletion({
      model: this.config.model,
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

  private async requestCompletion(body: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(
      `${normalizeBaseURL(this.config.baseURL)}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
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
