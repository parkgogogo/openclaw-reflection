import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBaselineDiffs,
  findDisagreementCases,
  findHardestCases,
  rankModelReports,
} from "../dist/evals/comparison.js";

function createMemoryGateReport(input) {
  return {
    modelId: input.modelId,
    modelLabel: input.modelLabel ?? input.modelId,
    suite: "memory-gate",
    startedAt: "2026-03-09T10:00:00.000Z",
    finishedAt: "2026-03-09T10:00:05.000Z",
    summary: {
      total: input.results.length,
      passed: input.results.filter((result) => result.pass).length,
      errorCounts: input.errorCounts ?? {
        provider_error: 0,
        schema_error: 0,
        execution_error: 0,
      },
    },
    results: input.results,
  };
}

test("rankModelReports sorts by passed count then error counts", () => {
  const ranked = rankModelReports([
    createMemoryGateReport({
      modelId: "model-b",
      results: [
        {
          scenarioId: "case-1",
          pass: true,
          decisionPass: true,
          candidatePass: true,
          judgeUsed: false,
          actualDecision: "UPDATE_USER",
          expectedDecision: "UPDATE_USER",
        },
        {
          scenarioId: "case-2",
          pass: false,
          decisionPass: false,
          candidatePass: false,
          judgeUsed: false,
          actualDecision: "NO_WRITE",
          expectedDecision: "UPDATE_USER",
        },
      ],
      errorCounts: {
        provider_error: 0,
        schema_error: 1,
        execution_error: 0,
      },
    }),
    createMemoryGateReport({
      modelId: "model-a",
      results: [
        {
          scenarioId: "case-1",
          pass: true,
          decisionPass: true,
          candidatePass: true,
          judgeUsed: false,
          actualDecision: "UPDATE_USER",
          expectedDecision: "UPDATE_USER",
        },
        {
          scenarioId: "case-2",
          pass: true,
          decisionPass: true,
          candidatePass: true,
          judgeUsed: false,
          actualDecision: "UPDATE_MEMORY",
          expectedDecision: "UPDATE_MEMORY",
        },
      ],
    }),
    createMemoryGateReport({
      modelId: "model-c",
      results: [
        {
          scenarioId: "case-1",
          pass: true,
          decisionPass: true,
          candidatePass: true,
          judgeUsed: false,
          actualDecision: "UPDATE_USER",
          expectedDecision: "UPDATE_USER",
        },
        {
          scenarioId: "case-2",
          pass: false,
          decisionPass: false,
          candidatePass: false,
          judgeUsed: false,
          actualDecision: "NO_WRITE",
          expectedDecision: "UPDATE_MEMORY",
        },
      ],
      errorCounts: {
        provider_error: 1,
        schema_error: 0,
        execution_error: 0,
      },
    }),
  ]);

  assert.deepEqual(
    ranked.map((entry) => entry.modelId),
    ["model-a", "model-b", "model-c"]
  );
});

test("buildBaselineDiffs computes regressed and improved cases relative to baseline", () => {
  const reports = [
    createMemoryGateReport({
      modelId: "baseline",
      results: [
        {
          scenarioId: "case-1",
          pass: true,
          decisionPass: true,
          candidatePass: true,
          judgeUsed: false,
          actualDecision: "UPDATE_USER",
          expectedDecision: "UPDATE_USER",
        },
        {
          scenarioId: "case-2",
          pass: false,
          decisionPass: false,
          candidatePass: false,
          judgeUsed: false,
          actualDecision: "NO_WRITE",
          expectedDecision: "UPDATE_MEMORY",
        },
      ],
    }),
    createMemoryGateReport({
      modelId: "candidate",
      results: [
        {
          scenarioId: "case-1",
          pass: false,
          decisionPass: false,
          candidatePass: false,
          judgeUsed: false,
          actualDecision: "NO_WRITE",
          expectedDecision: "UPDATE_USER",
        },
        {
          scenarioId: "case-2",
          pass: true,
          decisionPass: true,
          candidatePass: true,
          judgeUsed: false,
          actualDecision: "UPDATE_MEMORY",
          expectedDecision: "UPDATE_MEMORY",
        },
      ],
    }),
  ];

  const diffs = buildBaselineDiffs(reports, "baseline");

  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].modelId, "candidate");
  assert.deepEqual(diffs[0].regressedCases, ["case-1"]);
  assert.deepEqual(diffs[0].improvedCases, ["case-2"]);
});

test("findHardestCases ranks cases by how many models failed them", () => {
  const hardestCases = findHardestCases([
    createMemoryGateReport({
      modelId: "model-a",
      results: [
        {
          scenarioId: "case-1",
          pass: false,
          decisionPass: false,
          candidatePass: false,
          judgeUsed: false,
          actualDecision: "NO_WRITE",
          expectedDecision: "UPDATE_USER",
        },
        {
          scenarioId: "case-2",
          pass: false,
          decisionPass: false,
          candidatePass: false,
          judgeUsed: false,
          actualDecision: "NO_WRITE",
          expectedDecision: "UPDATE_MEMORY",
        },
      ],
    }),
    createMemoryGateReport({
      modelId: "model-b",
      results: [
        {
          scenarioId: "case-1",
          pass: false,
          decisionPass: false,
          candidatePass: false,
          judgeUsed: false,
          actualDecision: "NO_WRITE",
          expectedDecision: "UPDATE_USER",
        },
        {
          scenarioId: "case-2",
          pass: true,
          decisionPass: true,
          candidatePass: true,
          judgeUsed: false,
          actualDecision: "UPDATE_MEMORY",
          expectedDecision: "UPDATE_MEMORY",
        },
      ],
    }),
  ]);

  assert.equal(hardestCases[0].scenarioId, "case-1");
  assert.deepEqual(hardestCases[0].failedBy, ["model-a", "model-b"]);
  assert.equal(hardestCases[1].scenarioId, "case-2");
  assert.deepEqual(hardestCases[1].failedBy, ["model-a"]);
});

test("findDisagreementCases surfaces scenarios where models diverge", () => {
  const disagreements = findDisagreementCases([
    createMemoryGateReport({
      modelId: "model-a",
      results: [
        {
          scenarioId: "case-1",
          pass: true,
          decisionPass: true,
          candidatePass: true,
          judgeUsed: false,
          actualDecision: "UPDATE_USER",
          expectedDecision: "UPDATE_USER",
        },
      ],
    }),
    createMemoryGateReport({
      modelId: "model-b",
      results: [
        {
          scenarioId: "case-1",
          pass: true,
          decisionPass: true,
          candidatePass: true,
          judgeUsed: false,
          actualDecision: "UPDATE_MEMORY",
          expectedDecision: "UPDATE_USER",
        },
      ],
    }),
  ]);

  assert.equal(disagreements.length, 1);
  assert.equal(disagreements[0].scenarioId, "case-1");
  assert.deepEqual(disagreements[0].modelIds, ["model-a", "model-b"]);
});
