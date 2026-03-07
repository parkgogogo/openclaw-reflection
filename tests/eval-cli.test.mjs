import test from "node:test";
import assert from "node:assert/strict";

import { parseEvalCliOptions } from "../dist/evals/cli.js";

test("parseEvalCliOptions defaults to all suite with judge enabled", () => {
  const options = parseEvalCliOptions(["node", "evals/run.mjs"]);

  assert.equal(options.suite, "all");
  assert.equal(options.useJudge, true);
});

test("parseEvalCliOptions supports explicit suite and --no-judge", () => {
  const options = parseEvalCliOptions([
    "node",
    "evals/run.mjs",
    "--suite",
    "memory-gate",
    "--no-judge",
  ]);

  assert.equal(options.suite, "memory-gate");
  assert.equal(options.useJudge, false);
});

test("parseEvalCliOptions rejects unsupported suite values", () => {
  assert.throws(
    () =>
      parseEvalCliOptions([
        "node",
        "evals/run.mjs",
        "--suite",
        "unknown",
      ]),
    /Unsupported suite/
  );
});

test("parseEvalCliOptions supports dataset-root", () => {
  const options = parseEvalCliOptions([
    "node",
    "evals/run.mjs",
    "--suite",
    "memory-gate",
    "--dataset-root",
    "evals/datasets/memory-gate/v2",
  ]);

  assert.equal(options.suite, "memory-gate");
  assert.equal(options.datasetRoot, "evals/datasets/memory-gate/v2");
});

test("parseEvalCliOptions supports per-file dataset overrides", () => {
  const options = parseEvalCliOptions([
    "node",
    "evals/run.mjs",
    "--shared-dataset",
    "tmp/shared.jsonl",
    "--memory-gate-dataset",
    "tmp/memory-gate.jsonl",
    "--writer-guardian-dataset",
    "tmp/writer-guardian.jsonl",
  ]);

  assert.equal(options.sharedDatasetPath, "tmp/shared.jsonl");
  assert.equal(options.memoryGateDatasetPath, "tmp/memory-gate.jsonl");
  assert.equal(options.writerGuardianDatasetPath, "tmp/writer-guardian.jsonl");
});
