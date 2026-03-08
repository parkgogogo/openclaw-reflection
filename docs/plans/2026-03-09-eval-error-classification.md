# Eval Error Classification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `memory_gate` eval output distinguish model decisions from provider/schema/internal execution failures so benchmark summaries are not misleading.

**Architecture:** Keep the current eval flow and `passed/total` behavior, but extend `memory_gate` case results with explicit `errorType` metadata and add summary error counts in the CLI output. Detect error classes from analyzer fallback reasons and runner-thrown exceptions without changing datasets or prompt logic.

**Tech Stack:** TypeScript, Node.js, existing eval runner and node:test tests.

---

### Task 1: Add failing tests for memory_gate error classification

**Files:**
- Modify: `tests/eval-runner.test.mjs`

**Step 1: Write the failing tests**

Add tests covering:
- provider request failure fallback becomes `errorType: "provider_error"`
- schema validation fallback becomes `errorType: "schema_error"`
- normal `NO_WRITE` decisions do not get an `errorType`

**Step 2: Run test to verify it fails**

Run: `node --test tests/eval-runner.test.mjs`

Expected: new assertions fail because `errorType` and summary counts are not implemented yet.

### Task 2: Implement minimal runner changes

**Files:**
- Modify: `src/evals/runner.ts`

**Step 1: Add result metadata**

Extend `MemoryGateCaseResult` and benchmark summary types with `errorType` / `errorCounts`.

**Step 2: Add classification helper**

Classify:
- `Provider request failed` -> `provider_error`
- `Schema validation failed` -> `schema_error`
- other thrown execution errors -> `execution_error`

**Step 3: Apply classification in benchmark evaluation**

Use fallback `reason` strings on completed cases and caught exceptions to populate `errorType` and aggregate summary counts.

### Task 3: Print error counts in CLI summary

**Files:**
- Modify: `evals/run.mjs`

**Step 1: Extend summary output**

Print `errors: provider_error=X schema_error=Y execution_error=Z` when non-zero.

### Task 4: Verify

**Files:**
- Test: `tests/eval-runner.test.mjs`

**Step 1: Run targeted tests**

Run: `pnpm exec tsc && node --test tests/eval-runner.test.mjs`

Expected: PASS

**Step 2: Run live eval**

Run: `pnpm run eval:memory-gate`

Expected: existing pass/fail behavior preserved, with explicit error counts shown when provider/schema failures happen.
