import type {
  AgentRunResult,
  AgentStep,
  AgentTool,
  GenerateObjectParams,
  JsonSchema,
  LLMCompleteParams,
  LLMProvider,
  LLMService as LLMServiceContract,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getCompletionText(result: unknown): string | null {
  if (typeof result === "string") {
    return result;
  }

  if (!isRecord(result)) {
    return null;
  }

  if (typeof result.text === "string") {
    return result.text;
  }

  if (typeof result.output_text === "string") {
    return result.output_text;
  }

  return null;
}

function extractFirstJSONObject(rawText: string): string | null {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];

    if (startIndex === -1) {
      if (char === "{") {
        startIndex = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return rawText.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function parseJsonLikeText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new Error("LLM returned empty response");
  }

  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [trimmed];

  if (codeFenceMatch?.[1]) {
    candidates.push(codeFenceMatch[1].trim());
  }

  const firstObject = extractFirstJSONObject(trimmed);
  if (firstObject) {
    candidates.push(firstObject.trim());
  }

  for (const candidate of Array.from(new Set(candidates))) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("Failed to parse LLM response as JSON");
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

function buildStructuredPrompt(prompt: string, schema: JsonSchema): string {
  return [
    prompt,
    "",
    "Respond with JSON only.",
    `Schema: ${JSON.stringify(schema)}`,
  ].join("\n");
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
      tool_input: value.tool_input ?? value.toolInput ?? {},
    };
  }

  throw new Error("Agent response shape is invalid");
}

export class LLMService implements LLMServiceContract {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async generateObject<T>(params: GenerateObjectParams<T>): Promise<T> {
    const raw = await this.requestText({
      prompt: buildStructuredPrompt(params.userPrompt, params.schema),
      systemPrompt: params.systemPrompt,
      responseFormat: {
        type: "json_schema",
        jsonSchema: params.schema,
      },
    });
    const parsed = parseJsonLikeText(raw);
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
      const raw = await this.requestText({
        prompt: buildAgentLoopPrompt(params.userPrompt, params.tools, steps),
        systemPrompt: params.systemPrompt,
        responseFormat: {
          type: "json_schema",
          jsonSchema: {
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
        },
      });

      const parsed = parseJsonLikeText(raw);
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

  private async requestText(input: LLMCompleteParams): Promise<string> {
    const response = await this.provider.complete(input);
    const text = getCompletionText(response);

    if (text === null) {
      throw new Error("LLM provider returned non-text response");
    }

    return text;
  }
}
