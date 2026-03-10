# OpenClaw Reflection

<p align="center">
  <img src="./assets/openclaw-reflection-logo.png" alt="OpenClaw Reflection logo" width="180" />
</p>

<p align="center"><strong>Make OpenClaw's native memory system sharper without replacing it.</strong></p>

![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-111111?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square)
![memory_gate 18 cases](https://img.shields.io/badge/memory_gate-18%20benchmark%20cases-2ea043?style=flat-square)
![write_guardian 14 cases](https://img.shields.io/badge/write_guardian-14%20benchmark%20cases-2ea043?style=flat-square)

Chinese version: [README.zh-CN.md](./README.zh-CN.md)

OpenClaw Reflection is an additive layer on top of OpenClaw's built-in Markdown memory system. It captures message flow, keeps thread noise out of long-term memory, writes durable knowledge into the same human-readable memory files OpenClaw already uses, and periodically consolidates them so your agent gets sharper over time instead of messier.

## Current Scope

Reflection currently supports:

- a single agent
- multiple sessions for that same agent

Reflection does not currently support multi-agent memory coordination or per-agent routing across multiple agents in one OpenClaw setup.

## Built On OpenClaw Memory

OpenClaw memory is already workspace-native: the source of truth is Markdown files in the agent workspace, not a hidden database. In the official model, daily logs live under `memory/YYYY-MM-DD.md`, while `MEMORY.md` is the curated long-term layer.

Reflection builds on top of that system instead of replacing it.

- It does **not** introduce a separate memory store
- It does **not** require replacing OpenClaw's default `memory-core`
- It does **not** take over the active `plugins.slots.memory` role
- It works by listening to message hooks and curating the same workspace memory files
- It analyzes and curates `USER.md`, `MEMORY.md`, `TOOLS.md`, `IDENTITY.md`, and `SOUL.md` based on conversation flow

In practice, that means low migration risk and low conceptual overhead: you keep OpenClaw's native MEMORY workflow, and Reflection enhances the capture, filtering, routing, and consolidation steps around it.

## Why People Install It

OpenClaw's core long-term files such as `USER.md`, `TOOLS.md`, `IDENTITY.md`, and `SOUL.md` are hard to improve continuously in the default setup.

Reflection is built to solve that.

- Keep stable user preferences and collaboration habits
- Preserve durable shared context across sessions
- Separate memory into `MEMORY.md`, `USER.md`, `SOUL.md`, `IDENTITY.md`, and `TOOLS.md`
- Refuse one-off tasks, active thread chatter, and misrouted writes
- Periodically consolidate memory so it stays usable

## Core Mechanism

Reflection uses LLM analysis over recent conversation context and adds two control points: `memory_gate` and `write_guardian`.

- `memory_gate` analyzes the conversation and decides which durable fact, if any, should be written and which target file it belongs to
- `write_guardian` acts as the write gate and follows OpenClaw's file responsibilities to decide whether a write should be accepted, rejected, or merged into the target file

## Install

### Recommended for users: install the plugin package

For an install script written for OpenClaw itself to follow, including which config questions to ask first, see [INSTALL.md](./INSTALL.md).

Install

```bash
openclaw plugins install <npm-spec>
```

Example:

```bash
openclaw plugins install @parkgogogo/openclaw-reflection
```

### Add the plugin config

Put the following under `plugins.entries.openclaw-reflection` in your OpenClaw config:

```jsonc
{
  "enabled": true, // Enable the plugin entry
  "config": {
    "workspaceDir": "/absolute/path/to/your-agent-workspace", // Workspace where MEMORY.md, USER.md, TOOLS.md, IDENTITY.md, and SOUL.md live
    "bufferSize": 50, // Session buffer size used to collect recent messages
    "logLevel": "info", // Runtime log verbosity: debug, info, warn, or error
    "llm": {
      "baseURL": "https://openrouter.ai/api/v1", // OpenAI-compatible provider base URL
      "apiKey": "YOUR_API_KEY", // Provider API key used for analysis and writing
      "model": "x-ai/grok-4.1-fast" // Recommended model for plugin runtime
    },
    "memoryGate": {
      "enabled": true, // Enable durable-memory filtering before any write
      "windowSize": 10 // Number of recent messages included in memory_gate analysis
    },
    "consolidation": {
      "enabled": false, // Keep disabled by default; enable only if you want scheduled cleanup
      "schedule": "0 2 * * *" // Cron expression used when consolidation is enabled
    }
  }
}
```

### Restart OpenClaw Gateway

Once the gateway restarts, Reflection will begin listening to `message_received` and `before_message_write`, then writing curated memory files into your configured `workspaceDir`.

### Observability command

- Reflection now writes an independent write_guardian audit log to:
  - `<workspaceDir>/.openclaw-reflection/write-guardian.log.jsonl`
- Register command: `/openclaw-reflection`
  - Returns the most recent 10 write_guardian behaviors (written/refused/failed/skipped), including decision, target file, and reason.

## What You Get

| You want                             | Reflection gives you                                       |
| ------------------------------------ | ---------------------------------------------------------- |
| A memory system you can inspect      | Plain Markdown files you can open, edit, diff, and version |
| Better continuity across sessions    | Durable facts routed into the right long-term file         |
| Less memory pollution                | Gatekeeping that refuses temporary or misrouted content    |
| A system that stays usable over time | Optional scheduled consolidation for existing memory files |

## How It Works

![OpenClaw Reflection flowchart](./assets/memory-flowchart.png)

In practice, the pipeline is simple:

1. Reflection captures conversation context from OpenClaw hooks.
2. `memory_gate` decides whether the candidate fact is durable enough to keep.
3. A file-specific guardian either rewrites the target memory file or refuses the write.
4. When enabled, scheduled consolidation keeps `MEMORY.md`, `USER.md`, `SOUL.md`, and `TOOLS.md` compact over time.

## Proof, Not Just Promises

The active default offline benchmark currently includes:

- `memory_gate`: `18` benchmark cases
- `write_guardian`: `14` benchmark cases

The most recent archived result snapshots in this repo are:

- [`memory_gate`: 16/16 passed on V2](./evals/results/2026-03-08-memory-gate-v2-16-of-16.md)
- [`write_guardian`: 16/16 passed on V2](./evals/results/2026-03-08-write-guardian-v2-16-of-16.md)

These evals focus on the failure modes that make long-term memory systems unreliable:

- refusing active thread noise
- keeping user facts out of the wrong file
- preserving `SOUL` continuity rules
- replacing outdated `IDENTITY` metadata correctly
- keeping local tool mappings in `TOOLS.md` without turning it into a tool registry

## The Memory Files

| File          | Purpose                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| `MEMORY.md`   | Durable shared context, important conclusions, long-lived background facts          |
| `USER.md`     | Stable user preferences, collaboration style, helpful personal context              |
| `SOUL.md`     | Assistant principles, boundaries, and continuity rules                              |
| `IDENTITY.md` | Explicit identity metadata such as name, vibe, or avatar-style descriptors          |
| `TOOLS.md`    | Environment-specific tool aliases, endpoints, device names, and local tool mappings |

## Advanced Configuration

| Key                      | Default                     | Meaning                                   |
| ------------------------ | --------------------------- | ----------------------------------------- |
| `workspaceDir`           | none                        | Directory where memory files are written  |
| `bufferSize`             | `50`                        | Session buffer size                       |
| `logLevel`               | `info`                      | `debug`, `info`, `warn`, or `error`       |
| `llm.baseURL`            | `https://api.openai.com/v1` | OpenAI-compatible provider URL            |
| `llm.apiKey`             | empty                       | Provider API key                          |
| `llm.model`              | `gpt-4.1-mini`              | Model used for analysis and consolidation |
| `memoryGate.enabled`     | `true`                      | Enable long-term memory filtering         |
| `memoryGate.windowSize`  | `10`                        | Message window used during analysis       |
| `consolidation.enabled`  | `false`                     | Enable scheduled consolidation            |
| `consolidation.schedule` | `0 2 * * *`                 | Cron expression for consolidation         |

## Built For

- personal agents that should get better over weeks, not just one session
- single-agent OpenClaw setups with many sessions
- teams that want memory with reviewability and version control
- OpenClaw users who do not want a black-box memory store
- agents that need stronger continuity without turning every chat into permanent history

## Development And Evals

Recommended model for real plugin use:

- `x-ai/grok-4.1-fast`

The development eval setup in this repository currently uses:

- eval model: `x-ai/grok-4.1-fast`
- judge model: `openai/gpt-5.4`

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

`evals/models.json` defines only the comparison matrix. The shared provider endpoint and key still come from `EVAL_BASE_URL` and `EVAL_API_KEY`. JSON output is the source of truth for automation and history, while the Markdown artifact is the readable leaderboard summary.

More eval details: [evals/README.md](./evals/README.md)

## Model Selection

Benchmark date: `2026-03-09`  
Scope: `memory_gate` only, `18` cases, shared OpenRouter-compatible `EVAL_*` route

| Model | Pass/Total | Accuracy | Errors (P/S/E) | Recommendation | Best For |
| --- | --- | --- | --- | --- | --- |
| `x-ai/grok-4.1-fast` | `17/18` | `94.4%` | `0/0/0` | Default baseline | Daily eval baseline |
| `qwen/qwen3.5-flash-02-23` | `17/18` | `94.4%` | `0/1/0` | Good backup option | Cost-sensitive cross-checks |
| `google/gemini-2.5-flash-lite` | `16/18` | `88.9%` | `0/0/0` | Fast iteration candidate | Cheap prompt iteration |
| `inception/mercury-2` | `11/18` | `61.1%` | `0/0/0` | Not recommended as default | Exploratory comparisons only |
| `minimax/minimax-m2.5` | `9/18` | `50.0%` | `0/0/0` | Not recommended as default | Occasional sanity checks only |
| `openai/gpt-4o-mini` | `4/18` | `22.2%` | `18/0/0` | Not recommended on current route | Avoid on current OpenRouter path |

How to choose:

- Default to `x-ai/grok-4.1-fast` because it had the best overall stability in this round with no internal errors.
- Use `qwen/qwen3.5-flash-02-23` as the strongest backup when you want similar accuracy but can tolerate one schema failure in this benchmark.
- Use `google/gemini-2.5-flash-lite` for cheaper, faster prompt iteration when slightly lower boundary accuracy is acceptable.
- Avoid `inception/mercury-2` and `minimax/minimax-m2.5` as defaults because they frequently collapse `SOUL`, `IDENTITY`, or `NO_WRITE` boundaries into the wrong bucket.
- Avoid `openai/gpt-4o-mini` on the current OpenRouter/Azure-backed route because all `18` cases surfaced provider-side structured-output errors.

Source artifact: [2026-03-09-memory-gate-openrouter-model-benchmark.md](./evals/results/2026-03-09-memory-gate-openrouter-model-benchmark.md)

## Links

- OpenClaw plugin docs: [docs.openclaw.ai/tools/plugin](https://docs.openclaw.ai/tools/plugin)
