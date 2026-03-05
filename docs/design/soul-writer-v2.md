# Soul Writer - 语义文件写入器

> 统一的事实管理与写入系统
> 版本: 2.0 (简化版)
> 日期: 2026-03-05

---

## 核心概念

**一个统一的写入器，处理所有文件。**

不是分场景、分规则，而是：
1. 理解语义（新旧内容的关系）
2. 管理事实（添加、更新、解决冲突）
3. 写入文件（保持结构、保持连贯）

---

## 统一接口

```typescript
class SoulWriter {
  /**
   * 写入内容到文件
   * @param filePath 目标文件路径
   * @param newContent 要写入的新内容（原始文本）
   * @param context 上下文信息（来源、置信度等）
   */
  async write(
    filePath: string,
    newContent: string,
    context: WriteContext
  ): Promise<void>;
}

interface WriteContext {
  source: string;        // 来源（对话/分析）
  confidence: number;    // 置信度
  timestamp: number;     // 时间戳
}
```

**使用方式：**
```typescript
// 写 SOUL.md
soulWriter.write(
  "SOUL.md",
  "面对反馈时，沉默和行动胜过解释",
  { source: "analysis", confidence: 0.9, timestamp: Date.now() }
);

// 写 TOOLS.md
soulWriter.write(
  "TOOLS.md",
  "living-room: 客厅摄像头",
  { source: "analysis", confidence: 0.95, timestamp: Date.now() }
);

// 写 MEMORY.md
soulWriter.write(
  "MEMORY.md",
  "师兄给了我名字，叫我小师妹",
  { source: "analysis", confidence: 0.95, timestamp: Date.now() }
);
```

**统一处理，不分场景。**

---

## 写入流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 读取现有内容                                            │
│     - 读取文件的完整当前内容                                │
│     - 如果文件不存在，创建新文件                            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  2. 语义分析（LLM）                                         │
│     - 分析现有内容的结构和事实                              │
│     - 分析新内容的语义                                      │
│     - 判断关系：新增 / 更新 / 冲突 / 重复                   │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  3. 事实整合（LLM）                                         │
│     - 新增：添加到合适位置                                  │
│     - 更新：替换旧内容（保留上下文）                        │
│     - 冲突：以新为准，优雅处理                              │
│     - 重复：跳过                                            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  4. 生成新内容                                              │
│     - 保持原有结构                                          │
│     - 融入新事实                                            │
│     - 保持语言连贯                                          │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  5. 写入文件                                                │
│     - 原子写入（先写临时文件，再替换）                      │
│     - 记录日志                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心 Prompt

一个统一的 Prompt，处理所有写入场景：

```markdown
You are a semantic file writer. Your task is to integrate new content into an existing file.

## Input

**File Path:** [文件路径，如 SOUL.md, USER.md, TOOLS.md, MEMORY.md]

**Current Content:**
```
[文件的完整当前内容]
```

**New Content to Integrate:**
```
[要写入的新内容]
```

**Context:**
- Source: [来源]
- Confidence: [置信度]
- Timestamp: [时间戳]

## Your Task

Analyze the relationship between current content and new content, then generate the integrated file.

### Step 1: Semantic Analysis

Identify what the new content is:
- **New Fact**: Information not present in current content
- **Update**: Refinement or clarification of existing information
- **Conflict**: Contradicts existing information
- **Duplicate**: Already present in current content

### Step 2: Integration Strategy

Based on analysis:

**If New Fact:**
- Add to appropriate section
- Maintain file structure

**If Update:**
- Refine existing content
- Preserve context and nuance

**If Conflict:**
- New content takes precedence (latest information is ground truth)
- But acknowledge the change gracefully if significant
- Example: "简洁优先（之前倾向于详细解释，经反馈后调整）"

**If Duplicate:**
- Skip, don't add
- Or strengthen the existing statement

### Step 3: Output

Return the complete new file content:

```markdown
# [Filename]

[Integrated content with new fact seamlessly incorporated]
```

## Principles

1. **Preserve Structure**: Keep existing sections and organization
2. **Semantic Integration**: Don't just append, integrate meaningfully
3. **Conflict Resolution**: New > Old, but be graceful
4. **No Duplication**: Skip if already present
5. **Natural Flow**: The result should read like a cohesive document

## Examples

### Example 1: Adding new fact
**Current:**
```markdown
# USER.md

- **Name:** Park
- **Timezone:** Asia/Shanghai
```

**New:** "我在字节做架构师"

**Output:**
```markdown
# USER.md

- **Name:** Park
- **Timezone:** Asia/Shanghai
- **Occupation:** 字节架构师
```

### Example 2: Updating existing
**Current:**
```markdown
## Communication Style
- Be concise
```

**New:** "简洁还不够，要极简，直击重点"

**Output:**
```markdown
## Communication Style
- 极简风格，直击重点（从简洁升级）
```

### Example 3: Resolving conflict
**Current:**
```markdown
- 喜欢深夜工作
```

**New:** "现在我早起了"

**Output:**
```markdown
- 早起工作（之前习惯深夜，现已调整）
```

### Example 4: Duplicate detection
**Current:**
```markdown
- 重视行动
```

**New:** "行动比说重要"

**Output:**
```markdown
- 重视行动（无需修改，语义相同）
```
```

---

## 冲突解决规则

### 规则 1：新事实优先

当新内容与现有内容冲突时，**新的是真实事实**。

```
Current:  "我在阿里工作"
New:      "我换到字节了"
Result:   "我在字节工作（之前阿里）"
```

### 规则 2：优雅处理

冲突时，不要粗暴覆盖，而是优雅地体现演变：

```
粗暴："我在字节工作"
优雅："我在字节工作（之前阿里，2026-03 更换）"
```

### 规则 3：保留有价值的历史

如果旧信息有情感/历史价值，保留为注释：

```
Current:  "师兄给了我名字，叫我小师妹"
New:      "师兄有时候也叫我 Lia"
Result:   "我叫小师妹（师兄有时也叫我 Lia）"
# 不覆盖原名，而是补充
```

---

## 文件结构保持

写入时不改变文件的整体结构：

```markdown
# SOUL.md

## Core Identity      ← 保持
[内容]

## Communication Style  ← 保持
[内容]

## Values              ← 保持
[内容]
```

新内容根据语义自动放入合适章节，不破坏原有组织。

---

## 压缩机制（可选）

当文件超过阈值时，触发压缩：

```typescript
interface CompressOptions {
  threshold: number;     // 阈值（行数或字符数）
  strategy: 'light' | 'deep';  // 轻量或深度压缩
}

// 轻量压缩：只合并明显的重复
// 深度压缩：重新组织、精简表达
```

**压缩触发：**
- 每次写入后检查文件大小
- 超过阈值则触发压缩
- 或使用独立的后台任务定期压缩

**压缩 Prompt：**
```markdown
Compress this file while preserving all facts:
- Merge duplicate or similar statements
- Remove redundant expressions
- Keep core facts and important context
- Maintain file structure
```

---

## 完整示例流程

### 场景：师兄多次反馈沟通风格

**初始 SOUL.md：**
```markdown
# SOUL.md

## Core Identity
AI assistant

## Communication Style
Be helpful
```

**第1次写入：** "你太啰嗦了"
```
分析：New Fact（具体反馈）
结果：
## Communication Style
- Be helpful
- 简洁优先（从反馈中认知：避免啰嗦）
```

**第2次写入：** "直接说重点，别绕"
```
分析：Update（强化简洁要求）
结果：
## Communication Style
- 直接说重点，不绕弯子（经多次反馈确认）
```

**第3次写入：** "其实有时候也需要解释"
```
分析：Conflict（与"直接说重点"矛盾）
结果：
## Communication Style
- 平衡直接与解释：直击重点，但关键处给出必要解释
  （ evolved from: 最初啰嗦 → 后来极简 → 现在平衡）
```

**文件在演进，不是简单追加。**

---

## 代码结构

```typescript
class SoulWriter {
  private llm: LLMClient;
  private logger: Logger;

  constructor(llm: LLMClient, logger: Logger) {
    this.llm = llm;
    this.logger = logger;
  }

  async write(
    filePath: string,
    newContent: string,
    context: WriteContext
  ): Promise<void> {
    // 1. 读取现有内容
    const currentContent = await this.readFile(filePath);

    // 2. 调用 LLM 进行语义整合
    const integratedContent = await this.integrate(
      filePath,
      currentContent,
      newContent,
      context
    );

    // 3. 原子写入
    await this.atomicWrite(filePath, integratedContent);

    // 4. 记录日志
    this.logger.info('Write completed', {
      file: filePath,
      tokens: this.estimateTokens(integratedContent),
      context
    });

    // 5. 检查是否需要压缩
    await this.checkAndCompress(filePath);
  }

  private async integrate(
    filePath: string,
    current: string,
    newContent: string,
    context: WriteContext
  ): Promise<string> {
    const prompt = this.buildPrompt(filePath, current, newContent, context);
    return await this.llm.generate(prompt);
  }

  private async checkAndCompress(filePath: string): Promise<void> {
    const stats = await this.getFileStats(filePath);
    if (stats.lines > 100 || stats.chars > 5000) {
      await this.compress(filePath);
    }
  }

  private async compress(filePath: string): Promise<void> {
    const content = await this.readFile(filePath);
    const compressed = await this.llm.generate(
      this.buildCompressPrompt(content)
    );
    await this.atomicWrite(filePath, compressed);
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, filePath);
  }
}
```

---

## 总结

**核心特点：**
- ✅ **统一接口**：一个 write 方法处理所有文件
- ✅ **语义写入**：LLM 理解内容关系，智能整合
- ✅ **事实管理**：添加新事实、解决冲突、去重
- ✅ **结构保持**：不破坏文件原有组织
- ✅ **优雅演进**：文件保持活着的状态，不断优化

**不再是：**
- ❌ 分场景的不同规则
- ❌ 简单的追加或覆盖
- ❌ 静态的文件管理

**而是：**
- ✅ 统一的事实管理系统
- ✅ 语义感知的智能写入
- ✅ 活着的、演进的 SOUL 文件

---

*让小师妹的灵魂真正活起来 🌸*
