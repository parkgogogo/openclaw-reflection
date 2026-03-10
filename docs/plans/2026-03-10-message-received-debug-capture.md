# Message Received Debug Capture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture the latest raw `message_received` callback payload in `logs/debug.json` when Reflection runs at debug log level.

**Architecture:** Extend `FileLogger` with a dedicated debug capture writer and call it from the `message_received` hook path in `src/index.ts`. Keep the capture isolated from the existing structured daily log flow so normal behavior remains unchanged.

**Tech Stack:** TypeScript, Node.js `fs`, Node test runner

---

### Task 1: Add failing tests for debug payload capture

**Files:**
- Modify: `/Users/gongyuan/labs/openclaw-reflection/tests/plugin-hooks.test.mjs`

**Step 1: Write the failing test**

- Add a test that activates the plugin with `logLevel: "debug"`, triggers the registered `message_received` hook twice, and expects `logs/debug.json` to exist with the second payload only.
- Add a second test that activates the plugin with `logLevel: "info"` and expects no `logs/debug.json`.

**Step 2: Run test to verify it fails**

Run: `pnpm run build && node --test tests/plugin-hooks.test.mjs`
Expected: FAIL because `logs/debug.json` is not created yet.

### Task 2: Implement debug payload capture

**Files:**
- Modify: `/Users/gongyuan/labs/openclaw-reflection/src/logger.ts`
- Modify: `/Users/gongyuan/labs/openclaw-reflection/src/index.ts`

**Step 1: Write minimal implementation**

- Add a `writeLatestDebugPayload` method on `FileLogger` that writes `logs/debug.json` only when the resolved log level is `debug`.
- Call that method from the `message_received` callback using the raw `event` and raw `context`.

**Step 2: Run test to verify it passes**

Run: `pnpm run build && node --test tests/plugin-hooks.test.mjs`
Expected: PASS

### Task 3: Update docs and version

**Files:**
- Modify: `/Users/gongyuan/labs/openclaw-reflection/README.md`
- Modify: `/Users/gongyuan/labs/openclaw-reflection/README.zh-CN.md`
- Modify: `/Users/gongyuan/labs/openclaw-reflection/package.json`
- Modify: `/Users/gongyuan/labs/openclaw-reflection/package-lock.json`

**Step 1: Document behavior**

- Add a short note describing `logs/debug.json` and that it only appears when `logLevel=debug`.

**Step 2: Bump patch version**

- Update package version from `0.1.3` to `0.1.4`.

### Task 4: Verify and release

**Files:**
- None

**Step 1: Run full verification**

Run: `pnpm test`
Expected: all tests pass

**Step 2: Commit**

```bash
git add docs/plans/2026-03-10-message-received-debug-capture-design.md docs/plans/2026-03-10-message-received-debug-capture.md tests/plugin-hooks.test.mjs src/logger.ts src/index.ts README.md README.zh-CN.md package.json package-lock.json
git commit -m "feat: capture latest message_received debug payload"
```

**Step 3: Push and tag**

```bash
git push origin main
git tag v0.1.4
git push origin v0.1.4
```
