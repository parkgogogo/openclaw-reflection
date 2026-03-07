import test from "node:test";
import assert from "node:assert/strict";

import { MemoryGateAnalyzer } from "../dist/memory-gate/analyzer.js";

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
