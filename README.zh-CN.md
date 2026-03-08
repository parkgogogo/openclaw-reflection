# OpenClaw Reflection

英文版： [README.md](./README.md)

![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-111111?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square)
![memoryGate 18 cases](https://img.shields.io/badge/memoryGate-18%20benchmark%20cases-2ea043?style=flat-square)
![writer guardian 14 cases](https://img.shields.io/badge/writer%20guardian-14%20benchmark%20cases-2ea043?style=flat-square)

**在不替换 OpenClaw 原生记忆体系的前提下，让 Markdown 记忆更干净、更稳定、更可持续。**

OpenClaw Reflection 是叠加在 OpenClaw 原生 Markdown memory 之上的一层增强插件。它负责监听消息流，过滤线程噪音，把真正长期有效的信息写回 OpenClaw 已经在使用的人类可读 Markdown 文件，并定期整理这些文件，避免长期使用后越记越乱。

## 当前支持范围

Reflection 当前支持：

- 单一 agent
- 同一个 agent 下的多 sessions

目前还不支持多 agent 之间的记忆协调，也不支持在一个 OpenClaw 多 agent 环境里做按 agent 分流的长期记忆管理。

## 它建立在 OpenClaw 原生 Memory 之上

OpenClaw 的 memory 本来就是 workspace-native 的：事实源头是 agent workspace 中的 Markdown 文件，而不是隐藏数据库。官方模型里，日常记录通常在 `memory/YYYY-MM-DD.md`，而 `MEMORY.md` 是长期整理层。

Reflection 的定位不是替换，而是增强：

- 不引入新的私有 memory store
- 不要求替换 OpenClaw 默认的 `memory-core`
- 不接管 `plugins.slots.memory`
- 直接围绕现有 Markdown memory 文件做捕获、过滤、路由和整理

这意味着迁移成本低、概念负担低，也更容易人工检查和版本管理。

## 为什么要装它

聊天类记忆系统通常会在两个方向上失败：

- 记得太少，导致同样的上下文不断重复解释
- 记得太多，导致短期线程噪音污染长期记忆

Reflection 就是为了解决这个问题：

- 保留稳定的用户偏好和协作习惯
- 沉淀跨会话仍然有价值的长期上下文
- 将长期记忆拆分到 `MEMORY.md`、`USER.md`、`SOUL.md`、`IDENTITY.md`、`TOOLS.md`
- 拒绝一次性任务、短期线程聊天、错路由内容
- 周期性整理长期记忆，防止文件持续膨胀和失真

## 安装

### 推荐方式：安装打包后的插件

更详细的安装指引见 [INSTALL.md](./INSTALL.md)。这个文件现在按“给 OpenClaw 自己执行的安装技能”来写，包含安装前应该向操作者询问哪些配置。

手动直接安装：

```bash
openclaw plugins install @parkgogogo/openclaw-reflection
```

### 添加插件配置

把下面这段配置写到 OpenClaw profile 的 `plugins.entries.openclaw-reflection` 下：

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

### 重启 OpenClaw Gateway

Gateway 重启后，Reflection 就会开始监听 `message_received` 和 `before_message_write`，并把整理后的长期信息写入你配置的 `workspaceDir`。

## 你会得到什么

| 你想要的能力             | Reflection 提供的结果                          |
| ------------------------ | ---------------------------------------------- |
| 可检查、可编辑的记忆系统 | 直接落到 Markdown 文件，能打开、diff、版本管理 |
| 更稳定的跨会话连续性     | 长期事实会被路由到正确的文件                   |
| 更少的记忆污染           | 会过滤临时线程内容和错路由写入                 |
| 长期使用后仍然可维护     | 定期 consolidation，避免文件越来越乱           |

## 它如何工作

```mermaid
flowchart LR
  A["Incoming conversation"] --> B["Session buffer"]
  B --> C["memoryGate"]
  C -->|durable fact| D["Writer guardian"]
  C -->|thread noise| E["No write"]
  D --> F["MEMORY.md / USER.md / SOUL.md / IDENTITY.md / TOOLS.md"]
  F --> G["Scheduled consolidation"]
```

流程很直接：

1. Reflection 从 OpenClaw hook 中捕获会话上下文。
2. `memoryGate` 判断候选事实是否足够长期、足够稳定。
3. file-specific `writer guardian` 决定是否写入目标文件，并在需要时重写目标文件内容。
4. `consolidation` 定期整理长期文件，控制冗余和过时信息。

## 评测覆盖

当前默认离线 benchmark 包含：

- `memoryGate`：`18` 个 benchmark case
- `writer guardian`：`14` 个 benchmark case

仓库中最近一次归档结果快照是：

- [`memoryGate`: 16/16 passed on V2](./evals/results/2026-03-08-memory-gate-v2-16-of-16.md)
- [`writer guardian`: 16/16 passed on V2](./evals/results/2026-03-08-writer-guardian-v2-16-of-16.md)

这些评测重点覆盖：

- 拒绝当前线程噪音
- 防止用户事实写错文件
- 保持 `SOUL` 连续性规则
- 正确替换过时的 `IDENTITY` 元数据
- 让 `TOOLS.md` 只保存本地工具映射，而不是把它误当工具注册表

## 长期记忆文件

| 文件          | 作用                                           |
| ------------- | ---------------------------------------------- |
| `MEMORY.md`   | 持久共享上下文、关键结论、长期背景事实         |
| `USER.md`     | 稳定的用户偏好、协作风格、长期有帮助的个人背景 |
| `SOUL.md`     | 助手原则、边界、连续性规则                     |
| `IDENTITY.md` | 显式身份元数据，例如名字、气质、形象描述       |
| `TOOLS.md`    | 环境特定的工具别名、端点、设备名、本地工具映射 |

## 开发和评测命令

实际插件使用时，推荐模型：

- `x-ai/grok-4.1-fast`

当前这个仓库里的开发评测配置使用的是：

- eval model: `x-ai/grok-4.1-fast`
- judge model: `openai/gpt-5.4`

```bash
pnpm run typecheck
pnpm run eval:memory-gate
pnpm run eval:writer-guardian
pnpm run eval:all
```

更多评测说明见 [evals/README.md](./evals/README.md)。

## 链接

- OpenClaw plugin docs: [docs.openclaw.ai/tools/plugin](https://docs.openclaw.ai/tools/plugin)
