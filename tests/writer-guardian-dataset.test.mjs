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

test("writer-guardian versioned datasets live under suite-version directories", () => {
  const expectedPaths = [
    "evals/datasets/writer-guardian/v1-research/README.md",
    "evals/datasets/writer-guardian/v1-research/shared/scenarios.jsonl",
    "evals/datasets/writer-guardian/v1-research/writer-guardian/benchmark.jsonl",
    "evals/datasets/writer-guardian/v2/README.md",
    "evals/datasets/writer-guardian/v2/shared/scenarios.jsonl",
    "evals/datasets/writer-guardian/v2/writer-guardian/benchmark.jsonl",
  ];

  for (const relativePath of expectedPaths) {
    const filePath = path.join(process.cwd(), relativePath);
    assert.equal(fs.existsSync(filePath), true, `missing dataset artifact: ${relativePath}`);
  }
});

test("writer-guardian v1-research benchmark has 16 cases and matching shared scenarios", () => {
  const scenarios = readJsonl("evals/datasets/writer-guardian/v1-research/shared/scenarios.jsonl");
  const benchmarkCases = readJsonl(
    "evals/datasets/writer-guardian/v1-research/writer-guardian/benchmark.jsonl"
  );

  const scenarioIds = new Set(scenarios.map((scenario) => scenario.scenario_id));
  assert.equal(benchmarkCases.length, 16);

  for (const benchmarkCase of benchmarkCases) {
    assert.equal(
      scenarioIds.has(benchmarkCase.scenario_id),
      true,
      `missing v1-research shared writer scenario for ${benchmarkCase.scenario_id}`
    );
  }
});

test("writer-guardian v2 benchmark has 16 cases and matching shared scenarios", () => {
  const scenarios = readJsonl("evals/datasets/writer-guardian/v2/shared/scenarios.jsonl");
  const benchmarkCases = readJsonl(
    "evals/datasets/writer-guardian/v2/writer-guardian/benchmark.jsonl"
  );

  const scenarioIds = new Set(scenarios.map((scenario) => scenario.scenario_id));
  assert.equal(benchmarkCases.length, 16);

  for (const benchmarkCase of benchmarkCases) {
    assert.equal(
      scenarioIds.has(benchmarkCase.scenario_id),
      true,
      `missing v2 shared writer scenario for ${benchmarkCase.scenario_id}`
    );
  }
});
