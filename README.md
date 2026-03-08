# OpenClaw Reflection

![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-111111?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square)
![memoryGate 18 cases](https://img.shields.io/badge/memoryGate-18%20benchmark%20cases-2ea043?style=flat-square)
![writer guardian 14 cases](https://img.shields.io/badge/writer%20guardian-14%20benchmark%20cases-2ea043?style=flat-square)

Chinese version: [README.zh-CN.md](./README.zh-CN.md)

**Make OpenClaw's native memory system sharper without replacing it.**

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

In practice, that means low migration risk and low conceptual overhead: you keep OpenClaw's native MEMORY workflow, and Reflection enhances the capture, filtering, routing, and consolidation steps around it.

## Why People Install It

Most chat memory systems fail in one of two ways:

- they forget too much, so you keep re-explaining the same context
- they remember too much, so temporary thread noise pollutes long-term memory

Reflection is built to fix both.

- Keep stable user preferences and collaboration habits
- Preserve durable shared context across sessions
- Separate memory into `MEMORY.md`, `USER.md`, `SOUL.md`, `IDENTITY.md`, and `TOOLS.md`
- Refuse one-off tasks, active thread chatter, and misrouted writes
- Periodically consolidate memory so it stays usable

## Install

### Recommended for users: install the plugin package

OpenClaw can install plugins directly from a package source. That is the right distribution path for Reflection, because users should not need to clone the repository or run `pnpm install` just to use the plugin.

For an install script written for OpenClaw itself to follow, including which config questions to ask first, see [INSTALL.md](./INSTALL.md).

Registry install after publishing:

```bash
openclaw plugins install <npm-spec>
```

Example:

```bash
openclaw plugins install @parkgogogo/openclaw-reflection
```

### Add the plugin config

Put the following under `plugins.entries.openclaw-reflection` in your OpenClaw config:

```json
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
      "enabled": true,
      "schedule": "0 2 * * *"
    }
  }
}
```

### Restart OpenClaw Gateway

Once the gateway restarts, Reflection will begin listening to `message_received` and `before_message_write`, then writing curated memory files into your configured `workspaceDir`.

## What You Get

| You want                             | Reflection gives you                                       |
| ------------------------------------ | ---------------------------------------------------------- |
| A memory system you can inspect      | Plain Markdown files you can open, edit, diff, and version |
| Better continuity across sessions    | Durable facts routed into the right long-term file         |
| Less memory pollution                | Gatekeeping that refuses temporary or misrouted content    |
| A system that stays usable over time | Scheduled consolidation for existing memory files          |

## Why This Beats Naive Memory

| Naive memory                     | Reflection                                       |
| -------------------------------- | ------------------------------------------------ |
| Appends whatever seems memorable | Filters for durable signal before writing        |
| Hides memory in a black box      | Stores memory in readable Markdown files         |
| Mixes all facts together         | Routes facts into purpose-specific files         |
| Lets bad writes accumulate       | Adds writer guarding and scheduled consolidation |

## How It Works

```mermaid
flowchart LR
  A["Incoming conversation"] --> B["Session buffer"]
  B --> C["memoryGate"]
  C -->|durable fact| D["Writer guardian"]
  C -->|thread noise| E["No write"]
  D --> F["MEMORY.md / USER.md / SOUL.md / IDENTITY.md / TOOLS.md"]
  F --> G["Scheduled consolidation"]
```

In practice, the pipeline is simple:

1. Reflection captures conversation context from OpenClaw hooks.
2. `memoryGate` decides whether the candidate fact is durable enough to keep.
3. A file-specific guardian either rewrites the target memory file or refuses the write.
4. Scheduled consolidation keeps `MEMORY.md`, `USER.md`, `SOUL.md`, and `TOOLS.md` compact over time.

## Proof, Not Just Promises

The active default offline benchmark currently includes:

- `memoryGate`: `18` benchmark cases
- `writer guardian`: `14` benchmark cases

The most recent archived result snapshots in this repo are:

- [`memoryGate`: 16/16 passed on V2](./evals/results/2026-03-08-memory-gate-v2-16-of-16.md)
- [`writer guardian`: 16/16 passed on V2](./evals/results/2026-03-08-writer-guardian-v2-16-of-16.md)

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
| `consolidation.enabled`  | `true`                      | Enable scheduled consolidation            |
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
pnpm run eval:writer-guardian
pnpm run eval:all
```

More eval details: [evals/README.md](./evals/README.md)

## Links

- OpenClaw plugin docs: [docs.openclaw.ai/tools/plugin](https://docs.openclaw.ai/tools/plugin)
