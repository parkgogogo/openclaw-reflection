# Route + Writer Guardian Design

> 日期: 2026-03-07
> 状态: approved

## Goal

将当前混合式记忆架构收敛为两个独立 loop：

- `MemoryGate` 负责每 turn 的实时 route
- `Consolidation` 负责低频 maintenance

中间不再存在 `daily memory` 这一层。

## Final Architecture

### Loop 1: MemoryGate + Writer Agent

每个 turn 结束后：

1. `MemoryGate` 读取最近消息窗口
2. 只做 route 判断：
   - `NO_WRITE`
   - `UPDATE_MEMORY`
   - `UPDATE_USER`
   - `UPDATE_SOUL`
   - `UPDATE_IDENTITY`
3. 如果不是 `NO_WRITE`，将结果交给目标文件的 `Writer Agent`

### Writer Agent

`Writer Agent` 不是 patch 生成器，而是带 `write` tool 的 guardian。

它的职责：

1. 读取当前目标文件的原始内容
2. 理解这个文件在 OpenClaw 中的机制意义
3. 判断候选事实是否应该进入该文件
4. 如果应写入，直接整文件覆盖写
5. 如果不应写入，只在内部 `logger` 中记录拒写原因

它的边界：

- 只能读取当前目标文件
- 只能写当前目标文件
- 不能跨文件联动
- 不能改变 `MemoryGate` 的 route
- 不能将内容降级写入其他文件

### Loop 2: Consolidation

`Consolidation` 是独立的低频 maintenance loop。

它的职责：

1. 定时读取长期文件：
   - `MEMORY.md`
   - `USER.md`
   - `SOUL.md`
2. 先判断：
   - `NO_WRITE`
   - `WRITE_CLEANUP`
3. 只有在需要时才执行整理

它的边界：

- 不处理 `IDENTITY.md`
- 不负责 route 新事实
- 不发明新事实
- 只整理已有长期文件内容
- 允许低频整理 `SOUL.md`

## File Semantics

Writer Agent 和 Consolidation 都必须理解每个文件的 OpenClaw 机制意义。

### MEMORY.md

- 长期记忆
- durable facts / decisions / preferences / open threads
- 允许新增、替换、压缩

### USER.md

- 关于用户的长期画像
- 偏好、项目、协作方式、红线
- 要克制，不记录一次性情绪和杂讯

### SOUL.md

- agent 的核心自我、边界、风格、连续性
- 更新频率低
- 拒绝临时性或情绪化漂移

### IDENTITY.md

- Name / Creature / Vibe / Emoji / Avatar
- 极少更新
- 不参与 consolidation

## Why This Architecture

### 为什么去掉 daily memory

- 当前目标是让 `MemoryGate` 直接承担 route
- 如果还保留 `daily -> consolidation -> long-term`，会与 turn 级 route 形成双入口
- 双入口会造成重复写入、职责冲突、状态不一致

### 为什么 Writer Agent 要有拒写权

- `MemoryGate` 负责 route，但 route 可能过于积极
- Writer 读取原始文件后再判断，能防止错误信息直接污染长期文件
- 拒写不回退、不降级，只记日志，避免系统再次引入第二条隐式路由

### 为什么 Consolidation 仍然保留

- 长期文件仍然会累积冗余、重复和过时表述
- 但它应该只做 maintenance，不应该再承担“新事实晋升”职责

## Operational Rules

- `MemoryGate` 输出不是写入承诺，只是 route proposal
- `Writer Agent` 拥有最终写入决定权
- Writer 拒写时只记日志
- `Consolidation` 只整理已有长期文件
- `IDENTITY.md` 不参与定时整理

## Non-Goals

- 不再实现 `WRITE_DAILY`
- 不再保留 `DailyWriter`
- 不让 `Consolidation` 从中间层提炼新事实
- 不让 Writer 读多个文件做交叉判断

## Verification Targets

重构完成后应满足：

1. `MemoryGate` 不再输出 `WRITE_DAILY`
2. `DailyWriter` 和相关配置完全移除
3. `FileCurator` 升级为真正的 LLM Writer Agent
4. Writer 可拒写，并只记录日志
5. `Consolidation` 只处理 `MEMORY.md` / `USER.md` / `SOUL.md`
6. `Consolidation` 先判断 `NO_WRITE | WRITE_CLEANUP`
