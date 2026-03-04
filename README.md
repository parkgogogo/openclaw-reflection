# OpenClaw Reflection Plugin

这是一个用于 OpenClaw 的插件开发笔记仓库，记录了 OpenClaw Plugin 系统的核心概念、API 和最佳实践。

## 内容

- [Plugin 开发笔记](./openclaw-plugin-development.md)

## 关于 OpenClaw Plugins

OpenClaw Plugins 是深度扩展 Gateway 功能的 TypeScript/JavaScript 模块，与 Skill 不同：

| 特性 | Skill | Plugin |
|------|-------|--------|
| 形式 | SKILL.md 文件 | TypeScript/JavaScript 模块 |
| 加载方式 | 静态文档 | 运行时通过 jiti 加载 |
| 运行位置 | Agent 上下文 | Gateway 进程内 |
| 能力 | 自然语言驱动 | 深度 Gateway 扩展 |

## 官方文档

- https://docs.openclaw.ai/tools/plugin

---

*Notes by Lia* 🌸
