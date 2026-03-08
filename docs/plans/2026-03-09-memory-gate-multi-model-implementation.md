# Memory Gate Multi-Model Eval Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-model comparison support to the eval stack so one command can run `memory_gate` and related suites across a named model matrix and emit stable comparison artifacts.

**Architecture:** Keep the existing runner functions single-model and add a new orchestration layer for model profile loading, per-model execution, and aggregate comparison reporting. Extend the CLI and eval entrypoint to support a matrix mode backed by `evals/models.json`, then render both JSON and Markdown outputs from the same normalized report structure.

**Tech Stack:** TypeScript, Node.js, existing eval runner and `node:test`, JSON config files, current `LLMService`

---

### Task 1: Add model profile config support

**Files:**
- Create: `src/evals/models.ts`
- Create: `evals/models.json`
- Test: `tests/eval-models.test.mjs`

**Step 1: Write the failing loader tests**

Cover:
- loading enabled profiles from a config file
- filtering to a requested subset of model ids
- rejecting unknown model ids
- rejecting profiles whose `apiKeyEnv` is missing from the environment

**Step 2: Run test to verify it fails**

Run: `node --test tests/eval-models.test.mjs`
Expected: FAIL because the loader module does not exist yet.

**Step 3: Write minimal loader implementation**

Add types like:

```ts
export interface EvalModelProfile {
  id: string;
  label: string;
  baseURL: string;
  apiKeyEnv: string;
  model: string;
  enabled: boolean;
  tags?: string[];
}
```

Implement helpers to:

- read `evals/models.json`
- select enabled profiles
- optionally filter by requested ids
- resolve API keys from `process.env`

**Step 4: Run test to verify it passes**

Run: `node --test tests/eval-models.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/eval-models.test.mjs src/evals/models.ts evals/models.json
git commit -m "feat: add eval model profile loader"
```

### Task 2: Extend CLI parsing for comparison mode

**Files:**
- Modify: `src/evals/cli.ts`
- Modify: `tests/eval-cli.test.mjs`

**Step 1: Write the failing CLI parsing tests**

Add cases for:

- `--models-config`
- `--models`
- `--baseline`
- `--output`
- `--markdown-output`

Also cover that existing single-model flags still parse unchanged.

**Step 2: Run test to verify it fails**

Run: `node --test tests/eval-cli.test.mjs`
Expected: FAIL because the new flags are not returned yet.

**Step 3: Implement minimal CLI changes**

Extend `EvalCliOptions` with:

```ts
modelsConfigPath?: string;
models?: string[];
baselineModelId?: string;
outputPath?: string;
markdownOutputPath?: string;
```

Parse comma-separated model ids into an array and preserve current dataset flag behavior.

**Step 4: Run test to verify it passes**

Run: `node --test tests/eval-cli.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/evals/cli.ts tests/eval-cli.test.mjs
git commit -m "feat: add comparison cli flags"
```

### Task 3: Normalize single-model run reports

**Files:**
- Modify: `src/evals/runner.ts`
- Test: `tests/eval-runner.test.mjs`

**Step 1: Write the failing report-shape tests**

Add assertions for a helper that wraps benchmark output into a standard per-model report with:

- `modelId`
- `modelLabel`
- `startedAt`
- `finishedAt`
- `summary`
- `results`

**Step 2: Run test to verify it fails**

Run: `node --test tests/eval-runner.test.mjs`
Expected: FAIL because the wrapper or exported type does not exist yet.

**Step 3: Implement minimal report normalization**

Add a helper like:

```ts
export function buildSingleModelRunReport(input: {
  modelId: string;
  modelLabel: string;
  suite: EvalSuite;
  startedAt: string;
  finishedAt: string;
  summary: BenchmarkSummary;
  results: MemoryGateCaseResult[] | WriteGuardianCaseResult[];
}) {
  return { ...input };
}
```

Do not fold comparison logic into the runner loops.

**Step 4: Run test to verify it passes**

Run: `node --test tests/eval-runner.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/evals/runner.ts tests/eval-runner.test.mjs
git commit -m "refactor: normalize single-model eval reports"
```

### Task 4: Add multi-model comparison reducers

**Files:**
- Create: `src/evals/comparison.ts`
- Test: `tests/eval-comparison.test.mjs`

**Step 1: Write the failing comparison tests**

Cover:

- ranking models by passed count and error counts
- computing `regressedCases` and `improvedCases` against a baseline
- extracting hardest cases from per-case failures
- surfacing disagreement cases where models diverge on the same scenario

**Step 2: Run test to verify it fails**

Run: `node --test tests/eval-comparison.test.mjs`
Expected: FAIL because the comparison module does not exist yet.

**Step 3: Implement minimal comparison reducers**

Add pure functions such as:

```ts
export function rankModelReports(reports) {}
export function buildBaselineDiffs(reports, baselineModelId) {}
export function findHardestCases(reports) {}
export function findDisagreementCases(reports) {}
```

Keep them deterministic and independent from filesystem or provider code.

**Step 4: Run test to verify it passes**

Run: `node --test tests/eval-comparison.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/evals/comparison.ts tests/eval-comparison.test.mjs
git commit -m "feat: add eval comparison reducers"
```

### Task 5: Wire comparison mode into the eval entrypoint

**Files:**
- Modify: `evals/run.mjs`
- Modify: `src/evals/models.ts`
- Modify: `src/evals/comparison.ts`
- Test: `tests/eval-runner.test.mjs`

**Step 1: Write the failing integration test**

Add a targeted test around a small orchestration helper or entrypoint-facing function that:

- resolves two model profiles
- executes the same suite for both
- returns a `MultiModelComparisonReport`

Use stub `executeCase` callbacks instead of live providers.

**Step 2: Run test to verify it fails**

Run: `node --test tests/eval-runner.test.mjs`
Expected: FAIL because comparison mode orchestration does not exist yet.

**Step 3: Implement minimal comparison orchestration**

In `evals/run.mjs`:

- preserve current `EVAL_*` path when `--models-config` is absent
- enter comparison mode when `--models-config` is present
- create one `LLMService` per resolved profile
- run the requested suite once per profile
- build per-model reports
- build the aggregate comparison report

Keep execution serial in v1.

**Step 4: Run test to verify it passes**

Run: `node --test tests/eval-runner.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add evals/run.mjs src/evals/models.ts src/evals/comparison.ts tests/eval-runner.test.mjs
git commit -m "feat: add multi-model eval orchestration"
```

### Task 6: Add JSON and Markdown report writers

**Files:**
- Create: `src/evals/reporting.ts`
- Modify: `evals/run.mjs`
- Test: `tests/eval-reporting.test.mjs`

**Step 1: Write the failing report writer tests**

Cover:

- JSON output contains run metadata, models, and comparison sections
- Markdown output contains leaderboard, baseline diff, and hardest-case sections
- output paths are optional and no files are written when omitted

**Step 2: Run test to verify it fails**

Run: `node --test tests/eval-reporting.test.mjs`
Expected: FAIL because the reporting module does not exist yet.

**Step 3: Implement minimal report writers**

Add helpers like:

```ts
export async function writeComparisonJsonReport(path, report) {}
export function renderComparisonMarkdown(report) {}
```

Make Markdown derived from the JSON-ready report object instead of building separate business logic.

**Step 4: Run test to verify it passes**

Run: `node --test tests/eval-reporting.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/evals/reporting.ts evals/run.mjs tests/eval-reporting.test.mjs
git commit -m "feat: add eval comparison reports"
```

### Task 7: Update eval docs for matrix mode

**Files:**
- Modify: `evals/README.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

**Step 1: Update eval documentation**

Document:

- `evals/models.json`
- new CLI flags
- single-model versus matrix mode
- output artifact paths
- baseline semantics

**Step 2: Review docs for stale single-model wording**

Search for:

```bash
rg -n "EVAL_MODEL|eval:memory-gate|memory-gate" evals/README.md README.md README.zh-CN.md
```

Expected: identify the lines that need wording updates.

**Step 3: Commit**

```bash
git add evals/README.md README.md README.zh-CN.md
git commit -m "docs: document multi-model eval comparison"
```

### Task 8: Final verification

**Files:**
- Test: `tests/eval-models.test.mjs`
- Test: `tests/eval-cli.test.mjs`
- Test: `tests/eval-runner.test.mjs`
- Test: `tests/eval-comparison.test.mjs`
- Test: `tests/eval-reporting.test.mjs`

**Step 1: Run targeted tests**

Run: `pnpm exec tsc && node --test tests/eval-models.test.mjs tests/eval-cli.test.mjs tests/eval-runner.test.mjs tests/eval-comparison.test.mjs tests/eval-reporting.test.mjs`

Expected: PASS

**Step 2: Run a live matrix eval**

Run: `node evals/run.mjs --suite memory-gate --models-config evals/models.json --baseline grok-fast --output evals/results/$(date +%F)-memory-gate-matrix.json --markdown-output evals/results/$(date +%F)-memory-gate-matrix.md`

Expected:

- per-model summaries printed to stdout
- JSON report written
- Markdown report written
- exit code is non-zero only when at least one model has failing benchmark cases

**Step 3: Review generated artifacts**

Confirm that the Markdown leaderboard and baseline diff sections match the JSON report data.

**Step 4: Commit**

```bash
git add evals/results/*.json evals/results/*.md
git commit -m "chore: capture multi-model eval baseline"
```
