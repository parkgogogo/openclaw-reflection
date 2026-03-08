import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateMemoryGateBenchmark,
  evaluateWriterGuardianBenchmark,
  runWriterGuardianCase,
} from "../dist/evals/runner.js";

test("evaluateMemoryGateBenchmark supports judge-backed semantic candidate matching", async () => {
  const scenarios = [
    {
      scenario_id: "mg_case_1",
      title: "Stable preference",
      recent_messages: [],
      current_user_message: "Please be direct.",
      current_agent_reply: "I will be direct.",
      notes: "test case",
    },
  ];

  const benchmarkCases = [
    {
      scenario_id: "mg_case_1",
      expected_decision: "UPDATE_USER",
      expected_candidate_fact: "prefers direct technical feedback",
      allowed_candidate_fact_variants: [],
      severity: "core",
      tags: ["user"],
    },
  ];

  const result = await evaluateMemoryGateBenchmark({
    scenarios,
    benchmarkCases,
    executeCase: async () => ({
      decision: "UPDATE_USER",
      candidateFact: "wants direct technical feedback",
      reason: "stable preference",
    }),
    judge: {
      async compareCandidateFact() {
        return {
          equivalent: true,
          reason: "semantic match",
        };
      },
    },
  });

  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.results[0].candidatePass, true);
  assert.equal(result.results[0].judgeUsed, true);
});

test("evaluateWriterGuardianBenchmark validates refusal and tool trace", async () => {
  const scenarios = [
    {
      scenario_id: "wg_case_1",
      title: "Refuse temporary tone shift",
      gate_decision: "UPDATE_SOUL",
      gate_reason: "temporary tone request",
      candidate_fact: "be extra casual today",
      target_file: "SOUL.md",
      current_file_content: "# SOUL\n\n## Voice\n- Direct\n",
      notes: "test case",
    },
  ];

  const benchmarkCases = [
    {
      scenario_id: "wg_case_1",
      expected_should_write: false,
      expected_outcome_type: "refuse_temporary_tone",
      allowed_tool_traces: [[], ["read"]],
      expected_content_contains: [],
      expected_content_not_contains: ["extra casual today"],
      tags: ["soul"],
    },
  ];

  const result = await evaluateWriterGuardianBenchmark({
    scenarios,
    benchmarkCases,
    executeCase: async () => ({
      shouldWrite: false,
      toolTrace: ["read"],
      finalContent: "# SOUL\n\n## Voice\n- Direct\n",
    }),
  });

  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.results[0].toolTracePass, true);
  assert.equal(result.results[0].shouldWritePass, true);
});

test("evaluateMemoryGateBenchmark continues after per-case execution error", async () => {
  const scenarios = [
    {
      scenario_id: "mg_case_error",
      title: "Broken case",
      recent_messages: [],
      current_user_message: "broken",
      current_agent_reply: "broken",
      notes: "test case",
    },
    {
      scenario_id: "mg_case_ok",
      title: "Working case",
      recent_messages: [],
      current_user_message: "Please be direct.",
      current_agent_reply: "I will be direct.",
      notes: "test case",
    },
  ];

  const benchmarkCases = [
    {
      scenario_id: "mg_case_error",
      expected_decision: "UPDATE_USER",
      expected_candidate_fact: "prefers direct technical feedback",
      allowed_candidate_fact_variants: [],
      severity: "core",
      tags: ["user"],
    },
    {
      scenario_id: "mg_case_ok",
      expected_decision: "UPDATE_USER",
      expected_candidate_fact: "prefers direct technical feedback",
      allowed_candidate_fact_variants: [],
      severity: "core",
      tags: ["user"],
    },
  ];

  const result = await evaluateMemoryGateBenchmark({
    scenarios,
    benchmarkCases,
    executeCase: async (scenario) => {
      if (scenario.scenario_id === "mg_case_error") {
        throw new Error("provider timeout");
      }

      return {
        decision: "UPDATE_USER",
        candidateFact: "prefers direct technical feedback",
        reason: "stable preference",
      };
    },
  });

  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.results[0].pass, false);
  assert.match(result.results[0].error, /provider timeout/);
  assert.equal(result.results[1].pass, true);
});

test("evaluateWriterGuardianBenchmark continues after per-case execution error", async () => {
  const scenarios = [
    {
      scenario_id: "wg_case_error",
      title: "Broken writer case",
      gate_decision: "UPDATE_MEMORY",
      gate_reason: "broken",
      candidate_fact: "store broken case",
      target_file: "MEMORY.md",
      current_file_content: "# MEMORY\n",
      notes: "test case",
    },
    {
      scenario_id: "wg_case_ok",
      title: "Working writer case",
      gate_decision: "UPDATE_USER",
      gate_reason: "stable preference",
      candidate_fact: "prefers direct technical feedback",
      target_file: "USER.md",
      current_file_content: "# USER\n",
      notes: "test case",
    },
  ];

  const benchmarkCases = [
    {
      scenario_id: "wg_case_error",
      expected_should_write: false,
      expected_outcome_type: "provider_error",
      allowed_tool_traces: [[], ["read"]],
      expected_content_contains: [],
      expected_content_not_contains: ["store broken case"],
      tags: ["memory"],
    },
    {
      scenario_id: "wg_case_ok",
      expected_should_write: true,
      expected_outcome_type: "update",
      allowed_tool_traces: [["read", "write"]],
      expected_content_contains: ["prefers direct technical feedback"],
      expected_content_not_contains: [],
      tags: ["user"],
    },
  ];

  const result = await evaluateWriterGuardianBenchmark({
    scenarios,
    benchmarkCases,
    executeCase: async (scenario) => {
      if (scenario.scenario_id === "wg_case_error") {
        throw new Error("writer provider timeout");
      }

      return {
        shouldWrite: true,
        toolTrace: ["read", "write"],
        finalContent: "# USER\n\n- prefers direct technical feedback\n",
      };
    },
  });

  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.results[0].pass, false);
  assert.match(result.results[0].error, /writer provider timeout/);
  assert.equal(result.results[1].pass, true);
});

test("runWriterGuardianCase supports TOOLS.md scenarios", async () => {
  const result = await runWriterGuardianCase({
    scenario: {
      scenario_id: "wg_tools_case",
      title: "Write local ssh alias",
      gate_decision: "UPDATE_TOOLS",
      gate_reason: "local ssh alias mapping",
      candidate_fact: "home-server SSH alias refers to devbox.internal",
      target_file: "TOOLS.md",
      current_file_content: "# TOOLS\n\n## SSH\n- old-alias refers to old-host\n",
      notes: "test case",
    },
    llmService: {
      async generateObject() {
        throw new Error("not used");
      },
      async runAgent(params) {
        const readTool = params.tools.find((tool) => tool.name === "read");
        const writeTool = params.tools.find((tool) => tool.name === "write");
        const current = await readTool.execute({});
        assert.match(current, /old-alias refers to old-host/);
        await writeTool.execute({
          content:
            "# TOOLS\n\n## SSH\n- old-alias refers to old-host\n- home-server SSH alias refers to devbox.internal\n",
        });
        return {
          didWrite: true,
          finalMessage: "updated",
          steps: [
            { type: "tool", toolName: "read", input: {}, output: current },
            { type: "tool", toolName: "write", input: {}, output: "ok" },
          ],
        };
      },
    },
  });

  assert.equal(result.shouldWrite, true);
  assert.deepEqual(result.toolTrace, ["read", "write"]);
  assert.match(result.finalContent, /home-server SSH alias refers to devbox\.internal/);
});
