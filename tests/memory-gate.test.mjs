import test from "node:test";
import assert from "node:assert/strict";

import { MemoryGateAnalyzer } from "../dist/memory-gate/analyzer.js";
import { MEMORY_GATE_SYSTEM_PROMPT } from "../dist/memory-gate/prompt.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test("MemoryGateAnalyzer consumes structured object output from LLMService", async () => {
  const calls = [];
  const llmService = {
    async generateObject(params) {
      calls.push(params);
      return {
        decision: "UPDATE_USER",
        reason: "stable collaboration preference",
        candidate_fact: "prefers direct technical feedback",
      };
    },
  };

  const analyzer = new MemoryGateAnalyzer(llmService, createLogger());
  const result = await analyzer.analyze({
    recentMessages: [
      {
        role: "user",
        message: "I want direct feedback, not sugar coating.",
        timestamp: Date.now() - 1000,
      },
    ],
    currentUserMessage: "Please be direct when reviewing my code.",
    currentAgentReply: "I will keep feedback concise and direct.",
  });

  assert.deepEqual(result, {
    decision: "UPDATE_USER",
    reason: "stable collaboration preference",
    candidateFact: "prefers direct technical feedback",
  });
  assert.equal(calls.length, 1);
  assert.match(
    calls[0].systemPrompt,
    /Memory Gate/,
    "expected analyzer to use the memory gate system prompt"
  );
});

test("memory gate system prompt includes explicit routing guidance for USER, MEMORY, SOUL, and IDENTITY", () => {
  assert.doesNotMatch(MEMORY_GATE_SYSTEM_PROMPT, /Lia/);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /UPDATE_USER[\s\S]*language/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /UPDATE_SOUL[\s\S]*behavioral principle/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /even if proposed by the user/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /general manner[\s\S]*UPDATE_SOUL/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /UPDATE_IDENTITY[\s\S]*name/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /UPDATE_MEMORY[\s\S]*shared context/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /UPDATE_MEMORY[\s\S]*lesson/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /UPDATE_MEMORY[\s\S]*private context/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /past attempt or previous experience[\s\S]*UPDATE_MEMORY/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /project facts[\s\S]*NO_WRITE/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /active threads[\s\S]*NO_WRITE/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /one-off tactical instructions/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /prefers \.\.\./i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /UPDATE_MEMORY:[\s\S]*refers to/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /Name is \.\.\./i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /vibe[\s\S]*Avatar\/style is \.\.\./i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /this time/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /across .*future turns/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /if it is mainly about this user's personal working preference[\s\S]*UPDATE_USER/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /if it is a general rule for how the assistant should behave[\s\S]*UPDATE_SOUL/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /direct[\s\S]*non-sycophantic[\s\S]*UPDATE_SOUL/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /direct code review style[\s\S]*UPDATE_USER/i);
  assert.match(MEMORY_GATE_SYSTEM_PROMPT, /memory update policy or write policy[\s\S]*UPDATE_SOUL/i);
});

test("memory gate prompt asks for a canonical concise English candidate fact", () => {
  const analyzer = new MemoryGateAnalyzer(
    {
      async generateObject() {
        return {
          decision: "NO_WRITE",
          reason: "noop",
        };
      },
    },
    createLogger()
  );

  const prompt = analyzer.buildPrompt({
    recentMessages: [],
    currentUserMessage: "之后默认说中文。",
    currentAgentReply: "好，默认中文。",
  });

  assert.match(prompt, /canonical/i);
  assert.match(prompt, /english/i);
  assert.match(prompt, /candidate_fact/i);
});
