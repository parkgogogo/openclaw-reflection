<h1 align="center">OpenClaw Reflection</h1>

<p align="center">
  <img src="./assets/openclaw-reflection-logo.png" alt="OpenClaw Reflection logo" width="180" />
</p>

<p align="center"><strong>让你的 Agent 长期记忆更聪明 —— 自动过滤噪音，精准沉淀价值。</strong></p>

<p align="center">
  <img alt="OpenClaw Plugin" src="https://img.shields.io/badge/OpenClaw-Plugin-111111?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square" />
  <img alt="memory_gate 18 cases" src="https://img.shields.io/badge/memory_gate-18%20benchmark%20cases-2ea043?style=flat-square" />
  <img alt="write_guardian 14 cases" src="https://img.shields.io/badge/write_guardian-14%20benchmark%20cases-2ea043?style=flat-square" />
</p>

<p align="center"><a href="./README.md">English</a></p>

**OpenClaw Reflection 是一个插件，让你的 Agent 长期记忆更智能。** 它会分析对话内容，过滤临时噪音，把真正重要的信息写入正确的记忆文件。Agent 记住该记的，忘掉该忘的。

**使用 Reflection，你将获得：**
- 更干净的 `MEMORY.md`、`USER.md`、`SOUL.md` —— 不再被闲聊内容污染
- 自动路由 —— 每个事实自动归类到正确的文件，无需手动整理
- 跨会话连续性 —— Agent 真的能在多轮对话后记住关键信息
- 完全可审计 —— 纯 Markdown 文件，可随时查看、编辑、版本管理

---

## 快速开始

5 分钟跑起来：

**1. 安装插件**
```bash
openclaw plugins install @parkgogogo/openclaw-reflection
```

**2. 添加配置** 到 `openclaw.json` 的 `plugins.entries.openclaw-reflection`：
```jsonc
{
  "enabled": true,
  "config": {
    "workspaceDir": "/你的/agent/workspace/绝对路径",
    "llm": {
      "baseURL": "https://openrouter.ai/api/v1",
      "apiKey": "你的API_KEY",
      "model": "x-ai/grok-4.1-fast"
    }
  }
}
```

**3. 重启 OpenClaw Gateway**

**4. 开始对话** 提一个偏好或重要事实。

**5. 查看记忆文件** —— `MEMORY.md`、`USER.md`、`TOOLS.md`、`IDENTITY.md`、`SOUL.md`。

- Reflection 现在会给 write_guardian 单独写一份审计日志：
  - `<workspaceDir>/.openclaw-reflection/write-guardian.log.jsonl`
- 当 `logLevel` 为 `debug` 时，Reflection 还会把最近一次 `message_received` callback 的原始 payload 覆盖写入 `logs/debug.json`。
- Reflection 还会在常规插件日志里周期性写入 `Heartbeat` 事件。如果 heartbeat 持续推进，但 `lastMessageReceivedAt` 一直没更新，说明插件还活着，只是没有收到新的入站消息。
- 当 `write_guardian` 成功写入长期记忆时，Reflection 会给触发这次写入的用户消息补一个 `📝` reaction。
- 注册命令：`reflections`
  - 返回最近 10 条 write_guardian 行为（written/refused/failed/skipped），包含 decision、目标文件和原因。

详细安装指引见 [INSTALL.md](./INSTALL.md)。

---

## 工作原理

Reflection 增强 OpenClaw 现有的 Markdown 记忆系统。它不替换任何东西，只优化写入流程。

**数据流：**
1. Reflection 监听 OpenClaw 的对话钩子
2. `memory_gate` 分析近期消息，判断：*这事值得记吗？* *该写到哪个文件？*
3. `write_guardian` 检查文件职责，决定：*接受、拒绝还是合并？*
4. 筛选后的纯净事实写入你的 workspace 记忆文件
5. 可选的定期整理保持长期文件精简

**Reflection 的特点：**
- 无独立数据库 —— 使用你已有的 Markdown 文件
- 无需替换核心 —— 与 OpenClaw 默认 `memory-core` 共存
- 无黑盒操作 —— 每个写入都可见可审计
- 低风险迁移 —— 卸载后记忆文件完全保留

---

## 为什么要用 Reflection？

OpenClaw 的长期记忆文件（`USER.md`、`TOOLS.md`、`IDENTITY.md`、`SOUL.md`）手动维护很困难。Reflection 解决以下问题：

- **保留稳定偏好** —— 你的习惯和风格会被持久保存
- **沉淀共享上下文** —— 重要背景跨会话保持一致
- **精准路由** —— 每个事实自动归类到正确的家
- **拒绝噪音** —— 一次性任务和线程闲聊不会污染记忆
- **长期可维护** —— 可选的定期整理防止文件膨胀

---

## 记忆文件说明

Reflection 写入五个标准的 OpenClaw 记忆文件：

**`MEMORY.md`**
持久共享上下文、关键结论、长期背景事实。

**`USER.md`**
稳定的用户偏好、协作风格、有用的个人背景。

**`SOUL.md`**
助手原则、行为边界、连续性规则。

**`IDENTITY.md`**
显式身份元数据，如名字、气质、形象描述等。

**`TOOLS.md`**
环境特定的工具别名、端点、设备名、本地工具映射。

---

## 核心机制

Reflection 使用两个专用组件做记忆决策：

**`memory_gate`** —— 过滤层
- 分析近期对话上下文
- 判断事实是否值得长期保存
- 决定该写入哪个目标文件
- 分离"该不该记"和"记到哪里"两个决策

**`write_guardian`** —— 写入门禁
- 在写入前检查文件职责
- 可接受、拒绝或合并内容
- 防止误路由或冲突写入
- 维护文件完整性和边界

这种拆分是刻意设计的。提取策略和文件级策略是不同的关注点，需要分开处理。

---

## 安装与配置

### 安装插件

```bash
openclaw plugins install @parkgogogo/openclaw-reflection
```

### 完整配置

添加到 `plugins.entries.openclaw-reflection`：

```jsonc
{
  "enabled": true,
  "config": {
    "workspaceDir": "/你的/workspace/绝对路径",
    "bufferSize": 50,
    "logLevel": "info",
    "llm": {
      "baseURL": "https://openrouter.ai/api/v1",
      "apiKey": "你的API_KEY",
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

**配置项说明：**

- `workspaceDir` —— 记忆文件存放目录（必填）
- `bufferSize` —— 保留多少近期消息用于分析（默认：50）
- `logLevel` —— 运行日志级别：`debug`、`info`、`warn`、`error`（默认：`info`）
- `llm.baseURL` —— OpenAI 兼容接口地址
- `llm.apiKey` —— 你的 API 密钥
- `llm.model` —— 分析用模型（推荐：`x-ai/grok-4.1-fast`）
- `memoryGate.enabled` —— 是否开启记忆过滤（默认：`true`）
- `memoryGate.windowSize` —— 每次分析的消息窗口（默认：10）
- `consolidation.enabled` —— 是否开启定期整理（默认：`false`）
- `consolidation.schedule` —— 整理任务的 cron 表达式（默认：每天凌晨2点）

### 重启激活

Gateway 重启后，Reflection 开始监听 `message_received` 和 `before_message_write` 钩子。

---

## 可观测性

查看 Reflection 的运行状态：

**审计日志**
`write_guardian` 的决策记录写入 `<workspaceDir>/.openclaw-reflection/write-guardian.log.jsonl`

**调试模式**
当 `logLevel` 设为 `debug` 时，原始 `message_received` 内容写入 `logs/debug.json`

**视觉反馈**
成功写入记忆后，触发消息会显示 `📝` 反应

**命令查询**
`reflections` 命令返回最近 10 条 `write_guardian` 决策，包括目标文件和原因

---

## 当前支持范围

Reflection 当前支持：
- 单一 agent
- 同一 agent 下的多 sessions

**暂不支持：**
- 多 agent 之间的记忆协调
- 多 agent 环境下的按 agent 分流管理

---

## 评测覆盖

基准测试覆盖：
- `memory_gate`：18 个测试用例
- `write_guardian`：14 个测试用例

近期结果：
- [`memory_gate`: 16/16 passed on V2](./evals/results/2026-03-08-memory-gate-v2-16-of-16.md)
- [`write_guardian`: 16/16 passed on V2](./evals/results/2026-03-08-write-guardian-v2-16-of-16.md)

这些评测针对记忆系统的典型失效模式：
- 拒绝当前线程噪音
- 防止用户事实写入错误文件
- 保持 `SOUL` 连续性规则
- 正确替换过时的 `IDENTITY` 元数据
- 保持 `TOOLS.md` 的工具映射功能

---

## 开发与评测

**推荐运行时模型：** `x-ai/grok-4.1-fast`

**开发评测配置：**
- 评测模型：`x-ai/grok-4.1-fast`
- 评判模型：`openai/gpt-5.4`

```bash
pnpm run typecheck
pnpm run e2e:openclaw-plugin
pnpm run e2e:openclaw-plugin:latest
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

`evals/models.json` 定义对比矩阵，provider 配置来自 `EVAL_BASE_URL` 和 `EVAL_API_KEY`。JSON 用于自动化，Markdown 供人工阅读。

现在 OpenClaw 插件 e2e 默认走一次性临时沙箱：

- `pnpm run e2e:openclaw-plugin` 运行 pinned 的本地回归轨
- `pnpm run e2e:openclaw-plugin:latest` 会优先用 Bun 把最新 OpenClaw CLI 安装到临时目录，必要时回退到 npm，再跑同样的检查
- 两条轨都会把 `HOME`、profile 状态、workspace、日志和 npm cache 全部隔离到临时目录
- 如果你要保留现场排查，设置 `KEEP_E2E_ARTIFACTS=1`

这条 e2e 会端到端验证三件事：

- 插件 tarball 能在全新的 OpenClaw profile 中安装并被加载
- 一次受控 chat turn 会留下 inbound capture 和 assistant-side processing 的 hook 证据
- 插件日志以及 `debug.json` 会在沙箱里正常写出

更多评测说明见 [evals/README.md](./evals/README.md)。

## 模型选择

评测日期：2026-03-09  
范围：`memory_gate` 18 个 case，OpenRouter 兼容路由

**推荐模型：**

**`x-ai/grok-4.1-fast`** —— 17/18 (94.4%)  
整体稳定性最佳，无内部错误。推荐作为默认选择。

**`qwen/qwen3.5-flash-02-23`** —— 17/18 (94.4%)  
优秀备选。一次 schema 失败，准确率接近 grok。

**`google/gemini-2.5-flash-lite`** —— 16/18 (88.9%)  
快速廉价，适合 prompt 迭代。边界准确率略低。

**不建议作为默认：**
- `inception/mercury-2` —— 61.1%，经常误判边界
- `minimax/minimax-m2.5` —— 50.0%，SOUL/IDENTITY/NO_WRITE 分类困难
- `openai/gpt-4o-mini` —— 22.2%，当前路由下 provider 错误频发

完整结果：[2026-03-09-memory-gate-openrouter-model-benchmark.md](./evals/results/2026-03-09-memory-gate-openrouter-model-benchmark.md)

---

## 链接

- OpenClaw 插件文档：[docs.openclaw.ai/tools/plugin](https://docs.openclaw.ai/tools/plugin)
