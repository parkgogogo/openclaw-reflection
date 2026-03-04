# OpenClaw Reflection Plugin - 开发实施计划

## 概述

基于 `message:received` 和 `message:sent` hooks 实现对话消息的定长环形缓冲区。

---

## 核心设计

### 1. 环形缓冲区 (CircularBuffer)

```typescript
class CircularBuffer<T> {
  private buffer: T[];
  private head: number = 0;      // 写入位置
  private tail: number = 0;      // 读取位置
  private count: number = 0;     // 当前元素数
  private capacity: number;      // 容量

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): T | null {
    const evicted = this.isFull() ? this.buffer[this.head] : null;
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.tail = (this.tail + 1) % this.capacity;
    }
    return evicted;
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.tail + i) % this.capacity;
      result.push(this.buffer[idx]);
    }
    return result;
  }

  isFull(): boolean {
    return this.count === this.capacity;
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}
```

### 2. 消息结构

```typescript
interface ReflectionMessage {
  id: string;                    // 唯一 ID (ulid 或 uuid)
  role: 'user' | 'assistant';    // 角色
  content: string;               // 消息内容
  timestamp: number;             // Unix 时间戳 (ms)
  sessionKey: string;            // 会话密钥
  channelId: string;             // 通道 ID
  metadata?: {
    from?: string;               // 发送者标识
    to?: string;                 // 接收者标识
    messageId?: string;          // 原始消息 ID
    success?: boolean;           // 发送成功状态 (仅 assistant)
  };
}
```

### 3. Session 隔离管理

使用 Map 实现 sessionKey → buffer 的映射：

```typescript
class SessionBufferManager {
  private buffers: Map<string, CircularBuffer<ReflectionMessage>>;
  private capacity: number;
  private ttlMs: number;           // Session 过期时间

  constructor(capacity: number, ttlMs: number) {
    this.buffers = new Map();
    this.capacity = capacity;
    this.ttlMs = ttlMs;
  }

  private getOrCreateBuffer(sessionKey: string): CircularBuffer<ReflectionMessage> {
    if (!this.buffers.has(sessionKey)) {
      this.buffers.set(sessionKey, new CircularBuffer(this.capacity));
    }
    return this.buffers.get(sessionKey)!;
  }

  push(sessionKey: string, message: ReflectionMessage): void {
    const buffer = this.getOrCreateBuffer(sessionKey);
    const evicted = buffer.push(message);
    if (evicted) {
      // 可选：记录被驱逐的消息
      console.log(`[Reflection] Message evicted from buffer: ${evicted.id}`);
    }
  }

  getMessages(sessionKey: string): ReflectionMessage[] {
    return this.buffers.get(sessionKey)?.toArray() ?? [];
  }

  clearSession(sessionKey: string): void {
    this.buffers.delete(sessionKey);
  }

  // 清理过期 Session
  cleanup(): void {
    // 实现 LRU 或定时清理逻辑
  }
}
```

---

## Hook 处理逻辑

### message:received (用户消息)

```typescript
api.registerHook('message:received', async (event) => {
  const ctx = event.context;
  
  const message: ReflectionMessage = {
    id: generateId(),
    role: 'user',
    content: ctx.content ?? '',
    timestamp: ctx.timestamp ?? Date.now(),
    sessionKey: event.sessionKey,
    channelId: ctx.channelId ?? 'unknown',
    metadata: {
      from: ctx.from,
      messageId: ctx.messageId,
    },
  };

  bufferManager.push(event.sessionKey, message);
});
```

### message:sent (AI 回复)

```typescript
api.registerHook('message:sent', async (event) => {
  const ctx = event.context;
  
  const message: ReflectionMessage = {
    id: generateId(),
    role: 'assistant',
    content: ctx.text ?? ctx.content ?? '',
    timestamp: Date.now(),
    sessionKey: event.sessionKey,
    channelId: ctx.channel ?? 'unknown',
    metadata: {
      to: ctx.to,
      success: ctx.success,
    },
  };

  bufferManager.push(event.sessionKey, message);
});
```

### session:end (清理)

```typescript
api.registerHook('session:end', async (event) => {
  // Session 结束时清理缓冲区
  bufferManager.clearSession(event.sessionKey);
});
```

---

## 查询接口设计

通过 `registerTool` 暴露查询能力：

```typescript
api.registerTool({
  name: 'reflection_get_messages',
  description: '获取当前会话的反射缓冲区消息',
  parameters: {
    type: 'object',
    properties: {
      sessionKey: {
        type: 'string',
        description: '会话密钥 (可选，默认当前会话)',
      },
      limit: {
        type: 'number',
        description: '返回消息数量限制',
        default: 50,
      },
    },
  },
  async execute(args, context) {
    const sessionKey = args.sessionKey ?? context.sessionKey;
    const messages = bufferManager.getMessages(sessionKey);
    return {
      messages: args.limit ? messages.slice(-args.limit) : messages,
      total: messages.length,
    };
  },
});

api.registerTool({
  name: 'reflection_clear',
  description: '清空当前会话的反射缓冲区',
  parameters: {
    type: 'object',
    properties: {
      sessionKey: {
        type: 'string',
        description: '会话密钥 (可选，默认当前会话)',
      },
    },
  },
  async execute(args, context) {
    const sessionKey = args.sessionKey ?? context.sessionKey;
    bufferManager.clearSession(sessionKey);
    return { success: true, message: 'Buffer cleared' };
  },
});
```

---

## 配置项

```json
{
  "id": "reflection-plugin",
  "configSchema": {
    "type": "object",
    "properties": {
      "bufferSize": {
        "type": "number",
        "default": 100,
        "description": "每个会话的缓冲区大小"
      },
      "sessionTTL": {
        "type": "number",
        "default": 3600000,
        "description": "Session 过期时间 (ms)"
      },
      "persistBuffer": {
        "type": "boolean",
        "default": false,
        "description": "是否持久化缓冲区到磁盘"
      },
      "logLevel": {
        "type": "string",
        "enum": ["debug", "info", "warn", "error"],
        "default": "info"
      }
    }
  }
}
```

---

## 文件结构

```
openclaw-reflection-plugin/
├── openclaw.plugin.json      # 插件清单
├── package.json              # npm 配置
├── src/
│   ├── index.ts              # 入口：register 函数
│   ├── buffer.ts             # CircularBuffer 实现
│   ├── session-manager.ts    # SessionBufferManager
│   ├── message-handler.ts    # Hook 处理逻辑
│   ├── query-tools.ts        # 查询工具注册
│   ├── types.ts              # TypeScript 类型定义
│   └── config.ts             # 配置解析
├── tests/
│   ├── buffer.test.ts        # 缓冲区单元测试
│   └── integration.test.ts   # 集成测试
└── IMPL.md                   # 本文件
```

---

## 开发顺序

### Phase 1: 基础设施 (Day 1)
1. 搭建 TypeScript 项目结构
2. 实现 `CircularBuffer` 类 + 单元测试
3. 定义类型接口 (`types.ts`)

### Phase 2: 核心功能 (Day 2)
1. 实现 `SessionBufferManager`
2. 编写 Hook 处理逻辑 (`message-handler.ts`)
3. 集成到 `index.ts` 的 `register` 函数

### Phase 3: 查询接口 (Day 3)
1. 实现 `reflection_get_messages` 工具
2. 实现 `reflection_clear` 工具
3. 添加配置解析

### Phase 4: 测试与优化 (Day 4)
1. 编写集成测试
2. 内存压力测试
3. 性能优化（如有需要）

---

## 测试策略

### 单元测试

```typescript
// buffer.test.ts
import { describe, it, expect } from 'vitest';
import { CircularBuffer } from '../src/buffer';

describe('CircularBuffer', () => {
  it('should maintain fixed size', () => {
    const buf = new CircularBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // 1 should be evicted
    
    expect(buf.toArray()).toEqual([2, 3, 4]);
  });

  it('should return evicted item', () => {
    const buf = new CircularBuffer<number>(2);
    expect(buf.push(1)).toBeNull();
    expect(buf.push(2)).toBeNull();
    expect(buf.push(3)).toBe(1);
  });
});
```

### 集成测试

模拟 Hook 事件，验证完整流程：

```typescript
// integration.test.ts
const mockEvent = {
  type: 'message',
  action: 'received',
  sessionKey: 'test-session',
  timestamp: new Date(),
  messages: [],
  context: {
    from: 'user123',
    content: 'Hello',
    channelId: 'telegram',
  },
};

// 触发 hook 处理器
await handleMessageReceived(mockEvent);

// 验证缓冲区内容
const messages = bufferManager.getMessages('test-session');
expect(messages).toHaveLength(1);
expect(messages[0].role).toBe('user');
```

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 内存泄漏 | 高 | 设置 Session TTL，定期清理；限制最大 Session 数 |
| Hook 字段变化 | 中 | 添加字段存在性检查；版本兼容性处理 |
| 高频消息性能 | 中 | 使用 O(1) 的环形缓冲区；异步处理 |
| 并发问题 | 低 | 单线程 Gateway 环境，无需锁 |

---

## 参考

- [PLANS.md](./PLANS.md) - 技术调研和计划
- [OpenClaw Hooks 文档](https://docs.openclaw.ai/automation/hooks)
- [OpenClaw Plugin SDK](https://docs.openclaw.ai/tools/plugin)

---

*Implementation Plan by Lia* 🌸
