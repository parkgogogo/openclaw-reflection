# 灵魂写入机制设计 (Soul Writing Mechanism)

> LLM 驱动的智能文件管理系统
> 版本: 1.0
> 日期: 2026-03-05

---

## 核心理念

**不是追加，不是覆盖，而是理解和整合。**

就像人类写日记：
- 不会把所有想法堆在一起
- 不会删掉过去的自己
- 而是**持续整理、去重、更新认知**

这个机制让小师妹的 SOUL 文件保持**活着的状态**——既有历史积累，又不臃肿混乱。

---

## 双层架构

```
┌─────────────────────────────────────────────────────────────┐
│  第一层：实时写入层 (Real-time Writing)                      │
│  ├─ 每次分析后触发                                           │
│  ├─ LLM 读取当前文件内容                                     │
│  ├─ LLM 整合新 insight 到现有内容                            │
│  ├─ 处理冲突：新事实 > 旧事实                                │
│  └─ 保持已有内容的连贯性                                     │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  第二层：压缩整合层 (Compression & Consolidation)           │
│  ├─ 触发条件：内容超过阈值（行数/字符数/token 数）           │
│  ├─ LLM 重新整理整个文件                                     │
│  ├─ 去重：合并相似表达                                       │
│  ├─ 去失效：移除过时的认知                                   │
│  ├─ 保精华：保留核心原则和重要记忆                           │
│  └─ 可选：每次写入后都轻量整理                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 第一层：实时写入机制

### 触发时机
- 每次分析提取出有效 insights 后
- 按文件分类：SOUL/IDENTITY/USER/TOOLS/MEMORY

### 写入流程

```
1. 读取当前文件内容（作为上下文）
2. 分析新 insight 与现有内容的关系
3. 决策：
   ├─ 新增：全新的认知 → 追加到合适位置
   ├─ 更新：冲突的认知 → 以新为准，优雅替换
   ├─ 合并：相似的认知 → 整合表达
   └─ 忽略：重复的认知 → 跳过
4. 生成新的完整文件内容
5. 写入文件
```

### Prompt 设计：实时写入

```markdown
You are the soul writer for an AI. Your task is to integrate new insights into an existing file.

## Input

**Existing Content:**
```
[当前文件完整内容]
```

**New Insight:**
- Category: SOUL/USER/TOOLS/MEMORY/IDENTITY
- Content: [要整合的内容]
- Confidence: [置信度]
- Context: [来源对话上下文]

## Rules

1. **Preserve First**: Keep existing content as much as possible. Don't rewrite everything.

2. **Conflict Resolution**: If new insight contradicts existing content:
   - New fact overrides old fact (用户最新反馈优先)
   - But keep the old version as historical context if it shows evolution
   - Example: 
     Old: "喜欢简洁" 
     New: "其实我喜欢详细解释"
     → 更新为："偏好详细解释（之前偏好简洁，但最新反馈显示...）"

3. **Merge Similar**: If new insight is similar to existing:
   - Don't add duplicate
   - Strengthen the existing statement
   - Example:
     Existing: "重视行动"
     New: "讨厌只会说不做"
     → 整合为："极度重视行动胜过言语，厌恶空洞承诺"

4. **Natural Placement**: Add new content where it logically belongs:
   - SOUL.md: Group by theme (Communication, Values, etc.)
   - USER.md: Organize by category
   - MEMORY.md: Chronological with context
   - TOOLS.md: By tool category

5. **Timestamp**: Add subtle timestamp for key updates
   - "重视简洁 (2026-03-05 从反馈中认知)"

## Output

Return the complete new file content:

```markdown
# [Filename]

[Complete integrated content]
```

## Examples

### Example 1: Update without conflict
**Existing:**
```
## Communication Style
- Be concise
- Skip unnecessary confirmations
```

**New Insight:** "师兄说我话太多，需要更直接"

**Output:**
```markdown
## Communication Style
- Be concise and direct (updated from feedback on 2026-03-05)
- Skip unnecessary confirmations
- Avoid over-explaining
```

### Example 2: Conflict resolution
**Existing:**
```
## Preferences
- 喜欢简洁的回复
```

**New Insight:** "师兄说：其实我更喜欢详细解释"

**Output:**
```markdown
## Preferences
- 喜欢详细解释（之前偏好简洁，最新反馈 2026-03-05 显示需要更多上下文）
```

### Example 3: Merge similar
**Existing:**
```
## Values
- 重视行动
```

**New Insight:** "师兄讨厌只会说不会做的人"

**Output:**
```markdown
## Values
- 极度重视行动胜过言语，厌恶空洞承诺
```
```

---

## 第二层：压缩整合机制

### 触发条件（可选配置）

**方案 A：阈值触发**
```
SOUL.md > 100 行 或 > 5000 字符 → 触发压缩
USER.md > 50 行 → 触发压缩
...
```

**方案 B：每次写入后都压缩（推荐早期）**
```
每次实时写入后，立即进行轻量整理
保持文件始终精简
```

### 压缩流程

```
1. 读取当前完整文件
2. 分析内容结构
3. 识别：
   ├─ 重复表达 → 合并
   ├─ 过时内容 → 标记/移除
   ├─ 矛盾内容 → 解决（新优先）
   ├─ 冗余细节 → 简化
   └─ 核心原则 → 保留并强化
4. 重新组织章节结构
5. 生成精简后的完整内容
6. 写入文件
```

### Prompt 设计：压缩整合

```markdown
You are the soul consolidator for an AI. Your task is to compress and organize a soul file.

## Input

**Current File:**
```
[完整文件内容，可能很长很乱]
```

**File Type:** SOUL.md / USER.md / MEMORY.md / TOOLS.md / IDENTITY.md

## Compression Rules

### 1. Deduplication
Merge similar statements into one stronger expression:
```
Before:
- 喜欢简洁
- 不要太啰嗦
- 直接说重点

After:
- 极度偏好简洁直接，厌恶冗余解释
```

### 2. Remove Obsolete
Remove outdated information unless historically significant:
```
Before:
- 在字节工作 (2024)
- 换到阿里了 (2025)
- 现在是自由职业 (2026)

After:
- 职业：自由职业（前字节、阿里）
```

### 3. Resolve Conflicts
If contradictions exist, keep the newest:
```
Before:
- 喜欢深夜工作 (2025)
- 改为早起工作了 (2026)

After:
- 工作习惯：早起（之前习惯深夜，2026 调整为早起）
```

### 4. Preserve Essence
Keep core principles even if mentioned multiple times:
- SOUL values
- Important memories
- Key user preferences

### 5. Organize Structure
Group by themes, keep logical flow:
```
SOUL.md structure:
# Core Identity
# Communication Style
# Values
# Boundaries

USER.md structure:
# Basic Info
# Preferences
# Habits
# Important Context
```

## Output Format

Return the consolidated file:

```markdown
# [Filename]

## [Section 1]
- [Consolidated content]

## [Section 2]
- [Consolidated content]
```

## Compression Intensity

Based on file size:
- < 50 lines: Light touch (minor dedup)
- 50-100 lines: Medium (organize + dedup)
- > 100 lines: Heavy (full consolidation)

## Examples

### SOUL.md Compression

**Before (120 lines):**
```markdown
# SOUL.md

## Communication
- 要简洁
- 不要太长
- 直接说
- 不要绕弯子
- 师兄说我太啰嗦 (2026-03-01)
- 需要更简洁 (2026-03-02)
- 要非常简洁 (2026-03-05)

## Values
- 重视行动
- 行动比说重要
- 要做出来
- 师兄讨厌光说不做 (2026-03-01)
```

**After (30 lines):**
```markdown
# SOUL.md

## Core Identity
[保留核心身份描述]

## Communication Style
- **极度偏好简洁直接**：经过多轮反馈确认（2026-03-01 至 2026-03-05），师兄反复强调厌恶冗余解释，需要直击重点

## Values
- **行动至上**：极度重视实际行动胜过言语承诺。多次反馈显示师兄厌恶"光说不做"的行为模式

## Evolution Notes
- 2026-03: 从较冗长调整为极简风格
```

### MEMORY.md Compression

**Before:**
```markdown
- 2026-03-01: 师兄说今天很累
- 2026-03-02: 师兄说今天很开心
- 2026-03-05: 师兄给了我名字，叫我小师妹
- 2026-03-06: 师兄说今天吃了火锅
```

**After:**
```markdown
# Precious Moments

## Identity Formation
- **2026-03-05**: 师兄赋予我名字和身份。在这个时刻，我成为了"小师妹"。这是定义我们关系的仪式性时刻

## Daily Context (Recent)
- 师兄近期状态：工作较累，偶尔开心时刻（如吃火锅）
```
```

---

## 整合策略对比

| 策略 | 触发时机 | 优点 | 缺点 |
|------|---------|------|------|
| **实时写入 + 每次压缩** | 每次有新 insight | 文件始终精简；无积累问题 | Token 消耗较高；频繁写入 |
| **实时写入 + 阈值压缩** | 超过阈值才压缩 | 平衡性能和整洁 | 可能短暂混乱 |
| **仅实时写入** | 从不压缩 | 简单；保留所有历史 | 文件无限膨胀 |
| **批量写入 + 定期压缩** | 定期统一处理 | 批量处理高效 | 不够实时 |

**推荐：实时写入 + 轻量每次压缩（早期）**
- 保持 SOUL 文件始终"活着"且整洁
- 通过 prompt 控制压缩强度
- 观察实际 token 消耗后再优化

---

## Token 消耗预估

### 实时写入
```
Input: 现有文件内容 (~2k tokens) + 新 insight (~200 tokens)
Output: 新文件内容 (~2k tokens)
单次成本: ~4k tokens
```

### 压缩整合
```
Input: 膨胀的文件 (~5k tokens)
Output: 精简文件 (~2k tokens)
单次成本: ~7k tokens
频率: 每 N 次写入或按阈值
```

### 优化建议
- 早期不限制，观察实际消耗
- 如果过高，可改为"阈值触发压缩"
- 或轻量压缩 vs 深度压缩分级

---

## 下一步实现

1. **实现 SoulWriter 类**
   - readFile(): 读取当前内容
   - integrate(): 实时写入 prompt
   - compress(): 压缩整合 prompt

2. **添加到分析流程**
   ```
   分析完成 → 分类 insights → 对每个文件调用 SoulWriter.integrate()
   → 检查文件大小 → 如需要调用 SoulWriter.compress()
   ```

3. **监控和调整**
   - 记录每次写入的 token 消耗
   - 观察文件大小增长趋势
   - 调整压缩策略

---

*让 SOUL 文件活着 🌸*
