# Memory Gate Benchmark README Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the requested OpenRouter model profiles to the `memory_gate` comparison matrix, run one benchmark round, and publish the benchmark results with model-selection guidance in the README files.

**Architecture:** Keep the current comparison runner unchanged and extend only the checked-in model matrix plus benchmark presentation docs. Use the generated matrix artifact as the source of truth, then summarize pass rate and internal error counts into a README comparison table with concrete model-selection recommendations.

**Tech Stack:** TypeScript, Node.js, existing eval runner, OpenRouter-compatible `.env`, Markdown docs

---

### Task 1: Extend the model matrix

**Files:**
- Modify: `evals/models.json`

**Step 1: Add the requested model profiles**

Add:
- `inception/mercury-2`
- `google/gemini-2.5-flash-lite`
- `openai/gpt-4o-mini`
- `minimax/minimax-m2.5`
- `qwen/qwen3.5-flash-02-23`

Keep the shared-provider config model where only `model` differs per profile.

**Step 2: Keep one baseline model**

Retain `grok-fast` as the baseline unless the benchmark results justify changing the README recommendation.

### Task 2: Run the `memory_gate` matrix benchmark

**Files:**
- Output: `evals/results/<date>-memory-gate-matrix.json`
- Output: `evals/results/<date>-memory-gate-matrix.md`

**Step 1: Run the benchmark**

Run:

```bash
node evals/run.mjs \
  --suite memory-gate \
  --models-config evals/models.json \
  --baseline grok-fast \
  --output evals/results/<date>-memory-gate-matrix.json \
  --markdown-output evals/results/<date>-memory-gate-matrix.md
```

**Step 2: Record the actual results**

Use the JSON artifact as the source of truth for:
- pass/total
- accuracy
- provider/schema/execution errors

### Task 3: Publish benchmark guidance in README

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

**Step 1: Add a `Model Selection` section**

Include:
- benchmark date
- dataset/suite scope
- compared models

**Step 2: Add a comparison table**

Columns:
- model
- pass/total
- accuracy
- provider/schema/execution errors
- recommendation
- best for

**Step 3: Add concise selection rules**

Explain:
- prefer highest pass rate for the default baseline
- use internal errors to break ties
- keep lower-cost or faster models for cheap iteration only if accuracy remains acceptable

### Task 4: Verify and commit

**Files:**
- Test: `tests/eval-cli.test.mjs`
- Test: `tests/eval-models.test.mjs`
- Test: `tests/eval-runner.test.mjs`
- Test: `tests/eval-comparison.test.mjs`
- Test: `tests/eval-reporting.test.mjs`

**Step 1: Run targeted verification**

Run:

```bash
pnpm exec tsc && node --test tests/eval-models.test.mjs tests/eval-cli.test.mjs tests/eval-runner.test.mjs tests/eval-comparison.test.mjs tests/eval-reporting.test.mjs
```

**Step 2: Review the generated artifacts and README table**

Confirm the README summary matches the JSON artifact values exactly.

**Step 3: Commit**

```bash
git add evals/models.json evals/results/*.json evals/results/*.md README.md README.zh-CN.md docs/plans/2026-03-09-memory-gate-benchmark-readme-update.md
git commit -m "docs: publish memory gate model benchmark guidance"
```
