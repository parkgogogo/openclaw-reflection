# LLMService Unification Design

> 日期: 2026-03-07
> 状态: approved

## Goal

把当前分散在 `MemoryGate`、`Writer Guardian`、`Consolidation` 里的 LLM 调用方式收束到统一的 `LLMService`。

目标不是单纯改名，而是把两类能力明确分开：

- 结构化对象生成
- 带工具的简陋 agent 执行

这样上层模块不再自己解析 JSON，不再各自维护 prompt 协议细节，也不再混用“completion”和“agent”语义。

## Problem

当前实现存在三个具体问题：

1. `MemoryGate` 使用文本 completion，再做本地 JSON 解析、code fence 兼容、字段归一化。
2. `Writer Guardian` 名义上是 guardian，实际上仍然是 completion 风格返回文本对象，不是 tool-based agent。
3. `Consolidation` 也在重复走“文本 completion + 本地 JSON parse”的路线。

这会导致：

- LLM 能力边界模糊
- 失败处理分散
- 评测接口不统一
- 后续接 structured outputs / tools 时会继续返工

## Final Architecture

### Unified Layer

新增 `src/llm/`，由 `LLMService` 统一承载所有 LLM 调用。

它只暴露两个原语：

1. `generateObject`
2. `runAgent`

### generateObject

用于：

- `MemoryGate`
- `Consolidation`

职责：

- 接收 `systemPrompt`
- 接收 `userPrompt`
- 接收 schema
- 返回已经校验过的对象

业务层不再自己做：

- code fence 提取
- 首个 JSON 截取
- 文本到对象的手工归一化

如果底层 runtime 暂时不支持原生 structured output，那么兼容逻辑只能放在 `LLMService` 内。

### runAgent

用于：

- `Writer Guardian`

职责：

- 接收 `systemPrompt`
- 接收任务 prompt
- 接收工具集合
- 执行有限步数的 tool loop
- 返回执行结果和工具调用日志

首批只支持两个工具：

- `read`
- `write`

### Writer Guardian

`Writer Guardian` 从“返回 `next_content` 的 completion 调用”升级为真正的简陋 agent。

它的边界：

- 只能读取当前目标文件
- 只能写当前目标文件
- 不得跨文件读写
- 不得改变 route
- 如果没有调用 `write`，就视为拒写
- 拒写只记日志

## Interfaces

### LLMService

建议接口：

```ts
export interface GenerateObjectParams<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: JsonSchema;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute(input: unknown): Promise<string>;
}

export interface RunAgentParams {
  systemPrompt: string;
  userPrompt: string;
  tools: AgentTool[];
  maxSteps: number;
}

export interface AgentRunResult {
  steps: AgentStep[];
  didWrite: boolean;
}

export interface LLMService {
  generateObject<T>(params: GenerateObjectParams<T>): Promise<T>;
  runAgent(params: RunAgentParams): Promise<AgentRunResult>;
}
```

### Provider Boundary

插件 runtime 仍由 `src/index.ts` 注入。

但 `index.ts` 不再直接产出 “文本 completion client”，而是产出 `LLMService`。

底层 provider 负责两件事：

- 对接 `runtime.complete`
- 在 runtime 能力不足时做统一兼容

兼容只能存在于 `src/llm/`。

## Module Changes

### MemoryGate

`MemoryGateAnalyzer` 改为：

- 构建 prompt
- 调用 `llmService.generateObject`
- 只做极薄的业务校验

不再保留复杂文本 parse 流程。

### FileCurator / Writer Guardian

`FileCurator` 改为：

- 基于 `llmService.runAgent`
- 提供 `read` / `write` 两个工具
- `read` 返回当前目标文件内容
- `write` 仅允许覆盖当前目标文件
- 如果 agent 未调用 `write`，则记 guardian refusal 日志

### Consolidation

`Consolidator` 改为：

- 构建 cleanup prompt
- 调用 `llmService.generateObject`
- 应用 cleanup 结果

不再各自维护解析逻辑。

## Tool Semantics

### read

- 输入：无，或仅允许 `target: "current_file"`
- 输出：当前目标文件原始内容
- 不能读取其他文件

### write

- 输入：`content`
- 效果：覆盖当前目标文件
- 不能写其他文件

这两个工具的能力必须显式受限，不能暴露真实文件系统自由度。

## Error Handling

### generateObject

失败时应区分：

- runtime 调用失败
- structured output 失败
- schema 校验失败

上层只收到统一异常或统一失败结果。

### runAgent

失败时应区分：

- 工具调用失败
- 超出最大步数
- 最终未调用 `write`

对于 `Writer Guardian` 而言：

- 工具失败 -> 记录 error 日志
- 未写入 -> 记录 refusal/info 日志

## Testing Strategy

### LLMService

新增底层单测覆盖：

- `generateObject` 成功返回对象
- schema 不匹配时失败
- `runAgent` 能正确执行 `read -> write`
- `runAgent` 不调用 `write` 时返回 `didWrite=false`

### MemoryGate

验证：

- 使用 `generateObject`
- 不再依赖复杂文本 parse 辅助逻辑

### Writer Guardian

验证：

- 只能读当前文件
- 只能写当前文件
- 写入成功时发生整文件覆盖
- 不写时只记日志

### Consolidation

验证：

- 使用 `generateObject`
- cleanup 输出仍能正确应用

## Non-Goals

- 这次不扩展多工具生态
- 不把 `MemoryGate` 和 `Consolidation` 强行 agent 化
- 不在本轮实现跨文件推理
- 不引入新的中间记忆层

## Why This Design

这是最小且清晰的收口方式：

- `MemoryGate` 和 `Consolidation` 本质上是结构化判断任务
- `Writer Guardian` 本质上是受限 tool agent
- 两类任务共享一个统一 LLM 层，但不强行同构

这样后面做评测时，可以直接围绕两个能力做：

- object generation evaluation
- writer agent evaluation
