# OpenClaw Reflection Plugin 开发计划

## 功能目标

开发一个 OpenClaw Plugin，实现对话消息的**定长环形缓冲区（Circular Buffer）**：
- 维护一个固定大小的消息数组
- 新消息进入时，最旧的消息被移除
- 用于实时对话 reflection/分析

---

## 技术调研结果

### ✅ 技术方案确认：通过 Plugin Hooks 实现

**结论：完全可行。** OpenClaw Plugin 可以通过 `api.registerHook()` 注册消息事件处理器，实时捕获双向对话。

#### Hook 事件类型与消息方向

| Hook 事件 | 消息方向 | 触发时机 | 说明 |
|-----------|----------|----------|------|
| `message:received` | ⬅️ **入站** | 收到用户消息时 | 用户发送给 Agent |
| `message:sent` | ➡️ **出站** | Agent 回复发送成功时 | Agent 发送给用户 |
| `message:preprocessed` | ⬅️ **入站（增强）** | 媒体/链接理解完成后 | 包含转录、图片描述等 |

#### 完整 Hook Event 数据结构

根据 [官方文档](https://docs.openclaw.ai/automation/hooks)，Hook 事件对象结构如下：

```typescript
interface HookEvent {
  type: 'command' | 'session' | 'agent' | 'gateway' | 'message';
  action: string;           // e.g., 'new', 'reset', 'received', 'sent'
  sessionKey: string;       // 会话标识符
  timestamp: Date;          // 事件发生时间
  messages: string[];       // 可变的回复消息数组（用于 hook 发送回复）
  context: {
    // === Command 事件字段 ===
    sessionEntry?: SessionEntry;
    sessionId?: string;
    sessionFile?: string;
    commandSource?: string;   // e.g., 'whatsapp', 'telegram'
    senderId?: string;
    workspaceDir?: string;
    bootstrapFiles?: WorkspaceBootstrapFile[];
    cfg?: OpenClawConfig;
    
    // === Message:received 字段 ===
    from?: string;            // 发送者标识（手机号、用户 ID 等）
    content?: string;         // 消息内容
    timestamp?: number;       // Unix 时间戳（毫秒）
    channelId?: string;       // 通道 ID
    accountId?: string;       // 账户 ID
    
    // === Message:sent 字段 ===
    to?: string;              // 接收者标识
    success?: boolean;        // 发送是否成功
    channel?: string;         // 目标通道
    text?: string;            // 消息文本（GitHub issue 中提及）
  }
}
```

#### 消息方向判定逻辑

```typescript
// 用户消息（入站）
api.registerHook('message:received', (event) => {
  const msg = {
    role: 'user',
    content: event.context.content,
    from: event.context.from,        // 用户 ID
    channelId: event.context.channelId,
    timestamp: event.context.timestamp,
    sessionKey: event.sessionKey,
  };
  buffer.push(msg);
});

// AI 回复（出站）
api.registerHook('message:sent', (event) => {
  const msg = {
    role: 'assistant',
    content: event.context.text || event.context.content,
    to: event.context.to,            // 接收者 ID
    channel: event.context.channel,
    success: event.context.success,  // 发送成功状态
    sessionKey: event.sessionKey,
  };
  buffer.push(msg);
});
```

#### Session 关联机制

- **sessionKey**: 所有 message hooks 都包含 `sessionKey`（v2026.3.2+ 确保一致）
- **channelId**: 标识消息来源通道（telegram/whatsapp/discord 等）
- **from/to**: 标识具体的发送者/接收者

通过 `sessionKey` 可以将同一对话的消息关联起来，实现**单一会话的独立缓冲区**。

---

### 备选方案（已排除）

#### 方式 B：通过 Session Store 读取历史

OpenClaw 的会话数据存储在：
- **SQLite 数据库**：`~/.openclaw/sessions.db`
- **JSONL 转录文件**：`~/.openclaw/agents/<agentId>/sessions/*.jsonl`

**排除原因：**
- Plugin 访问这些存储需要额外的内部 API，不如 Hooks 实时
- 需要轮询或定时读取，效率低下
- 实现复杂度更高

#### 方式 C：通过 sessions_history 工具

**排除原因：**
- 这是 Agent 层面的工具，Plugin 直接调用方式不明确
- 需要额外处理权限和上下文传递

---

## 架构方案

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

## 待确认/待验证问题

| # | 问题 | 状态 | 说明 |
|---|------|------|------|
| 1 | `message:received` 是否能区分 user/assistant？ | ✅ **已确认** | 通过不同 hook 区分：`received` = user, `sent` = assistant |
| 2 | Session 关联机制 | ✅ **已确认** | `sessionKey` 字段已包含（v2026.3.2+）|
| 3 | 高频率消息性能 | 🔄 **待验证** | 需要实际测试大量消息场景 |
| 4 | Plugin 暴露查询接口 | 🔄 **待研究** | 如何通过 `api.registerTool()` 或其他方式暴露？ |
| 5 | `message:sent` 的 content 字段名 | 🔄 **待验证** | 文档中提及 `text`，需确认实际字段名 |
| 6 | 缓冲区内存管理 | 🔄 **待设计** | 是否需要设置上限防止内存泄漏？ |

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
