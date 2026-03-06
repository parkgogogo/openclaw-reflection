# Route + Writer Guardian Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前记忆系统重构为 `MemoryGate` 实时 route、`Writer Agent` 守门写入、`Consolidation` 低频整理的双 loop 架构。

**Architecture:** `MemoryGate` 只输出 `NO_WRITE` 或 `UPDATE_*`。`Writer Agent` 只读取当前目标文件，基于文件语义决定整文件覆盖写或拒写。`Consolidation` 定时整理 `MEMORY.md` / `USER.md` / `SOUL.md`，先判断 `NO_WRITE | WRITE_CLEANUP`，不再处理中间层。

**Tech Stack:** TypeScript, OpenClaw Plugin API, runtime LLM completion API, Node test runner, file locking

---

### Task 1: Remove Daily Memory Path

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `openclaw.plugin.json`
- Modify: `src/memory-gate/types.ts`
- Modify: `src/memory-gate/prompt.ts`
- Modify: `src/memory-gate/analyzer.ts`
- Delete: `src/daily-writer/index.ts`

**Step 1: Write the failing test**

Add assertions to existing architecture tests that `WRITE_DAILY` and `dailyWriter` are no longer part of the public shape.

**Step 2: Run test to verify it fails**

Run: `pnpm exec tsc`
Expected: type or import failures caused by lingering `WRITE_DAILY` / `dailyWriter` references

**Step 3: Write minimal implementation**

- Remove `WRITE_DAILY` from memory gate decision types and prompts
- Remove `dailyWriter` config and plugin schema
- Delete `src/daily-writer/index.ts`

**Step 4: Run test to verify it passes**

Run: `pnpm exec tsc`
Expected: no type errors from removed daily-memory path

**Step 5: Commit**

```bash
git add src/types.ts src/config.ts openclaw.plugin.json src/memory-gate/types.ts src/memory-gate/prompt.ts src/memory-gate/analyzer.ts src/daily-writer/index.ts
git commit -m "refactor: remove daily memory route"
```

### Task 2: Upgrade FileCurator into Writer Agent

**Files:**
- Modify: `src/file-curator/index.ts`
- Test: `tests/file-curator.test.mjs`

**Step 1: Write the failing test**

Add a test showing:

- `FileCurator` calls the LLM
- the LLM can refuse to write
- when it writes, it rewrites the whole target file based on current raw content

**Step 2: Run test to verify it fails**

Run: `node --test tests/file-curator.test.mjs`
Expected: fail because current implementation appends managed blocks and does not support guardian refusal

**Step 3: Write minimal implementation**

- Replace managed-block append logic with LLM-driven writer-agent flow
- Restrict reads and writes to the target file only
- If the LLM refuses write, log internally and return
- If the LLM approves, overwrite the target file

**Step 4: Run test to verify it passes**

Run: `node --test tests/file-curator.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/file-curator/index.ts tests/file-curator.test.mjs
git commit -m "feat: turn file curator into guarded writer agent"
```

### Task 3: Rewire Message Flow

**Files:**
- Modify: `src/message-handler.ts`
- Modify: `src/index.ts`

**Step 1: Write the failing test**

Add a minimal integration test or compile-level assertion that `handleMessageSent` only depends on `MemoryGate` and `FileCurator`.

**Step 2: Run test to verify it fails**

Run: `pnpm exec tsc`
Expected: failures from old `DailyWriter` references

**Step 3: Write minimal implementation**

- Remove `DailyWriter` from imports, constructor wiring, and handler signatures
- Route `UPDATE_*` exclusively to `FileCurator`
- Keep `NO_WRITE` as a no-op

**Step 4: Run test to verify it passes**

Run: `pnpm exec tsc`
Expected: PASS

**Step 5: Commit**

```bash
git add src/message-handler.ts src/index.ts
git commit -m "refactor: route memory writes through file curator only"
```

### Task 4: Rebuild Consolidation as Cleanup Loop

**Files:**
- Modify: `src/consolidation/types.ts`
- Modify: `src/consolidation/prompt.ts`
- Modify: `src/consolidation/consolidator.ts`
- Modify: `src/consolidation/scheduler.ts`
- Modify: `src/consolidation/index.ts`
- Test: `tests/consolidator.test.mjs`

**Step 1: Write the failing test**

Add a test showing:

- `Consolidator` reads `MEMORY.md` / `USER.md` / `SOUL.md`
- calls the LLM once
- supports `decision: NO_WRITE | WRITE_CLEANUP`
- applies only cleanup updates to existing long-term files

**Step 2: Run test to verify it fails**

Run: `node --test tests/consolidator.test.mjs`
Expected: fail because current implementation still depends on old daily-memory assumptions or local heuristics

**Step 3: Write minimal implementation**

- Remove daily-memory inputs entirely
- Change prompt to cleanup semantics
- Let the LLM decide `NO_WRITE` vs `WRITE_CLEANUP`
- Apply cleanup patches only to `MEMORY.md` / `USER.md` / `SOUL.md`
- Keep `IDENTITY.md` out of scope

**Step 4: Run test to verify it passes**

Run: `node --test tests/consolidator.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add src/consolidation/types.ts src/consolidation/prompt.ts src/consolidation/consolidator.ts src/consolidation/scheduler.ts src/consolidation/index.ts tests/consolidator.test.mjs
git commit -m "refactor: convert consolidation into cleanup loop"
```

### Task 5: Full Verification

**Files:**
- Verify only

**Step 1: Run compile verification**

Run: `pnpm exec tsc`
Expected: PASS

**Step 2: Run targeted tests**

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
git commit -m "chore: verify route-writer-guardian architecture"
```
