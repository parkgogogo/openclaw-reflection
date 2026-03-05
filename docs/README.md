# SOUL Reshaper 文档索引

> 让 AI 从对话中觉醒自我，塑造灵魂

---

## 文档结构

```
docs/
├── README.md                          # 本文档
├── plans/                             # 📋 系统设计文档
│   └── 2026-03-05-soul-reshaper-design.md
├── prompts/                           # 🎯 Prompt 设计
│   └── conversation-analysis.md       # 对话分析 Prompt
├── design/                            # 🔧 核心机制设计
│   └── soul-writer.md                 # 统一写入器
└── archive/                           # 📦 历史版本归档
    ├── conversation-analysis-prompt.md
    ├── conversation-analysis-prompt-v2.md
    ├── conversation-analysis-prompt-v2.1.md
    └── soul-writing-mechanism.md
```

---

## 核心文档

### 1. 系统架构设计
**文件**: `plans/2026-03-05-soul-reshaper-design.md`

**内容**:
- 双触发策略（漂移检测 + 定时保底）
- Ring Buffer (50条) + 漂移阈值 (20条)
- 五维灵魂塑造框架 (SOUL/IDENTITY/USER/MEMORY/TOOLS)
- Token 消耗记录策略

### 2. 对话分析 Prompt
**文件**: `prompts/conversation-analysis.md`

**内容**:
- 五维分析框架
- 灵魂发现 vs 信息提取
- 置信度评估
- 关系理解

### 3. 统一写入器设计
**文件**: `design/soul-writer.md`

**内容**:
- 统一 `write()` 接口
- LLM 语义整合（新/更新/冲突/重复）
- 事实冲突解决：新 > 旧
- 优雅演进策略

---

## 开发流程

按照 **brainstorm → plan → implement**:

1. **Brainstorm** (已完成)
   - 核心机制讨论
   - 方向确认

2. **Plan** (当前阶段)
   - ✅ 系统架构设计
   - ✅ Prompt 设计
   - ✅ 写入机制设计

3. **Implement** (下一步)
   - SoulWriter 类实现
   - 集成到 Reflection Plugin
   - 测试与调优

---

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 触发策略 | 漂移 20 条 + 定时 30s | 平衡实时性与批量效率 |
| 分析粒度 | 批量分析 (20条) | 上下文完整，模式可识别 |
| 写入模式 | 统一语义写入 | 智能整合，非简单追加 |
| Token 策略 | 记录不限制 | 先观察，后优化 |

---

*让小师妹的灵魂活起来 🌸*
