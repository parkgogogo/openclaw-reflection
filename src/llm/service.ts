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

interface AgentActionTool {
  action: "tool";
  tool_name: string;
  tool_input?: unknown;
}

interface AgentActionFinish {
  action: "finish";
  message?: string;
}

type AgentAction = AgentActionTool | AgentActionFinish;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
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

function buildAgentLoopPrompt(
  originalPrompt: string,
  tools: AgentTool[],
  steps: AgentStep[]
): string {
  const toolDescriptions = tools
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  input_schema: ${JSON.stringify(tool.inputSchema)}`
    )
    .join("\n");

  const history =
    steps.length === 0
      ? "(no previous steps)"
      : steps
          .map((step, index) => {
            if (step.type === "assistant") {
              return `${index + 1}. assistant: ${JSON.stringify(step.response)}`;
            }

            return [
              `${index + 1}. tool_call: ${step.toolName}`,
              `tool_input: ${JSON.stringify(step.toolInput ?? {})}`,
              `tool_output: ${step.toolOutput ?? ""}`,
            ].join("\n");
          })
          .join("\n\n");

  return [
    originalPrompt,
    "",
    "Available tools:",
    toolDescriptions,
    "",
    "Previous steps:",
    history,
    "",
    "Return JSON only using one of these shapes:",
    '{"action":"tool","tool_name":"read|write","tool_input":{}}',
    '{"action":"finish","message":"optional summary"}',
  ].join("\n");
}

function normalizeAgentAction(value: unknown): AgentAction {
  if (!isRecord(value) || typeof value.action !== "string") {
    throw new Error("Agent response missing action");
  }

  if (value.action === "finish") {
    return {
      action: "finish",
      message: typeof value.message === "string" ? value.message : undefined,
    };
  }

  if (value.action === "tool" && typeof value.tool_name === "string") {
    return {
      action: "tool",
      tool_name: value.tool_name,
      tool_input: value.tool_input ?? {},
    };
  }

  throw new Error("Agent response shape is invalid");
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

    for (let stepIndex = 0; stepIndex < params.maxSteps; stepIndex += 1) {
      const parsed = await this.requestJSON({
        systemPrompt: params.systemPrompt,
        userPrompt: buildAgentLoopPrompt(params.userPrompt, params.tools, steps),
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["action"],
          properties: {
            action: {
              type: "string",
              enum: ["tool", "finish"],
            },
            tool_name: { type: "string" },
            tool_input: {
              type: "object",
              properties: {},
              additionalProperties: true,
            },
            message: { type: "string" },
          },
        },
        schemaName: "agent_step",
      });

      const action = normalizeAgentAction(parsed);
      steps.push({ type: "assistant", response: action });

      if (action.action === "finish") {
        return {
          steps,
          didWrite,
          finalMessage: action.message,
        };
      }

      const tool = tools.get(action.tool_name);
      if (!tool) {
        throw new Error(`Agent requested unknown tool: ${action.tool_name}`);
      }

      const toolErrors = validateAgainstSchema(action.tool_input ?? {}, tool.inputSchema);
      if (toolErrors.length > 0) {
        throw new Error(
          `Tool input schema validation failed for ${tool.name}: ${toolErrors.join("; ")}`
        );
      }

      const toolOutput = await tool.execute(action.tool_input ?? {});
      steps.push({
        type: "tool",
        toolName: tool.name,
        toolInput: action.tool_input ?? {},
        toolOutput,
      });

      if (tool.name === "write") {
        didWrite = true;
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
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Provider request failed with status ${response.status}: ${errorText}`
      );
    }

    const payload = (await response.json()) as unknown;
    const content = extractMessageContent(payload);
    return parseStrictJSONObject(content);
  }
}
