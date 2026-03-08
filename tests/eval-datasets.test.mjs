import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveEvalDatasetPaths } from "../dist/evals/datasets.js";

test("resolveEvalDatasetPaths uses default dataset layout", () => {
  const rootDir = "/repo";
  const paths = resolveEvalDatasetPaths({ rootDir });

  assert.deepEqual(paths, {
    sharedDatasetPath: path.join(rootDir, "evals/datasets/shared/scenarios.jsonl"),
    memoryGateDatasetPath: path.join(rootDir, "evals/datasets/memory-gate/benchmark.jsonl"),
    writeGuardianDatasetPath: path.join(
      rootDir,
      "evals/datasets/write-guardian/benchmark.jsonl"
    ),
  });
});

test("resolveEvalDatasetPaths supports dataset-root bundles", () => {
  const rootDir = "/repo";
  const paths = resolveEvalDatasetPaths({
    rootDir,
    datasetRoot: "evals/datasets/memory-gate/v2",
  });

  assert.deepEqual(paths, {
    sharedDatasetPath: path.join(rootDir, "evals/datasets/memory-gate/v2/shared/scenarios.jsonl"),
    memoryGateDatasetPath: path.join(
      rootDir,
      "evals/datasets/memory-gate/v2/memory-gate/benchmark.jsonl"
    ),
    writeGuardianDatasetPath: path.join(
      rootDir,
      "evals/datasets/memory-gate/v2/write-guardian/benchmark.jsonl"
    ),
  });
});

test("resolveEvalDatasetPaths lets per-file overrides win", () => {
  const rootDir = "/repo";
  const paths = resolveEvalDatasetPaths({
    rootDir,
    datasetRoot: "evals/datasets/memory-gate/v2",
    sharedDatasetPath: "custom/shared.jsonl",
    memoryGateDatasetPath: "custom/mg.jsonl",
  });

  assert.deepEqual(paths, {
    sharedDatasetPath: path.join(rootDir, "custom/shared.jsonl"),
    memoryGateDatasetPath: path.join(rootDir, "custom/mg.jsonl"),
    writeGuardianDatasetPath: path.join(
      rootDir,
      "evals/datasets/memory-gate/v2/write-guardian/benchmark.jsonl"
    ),
  });
});
