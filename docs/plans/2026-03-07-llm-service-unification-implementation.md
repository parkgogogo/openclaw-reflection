# LLMService Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将分散的 LLM 调用统一收束到 `LLMService`，让 `MemoryGate` / `Consolidation` 使用 `generateObject`，让 `Writer Guardian` 使用 `read` / `write` 双工具 agent。

**Architecture:** 新增 `src/llm/` 作为唯一 LLM 接入层。`MemoryGate` 与 `Consolidation` 改为对象生成调用，`FileCurator` 改为受限 `read` / `write` agent。业务层不再自己解析 JSON 或模拟 agent 协议。

**Tech Stack:** TypeScript, OpenClaw Plugin runtime API, JSON schema validation, Node test runner, file locking

---

### Task 1: Introduce LLMService Core Types

**Files:**
- Create: `src/llm/types.ts`
- Create: `src/llm/index.ts`
- Modify: `src/types.ts`
- Modify: `src/memory-gate/types.ts`

**Step 1: Write the failing test**

Add a compile-level assertion that old `LLMClient.complete(...)` is no longer the dependency shape consumed by new call sites.

**Step 2: Run test to verify it fails**

Run: `pnpm exec tsc`
Expected: type failures from existing `LLMClient` references

**Step 3: Write minimal implementation**

- Add `LLMService` types:
  - `GenerateObjectParams`
  - `AgentTool`
  - `RunAgentParams`
  - `AgentRunResult`
- Export `LLMService` through shared type surface
- Remove direct `LLMClient` dependency from module interfaces that should consume `LLMService`

**Step 4: Run test to verify it passes**

Run: `pnpm exec tsc`
Expected: no type failures from the new shared LLM interfaces

**Step 5: Commit**

```bash
git add src/llm/types.ts src/llm/index.ts src/types.ts src/memory-gate/types.ts
git commit -m "refactor: introduce unified llm service interfaces"
```

### Task 2: Implement LLMService Provider Layer

**Files:**
- Create: `src/llm/service.ts`
- Test: `tests/llm-service.test.mjs`
- Modify: `src/index.ts`

**Step 1: Write the failing test**

Add tests showing:

- `generateObject` returns a parsed validated object
- `runAgent` can perform a simple `read -> write`
- `runAgent` returns `didWrite=false` when no write happens

**Step 2: Run test to verify it fails**

Run: `pnpm exec tsc && node --test tests/llm-service.test.mjs`
Expected: FAIL because `LLMService` implementation does not exist yet

**Step 3: Write minimal implementation**

- Implement `LLMService` over current runtime provider
- Keep all JSON/text compatibility logic inside `src/llm/service.ts`
- Add a bounded agent loop for tool calls
- Keep initial tools provider-agnostic; tools are supplied by caller
- Update `src/index.ts` to create one shared `LLMService`

**Step 4: Run test to verify it passes**

Run: `pnpm exec tsc && node --test tests/llm-service.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/llm/service.ts src/index.ts tests/llm-service.test.mjs
git commit -m "feat: add unified llm service runtime adapter"
```

### Task 3: Migrate MemoryGate to generateObject

**Files:**
- Modify: `src/memory-gate/analyzer.ts`
- Modify: `src/memory-gate/index.ts`
- Modify: `src/memory-gate/types.ts`
- Test: `tests/memory-gate.test.mjs` or existing compile/test coverage if a dedicated test file is added

**Step 1: Write the failing test**

Add a test showing `MemoryGateAnalyzer` consumes structured object output and no longer depends on free-form JSON extraction behavior.

**Step 2: Run test to verify it fails**

Run: `pnpm exec tsc && node --test tests/memory-gate.test.mjs`
Expected: FAIL because analyzer still depends on `complete(...)`

**Step 3: Write minimal implementation**

- Replace `LLMClient` dependency with `LLMService`
- Move decision schema definition next to `MemoryGate`
- Call `llmService.generateObject(...)`
- Remove local text-to-JSON parsing helpers
- Keep only business-level validation for `decision` and `candidate_fact`

**Step 4: Run test to verify it passes**

Run: `pnpm exec tsc && node --test tests/memory-gate.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory-gate/analyzer.ts src/memory-gate/index.ts src/memory-gate/types.ts tests/memory-gate.test.mjs
git commit -m "refactor: migrate memory gate to llm service objects"
```

### Task 4: Migrate Writer Guardian to read/write Agent

**Files:**
- Modify: `src/file-curator/index.ts`
- Modify: `src/index.ts`
- Modify: `tests/file-curator.test.mjs`

**Step 1: Write the failing test**

Add tests showing:

- `FileCurator` passes `read` and `write` tools into `runAgent`
- `read` only exposes current target file
- `write` only overwrites current target file
- if no write happens, guardian refusal is logged and no file changes occur

**Step 2: Run test to verify it fails**

Run: `pnpm exec tsc && node --test tests/file-curator.test.mjs`
Expected: FAIL because current implementation still uses object generation instead of tool loop

**Step 3: Write minimal implementation**

- Replace direct object-generation flow with `llmService.runAgent(...)`
- Add local `read` / `write` tools scoped to the current file
- Treat “no write tool call” as guardian refusal
- Preserve current file-semantics system prompt

**Step 4: Run test to verify it passes**

Run: `pnpm exec tsc && node --test tests/file-curator.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/file-curator/index.ts src/index.ts tests/file-curator.test.mjs
git commit -m "feat: convert writer guardian to read write agent"
```

### Task 5: Migrate Consolidation to generateObject

**Files:**
- Modify: `src/consolidation/consolidator.ts`
- Modify: `src/consolidation/index.ts`
- Modify: `tests/consolidator.test.mjs`

**Step 1: Write the failing test**

Add or update tests showing `Consolidator` consumes structured cleanup output through `LLMService.generateObject(...)`.

**Step 2: Run test to verify it fails**

Run: `pnpm exec tsc && node --test tests/consolidator.test.mjs`
Expected: FAIL because consolidator still depends on `complete(...)`

**Step 3: Write minimal implementation**

- Replace direct completion dependency with `LLMService`
- Move cleanup schema to consolidation layer or shared llm schemas
- Keep current cleanup patch application behavior unchanged

**Step 4: Run test to verify it passes**

Run: `pnpm exec tsc && node --test tests/consolidator.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/consolidation/consolidator.ts src/consolidation/index.ts tests/consolidator.test.mjs
git commit -m "refactor: move consolidation onto llm service"
```

### Task 6: Full Verification

**Files:**
- Verify only

**Step 1: Run compile verification**

Run: `pnpm exec tsc`
Expected: PASS

**Step 2: Run targeted tests**

Run: `node --test tests/llm-service.test.mjs`
Expected: PASS

Run: `node --test tests/memory-gate.test.mjs`
Expected: PASS

Run: `node --test tests/file-curator.test.mjs`
Expected: PASS

Run: `node --test tests/consolidator.test.mjs`
Expected: PASS

**Step 3: Run project verification**

Run: `pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add .
git commit -m "chore: verify llm service unification"
```
