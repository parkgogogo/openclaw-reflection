import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";

import { buildMultiModelComparisonReport } from "../dist/evals/comparison.js";
import { buildSingleModelRunReport } from "../dist/evals/runner.js";
import {
  renderComparisonMarkdown,
  writeComparisonReports,
} from "../dist/evals/reporting.js";

function createReport() {
  return buildMultiModelComparisonReport({
    suite: "memory-gate",
    baselineModelId: "baseline",
    timestamp: "2026-03-09T10:00:00.000Z",
    runId: "memory-gate-2026-03-09T10:00:00.000Z",
    modelReports: [
      buildSingleModelRunReport({
        modelId: "baseline",
        modelLabel: "Baseline",
        suite: "memory-gate",
        startedAt: "2026-03-09T10:00:00.000Z",
        finishedAt: "2026-03-09T10:00:05.000Z",
        summary: {
          total: 1,
          passed: 1,
          errorCounts: {
            provider_error: 0,
            schema_error: 0,
            execution_error: 0,
          },
        },
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
      buildSingleModelRunReport({
        modelId: "candidate",
        modelLabel: "Candidate",
        suite: "memory-gate",
        startedAt: "2026-03-09T10:00:00.000Z",
        finishedAt: "2026-03-09T10:00:05.000Z",
        summary: {
          total: 1,
          passed: 0,
          errorCounts: {
            provider_error: 1,
            schema_error: 0,
            execution_error: 0,
          },
        },
        results: [
          {
            scenarioId: "case-1",
            pass: false,
            decisionPass: false,
            candidatePass: false,
            judgeUsed: false,
            actualDecision: "NO_WRITE",
            expectedDecision: "UPDATE_USER",
            errorType: "provider_error",
            error: "Provider request failed",
          },
        ],
      }),
    ],
  });
}

test("renderComparisonMarkdown includes leaderboard, baseline diff, and hardest cases", () => {
  const markdown = renderComparisonMarkdown(createReport());

  assert.match(markdown, /# Eval Comparison Report/);
  assert.match(markdown, /\| Model \| Passed \| Total \|/);
  assert.match(markdown, /## Baseline Diffs/);
  assert.match(markdown, /## Hardest Cases/);
  assert.match(markdown, /candidate/);
});

test("writeComparisonReports writes JSON and markdown outputs", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "eval-reporting-test-"));
  const jsonPath = path.join(tempDir, "report.json");
  const markdownPath = path.join(tempDir, "report.md");

  try {
    await writeComparisonReports({
      report: createReport(),
      outputPath: jsonPath,
      markdownOutputPath: markdownPath,
    });

    const jsonContent = JSON.parse(await readFile(jsonPath, "utf8"));
    const markdownContent = await readFile(markdownPath, "utf8");

    assert.equal(jsonContent.runId, "memory-gate-2026-03-09T10:00:00.000Z");
    assert.equal(jsonContent.models.length, 2);
    assert.equal(jsonContent.comparison.ranking[0].modelId, "baseline");
    assert.match(markdownContent, /## Baseline Diffs/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("writeComparisonReports skips file writes when output paths are omitted", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "eval-reporting-test-"));

  try {
    const result = await writeComparisonReports({
      report: createReport(),
    });

    assert.equal(result.jsonWritten, false);
    assert.equal(result.markdownWritten, false);
    assert.deepEqual(result.writtenPaths, []);
    await assert.rejects(() => readFile(path.join(tempDir, "report.json"), "utf8"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
