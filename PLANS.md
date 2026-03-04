# OpenClaw Reflection Plugin 开发计划

## 功能目标

开发一个 OpenClaw Plugin，实现对话消息的**定长环形缓冲区（Circular Buffer）**：
- 维护一个固定大小的消息数组
- 新消息进入时，最旧的消息被移除
- 用于实时对话 reflection/分析

---

## 技术调研结果

### 1. 消息获取途径

#### 方式 A：通过 Hooks 实时捕获（推荐）

Plugin 可以通过 `api.registerHook()` 注册消息事件处理器：

| Hook 事件 | 触发时机 | 可用数据 |
|-----------|----------|----------|
| `message:received` | 收到入站消息时 | `from`, `content`, `timestamp`, `channelId`, `accountId` |
| `message:sent` | 发送出站消息时 | `sessionKey`, 消息内容等 |
| `message:preprocessed` | 消息预处理完成后 | 包含媒体/链接理解的完整上下文 |

**Hook 上下文数据结构：**
```typescript
// message:received
{
  from: string;           // 发送者标识
  content: string;        // 消息内容
  timestamp?: number;     // Unix 时间戳
  channelId: string;      // 通道 ID (telegram/whatsapp/discord等)
  accountId?: string;     // 账户 ID
}

// message:sent (v2026.3.2+)
{
  sessionKey?: string;    // 会话密钥
  // ... 其他消息字段
}
```

#### 方式 B：通过 Session Store 读取历史

OpenClaw 的会话数据存储在：
- **SQLite 数据库**：`~/.openclaw/sessions.db`（主存储）
- **JSONL 转录文件**：`~/.openclaw/agents/<agentId>/sessions/*.jsonl`

**注意：** Plugin 需要通过 `api.runtime` 或其他 Gateway 内部 API 访问这些数据，具体接口需要进一步验证。

#### 方式 C：通过 sessions_history 工具

Agent 可以通过 `sessions_history` 工具获取会话历史，但 Plugin 直接调用内部工具的方式尚不明确。

---

### 2. 推荐架构方案

```
┌─────────────────────────────────────────────────────────┐
│                    Gateway Process                       │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Reflection Plugin (本插件)               │    │
│  │  ┌─────────────┐    ┌──────────────────────┐   │    │
│  │  │  Hook       │───▶│  Circular Buffer     │   │    │
│  │  │  Handlers   │    │  (定长数组)           │   │    │
│  │  └─────────────┘    └──────────────────────┘   │    │
│  │         │                      │                │    │
│  │         │         ┌────────────▼──────┐        │    │
│  │         │         │  Plugin API       │        │    │
│  │         │         │  (供外部查询)      │        │    │
│  │         │         └───────────────────┘        │    │
│  └─────────┼──────────────────────────────────────┘    │
│            │                                            │
│  ┌─────────▼──────────────────────────────────────┐    │
│  │              OpenClaw Core                      │    │
│  │  ┌─────────────┐    ┌──────────────────────┐   │    │
│  │  │  message:   │    │   Session Store      │   │    │
│  │  │  received   │    │   (SQLite/JSONL)     │   │    │
│  │  │  message:   │    └──────────────────────┘   │    │
│  │  │  sent       │                               │    │
│  │  └─────────────┘                               │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 实现步骤

### Phase 1: 基础 Hook 捕获
1. 注册 `message:received` 和 `message:sent` hooks
2. 将消息格式化为统一结构存入缓冲区
3. 实现定长 FIFO 逻辑（进一出一）

### Phase 2: 消息格式化
定义内部消息结构：
```typescript
interface ReflectionMessage {
  id: string;           // 消息唯一 ID
  role: 'user' | 'assistant';  // 角色
  content: string;      // 内容
  timestamp: number;    // 时间戳
  channelId: string;    // 通道
  sessionKey?: string;  // 会话密钥
}
```

### Phase 3: 查询接口
通过 Plugin 暴露查询 API：
- 获取当前缓冲区的所有消息
- 按时间范围过滤
- 导出为 JSON/JSONL

### Phase 4: 持久化（可选）
- 缓冲区内容定期写入本地文件
- Gateway 重启后恢复（可选）

---

## 待确认问题

1. **Hook 上下文完整性**：`message:received` 是否能区分 user/assistant 消息？
2. **Session 关联**：如何确保只捕获特定 session 的对话？
3. **API 暴露方式**：Plugin 如何向外部（如 Skill）暴露查询接口？
4. **性能考虑**：高频率消息场景下的性能影响

---

## 文件规划

```
openclaw-reflection-plugin/
├── openclaw.plugin.json     # 插件清单
├── index.ts                 # 入口文件
├── buffer.ts                # 环形缓冲区实现
├── message-handler.ts       # 消息处理逻辑
├── types.ts                 # 类型定义
└── PLANS.md                 # 本文件
```

---

## 参考文档

- [OpenClaw Plugin 官方文档](https://docs.openclaw.ai/tools/plugin)
- [OpenClaw Hooks 文档](https://docs.openclaw.ai/automation/hooks)
- [Session Tools 文档](https://docs.openclaw.ai/concepts/session-tool)

---

*Plan by Lia* 🌸
