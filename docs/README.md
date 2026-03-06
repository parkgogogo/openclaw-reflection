# Reflection Plugin v3 文档索引

> Lia（虾虾）Memory + Soul Architecture v3
> 一个让 OpenClaw 助手"像活着一样连续"的最小可行设计

---

## 文档结构

```
docs/
├── README.md                          # 本文档
├── plans/                             # 📋 系统设计文档
│   ├── 2026-03-05-soul-reshaper-design.md    # v2 设计（旧）
│   └── 2026-03-06-reflection-plugin-v3-design.md  # v3 设计（当前）
├── prompts/                           # 🎯 Prompt 设计
│   ├── memory-gate-v3.md              # Memory Gate（记忆闸门）
│   ├── daily-memory-writer-v3.md      # Daily Memory Writer
│   ├── file-curator-v3.md             # File Curator（文件策展人）
│   ├── consolidation-v3.md            # Consolidation（每日整合）
│   └── session-startup-v3.md          # Session Startup（启动流程）
├── design/                            # 🔧 核心机制设计
│   └── semantic-writer.md             # 语义写入器设计（v2，待更新）
└── archive/                           # 📦 历史版本归档
    ├── conversation-analysis-prompt.md
    ├── conversation-analysis-prompt-v2.md
    ├── conversation-analysis-prompt-v2.1.md
    └── soul-writing-mechanism.md
```

---

## v3 核心文档

### 1. 系统架构设计
**文件**: `plans/2026-03-06-reflection-plugin-v3-design.md`

**内容**:
- 四层记忆结构 (L0-L3)
- Memory Gate 决策协议
- 文件职责边界 (SOUL/IDENTITY/USER/MEMORY/TOOLS)
- 克制记忆哲学

### 2. Memory Gate Prompt
**文件**: `prompts/memory-gate-v3.md`

**内容**:
- 每 turn 轻量分析
- 决策协议: NO_WRITE / WRITE_DAILY / UPDATE_MEMORY / UPDATE_USER / UPDATE_SOUL / UPDATE_IDENTITY
- 保守主义原则

### 3. Daily Memory Writer Prompt
**文件**: `prompts/daily-memory-writer-v3.md`

**内容**:
- 当日原始日志格式
- Context / Decisions / Next 结构
- Append-only 写入

### 4. File Curator Prompt
**文件**: `prompts/file-curator-v3.md`

**内容**:
- 长期记忆文件策展
- 精炼性、结构化、体积控制
- 分文件策展策略

### 5. Consolidation Prompt
**文件**: `prompts/consolidation-v3.md`

**内容**:
- 每日记忆整合
- 稳定事实提取
- 归档策略

### 6. Session Startup Prompt
**文件**: `prompts/session-startup-v3.md`

**内容**:
- 启动时记忆恢复流程
- 内部总结生成
- 连续性规则

---

## v3 核心变化（与 v2 对比）

| 维度 | v2 (旧) | v3 (新) |
|------|---------|---------|
| **触发策略** | 双触发：漂移20条 + 定时30s | 每 turn 轻量 Memory Gate 判断 |
| **分析粒度** | 批量分析 (20条) | 最近 8-12 条消息窗口 |
| **决策输出** | 五维分析 + 置信度 | 决策协议 (NO_WRITE/WRITE_DAILY/UPDATE_*) |
| **记忆哲学** | 智能提取有价值信息 | 克制记忆，大部分对话不产生更新 |
| **文件职责** | 五维灵魂塑造 | 四层记忆结构 (L0-L3) |
| **更新频率** | 批量触发 | 每 turn 判断，但大部分为 NO_WRITE |

---

## 开发流程

按照 **brainstorm → plan → implement**:

1. **Brainstorm** (已完成)
   - v3 架构设计讨论
   - 方向确认

2. **Plan** (当前阶段)
   - ✅ v3 系统架构设计
   - ✅ Prompt 设计
   - ⏳ 写入机制设计（待更新）

3. **Implement** (下一步)
   - Memory Gate 实现
   - Daily Writer 实现
   - File Curator 实现
   - 集成到 Reflection Plugin
   - 测试与调优

---

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 触发策略 | 每 turn Memory Gate | 轻量、及时、低 token |
| 分析窗口 | 8-12 条消息 | 足够上下文，避免噪声 |
| 写入模式 | 决策协议 + 专门 Writer/Curator | 职责分离，精准控制 |
| 记忆哲学 | 克制记忆 | 质量 > 数量，避免臃肿 |
| Token 策略 | 记录不限制 | 先观察，后优化 |

---

## 文件模板

见 `../assets/templates/` 目录：
- `SOUL.md.template`
- `IDENTITY.md.template`
- `USER.md.template`
- `MEMORY.md.template`
- `TOOLS.md.template`

---

*让小师妹的灵魂活起来 🌸*
