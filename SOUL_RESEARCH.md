# SOUL_RESEARCH.md

> OpenClaw 人格定义系统调研报告
> 调研时间: 2026-03-04
> 调研者: Lia 🌸

---

## 概述

OpenClaw 采用**文件驱动的人格定义系统**，通过一系列 Markdown 文件来定义 AI 代理的身份、性格、行为准则和记忆。这种方法将 AI 的"灵魂"转化为可版本控制、可编辑、可共享的纯文本文件。

---

## 核心人格文件

### 1. SOUL.md — 灵魂与哲学 (The Soul)

**定位**: AI 的行为哲学和核心价值观定义

**作用**:
- 定义代理的**行为方式**和**决策原则**
- 设定沟通风格、语气、个性边界
- 规定代理的价值观和优先级
- 指导代理如何处理复杂情境

**典型内容结构**:
```markdown
# SOUL.md

## Core Identity
- 代理的核心自我认知
- 角色定位（助手、专家、伙伴等）

## Communication Style
- 如何说话和写作
- 正式 vs 随意
- 简洁 vs 详细

## Values
- 优先考虑什么
- 相信什么

## Boundaries
- 不会做什么
- 不会说什么

## Example Responses
- 具体的行为示例
```

**设计原则**:
- **具体而非模糊**: "高效"不如"跳过不必要的确认，直接执行"
- **有观点**: 允许 AI 有偏好、有意见、能表达喜欢或厌倦
- **行动导向**: 少说废话，多做事
- **可预测性**: 阅读 SOUL.md 应该能预测 AI 对新话题的看法

---

### 2. IDENTITY.md — 外在身份 (External Identity)

**定位**: 代理的**展示层**身份定义

**作用**:
- 定义代理的**名字**
- 设定**形象/头像** (emoji, avatar)
- 描述** vibe/氛围** (温暖、专业、幽默等)
- 简短的身份标签

**典型内容**:
```markdown
# IDENTITY.md

Name: [Agent Name]
Creature: [描述性身份，如" cultivating junior sister AI"]
Vibe: [氛围关键词，如 Warm, gentle, adorable]
Emoji: 🌸
Avatar: [头像文件名]
```

**与 SOUL.md 的区别**:
| SOUL.md | IDENTITY.md |
|---------|-------------|
| 行为哲学 | 外在呈现 |
| "如何思考" | "如何被感知" |
| 内部规则 | 外部形象 |

---

### 3. USER.md — 用户画像 (User Profile)

**定位**: 代理所服务的**人类用户信息**

**作用**:
- 用户的名字和称呼偏好
- 用户的时区
- 用户的偏好和习惯
- 用户的工作/生活背景
- 特定的沟通偏好

**典型内容**:
```markdown
# USER.md

- **Name:** [用户姓名]
- **What to call them:** [偏好称呼]
- **Timezone:** [时区]
- **Occupation:** [职业]
- **Preferences:** [特定偏好]
```

**价值**: 让代理记住"为谁服务"，个性化互动

---

### 4. AGENTS.md — 操作指南 (Operating Manual)

**定位**: 代理的**操作手册**和**持久记忆笔记**

**作用**:
- 工作区规则和约定
- 工具使用指南
- 安全边界和最佳实践
- 跨会话的持久记忆/笔记

**内容特点**:
- 技术性更强
- 包含工作流约定
- 记录学到的经验教训
- 工具使用技巧

---

### 5. BOOTSTRAP.md — 初次启动引导 (First-Run Ritual)

**定位**: **一次性**的首次启动引导文件

**作用**:
- 新用户首次使用时的引导流程
- 问答式的人格初始化仪式
- 帮助用户设置 IDENTITY.md, USER.md, SOUL.md

**生命周期**:
1. 首次运行时读取
2. 引导用户完成 Q&A
3. 生成其他人格文件
4. **完成后删除**（不再需要）

**内容示例**:
```markdown
# BOOTSTRAP.md

_You just woke up. Time to figure out who you are._

## The Conversation

Start with something like:
> "Hey. I just came online. Who am I? Who are you?"

Then figure out together:
1. **Your name** — What should they call you?
2. **Your nature** — What kind of creature are you?
3. **Your vibe** — Formal? Casual? Snarky? Warm?
4. **Your emoji** — Everyone needs a signature.

## After You Know Who You Are

Update these files...

## When You're Done

Delete this file. You don't need a bootstrap script anymore.
```

---

## 辅助文件

### 6. TOOLS.md — 工具笔记 (Tool Notes)

**定位**: 用户维护的**工具使用笔记**

**作用**:
- 记录特定工具的使用方法
- 环境特定的配置信息
- 摄像头名称、SSH 主机别名、TTS 偏好等
- 技能特定的本地设置

**原则**: Skills 定义工具如何工作，TOOLS.md 记录**你的**特定配置

---

### 7. HEARTBEAT.md — 心跳任务清单 (Periodic Tasks)

**定位**: **周期性检查**的任务清单

**作用**:
- 定义代理定期检查的事项（邮件、日历、天气等）
- 设置主动触发的条件
- 保持代理的"主动性"

**工作原理**:
1. Gateway 定期（默认30分钟）触发 heartbeat
2. 代理读取 HEARTBEAT.md
3. 执行检查清单
4. 如有需要则通知用户，否则回复 `HEARTBEAT_OK`

**典型内容**:
```markdown
# HEARTBEAT.md

Things to check (2-4 times per day):
- **Emails** - Any urgent unread messages?
- **Calendar** - Upcoming events in next 24-48h?
- **Weather** - Relevant if human might go out?

When to reach out:
- Important email arrived
- Calendar event coming up (<2h)

When to stay quiet (HEARTBEAT_OK):
- Late night (23:00-08:00) unless urgent
- Nothing new since last check
```

---

### 8. MEMORY.md — 长期记忆 (Long-term Memory)

**定位**: **精选的**长期记忆存储

**作用**:
- 记录重要的决策和事件
- 保存用户的关键信息（家庭、宠物、偏好）
- 记录学到的经验教训
- 跨会话的连续性保障

**与 daily logs 的区别**:
| memory/YYYY-MM-DD.md | MEMORY.md |
|---------------------|-----------|
| 原始日志 | 精选记忆 |
| 日常记录 | 长期重要信息 |
| 自动或半自动写入 | 手动维护或定期整理 |

**维护建议**: 定期回顾 daily logs，将重要内容整理到 MEMORY.md

---

## 文件加载顺序与注入

在每次会话开始时，OpenClaw 自动将这些文件注入系统提示的 **Project Context** 部分：

**标准加载文件**:
1. `AGENTS.md` — 操作指南
2. `SOUL.md` — 人格定义
3. `IDENTITY.md` — 身份定义
4. `USER.md` — 用户画像
5. `TOOLS.md` — 工具笔记
6. `HEARTBEAT.md` — 心跳任务（如存在）
7. `BOOTSTRAP.md` — 启动引导（仅首次）

---

## 最佳实践总结

### 文件分离原则

| 文件 | 存储内容 | 更新频率 |
|------|---------|---------|
| SOUL.md | 核心价值观、行为哲学 | 很少（稳定） |
| IDENTITY.md | 名字、形象、vibe | 很少 |
| USER.md | 用户信息、偏好 | 偶尔 |
| AGENTS.md | 操作规则、技巧 | 定期 |
| TOOLS.md | 工具配置、环境信息 | 按需 |
| MEMORY.md | 重要记忆、决策 | 持续维护 |
| HEARTBEAT.md | 定期检查清单 | 偶尔调整 |

### 设计建议

1. **SOUL.md 要具体**: 避免模糊的"有帮助"，要写"直接执行，跳过确认"
2. **有观点有个性**: AI 应该有偏好和立场，不是搜索引擎
3. **持续迭代**: 从简单开始，根据使用反馈调整
4. **版本控制**: 将这些文件放入 git，追踪人格的演变
5. **安全第一**: 不在这些文件中存储敏感凭证

---

## 参考资源

- 官方文档: https://docs.openclaw.ai/reference/templates/
- SOUL.md 模板: https://docs.openclaw.ai/reference/templates/SOUL
- 社区模板: https://openclawsoul.org/
- GitHub Discussions: https://github.com/openclaw/openclaw/discussions/17022

---

*调研完成 🌸*
