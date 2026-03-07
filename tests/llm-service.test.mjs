import test from "node:test";
import assert from "node:assert/strict";

import { LLMService } from "../dist/llm/service.js";

function createJSONResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test("LLMService generateObject sends structured output request to OpenAI-compatible provider", async () => {
  const calls = [];
  const service = new LLMService(
    {
      baseURL: "https://example.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
    },
    {
      async fetch(url, init) {
        calls.push({ url, init });
        return createJSONResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "UPDATE_USER",
                  reason: "stable preference",
                  candidate_fact: "prefers direct feedback",
                }),
              },
            },
          ],
        });
      },
    }
  );

  const schema = {
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
        ],
      },
      reason: { type: "string" },
      candidate_fact: { type: "string" },
    },
  };

  const result = await service.generateObject({
    systemPrompt: "Return structured memory gate decision",
    userPrompt: "Current user clarified a stable preference",
    schema,
  });

  assert.deepEqual(result, {
    decision: "UPDATE_USER",
    reason: "stable preference",
    candidate_fact: "prefers direct feedback",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.com/v1/chat/completions");
  assert.equal(calls[0].init.headers.authorization, "Bearer test-key");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "gpt-test");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
});

test("LLMService generateObject rejects invalid schema output", async () => {
  const service = new LLMService(
    {
      baseURL: "https://example.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
    },
    {
      async fetch() {
        return createJSONResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "NOT_A_REAL_DECISION",
                  reason: "bad output",
                }),
              },
            },
          ],
        });
      },
    }
  );

  await assert.rejects(
    service.generateObject({
      systemPrompt: "Return structured memory gate decision",
      userPrompt: "Anything",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["decision", "reason"],
        properties: {
          decision: {
            type: "string",
            enum: ["NO_WRITE", "UPDATE_USER"],
          },
          reason: { type: "string" },
        },
      },
    }),
    /Schema validation failed/
  );
});

test("LLMService runAgent executes read then write tools", async () => {
  const responses = [
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: "tool",
              tool_name: "read",
              tool_input: {},
            }),
          },
        },
      ],
    },
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: "tool",
              tool_name: "write",
              tool_input: {
                content: "# USER\n\n## Preferences\n- prefers direct feedback\n",
              },
            }),
          },
        },
      ],
    },
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: "finish",
              message: "updated",
            }),
          },
        },
      ],
    },
  ];

  let readCalls = 0;
  const writes = [];
  const service = new LLMService(
    {
      baseURL: "https://example.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
    },
    {
      async fetch() {
        const next = responses.shift();
        if (!next) {
          throw new Error("No more mock responses");
        }
        return createJSONResponse(next);
      },
    }
  );

  const result = await service.runAgent({
    systemPrompt: "You are a writer guardian",
    userPrompt: "Update USER.md if appropriate",
    maxSteps: 5,
    tools: [
      {
        name: "read",
        description: "Read current target file content",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        async execute() {
          readCalls += 1;
          return "# USER\n\n## Preferences\n- existing\n";
        },
      },
      {
        name: "write",
        description: "Overwrite current target file content",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["content"],
          properties: {
            content: { type: "string" },
          },
        },
        async execute(input) {
          writes.push(input);
          return "ok";
        },
      },
    ],
  });

  assert.equal(readCalls, 1);
  assert.deepEqual(writes, [
    { content: "# USER\n\n## Preferences\n- prefers direct feedback\n" },
  ]);
  assert.equal(result.didWrite, true);
  assert.equal(result.steps.filter((step) => step.type === "tool").length, 2);
});

test("LLMService runAgent returns didWrite=false when no write tool is called", async () => {
  const service = new LLMService(
    {
      baseURL: "https://example.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
    },
    {
      async fetch() {
        return createJSONResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "finish",
                  message: "refuse write",
                }),
              },
            },
          ],
        });
      },
    }
  );

  const result = await service.runAgent({
    systemPrompt: "You are a writer guardian",
    userPrompt: "Update SOUL.md if appropriate",
    maxSteps: 3,
    tools: [
      {
        name: "read",
        description: "Read current target file content",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        async execute() {
          return "# SOUL\n";
        },
      },
      {
        name: "write",
        description: "Overwrite current target file content",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["content"],
          properties: {
            content: { type: "string" },
          },
        },
        async execute() {
          throw new Error("write should not be called");
        },
      },
    ],
  });

  assert.equal(result.didWrite, false);
  assert.equal(result.steps.filter((step) => step.type === "tool").length, 0);
});
