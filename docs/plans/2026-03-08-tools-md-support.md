# TOOLS.md Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full-chain `TOOLS.md` support so memory-gate, writer guardian, and consolidation can route, validate, write, and clean tool-specific local environment context.

**Architecture:** Extend the existing managed-file model by adding `TOOLS.md` as a first-class target alongside `MEMORY.md`, `USER.md`, `SOUL.md`, and `IDENTITY.md`. Update routing prompts and enums, add writer-guardian policy for `TOOLS.md`, then extend consolidation and eval fixtures so the new file type is covered end to end.

**Tech Stack:** TypeScript, Node.js test runner, JSONL eval datasets

---

### Task 1: Add failing tests for TOOLS routing and curation

**Files:**
- Modify: `tests/memory-gate.test.mjs`
- Modify: `tests/file-curator.test.mjs`
- Modify: `tests/consolidator.test.mjs`

**Step 1: Write the failing test**

Add coverage for:
- `MemoryGateAnalyzer` prompt and schema accepting `UPDATE_TOOLS`
- `FileCurator` exposing and mapping `TOOLS.md`
- `Consolidator` reading and writing `TOOLS.md`

**Step 2: Run test to verify it fails**

Run: `node --test tests/memory-gate.test.mjs tests/file-curator.test.mjs tests/consolidator.test.mjs`
Expected: FAIL because `UPDATE_TOOLS` and `TOOLS.md` are not supported yet.

**Step 3: Write minimal implementation**

Touch the routing and writer code only enough to satisfy the new tests.

**Step 4: Run test to verify it passes**

Run: `node --test tests/memory-gate.test.mjs tests/file-curator.test.mjs tests/consolidator.test.mjs`
Expected: PASS

### Task 2: Extend production code for TOOLS.md end-to-end

**Files:**
- Modify: `src/memory-gate/types.ts`
- Modify: `src/memory-gate/analyzer.ts`
- Modify: `src/memory-gate/prompt.ts`
- Modify: `src/file-curator/index.ts`
- Modify: `src/consolidation/types.ts`
- Modify: `src/consolidation/prompt.ts`
- Modify: `src/consolidation/consolidator.ts`

**Step 1: Update memory-gate decision types and prompt**

Add `UPDATE_TOOLS` to the enum, schema, and prompt guidance. Keep routing narrow: local tool mappings and environment-specific tool context only.

**Step 2: Update writer guardian**

Add `TOOLS.md` to the target-file map and policy prompt. Preserve the existing rule that the guardian only reasons about the provided target file.

**Step 3: Update consolidation**

Include `TOOLS.md` in managed files, current-file prompt payloads, cleanup schema, and write application. Keep cleanup limited to merge, dedupe, and stale-mapping replacement.

**Step 4: Run focused tests**

Run: `node --test tests/memory-gate.test.mjs tests/file-curator.test.mjs tests/consolidator.test.mjs`
Expected: PASS

### Task 3: Add failing eval coverage for TOOLS.md

**Files:**
- Modify: `evals/datasets/shared/scenarios.jsonl`
- Modify: `evals/datasets/memory-gate/benchmark.jsonl`
- Modify: `evals/datasets/writer-guardian/benchmark.jsonl`
- Modify: `tests/eval-runner.test.mjs`
- Modify: `tests/writer-guardian-dataset.test.mjs`

**Step 1: Write failing dataset/test updates**

Add `TOOLS.md` positive and refusal cases to shared scenarios and both benchmark files. Update dataset-count assertions to include the new rows.

**Step 2: Run tests to verify failure**

Run: `node --test tests/eval-runner.test.mjs tests/writer-guardian-dataset.test.mjs`
Expected: FAIL until dataset counts and new expectations line up.

**Step 3: Write minimal dataset + assertion updates**

Keep cases narrow:
- positive tool alias / host / voice mapping
- refusal for reusable workflow instructions
- refusal for runtime tool availability claims

**Step 4: Run tests to verify pass**

Run: `node --test tests/eval-runner.test.mjs tests/writer-guardian-dataset.test.mjs`
Expected: PASS

### Task 4: Update docs and run full verification

**Files:**
- Modify: `README.md`
- Add: `research/tools.md`

**Step 1: Update docs**

Document `TOOLS.md` in the file-role table, architecture overview, and eval framing.

**Step 2: Run full verification**

Run: `pnpm exec tsc`
Run: `node --test tests/memory-gate.test.mjs tests/file-curator.test.mjs tests/consolidator.test.mjs tests/eval-runner.test.mjs tests/eval-datasets.test.mjs tests/writer-guardian-dataset.test.mjs`
Expected: PASS
