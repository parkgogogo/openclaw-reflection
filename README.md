<h1 align="center">OpenClaw Reflection</h1>

<p align="center">
  <img src="./assets/openclaw-reflection-logo.png" alt="OpenClaw Reflection logo" width="180" />
</p>

<p align="center"><strong>Make OpenClaw's native memory system sharper without replacing it.</strong></p>

<p align="center">
  <img alt="OpenClaw Plugin" src="https://img.shields.io/badge/OpenClaw-Plugin-111111?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square" />
  <img alt="memory_gate 18 cases" src="https://img.shields.io/badge/memory_gate-18%20benchmark%20cases-2ea043?style=flat-square" />
  <img alt="write_guardian 14 cases" src="https://img.shields.io/badge/write_guardian-14%20benchmark%20cases-2ea043?style=flat-square" />
</p>

<p align="center"><a href="./README.zh-CN.md">中文文档</a></p>

**OpenClaw Reflection is a plugin that makes your agent's long-term memory smarter.** It filters conversation noise, extracts truly important facts, and writes them to the right memory files. Your agent remembers what matters and forgets what doesn't.

**What you get:**
- Cleaner `MEMORY.md`, `USER.md`, `SOUL.md` — no more random chat clutter
- Automatic routing — facts go to the right file without manual sorting
- Session continuity — your agent actually remembers across conversations
- Fully inspectable — plain Markdown files you can read, edit, and version

---

## Quick Start

Get Reflection running in 5 minutes:

**1. Install the plugin**
```bash
openclaw plugins install @parkgogogo/openclaw-reflection
```

**2. Add minimal config** to your `openclaw.json` under `plugins.entries.openclaw-reflection`:
```jsonc
{
  "enabled": true,
  "config": {
    "workspaceDir": "/absolute/path/to/your-agent-workspace",
    "llm": {
      "baseURL": "https://openrouter.ai/api/v1",
      "apiKey": "YOUR_API_KEY",
      "model": "x-ai/grok-4.1-fast"
    }
  }
}
```

**3. Restart OpenClaw Gateway**

**4. Start chatting.** Mention a preference or important fact.

**5. Check your memory files** — `MEMORY.md`, `USER.md`, `TOOLS.md`, `IDENTITY.md`, `SOUL.md`.

When Reflection successfully writes memory, you'll see a `📝` reaction on your message.

For detailed install instructions, see [INSTALL.md](./INSTALL.md).

---

## How It Works

Reflection adds intelligence to OpenClaw's existing Markdown memory system. It doesn't replace anything — it enhances the write path.

**The data flow:**
1. Reflection listens to conversation hooks from OpenClaw
2. `memory_gate` analyzes recent messages and decides: *Is this worth remembering?* *Which file should it go to?*
3. `write_guardian` checks file responsibilities and decides: *Accept, reject, or merge?*
4. Clean, curated facts get written to your workspace memory files
5. Optional consolidation keeps long-term files compact over time

**What makes Reflection different:**
- No separate database — uses the same Markdown files you already have
- No core replacement — works alongside OpenClaw's default `memory-core`
- No hidden magic — you can read every memory file it writes
- Low migration risk — if you uninstall, your memory files remain intact

---

## Why Install Reflection?

OpenClaw's long-term memory files (`USER.md`, `TOOLS.md`, `IDENTITY.md`, `SOUL.md`) are hard to maintain manually. Reflection solves this by:

- **Keeping stable preferences** — your habits and style get preserved
- **Preserving shared context** — important background stays available across sessions
- **Routing correctly** — each fact goes to its proper home file
- **Refusing noise** — one-off tasks and thread chatter don't pollute memory
- **Staying usable** — optional consolidation prevents file bloat

---

## The Memory Files

Reflection writes to five standard OpenClaw memory files:

**`MEMORY.md`**
Durable shared context, important conclusions, and long-lived background facts.

**`USER.md`**
Stable user preferences, collaboration style, and helpful personal context.

**`SOUL.md`**
Assistant principles, boundaries, and continuity rules.

**`IDENTITY.md`**
Explicit identity metadata such as name, vibe, or avatar-style descriptors.

**`TOOLS.md`**
Environment-specific tool aliases, endpoints, device names, and local tool mappings.

---

## Core Mechanism

Reflection uses two specialized components to make memory decisions:

**`memory_gate`** — The filtering layer
- Analyzes recent conversation context
- Decides whether a fact is durable enough to keep
- Determines which target file should receive it
- Separates "should we remember this?" from "where does it go?"

**`write_guardian`** — The write gate
- Enforces file responsibilities before any write
- Can accept, reject, or merge content
- Prevents misrouted or conflicting writes
- Maintains file integrity and boundaries

This split is intentional. Extraction policy and file-level policy are different concerns that need separate handling.

---

## Install And Configure

### Install the plugin

```bash
openclaw plugins install @parkgogogo/openclaw-reflection
```

### Full configuration

Add to `plugins.entries.openclaw-reflection` in your OpenClaw config:

```jsonc
{
  "enabled": true,
  "config": {
    "workspaceDir": "/absolute/path/to/your-agent-workspace",
    "bufferSize": 50,
    "logLevel": "info",
    "llm": {
      "baseURL": "https://openrouter.ai/api/v1",
      "apiKey": "YOUR_API_KEY",
      "model": "x-ai/grok-4.1-fast"
    },
    "memoryGate": {
      "enabled": true,
      "windowSize": 10
    },
    "consolidation": {
      "enabled": false,
      "schedule": "0 2 * * *"
    }
  }
}
```

**Config options explained:**

- `workspaceDir` — Where memory files live (required)
- `bufferSize` — How many recent messages to keep for analysis (default: 50)
- `logLevel` — Runtime verbosity: `debug`, `info`, `warn`, `error` (default: `info`)
- `llm.baseURL` — OpenAI-compatible provider endpoint
- `llm.apiKey` — Your API key
- `llm.model` — Model for analysis (recommended: `x-ai/grok-4.1-fast`)
- `memoryGate.enabled` — Turn filtering on/off (default: `true`)
- `memoryGate.windowSize` — Messages analyzed per decision (default: 10)
- `consolidation.enabled` — Scheduled cleanup (default: `false`)
- `consolidation.schedule` — Cron expression for cleanup (default: daily at 2am)

### Restart to activate

After restarting the Gateway, Reflection begins listening to `message_received` and `before_message_write` hooks.

---

## Observability

See what Reflection is doing:

**Audit log**
`write_guardian` writes decisions to `<workspaceDir>/.openclaw-reflection/write-guardian.log.jsonl`

**Debug mode**
When `logLevel` is `debug`, raw `message_received` payloads go to `logs/debug.json`

**Visual feedback**
Successful memory writes get a `📝` reaction on the triggering message

**Command**
`reflections` returns the last 10 `write_guardian` decisions with target file and reason

---

## Current Scope

Reflection currently supports:
- A single agent
- Multiple sessions for that same agent

**Not yet supported:**
- Multi-agent memory coordination
- Per-agent routing across multiple agents in one OpenClaw setup

---

## Proof, Not Just Promises

Benchmark coverage:
- `memory_gate`: 18 test cases
- `write_guardian`: 14 test cases

Recent results:
- [`memory_gate`: 16/16 passed on V2](./evals/results/2026-03-08-memory-gate-v2-16-of-16.md)
- [`write_guardian`: 16/16 passed on V2](./evals/results/2026-03-08-write-guardian-v2-16-of-16.md)

These benchmarks target the failure modes that break memory systems:
- Refusing active thread noise
- Keeping user facts out of wrong files
- Preserving `SOUL` continuity rules
- Correctly replacing outdated `IDENTITY` metadata
- Keeping `TOOLS.md` useful without becoming a registry

---

## Development And Evals

**Recommended runtime model:** `x-ai/grok-4.1-fast`

**Development eval setup:**
- Eval model: `x-ai/grok-4.1-fast`
- Judge model: `openai/gpt-5.4`

```bash
pnpm run typecheck
pnpm run eval:memory-gate
pnpm run eval:write-guardian
pnpm run eval:all

node evals/run.mjs \
  --suite memory-gate \
  --models-config evals/models.json \
  --baseline grok-fast \
  --output evals/results/$(date +%F)-memory-gate-matrix.json \
  --markdown-output evals/results/$(date +%F)-memory-gate-matrix.md
```

Configuration in `evals/models.json` defines the comparison matrix. Provider settings come from `EVAL_BASE_URL` and `EVAL_API_KEY`.

More details: [evals/README.md](./evals/README.md)

---

## Model Selection

Benchmark date: 2026-03-09  
Scope: `memory_gate` only, 18 cases, shared OpenRouter-compatible route

**Top performers:**

**`x-ai/grok-4.1-fast`** — 17/18 (94.4%)  
Best overall stability, no errors. Recommended default.

**`qwen/qwen3.5-flash-02-23`** — 17/18 (94.4%)  
Strong backup option. One schema failure but good accuracy.

**`google/gemini-2.5-flash-lite`** — 16/18 (88.9%)  
Fast and cheap for prompt iteration. Slightly lower boundary accuracy.

**Not recommended as defaults:**
- `inception/mercury-2` — 61.1%, frequently misclassifies boundaries
- `minimax/minimax-m2.5` — 50.0%, struggles with SOUL/IDENTITY/NO_WRITE
- `openai/gpt-4o-mini` — 22.2%, provider-side errors on this route

Full results: [2026-03-09-memory-gate-openrouter-model-benchmark.md](./evals/results/2026-03-09-memory-gate-openrouter-model-benchmark.md)

---

## Links

- OpenClaw plugin docs: [docs.openclaw.ai/tools/plugin](https://docs.openclaw.ai/tools/plugin)
