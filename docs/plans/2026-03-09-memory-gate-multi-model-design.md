# Memory Gate Multi-Model Eval Design

**Status:** Approved

**Goal:** Add a durable multi-model comparison mechanism to the eval stack so `memory_gate` benchmark runs can compare multiple model profiles, produce stable leaderboard-style summaries, and support future regression tracking.

## Context

The current eval entrypoint at `evals/run.mjs` only supports a single `EVAL_*` provider configuration. That is good enough for prompt iteration, but not for long-term benchmark operations:

- there is no first-class concept of a model matrix
- results are shaped around one model run at a time
- there is no baseline-relative diff view
- history can only be preserved as ad hoc markdown notes

`memory_gate` case execution itself is already cleanly separated in `runMemoryGateCase` and `evaluateMemoryGateBenchmark`, so the multi-model design should build around those functions rather than rewriting them.

## Requirements

### Functional

- Run one eval suite against multiple named model profiles in one command
- Keep the existing shared scenarios and benchmark datasets unchanged
- Produce both machine-readable and human-readable comparison outputs
- Support a baseline model for regression and improvement analysis
- Preserve current single-model execution semantics inside the runner

### Operational

- Keep secrets out of checked-in config files
- Make it easy to enable or disable models without changing code
- Keep reports stable enough for future CI or historical aggregation
- Do not require a database in the first version

## Non-Goals

- No parallel execution in v1
- No automatic trend dashboard in v1
- No cost or token accounting in v1
- No multi-model judge matrix in v1
- No dataset schema redesign in v1

## Options Considered

### 1. Thin wrapper around the current CLI

Read a config file, loop through profiles, run the existing single-model path, then print a stitched summary.

This is the smallest code change, but it preserves the wrong abstraction boundary. Result shapes stay single-model-first, and every later addition such as baseline diffs, hardest-case analysis, or historical replay becomes an afterthought.

### 2. Matrix-first eval orchestration

Keep single-model execution pure, but introduce a comparison layer that:

- loads model profiles
- runs the same suite once per profile
- stores a standard per-model report
- emits a multi-model comparison report

This keeps the runner clean and creates the right long-term extension point. This is the recommended design.

### 3. Persist every run into a database

This would make historical analysis convenient, but it is too heavy for the current repo. It adds operational surface area before the result schema has stabilized.

## Recommended Architecture

Use a two-layer design.

### Layer 1: Single-model execution

Keep these functions single-model:

- `runMemoryGateCase`
- `evaluateMemoryGateBenchmark`
- `runWriteGuardianCase`
- `evaluateWriteGuardianBenchmark`

Their job is still: execute one suite with one `LLMService` and return a normal benchmark report.

### Layer 2: Multi-model comparison orchestration

Add a new comparison layer that:

- reads `evals/models.json`
- resolves selected model profiles
- builds one `LLMService` per profile
- executes the chosen suite for each profile
- converts results into a standard per-model report
- computes aggregate comparison views
- writes JSON and Markdown outputs

Recommended new modules:

- `src/evals/models.ts`
- `src/evals/comparison.ts`

## Model Configuration

Add `evals/models.json` as the checked-in source of truth for the eval matrix.

Example shape:

```json
{
  "profiles": [
    {
      "id": "grok-fast",
      "label": "Grok 4.1 Fast",
      "baseURL": "https://api.x.ai/v1",
      "apiKeyEnv": "XAI_API_KEY",
      "model": "x-ai/grok-4.1-fast",
      "enabled": true,
      "tags": ["baseline", "fast"]
    }
  ]
}
```

Rules:

- `id` is the stable identifier used in reports and baseline selection
- `label` is presentation-only
- `apiKeyEnv` stores the environment variable name, not the secret itself
- `enabled` allows temporary profile removal without deleting history
- provider-specific request overrides are out of scope for v1

## CLI Design

Extend the CLI with matrix-oriented flags while preserving the existing dataset flags.

New flags:

- `--models-config <path>`
- `--models <id1,id2,...>`
- `--baseline <id>`
- `--output <path>`
- `--markdown-output <path>`

Behavior:

- if `--models-config` is omitted, current single-model mode remains available through `EVAL_*`
- if `--models-config` is present, run comparison mode
- `--models` filters to a subset of enabled profiles
- `--baseline` selects the model used for relative diff sections
- `--output` writes machine-readable JSON
- `--markdown-output` writes a human-readable summary

## Result Model

### SingleModelRunReport

Represents one model running one suite one time.

Suggested fields:

```ts
interface SingleModelRunReport {
  modelId: string;
  modelLabel: string;
  suite: "memory-gate" | "write-guardian" | "all";
  startedAt: string;
  finishedAt: string;
  datasetPaths: {
    sharedDatasetPath?: string;
    memoryGateDatasetPath?: string;
    writeGuardianDatasetPath?: string;
  };
  gitCommit?: string;
  summary: BenchmarkSummary;
  results: MemoryGateCaseResult[] | WriteGuardianCaseResult[];
}
```

### MultiModelComparisonReport

Represents the aggregate view across multiple `SingleModelRunReport` values.

Suggested fields:

```ts
interface MultiModelComparisonReport {
  runId: string;
  timestamp: string;
  suite: "memory-gate" | "write-guardian" | "all";
  baselineModelId?: string;
  models: SingleModelRunReport[];
  comparison: {
    ranking: Array<{
      modelId: string;
      passed: number;
      total: number;
      errorCounts?: BenchmarkSummary["errorCounts"];
    }>;
    baselineDiffs: Array<{
      modelId: string;
      regressedCases: string[];
      improvedCases: string[];
      disagreementCases: string[];
    }>;
    hardestCases: Array<{
      scenarioId: string;
      failedBy: string[];
    }>;
  };
}
```

## Comparison Rules

Primary ranking signal:

1. `passed / total`
2. fewer `provider_error`, `schema_error`, `execution_error`
3. better candidate-fact quality within the existing runner result fields

Baseline diff semantics:

- `regressedCases`: baseline passes, compared model fails
- `improvedCases`: baseline fails, compared model passes
- `disagreementCases`: same scenario, different result outcome or decision path

For `memory_gate`, disagreement should be computed from the case result fields, not just overall `pass`.

## Output Format

### JSON

Write one stable JSON artifact per comparison run under `evals/results/`.

Recommended name:

- `evals/results/<date>-<suite>-matrix.json`

This is the contract for future automation, CI parsing, and historical analysis.

### Markdown

Write a derived Markdown summary under `evals/results/`.

Recommended name:

- `evals/results/<date>-<suite>-matrix.md`

Recommended sections:

- run metadata
- leaderboard table
- baseline-relative diffs
- hardest cases
- disagreement cases
- per-model failure excerpts

Markdown is presentation, not the source of truth.

## History Strategy

The first version should use file-based history only.

- write JSON and Markdown artifacts into `evals/results/`
- include metadata needed for later scans:
  - timestamp
  - suite
  - dataset paths
  - baseline model id
  - git commit

If trend reporting becomes necessary later, add a small script that scans existing JSON files. Do not add a database before the report schema proves stable.

## Rollout Plan

1. Add model profile schema and loader
2. Add comparison report types and reducers
3. Extend the CLI and `evals/run.mjs` to support matrix mode
4. Write JSON and Markdown outputs
5. Add targeted tests for config parsing, comparison behavior, and report rendering
6. Update docs to explain single-model versus matrix mode

## Risks And Mitigations

- **Rate limits or provider instability**
  - Mitigation: keep v1 serial, preserve per-model error accounting
- **Result shape drift**
  - Mitigation: define stable report types before adding presentation logic
- **Judge-induced noise**
  - Mitigation: keep judge configuration fixed and outside the compared model set in v1
- **CLI complexity**
  - Mitigation: preserve current single-model mode and gate matrix behavior behind `--models-config`

## Decision

Adopt the matrix-first orchestration design, backed by `evals/models.json`, with file-based JSON and Markdown outputs and explicit baseline-relative comparison.
