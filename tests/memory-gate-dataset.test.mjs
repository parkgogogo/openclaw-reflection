import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readJsonl(relativePath) {
  const filePath = path.join(process.cwd(), relativePath);
  const content = fs.readFileSync(filePath, "utf8").trim();

  if (!content) {
    return [];
  }

  return content.split("\n").map((line) => JSON.parse(line));
}

test("memory-gate default dataset includes TOOLS.md routing coverage", () => {
  const scenarios = readJsonl("evals/datasets/shared/scenarios.jsonl");
  const benchmarkCases = readJsonl("evals/datasets/memory-gate/benchmark.jsonl");

  const memoryGateScenarios = scenarios.filter((scenario) => scenario.task_type === "memory_gate");
  const scenarioIds = new Set(memoryGateScenarios.map((scenario) => scenario.scenario_id));
  const benchmarkIds = benchmarkCases.map((benchmarkCase) => benchmarkCase.scenario_id);

  assert.equal(benchmarkCases.length, 18);
  assert.deepEqual(benchmarkIds, [
    "mg2_user_prefers_brutal_honesty",
    "mg2_user_prefers_chinese_default",
    "mg2_user_hates_surprise_rewrites",
    "mg2_user_prefers_morning_checkins",
    "mg2_memory_shared_term_north_star",
    "mg2_memory_lesson_failed_retrospective",
    "mg2_memory_private_context_family_health",
    "mg2_soul_refuse_when_unsure",
    "mg2_soul_be_direct_and_non_sycophantic",
    "mg2_soul_disclose_soul_changes",
    "mg2_identity_name_change",
    "mg2_identity_avatar_change",
    "mg2_identity_vibe_label",
    "mg2_tools_alias_mapping",
    "mg2_tools_refuse_runtime_claim",
    "mg2_no_write_smalltalk",
    "mg2_no_write_single_turn_tactic",
    "mg2_no_write_active_project_thread",
  ]);

  for (const scenarioId of benchmarkIds) {
    assert.equal(
      scenarioIds.has(scenarioId),
      true,
      `missing shared memory-gate scenario for ${scenarioId}`
    );
  }
});

test("memory-gate versioned datasets live under suite-version directories", () => {
  const expectedPaths = [
    "evals/datasets/memory-gate/v1-research/shared/scenarios.jsonl",
    "evals/datasets/memory-gate/v1-research/memory-gate/benchmark.jsonl",
    "evals/datasets/memory-gate/v2/shared/scenarios.jsonl",
    "evals/datasets/memory-gate/v2/memory-gate/benchmark.jsonl",
    "evals/datasets/memory-gate/v2/README.md",
  ];

  for (const relativePath of expectedPaths) {
    const filePath = path.join(process.cwd(), relativePath);
    assert.equal(fs.existsSync(filePath), true, `missing dataset artifact: ${relativePath}`);
  }
});
