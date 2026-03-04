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

  constructor(capacity: number) {
    this.buffers = new Map();
    this.capacity = capacity;
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

## 日志设计

### 日志职责划分

- Gateway Logger (`api.logger`): 仅在 `src/index.ts` 记录插件生命周期（启动、配置加载、初始化完成、hook 注册完成、重复注册保护）。
- FileLogger (`src/logger.ts`): 记录所有详细事件（`message:received` / `message:sent` / `session:end` 的处理细节、SessionBufferManager 的缓冲区行为）。
- 业务代码统一依赖 `FileLogger` 对外提供的 `Logger` 接口，避免入口层引入额外日志包装。

### 日志级别

| 级别 | 使用场景 |
|------|----------|
| `debug` | 详细的事件追踪、缓冲区状态、消息内容 |
| `info` | 关键事件：Session 创建/清理、消息进入/驱逐 |
| `warn` | 异常情况：字段缺失、解析失败、缓冲区满 |
| `error` | 严重错误：Hook 处理异常、内存不足 |

### 日志内容规范

```typescript
interface LogEntry {
  timestamp: string;      // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;      // 'buffer' | 'session' | 'hook'
  sessionKey?: string;    // 关联的 session（如有）
  event: string;          // 事件类型
  details?: Record<string, unknown>;
}
```

### 日志输出示例

```
[2024-03-04T10:30:00.123Z] [info] [session] session_created {sessionKey: "agent:main:telegram:123456"}
[2024-03-04T10:30:01.456Z] [debug] [hook] message_received {sessionKey: "agent:main:telegram:123456", role: "user", contentLength: 12}
[2024-03-04T10:30:02.789Z] [debug] [buffer] message_pushed {sessionKey: "agent:main:telegram:123456", bufferSize: 1/100}
[2024-03-04T10:30:05.012Z] [debug] [hook] message_sent {sessionKey: "agent:main:telegram:123456", role: "assistant", success: true}
[2024-03-04T10:35:00.000Z] [info] [session] session_end {sessionKey: "agent:main:telegram:123456", reason: "user_reset"}
```

### FileLogger 实现

日志写入插件根目录下的 `logs/` 文件夹：

```typescript
// logger.ts
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

class FileLogger {
  private level: number;
  private logDir: string;
  private logFile: string;
  private levels = { debug: 0, info: 1, warn: 2, error: 3 };

  constructor(pluginRootDir: string, level: string = 'info') {
    this.level = this.levels[level as keyof typeof this.levels] ?? 1;
    this.logDir = join(pluginRootDir, 'logs');
    this.logFile = join(this.logDir, `reflection-${new Date().toISOString().split('T')[0]}.log`);
    
    // 确保日志目录存在
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private log(
    level: keyof typeof this.levels,
    component: string,
    event: string,
    details?: Record<string, unknown>,
    sessionKey?: string
  ) {
    if (this.levels[level] < this.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      event,
      details,
      ...(sessionKey && { sessionKey }),
    };

    // 写入文件（同步追加）
    const line = JSON.stringify(entry) + '\n';
    try {
      appendFileSync(this.logFile, line);
    } catch (err) {
      // 兜底：如果文件写入失败，输出到 stderr
      console.error('[ReflectionPlugin] Failed to write log:', err);
    }
  }

  debug(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string) {
    this.log('debug', component, event, details, sessionKey);
  }

  info(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string) {
    this.log('info', component, event, details, sessionKey);
  }

  warn(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string) {
    this.log('warn', component, event, details, sessionKey);
  }

  error(component: string, event: string, details?: Record<string, unknown>, sessionKey?: string) {
    this.log('error', component, event, details, sessionKey);
  }

  // 获取当前日志文件路径
  getLogFile(): string {
    return this.logFile;
  }
}
```

### 日志文件结构

```
openclaw-reflection-plugin/
├── logs/
│   ├── reflection-2024-03-04.log    # 按日期分片
│   ├── reflection-2024-03-05.log
│   └── ...
├── openclaw.plugin.json
└── ...
```

### 日志轮转策略

```typescript
// 简单的日志轮转：按天自动切换文件
private rotateIfNeeded(): void {
  const today = new Date().toISOString().split('T')[0];
  const expectedFile = join(this.logDir, `reflection-${today}.log`);
  
  if (this.logFile !== expectedFile) {
    this.logFile = expectedFile;
  }
}
```

### 入口初始化示例

在 `index.ts` 中初始化并分配日志职责：

```typescript
export default function activate(api: PluginAPI): void {
  const gatewayLogger = api.logger;
  gatewayLogger.info('[Reflection] Plugin starting...');

  const config = parseConfig(api);
  gatewayLogger.info('[Reflection] Configuration loaded', {
    bufferSize: config.bufferSize,
    logLevel: config.logLevel,
  });

  const pluginRootDir = resolvePluginRootDir();
  const fileLogger = new FileLogger(pluginRootDir, config.logLevel);
  gatewayLogger.info('[Reflection] File logger initialized');

  const bufferManager = new SessionBufferManager(config.bufferSize, fileLogger);
  gatewayLogger.info('[Reflection] SessionBufferManager initialized');

  api.registerHook('message:received', (event) => {
    handleMessageReceived(event, bufferManager, fileLogger);
  });
}
```

### 关键日志点

| 位置 | 事件 | 级别 | 内容 |
|------|------|------|------|
| index.ts (Gateway Logger) | 插件生命周期日志 | info/warn | 启动、配置加载、初始化完成、重复注册 |
| SessionBufferManager | 新 Session 创建 | info | sessionKey, 当前 Session 数 |
| SessionBufferManager | Session 清理 | info | sessionKey, 原因 (ttl/max) |
| CircularBuffer | 消息被驱逐 | debug | messageId, 被驱逐消息 ID |
| message:received | 收到消息 | debug | role, contentLength |
| message:sent | 发送消息 | debug | role, success |
| session:end | Session 结束 | info | sessionKey |

---

## 配置项

```json
{
  "id": "reflection-plugin",
  "entry": "src/index.ts",
  "configSchema": {
    "type": "object",
    "properties": {
      "bufferSize": {
        "type": "integer",
        "minimum": 1,
        "default": 100,
        "description": "每个会话的缓冲区大小"
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
├── logs/                       # 日志目录（自动创建，已添加到 .gitignore）
│   └── reflection-YYYY-MM-DD.log
├── openclaw.plugin.json        # 插件清单
├── package.json                # npm 配置
├── .gitignore                  # 忽略 logs/
├── src/
│   ├── index.ts                # 入口：register 函数
│   ├── buffer.ts               # CircularBuffer 实现
│   ├── session-manager.ts      # SessionBufferManager
│   ├── message-handler.ts      # Hook 处理逻辑
│   ├── logger.ts               # 日志模块
│   ├── types.ts                # TypeScript 类型定义
│   └── config.ts               # 配置解析
├── tests/
│   ├── buffer.test.ts          # 缓冲区单元测试
│   └── integration.test.ts     # 集成测试
└── IMPL.md                     # 本文件
```

**`.gitignore`**
```
logs/
*.log
```

---

## 开发顺序

### Phase 1: 基础设施 (Day 1)
1. 搭建 TypeScript 项目结构
2. 实现 `CircularBuffer` 类 + 单元测试
3. 定义类型接口 (`types.ts`)
4. 实现 `Logger` 模块

### Phase 2: 核心功能 (Day 2)
1. 实现 `SessionBufferManager`
2. 编写 Hook 处理逻辑 (`message-handler.ts`)
3. 集成到 `index.ts` 的 `register` 函数
4. 添加日志埋点

### Phase 3: 配置与优化 (Day 3)
1. 添加配置解析 (`config.ts`)
2. 内存压力测试

### Phase 4: 测试与文档 (Day 4)
1. 编写集成测试
2. 完善日志输出
3. 更新文档

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
| 内存泄漏 | 高 | 限制最大 Session 数；使用 session:end 钩子清理 |
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
